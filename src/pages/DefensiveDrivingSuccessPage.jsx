// src/pages/DefensiveDrivingSuccessPage.jsx
// Post-checkout: confirm payment activated the enrollment (webhook flips it
// from pending_payment -> active). Polls briefly while Stripe delivers.
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle, Loader2, Clock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getDefensiveDrivingCourse, getMyEnrollment } from '../lib/ddApi';

export default function DefensiveDrivingSuccessPage() {
  const { user, loading: authLoading } = useAuth();
  const [state, setState] = useState('checking'); // checking | active | pending
  useEffect(() => {
    if (authLoading) return;
    if (!user) { setState('pending'); return; }
    let tries = 0;
    let timer;
    const poll = async () => {
      try {
        const course = await getDefensiveDrivingCourse();
        const enr = course ? await getMyEnrollment(course.id) : null;
        if (enr && (enr.status === 'active' || enr.status === 'completed')) {
          setState('active');
          return;
        }
      } catch { /* keep polling */ }
      tries += 1;
      if (tries >= 10) { setState('pending'); return; }
      timer = setTimeout(poll, 2000);
    };
    poll();
    return () => clearTimeout(timer);
  }, [user, authLoading]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center bg-slate-50 px-4 py-14 text-slate-700">
      <div className="max-w-lg w-full rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        {state === 'active' ? (
          <>
            <CheckCircle className="w-14 h-14 text-emerald-500 mx-auto mb-4" />
            <h1 className="text-2xl font-extrabold text-[#0F2D6B] mb-2">Payment complete — you’re enrolled!</h1>
            <p className="text-sm text-slate-600 mb-6">Your Georgia 6-Hour Defensive Driving course is ready.</p>
            <Link to="/courses/defensive-driving/portal"
              className="inline-block rounded-2xl px-6 py-3.5 text-base font-bold bg-blue-700 hover:bg-blue-800 text-white transition">
              Start your course
            </Link>
          </>
        ) : state === 'checking' ? (
          <>
            <Loader2 className="w-12 h-12 text-blue-700 mx-auto mb-4 animate-spin" />
            <h1 className="text-xl font-extrabold text-[#0F2D6B] mb-2">Confirming your payment…</h1>
            <p className="text-sm text-slate-500">This only takes a moment.</p>
          </>
        ) : (
          <>
            <Clock className="w-12 h-12 text-amber-500 mx-auto mb-4" />
            <h1 className="text-xl font-extrabold text-[#0F2D6B] mb-2">Almost there</h1>
            <p className="text-sm text-slate-600 mb-6">
              Your payment is processing. If you completed checkout, your access will appear shortly —
              refresh this page or head to the course page.
            </p>
            <Link to="/courses/defensive-driving"
              className="inline-block rounded-2xl border-2 border-blue-700 px-6 py-3 text-base font-bold text-blue-700 hover:bg-blue-50 transition">
              Back to course
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
