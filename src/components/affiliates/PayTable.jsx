// src/components/affiliates/PayTable.jsx
// What affiliates are paid per household. One table for the affiliates page, the terms
// page and the Affiliate Portal. Amounts come from the agency's pay schedule.
// Each row's name is the same editable text as the staff Pay Schedule (Rate Checks →
// Affiliates), so a name edited in one place shows everywhere. A name nobody has edited
// shows with its product names capitalized.
import { T } from '../SiteCopy';
import { TIERS, EXTRA_LINE_CAP } from '../../pages/components/rate-checks/partnerPay';
import { money, productCase } from '../../lib/affiliates';

/** `amounts`: { auto_home: 45, …, extra_line: 5 }. `extraCap`: how many extra lines pay. */
export default function PayTable({ amounts, extraCap = EXTRA_LINE_CAP, label = 'Pay per household', className = '' }) {
  const rows = TIERS.filter(t => amounts?.[t.key] != null);
  return (
    <dl className={`divide-y divide-slate-100 ${className}`} aria-label={label}>
      {rows.map(t => (
        <div key={t.key} className="flex items-baseline justify-between gap-4 py-3">
          <dt className="text-[15px] text-slate-700"><T format={productCase}>{t.label}</T></dt>
          <dd className="text-lg font-extrabold tabular-nums text-[#0F2D6B]">{money(amounts[t.key])}</dd>
        </div>
      ))}
      {amounts?.extra_line != null && (
        <div className="flex items-baseline justify-between gap-4 py-3">
          <dt className="text-[15px] text-slate-700"><T k="pay.extra-line">{`Each Extra Line (Umbrella, a Second Auto Policy), Up to ${extraCap}`}</T></dt>
          <dd className="text-lg font-extrabold tabular-nums text-[#0F2D6B]">+{money(amounts.extra_line)}</dd>
        </div>
      )}
    </dl>
  );
}
