// src/pages/DefensiveDrivingPortalPage.jsx
// Full-screen course experience (no consumer nav): module overview + a rich
// lesson reader with callouts and interactive scenario checks, a per-module
// graded knowledge check that gates completion, the final exam, and the
// certificate. Progression is content/quiz based — no seat-time gating.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Lock, CheckCircle2, Circle, Loader2, AlertCircle, ArrowLeft, ArrowRight, Award, Download,
  Scale, KeyRound, AlertTriangle, Lightbulb, ListChecks, X, BookOpen,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  getDefensiveDrivingCourse, getMyEnrollment, getModules, getProgress,
  getModuleQuestions, submitKnowledgeCheck,
  getExamAttempts, startExam, submitExam, issueCertificate,
} from '../lib/ddApi';
import { getModuleContent } from '../data/ddCourseContent';

export default function DefensiveDrivingPortalPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [course, setCourse] = useState(null);
  const [enrollment, setEnrollment] = useState(null);
  const [modules, setModules] = useState([]);
  const [progress, setProgress] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [error, setError] = useState(null);

  const reload = useCallback(async (enr) => {
    setProgress(await getProgress(enr.id));
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

  const byId = Object.fromEntries(progress.map((p) => [p.module_id, p]));
  const vms = modules.map((m, i) => {
    const p = byId[m.id] || { kc_passed: false, completed_at: null };
    return { ...m, ...p, completed: !!p.completed_at, index: i };
  });
  vms.forEach((vm, i) => { vm.unlocked = i === 0 || vms[i - 1].completed; });
  const allComplete = vms.length > 0 && vms.every((v) => v.completed);
  const completedCount = vms.filter((v) => v.completed).length;

  if (activeId) {
    const vm = vms.find((v) => v.id === activeId);
    return (
      <ModulePlayer
        key={vm.id}
        module={vm}
        total={vms.length}
        onExit={() => navigate('/')}
        onBack={async () => { await reload(enrollment); setActiveId(null); }}
        onNext={async () => {
          await reload(enrollment);
          const next = vms.find((v) => v.index === vm.index + 1);
          setActiveId(next ? next.id : null);
          window.scrollTo(0, 0);
        }}
      />
    );
  }

  return (
    <div className="bg-gray-950 text-gray-50 min-h-screen">
      <CourseHeader onExit={() => navigate('/')} />
      <div className="max-w-3xl mx-auto px-4 py-10">
        <p className="text-xs uppercase tracking-[0.2em] text-success-300 mb-2">Your course</p>
        <h1 className="text-3xl font-black mb-4">{course.title}</h1>

        {/* Overall progress */}
        <div className="mb-8">
          <div className="flex items-center justify-between text-xs text-gray-400 mb-1.5">
            <span>{completedCount} of {vms.length} modules complete</span>
            <span>{Math.round((completedCount / vms.length) * 100)}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-gray-800 overflow-hidden">
            <div className="h-full bg-success-500 transition-all" style={{ width: `${(completedCount / vms.length) * 100}%` }} />
          </div>
        </div>

        <div className="space-y-3">
          {vms.map((vm) => (
            <ModuleRow key={vm.id} vm={vm} onOpen={() => { setActiveId(vm.id); window.scrollTo(0, 0); }} />
          ))}

          {allComplete ? (
            <FinalExam course={course} enrollment={enrollment} />
          ) : (
            <div className="rounded-xl border p-4 flex items-center gap-4 border-gray-800 bg-gray-900/40 opacity-70">
              <Lock className="w-5 h-5 text-gray-500 shrink-0" />
              <div>
                <p className="font-semibold">Final Exam</p>
                <p className="text-xs text-gray-400">Unlocks after all {vms.length} modules are complete.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CourseHeader({ onExit, label = 'Defensive Driving · Georgia' }) {
  return (
    <div className="sticky top-0 z-20 bg-gray-950/95 backdrop-blur border-b border-gray-800">
      <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-semibold text-success-300">
          <BookOpen className="w-4 h-4" /> {label}
        </span>
        <button onClick={onExit} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-100">
          Exit course <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function ModuleRow({ vm, onOpen }) {
  return (
    <div className={`rounded-xl border p-4 flex items-center gap-4 ${vm.unlocked ? 'border-gray-700 bg-gray-900/60' : 'border-gray-800 bg-gray-900/30 opacity-70'}`}>
      <div className="shrink-0">
        {vm.completed ? <CheckCircle2 className="w-6 h-6 text-success-400" />
          : vm.unlocked ? <Circle className="w-6 h-6 text-success-300" />
          : <Lock className="w-6 h-6 text-gray-500" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold truncate">Module {vm.ordinal}: {vm.title}</p>
        <p className="text-xs text-gray-400 mt-0.5">
          {vm.completed ? 'Completed' : vm.unlocked ? 'Ready' : 'Complete the previous module to unlock'}
        </p>
      </div>
      <button
        onClick={onOpen}
        disabled={!vm.unlocked}
        className={`text-xs font-semibold rounded-full px-4 py-2 transition ${vm.unlocked ? 'bg-success-400 hover:bg-success-300 text-gray-950' : 'bg-gray-800 text-gray-500 cursor-not-allowed'}`}>
        {vm.completed ? 'Review' : 'Start'}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lesson reader
// ---------------------------------------------------------------------------
function ModulePlayer({ module: mod, total, onBack, onNext, onExit }) {
  const content = getModuleContent(mod.content_ref);
  const [kcPassed, setKcPassed] = useState(!!mod.kc_passed);
  const [completed, setCompleted] = useState(!!mod.completed);
  const isLast = mod.index + 1 >= total;

  const sections = useMemo(() => content?.sections || [], [content]);
  // Steps: Introduction -> each section (with its own check) -> module quiz.
  const steps = useMemo(
    () => ['intro', ...sections.map(() => 'section'), 'quiz'],
    [sections],
  );
  const [step, setStep] = useState(0);
  const [passedSections, setPassedSections] = useState(() => new Set());
  const go = (n) => { setStep(n); window.scrollTo(0, 0); };

  const kind = steps[step];
  const sectionIdx = kind === 'section' ? step - 1 : -1;
  const section = sectionIdx >= 0 ? sections[sectionIdx] : null;
  // A section's "Continue" is gated on passing its check (skipped on review or
  // when a section has no check).
  const sectionGateOk = kind !== 'section'
    ? true
    : completed || !section?.quiz?.length || passedSections.has(sectionIdx);

  return (
    <div className="bg-gray-950 text-gray-50 min-h-screen">
      <div className="sticky top-0 z-20 bg-gray-950/95 backdrop-blur border-b border-gray-800">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <button onClick={onBack} className="text-gray-400 hover:text-gray-100 flex items-center gap-1.5 text-sm">
            <ArrowLeft className="w-4 h-4" /> All modules
          </button>
          <span className="text-xs text-gray-500">Module {mod.ordinal} of {total}</span>
          <button onClick={onExit} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-100">
            Exit <X className="w-4 h-4" />
          </button>
        </div>
        <div className="max-w-3xl mx-auto px-4 pb-3">
          <div className="h-1.5 w-full rounded-full bg-gray-800 overflow-hidden">
            <div className="h-full bg-success-500 transition-all" style={{ width: `${((step + 1) / steps.length) * 100}%` }} />
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8">
        <p className="text-xs uppercase tracking-[0.2em] text-success-300 mb-2">
          Module {mod.ordinal}
          {kind === 'section' && ` · Section ${sectionIdx + 1} of ${sections.length}`}
          {kind === 'quiz' && ' · Module quiz'}
          {kind === 'intro' && ' · Introduction'}
        </p>
        <h1 className="text-2xl md:text-3xl font-black mb-6">{mod.title}</h1>

        {/* Introduction */}
        {kind === 'intro' && (
          <div>
            {content?.summary && (
              <p className="text-base text-gray-300 leading-relaxed border-l-2 border-success-500/40 pl-4">{content.summary}</p>
            )}
            {sections.length > 0 && (
              <div className="mt-6 rounded-xl border border-gray-800 bg-gray-900/50 p-5">
                <p className="text-sm font-semibold text-gray-200 mb-3">In this module</p>
                <ol className="space-y-2.5">
                  {sections.map((s, i) => (
                    <li key={i} className="flex gap-3 text-sm text-gray-300">
                      <span className="shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-success-500/20 text-[11px] font-bold text-success-200">{i + 1}</span>
                      {s.heading || `Section ${i + 1}`}
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {!content && <p className="text-gray-400">Content for this module is being prepared.</p>}
          </div>
        )}

        {/* A single section + its check */}
        {kind === 'section' && section && (
          <div>
            <article className="space-y-5">
              {section.heading && <h2 className="text-xl md:text-2xl font-bold text-success-100">{section.heading}</h2>}
              {section.blocks.map((b, i) => <Block key={i} b={b} />)}
            </article>
            {section.quiz?.length > 0 && (
              <div className="mt-8">
                <SectionQuiz
                  key={sectionIdx}
                  quiz={section.quiz}
                  defaultPassed={completed}
                  onPass={() => setPassedSections((p) => new Set(p).add(sectionIdx))}
                />
              </div>
            )}
          </div>
        )}

        {/* Takeaways + graded quiz */}
        {kind === 'quiz' && (
          <div>
            {content?.takeaways?.length > 0 && (
              <div className="mb-8 rounded-xl border border-success-500/30 bg-success-500/5 p-5">
                <p className="flex items-center gap-2 text-sm font-bold text-success-200 mb-3">
                  <ListChecks className="w-5 h-5" /> Key takeaways
                </p>
                <ul className="space-y-2">
                  {content.takeaways.map((t, i) => (
                    <li key={i} className="flex gap-2.5 text-sm text-gray-200">
                      <CheckCircle2 className="w-4 h-4 text-success-400 shrink-0 mt-0.5" /> {t}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <KnowledgeCheck
              module={mod}
              alreadyPassed={kcPassed}
              onPassed={() => { setKcPassed(true); setCompleted(true); }}
            />
          </div>
        )}

        {/* Step navigation */}
        <div className="mt-10 flex items-center justify-between gap-3 border-t border-gray-800 pt-6">
          <button
            onClick={() => (step === 0 ? onBack() : go(step - 1))}
            className="text-sm text-gray-400 hover:text-gray-100 flex items-center gap-1.5">
            <ArrowLeft className="w-4 h-4" /> {step === 0 ? 'All modules' : 'Back'}
          </button>

          {kind !== 'quiz' ? (
            <div className="flex items-center gap-3">
              {kind === 'section' && !sectionGateOk && (
                <span className="text-xs text-gray-500 hidden sm:inline">Pass the section check</span>
              )}
              <button onClick={() => go(step + 1)} disabled={!sectionGateOk}
                className="text-sm font-semibold rounded-full px-6 py-3 bg-success-400 hover:bg-success-300 disabled:opacity-50 disabled:cursor-not-allowed text-gray-950 transition flex items-center gap-2">
                Continue <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          ) : (completed || kcPassed) ? (
            <button onClick={onNext}
              className="text-sm font-semibold rounded-full px-6 py-3 bg-success-400 hover:bg-success-300 text-gray-950 transition flex items-center gap-2">
              {isLast ? 'Finish' : 'Next module'} <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <span className="text-xs text-gray-500">Pass the quiz to continue</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Lesson block renderer -------------------------------------------------
function Block({ b }) {
  switch (b.type) {
    case 'p':
      return <p className="text-sm md:text-[15px] text-gray-300 leading-relaxed">{b.text}</p>;
    case 'ul':
      return (
        <ul className="space-y-2">
          {b.items.map((it, i) => (
            <li key={i} className="flex gap-2.5 text-sm md:text-[15px] text-gray-300 leading-relaxed">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-success-400" />{it}
            </li>
          ))}
        </ul>
      );
    case 'ol':
      return (
        <ol className="space-y-2">
          {b.items.map((it, i) => (
            <li key={i} className="flex gap-3 text-sm md:text-[15px] text-gray-300 leading-relaxed">
              <span className="shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-success-500/20 text-[11px] font-bold text-success-200">{i + 1}</span>{it}
            </li>
          ))}
        </ol>
      );
    case 'callout':
      return <Callout {...b} />;
    default:
      return null;
  }
}

const CALLOUT = {
  law: { icon: Scale, ring: 'border-sky-500/40 bg-sky-500/10', text: 'text-sky-200', label: 'Georgia law' },
  key: { icon: KeyRound, ring: 'border-success-500/40 bg-success-500/10', text: 'text-success-200', label: 'Key point' },
  warn: { icon: AlertTriangle, ring: 'border-amber-500/40 bg-amber-500/10', text: 'text-amber-200', label: 'Watch out' },
  tip: { icon: Lightbulb, ring: 'border-teal-500/40 bg-teal-500/10', text: 'text-teal-200', label: 'Tip' },
};

function Callout({ variant = 'key', title, text, items }) {
  const c = CALLOUT[variant] || CALLOUT.key;
  const Icon = c.icon;
  return (
    <div className={`rounded-xl border p-4 ${c.ring}`}>
      <p className={`flex items-center gap-2 text-sm font-semibold mb-1.5 ${c.text}`}>
        <Icon className="w-4 h-4" /> {title || c.label}
      </p>
      {text && <p className="text-sm text-gray-200 leading-relaxed">{text}</p>}
      {items && (
        <ul className="mt-1 space-y-1.5">
          {items.map((it, i) => (
            <li key={i} className="flex gap-2.5 text-sm text-gray-200"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-60" />{it}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Per-section formative check: answer all questions correctly to continue.
function SectionQuiz({ quiz, defaultPassed, onPass }) {
  const [answers, setAnswers] = useState({});
  const [checked, setChecked] = useState(false);
  const [passed, setPassed] = useState(!!defaultPassed);

  const allAnswered = quiz.every((_, i) => answers[i] != null);
  const pick = (qi, ci) => { if (passed) return; setAnswers((a) => ({ ...a, [qi]: ci })); setChecked(false); };
  const check = () => {
    setChecked(true);
    if (quiz.every((qq, i) => qq.choices[answers[i]]?.correct)) { setPassed(true); onPass(); }
  };

  return (
    <div className="rounded-xl border border-gray-700 bg-gray-900/60 p-5">
      <p className="text-xs uppercase tracking-wider text-gray-500 mb-3">Section check</p>
      <div className="space-y-5">
        {quiz.map((qq, qi) => (
          <div key={qi}>
            <p className="text-sm md:text-[15px] font-medium text-gray-100 mb-2">{qi + 1}. {qq.q}</p>
            <div className="space-y-2">
              {qq.choices.map((c, ci) => {
                const isPicked = answers[qi] === ci;
                const reveal = checked || passed;
                const state = reveal && c.correct ? 'border-success-500 bg-success-500/10 text-success-100'
                  : reveal && isPicked && !c.correct ? 'border-red-500/60 bg-red-500/10 text-red-200'
                  : isPicked ? 'border-success-500/70 bg-success-500/5 text-gray-100'
                  : 'border-gray-700 hover:border-gray-600 text-gray-200';
                return (
                  <button key={ci} type="button" onClick={() => pick(qi, ci)} disabled={passed}
                    className={`w-full text-left flex items-start gap-2.5 rounded-lg border px-3 py-2 text-sm transition ${state}`}>
                    {reveal && c.correct ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-success-400" />
                      : reveal && isPicked ? <X className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
                      : <Circle className="w-4 h-4 shrink-0 mt-0.5 text-gray-500" />}
                    {c.t}
                  </button>
                );
              })}
            </div>
            {(checked || passed) && answers[qi] != null && qq.explain && (
              <p className="mt-2 text-sm text-gray-400 leading-relaxed border-l-2 border-success-500/40 pl-3">{qq.explain}</p>
            )}
          </div>
        ))}
      </div>

      {passed ? (
        <p className="mt-4 text-sm text-success-300 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Section check passed.</p>
      ) : (
        <>
          {checked && <p className="mt-3 text-sm text-amber-300">Not quite — review the highlighted answers and try again.</p>}
          <button type="button" onClick={check} disabled={!allAnswered}
            className="mt-4 rounded-full px-5 py-2.5 text-sm font-semibold bg-success-400 hover:bg-success-300 disabled:opacity-50 text-gray-950 transition">
            Check answers
          </button>
        </>
      )}
    </div>
  );
}

// ---- Per-module knowledge check (graded, server-scored) --------------------
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
      setQuestions(await getModuleQuestions(mod.id));
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
      <h2 className="text-lg font-bold mb-1">Module quiz</h2>
      <p className="text-xs text-gray-400 mb-5">Answer all questions to complete this module. You can retake it if needed.</p>
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
  const [phase, setPhase] = useState('loading');
  const [attempts, setAttempts] = useState([]);
  const [passed, setPassed] = useState(enrollment.status === 'completed');
  const [exam, setExam] = useState(null);
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
      window.scrollTo(0, 0);
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
  const [preparing, setPreparing] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(null);
  const [uid, setUid] = useState(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const r = await issueCertificate(courseSlug);
        if (live) setUid(r.certificate_uid);
      } catch (err) { if (live) setError(err.message || 'Could not prepare certificate.'); }
      finally { if (live) setPreparing(false); }
    })();
    return () => { live = false; };
  }, [courseSlug]);

  const download = async () => {
    setDownloading(true); setError(null);
    try {
      const r = await issueCertificate(courseSlug);
      setUid(r.certificate_uid);
      if (r.url) window.open(r.url, '_blank', 'noopener');
    } catch (err) { setError(err.message || 'Could not download certificate.'); }
    finally { setDownloading(false); }
  };

  return (
    <div>
      <p className="text-sm text-gray-300 mb-3">
        Your certificate has been generated and forwarded to the agency for your insurance discount review.
        {uid && <> Certificate ID: <span className="font-mono text-gray-200">{uid}</span>.</>}
      </p>
      {error && <p className="text-sm text-red-300 mb-3 flex items-center gap-2"><AlertCircle className="w-4 h-4" />{error}</p>}
      <button onClick={download} disabled={preparing || downloading}
        className="rounded-full px-6 py-3 text-sm font-semibold bg-success-400 hover:bg-success-300 disabled:opacity-50 text-gray-950 transition flex items-center gap-2">
        {preparing ? <><Loader2 className="w-4 h-4 animate-spin" /> Preparing…</>
          : downloading ? <><Loader2 className="w-4 h-4 animate-spin" /> Opening…</>
          : <><Download className="w-4 h-4" /> Download certificate</>}
      </button>
    </div>
  );
}
