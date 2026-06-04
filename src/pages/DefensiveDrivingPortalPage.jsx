// src/pages/DefensiveDrivingPortalPage.jsx
// Course portal: module overview + gated module player with server-validated
// seat time and per-module knowledge checks. Final exam is gated here and
// built in Phase 4.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, CheckCircle2, Clock, Loader2, AlertCircle, ArrowLeft, ArrowRight, Award, Download } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  getDefensiveDrivingCourse, getMyEnrollment, getModules, getProgress,
  heartbeat, getModuleQuestions, submitKnowledgeCheck,
  getExamAttempts, startExam, submitExam, issueCertificate,
} from '../lib/ddApi';
import { getModuleContent } from '../data/ddCourseContent';

const fmt = (s) => {
  s = Math.max(0, Math.floor(s || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
};

export default function DefensiveDrivingPortalPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [course, setCourse] = useState(null);
  const [enrollment, setEnrollment] = useState(null);
  const [modules, setModules] = useState([]);
  const [progress, setProgress] = useState([]); // [{module_id, seconds_spent, kc_passed, completed_at}]
  const [activeId, setActiveId] = useState(null);
  const [error, setError] = useState(null);

  const reload = useCallback(async (enr) => {
    const p = await getProgress(enr.id);
    setProgress(p);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate('/courses/defensive-driving'); return; }
    let active = true;
    (async () => {
      try {
        const c = await getDefensiveDrivingCourse();
        if (!c) throw new Error('Course unavailable.');
        const enr = await getMyEnrollment(c.id);
        if (!enr || (enr.status !== 'active' && enr.status !== 'completed')) {
          navigate('/courses/defensive-driving');
          return;
        }
        const [mods, prog] = await Promise.all([getModules(c.id), getProgress(enr.id)]);
        if (!active) return;
        setCourse(c); setEnrollment(enr); setModules(mods); setProgress(prog);
      } catch (err) {
        if (active) setError(err.message || 'Failed to load the course.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [user, authLoading, navigate]);

  if (loading || authLoading) {
    return <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-success-400 animate-spin" />
    </div>;
  }
  if (error) {
    return <div className="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center p-6">{error}</div>;
  }

  // Build view models with sequential unlocking.
  const byId = Object.fromEntries(progress.map((p) => [p.module_id, p]));
  const vms = modules.map((m, i) => {
    const p = byId[m.id] || { seconds_spent: 0, kc_passed: false, completed_at: null };
    const completed = !!p.completed_at;
    return { ...m, ...p, completed, index: i };
  });
  vms.forEach((vm, i) => { vm.unlocked = i === 0 || vms[i - 1].completed; });
  const allComplete = vms.length > 0 && vms.every((v) => v.completed);

  if (activeId) {
    const vm = vms.find((v) => v.id === activeId);
    return (
      <ModulePlayer
        key={vm.id}
        module={vm}
        onBack={async () => { await reload(enrollment); setActiveId(null); }}
        onNext={async () => {
          await reload(enrollment);
          const next = vms.find((v) => v.index === vm.index + 1);
          setActiveId(next ? next.id : null);
        }}
      />
    );
  }

  const completedCount = vms.filter((v) => v.completed).length;

  return (
    <div className="bg-gray-950 text-gray-50 min-h-screen">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <p className="text-xs uppercase tracking-[0.2em] text-success-300 mb-2">Your course</p>
        <h1 className="text-3xl font-black mb-2">{course.title}</h1>
        <p className="text-sm text-gray-400 mb-6">{completedCount} of {vms.length} modules complete</p>

        <div className="space-y-3">
          {vms.map((vm) => (
            <ModuleRow key={vm.id} vm={vm} onOpen={() => setActiveId(vm.id)} />
          ))}

          {/* Final exam — unlocks after all modules complete */}
          {allComplete ? (
            <FinalExam course={course} enrollment={enrollment} />
          ) : (
            <div className="rounded-xl border p-4 flex items-center gap-4 border-gray-800 bg-gray-900/40 opacity-70">
              <div className="shrink-0"><Lock className="w-6 h-6 text-gray-500" /></div>
              <div className="flex-1">
                <p className="font-semibold">Final Exam</p>
                <p className="text-xs text-gray-400">Unlocks after all 6 modules are complete.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ModuleRow({ vm, onOpen }) {
  const pct = Math.min(100, Math.round((vm.seconds_spent / vm.min_seconds) * 100));
  return (
    <div className={`rounded-xl border p-4 flex items-center gap-4 ${vm.unlocked ? 'border-gray-700 bg-gray-900/60' : 'border-gray-800 bg-gray-900/30 opacity-70'}`}>
      <div className="shrink-0">
        {vm.completed ? <CheckCircle2 className="w-6 h-6 text-success-400" />
          : vm.unlocked ? <Clock className="w-6 h-6 text-success-300" />
          : <Lock className="w-6 h-6 text-gray-500" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold truncate">Module {vm.ordinal}: {vm.title}</p>
        {vm.unlocked && !vm.completed && (
          <div className="mt-1.5 h-1.5 w-full rounded-full bg-gray-800 overflow-hidden">
            <div className="h-full bg-success-500" style={{ width: `${pct}%` }} />
          </div>
        )}
        <p className="text-xs text-gray-400 mt-1">
          {vm.completed ? 'Completed'
            : vm.unlocked ? `Time ${fmt(vm.seconds_spent)} / ${fmt(vm.min_seconds)}${vm.kc_passed ? ' · quiz passed' : ''}`
            : 'Locked'}
        </p>
      </div>
      <button
        onClick={onOpen}
        disabled={!vm.unlocked}
        className={`text-xs font-semibold rounded-full px-4 py-2 transition ${vm.unlocked ? 'bg-success-400 hover:bg-success-300 text-gray-950' : 'bg-gray-800 text-gray-500 cursor-not-allowed'}`}>
        {vm.completed ? 'Review' : vm.seconds_spent > 0 ? 'Continue' : 'Start'}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Module player: content + server-validated seat time + knowledge check.
// ---------------------------------------------------------------------------
function ModulePlayer({ module: mod, onBack, onNext }) {
  const content = getModuleContent(mod.content_ref);
  const [seconds, setSeconds] = useState(mod.seconds_spent || 0);
  const [minSeconds, setMinSeconds] = useState(mod.min_seconds);
  const [kcPassed, setKcPassed] = useState(!!mod.kc_passed);
  const [completed, setCompleted] = useState(!!mod.completed);
  const lastActivity = useRef(Date.now());

  const seatMet = seconds >= minSeconds;

  // Track activity for idle detection.
  useEffect(() => {
    const mark = () => { lastActivity.current = Date.now(); };
    const evts = ['mousemove', 'keydown', 'scroll', 'click', 'touchstart'];
    evts.forEach((e) => window.addEventListener(e, mark, { passive: true }));
    return () => evts.forEach((e) => window.removeEventListener(e, mark));
  }, []);

  // Initialize server progress (creates the row, syncs truth) without adding time.
  useEffect(() => {
    let live = true;
    heartbeat(mod.id, 0).then((r) => {
      if (!live || !r) return;
      setSeconds(r.seconds_spent); setMinSeconds(r.min_seconds);
      setKcPassed(r.kc_passed); setCompleted(r.completed);
    }).catch(() => {});
    return () => { live = false; };
  }, [mod.id]);

  // Heartbeat loop — only while the tab is visible, the user is active, and
  // the seat-time floor isn't met yet.
  useEffect(() => {
    if (seatMet) return;
    const id = setInterval(async () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastActivity.current > 60000) return; // idle
      try {
        const r = await heartbeat(mod.id, 15);
        if (r) {
          setSeconds(r.seconds_spent); setMinSeconds(r.min_seconds);
          setKcPassed(r.kc_passed); setCompleted(r.completed);
        }
      } catch { /* transient */ }
    }, 15000);
    return () => clearInterval(id);
  }, [mod.id, seatMet]);

  const pct = Math.min(100, Math.round((seconds / minSeconds) * 100));

  return (
    <div className="bg-gray-950 text-gray-50 min-h-screen">
      {/* Sticky seat-time bar */}
      <div className="sticky top-0 z-10 bg-gray-950/95 backdrop-blur border-b border-gray-800">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={onBack} className="text-gray-400 hover:text-gray-100 flex items-center gap-1 text-sm">
            <ArrowLeft className="w-4 h-4" /> Overview
          </button>
          <div className="flex-1">
            <div className="h-1.5 w-full rounded-full bg-gray-800 overflow-hidden">
              <div className="h-full bg-success-500 transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
          <span className="text-xs text-gray-400 tabular-nums whitespace-nowrap">
            {seatMet ? 'Time complete' : `${fmt(seconds)} / ${fmt(minSeconds)}`}
          </span>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8">
        <p className="text-xs uppercase tracking-[0.2em] text-success-300 mb-2">Module {mod.ordinal}</p>
        <h1 className="text-2xl font-black mb-4">{mod.title}</h1>

        {content?.intro && <p className="text-gray-300 mb-6 leading-relaxed">{content.intro}</p>}

        <article className="space-y-8">
          {(content?.sections || []).map((sec, i) => (
            <section key={i}>
              <h2 className="text-lg font-bold text-success-200 mb-2">{sec.heading}</h2>
              <div className="space-y-3">
                {sec.body.map((p, j) => (
                  <p key={j} className="text-sm text-gray-300 leading-relaxed">{p}</p>
                ))}
              </div>
            </section>
          ))}
          {!content && <p className="text-gray-400">Content for this module is being prepared.</p>}
        </article>

        <div className="mt-10 border-t border-gray-800 pt-8">
          {!seatMet ? (
            <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-5 text-center">
              <Clock className="w-6 h-6 text-gray-500 mx-auto mb-2" />
              <p className="text-sm text-gray-300">Keep reading — the knowledge check unlocks after the required time on this module.</p>
              <p className="text-xs text-gray-500 mt-1">{fmt(minSeconds - seconds)} remaining</p>
            </div>
          ) : (
            <KnowledgeCheck
              module={mod}
              alreadyPassed={kcPassed}
              onPassed={() => { setKcPassed(true); setCompleted(true); }}
            />
          )}

          {(completed || kcPassed) && (
            <div className="mt-6 flex items-center justify-between gap-3">
              <span className="text-sm text-success-300 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Module complete</span>
              <button onClick={onNext}
                className="text-sm font-semibold rounded-full px-5 py-2.5 bg-success-400 hover:bg-success-300 text-gray-950 transition flex items-center gap-2">
                Next <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function KnowledgeCheck({ module: mod, alreadyPassed, onPassed }) {
  const [questions, setQuestions] = useState(null);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [passed, setPassed] = useState(alreadyPassed);

  const load = useCallback(async () => {
    setError(null); setResult(null); setAnswers({});
    try {
      const qs = await getModuleQuestions(mod.id);
      setQuestions(qs);
    } catch (err) {
      setError(err.message || 'Could not load the quiz.');
    }
  }, [mod.id]);

  useEffect(() => { if (!alreadyPassed) load(); }, [alreadyPassed, load]);

  if (passed) {
    return <p className="text-sm text-success-300 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Knowledge check passed.</p>;
  }
  if (error) {
    return <div className="text-sm text-red-300 flex items-center gap-2"><AlertCircle className="w-4 h-4" />{error}
      <button onClick={load} className="underline ml-2">Retry</button></div>;
  }
  if (!questions) {
    return <div className="text-sm text-gray-400 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading knowledge check…</div>;
  }

  const allAnswered = questions.length > 0 && questions.every((q) => answers[q.id]);

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const r = await submitKnowledgeCheck(mod.id, answers);
      setResult(r);
      if (r.passed) { setPassed(true); onPassed(); }
    } catch (err) {
      setError(err.message || 'Could not submit.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h2 className="text-lg font-bold mb-1">Knowledge Check</h2>
      <p className="text-xs text-gray-400 mb-5">Answer all questions to complete this module.</p>
      <div className="space-y-6">
        {questions.map((q, qi) => (
          <fieldset key={q.id}>
            <legend className="text-sm font-medium text-gray-100 mb-2">{qi + 1}. {q.prompt}</legend>
            <div className="space-y-2">
              {(q.choices || []).map((c) => (
                <label key={c.key} className={`flex items-center gap-3 rounded-lg border px-3 py-2 cursor-pointer text-sm transition ${answers[q.id] === c.key ? 'border-success-500 bg-success-500/10' : 'border-gray-700 hover:border-gray-600'}`}>
                  <input type="radio" name={q.id} value={c.key}
                    checked={answers[q.id] === c.key}
                    onChange={() => setAnswers((a) => ({ ...a, [q.id]: c.key }))}
                    className="accent-success-500" />
                  <span className="text-gray-200">{c.text}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>

      {result && !result.passed && (
        <p className="mt-4 text-sm text-amber-300">
          You scored {result.score_pct}% — {result.threshold}% is required to pass. Review the material and try again.
          <button onClick={load} className="underline ml-2">New attempt</button>
        </p>
      )}
      {error && <p className="mt-4 text-sm text-red-300 flex items-center gap-2"><AlertCircle className="w-4 h-4" />{error}</p>}

      <button onClick={submit} disabled={!allAnswered || busy}
        className="mt-5 rounded-full px-6 py-3 text-sm font-semibold bg-success-400 hover:bg-success-300 disabled:opacity-50 text-gray-950 transition flex items-center gap-2">
        {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</> : 'Submit answers'}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Final exam + certificate
// ---------------------------------------------------------------------------
function FinalExam({ course, enrollment }) {
  const [phase, setPhase] = useState('loading'); // loading | idle | exam | result
  const [attempts, setAttempts] = useState([]);
  const [passed, setPassed] = useState(enrollment.status === 'completed');
  const [exam, setExam] = useState(null); // {attempt_id, questions}
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadAttempts = useCallback(async () => {
    try {
      const a = await getExamAttempts(enrollment.id);
      setAttempts(a);
      if (enrollment.status === 'completed' || a.some((x) => x.passed)) setPassed(true);
      setPhase('idle');
    } catch (err) { setError(err.message); setPhase('idle'); }
  }, [enrollment.id, enrollment.status]);

  useEffect(() => { loadAttempts(); }, [loadAttempts]);

  if (passed) {
    return (
      <div className="rounded-xl border border-success-500/40 bg-success-500/5 p-5">
        <div className="flex items-center gap-3 mb-3">
          <Award className="w-6 h-6 text-success-400" />
          <p className="font-semibold">Final exam passed — course complete!</p>
        </div>
        <CertificateBlock courseSlug={course.slug} />
      </div>
    );
  }

  const attemptsUsed = attempts.length;
  const remaining = Math.max(0, course.retake_limit - attemptsUsed);
  const lastSubmit = attempts.reduce((m, a) => (a.submitted_at && (!m || a.submitted_at > m) ? a.submitted_at : m), null);
  const cooldownUntil = lastSubmit ? new Date(new Date(lastSubmit).getTime() + course.retake_cooldown_seconds * 1000) : null;
  const inCooldown = cooldownUntil && cooldownUntil > new Date();

  const start = async () => {
    setBusy(true); setError(null); setResult(null);
    try {
      const e = await startExam(course.id);
      setExam(e); setAnswers({}); setPhase('exam');
    } catch (err) {
      const msg = err.message || '';
      if (msg.includes('cooldown')) setError('Please wait for the cooldown to end before trying again.');
      else if (msg.includes('no attempts')) setError('No attempts remaining. Please contact support.');
      else if (msg.includes('locked')) setError('Finish all modules first.');
      else setError(msg || 'Could not start the exam.');
    } finally { setBusy(false); }
  };

  const doSubmit = async () => {
    setBusy(true); setError(null);
    try {
      const r = await submitExam(exam.attempt_id, answers);
      setResult(r); setPhase('result');
      if (r.passed) setPassed(true);
      else await loadAttempts();
    } catch (err) { setError(err.message || 'Could not submit.'); }
    finally { setBusy(false); }
  };

  if (phase === 'loading') {
    return <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-5 text-sm text-gray-400 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading final exam…</div>;
  }

  if (phase === 'exam' && exam) {
    const allAnswered = exam.questions.every((q) => answers[q.id]);
    return (
      <div className="rounded-xl border border-success-500/40 bg-gray-900/60 p-5">
        <h3 className="text-lg font-bold mb-1">Final Exam</h3>
        <p className="text-xs text-gray-400 mb-5">{exam.questions.length} questions · {course.pass_threshold_pct}% to pass</p>
        <div className="space-y-6">
          {exam.questions.map((q, qi) => (
            <fieldset key={q.id}>
              <legend className="text-sm font-medium text-gray-100 mb-2">{qi + 1}. {q.prompt}</legend>
              <div className="space-y-2">
                {(q.choices || []).map((c) => (
                  <label key={c.key} className={`flex items-center gap-3 rounded-lg border px-3 py-2 cursor-pointer text-sm transition ${answers[q.id] === c.key ? 'border-success-500 bg-success-500/10' : 'border-gray-700 hover:border-gray-600'}`}>
                    <input type="radio" name={q.id} value={c.key} checked={answers[q.id] === c.key}
                      onChange={() => setAnswers((a) => ({ ...a, [q.id]: c.key }))} className="accent-success-500" />
                    <span className="text-gray-200">{c.text}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
        {error && <p className="mt-4 text-sm text-red-300 flex items-center gap-2"><AlertCircle className="w-4 h-4" />{error}</p>}
        <button onClick={doSubmit} disabled={!allAnswered || busy}
          className="mt-5 rounded-full px-6 py-3 text-sm font-semibold bg-success-400 hover:bg-success-300 disabled:opacity-50 text-gray-950 transition flex items-center gap-2">
          {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</> : 'Submit exam'}
        </button>
      </div>
    );
  }

  // idle / result
  return (
    <div className="rounded-xl border border-success-500/40 bg-success-500/5 p-5">
      <div className="flex items-center gap-3 mb-2">
        <Award className="w-6 h-6 text-success-300" />
        <p className="font-semibold">Final Exam</p>
      </div>
      {result && !result.passed && (
        <p className="text-sm text-amber-300 mb-3">
          You scored {result.score_pct}% — {result.threshold}% is required. {result.attempts_remaining > 0 ? `${result.attempts_remaining} attempt(s) remaining.` : 'No attempts remaining — please contact support.'}
        </p>
      )}
      <p className="text-xs text-gray-400 mb-4">
        {course.exam_question_count} questions · {course.pass_threshold_pct}% to pass · attempt {Math.min(attemptsUsed + 1, course.retake_limit)} of {course.retake_limit}
      </p>
      {error && <p className="text-sm text-red-300 mb-3 flex items-center gap-2"><AlertCircle className="w-4 h-4" />{error}</p>}
      {remaining <= 0 ? (
        <p className="text-sm text-gray-300">No attempts remaining. Please contact support.</p>
      ) : inCooldown ? (
        <p className="text-sm text-gray-300">You can try again after {cooldownUntil.toLocaleTimeString()}.</p>
      ) : (
        <button onClick={start} disabled={busy}
          className="rounded-full px-6 py-3 text-sm font-semibold bg-success-400 hover:bg-success-300 disabled:opacity-50 text-gray-950 transition flex items-center gap-2">
          {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Preparing…</> : 'Start Final Exam'}
        </button>
      )}
    </div>
  );
}

function CertificateBlock({ courseSlug }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [uid, setUid] = useState(null);

  const download = async () => {
    setBusy(true); setError(null);
    try {
      const { url, certificate_uid } = await issueCertificate(courseSlug);
      setUid(certificate_uid);
      if (url) window.open(url, '_blank', 'noopener');
    } catch (err) { setError(err.message || 'Could not download certificate.'); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <p className="text-sm text-gray-300 mb-3">
        Your certificate has been generated and forwarded to the agency for your insurance discount review.
        {uid && <> Certificate ID: <span className="font-mono text-gray-200">{uid}</span>.</>}
      </p>
      {error && <p className="text-sm text-red-300 mb-3 flex items-center gap-2"><AlertCircle className="w-4 h-4" />{error}</p>}
      <button onClick={download} disabled={busy}
        className="rounded-full px-6 py-3 text-sm font-semibold bg-success-400 hover:bg-success-300 disabled:opacity-50 text-gray-950 transition flex items-center gap-2">
        {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Preparing…</> : <><Download className="w-4 h-4" /> Download certificate</>}
      </button>
    </div>
  );
}
