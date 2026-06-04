// src/lib/ddApi.js — Defensive Driving client API
import { supabase } from './supabase';

export const DD_COURSE_SLUG = 'georgia-6hr-defensive-driving';

/** Public catalog read of the active course (RLS allows anon to read active). */
export async function getDefensiveDrivingCourse() {
  const { data, error } = await supabase
    .from('dd_courses')
    .select('id, slug, title, price_cents, currency, min_seat_seconds, pass_threshold_pct, is_active, is_dds_approved, compliance_label, dds_provider_no')
    .eq('slug', DD_COURSE_SLUG)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** The signed-in user's enrollment for the course, if any. */
export async function getMyEnrollment(courseId) {
  const { data, error } = await supabase
    .from('dd_enrollments')
    .select('id, status, stripe_session_id, purchased_at, completed_at')
    .eq('course_id', courseId)
    .neq('status', 'expired')
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Create a Stripe Checkout session for the course.
 * @returns {{url: string, enrollment_id: string}}
 */
export async function createCheckout({ studentName, dln, dob, courseSlug = DD_COURSE_SLUG }) {
  const { data, error } = await supabase.functions.invoke('dd-create-checkout', {
    body: { course_slug: courseSlug, student_name: studentName, dln, dob },
  });
  if (error) {
    // Surface the function's JSON error message when available.
    let message = error.message || 'Could not start checkout.';
    try {
      const body = await error.context?.json?.();
      if (body?.error) message = body.error;
    } catch { /* ignore */ }
    const e = new Error(message);
    e.cause = error;
    throw e;
  }
  return data;
}

export function formatPrice(cents, currency = 'usd') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() })
    .format((cents || 0) / 100);
}

// ---- Course engine (Phase 3) ----------------------------------------------

/** Ordered modules for the course (RLS: readable by enrolled users). */
export async function getModules(courseId) {
  const { data, error } = await supabase
    .from('dd_modules')
    .select('id, ordinal, title, min_seconds, content_ref')
    .eq('course_id', courseId)
    .order('ordinal', { ascending: true });
  if (error) throw error;
  return data || [];
}

/** The user's per-module progress rows for an enrollment. */
export async function getProgress(enrollmentId) {
  const { data, error } = await supabase
    .from('dd_module_progress')
    .select('module_id, seconds_spent, kc_passed, completed_at')
    .eq('enrollment_id', enrollmentId);
  if (error) throw error;
  return data || [];
}

/** Server-accumulated seat time. Returns {seconds_spent, min_seconds, kc_passed, completed}. */
export async function heartbeat(moduleId, seconds = 15) {
  const { data, error } = await supabase.rpc('dd_heartbeat', { p_module_id: moduleId, p_seconds: seconds });
  if (error) throw error;
  return data;
}

/** Knowledge-check questions for a module (no answer keys). */
export async function getModuleQuestions(moduleId) {
  const { data, error } = await supabase.rpc('dd_get_module_questions', { p_module_id: moduleId });
  if (error) throw error;
  return data || [];
}

/** Submit knowledge-check answers ({questionId: key}). Scored server-side. */
export async function submitKnowledgeCheck(moduleId, answers) {
  const { data, error } = await supabase.rpc('dd_submit_knowledge_check', {
    p_module_id: moduleId,
    p_answers: answers,
  });
  if (error) throw error;
  return data;
}
