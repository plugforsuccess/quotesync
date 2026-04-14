// src/pages/components/employees/EmployeeFormModal.jsx
// Add/Edit Employee modal — redesigned with dark-theme-correct inputs,
// section cards, and a two-column panel layout.

import { useState, useEffect, useCallback } from 'react';
import { X, User, MapPin, Briefcase, Clock, Award, Calendar } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

const ROLE_OPTIONS = [
  { value: 'service_inbound',  label: 'Service — Inbound'  },
  { value: 'service_outbound', label: 'Service — Outbound' },
  { value: 'sales',            label: 'Sales'              },
  { value: 'admin',            label: 'Admin'              },
];

const EDUCATION_OPTIONS = [
  '', 'High School', 'Some College', "Associate's", "Bachelor's", "Master's", 'Doctorate',
];

const DESIGNATION_OPTIONS = [
  'CPCU', 'CLU', 'CIC', 'FFSI', 'FLMI', 'ChFC', 'CFP', 'MSFS', 'LUTCF',
];

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC',
];

const EMPTY_FORM = {
  first_name: '', last_name: '', preferred_name: '', personal_email: '',
  cell_phone: '', home_phone: '', address_line1: '', address_line2: '',
  city: '', state: '', zip_code: '', roles: ['service_inbound'], hire_date: '',
  allstate_id: '', rc_display_name: '', punch_pin: '',
  default_start_time: '09:00', default_lunch_out: '12:00',
  default_lunch_in: '13:00', default_end_time: '18:00',
  is_licensed: false, license_verified_date: '', professional_designations: [],
  years_insurance_experience: '', years_commercial_experience: '', highest_education: '',
  pto_days_per_year: 10, sick_days_per_year: 5, pto_eligible_date: '',
};

// Shared input style — explicitly overrides the global white-bg cascade
const inputStyle = {
  width: '100%',
  padding: '8px 12px',
  background: 'var(--qs-elevated)',
  border: '1px solid var(--qs-border)',
  borderRadius: 8,
  color: 'var(--qs-text)',
  fontSize: 14,
  outline: 'none',
  transition: 'border-color 0.15s',
};

const labelStyle = {
  display: 'block',
  fontSize: 12,
  fontWeight: 500,
  color: 'var(--qs-dim)',
  marginBottom: 6,
};

