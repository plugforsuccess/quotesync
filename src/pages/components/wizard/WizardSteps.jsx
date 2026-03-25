// src/pages/components/wizard/WizardSteps.jsx
// Individual question step components for the single-question wizard
import { useState, useEffect, useRef } from 'react';
import { CheckCircle, Zap, Shield, Clock, ArrowRight, Star, MapPin, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { isTargetZip as defaultIsTargetZip } from '../../../config/targetZips';
import { formatPhoneInput } from '../../../utils/phoneFormat';
import { useCanopyLauncher } from '../../../hooks/useCanopyLauncher';
import { SESSION_KEYS } from '../../../hooks/useWizard';
import { trackEvent } from '../../../lib/analytics';
import AddressAutocomplete from '../../../components/AddressAutocomplete';
import { TOP_VEHICLE_MAKES, ALL_VEHICLE_MAKES } from '../../../data/vehicleMakes';
import { getModelsForMake } from '../../../data/vehicleModels';

// ─── Shared UI Primitives ──────────────────────────────────────────

function StepHeading({ children }) {
  return (
    <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2 text-center leading-tight">
      {children}
    </h2>
  );
}

// UX-3: Contextual description under each step heading
function StepDescription({ children }) {
  return (
    <p className="text-sm text-gray-500 text-center mb-5 leading-relaxed">
      {children}
    </p>
  );
}

function ChoiceButton({ selected, onClick, children, variant = 'default', className = '' }) {
  const base = 'py-3.5 px-4 rounded-xl border-2 font-semibold text-base transition-all duration-200 text-center cursor-pointer';
  const styles = {
    default: 'border-primary-500 bg-primary-50 text-primary-700 shadow-md',
    warning: 'border-amber-500 bg-amber-50 text-amber-700 shadow-md',
    purple: 'border-purple-500 bg-purple-50 text-purple-700 shadow-md',
  };
  const selectedStyle = styles[variant] || styles.default;
  const unselected = 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${base} ${selected ? selectedStyle : unselected} ${className}`}
    >
      {children}
    </button>
  );
}

function ErrorText({ children }) {
  if (!children) return null;
  return <p className="mt-2 text-sm text-red-600 text-center">{children}</p>;
}

function InputField({ id, label, type = 'text', value, onChange, placeholder, error, maxLength, inputMode, autoFocus, disabled, className = '' }) {
  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="block text-sm font-semibold text-gray-700 mb-1.5">
          {label}
        </label>
      )}
      <input
        id={id}
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        maxLength={maxLength}
        autoFocus={autoFocus}
        disabled={disabled}
        className={`w-full px-4 py-3 rounded-xl border-2 text-base font-medium text-gray-900 placeholder:text-gray-400 bg-white transition-colors focus:outline-none focus:ring-0 ${
          disabled ? 'bg-gray-50 text-gray-500 cursor-not-allowed' : ''
        } ${
          error
            ? 'border-red-400 focus:border-red-500'
            : 'border-gray-200 focus:border-primary-500'
        }`}
      />
      {error && <p className="mt-1.5 text-sm text-red-600">{error}</p>}
    </div>
  );
}

// ─── Step 1: ZIP Code ──────────────────────────────────────────────

// UX-2: ZIP step supports editing when navigating back
export function ZipStep({ value, onChange, onAutoAdvance, isTargetZip: isTargetZipProp, licensedStatesLabel }) {
  const isTargetZip = isTargetZipProp || defaultIsTargetZip;
  const areaLabel = licensedStatesLabel || 'Georgia';
  const navigate = useNavigate();
  const [isValid, setIsValid] = useState(false);
  const [isRejected, setIsRejected] = useState(false);
  const validated = useRef(false);

  // When returning to this step, reset validation state so user can edit
  useEffect(() => {
    if (value.length === 5) {
      // User navigated back — show the ZIP but don't auto-advance
      validated.current = true;
      if (isTargetZip(value)) {
        setIsValid(true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only on mount

  const handleChange = (e) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 5);
    setIsValid(false);
    setIsRejected(false);
    validated.current = false;
    onChange(digits);
  };

  // Validate when 5 digits entered for the FIRST TIME (not on back-nav)
  useEffect(() => {
    if (value.length === 5 && !validated.current) {
      validated.current = true;
      if (!isTargetZip(value)) {
        setIsRejected(true);
        trackEvent('funnel_zip_rejected', { zip: value });
      } else {
        setIsValid(true);
        trackEvent('funnel_zip_validated', { zip: value });
        const timer = setTimeout(() => onAutoAdvance?.(), 400);
        return () => clearTimeout(timer);
      }
    }
  }, [value, onAutoAdvance]);

  // Dead-end screen for non-GA ZIP
  if (isRejected) {
    return (
      <div className="text-center">
        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <XCircle className="w-8 h-8 text-red-400" />
        </div>
        <StepHeading>We don&apos;t serve your area yet</StepHeading>
        <p className="text-gray-600 mb-6 leading-relaxed">
          We&apos;re a licensed {areaLabel} insurance agency and can only offer quotes
          for {areaLabel} residents at this time.
          <br /><br />
          We&apos;re expanding — check back soon!
        </p>
        <div className="flex flex-col gap-3 items-center">
          <button
            type="button"
            onClick={() => {
              onChange('');
              setIsRejected(false);
              validated.current = false;
            }}
            className="text-primary-600 font-semibold hover:text-primary-700 underline underline-offset-2"
          >
            Try a different ZIP code
          </button>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <StepHeading>What&apos;s your ZIP code?</StepHeading>
      <StepDescription>We use this to find discounts specific to your area.</StepDescription>
      <div className="max-w-[200px] mx-auto">
        <input
          type="text"
          inputMode="numeric"
          value={value}
          onChange={handleChange}
          placeholder="30301"
          maxLength={5}
          autoFocus
          className={`w-full px-4 py-4 rounded-xl border-2 text-2xl font-bold text-center text-gray-900 placeholder:text-gray-300 bg-white transition-colors focus:outline-none focus:ring-0 tracking-widest ${
            isValid
              ? 'border-success-400 focus:border-success-500'
              : 'border-gray-200 focus:border-primary-500'
          }`}
        />
      </div>
      {!isValid && value.length < 5 && (
        <p className="mt-3 text-sm text-gray-500 text-center">
          We currently serve {areaLabel} ZIP codes
        </p>
      )}
      {isValid && (
        <p className="mt-3 text-sm text-success-600 text-center font-medium">
          Great, we serve your area!
        </p>
      )}
    </div>
  );
}

// ─── Step 2: Discount Qualifier (replaces OwnsHome + MaritalStatus + VehicleCount) ──

export function DiscountQualifierStep({ ownsHome, maritalStatus, multipleDrivers, multipleVehicles, onOwnsHomeChange, onMaritalStatusChange, onMultipleDriversChange, onMultipleVehiclesChange, onAutoAdvance }) {
  // Auto-advance after the last unanswered question is answered
  const checkAutoAdvance = (nextOwns, nextMarital, nextDrivers, nextVehicles) => {
    if (nextOwns != null && nextMarital != null && nextDrivers != null && nextVehicles != null) {
      setTimeout(() => onAutoAdvance?.(), 300);
    }
  };

  return (
    <div>
      <h2 className="font-black text-gray-900 text-2xl sm:text-3xl mb-6 text-center leading-tight">
        Let&apos;s find you potential discounts.
      </h2>
      <div className="space-y-5 max-w-sm mx-auto">
        {/* Own home */}
        <div>
          <h5 className="font-bold text-gray-800 text-lg mb-2 text-center">Do you own your home?</h5>
          <div className="grid grid-cols-2 gap-3">
            <ChoiceButton selected={ownsHome === true} onClick={() => { onOwnsHomeChange(true); checkAutoAdvance(true, maritalStatus, multipleDrivers, multipleVehicles); }} className="w-full">YES</ChoiceButton>
            <ChoiceButton selected={ownsHome === false} onClick={() => { onOwnsHomeChange(false); checkAutoAdvance(false, maritalStatus, multipleDrivers, multipleVehicles); }} className="w-full">NO</ChoiceButton>
          </div>
        </div>
        {/* Married */}
        <div>
          <h5 className="font-bold text-gray-800 text-lg mb-2 text-center">Are you married?</h5>
          <div className="grid grid-cols-2 gap-3">
            <ChoiceButton selected={maritalStatus === 'married'} onClick={() => { onMaritalStatusChange('married'); checkAutoAdvance(ownsHome, 'married', multipleDrivers, multipleVehicles); }} className="w-full">YES</ChoiceButton>
            <ChoiceButton selected={maritalStatus === 'single'} onClick={() => { onMaritalStatusChange('single'); checkAutoAdvance(ownsHome, 'single', multipleDrivers, multipleVehicles); }} className="w-full">NO</ChoiceButton>
          </div>
        </div>
        {/* Multiple drivers */}
        <div>
          <h5 className="font-bold text-gray-800 text-lg mb-2 text-center">Multiple drivers in your household?</h5>
          <div className="grid grid-cols-2 gap-3">
            <ChoiceButton selected={multipleDrivers === true} onClick={() => { onMultipleDriversChange(true); checkAutoAdvance(ownsHome, maritalStatus, true, multipleVehicles); }} className="w-full">YES</ChoiceButton>
            <ChoiceButton selected={multipleDrivers === false} onClick={() => { onMultipleDriversChange(false); checkAutoAdvance(ownsHome, maritalStatus, false, multipleVehicles); }} className="w-full">NO</ChoiceButton>
          </div>
        </div>
        {/* Multiple vehicles */}
        <div>
          <h5 className="font-bold text-gray-800 text-lg mb-2 text-center">Multiple vehicles in your household?</h5>
          <div className="grid grid-cols-2 gap-3">
            <ChoiceButton selected={multipleVehicles === true} onClick={() => { onMultipleVehiclesChange(true); checkAutoAdvance(ownsHome, maritalStatus, multipleDrivers, true); }} className="w-full">YES</ChoiceButton>
            <ChoiceButton selected={multipleVehicles === false} onClick={() => { onMultipleVehiclesChange(false); checkAutoAdvance(ownsHome, maritalStatus, multipleDrivers, false); }} className="w-full">NO</ChoiceButton>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Step 2b: Veteran Status ───────────────────────────────────────

export function VeteranStatusStep({ value, onChange, onAutoAdvance }) {
  const handleSelect = (val) => {
    onChange(val);
    setTimeout(() => onAutoAdvance?.(), 300);
  };

  return (
    <div>
      <StepHeading>Are you or anyone in your household an active military member or veteran?</StepHeading>
      <StepDescription>This may qualify you for additional discounts.</StepDescription>
      <div className="grid grid-cols-2 gap-3 max-w-xs mx-auto">
        <ChoiceButton selected={value === 'yes'} onClick={() => handleSelect('yes')}>Yes</ChoiceButton>
        <ChoiceButton selected={value === 'no'} onClick={() => handleSelect('no')}>No</ChoiceButton>
      </div>
    </div>
  );
}

// ─── Step 3: Product Intent ────────────────────────────────────────

export function ProductIntentStep({ value, onChange, options, onAutoAdvance, isRenter }) {
  const handleSelect = (val) => {
    onChange(val);
    setTimeout(() => onAutoAdvance?.(), 300);
  };

  return (
    <div>
      <StepHeading>What are you looking to insure?</StepHeading>
      <StepDescription>
        {isRenter
          ? "We'll find you the best rate for your situation."
          : 'Bundling auto + home typically saves the most.'}
      </StepDescription>
      <div className="grid grid-cols-2 gap-3 max-w-sm mx-auto">
        {options.map((opt) => (
          <ChoiceButton
            key={opt.value}
            selected={value === opt.value}
            onClick={() => handleSelect(opt.value)}
          >
            <span className="block text-lg mb-0.5">{opt.emoji}</span>
            {opt.label}
          </ChoiceButton>
        ))}
      </div>
    </div>
  );
}

// ─── Step 4: Early Phone Capture ──────────────────────────────────

export function EarlyPhoneStep({ value, onChange, onSkip }) {
  const handlePhoneChange = (e) => {
    onChange(formatPhoneInput(e.target.value));
  };

  return (
    <div>
      <StepHeading>What&apos;s your phone number?</StepHeading>
      <StepDescription>
        We&apos;ll text you a link to your quote — no spam, just results.
      </StepDescription>
      <div className="max-w-[280px] mx-auto">
        <input
          type="tel"
          inputMode="numeric"
          value={value}
          onChange={handlePhoneChange}
          placeholder="(555) 123-4567"
          maxLength={14}
          autoFocus
          className="w-full px-4 py-4 rounded-xl border-2 text-xl font-bold text-center text-gray-900 placeholder:text-gray-300 bg-white transition-colors focus:outline-none focus:ring-0 tracking-wide border-gray-200 focus:border-primary-500"
        />
      </div>
      <p className="mt-4 text-xs text-gray-400 text-center leading-relaxed max-w-sm mx-auto">
        By entering your number, you agree to receive a text with your quote
        status. Msg &amp; data rates may apply. Reply STOP to opt out.
      </p>
      <div className="mt-4 text-center">
        <button
          type="button"
          onClick={onSkip}
          className="text-sm text-primary-500 hover:text-primary-600 font-medium transition-colors bg-transparent border-0 cursor-pointer"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}

// ─── Carrier Data ──────────────────────────────────────────────────

export const AUTO_TOP_CARRIERS = [
  { value: 'state_farm',  label: 'State Farm',     logo: '/logos/state-farm.svg' },
  { value: 'geico',       label: 'GEICO',          logo: '/logos/geico.svg' },
  { value: 'progressive', label: 'Progressive',    logo: '/logos/progressive.svg' },
  { value: 'allstate',    label: 'Allstate',       logo: '/logos/allstate.svg' },
  { value: 'farmers',     label: 'Farmers',        logo: '/logos/farmers.svg' },
  { value: 'usaa',        label: 'USAA',           logo: '/logos/usaa.svg' },
  { value: 'liberty',     label: 'Liberty Mutual', logo: '/logos/liberty.svg' },
  { value: 'nationwide',  label: 'Nationwide',     logo: '/logos/nationwide.svg' },
  { value: 'farm_bureau', label: 'GA Farm Bureau', logo: '/logos/farm-bureau.svg' },
  { value: 'travelers',   label: 'Travelers',      logo: '/logos/travelers.svg' },
];

export const AUTO_SECOND_TIER = [
  'AAA', 'Bristol West', 'Dairyland', 'Elephant', 'Esurance',
  'Gainsco', 'Infinity', 'Kemper', 'Mercury', 'MetLife',
  'National General', 'Safeco', 'Safe Auto', 'The General',
  '21st Century', 'Affirmative', 'Clearcover', 'Lemonade Auto', 'Root', 'Mile Auto',
];

export const HOME_TOP_CARRIERS = [
  { value: 'state_farm',  label: 'State Farm',     logo: '/logos/state-farm.svg' },
  { value: 'allstate',    label: 'Allstate',       logo: '/logos/allstate.svg' },
  { value: 'liberty',     label: 'Liberty Mutual', logo: '/logos/liberty.svg' },
  { value: 'farmers',     label: 'Farmers',        logo: '/logos/farmers.svg' },
  { value: 'usaa',        label: 'USAA',           logo: '/logos/usaa.svg' },
  { value: 'nationwide',  label: 'Nationwide',     logo: '/logos/nationwide.svg' },
  { value: 'travelers',   label: 'Travelers',      logo: '/logos/travelers.svg' },
  { value: 'farm_bureau', label: 'GA Farm Bureau', logo: '/logos/farm-bureau.svg' },
];

export const HOME_SECOND_TIER = [
  'Amica', 'ASI', 'Chubb', 'Cincinnati', 'CSAA', 'Encompass',
  'Kin', 'Openly', 'Hippo', 'Lemonade Home', 'Universal Property', 'Heritage',
];

export const RENTERS_TOP_CARRIERS = [
  { value: 'state_farm',  label: 'State Farm',     logo: '/logos/state-farm.svg' },
  { value: 'allstate',    label: 'Allstate',       logo: '/logos/allstate.svg' },
  { value: 'progressive', label: 'Progressive',    logo: '/logos/progressive.svg' },
  { value: 'geico',       label: 'GEICO',          logo: '/logos/geico.svg' },
  { value: 'liberty',     label: 'Liberty Mutual', logo: '/logos/liberty.svg' },
  { value: 'lemonade',    label: 'Lemonade',       logo: '/logos/lemonade.svg' },
  { value: 'nationwide',  label: 'Nationwide',     logo: '/logos/nationwide.svg' },
];

export const RENTERS_SECOND_TIER = ['CSAA', 'Hippo', 'Jetty', 'Assurant', 'Toggle', 'Other'];

// ─── Carrier Selection Step (logo cards + dropdown) ────────────────

function CarrierLogoCard({ carrier, selected, onClick }) {
  const [imgFailed, setImgFailed] = useState(false);
  const isAllstate = carrier.value === 'allstate';
  const borderColor = selected
    ? isAllstate ? 'border-purple-500 bg-purple-50' : 'border-primary-500 bg-primary-50'
    : 'border-gray-200 hover:border-gray-300';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 bg-white transition-all duration-200 cursor-pointer ${borderColor}`}
    >
      <div className="h-10 flex items-center justify-center mb-1.5">
        {!imgFailed ? (
          <img
            src={carrier.logo}
            alt={carrier.label}
            className="max-h-10 max-w-full object-contain"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <span className={`text-xs font-bold px-2 py-1 rounded ${
            isAllstate && selected ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-700'
          }`}>
            {carrier.label}
          </span>
        )}
      </div>
      <span className={`text-xs font-semibold uppercase tracking-wide ${
        selected
          ? isAllstate ? 'text-purple-700' : 'text-primary-700'
          : 'text-gray-600'
      }`}>
        {carrier.label}
      </span>
    </button>
  );
}

