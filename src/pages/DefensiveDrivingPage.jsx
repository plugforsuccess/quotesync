// src/pages/DefensiveDrivingPage.jsx
// In-house Georgia 6-Hour Defensive Driving — landing + enrollment + checkout.
import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ShieldCheck, Clock, FileText, Loader2, AlertCircle, RefreshCw, Mail } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { getDefensiveDrivingCourse, getMyEnrollment, createCheckout, formatPrice } from '../lib/ddApi';

export default function DefensiveDrivingPage() {
  const { user, profile, loading: authLoading } = useAuth();
  const [searchParams] = useSearchParams();
  const canceled = searchParams.get('canceled') === '1';

  const [course, setCourse] = useState(null);
  const [enrollment, setEnrollment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const c = await getDefensiveDrivingCourse();
        if (!active) return;
        setCourse(c);
        if (user && c) {
          const e = await getMyEnrollment(c.id);
          if (active) setEnrollment(e);
        }
      } catch (err) {
        if (active) setError(err.message || 'Failed to load course.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [user]);

  if (loading || authLoading) {
    return <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-success-400 animate-spin" />
    </div>;
  }

  if (!course) {
    return <div className="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center p-6">
      <p>This course isn’t available right now. {error}</p>
    </div>;
  }

  const hasAccess = enrollment && (enrollment.status === 'active' || enrollment.status === 'completed');

  return (
    <div className="bg-gray-950 text-gray-50 min-h-screen">
      <div className="max-w-5xl mx-auto px-4 py-12 lg:py-16">
        <p className="text-xs uppercase tracking-[0.2em] text-success-300 mb-3">Defensive Driving · Georgia</p>
        <h1 className="text-3xl md:text-4xl font-black tracking-tight mb-3">{course.title}</h1>
        <p className="text-sm md:text-base text-gray-300 max-w-2xl mb-8">
          A six-hour, self-paced online defensive driving course. Complete the modules,
          pass the final exam, and download your certificate of completion.
        </p>

        {canceled && (
          <div className="mb-6 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            Checkout was canceled. You can start again whenever you’re ready.
          </div>
        )}

        <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
          {/* Left: details */}
          <div className="space-y-6">
            <ul className="space-y-4 text-sm text-gray-300">
              <li className="flex gap-3"><Clock className="w-5 h-5 text-success-400 shrink-0" /> 6 hours of instruction across 6 modules, at your own pace</li>
              <li className="flex gap-3"><ShieldCheck className="w-5 h-5 text-success-400 shrink-0" /> Pass the final exam at {course.pass_threshold_pct}% or higher</li>
              <li className="flex gap-3"><FileText className="w-5 h-5 text-success-400 shrink-0" /> Downloadable certificate, automatically forwarded to the agency</li>
              <li className="flex gap-3"><RefreshCw className="w-5 h-5 text-success-400 shrink-0" /> Complete the course once every three years — your discount stays on your auto policy for the full three years</li>
            </ul>

            {/* Compliance copy — pulled from config, never hardcoded (§3) */}
            <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
              <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">Important</p>
              <p className="text-sm text-gray-300 leading-relaxed">{course.compliance_label}</p>
              {course.is_dds_approved && course.dds_provider_no && (
                <p className="text-xs text-gray-400 mt-2">DDS Provider #: {course.dds_provider_no}</p>
              )}
            </div>
          </div>

          {/* Right: purchase / status card */}
          <div className="rounded-2xl border border-success-500/30 bg-gradient-to-br from-success-500/10 to-gray-900/60 p-6 h-fit">
            <div className="flex items-baseline gap-2 mb-4">
              <span className="text-3xl font-bold text-success-300">{formatPrice(course.price_cents, course.currency)}</span>
              <span className="text-xs text-gray-400">one-time</span>
            </div>

            {hasAccess ? (
              <div className="space-y-3">
                <p className="text-sm text-success-200">You’re enrolled.</p>
                <Link to="/courses/defensive-driving/portal"
                  className="block text-center w-full rounded-full py-3 text-sm font-semibold bg-success-400 hover:bg-success-300 text-gray-950 transition">
                  Go to your course
                </Link>
              </div>
            ) : user ? (
              <EnrollForm course={course} defaultName={profile?.full_name || ''} />
            ) : (
              <AuthPanel />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Enrollment form (signed-in users) --------------------------------------
function EnrollForm({ course, defaultName }) {
  const [studentName, setStudentName] = useState(defaultName);
  const [dln, setDln] = useState('');
  const [dob, setDob] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { url } = await createCheckout({ studentName, dln, dob, courseSlug: course.slug });
      if (url) window.location.assign(url);
      else throw new Error('No checkout URL returned.');
    } catch (err) {
      setError(err.message || 'Could not start checkout.');
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <p className="text-xs text-gray-400">Enter your legal details exactly as they should appear on your certificate.</p>
      <Field label="Legal name" value={studentName} onChange={setStudentName} placeholder="First Middle Last" autoComplete="name" />
      <Field label="Driver license number" value={dln} onChange={(v) => setDln(v.toUpperCase())} placeholder="GA DLN" />
      <Field label="Date of birth" type="date" value={dob} onChange={setDob} />
      {error && <p className="flex items-start gap-2 text-xs text-red-300"><AlertCircle className="w-4 h-4 shrink-0" />{error}</p>}
      <button type="submit" disabled={submitting}
        className="w-full rounded-full py-3 text-sm font-semibold bg-success-400 hover:bg-success-300 disabled:opacity-60 text-gray-950 transition flex items-center justify-center gap-2">
        {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Redirecting…</> : 'Enroll & Pay'}
      </button>
      <p className="text-[11px] text-gray-500 text-center">Secure checkout with Stripe.</p>
    </form>
  );
}

// --- Passwordless magic-link auth for customers (role: 'insured') -----------
function AuthPanel() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(null); setBusy(true);
    try {
      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          // New users get the safe 'insured' role; existing users keep theirs.
          data: {
            role: 'insured',
            full_name: fullName || undefined,
            first_name: firstName.trim() || undefined,
            last_name: lastName.trim() || undefined,
          },
          emailRedirectTo: `${window.location.origin}/courses/defensive-driving`,
        },
      });
      if (error) throw error;
      setSent(true);
    } catch (err) {
      setError(err.message || 'Could not send the sign-in link.');
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="text-center py-4">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-success-500/15">
          <Mail className="h-6 w-6 text-success-300" />
        </div>
        <h3 className="text-base font-semibold text-success-100 mb-4">Check your email</h3>
        <p className="text-sm text-gray-400 leading-relaxed">We sent a secure sign-in link to</p>
        <p className="my-3 text-sm font-semibold text-gray-100 break-words">{email}</p>
        <p className="text-sm text-gray-400 leading-relaxed">Open it on this device to continue enrolling.</p>
        <button type="button" onClick={() => setSent(false)}
          className="mt-7 text-xs font-medium text-gray-400 underline-offset-2 hover:text-gray-200 hover:underline">
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-gray-200">Sign in to start or continue</p>
      <p className="text-xs text-gray-400">New or returning, we’ll email you a secure sign-in link — no password needed.</p>
      <Field label="Driver's first name" value={firstName} onChange={setFirstName} autoComplete="given-name" />
      <Field label="Driver's last name" value={lastName} onChange={setLastName} autoComplete="family-name" />
      <Field label="Email address" type="email" value={email} onChange={setEmail} autoComplete="email" />
      {error && <p className="flex items-start gap-2 text-xs text-red-300"><AlertCircle className="w-4 h-4 shrink-0" />{error}</p>}
      <div className="pt-4 flex justify-center">
        <button type="submit" disabled={busy}
          className="px-8 rounded-full py-3 text-sm font-semibold bg-success-400 hover:bg-success-300 disabled:opacity-60 text-gray-950 transition flex items-center justify-center gap-2">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Email me a sign-in link'}
        </button>
      </div>
    </form>
  );
}

function Field({ label, value, onChange, type = 'text', placeholder, autoComplete }) {
  return (
    <label className="block">
      <span className="block text-[11px] uppercase tracking-wider text-gray-500 mb-1">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        required
        className="w-full rounded-lg bg-gray-900 border border-gray-700 focus:border-success-500 focus:outline-none px-3 py-2 text-sm text-gray-100 placeholder-gray-600"
      />
    </label>
  );
}
