// src/pages/DefensiveDrivingPortalPage.jsx
// Full-screen course experience (no consumer nav) with an accessible,
// theme-aware reader: light default + dark toggle + text-size control
// (scoped via the `.ddc` token layer in index.css). Module overview, a
// paginated lesson reader with per-section checks, the graded module quiz,
// the final exam, and the certificate. No seat-time gating.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Lock, CheckCircle2, Circle, Loader2, AlertCircle, ArrowLeft, ArrowRight, Award, Download,
  Scale, KeyRound, AlertTriangle, Lightbulb, ListChecks, X, BookOpen, Sun, Moon,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  getDefensiveDrivingCourse, getMyEnrollment, getModules, getProgress,
  getModuleQuestions, submitKnowledgeCheck,
  getExamAttempts, startExam, submitExam, issueCertificate,
} from '../lib/ddApi';
import { getModuleContent } from '../data/ddCourseContent';

// ---- Accessibility (theme + text size), persisted -------------------------
const A11yCtx = createContext(null);
const useA11y = () => useContext(A11yCtx);

function AccessibilityControls() {
  const { theme, setTheme, size, setSize } = useA11y();
  const sizes = [
    ['normal', 'A', 'Normal text', 'text-xs'],
    ['large', 'A', 'Large text', 'text-sm'],
    ['larger', 'A', 'Larger text', 'text-base'],
  ];
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
        className="ddc-link p-2 rounded-lg ddc-bd border">
        {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      </button>
      <div className="flex items-center rounded-lg ddc-soft border ddc-bd p-0.5" role="group" aria-label="Text size">
        {sizes.map(([val, , aria, cls]) => (
          <button key={val} onClick={() => setSize(val)} aria-label={aria} aria-pressed={size === val}
            className={`px-2.5 py-1 rounded-md leading-none ${cls} font-bold ${size === val ? 'ddc-btn' : 'ddc-muted'}`}>
            A
          </button>
        ))}
      </div>
    </div>
  );
}

export default function DefensiveDrivingPortalPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [theme, setTheme] = useState(() => localStorage.getItem('dd-theme') || 'light');
  const [size, setSize] = useState(() => localStorage.getItem('dd-size') || 'larger');
  useEffect(() => { localStorage.setItem('dd-theme', theme); }, [theme]);
  useEffect(() => { localStorage.setItem('dd-size', size); }, [size]);
  const a11y = useMemo(() => ({ theme, setTheme, size, setSize }), [theme, size]);

  const [loading, setLoading] = useState(true);
  const [course, setCourse] = useState(null);
  const [enrollment, setEnrollment] = useState(null);
  const [modules, setModules] = useState([]);
  const [progress, setProgress] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [error, setError] = useState(null);

  const reload = useCallback(async (enr) => { setProgress(await getProgress(enr.id)); }, []);

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

  const shell = (inner) => (
    <A11yCtx.Provider value={a11y}>
      <div className="ddc ddc-page min-h-screen" data-theme={theme} data-size={size}>{inner}</div>
    </A11yCtx.Provider>
  );

  if (loading || authLoading) {
    return shell(<div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 ddc-accent animate-spin" /></div>);
  }
  if (error) {
    return shell(<div className="min-h-screen flex items-center justify-center p-6 ddc-text">{error}</div>);
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
    return shell(
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
      />,
    );
  }

  return shell(
    <>
      <div className="sticky top-0 z-20 ddc-bar backdrop-blur border-b">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 ddc-sm font-semibold ddc-accent">
            <BookOpen className="w-4 h-4" /> Defensive Driving · Georgia
          </span>
          <div className="flex items-center gap-3">
            <AccessibilityControls />
            <button onClick={() => navigate('/')} className="flex items-center gap-1 ddc-xs ddc-link">
              Exit <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-10">
        <p className="ddc-eyebrow mb-2">Your course</p>
        <h1 className="ddc-h1 font-black ddc-heading mb-4">{course.title}</h1>

        <div className="mb-8">
          <div className="flex items-center justify-between ddc-xs ddc-muted mb-1.5">
            <span>{completedCount} of {vms.length} modules complete</span>
            <span>{Math.round((completedCount / vms.length) * 100)}%</span>
          </div>
          <div className="h-2 w-full rounded-full ddc-track overflow-hidden">
            <div className="h-full ddc-fill transition-all" style={{ width: `${(completedCount / vms.length) * 100}%` }} />
          </div>
        </div>

        <div className="space-y-3">
          {vms.map((vm) => <ModuleRow key={vm.id} vm={vm} onOpen={() => { setActiveId(vm.id); window.scrollTo(0, 0); }} />)}

          {allComplete ? (
            <FinalExam course={course} enrollment={enrollment} />
          ) : (
            <div className="rounded-xl border ddc-bd ddc-card p-4 flex items-center gap-4 opacity-70">
              <Lock className="w-5 h-5 ddc-faint shrink-0" />
              <div>
                <p className="font-semibold ddc-heading ddc-base">Final Exam</p>
                <p className="ddc-xs ddc-muted">Unlocks after all {vms.length} modules are complete.</p>
              </div>
            </div>
          )}
        </div>

        <p className="mt-8 text-center ddc-sm ddc-muted">
          Need help? Call <a href="tel:+17707861616" className="ddc-accent font-semibold">(770) 786-1616</a>
        </p>
      </div>
    </>,
  );
}

