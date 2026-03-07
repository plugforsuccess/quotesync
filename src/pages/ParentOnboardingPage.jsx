// src/pages/ParentOnboardingPage.jsx — Multi-step parent onboarding wizard
// Premium overnight childcare onboarding with progress persistence.

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, Check, Moon, User, Baby, Heart,
  Phone, ShieldCheck, Loader2, AlertCircle, Plus, Trash2, X
} from 'lucide-react';
import { useParentOnboarding } from '../hooks/useParentOnboarding';
import { supabase } from '../lib/supabase';

// ─── Validation helpers ──────────────────────────────────────────

function validatePhone(phone) {
  const digits = phone.replace(/\D/g, '');
  return digits.length === 10 || (digits.length === 11 && digits[0] === '1');
}

function formatPhoneInput(value) {
  const digits = value.replace(/\D/g, '').slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function validateDob(dob) {
  if (!dob) return 'Date of birth is required';
  const date = new Date(dob + 'T00:00:00');
  const now = new Date();
  if (date > now) return 'Date of birth cannot be in the future';
  const age = (now - date) / (365.25 * 24 * 60 * 60 * 1000);
  if (age > 18) return 'Child must be under 18';
  return null;
}

// ─── Step Indicator ──────────────────────────────────────────────

const STEP_LABELS = [
  { icon: User, label: 'Your Profile' },
  { icon: Baby, label: 'Your Child' },
  { icon: Heart, label: 'Medical' },
  { icon: Phone, label: 'Emergency' },
  { icon: ShieldCheck, label: 'Pickups' },
  { icon: Check, label: 'Review' },
];

function StepIndicator({ currentStep, totalSteps }) {
  return (
    <div className="flex items-center justify-center gap-1 sm:gap-2 mb-8">
      {STEP_LABELS.map((step, i) => {
        const Icon = step.icon;
        const isActive = i === currentStep;
        const isCompleted = i < currentStep;
        return (
          <div key={i} className="flex items-center">
            <div className={`
              flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-full transition-all duration-300
              ${isCompleted ? 'bg-emerald-500 text-white' : ''}
              ${isActive ? 'bg-indigo-600 text-white ring-4 ring-indigo-200' : ''}
              ${!isActive && !isCompleted ? 'bg-gray-200 text-gray-400' : ''}
            `}>
              {isCompleted ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
            </div>
            {i < totalSteps - 1 && (
              <div className={`w-6 sm:w-10 h-0.5 mx-1 transition-colors ${
                i < currentStep ? 'bg-emerald-500' : 'bg-gray-200'
              }`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Step 1: Parent Profile ──────────────────────────────────────

function ParentProfileStep({ parentProfile, onSave, saving, error }) {
  const [firstName, setFirstName] = useState(parentProfile?.first_name || '');
  const [lastName, setLastName] = useState(parentProfile?.last_name || '');
  const [phone, setPhone] = useState(parentProfile?.phone || '');
  const [localError, setLocalError] = useState(null);

  const handleSubmit = () => {
    setLocalError(null);
    if (!firstName.trim()) { setLocalError('First name is required'); return; }
    if (!lastName.trim()) { setLocalError('Last name is required'); return; }
    if (!validatePhone(phone)) { setLocalError('Valid phone number is required'); return; }
    onSave({ firstName, lastName, phone: phone.replace(/\D/g, '').slice(-10) });
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-gray-900">Tell us about yourself</h2>
        <p className="text-gray-500 mt-2">We need a few details to get started.</p>
      </div>

      {(localError || error) && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {localError || error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
        <input
          type="text"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
          placeholder="Your first name"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
        <input
          type="text"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
          placeholder="Your last name"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
        <input
          type="tel"
          value={formatPhoneInput(phone)}
          onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
          className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
          placeholder="(555) 123-4567"
        />
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={saving}
        className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
      >
        {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <><span>Continue</span><ArrowRight className="w-4 h-4" /></>}
      </button>
    </div>
  );
}

// ─── Step 2: Add Child ───────────────────────────────────────────

function AddChildStep({ childData, onSave, onBack, saving, error }) {
  const [firstName, setFirstName] = useState(childData?.first_name || '');
  const [lastName, setLastName] = useState(childData?.last_name || '');
  const [dob, setDob] = useState(childData?.dob || '');
  const [gender, setGender] = useState(childData?.gender || '');
  const [notes, setNotes] = useState(childData?.notes || '');
  const [localError, setLocalError] = useState(null);

  const handleSubmit = () => {
    setLocalError(null);
    if (!firstName.trim()) { setLocalError('First name is required'); return; }
    if (!lastName.trim()) { setLocalError('Last name is required'); return; }
    const dobErr = validateDob(dob);
    if (dobErr) { setLocalError(dobErr); return; }
    onSave({ firstName, lastName, dob, gender: gender || null, notes: notes || null });
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-gray-900">Add your child</h2>
        <p className="text-gray-500 mt-2">Basic information about your little one.</p>
      </div>

      {(localError || error) && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {localError || error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
          <input
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
            placeholder="Child's first name"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
          <input
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
            placeholder="Child's last name"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Date of Birth *</label>
        <input
          type="date"
          value={dob}
          onChange={(e) => setDob(e.target.value)}
          max={new Date().toISOString().split('T')[0]}
          className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Gender (optional)</label>
        <select
          value={gender}
          onChange={(e) => setGender(e.target.value)}
          className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors bg-white"
        >
          <option value="">Prefer not to say</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
          <option value="non_binary">Non-binary</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors resize-none"
          placeholder="Anything else we should know..."
        />
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="px-6 py-3 border border-gray-300 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving}
          className="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <><span>Continue</span><ArrowRight className="w-4 h-4" /></>}
        </button>
      </div>
    </div>
  );
}

// ─── Step 3: Medical Acknowledgement ─────────────────────────────

function MedicalAckStep({ medicalData, onSave, onBack, saving, error }) {
  const [hasAllergies, setHasAllergies] = useState(medicalData?.has_allergies || false);
  const [hasMedications, setHasMedications] = useState(medicalData?.has_medications || false);
  const [hasMedicalConditions, setHasMedicalConditions] = useState(medicalData?.has_medical_conditions || false);
  const [allergiesSummary, setAllergiesSummary] = useState(medicalData?.allergies_summary || '');
  const [medicationsSummary, setMedicationsSummary] = useState(medicalData?.medications_summary || '');
  const [medicalConditionsSummary, setMedicalConditionsSummary] = useState(medicalData?.medical_conditions_summary || '');
  const [localError, setLocalError] = useState(null);

  const handleSubmit = () => {
    setLocalError(null);
    if (hasAllergies && !allergiesSummary.trim()) {
      setLocalError('Please describe the allergies'); return;
    }
    if (hasMedications && !medicationsSummary.trim()) {
      setLocalError('Please describe the medications'); return;
    }
    if (hasMedicalConditions && !medicalConditionsSummary.trim()) {
      setLocalError('Please describe the medical conditions'); return;
    }
    onSave({
      hasAllergies,
      hasMedications,
      hasMedicalConditions,
      allergiesSummary,
      medicationsSummary,
      medicalConditionsSummary,
    });
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-gray-900">Medical & Safety</h2>
        <p className="text-gray-500 mt-2">Help us keep your child safe during their stay.</p>
      </div>

      {(localError || error) && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {localError || error}
        </div>
      )}

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
        <p className="font-medium mb-1">Why we ask</p>
        <p>This information ensures our staff can respond appropriately to your child's needs. Additional medical details (physician info, etc.) can be added later from your dashboard.</p>
      </div>

      {/* Allergies */}
      <div className="border border-gray-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <label className="text-sm font-medium text-gray-900">Does your child have any allergies?</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setHasAllergies(true)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                hasAllergies ? 'bg-indigo-100 text-indigo-700 ring-2 ring-indigo-500' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >Yes</button>
            <button
              type="button"
              onClick={() => { setHasAllergies(false); setAllergiesSummary(''); }}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                !hasAllergies ? 'bg-indigo-100 text-indigo-700 ring-2 ring-indigo-500' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >No</button>
          </div>
        </div>
        {hasAllergies && (
          <textarea
            value={allergiesSummary}
            onChange={(e) => setAllergiesSummary(e.target.value)}
            rows={2}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors resize-none text-sm"
            placeholder="Please describe the allergies (e.g., peanuts, bee stings, latex)..."
          />
        )}
      </div>

      {/* Medications */}
      <div className="border border-gray-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <label className="text-sm font-medium text-gray-900">Does your child take any medications?</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setHasMedications(true)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                hasMedications ? 'bg-indigo-100 text-indigo-700 ring-2 ring-indigo-500' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >Yes</button>
            <button
              type="button"
              onClick={() => { setHasMedications(false); setMedicationsSummary(''); }}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                !hasMedications ? 'bg-indigo-100 text-indigo-700 ring-2 ring-indigo-500' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >No</button>
          </div>
        </div>
        {hasMedications && (
          <textarea
            value={medicationsSummary}
            onChange={(e) => setMedicationsSummary(e.target.value)}
            rows={2}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors resize-none text-sm"
            placeholder="Please describe medications and dosages..."
          />
        )}
      </div>

      {/* Medical Conditions */}
      <div className="border border-gray-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <label className="text-sm font-medium text-gray-900">Does your child have any medical conditions?</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setHasMedicalConditions(true)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                hasMedicalConditions ? 'bg-indigo-100 text-indigo-700 ring-2 ring-indigo-500' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >Yes</button>
            <button
              type="button"
              onClick={() => { setHasMedicalConditions(false); setMedicalConditionsSummary(''); }}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                !hasMedicalConditions ? 'bg-indigo-100 text-indigo-700 ring-2 ring-indigo-500' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >No</button>
          </div>
        </div>
        {hasMedicalConditions && (
          <textarea
            value={medicalConditionsSummary}
            onChange={(e) => setMedicalConditionsSummary(e.target.value)}
            rows={2}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors resize-none text-sm"
            placeholder="Please describe the conditions (e.g., asthma, epilepsy, diabetes)..."
          />
        )}
      </div>

      <div className="flex gap-3">
        <button type="button" onClick={onBack} className="px-6 py-3 border border-gray-300 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <button type="button" onClick={handleSubmit} disabled={saving}
          className="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2">
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <><span>Continue</span><ArrowRight className="w-4 h-4" /></>}
        </button>
      </div>
    </div>
  );
}

// ─── Step 4: Emergency Contacts ──────────────────────────────────

const EMPTY_CONTACT = { firstName: '', lastName: '', relationship: '', phone: '', email: '' };

function EmergencyContactsStep({ existingContacts, onSave, onBack, saving, error }) {
  const [contacts, setContacts] = useState(
    existingContacts?.length > 0
      ? existingContacts.map(c => ({
          firstName: c.first_name,
          lastName: c.last_name,
          relationship: c.relationship,
          phone: c.phone,
          email: c.email || '',
        }))
      : [{ ...EMPTY_CONTACT }]
  );
  const [localError, setLocalError] = useState(null);

  const updateContact = (index, field, value) => {
    setContacts(prev => prev.map((c, i) => i === index ? { ...c, [field]: value } : c));
  };

  const addContact = () => {
    if (contacts.length < 2) setContacts(prev => [...prev, { ...EMPTY_CONTACT }]);
  };

  const removeContact = (index) => {
    if (contacts.length > 1) setContacts(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = () => {
    setLocalError(null);
    for (let i = 0; i < contacts.length; i++) {
      const c = contacts[i];
      if (!c.firstName.trim()) { setLocalError(`Contact ${i + 1}: First name is required`); return; }
      if (!c.lastName.trim()) { setLocalError(`Contact ${i + 1}: Last name is required`); return; }
      if (!c.relationship.trim()) { setLocalError(`Contact ${i + 1}: Relationship is required`); return; }
      if (!validatePhone(c.phone)) { setLocalError(`Contact ${i + 1}: Valid phone number is required`); return; }
    }
    onSave(contacts.map(c => ({ ...c, phone: c.phone.replace(/\D/g, '').slice(-10) })));
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-gray-900">Emergency Contacts</h2>
        <p className="text-gray-500 mt-2">At least one contact is required for your child's safety.</p>
      </div>

      {(localError || error) && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {localError || error}
        </div>
      )}

      {contacts.map((contact, index) => (
        <div key={index} className="border border-gray-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">
              Contact {index + 1} {index === 0 && <span className="text-indigo-600">(Primary)</span>}
            </h3>
            {contacts.length > 1 && (
              <button type="button" onClick={() => removeContact(index)} className="text-gray-400 hover:text-red-500 transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">First Name *</label>
              <input
                type="text" value={contact.firstName}
                onChange={(e) => updateContact(index, 'firstName', e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                placeholder="First name"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Last Name *</label>
              <input
                type="text" value={contact.lastName}
                onChange={(e) => updateContact(index, 'lastName', e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                placeholder="Last name"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Relationship *</label>
              <select
                value={contact.relationship}
                onChange={(e) => updateContact(index, 'relationship', e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-white"
              >
                <option value="">Select...</option>
                <option value="grandparent">Grandparent</option>
                <option value="aunt_uncle">Aunt/Uncle</option>
                <option value="sibling">Sibling</option>
                <option value="family_friend">Family Friend</option>
                <option value="neighbor">Neighbor</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Phone *</label>
              <input
                type="tel" value={formatPhoneInput(contact.phone)}
                onChange={(e) => updateContact(index, 'phone', e.target.value.replace(/\D/g, ''))}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                placeholder="(555) 123-4567"
              />
            </div>
          </div>
        </div>
      ))}

      {contacts.length < 2 && (
        <button type="button" onClick={addContact}
          className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 hover:border-indigo-300 hover:text-indigo-600 transition-colors flex items-center justify-center gap-2 text-sm">
          <Plus className="w-4 h-4" /> Add another contact
        </button>
      )}

      <div className="flex gap-3">
        <button type="button" onClick={onBack} className="px-6 py-3 border border-gray-300 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <button type="button" onClick={handleSubmit} disabled={saving}
          className="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2">
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <><span>Continue</span><ArrowRight className="w-4 h-4" /></>}
        </button>
      </div>
    </div>
  );
}

// ─── Step 5: Authorized Pickups ──────────────────────────────────

const EMPTY_PICKUP = { firstName: '', lastName: '', relationship: '', phone: '' };

function AuthorizedPickupsStep({ existingPickups, onSave, onBack, saving, error }) {
  const [mode, setMode] = useState(existingPickups?.length > 0 ? 'add' : null); // null | 'skip' | 'add'
  const [pickups, setPickups] = useState(
    existingPickups?.length > 0
      ? existingPickups.map(p => ({
          firstName: p.first_name,
          lastName: p.last_name,
          relationship: p.relationship,
          phone: p.phone,
        }))
      : [{ ...EMPTY_PICKUP }]
  );
  const [localError, setLocalError] = useState(null);

  const updatePickup = (index, field, value) => {
    setPickups(prev => prev.map((p, i) => i === index ? { ...p, [field]: value } : p));
  };

  const handleSubmit = () => {
    setLocalError(null);
    if (mode === 'skip') {
      onSave([], true);
      return;
    }
    for (let i = 0; i < pickups.length; i++) {
      const p = pickups[i];
      if (!p.firstName.trim()) { setLocalError(`Pickup ${i + 1}: First name is required`); return; }
      if (!p.lastName.trim()) { setLocalError(`Pickup ${i + 1}: Last name is required`); return; }
      if (!p.relationship.trim()) { setLocalError(`Pickup ${i + 1}: Relationship is required`); return; }
      if (!validatePhone(p.phone)) { setLocalError(`Pickup ${i + 1}: Valid phone number is required`); return; }
    }
    onSave(pickups.map(p => ({ ...p, phone: p.phone.replace(/\D/g, '').slice(-10) })));
  };

  if (mode === null) {
    return (
      <div className="space-y-6">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-gray-900">Authorized Pickups</h2>
          <p className="text-gray-500 mt-2">Who else is authorized to pick up your child?</p>
        </div>

        <div className="space-y-3">
          <button type="button" onClick={() => setMode('add')}
            className="w-full p-5 border-2 border-gray-200 rounded-xl hover:border-indigo-300 hover:bg-indigo-50 transition-all text-left">
            <div className="font-semibold text-gray-900 mb-1">Add authorized pickup contacts</div>
            <div className="text-sm text-gray-500">Grandparents, family members, or trusted adults</div>
          </button>

          <button type="button" onClick={() => setMode('skip')}
            className="w-full p-5 border-2 border-gray-200 rounded-xl hover:border-gray-300 hover:bg-gray-50 transition-all text-left">
            <div className="font-semibold text-gray-900 mb-1">Skip for now</div>
            <div className="text-sm text-gray-500">Only parent/legal guardian will be authorized for pickup</div>
          </button>
        </div>

        <button type="button" onClick={onBack} className="px-6 py-3 border border-gray-300 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
      </div>
    );
  }

  if (mode === 'skip') {
    return (
      <div className="space-y-6">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-gray-900">Confirm Skip</h2>
          <p className="text-gray-500 mt-2">No authorized pickups will be added at this time.</p>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          <p className="font-medium mb-1">Important</p>
          <p>Only parent/legal guardian will be authorized to pick up your child. You can add authorized pickups later from your dashboard.</p>
        </div>

        <div className="flex gap-3">
          <button type="button" onClick={() => setMode(null)} className="px-6 py-3 border border-gray-300 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <button type="button" onClick={handleSubmit} disabled={saving}
            className="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2">
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <><span>Continue without pickups</span><ArrowRight className="w-4 h-4" /></>}
          </button>
        </div>
      </div>
    );
  }

  // mode === 'add'
  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-gray-900">Authorized Pickups</h2>
        <p className="text-gray-500 mt-2">Add people authorized to pick up your child.</p>
      </div>

      {(localError || error) && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {localError || error}
        </div>
      )}

      {pickups.map((pickup, index) => (
        <div key={index} className="border border-gray-200 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-700">Pickup Person {index + 1}</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">First Name *</label>
              <input type="text" value={pickup.firstName}
                onChange={(e) => updatePickup(index, 'firstName', e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                placeholder="First name" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Last Name *</label>
              <input type="text" value={pickup.lastName}
                onChange={(e) => updatePickup(index, 'lastName', e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                placeholder="Last name" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Relationship *</label>
              <select value={pickup.relationship}
                onChange={(e) => updatePickup(index, 'relationship', e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-white">
                <option value="">Select...</option>
                <option value="grandparent">Grandparent</option>
                <option value="aunt_uncle">Aunt/Uncle</option>
                <option value="sibling">Sibling</option>
                <option value="family_friend">Family Friend</option>
                <option value="nanny">Nanny/Caregiver</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Phone *</label>
              <input type="tel" value={formatPhoneInput(pickup.phone)}
                onChange={(e) => updatePickup(index, 'phone', e.target.value.replace(/\D/g, ''))}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                placeholder="(555) 123-4567" />
            </div>
          </div>
        </div>
      ))}

      <div className="flex gap-3">
        <button type="button" onClick={() => setMode(null)} className="px-6 py-3 border border-gray-300 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <button type="button" onClick={handleSubmit} disabled={saving}
          className="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2">
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <><span>Continue</span><ArrowRight className="w-4 h-4" /></>}
        </button>
      </div>
    </div>
  );
}

// ─── Step 6: Review & Complete ───────────────────────────────────

function ReviewStep({ parentProfile, childData, medicalData, emergencyContacts, authorizedPickups, skippedPickups, onComplete, onBack, saving, error }) {
  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-100 rounded-full mb-4">
          <Check className="w-8 h-8 text-emerald-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900">Review & Complete</h2>
        <p className="text-gray-500 mt-2">Please verify everything looks correct.</p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Parent Summary */}
      <div className="border border-gray-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-indigo-600 uppercase tracking-wider mb-3">Your Profile</h3>
        <div className="text-sm text-gray-700 space-y-1">
          <p><span className="font-medium">Name:</span> {parentProfile?.first_name} {parentProfile?.last_name}</p>
          <p><span className="font-medium">Phone:</span> {formatPhoneInput(parentProfile?.phone || '')}</p>
        </div>
      </div>

      {/* Child Summary */}
      <div className="border border-gray-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-indigo-600 uppercase tracking-wider mb-3">Your Child</h3>
        <div className="text-sm text-gray-700 space-y-1">
          <p><span className="font-medium">Name:</span> {childData?.first_name} {childData?.last_name}</p>
          <p><span className="font-medium">Date of Birth:</span> {childData?.dob}</p>
          {childData?.gender && <p><span className="font-medium">Gender:</span> {childData.gender}</p>}
        </div>
      </div>

      {/* Medical Summary */}
      <div className="border border-gray-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-indigo-600 uppercase tracking-wider mb-3">Medical & Safety</h3>
        <div className="text-sm text-gray-700 space-y-1">
          <p><span className="font-medium">Allergies:</span> {medicalData?.has_allergies ? medicalData.allergies_summary : 'None reported'}</p>
          <p><span className="font-medium">Medications:</span> {medicalData?.has_medications ? medicalData.medications_summary : 'None reported'}</p>
          <p><span className="font-medium">Medical Conditions:</span> {medicalData?.has_medical_conditions ? medicalData.medical_conditions_summary : 'None reported'}</p>
        </div>
      </div>

      {/* Emergency Contacts Summary */}
      <div className="border border-gray-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-indigo-600 uppercase tracking-wider mb-3">Emergency Contacts</h3>
        <div className="text-sm text-gray-700 space-y-2">
          {emergencyContacts.map((c, i) => (
            <div key={i}>
              <p className="font-medium">{c.first_name} {c.last_name} ({c.relationship})</p>
              <p className="text-gray-500">{formatPhoneInput(c.phone)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Authorized Pickups Summary */}
      <div className="border border-gray-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-indigo-600 uppercase tracking-wider mb-3">Authorized Pickups</h3>
        <div className="text-sm text-gray-700">
          {skippedPickups || authorizedPickups.length === 0 ? (
            <p className="text-gray-500">Parent/guardian only (can be updated later)</p>
          ) : (
            authorizedPickups.map((p, i) => (
              <div key={i} className="mb-2">
                <p className="font-medium">{p.first_name} {p.last_name} ({p.relationship})</p>
                <p className="text-gray-500">{formatPhoneInput(p.phone)}</p>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="flex gap-3">
        <button type="button" onClick={onBack} className="px-6 py-3 border border-gray-300 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <button type="button" onClick={onComplete} disabled={saving}
          className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2">
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Check className="w-4 h-4" /><span>Complete Registration</span></>}
        </button>
      </div>
    </div>
  );
}

// ─── Main Onboarding Page ────────────────────────────────────────

export default function ParentOnboardingPage() {
  const navigate = useNavigate();
  const onboarding = useParentOnboarding();

  // Redirect to dashboard if already complete
  useEffect(() => {
    if (!onboarding.loading && onboarding.isComplete) {
      navigate('/parent/dashboard', { replace: true });
    }
  }, [onboarding.loading, onboarding.isComplete, navigate]);

  if (onboarding.loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-purple-950 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-indigo-400 animate-spin mx-auto mb-4" />
          <p className="text-indigo-200">Loading your progress...</p>
        </div>
      </div>
    );
  }

  const handleComplete = async () => {
    try {
      await onboarding.completeOnboarding();
      navigate('/parent/dashboard');
    } catch {
      // Error is set in hook
    }
  };

  const renderStep = () => {
    switch (onboarding.currentStep) {
      case 0:
        return (
          <ParentProfileStep
            parentProfile={onboarding.parentProfile}
            onSave={onboarding.saveParentProfile}
            saving={onboarding.saving}
            error={onboarding.error}
          />
        );
      case 1:
        return (
          <AddChildStep
            childData={onboarding.childData}
            onSave={onboarding.saveChild}
            onBack={onboarding.goBack}
            saving={onboarding.saving}
            error={onboarding.error}
          />
        );
      case 2:
        return (
          <MedicalAckStep
            medicalData={onboarding.medicalData}
            onSave={onboarding.saveMedicalAck}
            onBack={onboarding.goBack}
            saving={onboarding.saving}
            error={onboarding.error}
          />
        );
      case 3:
        return (
          <EmergencyContactsStep
            existingContacts={onboarding.emergencyContacts}
            onSave={onboarding.saveEmergencyContacts}
            onBack={onboarding.goBack}
            saving={onboarding.saving}
            error={onboarding.error}
          />
        );
      case 4:
        return (
          <AuthorizedPickupsStep
            existingPickups={onboarding.authorizedPickups}
            onSave={onboarding.saveAuthorizedPickups}
            onBack={onboarding.goBack}
            saving={onboarding.saving}
            error={onboarding.error}
          />
        );
      case 5:
        return (
          <ReviewStep
            parentProfile={onboarding.parentProfile}
            childData={onboarding.childData}
            medicalData={onboarding.medicalData}
            emergencyContacts={onboarding.emergencyContacts}
            authorizedPickups={onboarding.authorizedPickups}
            skippedPickups={onboarding.skippedPickups}
            onComplete={handleComplete}
            onBack={onboarding.goBack}
            saving={onboarding.saving}
            error={onboarding.error}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-purple-950 to-slate-900">
      {/* Header */}
      <div className="bg-white/5 backdrop-blur border-b border-white/10">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Moon className="w-6 h-6 text-indigo-400" />
            <span className="text-lg font-semibold text-white">NightNest</span>
          </div>
          <span className="text-sm text-indigo-300">
            Step {onboarding.currentStep + 1} of {onboarding.totalSteps}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-white/10">
        <div
          className="h-1 bg-indigo-500 transition-all duration-500 ease-out"
          style={{ width: `${onboarding.progress * 100}%` }}
        />
      </div>

      {/* Content */}
      <div className="max-w-lg mx-auto px-4 py-8">
        <StepIndicator currentStep={onboarding.currentStep} totalSteps={onboarding.totalSteps} />

        <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8">
          {renderStep()}
        </div>
      </div>
    </div>
  );
}
