// src/pages/components/wizard/WizardSteps.jsx
// Individual question step components for the single-question wizard
import { useState, useEffect, useRef } from 'react';
import { CheckCircle, Zap, Shield, Clock, ArrowRight, Star, MapPin, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { isTargetZip } from '../../../config/targetZips';
import { formatPhoneInput } from '../../../utils/phoneFormat';
import { useCanopyLauncher } from '../../../hooks/useCanopyLauncher';
import { SESSION_KEYS } from '../../../hooks/useWizard';
import { trackEvent } from '../../../lib/analytics';
import AddressAutocomplete from '../../../components/AddressAutocomplete';

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
export function ZipStep({ value, onChange, onAutoAdvance }) {
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
          We&apos;re a licensed Georgia insurance agency and can only offer quotes
          for Georgia residents at this time.
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
          We currently serve Georgia ZIP codes
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

// ─── Step 2: Own or Rent ───────────────────────────────────────────

export function OwnsHomeStep({ value, onChange, onAutoAdvance }) {
  const handleSelect = (val) => {
    onChange(val);
    setTimeout(() => onAutoAdvance?.(), 300);
  };

  return (
    <div>
      <StepHeading>Do you own or rent your home?</StepHeading>
      <StepDescription>Homeowners often qualify for bundled savings.</StepDescription>
      <div className="grid grid-cols-3 gap-3 max-w-sm mx-auto">
        <ChoiceButton selected={value === true} onClick={() => handleSelect(true)}>
          I Own
        </ChoiceButton>
        <ChoiceButton selected={value === false} onClick={() => handleSelect(false)}>
          I Rent
        </ChoiceButton>
        <ChoiceButton selected={value === 'other'} onClick={() => handleSelect('other')}>
          Other
        </ChoiceButton>
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
        By entering your number, you agree to receive a text from Insured By
        Cam with your quote status. Msg &amp; data rates may apply. Reply STOP
        to opt out.
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

// ─── Step 5a: Current Auto Carrier ─────────────────────────────────

const AUTO_CARRIERS = [
  { label: 'State Farm', value: 'state_farm' },
  { label: 'GEICO', value: 'geico' },
  { label: 'Progressive', value: 'progressive' },
  { label: 'Allstate', value: 'allstate' },
  { label: 'Farmers', value: 'farmers' },
  { label: 'GA Farm Bureau', value: 'farm_bureau' },
  { label: 'USAA', value: 'usaa' },
  { label: 'Other', value: 'other' },
  { label: 'None', value: 'none' },
];

export function CurrentAutoCarrierStep({ value, onChange, onAutoAdvance }) {
  const handleSelect = (val) => {
    onChange(val);
    setTimeout(() => onAutoAdvance?.(), 300);
  };

  return (
    <div>
      <StepHeading>Who is your current auto insurance carrier?</StepHeading>
      <StepDescription>This helps us compare apples to apples.</StepDescription>
      <div className="grid grid-cols-3 gap-3">
        {AUTO_CARRIERS.map((opt) => (
          <ChoiceButton
            key={opt.value}
            selected={value === opt.value}
            variant={value === opt.value && opt.value === 'allstate' ? 'purple' : 'default'}
            onClick={() => handleSelect(opt.value)}
            className="text-sm"
          >
            {opt.label}
          </ChoiceButton>
        ))}
      </div>
    </div>
  );
}

// ─── Step 4b: Current Home Carrier ─────────────────────────────────

const HOME_CARRIERS = [
  { label: 'State Farm', value: 'state_farm' },
  { label: 'Allstate', value: 'allstate' },
  { label: 'Liberty Mutual', value: 'liberty_mutual' },
  { label: 'Farmers', value: 'farmers' },
  { label: 'GA Farm Bureau', value: 'farm_bureau' },
  { label: 'Nationwide', value: 'nationwide' },
  { label: 'USAA', value: 'usaa' },
  { label: 'Other', value: 'other' },
  { label: 'None', value: 'none' },
];

export function CurrentHomeCarrierStep({ value, onChange, onAutoAdvance }) {
  const handleSelect = (val) => {
    onChange(val);
    setTimeout(() => onAutoAdvance?.(), 300);
  };

  return (
    <div>
      <StepHeading>Who is your current home insurance carrier?</StepHeading>
      <StepDescription>Knowing your current carrier helps us find real savings.</StepDescription>
      <div className="grid grid-cols-3 gap-3">
        {HOME_CARRIERS.map((opt) => (
          <ChoiceButton
            key={opt.value}
            selected={value === opt.value}
            variant={value === opt.value && opt.value === 'allstate' ? 'purple' : 'default'}
            onClick={() => handleSelect(opt.value)}
            className="text-sm"
          >
            {opt.label}
          </ChoiceButton>
        ))}
      </div>
    </div>
  );
}

// ─── Step 4c: Current Renters Carrier ──────────────────────────────

const RENTERS_CARRIERS = [
  { label: 'State Farm', value: 'state_farm' },
  { label: 'Allstate', value: 'allstate' },
  { label: 'GEICO', value: 'geico' },
  { label: 'Progressive', value: 'progressive' },
  { label: 'Lemonade', value: 'lemonade' },
  { label: 'Other', value: 'other' },
  { label: 'None', value: 'none' },
];

// UX-5: "None" centered in its own row below the main grid
export function CurrentRentersCarrierStep({ value, onChange, onAutoAdvance }) {
  const handleSelect = (val) => {
    onChange(val);
    setTimeout(() => onAutoAdvance?.(), 300);
  };

  const carriers = RENTERS_CARRIERS.filter(c => c.value !== 'none');

  return (
    <div>
      <StepHeading>Who is your current renters insurance carrier?</StepHeading>
      <StepDescription>This helps us compare apples to apples.</StepDescription>
      <div className="max-w-sm mx-auto">
        <div className="grid grid-cols-3 gap-3">
          {carriers.map((opt) => (
            <ChoiceButton
              key={opt.value}
              selected={value === opt.value}
              variant={value === opt.value && opt.value === 'allstate' ? 'purple' : 'default'}
              onClick={() => handleSelect(opt.value)}
              className="text-sm"
            >
              {opt.label}
            </ChoiceButton>
          ))}
        </div>
        {/* "None" centered below the grid */}
        <div className="flex justify-center mt-3">
          <ChoiceButton
            selected={value === 'none'}
            onClick={() => handleSelect('none')}
            className="text-sm px-8"
          >
            None
          </ChoiceButton>
        </div>
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

// ─── Step 6: Vehicle Count ─────────────────────────────────────────

export function VehicleCountStep({ value, onChange, onAutoAdvance }) {
  const handleSelect = (val) => {
    onChange(val);
    setTimeout(() => onAutoAdvance?.(), 300);
  };

  return (
    <div>
      <StepHeading>How many vehicles do you insure?</StepHeading>
      <StepDescription>Include all cars, trucks, and SUVs in your household.</StepDescription>
      <div className="grid grid-cols-4 gap-3 max-w-sm mx-auto">
        {[1, 2, 3, 4].map((count) => (
          <ChoiceButton
            key={count}
            selected={value === count}
            onClick={() => handleSelect(count)}
          >
            {count === 4 ? '4+' : count}
          </ChoiceButton>
        ))}
      </div>
    </div>
  );
}

// ─── Step 7: Marital Status (NEW-1) ───────────────────────────────

export function MaritalStatusStep({ value, onChange, onAutoAdvance }) {
  const handleSelect = (val) => {
    onChange(val);
    setTimeout(() => onAutoAdvance?.(), 300);
  };

  return (
    <div>
      <StepHeading>What is your marital status?</StepHeading>
      <StepDescription>Married drivers often qualify for lower rates.</StepDescription>
      <div className="grid grid-cols-2 gap-3 max-w-xs mx-auto">
        {[
          { label: 'Single', value: 'single' },
          { label: 'Married', value: 'married' },
          { label: 'Divorced', value: 'divorced' },
          { label: 'Widowed', value: 'widowed' },
        ].map((opt) => (
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

export function AddressStep({ street, apt, city, zip, onStreetChange, onAptChange, onCityChange, onZipCorrected, onAddressSourceChange, onLatLngChange }) {
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
            <div className={readOnlyClasses}>GA</div>
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

export function ContactStep({ firstName, lastName, phone, email, onFirstNameChange, onLastNameChange, onPhoneChange, onEmailChange, errors }) {
  const handlePhoneChange = (e) => {
    onPhoneChange(formatPhoneInput(e.target.value));
  };

  return (
    <div>
      <StepHeading>Where should we send your personalized quote?</StepHeading>
      <StepDescription>Cam will personally review your info within minutes.</StepDescription>
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
          By clicking &apos;Get My Free Quote&apos;, you agree to be contacted by Insured By
          Cam regarding insurance quotes via phone, SMS, and email at the number provided,
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

export function ConfirmationStep({ answers }) {
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
          Cam will reach out within the next few minutes to walk you through your options.
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

      {/* About Cam */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-primary-200 shadow-lg flex-shrink-0">
            <img
              src="/logos/A64C36F2-FC89-49D4-8C28-83161625C91C.jpeg"
              alt="Cameron Wiley"
              className="w-full h-full object-cover"
              style={{ objectPosition: '50% 30%' }}
            />
          </div>
          <div>
            <h3 className="font-bold text-gray-900">About Cam</h3>
            <p className="text-sm text-gray-600 leading-relaxed">
              Cameron is a licensed Allstate agent in Georgia who personally reviews every quote.
            </p>
            <div className="flex items-center gap-1 mt-1">
              {[...Array(4)].map((_, i) => (
                <Star key={i} className="w-3.5 h-3.5 text-accent-500 fill-accent-500" />
              ))}
              <Star className="w-3.5 h-3.5 text-gray-300" />
              <span className="text-xs text-gray-500 ml-1">4.1 (265 reviews)</span>
            </div>
          </div>
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
          Sync your current policy and Cam can have your comparison ready before the call.
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
    </div>
  );
}