// Section card wrapper
function Section({ icon: Icon, title, children }) {
  return (
    <div style={{
      background: 'var(--qs-elevated)',
      border: '1px solid var(--qs-border)',
      borderRadius: 12,
      padding: '20px 24px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <div style={{
          width: 28, height: 28,
          background: 'rgba(99,102,241,0.12)',
          borderRadius: 6,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Icon size={14} style={{ color: 'var(--qs-info)' }} />
        </div>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--qs-bright)' }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

function Field({ label, children, span }) {
  return (
    <div style={{ gridColumn: span === 2 ? 'span 2' : undefined }}>
      {label && <label style={labelStyle}>{label}</label>}
      {children}
    </div>
  );
}

function Input({ value, onChange, type = 'text', placeholder, required, maxLength, inputMode, pattern }) {
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      required={required}
      maxLength={maxLength}
      inputMode={inputMode}
      pattern={pattern}
      style={inputStyle}
      onFocus={e => e.target.style.borderColor = 'var(--qs-info)'}
      onBlur={e => e.target.style.borderColor = 'var(--qs-border)'}
    />
  );
}

function Select({ value, onChange, children }) {
  return (
    <select
      value={value}
      onChange={onChange}
      style={{ ...inputStyle, cursor: 'pointer' }}
      onFocus={e => e.target.style.borderColor = 'var(--qs-info)'}
      onBlur={e => e.target.style.borderColor = 'var(--qs-border)'}
    >
      {children}
    </select>
  );
}

export default function EmployeeFormModal({ open, onClose, onSave, saving, employee, agencyId }) {
  const isEdit = !!employee;
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    if (employee) {
      setForm({
        first_name: employee.first_name || '',
        last_name: employee.last_name || '',
        preferred_name: employee.preferred_name || '',
        personal_email: employee.personal_email || '',
        cell_phone: employee.cell_phone || '',
        home_phone: employee.home_phone || '',
        address_line1: employee.address_line1 || '',
        address_line2: employee.address_line2 || '',
        city: employee.city || '',
        state: employee.state || '',
        zip_code: employee.zip_code || '',
        roles: employee.roles || ['service_inbound'],
        hire_date: employee.hire_date || '',
        allstate_id: employee.allstate_id || '',
        rc_display_name: employee.rc_display_name || '',
        punch_pin: employee.punch_pin || '',
        default_start_time: employee.default_start_time?.slice(0, 5) || '09:00',
        default_lunch_out: employee.default_lunch_out?.slice(0, 5) || '12:00',
        default_lunch_in: employee.default_lunch_in?.slice(0, 5) || '13:00',
        default_end_time: employee.default_end_time?.slice(0, 5) || '18:00',
        is_licensed: employee.is_licensed || false,
        license_verified_date: employee.license_verified_date || '',
        professional_designations: employee.professional_designations || [],
        years_insurance_experience: employee.years_insurance_experience ?? '',
        years_commercial_experience: employee.years_commercial_experience ?? '',
        highest_education: employee.highest_education || '',
        pto_days_per_year: employee.pto_days_per_year ?? 10,
        sick_days_per_year: employee.sick_days_per_year ?? 5,
        pto_eligible_date: employee.pto_eligible_date || '',
      });
      if (agencyId && employee.id) {
        supabase
          .from('employee_producer_codes')
          .select('code')
          .eq('employee_id', employee.id)
          .eq('agency_id', agencyId)
          .eq('carrier', 'allstate')
          .maybeSingle()
          .then(({ data: codeRow }) => {
            setForm(f => ({ ...f, allstate_bind_id: codeRow?.code || '' }));
          });
      }
    } else {
      setForm({ ...EMPTY_FORM, allstate_bind_id: '' });
    }
  }, [employee, open, agencyId]);

  const handleEsc = useCallback((e) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleEsc);
      return () => document.removeEventListener('keydown', handleEsc);
    }
  }, [open, handleEsc]);

  if (!open) return null;

  function handleChange(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function toggleDesignation(d) {
    setForm(prev => {
      const current = prev.professional_designations || [];
      return {
        ...prev,
        professional_designations: current.includes(d)
          ? current.filter(x => x !== d)
          : [...current, d],
      };
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const payload = { ...form };
    const bindIdValue = payload.allstate_bind_id;
    delete payload.allstate_bind_id;
    if (payload.years_insurance_experience === '') payload.years_insurance_experience = null;
    else payload.years_insurance_experience = parseInt(payload.years_insurance_experience, 10);
    if (payload.years_commercial_experience === '') payload.years_commercial_experience = null;
    else payload.years_commercial_experience = parseInt(payload.years_commercial_experience, 10);
    if (!payload.preferred_name) payload.preferred_name = null;
    if (!payload.personal_email) payload.personal_email = null;
    if (!payload.cell_phone) payload.cell_phone = null;
    if (!payload.home_phone) payload.home_phone = null;
    if (!payload.address_line1) payload.address_line1 = null;
    if (!payload.address_line2) payload.address_line2 = null;
    if (!payload.city) payload.city = null;
    if (!payload.state) payload.state = null;
    if (!payload.zip_code) payload.zip_code = null;
    if (!payload.allstate_id) payload.allstate_id = null;
    if (!payload.punch_pin || payload.punch_pin.length !== 4) payload.punch_pin = null;
    if (!payload.hire_date) payload.hire_date = null;
    if (!payload.default_start_time) payload.default_start_time = null;
    if (!payload.default_lunch_out) payload.default_lunch_out = null;
    if (!payload.default_lunch_in) payload.default_lunch_in = null;
    if (!payload.default_end_time) payload.default_end_time = null;
    if (!payload.license_verified_date) payload.license_verified_date = null;
    if (!payload.highest_education) payload.highest_education = null;
    if (payload.professional_designations.length === 0) payload.professional_designations = null;
    if (!payload.pto_eligible_date) payload.pto_eligible_date = null;
    payload.pto_days_per_year = parseInt(payload.pto_days_per_year, 10);
    if (isNaN(payload.pto_days_per_year)) payload.pto_days_per_year = 10;
    payload.sick_days_per_year = parseInt(payload.sick_days_per_year, 10);
    if (isNaN(payload.sick_days_per_year)) payload.sick_days_per_year = 5;

    if (isEdit && agencyId && employee?.id && bindIdValue) {
      await supabase.from('employee_producer_codes').upsert({
        agency_id: agencyId,
        employee_id: employee.id,
        carrier: 'allstate',
        code: bindIdValue,
      }, { onConflict: 'agency_id,carrier,code' });
    }

    onSave(payload);
  }

  const yearOptions = Array.from({ length: 32 }, (_, i) => i === 31 ? '30+' : String(i));

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.75)',
      backdropFilter: 'blur(4px)',
      zIndex: 50,
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'center',
      padding: '24px 16px',
      overflowY: 'auto',
    }}>
      {/* Backdrop dismiss */}
      <div style={{ position: 'absolute', inset: 0 }} onClick={onClose} />

      {/* Modal panel */}
      <div style={{
        position: 'relative',
        width: '100%',
        maxWidth: 860,
        background: 'var(--qs-card)',
        border: '1px solid var(--qs-border)',
        borderRadius: 16,
        overflow: 'hidden',
        boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '18px 24px',
          borderBottom: '1px solid var(--qs-border)',
          background: 'var(--qs-elevated)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32,
              background: 'rgba(99,102,241,0.15)',
              borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <User size={16} style={{ color: 'var(--qs-info)' }} />
            </div>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--qs-bright)', margin: 0 }}>
                {isEdit ? 'Edit Employee' : 'Add Employee'}
              </h2>
              {isEdit && (
                <p style={{ fontSize: 12, color: 'var(--qs-dim)', margin: 0 }}>
                  {employee.first_name} {employee.last_name}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32, height: 32,
              background: 'var(--qs-card)',
              border: '1px solid var(--qs-border)',
              borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
              color: 'var(--qs-dim)',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--qs-border)'; e.currentTarget.style.color = 'var(--qs-bright)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--qs-card)'; e.currentTarget.style.color = 'var(--qs-dim)'; }}
            aria-label="Close"
          >
            <X size={15} />
          </button>
        </div>

        {/* Scrollable body */}
        <form onSubmit={handleSubmit}>
          <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Identity */}
            <Section icon={User} title="Identity">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="First Name *">
                  <Input required value={form.first_name} onChange={e => handleChange('first_name', e.target.value)} />
                </Field>
                <Field label="Last Name *">
                  <Input required value={form.last_name} onChange={e => handleChange('last_name', e.target.value)} />
                </Field>
                <Field label="Preferred Name">
                  <Input value={form.preferred_name} onChange={e => handleChange('preferred_name', e.target.value)} />
                </Field>
                <Field label="Personal Email">
                  <Input type="email" value={form.personal_email} onChange={e => handleChange('personal_email', e.target.value)} />
                </Field>
                <Field label="Cell Phone">
                  <Input value={form.cell_phone} onChange={e => handleChange('cell_phone', e.target.value)} />
                </Field>
                <Field label="Home Phone">
                  <Input value={form.home_phone} onChange={e => handleChange('home_phone', e.target.value)} />
                </Field>
              </div>
            </Section>

            {/* Address */}
            <Section icon={MapPin} title="Address">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Address Line 1" span={2}>
                  <Input value={form.address_line1} onChange={e => handleChange('address_line1', e.target.value)} />
                </Field>
                <Field label="Address Line 2" span={2}>
                  <Input value={form.address_line2} onChange={e => handleChange('address_line2', e.target.value)} />
                </Field>
                <Field label="City">
                  <Input value={form.city} onChange={e => handleChange('city', e.target.value)} />
                </Field>
                <Field label="State">
                  <Select value={form.state} onChange={e => handleChange('state', e.target.value)}>
                    <option value="">Select...</option>
                    {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </Select>
                </Field>
                <Field label="Zip Code">
                  <Input value={form.zip_code} onChange={e => handleChange('zip_code', e.target.value)} />
                </Field>
              </div>
            </Section>

            {/* Employment */}
            <Section icon={Briefcase} title="Employment">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {/* Roles — full width */}
                <Field label="Roles *" span={2}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 2 }}>
                    {ROLE_OPTIONS.map(opt => {
                      const checked = form.roles?.includes(opt.value) || false;
                      return (
                        <label
                          key={opt.value}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 7,
                            padding: '6px 12px',
                            borderRadius: 8,
                            border: `1px solid ${checked ? 'var(--qs-info)' : 'var(--qs-border)'}`,
                            background: checked ? 'rgba(59,130,246,0.1)' : 'var(--qs-elevated)',
                            color: checked ? 'var(--qs-info)' : 'var(--qs-dim)',
                            fontSize: 13,
                            fontWeight: 500,
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                            userSelect: 'none',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={e => {
                              const next = e.target.checked
                                ? [...(form.roles || []), opt.value]
                                : (form.roles || []).filter(r => r !== opt.value);
                              if (next.length > 0) handleChange('roles', next);
                            }}
                            style={{ accentColor: 'var(--qs-info)', width: 14, height: 14 }}
                          />
                          {opt.label}
                        </label>
                      );
                    })}
                  </div>
                  {(!form.roles || form.roles.length === 0) && (
                    <p style={{ fontSize: 11, color: 'var(--qs-danger)', marginTop: 4 }}>At least one role required</p>
                  )}
                </Field>

                <Field label="Hire Date">
                  <Input type="date" value={form.hire_date} onChange={e => handleChange('hire_date', e.target.value)} />
                </Field>
                <Field label="Allstate Bind ID">
                  <Input
                    value={form.allstate_bind_id || ''}
                    onChange={e => handleChange('allstate_bind_id', e.target.value.trim().toUpperCase())}
                    placeholder="e.g. A0C2667"
                    maxLength={20}
                  />
                  <p style={{ fontSize: 11, color: 'var(--qs-subtle)', marginTop: 4 }}>
                    Found in the "Bind ID" column of the Allstate New Business Details report.
                  </p>
                </Field>
                <Field label="RingCentral Display Name *">
                  <Input
                    required
                    value={form.rc_display_name}
                    onChange={e => handleChange('rc_display_name', e.target.value)}
                    placeholder="e.g. Tracy Peacock"
                  />
                </Field>
                <Field label="Punch PIN (4 digits, optional)">
                  <Input
                    type="text"
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="e.g. 2667"
                    value={form.punch_pin || ''}
                    onChange={e => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                      handleChange('punch_pin', val || '');
                    }}
                    pattern="\d{4}"
                  />
                  <p style={{ fontSize: 11, color: 'var(--qs-subtle)', marginTop: 4 }}>
                    Used at /punch to clock in and out.
                  </p>
                </Field>
              </div>
            </Section>

            {/* Default Schedule */}
            <Section icon={Clock} title="Default Schedule">
              <p style={{ fontSize: 12, color: 'var(--qs-subtle)', marginBottom: 12 }}>
                Pre-fills the Attendance page for this employee each week.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Start Time">
                  <Input type="time" value={form.default_start_time} onChange={e => handleChange('default_start_time', e.target.value)} />
                </Field>
                <Field label="Lunch Out">
                  <Input type="time" value={form.default_lunch_out} onChange={e => handleChange('default_lunch_out', e.target.value)} />
                </Field>
                <Field label="Lunch In">
                  <Input type="time" value={form.default_lunch_in} onChange={e => handleChange('default_lunch_in', e.target.value)} />
                </Field>
                <Field label="End Time">
                  <Input type="time" value={form.default_end_time} onChange={e => handleChange('default_end_time', e.target.value)} />
                </Field>
              </div>
            </Section>

            {/* Time Off Allotment */}
            <Section icon={Calendar} title="Time Off Allotment">
              <p style={{ fontSize: 12, color: 'var(--qs-subtle)', marginBottom: 12 }}>
                PTO is front-loaded Jan 1 with no rollover. Hard block enforced in time entry.
                Sick days are tracked with a soft warning threshold only.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Annual PTO Days">
                  <Input
                    type="number"
                    value={form.pto_days_per_year}
                    onChange={e => handleChange('pto_days_per_year', e.target.value)}
                  />
                  <p style={{ fontSize: 11, color: 'var(--qs-muted)', marginTop: 4 }}>
                    Front-loaded Jan 1. No rollover. Hard block enforced in time entry.
                  </p>
                </Field>
                <Field label="Sick Day Advisory Threshold">
                  <Input
                    type="number"
                    value={form.sick_days_per_year}
                    onChange={e => handleChange('sick_days_per_year', e.target.value)}
                  />
                  <p style={{ fontSize: 11, color: 'var(--qs-muted)', marginTop: 4 }}>
                    Soft warning only — no hard block. Tracked for evaluation purposes.
                  </p>
                </Field>
                <Field label="PTO Eligible Date" span={2}>
                  <Input
                    type="date"
                    value={form.pto_eligible_date}
                    onChange={e => handleChange('pto_eligible_date', e.target.value)}
                  />
                  <p style={{ fontSize: 11, color: 'var(--qs-muted)', marginTop: 4 }}>
                    Typically hire date + 180 days. Leave blank if already eligible.
                  </p>
                </Field>
              </div>
            </Section>

            {/* Licensing */}
            <Section icon={Award} title="Licensing">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Licensed toggle */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button
                    type="button"
                    onClick={() => handleChange('is_licensed', !form.is_licensed)}
                    style={{
                      width: 40, height: 22,
                      background: form.is_licensed ? 'var(--qs-success)' : 'var(--qs-border)',
                      borderRadius: 11,
                      border: 'none',
                      cursor: 'pointer',
                      position: 'relative',
                      transition: 'background 0.2s',
                      flexShrink: 0,
                    }}
                    aria-checked={form.is_licensed}
                    role="switch"
                  >
                    <div style={{
                      position: 'absolute',
                      top: 2, left: form.is_licensed ? 20 : 2,
                      width: 18, height: 18,
                      background: '#fff',
                      borderRadius: '50%',
                      transition: 'left 0.2s',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                    }} />
                  </button>
                  <span style={{ fontSize: 14, fontWeight: 500, color: form.is_licensed ? 'var(--qs-success)' : 'var(--qs-dim)' }}>
                    Licensed
                  </span>
                </div>

                {form.is_licensed && (
                  <Field label="License Verified Date">
                    <Input type="date" value={form.license_verified_date} onChange={e => handleChange('license_verified_date', e.target.value)} />
                  </Field>
                )}

                {/* Designations */}
                <div>
                  <label style={labelStyle}>Professional Designations</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {DESIGNATION_OPTIONS.map(d => {
                      const active = (form.professional_designations || []).includes(d);
                      return (
                        <label
                          key={d}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            padding: '4px 10px',
                            borderRadius: 6,
                            border: `1px solid ${active ? 'rgba(99,102,241,0.5)' : 'var(--qs-border)'}`,
                            background: active ? 'rgba(99,102,241,0.12)' : 'var(--qs-elevated)',
                            color: active ? '#a5b4fc' : 'var(--qs-dim)',
                            fontSize: 12,
                            fontWeight: 500,
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                            userSelect: 'none',
                          }}
                        >
                          <input type="checkbox" checked={active} onChange={() => toggleDesignation(d)} style={{ display: 'none' }} />
                          {d}
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <Field label="Years Insurance Experience">
                    <Select value={form.years_insurance_experience} onChange={e => handleChange('years_insurance_experience', e.target.value)}>
                      <option value="">Select...</option>
                      {yearOptions.map(y => <option key={y} value={y === '30+' ? '31' : y}>{y}</option>)}
                    </Select>
                  </Field>
                  <Field label="Years Commercial Experience">
                    <Select value={form.years_commercial_experience} onChange={e => handleChange('years_commercial_experience', e.target.value)}>
                      <option value="">Select...</option>
                      {yearOptions.map(y => <option key={y} value={y === '30+' ? '31' : y}>{y}</option>)}
                    </Select>
                  </Field>
                  <Field label="Highest Education">
                    <Select value={form.highest_education} onChange={e => handleChange('highest_education', e.target.value)}>
                      {EDUCATION_OPTIONS.map(ed => <option key={ed} value={ed}>{ed || 'Select...'}</option>)}
                    </Select>
                  </Field>
                </div>
              </div>
            </Section>
          </div>

          {/* Footer */}
          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
            padding: '16px 24px',
            borderTop: '1px solid var(--qs-border)',
            background: 'var(--qs-elevated)',
          }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 16px',
                fontSize: 13,
                fontWeight: 500,
                color: 'var(--qs-text)',
                background: 'var(--qs-card)',
                border: '1px solid var(--qs-border)',
                borderRadius: 8,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--qs-border)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--qs-card)'}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: '8px 20px',
                fontSize: 13,
                fontWeight: 600,
                color: '#fff',
                background: saving ? 'var(--qs-muted)' : 'var(--qs-info)',
                border: 'none',
                borderRadius: 8,
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.7 : 1,
                transition: 'all 0.15s',
              }}
            >
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Save Employee'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
