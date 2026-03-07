// src/hooks/useParentOnboarding.js — Parent onboarding state management
// Manages the multi-step onboarding flow for overnight childcare parents.
// Persists progress to Supabase so parents can resume if interrupted.

import { useState, useCallback, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';

const ONBOARDING_STEPS = [
  'parent_profile',
  'add_child',
  'medical_ack',
  'emergency_contacts',
  'authorized_pickups',
  'review',
];

const STATUS_TO_STEP_INDEX = {
  started: 0,
  parent_profile_complete: 1,
  child_created: 2,
  medical_ack_complete: 3,
  emergency_contact_added: 4,
  complete: 5,
};

export function useParentOnboarding() {
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Data state
  const [parentProfile, setParentProfile] = useState(null);
  const [childData, setChildData] = useState(null);
  const [medicalData, setMedicalData] = useState(null);
  const [emergencyContacts, setEmergencyContacts] = useState([]);
  const [authorizedPickups, setAuthorizedPickups] = useState([]);
  const [skippedPickups, setSkippedPickups] = useState(false);

  const totalSteps = ONBOARDING_STEPS.length;
  const currentStepId = ONBOARDING_STEPS[currentStep];
  const progress = totalSteps > 1 ? (currentStep + 1) / totalSteps : 0;
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep >= totalSteps - 1;

  // Load existing onboarding state on mount
  useEffect(() => {
    loadOnboardingState();
  }, []);

  const loadOnboardingState = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      // Load parent profile
      const { data: parent } = await supabase
        .from('parents')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (parent) {
        setParentProfile(parent);
        const resumeStep = STATUS_TO_STEP_INDEX[parent.onboarding_status] ?? 0;
        setCurrentStep(resumeStep);

        // Load children
        const { data: children } = await supabase
          .from('children')
          .select('*')
          .eq('parent_id', parent.id)
          .limit(1)
          .maybeSingle();

        if (children) {
          setChildData(children);

          // Load medical profile
          const { data: medical } = await supabase
            .from('child_medical_profiles')
            .select('*')
            .eq('child_id', children.id)
            .maybeSingle();

          if (medical) setMedicalData(medical);

          // Load emergency contacts
          const { data: contacts } = await supabase
            .from('emergency_contacts')
            .select('*')
            .eq('child_id', children.id)
            .order('priority_order');

          if (contacts) setEmergencyContacts(contacts);

          // Load authorized pickups
          const { data: pickups } = await supabase
            .from('authorized_pickups')
            .select('*')
            .eq('child_id', children.id);

          if (pickups) setAuthorizedPickups(pickups);
        }
      }
    } catch (err) {
      console.error('[Onboarding] Load error:', err);
      setError('Failed to load onboarding state');
    } finally {
      setLoading(false);
    }
  };

  // Step 1: Save parent profile
  const saveParentProfile = useCallback(async ({ firstName, lastName, phone }) => {
    try {
      setSaving(true);
      setError(null);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const parentData = {
        user_id: user.id,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone: phone.trim(),
        onboarding_status: 'parent_profile_complete',
      };

      let result;
      if (parentProfile?.id) {
        const { data, error: err } = await supabase
          .from('parents')
          .update(parentData)
          .eq('id', parentProfile.id)
          .select()
          .single();
        if (err) throw err;
        result = data;
      } else {
        const { data, error: err } = await supabase
          .from('parents')
          .insert(parentData)
          .select()
          .single();
        if (err) throw err;
        result = data;
      }

      setParentProfile(result);
      setCurrentStep(1);
      return result;
    } catch (err) {
      console.error('[Onboarding] Save parent error:', err);
      setError(err.message || 'Failed to save profile');
      throw err;
    } finally {
      setSaving(false);
    }
  }, [parentProfile]);

  // Step 2: Save child
  const saveChild = useCallback(async ({ firstName, lastName, dob, gender, notes }) => {
    try {
      setSaving(true);
      setError(null);

      if (!parentProfile?.id) throw new Error('Parent profile required');

      const childPayload = {
        parent_id: parentProfile.id,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        dob,
        gender: gender || null,
        notes: notes?.trim() || null,
      };

      let result;
      if (childData?.id) {
        const { data, error: err } = await supabase
          .from('children')
          .update(childPayload)
          .eq('id', childData.id)
          .select()
          .single();
        if (err) throw err;
        result = data;
      } else {
        const { data, error: err } = await supabase
          .from('children')
          .insert(childPayload)
          .select()
          .single();
        if (err) throw err;
        result = data;
      }

      // Update onboarding status
      await supabase
        .from('parents')
        .update({ onboarding_status: 'child_created' })
        .eq('id', parentProfile.id);

      setChildData(result);
      setParentProfile(prev => ({ ...prev, onboarding_status: 'child_created' }));
      setCurrentStep(2);
      return result;
    } catch (err) {
      console.error('[Onboarding] Save child error:', err);
      setError(err.message || 'Failed to save child');
      throw err;
    } finally {
      setSaving(false);
    }
  }, [parentProfile, childData]);

  // Step 3: Save medical acknowledgement
  const saveMedicalAck = useCallback(async ({
    hasAllergies,
    hasMedications,
    hasMedicalConditions,
    allergiesSummary,
    medicationsSummary,
    medicalConditionsSummary,
  }) => {
    try {
      setSaving(true);
      setError(null);

      if (!childData?.id) throw new Error('Child record required');

      const medPayload = {
        child_id: childData.id,
        has_allergies: hasAllergies,
        has_medications: hasMedications,
        has_medical_conditions: hasMedicalConditions,
        allergies_summary: hasAllergies ? allergiesSummary?.trim() || null : null,
        medications_summary: hasMedications ? medicationsSummary?.trim() || null : null,
        medical_conditions_summary: hasMedicalConditions ? medicalConditionsSummary?.trim() || null : null,
      };

      let result;
      if (medicalData?.id) {
        const { data, error: err } = await supabase
          .from('child_medical_profiles')
          .update(medPayload)
          .eq('id', medicalData.id)
          .select()
          .single();
        if (err) throw err;
        result = data;
      } else {
        const { data, error: err } = await supabase
          .from('child_medical_profiles')
          .insert(medPayload)
          .select()
          .single();
        if (err) throw err;
        result = data;
      }

      await supabase
        .from('parents')
        .update({ onboarding_status: 'medical_ack_complete' })
        .eq('id', parentProfile.id);

      setMedicalData(result);
      setParentProfile(prev => ({ ...prev, onboarding_status: 'medical_ack_complete' }));
      setCurrentStep(3);
      return result;
    } catch (err) {
      console.error('[Onboarding] Save medical error:', err);
      setError(err.message || 'Failed to save medical info');
      throw err;
    } finally {
      setSaving(false);
    }
  }, [childData, medicalData, parentProfile]);

  // Step 4: Save emergency contacts
  const saveEmergencyContacts = useCallback(async (contacts) => {
    try {
      setSaving(true);
      setError(null);

      if (!childData?.id) throw new Error('Child record required');
      if (!contacts || contacts.length === 0) throw new Error('At least one emergency contact required');

      // Delete existing contacts and re-insert
      await supabase
        .from('emergency_contacts')
        .delete()
        .eq('child_id', childData.id);

      const contactPayloads = contacts.map((c, i) => ({
        child_id: childData.id,
        first_name: c.firstName.trim(),
        last_name: c.lastName.trim(),
        relationship: c.relationship.trim(),
        phone: c.phone.trim(),
        email: c.email?.trim() || null,
        is_primary: i === 0,
        priority_order: i + 1,
      }));

      const { data, error: err } = await supabase
        .from('emergency_contacts')
        .insert(contactPayloads)
        .select();

      if (err) throw err;

      await supabase
        .from('parents')
        .update({ onboarding_status: 'emergency_contact_added' })
        .eq('id', parentProfile.id);

      setEmergencyContacts(data);
      setParentProfile(prev => ({ ...prev, onboarding_status: 'emergency_contact_added' }));
      setCurrentStep(4);
      return data;
    } catch (err) {
      console.error('[Onboarding] Save emergency contacts error:', err);
      setError(err.message || 'Failed to save emergency contacts');
      throw err;
    } finally {
      setSaving(false);
    }
  }, [childData, parentProfile]);

  // Step 5: Save authorized pickups (or skip)
  const saveAuthorizedPickups = useCallback(async (pickups, skip = false) => {
    try {
      setSaving(true);
      setError(null);

      if (!childData?.id) throw new Error('Child record required');

      if (skip) {
        setSkippedPickups(true);
        setCurrentStep(5);
        return [];
      }

      // Delete existing and re-insert
      await supabase
        .from('authorized_pickups')
        .delete()
        .eq('child_id', childData.id);

      if (pickups && pickups.length > 0) {
        const pickupPayloads = pickups.map(p => ({
          child_id: childData.id,
          first_name: p.firstName.trim(),
          last_name: p.lastName.trim(),
          relationship: p.relationship.trim(),
          phone: p.phone.trim(),
          email: p.email?.trim() || null,
          verification_pin_hash: p.pinHash || null,
          is_active: true,
        }));

        const { data, error: err } = await supabase
          .from('authorized_pickups')
          .insert(pickupPayloads)
          .select();

        if (err) throw err;
        setAuthorizedPickups(data);
        setCurrentStep(5);
        return data;
      }

      setCurrentStep(5);
      return [];
    } catch (err) {
      console.error('[Onboarding] Save pickups error:', err);
      setError(err.message || 'Failed to save authorized pickups');
      throw err;
    } finally {
      setSaving(false);
    }
  }, [childData]);

  // Step 6: Complete onboarding
  const completeOnboarding = useCallback(async () => {
    try {
      setSaving(true);
      setError(null);

      if (!parentProfile?.id) throw new Error('Parent profile required');

      // Verify completion requirements
      if (!childData?.id) throw new Error('At least one child is required');
      if (!medicalData?.id) throw new Error('Medical acknowledgement is required');
      if (emergencyContacts.length === 0) throw new Error('At least one emergency contact is required');

      await supabase
        .from('parents')
        .update({ onboarding_status: 'complete' })
        .eq('id', parentProfile.id);

      setParentProfile(prev => ({ ...prev, onboarding_status: 'complete' }));
      return true;
    } catch (err) {
      console.error('[Onboarding] Complete error:', err);
      setError(err.message || 'Failed to complete onboarding');
      throw err;
    } finally {
      setSaving(false);
    }
  }, [parentProfile, childData, medicalData, emergencyContacts]);

  const goBack = useCallback(() => {
    setCurrentStep(prev => Math.max(prev - 1, 0));
  }, []);

  const isComplete = parentProfile?.onboarding_status === 'complete';

  return {
    // Step navigation
    currentStep,
    currentStepId,
    totalSteps,
    progress,
    isFirstStep,
    isLastStep,
    goBack,

    // State
    loading,
    saving,
    error,
    isComplete,
    setError,

    // Data
    parentProfile,
    childData,
    medicalData,
    emergencyContacts,
    authorizedPickups,
    skippedPickups,

    // Actions
    saveParentProfile,
    saveChild,
    saveMedicalAck,
    saveEmergencyContacts,
    saveAuthorizedPickups,
    completeOnboarding,
    loadOnboardingState,
  };
}
