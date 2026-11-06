// src/pages/DefensiveDrivingSuccessPage.jsx
// Post-checkout: confirm payment activated the enrollment (webhook flips it
// from pending_payment -> active). Polls briefly while Stripe delivers.
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Loader2, Clock, ArrowRight } from 'lucide-react';
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
            <span className="qc-badge mb-4" aria-hidden="true"><Check className="h-8 w-8" strokeWidth={3} /></span>
            <h1 className="text-2xl font-extrabold text-[#0F2D6B] mb-2">Payment Complete — You’re Enrolled!</h1>
            <p className="text-sm text-slate-600 mb-6">Your Georgia 6-Hour Defensive Driving course is ready.</p>
            <Link to="/courses/defensive-driving/portal"
              className="qb qb-blue qb-lg w-full sm:w-auto">
              Start Your Course <ArrowRight className="qb-arrow h-5 w-5" aria-hidden="true" />
            </Link>
          </>
        ) : state === 'checking' ? (
          <>
            <Loader2 className="w-12 h-12 text-blue-700 mx-auto mb-4 animate-spin" />
            <h1 className="text-xl font-extrabold text-[#0F2D6B] mb-2">Confirming Your Payment…</h1>
            <p className="text-sm text-slate-500">This only takes a moment.</p>
          </>
        ) : (
          <>
            <Clock className="w-12 h-12 text-[#B07A0E] mx-auto mb-4" />
            <h1 className="text-xl font-extrabold text-[#0F2D6B] mb-2">Almost There</h1>
            <p className="text-sm text-slate-600 mb-6">
              Your payment is processing. If you completed checkout, your access will appear shortly —
              refresh this page or head to the course page.
            </p>
            <Link to="/courses/defensive-driving"
              className="qb qb-outline qb-md border-2 border-blue-700 text-blue-700">
              Back to Course
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
