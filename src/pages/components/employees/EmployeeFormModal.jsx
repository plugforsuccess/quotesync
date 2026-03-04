// src/pages/components/employees/EmployeeFormModal.jsx
// Add/Edit Employee slide-out modal with grouped form sections.

import { useState, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';

const ROLE_OPTIONS = [
  { value: 'service', label: 'Service' },
  { value: 'producer', label: 'Producer' },
  { value: 'admin', label: 'Admin' },
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
  first_name: '',
  last_name: '',
  preferred_name: '',
  personal_email: '',
  cell_phone: '',
  home_phone: '',
  address_line1: '',
  address_line2: '',
  city: '',
  state: '',
  zip_code: '',
  role_type: 'service',
  hire_date: '',
  allstate_id: '',
  rc_display_name: '',
  is_licensed: false,
  license_verified_date: '',
  professional_designations: [],
  years_insurance_experience: '',
  years_commercial_experience: '',
  highest_education: '',
};

export default function EmployeeFormModal({ open, onClose, onSave, saving, employee }) {
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
        role_type: employee.role_type || 'service',
        hire_date: employee.hire_date || '',
        allstate_id: employee.allstate_id || '',
        rc_display_name: employee.rc_display_name || '',
        is_licensed: employee.is_licensed || false,
        license_verified_date: employee.license_verified_date || '',
        professional_designations: employee.professional_designations || [],
        years_insurance_experience: employee.years_insurance_experience ?? '',
        years_commercial_experience: employee.years_commercial_experience ?? '',
        highest_education: employee.highest_education || '',
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [employee, open]);

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
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function toggleDesignation(designation) {
    setForm((prev) => {
      const current = prev.professional_designations || [];
      return {
        ...prev,
        professional_designations: current.includes(designation)
          ? current.filter((d) => d !== designation)
          : [...current, designation],
      };
    });
  }

  function handleSubmit(e) {
    e.preventDefault();
    const payload = { ...form };
    // Clean optional numeric fields
    if (payload.years_insurance_experience === '') payload.years_insurance_experience = null;
    else payload.years_insurance_experience = parseInt(payload.years_insurance_experience, 10);
    if (payload.years_commercial_experience === '') payload.years_commercial_experience = null;
    else payload.years_commercial_experience = parseInt(payload.years_commercial_experience, 10);
    // Clean empty strings to null
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
    if (!payload.hire_date) payload.hire_date = null;
    if (!payload.license_verified_date) payload.license_verified_date = null;
    if (!payload.highest_education) payload.highest_education = null;
    if (payload.professional_designations.length === 0) payload.professional_designations = null;

    onSave(payload);
  }

  const yearOptions = Array.from({ length: 32 }, (_, i) => i === 31 ? '30+' : String(i));

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose} />
      <div className="flex min-h-full items-start justify-center p-4">
        <div className="relative w-full max-w-2xl bg-white rounded-lg shadow-xl my-8">
          {/* Header */}
          <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              {isEdit ? 'Edit Employee' : 'Add Employee'}
            </h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-500" aria-label="Close">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <form onSubmit={handleSubmit}>
            <div className="px-6 py-4 max-h-[70vh] overflow-y-auto space-y-6">

              {/* Identity */}
              <fieldset>
                <legend className="text-sm font-semibold text-gray-700 mb-3">Identity</legend>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
                    <input
                      required
                      value={form.first_name}
                      onChange={(e) => handleChange('first_name', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
                    <input
                      required
                      value={form.last_name}
                      onChange={(e) => handleChange('last_name', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Preferred Name</label>
                    <input
                      value={form.preferred_name}
                      onChange={(e) => handleChange('preferred_name', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Personal Email</label>
                    <input
                      type="email"
                      value={form.personal_email}
                      onChange={(e) => handleChange('personal_email', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Cell Phone</label>
                    <input
                      value={form.cell_phone}
                      onChange={(e) => handleChange('cell_phone', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Home Phone</label>
                    <input
                      value={form.home_phone}
                      onChange={(e) => handleChange('home_phone', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
              </fieldset>

              {/* Address */}
              <fieldset>
                <legend className="text-sm font-semibold text-gray-700 mb-3">Address</legend>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Address Line 1</label>
                    <input
                      value={form.address_line1}
                      onChange={(e) => handleChange('address_line1', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Address Line 2</label>
                    <input
                      value={form.address_line2}
                      onChange={(e) => handleChange('address_line2', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                    <input
                      value={form.city}
                      onChange={(e) => handleChange('city', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                    <select
                      value={form.state}
                      onChange={(e) => handleChange('state', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Select...</option>
                      {US_STATES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Zip Code</label>
                    <input
                      value={form.zip_code}
                      onChange={(e) => handleChange('zip_code', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
              </fieldset>

              {/* Employment */}
              <fieldset>
                <legend className="text-sm font-semibold text-gray-700 mb-3">Employment</legend>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Role *</label>
                    <select
                      required
                      value={form.role_type}
                      onChange={(e) => handleChange('role_type', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Hire Date</label>
                    <input
                      type="date"
                      value={form.hire_date}
                      onChange={(e) => handleChange('hire_date', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Allstate ID</label>
                    <input
                      value={form.allstate_id}
                      onChange={(e) => handleChange('allstate_id', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">RingCentral Display Name *</label>
                    <input
                      required
                      value={form.rc_display_name}
                      onChange={(e) => handleChange('rc_display_name', e.target.value)}
                      placeholder="e.g. Tracy Peacock"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
              </fieldset>

              {/* Licensing */}
              <fieldset>
                <legend className="text-sm font-semibold text-gray-700 mb-3">Licensing</legend>
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.is_licensed}
                        onChange={(e) => handleChange('is_licensed', e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-gray-200 peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                    <span className="text-sm font-medium text-gray-700">Licensed</span>
                  </div>

                  {form.is_licensed && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">License Verified Date</label>
                      <input
                        type="date"
                        value={form.license_verified_date}
                        onChange={(e) => handleChange('license_verified_date', e.target.value)}
                        className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Professional Designations</label>
                    <div className="flex flex-wrap gap-2">
                      {DESIGNATION_OPTIONS.map((d) => (
                        <label
                          key={d}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer border transition-colors ${
                            (form.professional_designations || []).includes(d)
                              ? 'bg-blue-100 text-blue-800 border-blue-300'
                              : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={(form.professional_designations || []).includes(d)}
                            onChange={() => toggleDesignation(d)}
                            className="sr-only"
                          />
                          {d}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Years Insurance Experience</label>
                      <select
                        value={form.years_insurance_experience}
                        onChange={(e) => handleChange('years_insurance_experience', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="">Select...</option>
                        {yearOptions.map((y) => (
                          <option key={y} value={y === '30+' ? '31' : y}>{y}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Years Commercial Experience</label>
                      <select
                        value={form.years_commercial_experience}
                        onChange={(e) => handleChange('years_commercial_experience', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="">Select...</option>
                        {yearOptions.map((y) => (
                          <option key={y} value={y === '30+' ? '31' : y}>{y}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Highest Education</label>
                    <select
                      value={form.highest_education}
                      onChange={(e) => handleChange('highest_education', e.target.value)}
                      className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      {EDUCATION_OPTIONS.map((ed) => (
                        <option key={ed} value={ed}>{ed || 'Select...'}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </fieldset>
            </div>

            {/* Footer */}
            <div className="border-t border-gray-200 px-6 py-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Save Employee'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
