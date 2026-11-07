// src/pages/components/dd/StudentProgress.jsx
// The course page for someone already enrolled: what's next (keep learning, take or
// retake the final exam) or, once passed, the certificate and when the discount ends.
// Hero = the left side on the blue background; Card = the white card on the right.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Award, CheckCircle2, Circle, Download, Lock, Loader2 } from 'lucide-react';
import { T } from '../../../components/SiteCopy';
import { issueCertificate } from '../../../lib/ddApi';
import { longDate } from '../../../lib/ddStudent';

const GOLD = '#F5D061';
const PORTAL = '/courses/defensive-driving/portal';

// Downloads the certificate (issuing it first if it never was).
function useCertificate(courseSlug) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const download = async () => {
    setBusy(true); setError('');
    try {
      const { url } = await issueCertificate(courseSlug);
      if (url) window.location.assign(url);
    } catch (e) {
      setError(e.message || 'Could not get your certificate.');
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, download };
}

export function StudentHero({ course, st, firstName }) {
  const cert = useCertificate(course.slug);
  const pct = st.total ? Math.round((st.doneCount / st.total) * 100) : 0;
  const lead = 'text-lg text-blue-100 max-w-xl mb-6';

  if (st.stage === 'passed') {
    return (
      <>
        <p className={lead}>
          <T k="dd.student.passed">You passed on</T> {longDate(st.passedAt)}.{' '}
          {st.certIssuedAt ? <T k="dd.student.sent">Your certificate was sent to Cam Wiley Agency.</T> : <T k="dd.student.get-cert">Download your certificate to finish up.</T>}
        </p>
        {st.expiresAt && (
          <p className="mb-8 max-w-xl text-sm text-blue-50">
            <T k="dd.student.good-through">Your discount is good through</T> <b className="text-white">{longDate(st.expiresAt)}</b>.{' '}
            <T k="dd.student.retake-before">Retake the course before then, or before your next renewal if it comes first.</T>
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={cert.download} disabled={cert.busy} className="qb qb-gold qb-lg px-7">
            {cert.busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Download className="h-5 w-5" aria-hidden="true" />}
            {st.certIssuedAt ? <T k="dd.student.download">Download Certificate</T> : <T k="dd.student.get">Get Your Certificate</T>}
          </button>
          <Link to="/?start=1" className="inline-flex min-h-[48px] items-center rounded-full border border-white/30 px-5 text-sm font-semibold text-white hover:bg-white/10">
            <T k="dd.student.rate-check">Check Your Whole Rate</T>
          </Link>
        </div>
        {cert.error && <p className="mt-3 text-sm font-semibold text-red-200" role="alert">{cert.error}</p>}
      </>
    );
  }

  const button = st.stage === 'retake' ? <T k="dd.student.retake">Retake the Final Exam</T>
    : st.stage === 'exam' ? <T k="dd.student.exam">Take the Final Exam</T>
    : st.doneCount === 0 ? <T k="dd.student.start">Start the Course</T> : <T k="dd.student.continue">Continue Course</T>;
  const to = st.stage === 'learning' && st.next ? `${PORTAL}?module=${st.next.id}` : PORTAL;
  return (
    <>
      <p className={lead}>
        <T k="dd.student.welcome">Welcome back</T>{firstName ? `, ${firstName}` : ''}.{' '}
        {st.stage === 'retake'
          ? <><T k="dd.student.tries">You’ve used</T> {st.tries} <T k="dd.student.of">of</T> {st.tries + st.triesLeft} <T k="dd.student.exam-tries">exam tries.</T></>
          : st.stage === 'exam' ? <T k="dd.student.all-done">All modules are done. Next: the final exam.</T>
          : <>{st.doneCount} <T k="dd.student.of">of</T> {st.total} <T k="dd.student.modules-done">modules done.</T></>}
      </p>
      <div className="mb-8 max-w-xl" aria-label={`${pct}% complete`}>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/15">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: GOLD }} />
        </div>
      </div>
      <Link to={to} className="qb qb-gold qb-lg px-7">{button}</Link>
    </>
  );
}

export function StudentCard({ course, st }) {
  const cert = useCertificate(course.slug);
  if (st.stage === 'passed') {
    return (
      <div className="space-y-3">
        <p className="flex items-center gap-2 text-base font-bold text-[#0F2D6B]"><Award className="h-5 w-5 text-blue-700" aria-hidden="true" /> <T k="dd.card.cert">Your Certificate</T></p>
        <dl className="divide-y divide-slate-100 text-sm">
          <div className="flex justify-between gap-3 py-2"><dt className="text-slate-500"><T k="dd.card.passed">Passed</T></dt><dd className="font-semibold text-[#0F2D6B]">{longDate(st.passedAt)}</dd></div>
          <div className="flex justify-between gap-3 py-2"><dt className="text-slate-500"><T k="dd.card.sent">Sent to the agency</T></dt><dd className="font-semibold text-[#0F2D6B]">{st.certIssuedAt ? longDate(st.certIssuedAt) : <T k="dd.card.not-yet">Not yet</T>}</dd></div>
          {st.expiresAt && <div className="flex justify-between gap-3 py-2"><dt className="text-slate-500"><T k="dd.card.good">Discount good through</T></dt><dd className="font-semibold text-[#0F2D6B]">{longDate(st.expiresAt)}</dd></div>}
        </dl>
        <button type="button" onClick={cert.download} disabled={cert.busy} className="qb qb-blue qb-lg flex w-full">
          {cert.busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Download className="h-5 w-5" aria-hidden="true" />}
          {st.certIssuedAt ? <T k="dd.student.download">Download Certificate</T> : <T k="dd.student.get">Get Your Certificate</T>}
        </button>
        {cert.error && <p className="text-sm font-semibold text-red-700" role="alert">{cert.error}</p>}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-base font-bold text-[#0F2D6B]"><T k="dd.card.progress">Your Progress</T></p>
      <ol className="space-y-1.5 text-sm">
        {st.modules.map(m => (
          <li key={m.id} className="flex items-start gap-2">
            {m.done ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" aria-label="Done" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" aria-hidden="true" />}
            <span className={m.done ? 'text-slate-500' : 'font-semibold text-[#0F2D6B]'}><T>{m.title}</T></span>
          </li>
        ))}
        <li className="flex items-start gap-2">
          {st.stage === 'learning' ? <Lock className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" aria-hidden="true" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" aria-hidden="true" />}
          <span className="font-semibold text-[#0F2D6B]"><T k="dd.card.final">Final Exam</T>{st.tries > 0 ? ` · ${st.triesLeft} ${st.triesLeft === 1 ? 'try' : 'tries'} left` : ''}</span>
        </li>
      </ol>
      <Link to={st.stage === 'learning' && st.next ? `${PORTAL}?module=${st.next.id}` : PORTAL} className="qb qb-blue qb-lg flex w-full">
        <T k="pages.defensivedrivingpage.21acac">Go to Your Course</T>
      </Link>
    </div>
  );
}
