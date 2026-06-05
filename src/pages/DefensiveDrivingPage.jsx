// src/pages/DefensiveDrivingPage.jsx
// In-house Georgia 6-Hour Defensive Driving — marketing landing + enrollment.
// Dark brand styling. The enrollment card (magic-link sign-in / checkout) lives
// in the hero (#enroll); CTAs throughout scroll to it.
import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ShieldCheck, Clock, FileText, Loader2, AlertCircle, RefreshCw, Mail,
  Check, ChevronDown, Award, BadgeCheck, GraduationCap, CreditCard,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { getDefensiveDrivingCourse, getMyEnrollment, getModules, createCheckout, formatPrice } from '../lib/ddApi';

export default function DefensiveDrivingPage() {
  const { user, profile, loading: authLoading } = useAuth();
  const [searchParams] = useSearchParams();
  const canceled = searchParams.get('canceled') === '1';

  const [course, setCourse] = useState(null);
  const [enrollment, setEnrollment] = useState(null);
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sentEmail, setSentEmail] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const c = await getDefensiveDrivingCourse();
        if (!active) return;
        setCourse(c);
        if (c) {
          const [mods, enr] = await Promise.all([
            getModules(c.id).catch(() => []),
            user ? getMyEnrollment(c.id).catch(() => null) : Promise.resolve(null),
          ]);
          if (!active) return;
          setModules(mods || []);
          setEnrollment(enr);
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
  if (sentEmail) {
    return <CheckEmail email={sentEmail} onReset={() => setSentEmail(null)} />;
  }

  const price = formatPrice(course.price_cents, course.currency);

  return (
    <div className="bg-gray-950 text-gray-50 min-h-screen">
      {/* ── Hero ───────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-gray-800">
        <div className="absolute inset-0 bg-gradient-to-b from-success-500/10 via-gray-950 to-gray-950 pointer-events-none" />
        <div className="relative max-w-6xl mx-auto px-4 py-12 lg:py-20 grid lg:grid-cols-[1.15fr_1fr] gap-10 lg:gap-14 items-start">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-success-300 mb-3">Defensive Driving · Georgia</p>
            <h1 className="text-4xl md:text-5xl font-black tracking-tight leading-[1.05] mb-4">
              {course.title}
            </h1>
            <p className="text-lg text-gray-300 max-w-xl mb-6">
              A self-paced online defensive driving course built to help you earn an
              auto-insurance premium discount. Complete the modules, pass the final exam,
              and your certificate is forwarded to the agency automatically.
            </p>
            <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-gray-300 mb-8">
              {['100% online & self-paced', 'Progress saved automatically', 'Certificate forwarded for you'].map((t) => (
                <li key={t} className="flex items-center gap-2"><Check className="w-4 h-4 text-success-400" /> {t}</li>
              ))}
            </ul>
            <div className="flex items-center gap-4">
              <a href="#enroll" className="rounded-full px-7 py-3.5 text-sm font-semibold bg-success-400 hover:bg-success-300 text-gray-950 transition">
                Enroll for {price}
              </a>
              <span className="text-sm text-gray-400">One-time payment</span>
            </div>
          </div>

          <div id="enroll" className="scroll-mt-24">
            {canceled && (
              <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                Checkout was canceled. You can start again whenever you’re ready.
              </div>
            )}
            <EnrollCard course={course} enrollment={enrollment} user={user} profile={profile} onSent={setSentEmail} />
          </div>
        </div>
      </section>

      {/* ── Why take it ────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <SectionHeading eyebrow="Why drivers choose it" title="A discount that pays for itself" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Benefit icon={ShieldCheck} title="Lower your premium"
            body="May qualify you for a defensive-driver discount with your auto insurer." />
          <Benefit icon={Clock} title="100% online, self-paced"
            body="Start, stop, and resume anytime — your progress is always saved." />
          <Benefit icon={Award} title="Certificate done for you"
            body="Pass the exam and your certificate is generated and sent to the agency automatically." />
          <Benefit icon={RefreshCw} title="Good for three years"
            body="Complete once every three years; your discount stays on your policy the whole time." />
        </div>
      </section>

      {/* ── How it works ───────────────────────────────────── */}
      <section className="border-y border-gray-800 bg-gray-900/30">
        <div className="max-w-6xl mx-auto px-4 py-16">
          <SectionHeading eyebrow="How it works" title="From sign-in to certificate in four steps" />
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Step n={1} icon={Mail} title="Sign in" body="No password — we email you a secure sign-in link." />
            <Step n={2} icon={GraduationCap} title="Complete the modules" body="Six short modules with quick section checks." />
            <Step n={3} icon={BadgeCheck} title="Pass the final exam" body={`${course.exam_question_count} questions · ${course.pass_threshold_pct}% to pass.`} />
            <Step n={4} icon={FileText} title="Get your certificate" body="Download it instantly — and it’s forwarded to the agency." />
          </div>
        </div>
      </section>

      {/* ── What you'll learn ──────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <SectionHeading eyebrow="The curriculum" title="What you’ll learn" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(modules.length ? modules : FALLBACK_MODULES).map((m, i) => (
            <div key={m.id || i} className="rounded-xl border border-gray-800 bg-gray-900/50 p-5">
              <p className="text-xs font-semibold text-success-300 mb-1">Module {m.ordinal || i + 1}</p>
              <p className="font-semibold text-gray-100">{m.title}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pricing ────────────────────────────────────────── */}
      <section className="border-t border-gray-800 bg-gray-900/30">
        <div className="max-w-xl mx-auto px-4 py-16 text-center">
          <SectionHeading eyebrow="Simple pricing" title="One price, everything included" center />
          <div className="rounded-2xl border border-success-500/30 bg-gradient-to-br from-success-500/10 to-gray-900/60 p-8">
            <div className="flex items-baseline justify-center gap-2 mb-5">
              <span className="text-5xl font-black text-success-300">{price}</span>
              <span className="text-sm text-gray-400">one-time</span>
            </div>
            <ul className="space-y-2.5 text-left max-w-sm mx-auto mb-7">
              {[
                'All 6 modules and the final exam',
                'Instant, downloadable certificate of completion',
                'Certificate automatically forwarded to the agency',
                'Valid for three years',
              ].map((t) => (
                <li key={t} className="flex items-start gap-2.5 text-sm text-gray-200">
                  <Check className="w-4 h-4 text-success-400 shrink-0 mt-0.5" /> {t}
                </li>
              ))}
            </ul>
            <a href="#enroll" className="inline-flex items-center gap-2 rounded-full px-8 py-3.5 text-sm font-semibold bg-success-400 hover:bg-success-300 text-gray-950 transition">
              <CreditCard className="w-4 h-4" /> Enroll now
            </a>
          </div>
        </div>
      </section>

      {/* ── FAQ ────────────────────────────────────────────── */}
      <section className="max-w-3xl mx-auto px-4 py-16">
        <SectionHeading eyebrow="Questions" title="Frequently asked questions" center />
        <FAQ items={FAQ_ITEMS} />
      </section>

      {/* ── Compliance footer ──────────────────────────────── */}
      <footer className="border-t border-gray-800">
        <div className="max-w-3xl mx-auto px-4 py-10">
          <p className="text-xs text-gray-500 leading-relaxed">{course.compliance_label}</p>
          {course.is_dds_approved && course.dds_provider_no && (
            <p className="text-xs text-gray-500 mt-2">DDS Provider #: {course.dds_provider_no}</p>
          )}
        </div>
      </footer>
    </div>
  );
}

