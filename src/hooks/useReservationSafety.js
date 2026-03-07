// src/hooks/useReservationSafety.js — Reservation safety gate
// Prevents reservations when safety requirements are incomplete.

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export function useReservationSafety(childId) {
  const [safetyStatus, setSafetyStatus] = useState({
    loading: true,
    canReserve: false,
    missingRequirements: [],
  });

  const checkSafety = useCallback(async () => {
    if (!childId) {
      setSafetyStatus({ loading: false, canReserve: false, missingRequirements: ['No child selected'] });
      return;
    }

    try {
      const missing = [];

      // Check emergency contacts
      const { data: contacts, error: ecErr } = await supabase
        .from('emergency_contacts')
        .select('id')
        .eq('child_id', childId)
        .limit(1);

      if (ecErr) throw ecErr;
      if (!contacts || contacts.length === 0) {
        missing.push('At least one emergency contact is required');
      }

      // Check medical acknowledgement
      const { data: medical, error: medErr } = await supabase
        .from('child_medical_profiles')
        .select('id')
        .eq('child_id', childId)
        .maybeSingle();

      if (medErr) throw medErr;
      if (!medical) {
        missing.push('Medical acknowledgement must be completed');
      }

      setSafetyStatus({
        loading: false,
        canReserve: missing.length === 0,
        missingRequirements: missing,
      });
    } catch (err) {
      console.error('[ReservationSafety] Check failed:', err);
      setSafetyStatus({
        loading: false,
        canReserve: false,
        missingRequirements: ['Unable to verify safety requirements'],
      });
    }
  }, [childId]);

  useEffect(() => {
    checkSafety();
  }, [checkSafety]);

  return { ...safetyStatus, recheckSafety: checkSafety };
}
