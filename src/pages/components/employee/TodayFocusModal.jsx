// src/pages/components/employee/TodayFocusModal.jsx
// Drill-down for the Today's-focus strip: who did I save / reach / try today.
// Opened by clicking the strip. Pulls the names behind the worked/reached/saved
// counts so the rep (or principal) can see the actual customers.

import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { titleCaseName } from '../../../lib/names';
import { productLabel } from '../../../lib/productLabels';

function fmt$(n) {
  if (!n) return '$0';
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${Math.round(n)}`;
}

function Section({ title, color, items, renderRight, onOpen }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color, textTransform: 'uppercase',
        letterSpacing: '0.06em', marginBottom: 8 }}>
        {title} ({items.length})
      </div>
      {items.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--qs-muted)' }}>None yet today.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {items.map((it, i) => {
            // Rows with a case id open the corresponding case detail modal.
            const clickable = !!(onOpen && it.caseId);
            const Tag = clickable ? 'button' : 'div';
            return (
              <Tag key={i}
                {...(clickable ? { type: 'button', onClick: () => onOpen(it), title: 'Open case detail' } : {})}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  gap: 10, background: 'var(--qs-card)', border: '1px solid var(--qs-border)',
                  borderRadius: 8, padding: '8px 12px', fontSize: 13, width: '100%',
                  textAlign: 'left', fontFamily: 'inherit',
                  cursor: clickable ? 'pointer' : 'default' }}>
                <span style={{ color: 'var(--qs-text)', fontWeight: 600 }}>
                  {titleCaseName(it.name) || 'Unknown'}
                  {it.product && (
                    <span style={{ color: 'var(--qs-muted)', fontWeight: 400, marginLeft: 6, fontSize: 11 }}>
                      {productLabel(it.product)}
                    </span>
                  )}
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  {renderRight && renderRight(it)}
                  {clickable && <span style={{ color: 'var(--qs-dim)', fontSize: 12 }}>›</span>}
                </span>
              </Tag>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function TodayFocusModal({ employeeId, todayStr, onClose, onOpenCase = null }) {
  const { data, isLoading } = useQuery({
    queryKey: ['today_focus_detail', employeeId, todayStr],
    enabled: !!employeeId,
    staleTime: 30_000,
    queryFn: async () => {
      const dayStart = `${todayStr}T00:00:00.000Z`;

      // Attempt fetch with a fallback: include `direction` if the column exists,
      // otherwise re-run without it (everything reads as outbound).
      const loadAttempts = async (withDir) => {
        const sel = (caseCol, embed) =>
          `result, ${caseCol}${withDir ? ', direction' : ''}, ${embed}(customer_name, product)`;
        const [ra, ca] = await Promise.all([
          supabase.from('renewal_attempts').select(sel('renewal_case_id', 'renewal_cases'))
            .eq('employee_id', employeeId).eq('auto_logged', false).gte('attempted_at', dayStart),
          supabase.from('pending_cancel_attempts').select(sel('pending_case_id', 'pending_cases'))
            .eq('employee_id', employeeId).eq('auto_logged', false).gte('attempted_at', dayStart),
        ]);
        if (ra.error) throw ra.error;
        if (ca.error) throw ca.error;
        return [ra.data || [], ca.data || []];
      };
      let raData, caData;
      try { [raData, caData] = await loadAttempts(true); }
      catch { [raData, caData] = await loadAttempts(false); }

      const [savedR, savedC] = await Promise.all([
        supabase.from('renewal_cases')
          .select('id, customer_name, product, premium, saved_premium')
          .eq('closed_by_id', employeeId).eq('resolution_date', todayStr).eq('status', 'confirmed'),
        supabase.from('pending_cases')
          .select('id, customer_name, product, premium_at_risk, saved_premium')
          .eq('closed_by_id', employeeId).eq('resolution_date', todayStr).in('status', ['saved', 'rewritten']),
      ]);

      // Distinct customers worked today, flagged reached / inbound.
      const byCase = new Map();
      const add = (rows, idKey, caseKey, kind) => {
        for (const r of rows || []) {
          const c = r[caseKey];
          if (!c) continue;
          const k = idKey + r[idKey];
          const prev = byCase.get(k) || { name: c.customer_name, product: c.product,
            caseId: r[idKey], kind, reached: false, inbound: false };
          if (r.result === 'reached') prev.reached = true;
          if (r.direction === 'inbound') prev.inbound = true;
          byCase.set(k, prev);
        }
      };
      add(raData, 'renewal_case_id', 'renewal_cases', 'renewal');
      add(caData, 'pending_case_id', 'pending_cases', 'cancel');

      const all = [...byCase.values()];
      const inbound  = all.filter((c) => c.inbound);
      const reached  = all.filter((c) => c.reached && !c.inbound);
      const noAnswer = all.filter((c) => !c.reached && !c.inbound);

      const saved = [
        ...(savedR.data || []).map((r) => ({ name: r.customer_name, product: r.product, caseId: r.id, kind: 'renewal', premium: Number(r.saved_premium ?? r.premium ?? 0) })),
        ...(savedC.data || []).map((r) => ({ name: r.customer_name, product: r.product, caseId: r.id, kind: 'cancel', premium: Number(r.saved_premium ?? r.premium_at_risk ?? 0) })),
      ];

      return { inbound, reached, noAnswer, saved };
    },
  });

  return createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'flex-start',
      justifyContent: 'center', padding: '8vh 16px' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 520,
        background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)', borderRadius: 14,
        padding: '20px 22px', maxHeight: '78vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--qs-bright)' }}>Today's activity</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--qs-dim)',
            fontSize: 18, lineHeight: 1, cursor: 'pointer' }}>✕</button>
        </div>

        {isLoading || !data ? (
          <div style={{ color: 'var(--qs-subtle)', fontSize: 13, padding: '24px 0', textAlign: 'center' }}>Loading…</div>
        ) : (
          <>
            <Section title="🎉 Saved" color="#10B981" items={data.saved} onOpen={onOpenCase}
              renderRight={(it) => (
                <span style={{ color: '#10B981', fontWeight: 700, fontSize: 12 }}>{fmt$(it.premium)} kept</span>
              )} />
            <Section title="✅ Reached (proactive)" color="#10B981" items={data.reached} onOpen={onOpenCase} />
            <Section title="📲 Inbound — they called us" color="#60A5FA" items={data.inbound} onOpen={onOpenCase} />
            <Section title="📞 Attempted — no answer" color="var(--qs-subtle)" items={data.noAnswer} onOpen={onOpenCase} />
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
