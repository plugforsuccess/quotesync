// src/pages/AdminAgencyOnboardingPage.jsx
// Multi-step agency onboarding wizard for platform_master_admin

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2, ChevronLeft, ChevronRight, Check, AlertCircle,
  Eye, EyeOff, Loader2, ExternalLink, ArrowLeft,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  useCreateAgency,
  getProductConfigForState,
  DEFAULT_NB_RATES,
  DEFAULT_RENEWAL_RATES,
  PRODUCT_META,
} from '../hooks/useAgencyOnboarding';

const US_STATES = [
  { code: 'AL', name: 'Alabama' }, { code: 'AK', name: 'Alaska' }, { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' }, { code: 'CA', name: 'California' }, { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' }, { code: 'DE', name: 'Delaware' }, { code: 'DC', name: 'District of Columbia' },
  { code: 'FL', name: 'Florida' }, { code: 'GA', name: 'Georgia' }, { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' }, { code: 'IL', name: 'Illinois' }, { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' }, { code: 'KS', name: 'Kansas' }, { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' }, { code: 'ME', name: 'Maine' }, { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' }, { code: 'MI', name: 'Michigan' }, { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' }, { code: 'MO', name: 'Missouri' }, { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' }, { code: 'NV', name: 'Nevada' }, { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' }, { code: 'NM', name: 'New Mexico' }, { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' }, { code: 'ND', name: 'North Dakota' }, { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' }, { code: 'OR', name: 'Oregon' }, { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' }, { code: 'SC', name: 'South Carolina' }, { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' }, { code: 'TX', name: 'Texas' }, { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' }, { code: 'VA', name: 'Virginia' }, { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' }, { code: 'WI', name: 'Wisconsin' }, { code: 'WY', name: 'Wyoming' },
];

const STEPS = [
  { key: 'basics', label: 'Agency Basics' },
  { key: 'products', label: 'Products & VC' },
  { key: 'compensation', label: 'Compensation' },
  { key: 'principal', label: 'Principal Access' },
];

const AdminAgencyOnboardingPage = () => {
  const navigate = useNavigate();
  const { isPlatformUser, hasPlatformRole } = useAuth();
  const createAgency = useCreateAgency();

  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState({});

  // Step 1 — Agency Basics
  const [name, setName] = useState('');
  const [brandName, setBrandName] = useState('');
  const [agentFirstName, setAgentFirstName] = useState('');
  const [agentLastName, setAgentLastName] = useState('');
  const [agentEmail, setAgentEmail] = useState('');
  const [agentPhone, setAgentPhone] = useState('');
  const [policyState, setPolicyState] = useState('');
  const [siteUrl, setSiteUrl] = useState('');

  // Step 2 — Products
  const [products, setProducts] = useState([]);
  const [catFactors, setCatFactors] = useState({});

  // Step 3 — Compensation
  const [vcBaselineTarget, setVcBaselineTarget] = useState(53);
  const [vcProgramLabel, setVcProgramLabel] = useState('VC Baseline');
  const [commissionGoal, setCommissionGoal] = useState(40000);
  const [premiumGoal, setPremiumGoal] = useState(160000);

  // Step 4 — Principal Access
  const [principalEmail, setPrincipalEmail] = useState('');
  const [principalPassword, setPrincipalPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Success state
  const [successData, setSuccessData] = useState(null);

  // Access check
  if (!isPlatformUser || !hasPlatformRole('platform_master_admin')) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-gray-600">Only platform master admins can create agencies.</p>
        </div>
      </div>
    );
  }

  // On state change: populate products + fetch CAT factors
  const handleStateChange = useCallback(async (stateCode) => {
    setPolicyState(stateCode);
    if (!stateCode) {
      setProducts([]);
      setCatFactors({});
      return;
    }

    const productDefaults = getProductConfigForState(stateCode);
    setProducts(
      Object.entries(productDefaults).map(([key, config]) => ({
        product_key: key,
        vcEligible:  config.vcEligible,
        points:      config.points,
        nbRates:     { ...DEFAULT_NB_RATES[key] },
        renewalRates: DEFAULT_RENEWAL_RATES[key] ? { ...DEFAULT_RENEWAL_RATES[key] } : null,
      }))
    );

    // Fetch CAT factors
    const { data: catRows } = await supabase
      .from('cat_reinsurance_factors')
      .select('product_key, factor')
      .eq('policy_state', stateCode)
      .eq('effective_date', '2026-01-01')
      .eq('carrier', 'allstate');

    const factors = {};
    for (const row of catRows || []) {
      factors[row.product_key] = parseFloat(row.factor);
    }
    setCatFactors(factors);
  }, []);

  // Enforce: if vcEligible is false, points must be 0
  useEffect(() => {
    setProducts(prev => prev.map(p =>
      !p.vcEligible && p.points !== 0 ? { ...p, points: 0 } : p
    ));
  }, [products.map(p => p.vcEligible).join(',')]);

  // Validation
  const validateStep = (stepIndex) => {
    const errs = {};

    if (stepIndex === 0) {
      if (!name.trim()) errs.name = 'Agency name is required';
      if (!brandName.trim()) errs.brandName = 'Brand name is required';
      else if (!/^[a-z0-9-]+$/.test(brandName)) errs.brandName = 'Lowercase letters, numbers, and hyphens only';
      if (!agentFirstName.trim()) errs.agentFirstName = 'First name is required';
      if (!agentLastName.trim()) errs.agentLastName = 'Last name is required';
      if (!agentEmail.trim()) errs.agentEmail = 'Email is required';
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(agentEmail)) errs.agentEmail = 'Invalid email format';
      if (!policyState) errs.policyState = 'State is required';
    }

    if (stepIndex === 1) {
      products.forEach((p) => {
        if (p.vcEligible && p.points <= 0) {
          errs[`points_${p.product_key}`] = `${PRODUCT_META[p.product_key]?.label}: points must be > 0 when VC eligible`;
        }
      });
    }

    if (stepIndex === 2) {
      if (!vcBaselineTarget || vcBaselineTarget < 1 || vcBaselineTarget > 100) errs.vcBaselineTarget = 'Must be 1-100';
      if (!commissionGoal || commissionGoal <= 0) errs.commissionGoal = 'Must be positive';
      if (!premiumGoal || premiumGoal <= 0) errs.premiumGoal = 'Must be positive';
    }

    if (stepIndex === 3) {
      if (!principalEmail.trim()) errs.principalEmail = 'Login email is required';
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(principalEmail)) errs.principalEmail = 'Invalid email format';
      if (!principalPassword) errs.principalPassword = 'Password is required';
      else if (principalPassword.length < 8) errs.principalPassword = 'Minimum 8 characters';
      if (principalPassword !== confirmPassword) errs.confirmPassword = 'Passwords do not match';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleNext = () => {
    if (validateStep(step)) {
      setStep(s => s + 1);
    }
  };

  const handleBack = () => {
    setErrors({});
    setStep(s => s - 1);
  };

  const handleSubmit = async () => {
    if (!validateStep(3)) return;

    try {
      const result = await createAgency.mutateAsync({
        name, brandName, agentFirstName, agentLastName, agentEmail, agentPhone,
        policyState, siteUrl,
        products,
        vcBaselineTarget, commissionGoal, premiumGoal, vcProgramLabel,
        principalEmail, principalPassword,
      });
      setSuccessData({ ...result, principalEmail });
    } catch {
      // Error is in createAgency.error
    }
  };

  // Success screen
  if (successData) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-2xl mx-auto px-4 py-16">
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-6">
              <Check className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Agency Created Successfully</h2>
            <div className="mt-6 bg-gray-50 rounded-lg p-5 text-left space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Agency</span>
                <span className="text-sm font-medium text-gray-900">{name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Principal</span>
                <span className="text-sm font-medium text-gray-900">{successData.agentName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Login</span>
                <span className="text-sm font-medium text-gray-900">{successData.principalEmail}</span>
              </div>
            </div>
            <div className="mt-8 flex items-center justify-center gap-3">
              <button
                onClick={() => navigate(`/admin/agencies/${successData.agencyId}`)}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                View Agency
              </button>
              <button
                onClick={() => navigate('/admin/agencies')}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors"
              >
                Go to Agencies List
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-6">
            <button
              onClick={() => navigate('/admin/agencies')}
              className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <Building2 className="w-7 h-7 text-primary-600" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">New Agency Onboarding</h1>
              <p className="text-sm text-gray-500">Create a new agency with all required configuration</p>
            </div>
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-0">
            {STEPS.map((s, i) => (
              <div key={s.key} className="flex items-center flex-1">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                      i < step
                        ? 'bg-green-500 text-white'
                        : i === step
                          ? 'bg-primary-600 text-white'
                          : 'bg-gray-200 text-gray-500'
                    }`}
                  >
                    {i < step ? <Check className="w-3.5 h-3.5" /> : i + 1}
                  </div>
                  <span className={`text-xs font-medium hidden sm:inline ${
                    i === step ? 'text-primary-600' : i < step ? 'text-green-600' : 'text-gray-400'
                  }`}>
                    {s.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-3 ${i < step ? 'bg-green-400' : 'bg-gray-200'}`} />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Step content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-xl border border-gray-200 p-6 md:p-8">
          {step === 0 && (
            <StepBasics
              {...{ name, setName, brandName, setBrandName, agentFirstName, setAgentFirstName,
                agentLastName, setAgentLastName, agentEmail, setAgentEmail, agentPhone, setAgentPhone,
                policyState, handleStateChange, siteUrl, setSiteUrl, errors }}
            />
          )}
          {step === 1 && (
            <StepProducts
              products={products}
              setProducts={setProducts}
              catFactors={catFactors}
              policyState={policyState}
              errors={errors}
            />
          )}
          {step === 2 && (
            <StepCompensation
              {...{ vcBaselineTarget, setVcBaselineTarget, vcProgramLabel, setVcProgramLabel,
                commissionGoal, setCommissionGoal, premiumGoal, setPremiumGoal, errors }}
            />
          )}
          {step === 3 && (
            <StepPrincipal
              {...{ principalEmail, setPrincipalEmail, principalPassword, setPrincipalPassword,
                confirmPassword, setConfirmPassword, showPassword, setShowPassword, errors }}
            />
          )}

          {/* Mutation error */}
          {createAgency.error && (
            <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-red-800">Creation failed</p>
                <p className="text-sm text-red-600 mt-1">{createAgency.error.message}</p>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-200">
            <button
              onClick={handleBack}
              disabled={step === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-40 disabled:pointer-events-none"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>

            {step < 3 ? (
              <button
                onClick={handleNext}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors"
              >
                Continue
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={createAgency.isPending}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors disabled:opacity-60"
              >
                {createAgency.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating Agency...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Create Agency
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Step 1: Agency Basics ────────────────────────────────────────────────────

function StepBasics({
  name, setName, brandName, setBrandName, agentFirstName, setAgentFirstName,
  agentLastName, setAgentLastName, agentEmail, setAgentEmail, agentPhone, setAgentPhone,
  policyState, handleStateChange, siteUrl, setSiteUrl, errors,
}) {
  return (
    <div>
      <h2 className="text-lg font-bold text-gray-900 mb-1">Agency Basics</h2>
      <p className="text-sm text-gray-500 mb-6">Enter the core agency and agent contact information.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Field label="Agency Name" error={errors.name} required>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Wiley-Wilson Agency, Inc."
            className={inputClass(errors.name)}
          />
        </Field>

        <Field label="Brand Name" error={errors.brandName} required hint="Used for URL slug">
          <input
            type="text"
            value={brandName}
            onChange={e => setBrandName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
            placeholder="insuredbycam"
            className={inputClass(errors.brandName)}
          />
        </Field>

        <Field label="Agent First Name" error={errors.agentFirstName} required>
          <input
            type="text"
            value={agentFirstName}
            onChange={e => setAgentFirstName(e.target.value)}
            className={inputClass(errors.agentFirstName)}
          />
        </Field>

        <Field label="Agent Last Name" error={errors.agentLastName} required>
          <input
            type="text"
            value={agentLastName}
            onChange={e => setAgentLastName(e.target.value)}
            className={inputClass(errors.agentLastName)}
          />
        </Field>

        <Field label="Agent Email" error={errors.agentEmail} required>
          <input
            type="email"
            value={agentEmail}
            onChange={e => setAgentEmail(e.target.value)}
            placeholder="agent@agency.com"
            className={inputClass(errors.agentEmail)}
          />
        </Field>

        <Field label="Agent Phone" error={errors.agentPhone}>
          <input
            type="tel"
            value={agentPhone}
            onChange={e => setAgentPhone(e.target.value)}
            placeholder="(555) 555-1234"
            className={inputClass(errors.agentPhone)}
          />
        </Field>

        <Field label="Policy State" error={errors.policyState} required>
          <select
            value={policyState}
            onChange={e => handleStateChange(e.target.value)}
            className={inputClass(errors.policyState)}
          >
            <option value="">Select state...</option>
            {US_STATES.map(s => (
              <option key={s.code} value={s.code}>{s.name} ({s.code})</option>
            ))}
          </select>
        </Field>

        <Field label="Site URL" error={errors.siteUrl} hint="Optional">
          <input
            type="url"
            value={siteUrl}
            onChange={e => setSiteUrl(e.target.value)}
            placeholder="https://www.agency-site.com"
            className={inputClass(errors.siteUrl)}
          />
        </Field>
      </div>
    </div>
  );
}

// ─── Step 2: Products & VC ────────────────────────────────────────────────────

function StepProducts({ products, setProducts, catFactors, policyState, errors }) {
  const updateProduct = (index, field, value) => {
    setProducts(prev => prev.map((p, i) => i === index ? { ...p, [field]: value } : p));
  };

  const updateNbRate = (index, tier, value) => {
    setProducts(prev => prev.map((p, i) =>
      i === index ? { ...p, nbRates: { ...p.nbRates, [tier]: parseFloat(value) || 0 } } : p
    ));
  };

  return (
    <div>
      <h2 className="text-lg font-bold text-gray-900 mb-1">Products & VC Eligibility</h2>
      <div className="mb-5 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm text-blue-800">
          Pre-filled based on 2026 Allstate VC exclusions for <strong>{policyState}</strong>.
          Review and adjust if needed. CAT reinsurance factors are loaded automatically from the Allstate 2026 schedule.
        </p>
      </div>

      <div className="overflow-x-auto -mx-6 px-6">
        <table className="w-full text-sm min-w-[800px]">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-2 pr-3 font-semibold text-gray-600 text-xs uppercase">Product</th>
              <th className="text-center py-2 px-2 font-semibold text-gray-600 text-xs uppercase w-20">VC Eligible</th>
              <th className="text-center py-2 px-2 font-semibold text-gray-600 text-xs uppercase w-20">Points</th>
              <th className="text-center py-2 px-2 font-semibold text-gray-600 text-xs uppercase w-16">CAT</th>
              <th className="text-center py-2 px-2 font-semibold text-gray-600 text-xs uppercase" colSpan={3}>
                NB Rates (Pref / Bundled / Mono)
              </th>
            </tr>
          </thead>
          <tbody>
            {products.map((p, i) => {
              const meta = PRODUCT_META[p.product_key];
              return (
                <tr key={p.product_key} className="border-b border-gray-100">
                  <td className="py-2.5 pr-3">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: meta?.color }} />
                      <span className="font-medium text-gray-900">{meta?.label || p.product_key}</span>
                    </div>
                  </td>
                  <td className="text-center py-2.5 px-2">
                    <input
                      type="checkbox"
                      checked={p.vcEligible}
                      onChange={e => updateProduct(i, 'vcEligible', e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                  </td>
                  <td className="text-center py-2.5 px-2">
                    <input
                      type="number"
                      min={0}
                      value={p.points}
                      onChange={e => updateProduct(i, 'points', parseInt(e.target.value) || 0)}
                      disabled={!p.vcEligible}
                      className="w-16 text-center px-2 py-1 rounded border border-gray-200 text-sm disabled:bg-gray-100 disabled:text-gray-400"
                    />
                  </td>
                  <td className="text-center py-2.5 px-2">
                    <span className="text-xs text-gray-500 font-mono">
                      {catFactors[p.product_key] != null ? catFactors[p.product_key].toFixed(4) : '1.0000'}
                    </span>
                  </td>
                  <td className="text-center py-2.5 px-1">
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      max={1}
                      value={p.nbRates?.preferred ?? ''}
                      onChange={e => updateNbRate(i, 'preferred', e.target.value)}
                      className="w-16 text-center px-1 py-1 rounded border border-gray-200 text-sm"
                    />
                  </td>
                  <td className="text-center py-2.5 px-1">
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      max={1}
                      value={p.nbRates?.bundled ?? ''}
                      onChange={e => updateNbRate(i, 'bundled', e.target.value)}
                      className="w-16 text-center px-1 py-1 rounded border border-gray-200 text-sm"
                    />
                  </td>
                  <td className="text-center py-2.5 px-1">
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      max={1}
                      value={p.nbRates?.monoline ?? ''}
                      onChange={e => updateNbRate(i, 'monoline', e.target.value)}
                      className="w-16 text-center px-1 py-1 rounded border border-gray-200 text-sm"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Product-level validation errors */}
      {Object.entries(errors).filter(([k]) => k.startsWith('points_')).map(([k, msg]) => (
        <p key={k} className="text-xs text-red-600 mt-2">{msg}</p>
      ))}
    </div>
  );
}

// ─── Step 3: Compensation Config ──────────────────────────────────────────────

function StepCompensation({
  vcBaselineTarget, setVcBaselineTarget, vcProgramLabel, setVcProgramLabel,
  commissionGoal, setCommissionGoal, premiumGoal, setPremiumGoal, errors,
}) {
  return (
    <div>
      <h2 className="text-lg font-bold text-gray-900 mb-1">Compensation Config</h2>
      <p className="text-sm text-gray-500 mb-6">Set Allstate VC targets and monthly revenue goals.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Field label="VC Baseline Target" error={errors.vcBaselineTarget} required>
          <input
            type="number"
            min={1}
            max={100}
            value={vcBaselineTarget}
            onChange={e => setVcBaselineTarget(parseInt(e.target.value) || 0)}
            className={inputClass(errors.vcBaselineTarget)}
          />
        </Field>

        <Field label="VC Program Label" error={errors.vcProgramLabel}>
          <input
            type="text"
            value={vcProgramLabel}
            onChange={e => setVcProgramLabel(e.target.value)}
            className={inputClass(errors.vcProgramLabel)}
          />
        </Field>

        <Field label="Commission Goal (monthly)" error={errors.commissionGoal} required>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
            <input
              type="number"
              min={0}
              value={commissionGoal}
              onChange={e => setCommissionGoal(parseFloat(e.target.value) || 0)}
              className={`${inputClass(errors.commissionGoal)} pl-7`}
            />
          </div>
        </Field>

        <Field label="Premium Goal (monthly)" error={errors.premiumGoal} required>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
            <input
              type="number"
              min={0}
              value={premiumGoal}
              onChange={e => setPremiumGoal(parseFloat(e.target.value) || 0)}
              className={`${inputClass(errors.premiumGoal)} pl-7`}
            />
          </div>
        </Field>
      </div>
    </div>
  );
}

// ─── Step 4: Principal Access ─────────────────────────────────────────────────

function StepPrincipal({
  principalEmail, setPrincipalEmail, principalPassword, setPrincipalPassword,
  confirmPassword, setConfirmPassword, showPassword, setShowPassword, errors,
}) {
  return (
    <div>
      <h2 className="text-lg font-bold text-gray-900 mb-1">Principal Access</h2>
      <p className="text-sm text-gray-500 mb-6">
        Create the agent's QuoteSync login credentials.
      </p>

      <div className="grid grid-cols-1 gap-5 max-w-md">
        <Field label="Login Email" error={errors.principalEmail} required>
          <input
            type="email"
            value={principalEmail}
            onChange={e => setPrincipalEmail(e.target.value)}
            placeholder="agent@quotesync.com"
            className={inputClass(errors.principalEmail)}
          />
        </Field>

        <Field label="Temporary Password" error={errors.principalPassword} required>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={principalPassword}
              onChange={e => setPrincipalPassword(e.target.value)}
              placeholder="Min 8 characters"
              className={`${inputClass(errors.principalPassword)} pr-10`}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </Field>

        <Field label="Confirm Password" error={errors.confirmPassword} required>
          <input
            type={showPassword ? 'text' : 'password'}
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            className={inputClass(errors.confirmPassword)}
          />
        </Field>
      </div>

      <div className="mt-5 p-3 bg-amber-50 border border-amber-200 rounded-lg">
        <p className="text-sm text-amber-800">
          The agent will be prompted to change their password on first login.
        </p>
      </div>
    </div>
  );
}

// ─── Shared Components ────────────────────────────────────────────────────────

function Field({ label, children, error, hint, required }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
        {hint && <span className="text-xs text-gray-400 ml-1.5 font-normal">({hint})</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}

function inputClass(error) {
  return `w-full px-3 py-2 rounded-lg border text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
    error ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white'
  }`;
}

export default AdminAgencyOnboardingPage;
