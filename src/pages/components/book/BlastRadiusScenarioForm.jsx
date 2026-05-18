// src/pages/components/book/BlastRadiusScenarioForm.jsx
const inputStyle = {
  width: '100%', padding: '8px 12px', background: 'var(--qs-elevated)',
  border: '1px solid var(--qs-border)', borderRadius: 8,
  color: 'var(--qs-text)', fontSize: 14, outline: 'none',
};

const SCENARIO_TYPES = [
  { key: 'comp_cut',          label: 'Comp Cut',          desc: 'Carrier reduces commission %' },
  { key: 'carrier_exit',      label: 'Carrier Exit',      desc: 'Carrier withdraws from state' },
  { key: 'forced_termination', label: 'Forced Termination', desc: 'Appointment terminated; book value triggered' },
];

const labelStyle = {
  display: 'block', fontSize: 13, fontWeight: 500,
  color: 'var(--qs-text)', marginBottom: 6,
};

export default function BlastRadiusScenarioForm({ scenario, onChange, carriers }) {
  const update = (key, value) => onChange({ ...scenario, [key]: value });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--qs-bright)', margin: 0 }}>
        Scenario inputs
      </h3>

      {/* Scenario type selector */}
      <div>
        <label style={labelStyle}>Scenario type</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {SCENARIO_TYPES.map(t => (
            <button
              key={t.key} type="button"
              onClick={() => update('type', t.key)}
              style={{
                textAlign: 'left', padding: '10px 12px',
                background: scenario.type === t.key ? 'rgba(59, 130, 246, 0.10)' : 'var(--qs-elevated)',
                border: `1px solid ${scenario.type === t.key ? 'var(--qs-info)' : 'var(--qs-border)'}`,
                borderRadius: 8, color: 'var(--qs-text)', cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 600 }}>{t.label}</div>
              <div style={{ fontSize: 12, color: 'var(--qs-subtle)', marginTop: 2 }}>{t.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Carrier selector */}
      <div>
        <label style={labelStyle}>Carrier</label>
        <select
          value={scenario.carrierCode}
          onChange={(e) => update('carrierCode', e.target.value)}
          style={{ ...inputStyle, cursor: 'pointer' }}
        >
          {carriers.map(c => (
            <option key={c.carrier_code} value={c.carrier_code}>
              {c.carrier_name} ({c.premiumShare.toFixed(0)}% of book)
            </option>
          ))}
        </select>
      </div>

      {/* Type-specific inputs */}
      {scenario.type === 'comp_cut' && (
        <div>
          <label style={labelStyle}>
            Commission change: {scenario.compChangePct}%
          </label>
          <input
            type="range" min="-50" max="20" step="1"
            value={scenario.compChangePct}
            onChange={(e) => update('compChangePct', Number(e.target.value))}
            style={{ width: '100%' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--qs-dim)', marginTop: 4 }}>
            <span>-50%</span><span>0</span><span>+20%</span>
          </div>
        </div>
      )}

      {scenario.type === 'carrier_exit' && (
        <div>
          <label style={labelStyle}>
            Retention assumption: {scenario.retentionPct}% (how much you keep after re-write)
          </label>
          <input
            type="range" min="0" max="100" step="5"
            value={scenario.retentionPct}
            onChange={(e) => update('retentionPct', Number(e.target.value))}
            style={{ width: '100%' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--qs-dim)', marginTop: 4 }}>
            <span>0%</span><span>50%</span><span>100%</span>
          </div>
        </div>
      )}

      {scenario.type === 'forced_termination' && (
        <div>
          <label style={labelStyle}>Buyout multiplier variant</label>
          <select
            value={scenario.buyoutVariant}
            onChange={(e) => update('buyoutVariant', e.target.value)}
            style={{ ...inputStyle, cursor: 'pointer' }}
          >
            <option value="min">Minimum (worst case)</option>
            <option value="typical">Typical</option>
            <option value="max">Maximum (best case)</option>
          </select>
        </div>
      )}
    </div>
  );
}
