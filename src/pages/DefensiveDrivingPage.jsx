// src/pages/DefensiveDrivingPage.jsx
// In-house Georgia 6-Hour Defensive Driving — marketing landing + enrollment.
// Consumer-site styling (royal-blue hero with the shared nav, white cards, deep-blue
// headings, the brand green as the accent; no black). The enrollment card (magic-link sign-in / checkout) lives
// in the hero (#enroll); CTAs throughout scroll to it.
import { T } from '../components/SiteCopy';
import Dismissible from '../components/Dismissible';
import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ShieldCheck, Clock, FileText, Loader2, AlertCircle, RefreshCw,
  Check, ChevronDown, Award, BadgeCheck, GraduationCap, CreditCard,
  Brain, Wine, Gauge, Users, CloudLightning, Scale, BookOpen,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { getDefensiveDrivingCourse, getMyEnrollment, getModules, createCheckout, formatPrice } from '../lib/ddApi';
import { getModuleContent } from '../data/ddCourseContent';
import { ConsumerNav, RateCheckFooter } from '../components/ConsumerNav';

const ACCENT = '#39FF88';
// Gold, not green, for text: the platform has no green text (green stays for buttons and fills).
const GOLD = '#F5D061';
const DEEP = '#0F2D6B';
const HERO_BG = 'linear-gradient(135deg, #1D4ED8 0%, #1E3A8A 55%, #0F2D6B 100%)';