const FALLBACK_MODULES = [
  { ordinal: 1, title: 'Foundations of Defensive Driving' },
  { ordinal: 2, title: 'Human Factors: Vision, Distraction & Fatigue' },
  { ordinal: 3, title: 'Impairment: Alcohol, Drugs & Medications' },
  { ordinal: 4, title: 'Space & Speed Management' },
  { ordinal: 5, title: 'Sharing the Road' },
  { ordinal: 6, title: 'Adverse Conditions & Emergencies' },
];

const FAQ_ITEMS = [
  { q: 'Who is this course for?', a: 'Georgia drivers who want to earn an auto-insurance premium discount and brush up on safe-driving skills. Check with your insurer about discount eligibility.' },
  { q: 'How long does it take?', a: 'It’s fully self-paced. Work through the six modules and the final exam at your own speed — your progress is saved, so you can stop and resume anytime.' },
  { q: 'How do I get my certificate?', a: 'As soon as you pass the final exam, your certificate of completion is generated. You can download it immediately, and it’s automatically forwarded to the agency for your discount review.' },
  { q: 'How often do I need to take it?', a: 'Once every three years. Your discount stays on your auto policy for the full three-year period.' },
  { q: 'Do I have to finish it all at once?', a: 'No. Sign back in anytime with a secure email link and pick up exactly where you left off.' },
  { q: 'Is this course DDS-certified?', a: 'Insurance premium discounts are determined by your insurer. This course is not represented as DDS-certified for license points reduction.' },
];