function ModuleRow({ vm, onOpen }) {
  return (
    <div className={`rounded-xl border p-4 flex items-center gap-4 ddc-card ${vm.unlocked ? 'ddc-bd' : 'ddc-bd opacity-70'}`}>
      <div className="shrink-0">
        {vm.completed ? <CheckCircle2 className="w-6 h-6 ddc-good" />
          : vm.unlocked ? <Circle className="w-6 h-6 ddc-accent" />
          : <Lock className="w-6 h-6 ddc-faint" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold ddc-heading ddc-base truncate">Module {vm.ordinal}: {vm.title}</p>
        <p className="ddc-xs ddc-muted mt-0.5">
          {vm.completed ? 'Completed' : vm.unlocked ? 'Ready' : 'Complete the previous module to unlock'}
        </p>
      </div>
      <button onClick={onOpen} disabled={!vm.unlocked}
        className={`ddc-xs font-semibold rounded-full px-4 py-2 transition ${vm.unlocked ? 'ddc-btn' : 'ddc-soft ddc-faint cursor-not-allowed'}`}>
        {vm.completed ? 'Review' : 'Start'}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lesson reader (paginated: intro -> sections w/ checks -> module quiz)
// ---------------------------------------------------------------------------
function ModulePlayer({ module: mod, total, onBack, onNext, onExit }) {
  const content = getModuleContent(mod.content_ref);
  const [kcPassed, setKcPassed] = useState(!!mod.kc_passed);
  const [completed, setCompleted] = useState(!!mod.completed);
  const isLast = mod.index + 1 >= total;

  const sections = useMemo(() => content?.sections || [], [content]);
  const steps = useMemo(() => ['intro', ...sections.map(() => 'section'), 'quiz'], [sections]);
  const [step, setStep] = useState(0);
  const [passedSections, setPassedSections] = useState(() => new Set());
  const go = (n) => { setStep(n); window.scrollTo(0, 0); };

  const kind = steps[step];
  const sectionIdx = kind === 'section' ? step - 1 : -1;
  const section = sectionIdx >= 0 ? sections[sectionIdx] : null;
  const sectionGateOk = kind !== 'section'
    ? true
    : completed || !section?.quiz?.length || passedSections.has(sectionIdx);

  return (
    <>
      <div className="sticky top-0 z-20 ddc-bar backdrop-blur border-b">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <button onClick={onBack} className="ddc-link flex items-center gap-1.5 ddc-sm">
            <ArrowLeft className="w-4 h-4" /> <span className="hidden sm:inline">All modules</span>
          </button>
          <span className="ddc-xs ddc-faint">Module {mod.ordinal} of {total}</span>
          <div className="flex items-center gap-3">
            <AccessibilityControls />
            <button onClick={onExit} className="flex items-center gap-1 ddc-xs ddc-link">
              Exit <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="max-w-3xl mx-auto px-4 pb-3">
          <div className="h-1.5 w-full rounded-full ddc-track overflow-hidden">
            <div className="h-full ddc-fill transition-all" style={{ width: `${((step + 1) / steps.length) * 100}%` }} />
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8">
        <p className="ddc-eyebrow mb-2">
          Module {mod.ordinal}
          {kind === 'section' && ` · Section ${sectionIdx + 1} of ${sections.length}`}
          {kind === 'quiz' && ' · Module quiz'}
          {kind === 'intro' && ' · Introduction'}
        </p>
        <h1 className="ddc-h1 font-black ddc-heading mb-6">{mod.title}</h1>

        {kind === 'intro' && (
          <div>
            {content?.summary && (
              <p className="ddc-lg ddc-text leading-relaxed border-l-2 pl-4" style={{ borderColor: 'var(--ddc-accent-solid)' }}>{content.summary}</p>
            )}
            {sections.length > 0 && (
              <div className="mt-6 rounded-xl border ddc-bd ddc-soft p-5">
                <p className="ddc-base font-semibold ddc-heading mb-3">In this module</p>
                <ol className="space-y-2.5">
                  {sections.map((s, i) => (
                    <li key={i} className="flex gap-3 ddc-sm ddc-text">
                      <span className="shrink-0 flex h-5 w-5 items-center justify-center rounded-full ddc-btn text-[11px] font-bold">{i + 1}</span>
                      {s.heading || `Section ${i + 1}`}
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {!content && <p className="ddc-muted">Content for this module is being prepared.</p>}
          </div>
        )}

        {kind === 'section' && section && (
          <div>
            <article className="space-y-5">
              {section.heading && <h2 className="ddc-h2 font-bold ddc-heading">{section.heading}</h2>}
              {section.blocks.map((b, i) => <Block key={i} b={b} />)}
            </article>
            {section.quiz?.length > 0 && (
              <div className="mt-8">
                <SectionQuiz key={sectionIdx} quiz={section.quiz} defaultPassed={completed}
                  onPass={() => setPassedSections((p) => new Set(p).add(sectionIdx))} />
              </div>
            )}
          </div>
        )}

        {kind === 'quiz' && (
          <div>
            {content?.takeaways?.length > 0 && (
              <div className="mb-8 rounded-xl border ddc-cal ddc-cal-key p-5">
                <p className="flex items-center gap-2 ddc-base font-bold ddc-cal-title mb-3"><ListChecks className="w-5 h-5" /> Key takeaways</p>
                <ul className="space-y-2">
                  {content.takeaways.map((t, i) => (
                    <li key={i} className="flex gap-2.5 ddc-sm ddc-text"><CheckCircle2 className="w-4 h-4 ddc-good shrink-0 mt-0.5" /> {t}</li>
                  ))}
                </ul>
              </div>
            )}
            <KnowledgeCheck module={mod} alreadyPassed={kcPassed}
              onPassed={() => { setKcPassed(true); setCompleted(true); }} />
          </div>
        )}

        <div className="mt-10 flex items-center justify-between gap-3 border-t ddc-bd pt-6">
          <button onClick={() => (step === 0 ? onBack() : go(step - 1))} className="ddc-sm ddc-link flex items-center gap-1.5">
            <ArrowLeft className="w-4 h-4" /> {step === 0 ? 'All modules' : 'Back'}
          </button>

          {kind !== 'quiz' ? (
            <div className="flex items-center gap-3">
              {kind === 'section' && !sectionGateOk && <span className="ddc-xs ddc-faint hidden sm:inline">Pass the section check</span>}
              <button onClick={() => go(step + 1)} disabled={!sectionGateOk}
                className="ddc-sm ddc-btn rounded-full px-6 py-3 transition flex items-center gap-2">
                Continue <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          ) : (completed || kcPassed) ? (
            <button onClick={onNext} className="ddc-sm ddc-btn rounded-full px-6 py-3 transition flex items-center gap-2">
              {isLast ? 'Finish' : 'Next module'} <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <span className="ddc-xs ddc-faint">Pass the quiz to continue</span>
          )}
        </div>
      </div>
    </>
  );
}

// ---- Lesson block renderer -------------------------------------------------
function Block({ b }) {
  switch (b.type) {
    case 'p':
      return <p className="ddc-base ddc-text leading-relaxed">{b.text}</p>;
    case 'ul':
      return (
        <ul className="space-y-2">
          {b.items.map((it, i) => (
            <li key={i} className="flex gap-2.5 ddc-base ddc-text leading-relaxed">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full ddc-fill" />{it}
            </li>
          ))}
        </ul>
      );
    case 'ol':
      return (
        <ol className="space-y-2">
          {b.items.map((it, i) => (
            <li key={i} className="flex gap-3 ddc-base ddc-text leading-relaxed">
              <span className="shrink-0 flex h-5 w-5 items-center justify-center rounded-full ddc-btn text-[11px] font-bold">{i + 1}</span>{it}
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
  law: { icon: Scale, cls: 'ddc-cal-law', label: 'Georgia law' },
  key: { icon: KeyRound, cls: 'ddc-cal-key', label: 'Key point' },
  warn: { icon: AlertTriangle, cls: 'ddc-cal-warn', label: 'Watch out' },
  tip: { icon: Lightbulb, cls: 'ddc-cal-tip', label: 'Tip' },
};

function Callout({ variant = 'key', title, text, items }) {
  const c = CALLOUT[variant] || CALLOUT.key;
  const Icon = c.icon;
  return (
    <div className={`rounded-xl p-4 ddc-cal ${c.cls}`}>
      <p className="flex items-center gap-2 ddc-sm font-semibold mb-1.5 ddc-cal-title"><Icon className="w-4 h-4" /> {title || c.label}</p>
      {text && <p className="ddc-sm ddc-text leading-relaxed">{text}</p>}
      {items && (
        <ul className="mt-1 space-y-1.5">
          {items.map((it, i) => <li key={i} className="flex gap-2.5 ddc-sm ddc-text"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full ddc-fill" />{it}</li>)}
        </ul>
      )}
    </div>
  );
}

// ---- Per-section formative check ------------------------------------------
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
    <div className="rounded-xl border ddc-bd ddc-card p-5">
      <p className="ddc-xs uppercase tracking-wider ddc-faint mb-3">Section check</p>
      <div className="space-y-5">
        {quiz.map((qq, qi) => (
          <div key={qi}>
            <p className="ddc-base font-medium ddc-heading mb-2">{qi + 1}. {qq.q}</p>
            <div className="space-y-2">
              {qq.choices.map((c, ci) => {
                const isPicked = answers[qi] === ci;
                const reveal = checked || passed;
                const mod = reveal && c.correct ? 'is-ok' : reveal && isPicked && !c.correct ? 'is-no' : isPicked ? 'is-sel' : '';
                return (
                  <button key={ci} type="button" onClick={() => pick(qi, ci)} disabled={passed}
                    className={`ddc-opt w-full text-left flex items-start gap-2.5 rounded-lg px-3 py-2 ddc-sm transition ${mod}`}>
                    {reveal && c.correct ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 ddc-good" />
                      : reveal && isPicked ? <X className="w-4 h-4 shrink-0 mt-0.5 ddc-bad" />
                      : <Circle className="w-4 h-4 shrink-0 mt-0.5 ddc-faint" />}
                    {c.t}
                  </button>
                );
              })}
            </div>
            {(checked || passed) && answers[qi] != null && qq.explain && (
              <p className="mt-2 ddc-sm ddc-muted leading-relaxed border-l-2 pl-3" style={{ borderColor: 'var(--ddc-accent-solid)' }}>{qq.explain}</p>
            )}
          </div>
        ))}
      </div>

      {passed ? (
        <p className="mt-4 ddc-sm ddc-good flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Section check passed.</p>
      ) : (
        <>
          {checked && <p className="mt-3 ddc-sm ddc-warn">Not quite — review the highlighted answers and try again.</p>}
          <button type="button" onClick={check} disabled={!allAnswered}
            className="mt-4 ddc-btn rounded-full px-5 py-2.5 ddc-sm transition">Check answers</button>
        </>
      )}
    </div>
  );
}

// ---- Per-module graded knowledge check (server-scored) ---------------------
function KnowledgeCheck({ module: mod, alreadyPassed, onPassed }) {
  const [questions, setQuestions] = useState(null);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [passed, setPassed] = useState(alreadyPassed);

  const load = useCallback(async () => {
    setError(null); setResult(null); setAnswers({});
    try { setQuestions(await getModuleQuestions(mod.id)); }
    catch (err) { setError(err.message || 'Could not load the quiz.'); }
  }, [mod.id]);

  useEffect(() => { if (!alreadyPassed) load(); }, [alreadyPassed, load]);

  if (passed) return <p className="ddc-sm ddc-good flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Knowledge check passed.</p>;
  if (error) return <div className="ddc-sm ddc-bad flex items-center gap-2"><AlertCircle className="w-4 h-4" />{error}<button onClick={load} className="underline ml-2">Retry</button></div>;
  if (!questions) return <div className="ddc-sm ddc-muted flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading knowledge check…</div>;

  const allAnswered = questions.length > 0 && questions.every((q) => answers[q.id]);
  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const r = await submitKnowledgeCheck(mod.id, answers);
      setResult(r);
      if (r.passed) { setPassed(true); onPassed(); }
    } catch (err) { setError(err.message || 'Could not submit.'); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <h2 className="ddc-lg font-bold ddc-heading mb-1">Module quiz</h2>
      <p className="ddc-xs ddc-muted mb-5">Answer all questions to complete this module. You can retake it if needed.</p>
      <div className="space-y-6">
        {questions.map((q, qi) => (
          <fieldset key={q.id}>
            <legend className="ddc-base font-medium ddc-heading mb-2">{qi + 1}. {q.prompt}</legend>
            <div className="space-y-2">
              {(q.choices || []).map((c) => (
                <label key={c.key} className={`ddc-opt flex items-center gap-3 rounded-lg px-3 py-2 cursor-pointer ddc-sm transition ${answers[q.id] === c.key ? 'is-sel' : ''}`}>
                  <input type="radio" name={q.id} value={c.key} checked={answers[q.id] === c.key}
                    onChange={() => setAnswers((a) => ({ ...a, [q.id]: c.key }))}
                    style={{ accentColor: 'var(--ddc-accent-solid)' }} />
                  <span>{c.text}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>

      {result && !result.passed && (
        <p className="mt-4 ddc-sm ddc-warn">You scored {result.score_pct}% — {result.threshold}% is required to pass. Review the material and try again.
          <button onClick={load} className="underline ml-2">New attempt</button></p>
      )}
      {error && <p className="mt-4 ddc-sm ddc-bad flex items-center gap-2"><AlertCircle className="w-4 h-4" />{error}</p>}

      <button onClick={submit} disabled={!allAnswered || busy}
        className="mt-5 ddc-btn rounded-full px-6 py-3 ddc-sm transition flex items-center gap-2">
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
      <div className="rounded-xl ddc-cal ddc-cal-key p-5">
        <div className="flex items-center gap-3 mb-3"><Award className="w-6 h-6 ddc-good" /><p className="font-semibold ddc-heading ddc-base">Final exam passed — course complete!</p></div>
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
      setExam(e); setAnswers({}); setPhase('exam'); window.scrollTo(0, 0);
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
      if (r.passed) setPassed(true); else await loadAttempts();
    } catch (err) { setError(err.message || 'Could not submit.'); }
    finally { setBusy(false); }
  };

  if (phase === 'loading') {
    return <div className="rounded-xl border ddc-bd ddc-card p-5 ddc-sm ddc-muted flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading final exam…</div>;
  }

  if (phase === 'exam' && exam) {
    const allAnswered = exam.questions.every((q) => answers[q.id]);
    return (
      <div className="rounded-xl border ddc-bd ddc-card p-5">
        <h3 className="ddc-lg font-bold ddc-heading mb-1">Final Exam</h3>
        <p className="ddc-xs ddc-muted mb-5">{exam.questions.length} questions · {course.pass_threshold_pct}% to pass</p>
        <div className="space-y-6">
          {exam.questions.map((q, qi) => (
            <fieldset key={q.id}>
              <legend className="ddc-base font-medium ddc-heading mb-2">{qi + 1}. {q.prompt}</legend>
              <div className="space-y-2">
                {(q.choices || []).map((c) => (
                  <label key={c.key} className={`ddc-opt flex items-center gap-3 rounded-lg px-3 py-2 cursor-pointer ddc-sm transition ${answers[q.id] === c.key ? 'is-sel' : ''}`}>
                    <input type="radio" name={q.id} value={c.key} checked={answers[q.id] === c.key}
                      onChange={() => setAnswers((a) => ({ ...a, [q.id]: c.key }))} style={{ accentColor: 'var(--ddc-accent-solid)' }} />
                    <span>{c.text}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
        {error && <p className="mt-4 ddc-sm ddc-bad flex items-center gap-2"><AlertCircle className="w-4 h-4" />{error}</p>}
        <button onClick={doSubmit} disabled={!allAnswered || busy}
          className="mt-5 ddc-btn rounded-full px-6 py-3 ddc-sm transition flex items-center gap-2">
          {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</> : 'Submit exam'}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl ddc-cal ddc-cal-key p-5">
      <div className="flex items-center gap-3 mb-2"><Award className="w-6 h-6 ddc-good" /><p className="font-semibold ddc-heading ddc-base">Final Exam</p></div>
      {result && !result.passed && (
        <p className="ddc-sm ddc-warn mb-3">You scored {result.score_pct}% — {result.threshold}% is required. {result.attempts_remaining > 0 ? `${result.attempts_remaining} attempt(s) remaining.` : 'No attempts remaining — please contact support.'}</p>
      )}
      <p className="ddc-xs ddc-muted mb-4">{course.exam_question_count} questions · {course.pass_threshold_pct}% to pass · attempt {Math.min(attemptsUsed + 1, course.retake_limit)} of {course.retake_limit}</p>
      {error && <p className="ddc-sm ddc-bad mb-3 flex items-center gap-2"><AlertCircle className="w-4 h-4" />{error}</p>}
      {remaining <= 0 ? (
        <p className="ddc-sm ddc-text">No attempts remaining. Please contact support.</p>
      ) : inCooldown ? (
        <p className="ddc-sm ddc-text">You can try again after {cooldownUntil.toLocaleTimeString()}.</p>
      ) : (
        <button onClick={start} disabled={busy} className="ddc-btn rounded-full px-6 py-3 ddc-sm transition flex items-center gap-2">
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
      try { const r = await issueCertificate(courseSlug); if (live) setUid(r.certificate_uid); }
      catch (err) { if (live) setError(err.message || 'Could not prepare certificate.'); }
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
      <p className="ddc-sm ddc-text mb-3">
        Your certificate has been generated and forwarded to the agency for your insurance discount review.
        {uid && <> Certificate ID: <span className="font-mono ddc-heading">{uid}</span>.</>}
      </p>
      {error && <p className="ddc-sm ddc-bad mb-3 flex items-center gap-2"><AlertCircle className="w-4 h-4" />{error}</p>}
      <button onClick={download} disabled={preparing || downloading} className="ddc-btn rounded-full px-6 py-3 ddc-sm transition flex items-center gap-2">
        {preparing ? <><Loader2 className="w-4 h-4 animate-spin" /> Preparing…</>
          : downloading ? <><Loader2 className="w-4 h-4 animate-spin" /> Opening…</>
          : <><Download className="w-4 h-4" /> Download certificate</>}
      </button>
    </div>
  );
}