export default function DefensiveDrivingPage() {
  const { user, profile, loading: authLoading } = useAuth();
  const [searchParams] = useSearchParams();
  const canceled = searchParams.get('canceled') === '1';

  const [course, setCourse] = useState(null);
  const [enrollment, setEnrollment] = useState(null);
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
    return <div className="min-h-screen bg-white flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-blue-700 animate-spin" />
    </div>;
  }
  if (!course) {
    return <div className="min-h-screen bg-white text-[#0F2D6B] flex items-center justify-center p-6">
      <p><T k="pages.defensivedrivingpage.08f6c9">This course isn’t available right now.</T> {error}</p>
    </div>;
  }
  const price = formatPrice(course.price_cents, course.currency);

  return (
    <div className="bg-white text-slate-700 min-h-screen">
      <title>Georgia 6-Hour Defensive Driving Course | Cam Wiley Agency</title>
      {/* ── Hero ───────────────────────────────────────────── */}
      <section className="relative overflow-hidden text-white" style={{ background: HERO_BG }}>
        <div aria-hidden="true" className="pointer-events-none absolute inset-0"
          style={{ background: 'radial-gradient(55% 50% at 5% 0%, rgba(96,165,250,0.35), transparent 70%), radial-gradient(45% 45% at 100% 100%, rgba(57,255,136,0.18), transparent 70%)' }} />
        <div className="relative max-w-6xl mx-auto px-4 lg:px-8">
          <ConsumerNav current="drivers" />
          <div className="py-10 lg:py-16 grid lg:grid-cols-[1.15fr_1fr] gap-10 lg:gap-14 items-start">
            <div>
              <Link to="/courses" className="mb-4 inline-block text-sm font-semibold text-blue-100 hover:text-white"><T k="pages.defensivedrivingpage.3401c4">← Drivers Ed</T></Link>
              <p className="text-xs font-bold uppercase tracking-[0.16em] mb-3" style={{ color: GOLD }}><T k="pages.defensivedrivingpage.9496f3">Defensive Driving · Georgia</T></p>
              <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight leading-[1.05] mb-4">
                <T>{course.title}</T>
              </h1>
              <p className="text-lg text-blue-100 max-w-xl mb-6">
                <T k="pages.defensivedrivingpage.4cdffd">A self-paced online defensive driving course built to help you earn an auto-insurance premium discount. Complete the modules, pass the final exam, and your certificate is forwarded to the agency automatically.</T>
              </p>
              <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-blue-50 mb-8">
                {['100% online & self-paced', 'Progress saved automatically', 'Certificate forwarded for you'].map((t) => (
                  <li key={t} className="flex items-center gap-2"><Check className="w-4 h-4" style={{ color: GOLD }} strokeWidth={3} /> <T>{t}</T></li>
                ))}
              </ul>
              <div className="flex items-center gap-4">
                <a href="#enroll" className="qb qb-gold qb-lg px-7">
                  <T k="pages.defensivedrivingpage.6ba3ba">Enroll For</T> {price}
                </a>
                <span className="text-sm text-blue-100"><T k="pages.defensivedrivingpage.47455c">One-time payment</T></span>
              </div>
            </div>

            <div id="enroll" className="scroll-mt-24">
              {canceled && (
                <Dismissible id="dd.checkout-canceled" version={String(Date.now())} light className="mb-4">
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    <T k="pages.defensivedrivingpage.dbb35d">Checkout was canceled. You can start again whenever you’re ready.</T>
                  </div>
                </Dismissible>
              )}
              <EnrollCard course={course} enrollment={enrollment} user={user} profile={profile} />
            </div>
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
      <section className="border-y border-slate-200 bg-slate-50">
        <div className="max-w-6xl mx-auto px-4 py-16">
          <SectionHeading eyebrow="How it works" title="From sign-in to certificate in four steps" />
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Step n={1} icon={ShieldCheck} title="Create your login" body="Just an email and a password — no codes or links to chase down." />
            <Step n={2} icon={GraduationCap} title="Complete the modules" body="Eight short modules with quick section checks." />
            <Step n={3} icon={BadgeCheck} title="Pass the final exam" body={`${course.exam_question_count} questions · ${course.pass_threshold_pct}% to pass.`} />
            <Step n={4} icon={FileText} title="Get your certificate" body="Download it instantly — and it’s forwarded to the agency." />
          </div>
        </div>
      </section>

      {/* ── What you'll learn ──────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <SectionHeading eyebrow="The curriculum" title="What you’ll learn" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
          {(modules.length ? modules : FALLBACK_MODULES).map((m, i) => (
            <ModuleCard key={m.id || i} m={m} index={i} />
          ))}
        </div>
      </section>

      {/* ── Pricing ────────────────────────────────────────── */}
      <section className="border-y border-slate-200 bg-slate-50">
        <div className="max-w-xl mx-auto px-4 py-16 text-center">
          <SectionHeading eyebrow="Simple pricing" title="One price, everything included" center />
          <div className="rounded-3xl border-2 bg-white p-8 shadow-[0_0_0_4px_rgba(57,255,136,0.18)]" style={{ borderColor: ACCENT }}>
            <div className="flex items-baseline justify-center gap-2 mb-5">
              <span className="text-5xl font-extrabold text-[#0F2D6B]">{price}</span>
              <span className="text-sm text-slate-500"><T k="pages.defensivedrivingpage.771120">one-time</T></span>
            </div>
            <ul className="space-y-2.5 text-left max-w-sm mx-auto mb-7">
              {[
                'All 8 modules and the final exam',
                'Instant, downloadable certificate of completion',
                'Certificate automatically forwarded to the agency',
                'Valid for three years',
              ].map((t) => (
                <li key={t} className="flex items-start gap-2.5 text-sm text-slate-700">
                  <Check className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" strokeWidth={3} /> <T>{t}</T>
                </li>
              ))}
            </ul>
            <a href="#enroll" className="qb qb-blue qb-lg px-8">
              <CreditCard className="w-4 h-4" /> <T k="pages.defensivedrivingpage.e3b2ff">Enroll Now</T>
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
      <div className="border-t border-slate-200 bg-slate-50 pt-8">
        <div className="max-w-6xl mx-auto px-4 pb-6 lg:px-8">
          <p className="text-xs text-slate-500 leading-relaxed">{course.compliance_label}</p>
          {course.is_dds_approved && course.dds_provider_no && (
            <p className="text-xs text-slate-500 mt-2"><T k="pages.defensivedrivingpage.8be54c">DDS Provider #:</T> {course.dds_provider_no}</p>
          )}
        </div>
        <RateCheckFooter wide />
      </div>
    </div>
  );
}

