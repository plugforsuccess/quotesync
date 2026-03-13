import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";

export function useRevenueEntries({ agencyId, rangeStart, rangeEnd }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const fetch = useCallback(async () => {
    if (!agencyId) return;
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("revenue_entries")
      .select("*")
      .eq("agency_id", agencyId)
      .gte("issued_date", rangeStart.toISOString().slice(0, 10))
      .lte("issued_date", rangeEnd.toISOString().slice(0, 10))
      .order("issued_date", { ascending: false });

    if (error) setError(error.message);
    else setEntries(
      (data ?? []).map(r => ({
        id:           r.id,
        date:         r.issued_date,   // internal alias — all downstream logic uses e.date
        issuedDate:   r.issued_date,
        product:      r.product,
        tier:         r.tier ?? "monoline",
        premium:      parseFloat(r.premium),
        policyCount:  r.policy_count,
        itemCount:    r.item_count ?? 1,
        policyNo:     r.policy_no ?? null,
        bindId:       r.bind_id ?? null,
        producerName: r.producer_name ?? null,
        producerId:   r.producer_id ?? null,
        customerName: r.customer_name ?? null,
        source:       r.source,
        note:         r.note ?? "",
      }))
    );
    setLoading(false);
  }, [agencyId, rangeStart, rangeEnd]);

  useEffect(() => { fetch(); }, [fetch]);

  const addEntry = async (entry) => {
    const { data, error } = await supabase
      .from("revenue_entries")
      .insert({
        agency_id:    agencyId,
        date:         entry.date,         // keep writing date col during transition
        issued_date:  entry.date,         // primary field
        product:      entry.product,
        tier:         entry.tier ?? "monoline",
        premium:      entry.premium,
        policy_count: entry.policyCount,
        item_count:   entry.itemCount ?? 1,
        policy_no:    entry.policyNo || null,
        source:       entry.source,
        note:         entry.note || null,
        created_by:   (await supabase.auth.getUser()).data.user?.id ?? null,
      })
      .select()
      .single();

    if (error) return { error: error.message };
    setEntries(prev => [{
      id:           data.id,
      date:         data.issued_date,
      issuedDate:   data.issued_date,
      product:      data.product,
      tier:         data.tier ?? "monoline",
      premium:      parseFloat(data.premium),
      policyCount:  data.policy_count,
      itemCount:    data.item_count ?? 1,
      policyNo:     data.policy_no ?? null,
      bindId:       data.bind_id ?? null,
      producerName: data.producer_name ?? null,
      customerName: data.customer_name ?? null,
      source:       data.source,
      note:         data.note ?? "",
    }, ...prev]);
    return { error: null };
  };

  const addEntries = async (batch, employeeBindMap = new Map(), employeeIdMap = new Map()) => {
    const user = (await supabase.auth.getUser()).data.user;
    const rows = batch.map(entry => {
      const producerName = entry.bindId
        ? (employeeBindMap.get(entry.bindId) || "CCC")
        : null;
      return {
        agency_id:     agencyId,
        date:          entry.date,         // keep writing date col during transition
        issued_date:   entry.date,         // primary field
        product:       entry.product,
        tier:          entry.tier ?? "monoline",
        premium:       entry.premium,
        policy_count:  entry.policyCount,
        item_count:    entry.itemCount ?? 1,
        policy_no:     entry.policyNo || null,
        bind_id:       entry.bindId || null,
        producer_name: producerName,
        producer_id:   entry.bindId ? (employeeIdMap.get(entry.bindId) ?? null) : null,
        // ⚠️  PII — customer_name must never appear in:
        //   - CSV/Excel exports
        //   - Producer-facing views (only admin/agent roles)
        //   - Log statements or error messages
        //   - Any API response that isn't agency-scoped
        customer_name: entry.customerName || null,
        source:        "upload",           // always "upload" — overwrites "manual" on conflict
        note:          entry.note || null,
        created_by:    user?.id ?? null,
      };
    });

    // Split: rows WITH policy_no can be upserted (dedup on conflict),
    // rows WITHOUT must be plain-inserted (NULL can't match a unique constraint)
    const withPolicyNo    = rows.filter(r => r.policy_no);
    const withoutPolicyNo = rows.filter(r => !r.policy_no);

    let totalCount = 0;

    if (withPolicyNo.length > 0) {
      const { data, error } = await supabase
        .from("revenue_entries")
        .upsert(withPolicyNo, { onConflict: "agency_id,policy_no", ignoreDuplicates: false })
        .select();
      if (error) return { count: 0, error: error.message };
      totalCount += data.length;
    }

    if (withoutPolicyNo.length > 0) {
      const { data, error } = await supabase
        .from("revenue_entries")
        .insert(withoutPolicyNo)
        .select();
      if (error) return { count: totalCount, error: error.message };
      totalCount += data.length;
    }

    await fetch();
    return { count: totalCount, error: null };
  };

  const deleteEntry = async (id) => {
    const { error } = await supabase
      .from("revenue_entries")
      .delete()
      .eq("id", id);

    if (!error) setEntries(prev => prev.filter(e => e.id !== id));
  };

  return { entries, loading, error, addEntry, addEntries, deleteEntry, refetch: fetch };
}