export function CarrierSelectionStep({ heading, topCarriers, secondTierLabels, value, onChange, onAutoAdvance }) {
  const handleCardSelect = (val) => {
    onChange(val);
    setTimeout(() => onAutoAdvance?.(), 300);
  };

  const handleDropdownChange = (e) => {
    const val = e.target.value;
    if (val) {
      onChange(val);
      setTimeout(() => onAutoAdvance?.(), 300);
    }
  };

  // Build dropdown value: if current value is a top carrier, show it; otherwise show the second-tier value
  const isTopCarrier = topCarriers.some(c => c.value === value);
  const dropdownValue = isTopCarrier ? '' : (value || '');

  // All second tier + None
  const dropdownOptions = [
    ...secondTierLabels.map(label => ({ value: label.toLowerCase().replace(/\s+/g, '_'), label })),
    { value: 'none', label: 'None' },
  ];

  return (
    <div>
      <StepHeading>{heading}</StepHeading>
      <StepDescription>This helps us compare apples to apples.</StepDescription>

      {/* Logo card grid */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 mb-4">
        {topCarriers.map((carrier) => (
          <CarrierLogoCard
            key={carrier.value}
            carrier={carrier}
            selected={value === carrier.value}
            onClick={() => handleCardSelect(carrier.value)}
          />
        ))}
      </div>

      {/* Divider */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 h-px bg-gray-200"></div>
        <span className="text-xs text-gray-400 font-medium">or select a carrier below</span>
        <div className="flex-1 h-px bg-gray-200"></div>
      </div>

      {/* Dropdown */}
      <select
        value={dropdownValue}
        onChange={handleDropdownChange}
        className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 text-base font-medium text-gray-900 bg-white transition-colors focus:outline-none focus:ring-0 focus:border-primary-500 cursor-pointer"
      >
        <option value="">Other carrier...</option>
        {dropdownOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}

// ─── Premium Steps ─────────────────────────────────────────────────

export function CurrentAutoPremiumStep({ value, onChange, onSkip }) {
  const [display, setDisplay] = useState(() => value != null ? value.toLocaleString() : '');
  const [hint, setHint] = useState(null);

  const handleChange = (e) => {
    const raw = e.target.value.replace(/[^0-9]/g, '');
    const num = raw ? parseInt(raw, 10) : null;
    if (num !== null && num > 99999) {
      setHint('Please enter your annual premium.');
      return;
    }
    setHint(null);
    setDisplay(num != null ? num.toLocaleString() : '');
    onChange(num);
  };

  return (
    <div>
      <StepHeading>What are you currently paying for auto insurance?</StepHeading>
      <StepDescription>Per year is fine — your best estimate works.</StepDescription>
      <div className="max-w-[240px] mx-auto">
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-bold text-gray-400">$</span>
          <input
            type="text"
            inputMode="numeric"
            value={display}
            onChange={handleChange}
            placeholder="1,200"
            autoFocus
            className="w-full pl-10 pr-4 py-4 rounded-xl border-2 text-xl font-bold text-center text-gray-900 placeholder:text-gray-300 bg-white transition-colors focus:outline-none focus:ring-0 border-gray-200 focus:border-primary-500"
          />
        </div>
        {hint && <p className="mt-2 text-sm text-amber-600 text-center">{hint}</p>}
      </div>
      <div className="mt-4 text-center">
        <button
          type="button"
          onClick={onSkip}
          className="text-sm text-gray-500 hover:text-gray-700 font-medium transition-colors bg-transparent border-0 cursor-pointer px-4 py-2 rounded-lg hover:bg-gray-100"
        >
          Not sure
        </button>
      </div>
    </div>
  );
}

export function CurrentHomePremiumStep({ value, onChange, onSkip }) {
  const [display, setDisplay] = useState(() => value != null ? value.toLocaleString() : '');
  const [hint, setHint] = useState(null);

  const handleChange = (e) => {
    const raw = e.target.value.replace(/[^0-9]/g, '');
    const num = raw ? parseInt(raw, 10) : null;
    if (num !== null && num > 99999) {
      setHint('Please enter your annual premium.');
      return;
    }
    setHint(null);
    setDisplay(num != null ? num.toLocaleString() : '');
    onChange(num);
  };

  return (
    <div>
      <StepHeading>What are you currently paying for home insurance?</StepHeading>
      <StepDescription>Annual premium — check your dec page if you&apos;re not sure.</StepDescription>
      <div className="max-w-[240px] mx-auto">
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-bold text-gray-400">$</span>
          <input
            type="text"
            inputMode="numeric"
            value={display}
            onChange={handleChange}
            placeholder="1,200"
            autoFocus
            className="w-full pl-10 pr-4 py-4 rounded-xl border-2 text-xl font-bold text-center text-gray-900 placeholder:text-gray-300 bg-white transition-colors focus:outline-none focus:ring-0 border-gray-200 focus:border-primary-500"
          />
        </div>
        {hint && <p className="mt-2 text-sm text-amber-600 text-center">{hint}</p>}
      </div>
      <div className="mt-4 text-center">
        <button
          type="button"
          onClick={onSkip}
          className="text-sm text-gray-500 hover:text-gray-700 font-medium transition-colors bg-transparent border-0 cursor-pointer px-4 py-2 rounded-lg hover:bg-gray-100"
        >
          Not sure
        </button>
      </div>
    </div>
  );
}

// ─── Coverage Lapse Step ───────────────────────────────────────────

const COVERAGE_LAPSE_OPTIONS = [
  { value: 'no_lapse', label: 'No lapse — currently insured' },
  { value: 'under_30', label: 'Less than 30 days' },
  { value: '30_to_90', label: '30 – 90 days' },
  { value: 'over_90', label: 'Over 90 days' },
  { value: 'never_insured', label: 'Never been insured' },
];

export function CoverageLapseStep({ value, onChange, onAutoAdvance }) {
  const handleSelect = (val) => {
    onChange(val);
    setTimeout(() => onAutoAdvance?.(), 300);
  };

  return (
    <div>
      <StepHeading>How long has it been since you were last insured?</StepHeading>
      <StepDescription>Continuous coverage often qualifies for better rates.</StepDescription>
      <div className="flex flex-col gap-3 max-w-sm mx-auto">
        {COVERAGE_LAPSE_OPTIONS.map((opt) => (
          <ChoiceButton
            key={opt.value}
            selected={value === opt.value}
            onClick={() => handleSelect(opt.value)}
          >
            {opt.label}
          </ChoiceButton>
        ))}
      </div>
    </div>
  );
}

// ─── Vehicle Year Step ─────────────────────────────────────────────

export function VehicleYearStep({ value, onChange, onAutoAdvance }) {
  const currentYear = new Date().getFullYear();
  const gridYears = Array.from({ length: currentYear + 2 - 1998 }, (_, i) => currentYear + 1 - i);
  const [showOlderDropdown, setShowOlderDropdown] = useState(false);
  const olderYears = Array.from({ length: 1997 - 1960 + 1 }, (_, i) => 1997 - i);

  const handleSelect = (year) => {
    onChange(year);
    setTimeout(() => onAutoAdvance?.(), 300);
  };

  const handleDropdownChange = (e) => {
    const year = parseInt(e.target.value, 10);
    if (year) {
      handleSelect(year);
    }
  };

  return (
    <div>
      <StepHeading>Choose your vehicle year</StepHeading>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-4">
        {gridYears.map((year) => (
          <button
            key={year}
            type="button"
            onClick={() => handleSelect(year)}
            className={`py-2.5 px-2 rounded-xl border-2 font-semibold text-sm transition-all duration-200 text-center cursor-pointer ${
              value === year
                ? 'border-primary-500 bg-primary-50 text-primary-700 shadow-md'
                : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50 bg-white shadow-sm'
            }`}
          >
            {year}
          </button>
        ))}
      </div>
      {!showOlderDropdown ? (
        <button
          type="button"
          onClick={() => setShowOlderDropdown(true)}
          className="w-full text-sm text-primary-600 hover:text-primary-700 font-medium py-2"
        >
          Enter other year
        </button>
      ) : (
        <select
          value={value && value < 1998 ? value : ''}
          onChange={handleDropdownChange}
          className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 text-base font-medium text-gray-900 bg-white transition-colors focus:outline-none focus:ring-0 focus:border-primary-500 cursor-pointer"
        >
          <option value="">Select year...</option>
          {olderYears.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      )}
    </div>
  );
}

// ─── Vehicle Make Step ─────────────────────────────────────────────

function VehicleMakeLogoCard({ make, selected, onClick }) {
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 bg-white transition-all duration-200 cursor-pointer ${
        selected
          ? 'border-primary-500 bg-primary-50'
          : 'border-gray-200 hover:border-gray-300'
      }`}
    >
      <div className="h-10 flex items-center justify-center mb-1.5">
        {!imgFailed ? (
          <img
            src={make.logo}
            alt={make.label}
            className="max-h-10 max-w-full object-contain"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <span className="text-xs font-bold px-2 py-1 rounded bg-gray-100 text-gray-700">
            {make.label}
          </span>
        )}
      </div>
      <span className={`text-xs font-semibold uppercase tracking-wide ${
        selected ? 'text-primary-700' : 'text-gray-600'
      }`}>
        {make.label}
      </span>
    </button>
  );
}

export function VehicleMakeStep({ value, onChange, onAutoAdvance }) {
  const handleCardSelect = (val) => {
    onChange(val);
    setTimeout(() => onAutoAdvance?.(), 300);
  };

  const handleDropdownChange = (e) => {
    const val = e.target.value;
    if (val) {
      onChange(val);
      setTimeout(() => onAutoAdvance?.(), 300);
    }
  };

  // Map top makes to their value for dropdown matching
  const topMakeValues = TOP_VEHICLE_MAKES.map(m => m.value);
  const isTopMake = topMakeValues.includes(value);
  const dropdownValue = isTopMake ? '' : (value || '');

  return (
    <div>
      <StepHeading>Choose your vehicle make</StepHeading>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 mb-4">
        {TOP_VEHICLE_MAKES.map((make) => (
          <VehicleMakeLogoCard
            key={make.value}
            make={make}
            selected={value === make.value}
            onClick={() => handleCardSelect(make.value)}
          />
        ))}
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 h-px bg-gray-200"></div>
        <span className="text-xs text-gray-400 font-medium">or select below</span>
        <div className="flex-1 h-px bg-gray-200"></div>
      </div>

      <select
        value={dropdownValue}
        onChange={handleDropdownChange}
        className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 text-base font-medium text-gray-900 bg-white transition-colors focus:outline-none focus:ring-0 focus:border-primary-500 cursor-pointer"
      >
        <option value="">Other make...</option>
        {ALL_VEHICLE_MAKES.map((name) => (
          <option key={name} value={name.toLowerCase().replace(/[\s-]+/g, '_')}>{name}</option>
        ))}
      </select>
    </div>
  );
}

// ─── Vehicle Model Step ────────────────────────────────────────────

export function VehicleModelStep({ make, value, onChange, onAutoAdvance }) {
  const models = getModelsForMake(make);

  const handleSelect = (model) => {
    onChange(model);
    setTimeout(() => onAutoAdvance?.(), 300);
  };

  return (
    <div>
      <StepHeading>Choose your vehicle model</StepHeading>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-w-md mx-auto">
        {models.map((model) => (
          <ChoiceButton
            key={model}
            selected={value === model}
            onClick={() => handleSelect(model)}
            className="text-sm"
          >
            {model.toUpperCase()}
          </ChoiceButton>
        ))}
        <ChoiceButton
          selected={value === 'Other'}
          onClick={() => handleSelect('Other')}
          className="text-sm"
        >
          OTHER
        </ChoiceButton>
      </div>
    </div>
  );
}

// ─── Vehicle Use Step ──────────────────────────────────────────────

const VEHICLE_USE_OPTIONS = [
  { value: 'commuting',  label: 'COMMUTING',           description: 'Driving yourself or a family member to work or school daily.' },
  { value: 'pleasure',   label: 'PLEASURE',             description: 'Personal driving not related to work or business activities.' },
  { value: 'business',   label: 'BUSINESS',             description: 'Driving related to job duties, excluding commercial use.' },
  { value: 'commercial', label: 'COMMERCIAL',           description: 'Transporting goods, passengers, equipment, or visiting job sites.' },
  { value: 'farming',    label: 'FARMING',              description: 'Vehicle used in agricultural operations on or around farm property.' },
  { value: 'rideshare',  label: 'RIDESHARE & DELIVERY', description: 'App-based transportation like Uber/Lyft, DoorDash, Amazon Delivery.' },
];

export function VehicleUseStep({ vehicleLabel, value, onChange }) {
  const toggleUse = (use) => {
    const current = value || [];
    if (current.includes(use)) {
      onChange(current.filter(u => u !== use));
    } else {
      onChange([...current, use]);
    }
  };

  return (
    <div>
      <StepHeading>What do you use your {vehicleLabel || 'vehicle'} for?</StepHeading>
      <StepDescription>Select all that apply</StepDescription>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg mx-auto">
        {VEHICLE_USE_OPTIONS.map((opt) => {
          const isSelected = value?.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggleUse(opt.value)}
              className={`relative text-left p-4 rounded-xl border-2 transition-all duration-200 cursor-pointer ${
                isSelected
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-gray-200 hover:border-gray-300 bg-white'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`flex-shrink-0 w-5 h-5 mt-0.5 rounded border-2 flex items-center justify-center ${
                  isSelected ? 'border-primary-500 bg-primary-500' : 'border-gray-300'
                }`}>
                  {isSelected && (
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
                <div>
                  <p className={`font-bold text-sm ${isSelected ? 'text-primary-700' : 'text-gray-800'}`}>
                    {opt.label}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{opt.description}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Step 5a: Driving Record ───────────────────────────────────────

export function AutoDrivingRecordStep({ value, onChange, onAutoAdvance }) {
  const handleSelect = (val) => {
    onChange(val);
    setTimeout(() => onAutoAdvance?.(), 300);
  };

  return (
    <div>
      <StepHeading>Any accidents or tickets in the last 3 years?</StepHeading>
      <StepDescription>Please answer accurately — this affects your quote.</StepDescription>
      <div className="grid grid-cols-3 gap-3 max-w-sm mx-auto">
        {[
          { label: 'None', value: 'clean' },
          { label: '1\u20132', value: '1-2' },
          { label: '3+', value: '3+' },
        ].map((opt) => (
          <ChoiceButton
            key={opt.value}
            selected={value === opt.value}
            variant={value === opt.value && opt.value === '3+' ? 'warning' : 'default'}
            onClick={() => handleSelect(opt.value)}
          >
            {opt.label}
          </ChoiceButton>
        ))}
      </div>
    </div>
  );
}

// ─── Step 5b: Home Claims History ──────────────────────────────────

export function HomeClaimsHistoryStep({ value, onChange, onAutoAdvance }) {
  const handleSelect = (val) => {
    onChange(val);
    setTimeout(() => onAutoAdvance?.(), 300);
  };

  return (
    <div>
      <StepHeading>More than 1 home insurance claim in the last 5 years?</StepHeading>
      <StepDescription>Please answer accurately — this affects your quote.</StepDescription>
      <div className="grid grid-cols-2 gap-4 max-w-xs mx-auto">
        {[
          { label: 'No', value: '0-1' },
          { label: 'Yes', value: '2+' },
        ].map((opt) => (
          <ChoiceButton
            key={opt.value}
            selected={value === opt.value}
            variant={value === opt.value && opt.value === '2+' ? 'warning' : 'default'}
            onClick={() => handleSelect(opt.value)}
          >
            {opt.label}
          </ChoiceButton>
        ))}
      </div>
    </div>
  );
}

// VehicleCountStep and MaritalStatusStep removed — replaced by DiscountQualifierStep

// ─── Step 8: Date of Birth ─────────────────────────────────────────

/**
 * Format DOB input as user types: MM/DD/YYYY
 */
function formatDobInput(raw) {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length === 0) return '';
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/**
 * Convert MM/DD/YYYY display string to ISO date (YYYY-MM-DD) for storage.
 */
function dobDisplayToIso(display) {
  const digits = display.replace(/\D/g, '');
  if (digits.length !== 8) return '';
  const mm = digits.slice(0, 2);
  const dd = digits.slice(2, 4);
  const yyyy = digits.slice(4, 8);
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Convert ISO date (YYYY-MM-DD) to MM/DD/YYYY display string.
 */
function isoToDobDisplay(iso) {
  if (!iso || iso.length !== 10) return '';
  const [yyyy, mm, dd] = iso.split('-');
  return `${mm}/${dd}/${yyyy}`;
}

// H-3: DOB does NOT auto-advance — requires "Continue" button
export function DobStep({ value, onChange }) {
  // value is stored as ISO (YYYY-MM-DD), display as MM/DD/YYYY
  const [display, setDisplay] = useState(() => isoToDobDisplay(value));

  const handleChange = (e) => {
    const formatted = formatDobInput(e.target.value);
    setDisplay(formatted);
    // When we have a complete date, store as ISO
    const digits = formatted.replace(/\D/g, '');
    if (digits.length === 8) {
      const iso = dobDisplayToIso(formatted);
      onChange(iso);
    } else {
      onChange('');
    }
  };

  return (
    <div>
      <StepHeading>What is your date of birth?</StepHeading>
      <StepDescription>Required to generate an accurate quote.</StepDescription>
      <div className="max-w-[200px] mx-auto">
        <input
          type="text"
          inputMode="numeric"
          value={display}
          onChange={handleChange}
          placeholder="MM/DD/YYYY"
          maxLength={10}
          autoFocus
          className="w-full px-4 py-4 rounded-xl border-2 text-xl font-bold text-center text-gray-900 placeholder:text-gray-300 bg-white transition-colors focus:outline-none focus:ring-0 tracking-wide border-gray-200 focus:border-primary-500"
        />
      </div>
    </div>
  );
}

// ─── Step 9: Street Address (with Google Places Autocomplete) ─────

export function AddressStep({ street, apt, city, zip, stateCode, onStreetChange, onAptChange, onCityChange, onZipCorrected, onAddressSourceChange, onLatLngChange }) {
  const [manualMode, setManualMode] = useState(false);
  const [zipMismatch, setZipMismatch] = useState(null);

  const handleSelect = ({ address, lat, lng }) => {
    onStreetChange(address.street1);
    onCityChange(address.city);
    onAddressSourceChange?.('google_autocomplete');

    // Forward lat/lng for downstream use (lead routing, etc.)
    if (lat != null && lng != null) {
      onLatLngChange?.({ lat, lng });
    }

    // Check for ZIP mismatch between Step 1 and the autocomplete result
    if (address.zip && address.zip !== zip) {
      setZipMismatch({ original: zip, corrected: address.zip });
      onZipCorrected?.(address.zip);
    } else {
      setZipMismatch(null);
    }
  };

  // Auto-fallback to manual entry if Places fails to load (CSP, network, adblock)
  const handleLoadFailure = () => {
    setManualMode(true);
    onAddressSourceChange?.('manual_entry');
  };

  const handleSwitchToManual = () => {
    setManualMode(true);
    onAddressSourceChange?.('manual_entry');
  };

  const inputClasses = 'w-full px-4 py-3 rounded-xl border-2 text-base font-medium text-gray-900 placeholder:text-gray-400 bg-white transition-colors focus:outline-none focus:ring-0 border-gray-200 focus:border-primary-500';
  const readOnlyClasses = 'w-full px-4 py-3 rounded-xl border-2 border-gray-200 text-base font-medium text-gray-500 bg-gray-50';

  return (
    <div>
      <StepHeading>What is your home address?</StepHeading>
      <StepDescription>Used to calculate your exact rate — never shared.</StepDescription>
      <div className="space-y-4 max-w-sm mx-auto">
        <div>
          <label htmlFor={manualMode ? 'street' : undefined} className="block text-sm font-semibold text-gray-700 mb-1.5">
            Street Address
          </label>
          {!manualMode ? (
            <AddressAutocomplete
              apiKey={import.meta.env.VITE_GOOGLE_PLACES_API_KEY}
              regionCodes={['us']}
              onSelect={handleSelect}
              onLoadFailure={handleLoadFailure}
            />
          ) : (
            <input
              id="street"
              type="text"
              value={street}
              onChange={(e) => onStreetChange(e.target.value)}
              placeholder="123 Main Street"
              autoFocus
              className={inputClasses}
            />
          )}
        </div>

        <InputField
          id="apt"
          label="Apt / Unit (optional)"
          value={apt}
          onChange={(e) => onAptChange(e.target.value)}
          placeholder="Apt 4B"
        />

        <div className="grid grid-cols-3 gap-3">
          {manualMode ? (
            <InputField
              id="city"
              label="City"
              value={city}
              onChange={(e) => onCityChange(e.target.value)}
              placeholder="Atlanta"
            />
          ) : (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">City</label>
              <div className={readOnlyClasses}>
                {city || <span className="text-gray-400">—</span>}
              </div>
            </div>
          )}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">State</label>
            <div className={readOnlyClasses}>{stateCode || 'GA'}</div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">ZIP</label>
            <div className={readOnlyClasses}>{zip}</div>
          </div>
        </div>

        {/* ZIP mismatch notice */}
        {zipMismatch && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
            <p className="text-sm text-amber-800">
              The ZIP code for this address is <span className="font-semibold">{zipMismatch.corrected}</span>,
              but you entered <span className="font-semibold">{zipMismatch.original}</span> earlier.
              We&apos;ll use the address ZIP for your quote.
            </p>
          </div>
        )}

        {/* Manual fallback toggle */}
        {!manualMode ? (
          <button
            type="button"
            onClick={handleSwitchToManual}
            className="text-sm text-primary-600 hover:underline"
          >
            Can&apos;t find your address? Enter it manually
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setManualMode(false)}
            className="text-sm text-primary-600 hover:underline"
          >
            Search for your address instead
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Step 10: Contact Information ───────────────────────────────────

export function ContactStep({ firstName, lastName, phone, email, onFirstNameChange, onLastNameChange, onPhoneChange, onEmailChange, errors, agentName, brandName }) {
  const handlePhoneChange = (e) => {
    onPhoneChange(formatPhoneInput(e.target.value));
  };

  return (
    <div>
      <StepHeading>Where should we send your personalized quote?</StepHeading>
      <StepDescription>{agentName || 'Your agent'} will personally review your info within minutes.</StepDescription>
      <div className="space-y-4 max-w-sm mx-auto">
        <div className="grid grid-cols-2 gap-3">
          <InputField
            id="firstName"
            label="First Name"
            value={firstName}
            onChange={(e) => onFirstNameChange(e.target.value)}
            placeholder="First name"
            error={errors?.firstName}
            autoFocus
          />
          <InputField
            id="lastName"
            label="Last Name"
            value={lastName}
            onChange={(e) => onLastNameChange(e.target.value)}
            placeholder="Last name"
            error={errors?.lastName}
          />
        </div>
        <InputField
          id="phone"
          label="Phone"
          type="tel"
          value={phone}
          onChange={handlePhoneChange}
          placeholder="(555) 123-4567"
          error={errors?.phone}
          maxLength={14}
        />
        <InputField
          id="email"
          label="Email"
          type="email"
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
          placeholder="you@example.com"
          error={errors?.email}
        />
        <p className="text-xs text-gray-500 leading-relaxed">
          By clicking &apos;Get My Free Quote&apos;, you agree to be contacted by {brandName || 'our agency'} regarding insurance quotes via phone, SMS, and email at the number provided,
          including through automated technology. Consent is not a condition of purchase. Msg
          &amp; data rates may apply. Reply STOP to opt out at any time.
        </p>
      </div>
    </div>
  );
}

// ─── Step 11: Confirmation ─────────────────────────────────────────

const getSavingsEstimate = (ownsHome, vehicleCount, productIntent) => {
  if (productIntent === 'bundle' || (ownsHome && productIntent !== 'auto' && productIntent !== 'home')) {
    if (vehicleCount >= 2) {
      return { range: '$400 – $1,200/year', message: 'Bundle savings available! Most homeowners with 2+ cars save big.' };
    }
    return { range: '$300 – $800/year', message: 'Homeowners qualify for exclusive bundle discounts.' };
  }
  if (productIntent === 'home') {
    return { range: '$200 – $500/year', message: 'Homeowner savings are waiting for you.' };
  }
  // UX-4: auto_renters savings estimate
  if (productIntent === 'auto_renters') {
    if (vehicleCount >= 2) {
      return { range: '$200 – $500/year', message: 'Multi-car + renters discounts add up.' };
    }
    return { range: '$100 – $350/year', message: "Let's find you the best auto + renters rate." };
  }
  if (vehicleCount >= 2) {
    return { range: '$200 – $600/year', message: 'Multi-car discounts add up fast.' };
  }
  return { range: '$150 – $500/year', message: "Let's find you a better rate." };
};

export function ConfirmationStep({ answers, agentName, brandName }) {
  const { launchCanopy } = useCanopyLauncher();
  const savings = getSavingsEstimate(answers.ownsHome, answers.vehicleCount, answers.productIntent);

  // H-2: Clear PII from sessionStorage once confirmation renders
  // (data is already in React state and submitted to server)
  useEffect(() => {
    Object.values(SESSION_KEYS).forEach((key) => sessionStorage.removeItem(key));
  }, []);

  const handleCanopyClick = () => {
    trackEvent('canopy_upsell_clicked', { page: 'wizard_confirmation' });
    launchCanopy('wizard_confirmation');
  };

  return (
    <div className="space-y-6">
      {/* Success header */}
      <div className="text-center">
        <div className="w-16 h-16 bg-gradient-to-br from-success-400 to-success-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg animate-bounce">
          <CheckCircle className="w-10 h-10 text-white" />
        </div>
        <h2 className="text-2xl sm:text-3xl font-black text-gray-900 mb-2 leading-tight">
          You&apos;re All Set!
        </h2>
        <p className="text-gray-600">
          {agentName || 'Your agent'} will reach out within the next few minutes to walk you through your options.
        </p>
      </div>

      {/* Savings estimate */}
      <div className="bg-success-50 border border-success-200 rounded-xl p-5 text-center">
        <p className="text-sm text-gray-600 mb-2">
          Based on your info, {answers.ownsHome === true ? 'homeowners' : 'renters'} in{' '}
          <span className="font-semibold text-gray-900">{answers.zip}</span> typically save:
        </p>
        <p className="text-3xl font-black bg-gradient-to-r from-success-600 to-success-700 bg-clip-text text-transparent mb-2">
          {savings.range}
        </p>
        <div className="flex items-center justify-center gap-2 text-sm text-success-700">
          <CheckCircle className="w-4 h-4 flex-shrink-0" />
          <span className="font-medium">{savings.message}</span>
        </div>
      </div>

      {/* Canopy upsell */}
      <div className="bg-gradient-to-br from-accent-50 to-white border border-accent-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="w-5 h-5 text-accent-500" />
          <h3 className="font-bold text-gray-900">
            Want Your Exact Savings — Not Just a Range?
          </h3>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          Sync your current policy and {agentName || 'your agent'} can have your comparison ready before the call.
        </p>
        <div className="space-y-2 mb-4">
          {[
            { icon: Clock, text: 'Takes 60 seconds' },
            { icon: Shield, text: 'Bank-level security' },
            { icon: CheckCircle, text: 'No forms to fill out' },
          // eslint-disable-next-line no-unused-vars
          ].map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-center gap-2">
              <Icon className="w-4 h-4 text-success-500 flex-shrink-0" />
              <span className="text-sm text-gray-700 font-medium">{text}</span>
            </div>
          ))}
        </div>
        <button
          onClick={handleCanopyClick}
          className="group relative w-full inline-flex items-center justify-center gap-3 overflow-hidden rounded-xl p-0.5 transition-all duration-500 hover:scale-[1.02] active:scale-[0.98]"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-accent-500 via-accent-600 to-accent-500 animate-gradient-x"></div>
          <div className="relative flex items-center justify-center gap-3 w-full bg-gradient-to-r from-accent-500 via-accent-600 to-accent-500 px-6 py-3.5 rounded-xl">
            <span className="relative z-10 text-white font-bold text-base">
              Sync My Policy
            </span>
            <ArrowRight className="relative z-10 w-5 h-5 text-white transition-transform duration-300 group-hover:translate-x-1" />
          </div>
        </button>
      </div>

      {/* About Agent */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-primary-200 shadow-lg flex-shrink-0 bg-primary-100 flex items-center justify-center">
            <span className="text-xl font-bold text-primary-600">{(agentName || 'A').charAt(0)}</span>
          </div>
          <div>
            <h3 className="font-bold text-gray-900">About {agentName || 'Your Agent'}</h3>
            <p className="text-sm text-gray-600 leading-relaxed">
              {brandName || 'Your agency'} — licensed insurance agent who personally reviews every quote.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Home Insurance Wizard Steps ──────────────────────────────────

export function CanopyHomeStep({ carrierName, onSync, onSkip }) {
  const { launchCanopy } = useCanopyLauncher();
  const [syncing, setSyncing] = useState(false);

  const handleSync = () => {
    setSyncing(true);
    trackEvent('canopy_home_midfunnel_clicked', { carrier: carrierName });
    launchCanopy('wizard_home_midfunnel');
    setTimeout(() => {
      onSync?.();
      setSyncing(false);
    }, 500);
  };

  const displayCarrier = carrierName
    ? carrierName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    : 'your current carrier';

  return (
    <div>
      <StepHeading>See your exact savings before the call?</StepHeading>
      <StepDescription>
        Sync your {displayCarrier} policy — your agent will have your
        coverage details ready in advance.
      </StepDescription>

      <div className="bg-gradient-to-br from-accent-50 to-white border border-accent-200 rounded-xl p-5 mb-4 max-w-sm mx-auto">
        <div className="space-y-2 mb-5">
          {[
            { icon: Clock,       text: 'Takes 60 seconds' },
            { icon: Shield,      text: 'Bank-level security' },
            { icon: CheckCircle, text: 'No forms to fill out' },
          ].map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-center gap-2">
              <Icon className="w-4 h-4 text-success-500 flex-shrink-0" />
              <span className="text-sm text-gray-700 font-medium">{text}</span>
            </div>
          ))}
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="group relative w-full inline-flex items-center justify-center gap-3 overflow-hidden rounded-xl p-0.5 transition-all duration-500 hover:scale-[1.02] active:scale-[0.98]"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-accent-500 via-accent-600 to-accent-500 animate-gradient-x" />
          <div className="relative flex items-center justify-center gap-3 w-full bg-gradient-to-r from-accent-500 via-accent-600 to-accent-500 px-6 py-3.5 rounded-xl">
            <Zap className="relative z-10 w-5 h-5 text-white" />
            <span className="relative z-10 text-white font-bold text-base">
              {syncing ? 'Opening...' : 'Sync My Policy'}
            </span>
          </div>
        </button>
      </div>

      <button
        onClick={onSkip}
        className="w-full text-sm text-gray-400 hover:text-gray-600 py-2 transition-colors"
      >
        Skip for now →
      </button>
    </div>
  );
}

export function HomeInsuranceStatusStep({ value, onChange, onAutoAdvance }) {
  const options = [
    { value: 'switching',  label: "I'm switching providers",       emoji: '🔄' },
    { value: 'first_time', label: "First-time homebuyer",          emoji: '🏡' },
    { value: 'lapsed',     label: "My current coverage has lapsed", emoji: '⚠️' },
  ];

  const handleSelect = (val) => {
    onChange(val);
    setTimeout(() => onAutoAdvance?.(), 300);
  };

  return (
    <div>
      <StepHeading>What brings you here today?</StepHeading>
      <StepDescription>This helps your agent prepare for your call.</StepDescription>
      <div className="flex flex-col gap-3 max-w-sm mx-auto">
        {options.map(opt => (
          <ChoiceButton
            key={opt.value}
            selected={value === opt.value}
            onClick={() => handleSelect(opt.value)}
          >
            <span className="mr-2">{opt.emoji}</span>
            {opt.label}
          </ChoiceButton>
        ))}
      </div>
    </div>
  );
}

export function HomeOccupancyTypeStep({ value, onChange, onAutoAdvance }) {
  const options = [
    { value: 'primary',  label: 'Yes — it\'s my primary home',       emoji: '🏠' },
    { value: 'seasonal', label: 'Sometimes — seasonal / second home', emoji: '🌴' },
    { value: 'rental',   label: 'No — I rent it out',                emoji: '🔑' },
  ];

  const handleSelect = (val) => {
    onChange(val);
    setTimeout(() => onAutoAdvance?.(), 300);
  };

  return (
    <div>
      <StepHeading>Do you live at this property?</StepHeading>
      <StepDescription>
        Rental properties qualify for a different type of coverage.
      </StepDescription>
      <div className="flex flex-col gap-3 max-w-sm mx-auto">
        {options.map(opt => (
          <ChoiceButton
            key={opt.value}
            selected={value === opt.value}
            onClick={() => handleSelect(opt.value)}
          >
            <span className="mr-2">{opt.emoji}</span>
            {opt.label}
          </ChoiceButton>
        ))}
      </div>
      {value === 'rental' && (
        <p className="mt-3 text-xs text-amber-600 text-center font-medium">
          Rental properties need a Dwelling Fire policy — your agent will cover this on the call.
        </p>
      )}
    </div>
  );
}

export function RoofReplacedRecentlyStep({ value, onChange, onAutoAdvance }) {
  const handleSelect = (val) => {
    onChange(val);
    setTimeout(() => onAutoAdvance?.(), 300);
  };

  return (
    <div>
      <StepHeading>Full roof replacement in the last 5 years?</StepHeading>
      <StepDescription>
        Partial repairs don&apos;t count — only a complete replacement.
      </StepDescription>
      <div className="grid grid-cols-2 gap-4 max-w-xs mx-auto">
        <ChoiceButton selected={value === true}  onClick={() => handleSelect(true)}>Yes</ChoiceButton>
        <ChoiceButton selected={value === false} onClick={() => handleSelect(false)}>No</ChoiceButton>
      </div>
    </div>
  );
}

export function PropertyDetailsStep({ yearBuilt, squareFootage, stories, isPrefilled, onYearBuiltChange, onSquareFootageChange, onStoriesChange, onContinue }) {
  const [yearErr, setYearErr]   = useState('');
  const [sqftErr, setSqftErr]   = useState('');
  const currentYear = new Date().getFullYear();

  const STORIES_OPTIONS = ['1', '1.5', '2', '2+'];

  const validate = () => {
    let valid = true;
    if (!yearBuilt || yearBuilt < 1800 || yearBuilt > currentYear) {
      setYearErr(`Enter a year between 1800 and ${currentYear}`);
      valid = false;
    } else { setYearErr(''); }
    if (!squareFootage || squareFootage < 100 || squareFootage > 20000) {
      setSqftErr('Enter a valid square footage');
      valid = false;
    } else { setSqftErr(''); }
    return valid;
  };

  const handleContinue = () => {
    if (validate()) onContinue?.();
  };

  return (
    <div>
      <StepHeading>Tell us about your home.</StepHeading>
      {isPrefilled && (
        <StepDescription>
          We pre-filled these from public records — please verify and correct if needed.
        </StepDescription>
      )}
      {!isPrefilled && (
        <StepDescription>
          These details help us prepare the most accurate quote.
        </StepDescription>
      )}

      <div className="space-y-5 max-w-sm mx-auto">
        {/* Year Built */}
        <InputField
          id="yearBuilt"
          label="Year Built"
          type="text"
          inputMode="numeric"
          value={yearBuilt ?? ''}
          onChange={e => {
            const v = parseInt(e.target.value.replace(/\D/g, ''), 10);
            onYearBuiltChange(isNaN(v) ? null : v);
          }}
          placeholder={`e.g. ${currentYear - 20}`}
          error={yearErr}
          maxLength={4}
        />

        {/* Square Footage */}
        <InputField
          id="squareFootage"
          label="Square Footage"
          type="text"
          inputMode="numeric"
          value={squareFootage != null ? squareFootage.toLocaleString() : ''}
          onChange={e => {
            const v = parseInt(e.target.value.replace(/\D/g, ''), 10);
            onSquareFootageChange(isNaN(v) ? null : v);
          }}
          placeholder="e.g. 1,800"
          error={sqftErr}
        />

        {/* Stories */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Number of Stories
          </label>
          <div className="grid grid-cols-4 gap-2">
            {STORIES_OPTIONS.map(opt => (
              <ChoiceButton
                key={opt}
                selected={stories === opt}
                onClick={() => onStoriesChange(opt)}
              >
                {opt}
              </ChoiceButton>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 max-w-sm mx-auto">
        <button
          onClick={handleContinue}
          disabled={!yearBuilt || !squareFootage || !stories}
          className="w-full py-4 bg-primary-600 hover:bg-primary-700 text-white font-bold rounded-xl text-base transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
