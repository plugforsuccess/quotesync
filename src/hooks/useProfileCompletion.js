// src/hooks/useProfileCompletion.js — Dashboard profile completion tracking
// Calculates completion percentage and missing items for parent profiles.

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const CHECKLIST_ITEMS = [
  { key: 'child_profile', label: 'Child profile', weight: 25 },
  { key: 'medical_profile', label: 'Medical profile', weight: 25 },
  { key: 'emergency_contacts', label: 'Emergency contacts', weight: 25 },
  { key: 'authorized_pickups', label: 'Authorized pickups', weight: 25 },
];

export function useProfileCompletion() {
  const [completion, setCompletion] = useState({
    loading: true,
    percentage: 0,
    items: [],
    isFullyComplete: false,
  });

  const calculateCompletion = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: parent } = await supabase
        .from('parents')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!parent) {
        setCompletion({ loading: false, percentage: 0, items: [], isFullyComplete: false });
        return;
      }

      const { data: children } = await supabase
        .from('children')
        .select('id')
        .eq('parent_id', parent.id)
        .limit(1);

      const childId = children?.[0]?.id;
      const items = [];

      // Child profile completeness (check for optional fields filled)
      if (childId) {
        const { data: child } = await supabase
          .from('children')
          .select('*')
          .eq('id', childId)
          .single();

        const hasExtras = !!(child?.gender && child?.notes);
        items.push({ ...CHECKLIST_ITEMS[0], complete: true, hasExtras });
      } else {
        items.push({ ...CHECKLIST_ITEMS[0], complete: false, hasExtras: false });
      }

      // Medical profile completeness
      if (childId) {
        const { data: medical } = await supabase
          .from('child_medical_profiles')
          .select('*')
          .eq('child_id', childId)
          .maybeSingle();

        const hasPhysician = !!(medical?.physician_name && medical?.physician_phone);
        items.push({
          ...CHECKLIST_ITEMS[1],
          complete: !!medical,
          hasExtras: hasPhysician,
          missingFields: !medical ? ['Medical acknowledgement'] :
            (!hasPhysician ? ['Physician name', 'Physician phone'] : []),
        });
      } else {
        items.push({ ...CHECKLIST_ITEMS[1], complete: false, hasExtras: false });
      }

      // Emergency contacts
      if (childId) {
        const { data: contacts } = await supabase
          .from('emergency_contacts')
          .select('id')
          .eq('child_id', childId);

        items.push({
          ...CHECKLIST_ITEMS[2],
          complete: (contacts?.length || 0) >= 1,
          count: contacts?.length || 0,
        });
      } else {
        items.push({ ...CHECKLIST_ITEMS[2], complete: false, count: 0 });
      }

      // Authorized pickups
      if (childId) {
        const { data: pickups } = await supabase
          .from('authorized_pickups')
          .select('id')
          .eq('child_id', childId);

        items.push({
          ...CHECKLIST_ITEMS[3],
          complete: (pickups?.length || 0) >= 1,
          count: pickups?.length || 0,
        });
      } else {
        items.push({ ...CHECKLIST_ITEMS[3], complete: false, count: 0 });
      }

      const completedWeight = items.reduce((sum, item) =>
        sum + (item.complete ? item.weight : 0), 0
      );
      const percentage = Math.round(completedWeight);
      const isFullyComplete = items.every(item => item.complete);

      setCompletion({ loading: false, percentage, items, isFullyComplete });
    } catch (err) {
      console.error('[ProfileCompletion] Error:', err);
      setCompletion({ loading: false, percentage: 0, items: [], isFullyComplete: false });
    }
  }, []);

  useEffect(() => {
    calculateCompletion();
  }, [calculateCompletion]);

  return { ...completion, refresh: calculateCompletion };
}