// ---- Presentational helpers ------------------------------------------------
function SectionHeading({ eyebrow, title, center }) {
  return (
    <div className={`mb-8 ${center ? 'text-center' : ''}`}>
      <p className="text-xs uppercase tracking-[0.2em] text-success-300 mb-2">{eyebrow}</p>
      <h2 className="text-2xl md:text-3xl font-black tracking-tight">{title}</h2>
    </div>
  );
}

function Benefit({ icon, title, body }) {
  const Icon = icon;
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-5">
      <div className="w-10 h-10 rounded-lg bg-success-500/15 flex items-center justify-center mb-3">
        <Icon className="w-5 h-5 text-success-300" />
      </div>
      <p className="font-semibold text-gray-100 mb-1">{title}</p>
      <p className="text-sm text-gray-400 leading-relaxed">{body}</p>
    </div>
  );
}

function Step({ n, icon, title, body }) {
  const Icon = icon;
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-950 p-5">
      <div className="flex items-center gap-3 mb-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-success-500/20 text-sm font-bold text-success-200">{n}</span>
        <Icon className="w-5 h-5 text-success-300" />
      </div>
      <p className="font-semibold text-gray-100 mb-1">{title}</p>
      <p className="text-sm text-gray-400 leading-relaxed">{body}</p>
    </div>
  );
}

function FAQ({ items }) {
  const [open, setOpen] = useState(0);
  return (
    <div className="space-y-3">
      {items.map((it, i) => (
        <div key={i} className="rounded-xl border border-gray-800 bg-gray-900/50 overflow-hidden">
          <button onClick={() => setOpen(open === i ? -1 : i)}
            className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left"
            aria-expanded={open === i}>
            <span className="font-medium text-gray-100">{it.q}</span>
            <ChevronDown className={`w-5 h-5 text-gray-400 shrink-0 transition-transform ${open === i ? 'rotate-180' : ''}`} />
          </button>
          {open === i && <p className="px-5 pb-5 -mt-1 text-sm text-gray-300 leading-relaxed">{it.a}</p>}
        </div>
      ))}
    </div>
  );
}

// ---- Enrollment card (price + auth/checkout) -------------------------------
function EnrollCard({ course, enrollment, user, profile, onSent }) {
  const hasAccess = enrollment && (enrollment.status === 'active' || enrollment.status === 'completed');
  return (
    <div className="rounded-2xl border border-success-500/30 bg-gradient-to-br from-success-500/10 to-gray-900/60 p-6 shadow-xl">
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
        <AuthPanel onSent={onSent} />
      )}
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

// --- Large centered brand mark (matches the nav logo) -----------------------
function BrandLogo() {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative">
        <div className="absolute -inset-1.5 bg-gradient-to-r from-emerald-400 to-teal-500 rounded-2xl opacity-70 blur-md" />
        <div className="relative w-20 h-20 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-2xl flex items-center justify-center shadow-xl">
          <svg className="w-11 h-11 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        </div>
      </div>
      <div className="text-center">
        <div className="font-black text-3xl tracking-tight text-white">insuredbycam</div>
        <div className="text-sm text-gray-400">Insurance shopping, simplified</div>
      </div>
    </div>
  );
}

// --- Full-page confirmation shown after a magic link is sent ----------------
function CheckEmail({ email, onReset }) {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-50 flex flex-col items-center justify-center px-4 py-16">
      <BrandLogo />
      <div className="mt-12 w-full max-w-md text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-success-500/15">
          <Mail className="h-7 w-7 text-success-300" />
        </div>
        <h1 className="text-2xl font-bold text-success-100 mb-4">Check your email</h1>
        <p className="text-gray-300 leading-relaxed">We sent a secure sign-in link to</p>
        <p className="my-3 text-lg font-semibold text-white break-words">{email}</p>
        <p className="text-gray-400 leading-relaxed">
          Open it on this device to continue enrolling. The link expires shortly for your security.
        </p>
        <div className="mt-10 flex flex-col items-center gap-4">
          <button type="button" onClick={onReset}
            className="text-sm font-medium text-gray-300 hover:text-white underline underline-offset-2">
            Use a different email
          </button>
          <Link to="/" className="text-xs text-gray-500 hover:text-gray-300">Back to insuredbycam.com</Link>
        </div>
      </div>
    </div>
  );
}

// --- Passwordless magic-link auth for customers (role: 'insured') -----------
function AuthPanel({ onSent }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setError(null); setBusy(true);
    try {
      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
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
      onSent(email);
    } catch (err) {
      setError(err.message || 'Could not send the sign-in link.');
    } finally {
      setBusy(false);
    }
  };

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
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="w-full rounded-lg bg-white text-gray-900 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-success-400"
      />
    </label>
  );
}
