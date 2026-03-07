// src/pages/ParentDashboardPage.jsx — Parent dashboard with profile completion checklist
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Moon, LogOut, Check, AlertCircle, ChevronRight, Shield, Baby, Heart, Phone, Users, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useProfileCompletion } from '../hooks/useProfileCompletion';

export default function ParentDashboardPage() {
  const navigate = useNavigate();
  const { loading, percentage, items, isFullyComplete, refresh } = useProfileCompletion();
  const [parentName, setParentName] = useState('');
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate('/parent/login', { replace: true }); return; }

      const { data: parent } = await supabase
        .from('parents')
        .select('first_name, onboarding_status')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!parent || parent.onboarding_status !== 'complete') {
        navigate('/parent/onboarding', { replace: true });
        return;
      }

      setParentName(parent.first_name);
      setCheckingAuth(false);
    };
    checkAuth();
  }, [navigate]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/parent/login');
  };

  if (checkingAuth || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  const ITEM_ICONS = { child_profile: Baby, medical_profile: Heart, emergency_contacts: Phone, authorized_pickups: Users };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Moon className="w-6 h-6 text-indigo-600" />
            <span className="text-lg font-semibold text-gray-900">NightNest</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">Hi, {parentName}</span>
            <button onClick={handleSignOut}
              className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">
              <LogOut className="w-4 h-4" /> Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Profile completion banner */}
        {!isFullyComplete && (
          <div className="mb-8 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-6 text-white">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold">Complete your profile</h2>
                <p className="text-indigo-200 text-sm mt-1">Add more details to ensure the best care for your child.</p>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold">{percentage}%</div>
                <div className="text-xs text-indigo-200">complete</div>
              </div>
            </div>
            <div className="w-full bg-white/20 rounded-full h-2">
              <div className="bg-white rounded-full h-2 transition-all duration-500" style={{ width: `${percentage}%` }} />
            </div>
          </div>
        )}

        {/* Welcome */}
        <h1 className="text-2xl font-bold text-gray-900 mb-6">
          {isFullyComplete ? 'Your Dashboard' : 'Profile Checklist'}
        </h1>

        {/* Checklist */}
        <div className="space-y-3">
          {items.map((item) => {
            const Icon = ITEM_ICONS[item.key] || Shield;
            return (
              <div key={item.key}
                className={`bg-white border rounded-xl p-5 flex items-center gap-4 transition-colors ${
                  item.complete ? 'border-emerald-200' : 'border-gray-200 hover:border-indigo-200'
                }`}>
                <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                  item.complete ? 'bg-emerald-100' : 'bg-gray-100'
                }`}>
                  {item.complete
                    ? <Check className="w-5 h-5 text-emerald-600" />
                    : <Icon className="w-5 h-5 text-gray-400" />
                  }
                </div>
                <div className="flex-1">
                  <div className="font-medium text-gray-900">{item.label}</div>
                  {item.complete ? (
                    <div className="text-sm text-emerald-600">Complete</div>
                  ) : (
                    <div className="text-sm text-gray-500">
                      {item.missingFields?.length > 0
                        ? `Missing: ${item.missingFields.join(', ')}`
                        : 'Not yet added'
                      }
                    </div>
                  )}
                </div>
                <ChevronRight className="w-5 h-5 text-gray-300" />
              </div>
            );
          })}
        </div>

        {/* Reservation safety notice */}
        <div className="mt-8 bg-amber-50 border border-amber-200 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-medium text-amber-800">Reservation Requirements</h3>
              <p className="text-sm text-amber-700 mt-1">
                To make a reservation, your child must have at least one emergency contact and a completed medical acknowledgement. These are required for your child's safety during overnight stays.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
