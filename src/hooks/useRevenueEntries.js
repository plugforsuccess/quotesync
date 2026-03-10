import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";

const AGENCY_ID = "00000000-0000-0000-0000-000000000001";

export function useRevenueEntries({ rangeStart, rangeEnd }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("revenue_entries")
      .select("*")
      .eq("agency_id", AGENCY_ID)
      .gte("date", rangeStart.toISOString().slice(0, 10))
      .lte("date", rangeEnd.toISOString().slice(0, 10))
      .order("date", { ascending: false });

    if (error) setError(error.message);
    else setEntries(
      (data ?? []).map(r => ({
        id:          r.id,
        date:        r.date,
        product:     r.product,
        premium:     parseFloat(r.premium),
        policyCount: r.policy_count,
        source:      r.source,
        note:        r.note ?? "",
      }))
    );
    setLoading(false);
  }, [rangeStart, rangeEnd]);

  useEffect(() => { fetch(); }, [fetch]);

  const addEntry = async (entry) => {
    const { data, error } = await supabase
      .from("revenue_entries")
      .insert({
        agency_id:    AGENCY_ID,
        date:         entry.date,
        product:      entry.product,
        premium:      entry.premium,
        policy_count: entry.policyCount,
        source:       entry.source,
        note:         entry.note || null,
        created_by:   (await supabase.auth.getUser()).data.user?.id ?? null,
      })
      .select()
      .single();

    if (error) return { error: error.message };
    setEntries(prev => [{
      id:          data.id,
      date:        data.date,
      product:     data.product,
      premium:     parseFloat(data.premium),
      policyCount: data.policy_count,
      source:      data.source,
      note:        data.note ?? "",
    }, ...prev]);
    return { error: null };
  };

  const addEntries = async (batch) => {
    const user = (await supabase.auth.getUser()).data.user;
    const rows = batch.map(entry => ({
      agency_id:    AGENCY_ID,
      date:         entry.date,
      product:      entry.product,
      premium:      entry.premium,
      policy_count: entry.policyCount,
      source:       "upload",
      note:         entry.note || null,
      created_by:   user?.id ?? null,
    }));

    const { data, error } = await supabase
      .from("revenue_entries")
      .insert(rows)
      .select();

    if (error) return { count: 0, error: error.message };
    await fetch(); // re-fetch to sync state
    return { count: data.length, error: null };
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
