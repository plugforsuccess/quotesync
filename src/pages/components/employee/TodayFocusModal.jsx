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

function Section({ title, color, items, renderRight }) {
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
          {items.map((it, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 10, background: 'var(--qs-card)', border: '1px solid var(--qs-border)',
              borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
              <span style={{ color: 'var(--qs-text)', fontWeight: 600 }}>
                {titleCaseName(it.name) || 'Unknown'}
                {it.product && (
                  <span style={{ color: 'var(--qs-muted)', fontWeight: 400, marginLeft: 6, fontSize: 11 }}>
                    {productLabel(it.product)}
                  </span>
                )}
              </span>
              {renderRight && renderRight(it)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TodayFocusModal({ employeeId, todayStr, onClose }) {
  const { data, isLoading } = useQuery({
    queryKey: ['today_focus_detail', employeeId, todayStr],
    enabled: !!employeeId,
    staleTime: 30_000,
    queryFn: async () => {
      const dayStart = `${todayStr}T00:00:00.000Z`;
      const [ra, ca, savedR, savedC] = await Promise.all([
        supabase.from('renewal_attempts')
          .select('result, renewal_case_id, renewal_cases(customer_name, product)')
          .eq('employee_id', employeeId).eq('auto_logged', false).gte('attempted_at', dayStart),
        supabase.from('pending_cancel_attempts')
          .select('result, pending_case_id, pending_cases(customer_name, product)')
          .eq('employee_id', employeeId).eq('auto_logged', false).gte('attempted_at', dayStart),
        supabase.from('renewal_cases')
          .select('customer_name, product, premium, saved_premium')
          .eq('closed_by_id', employeeId).eq('resolution_date', todayStr).eq('status', 'confirmed'),
        supabase.from('pending_cases')
          .select('customer_name, product, premium_at_risk, saved_premium')
          .eq('closed_by_id', employeeId).eq('resolution_date', todayStr).in('status', ['saved', 'rewritten']),
      ]);

      // Distinct customers worked today, flagged reached if any attempt reached.
      const byCase = new Map();
      const add = (rows, idKey, caseKey) => {
        for (const r of rows || []) {
          const c = r[caseKey];
          if (!c) continue;
          const k = idKey + r[idKey];
          const prev = byCase.get(k) || { name: c.customer_name, product: c.product, reached: false };
          if (r.result === 'reached') prev.reached = true;
          byCase.set(k, prev);
        }
      };
      add(ra.data, 'renewal_case_id', 'renewal_cases');
      add(ca.data, 'pending_case_id', 'pending_cases');

      const all = [...byCase.values()];
      const reached = all.filter((c) => c.reached);
      const noAnswer = all.filter((c) => !c.reached);

      const saved = [
        ...(savedR.data || []).map((r) => ({ name: r.customer_name, product: r.product, premium: Number(r.saved_premium ?? r.premium ?? 0) })),
        ...(savedC.data || []).map((r) => ({ name: r.customer_name, product: r.product, premium: Number(r.saved_premium ?? r.premium_at_risk ?? 0) })),
      ];

      return { reached, noAnswer, saved };
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
            <Section title="🎉 Saved" color="#10B981" items={data.saved}
              renderRight={(it) => (
                <span style={{ color: '#10B981', fontWeight: 700, fontSize: 12 }}>{fmt$(it.premium)} kept</span>
              )} />
            <Section title="✅ Reached" color="#10B981" items={data.reached} />
            <Section title="📞 Attempted — no answer" color="var(--qs-subtle)" items={data.noAnswer} />
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
