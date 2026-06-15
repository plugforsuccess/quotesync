// src/hooks/useDeclarationUploads.js
// Manages a list of declarations-page uploads for one lead. Each successful
// upload+parse appends a parsed declaration. Used by both the early fast-path
// step and the confirmation-screen card so a lead can attach multiple dec pages
// (e.g. one auto + one home).
import { useState, useCallback } from 'react';
import { uploadDeclarationPdf } from '../lib/leadsApi';

export function useDeclarationUploads(resolveLeadId) {
  const [items, setItems] = useState([]); // parsed declarations, in upload order
  const [status, setStatus] = useState('idle'); // idle | working | error
  const [error, setError] = useState(null);
  const [pendingName, setPendingName] = useState(null);

  const upload = useCallback(async (file) => {
    if (!file) return null;
    setError(null);
    setPendingName(file.name);
    setStatus('working');
    try {
      const leadId = typeof resolveLeadId === 'function' ? await resolveLeadId() : resolveLeadId;
      if (!leadId) throw new Error('Still getting set up — give it a second and try again.');
      const res = await uploadDeclarationPdf({ leadId, file });
      const declaration = res?.declaration || {};
      setItems((prev) => [...prev, declaration]);
      setStatus('idle');
      setPendingName(null);
      return declaration;
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
      setStatus('error');
      setPendingName(null);
      return null;
    }
  }, [resolveLeadId]);

  return { items, status, error, pendingName, upload };
}