const FALLBACK_MODULES = [
  { ordinal: 1, title: 'Foundations of Defensive Driving', content_ref: 'm1-foundations' },
  { ordinal: 2, title: 'The Driver — Human Factors', content_ref: 'm2-human-factors' },
  { ordinal: 3, title: 'Impairment — Alcohol & Drugs', content_ref: 'm3-impairment' },
  { ordinal: 4, title: 'Space, Speed & Vehicle Control', content_ref: 'm4-space-speed' },
  { ordinal: 5, title: 'Sharing the Road', content_ref: 'm5-sharing-road' },
  { ordinal: 6, title: 'Conditions, Emergencies & Crash Response', content_ref: 'm6-emergencies' },
  { ordinal: 7, title: 'Georgia Traffic Laws', content_ref: 'm7-georgia-laws' },
  { ordinal: 8, title: 'Insurance, Claims & Your Record', content_ref: 'm8-insurance-claims' },
];

// Curriculum tile: a numbered badge, a topic icon, the module's summary and its lessons.
// Eight modules sit in an even 4 × 2 grid on desktop (2 columns on tablets).
const MODULE_ICONS = {
  'm1-foundations': ShieldCheck,
  'm2-human-factors': Brain,
  'm3-impairment': Wine,
  'm4-space-speed': Gauge,
  'm5-sharing-road': Users,
  'm6-emergencies': CloudLightning,
  'm7-georgia-laws': Scale,
  'm8-insurance-claims': FileText,
};

