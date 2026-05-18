// src/pages/components/book/BookEditorTable.jsx
import { Edit, Trash2 } from 'lucide-react';

const PRODUCT_LABELS = {
  auto: 'Auto', ho: 'Homeowners', condo: 'Condo', renters: 'Renters',
  landlord: 'Landlord', specialty_auto: 'Specialty Auto',
  pup: 'Umbrella', manufactured: 'Manufactured Home',
  boat: 'Boat', motor_club: 'Motor Club', other: 'Other',
};

const thStyle = {
  padding: '10px 14px', textAlign: 'left', fontSize: 11,
  textTransform: 'uppercase', letterSpacing: 0.5,
  color: 'var(--qs-subtle)', fontWeight: 600,
};
const tdStyle = { padding: '10px 14px', color: 'var(--qs-text)' };
const iconBtnStyle = (color) => ({
  background: 'transparent', border: 'none', cursor: 'pointer',
  color, padding: 4,
});

export default function BookEditorTable({ rows, onEdit, onDelete }) {
  if (rows.length === 0) {
    return (
      <div style={{
        background: 'var(--qs-card)', border: '1px solid var(--qs-border)',
        borderRadius: 12, padding: 32, textAlign: 'center',
      }}>
        <p style={{ color: 'var(--qs-subtle)', margin: 0 }}>
          No book composition rows yet. Click "Add Row" to start.
        </p>
      </div>
    );
  }

  return (
    <div style={{
      background: 'var(--qs-card)', border: '1px solid var(--qs-border)',
      borderRadius: 12, overflow: 'hidden',
    }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ background: 'var(--qs-elevated)' }}>
            <th style={thStyle}>Carrier</th>
            <th style={thStyle}>Product</th>
            <th style={thStyle}>State</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Policies</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Premium</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Comm %</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Est. Comm</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} style={{ borderTop: '1px solid var(--qs-border)' }}>
              <td style={tdStyle}>{r.carrier_name}</td>
              <td style={tdStyle}>{PRODUCT_LABELS[r.product_key] || r.product_key}</td>
              <td style={tdStyle}>{r.state_code}</td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>{r.policy_count.toLocaleString()}</td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>${Number(r.total_premium).toLocaleString()}</td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>
                {r.avg_commission_rate != null
                  ? `${(Number(r.avg_commission_rate) * 100).toFixed(1)}%`
                  : '—'}
              </td>
              <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--qs-success)', fontWeight: 600 }}>
                ${Number(r.estimated_annual_commission || 0).toLocaleString()}
              </td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>
                <button
                  type="button" onClick={() => onEdit(r)}
                  style={iconBtnStyle('var(--qs-info)')}
                  aria-label="Edit"
                >
                  <Edit size={14} />
                </button>
                <button
                  type="button" onClick={() => onDelete(r)}
                  style={{ ...iconBtnStyle('var(--qs-danger)'), marginLeft: 8 }}
                  aria-label="Delete"
                >
                  <Trash2 size={14} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