function ModuleCard({ m, index }) {
  const content = getModuleContent(m.content_ref);
  const lessons = (content?.sections || []).map((x) => x.heading).filter(Boolean);
  const Icon = MODULE_ICONS[m.content_ref] || BookOpen;
  const n = String(m.ordinal || index + 1).padStart(2, '0');
  const georgia = /georgia/i.test(m.title || '');
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-xl hover:shadow-blue-900/10 lg:p-5">
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1" style={{ background: `linear-gradient(90deg, #1D4ED8, ${ACCENT})` }} />
      <div className="mb-5 flex items-center justify-between">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl text-lg font-extrabold tracking-tight shadow-md shadow-blue-900/20" style={{ background: DEEP, color: GOLD }}>{n}</span>
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-50 text-blue-700 ring-1 ring-blue-100 transition group-hover:bg-blue-700 group-hover:text-white">
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <p className="mb-1 flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-blue-700">
        <T k="pages.defensivedrivingpage.e55f75">Module</T> {m.ordinal || index + 1}
        {georgia && <span className="rounded-full px-2 py-0.5 text-[10px] tracking-[0.1em]" style={{ background: 'rgba(57,255,136,0.18)', color: DEEP }}><T k="pages.defensivedrivingpage.1426fa">Georgia law</T></span>}
      </p>
      <h3 className="text-lg font-extrabold leading-snug tracking-tight text-[#0F2D6B]"><T>{m.title}</T></h3>
      {content?.summary && <p className="mt-2.5 pb-5 text-sm leading-relaxed text-slate-600">{content.summary}</p>}
      {lessons.length > 0 && (
        <div className="mt-auto border-t border-slate-100 pt-4">
          <p className="mb-2.5 inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">
            <BookOpen className="h-3.5 w-3.5" /> {lessons.length} <T k="pages.defensivedrivingpage.851adb">lessons</T>
          </p>
          <ul className="grid gap-1.5">
            {lessons.map((l) => (
              <li key={l} className="flex items-start gap-2 text-[13px] leading-snug text-slate-700">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-700" strokeWidth={3} /> {l}
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

const FAQ_ITEMS = [
  { q: 'Who is this course for?', a: 'Georgia drivers who want to earn an auto-insurance premium discount and brush up on safe-driving skills. Check with your insurer about discount eligibility.' },
  { q: 'How long does it take?', a: 'It’s fully self-paced. Work through the eight modules and the final exam at your own speed — your progress is saved, so you can stop and resume anytime.' },
  { q: 'How do I get my certificate?', a: 'As soon as you pass the final exam, your certificate of completion is generated. You can download it immediately, and it’s automatically forwarded to the agency for your discount review.' },
  { q: 'How often do I need to take it?', a: 'Once every three years. Your discount stays on your auto policy for the full three-year period.' },
  { q: 'Do I have to finish it all at once?', a: 'No. Sign back in anytime with a secure email link and pick up exactly where you left off.' },
  { q: 'Is this course DDS-certified?', a: 'Insurance premium discounts are determined by your insurer. This course is not represented as DDS-certified for license points reduction.' },
];

// ---- Presentational helpers ------------------------------------------------
function SectionHeading({ eyebrow, title, center }) {
  return (
    <div className={`mb-8 ${center ? 'text-center' : ''}`}>
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700 mb-2"><T>{eyebrow}</T></p>
      <h2 className="text-[28px] lg:text-[36px] font-extrabold leading-tight tracking-tight text-[#0F2D6B]"><T>{title}</T></h2>
    </div>
  );
}

function Benefit({ icon, title, body }) {
  const Icon = icon;
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6">
      <div className="w-11 h-11 rounded-2xl bg-blue-50 flex items-center justify-center mb-3">
        <Icon className="w-5 h-5 text-blue-700" />
      </div>
      <p className="font-bold text-[#0F2D6B] mb-1"><T>{title}</T></p>
      <p className="text-sm text-slate-600 leading-relaxed"><T>{body}</T></p>
    </div>
  );
}

function Step({ n, icon, title, body }) {
  const Icon = icon;
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6">
      <div className="flex items-center justify-between mb-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl text-base font-extrabold" style={{ background: DEEP, color: GOLD }}>{n}</span>
        <Icon className="w-5 h-5 text-slate-300" />
      </div>
      <p className="font-bold text-[#0F2D6B] mb-1"><T>{title}</T></p>
      <p className="text-sm text-slate-600 leading-relaxed"><T>{body}</T></p>
    </div>
  );
}

function FAQ({ items }) {
  const [open, setOpen] = useState(0);
  return (
    <div className="space-y-3">
      {items.map((it, i) => (
        <div key={i} className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <button onClick={() => setOpen(open === i ? -1 : i)}
            className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left"
            aria-expanded={open === i}>
            <span className="font-semibold text-[#0F2D6B]"><T>{it.q}</T></span>
            <ChevronDown className={`w-5 h-5 text-slate-400 shrink-0 transition-transform ${open === i ? 'rotate-180' : ''}`} />
          </button>
          {open === i && <p className="px-5 pb-5 -mt-1 text-sm text-slate-600 leading-relaxed"><T>{it.a}</T></p>}
        </div>
      ))}
    </div>
  );
}

// ---- Enrollment card (price + auth/checkout) -------------------------------
function EnrollCard({ course, enrollment, user, profile }) {
  const hasAccess = enrollment && (enrollment.status === 'active' || enrollment.status === 'completed');
  return (
    <div className="rounded-3xl bg-white p-6 text-slate-700 shadow-2xl shadow-blue-950/30 sm:p-7">
      <div className="flex items-baseline gap-2 mb-4">
        <span className="text-3xl font-extrabold text-[#0F2D6B]">{formatPrice(course.price_cents, course.currency)}</span>
        <span className="text-xs text-slate-500"><T k="pages.defensivedrivingpage.771120">one-time</T></span>
      </div>
      {hasAccess ? (
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-[#0F2D6B]">
            <span className="qc-badge qc-badge-sm" aria-hidden="true"><Check className="h-4 w-4" strokeWidth={3} /></span>
            <T k="pages.defensivedrivingpage.de80cb">You’re enrolled.</T>
          </p>
          <Link to="/courses/defensive-driving/portal"
            className="qb qb-blue qb-lg flex w-full">
            <T k="pages.defensivedrivingpage.21acac">Go to Your Course</T>
          </Link>
        </div>
      ) : user ? (
        <EnrollForm course={course} defaultName={profile?.full_name || ''} />
      ) : (
        <AuthPanel />
      )}
    </div>
  );
}

// --- Enrollment form (signed-in users) --------------------------------------
function EnrollForm({ course, defaultName }) {
  const [studentName, setStudentName] = useState(defaultName);
  const [dln, setDln] = useState('');
  const [dob, setDob] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!accepted) { setError('Please accept the terms and refund policy.'); return; }
    setSubmitting(true);
    try {
      const { url } = await createCheckout({ studentName, dln, dob, acceptTerms: true, courseSlug: course.slug });
      if (url) window.location.assign(url);
      else throw new Error('No checkout URL returned.');
    } catch (err) {
      setError(err.message || 'Could not start checkout.');
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <p className="text-xs text-slate-500"><T k="pages.defensivedrivingpage.d7c784">Enter your legal details exactly as they should appear on your certificate.</T></p>
      <Field label="Legal name" value={studentName} onChange={setStudentName} placeholder="First Middle Last" autoComplete="name" />
      <Field label="Driver license number" value={dln} onChange={(v) => setDln(v.toUpperCase())} placeholder="GA DLN" />
      <Field label="Date of birth" type="date" value={dob} onChange={setDob} />
      <label className="flex cursor-pointer items-start gap-2.5 text-sm text-slate-700">
        <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-blue-700" />
        <span data-copy="fixed">I agree to the <Link to="/terms#course-refunds" target="_blank" className="font-semibold text-blue-700 underline">terms and refund policy</Link>. I understand this course is not DDS-certified and any insurance discount is up to my insurer.</span>
      </label>
      {error && <p className="flex items-start gap-2 text-xs font-medium text-red-700"><AlertCircle className="w-4 h-4 shrink-0" />{error}</p>}
      <button type="submit" disabled={submitting}
        className="qb qb-blue qb-lg w-full">
        {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> <T k="pages.defensivedrivingpage.15f045">Redirecting…</T></> : <T k="pages.defensivedrivingpage.8eeeab">{'Enroll & Pay'}</T>}
      </button>
      <p className="text-[11px] text-slate-500 text-center"><T k="pages.defensivedrivingpage.21180b">Secure checkout with Stripe.</T></p>
    </form>
  );
}

// --- Email + password auth for customers (role: 'insured') ------------------
// No email verification code and no magic link — older customers struggle with
// those. New customers create a simple email + password; returning customers
// sign in with the same. (Requires "Confirm email" turned OFF in Supabase Auth
// so sign-up logs the customer straight in.)
function AuthPanel() {
  const [mode, setMode] = useState('create'); // 'create' | 'signin'
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const isCreate = mode === 'create';

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (password.trim().length < 6) {
      setError('Your password needs to be at least 6 characters.');
      return;
    }
    setBusy(true);
    try {
      if (isCreate) {
        const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              role: 'insured',
              full_name: fullName || undefined,
              first_name: firstName.trim() || undefined,
              last_name: lastName.trim() || undefined,
            },
          },
        });
        if (error) throw error;
        // With email confirmation off, sign-up returns a session and the auth
        // state change re-renders this page straight into enrollment.
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
      }
    } catch (err) {
      const msg = String(err?.message || '');
      if (/already registered|already exists/i.test(msg)) {
        setError('You already have an account with this email. Switch to “Sign in” below.');
      } else if (/invalid login credentials/i.test(msg)) {
        setError('That email or password didn’t match. Try again, or create an account.');
      } else if (/email not confirmed/i.test(msg)) {
        setError('This account isn’t active yet. Please call the agency so we can finish setting it up.');
      } else {
        setError(msg || 'Something went wrong. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-base font-bold text-[#0F2D6B]">{isCreate ? <T k="pages.defensivedrivingpage.657cf0">{'Create your account to start'}</T> : <T k="pages.defensivedrivingpage.9a7843">{'Sign in to continue'}</T>}</p>
      <p className="text-xs text-slate-500">
        {isCreate
          ? <T k="pages.defensivedrivingpage.4a4e75">{'Just an email and a password — no codes to look up.'}</T>
          : <T k="pages.defensivedrivingpage.413af6">{'Enter the email and password you set up.'}</T>}
      </p>

      {isCreate && (
        <>
          <Field label="Driver's first name" value={firstName} onChange={setFirstName} autoComplete="given-name" />
          <Field label="Driver's last name" value={lastName} onChange={setLastName} autoComplete="family-name" />
        </>
      )}
      <Field label="Email address" type="email" value={email} onChange={setEmail} autoComplete="email" />

      <label className="block">
        <span className="block text-xs font-semibold text-slate-600 mb-1"><T k="pages.defensivedrivingpage.dc647e">Password</T></span>
        <div className="relative">
          <input
            type={showPw ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={isCreate ? 'new-password' : 'current-password'}
            className="w-full rounded-xl border border-slate-300 bg-white text-[#0F2D6B] px-3.5 py-3 pr-16 text-base outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
          />
          <button type="button" onClick={() => setShowPw((s) => !s)}
            className="absolute inset-y-0 right-2 my-auto h-7 px-2 text-xs font-semibold text-slate-500 hover:text-[#0F2D6B]">
            {showPw ? <T k="pages.defensivedrivingpage.34d8b6">{'Hide'}</T> : <T k="pages.defensivedrivingpage.d97d1e">{'Show'}</T>}
          </button>
        </div>
        {isCreate && <span className="mt-1 block text-[11px] text-slate-500"><T k="pages.defensivedrivingpage.832a90">At least 6 characters. Write it down somewhere safe.</T></span>}
      </label>

      {error && <p className="flex items-start gap-2 text-xs font-medium text-red-700"><AlertCircle className="w-4 h-4 shrink-0" />{error}</p>}

      <div className="pt-2 flex justify-center">
        <button type="submit" disabled={busy}
          className="qb qb-blue qb-lg px-8">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : (isCreate ? <T k="pages.defensivedrivingpage.522b34">{'Create Account & Start'}</T> : <T k="pages.defensivedrivingpage.f8492c">{'Sign In'}</T>)}
        </button>
      </div>

      <p className="text-xs text-slate-500 text-center">
        {isCreate ? <T k="pages.defensivedrivingpage.855903">{'Already have an account?'}</T> : <T k="pages.defensivedrivingpage.b81f2e">{'New here?'}</T>}{' '}
        <button type="button"
          onClick={() => { setMode(isCreate ? 'signin' : 'create'); setError(null); }}
          className="text-blue-700 font-semibold underline underline-offset-2">
          {isCreate ? <T k="pages.defensivedrivingpage.f8492c">{'Sign In'}</T> : <T k="pages.defensivedrivingpage.d48e66">{'Create an Account'}</T>}
        </button>
      </p>
      <p className="text-xs text-slate-500 text-center pt-1"><T k="pages.defensivedrivingpage.0e2384">Need help? Call</T> <a href="tel:+17707861616" className="text-blue-700 font-semibold">(770) 786-1616</a></p>
    </form>
  );
}

function Field({ label, value, onChange, type = 'text', placeholder, autoComplete }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-slate-600 mb-1"><T>{label}</T></span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="w-full rounded-xl border border-slate-300 bg-white text-[#0F2D6B] px-3.5 py-3 text-base outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
      />
    </label>
  );
}
