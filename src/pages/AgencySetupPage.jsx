// src/pages/AgencySetupPage.jsx
// MT-04: Agency Onboarding Checklist Page
// Shows a 5-step setup checklist for new agency agents

import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { CheckCircle, Circle, ArrowRight, Rocket } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useAgencyDetail, useMarkSetupComplete } from '../hooks/useAgencies';
import PageSpinner from '../components/PageSpinner';

const SETUP_STEPS = [
  {
    key: 'profile',
    label: 'Agency Profile',
    description: 'Set your brand name, contact email, and phone number.',
    link: '/agency/settings',
    check: (agency) => !!(agency.brand_name && agency.email && agency.phone),
  },
  {
    key: 'twilio',
    label: 'Notification Setup',
    description: 'Enter your cell number so leads can reach you by call and text.',
    link: '/agency/settings',
    check: (agency) => !!(agency.agent_cell_number),
  },
  {
    key: 'territory',
    label: 'Territory',
    description: 'Configure which states and ZIP codes you serve.',
    link: '/agency/settings',
    check: (agency) => (agency.licensed_states?.length > 0),
  },
  {
    key: 'commission',
    label: 'Commission Rates',
    description: 'Confirm your product lines and commission rates.',
    link: '/agency/settings',
    check: (agency) => !!(agency.setup_steps?.commission),
  },
  {
    key: 'team',
    label: 'Team Members',
    description: 'Invite your producers, or skip if you\'re working solo.',
    link: '/agency/team',
    check: (agency) => !!(agency.setup_steps?.team),
  },
];

export default function AgencySetupPage() {
  const navigate = useNavigate();
  const { currentAgencyId } = useAuth();
  const { data: agency, isLoading } = useAgencyDetail(currentAgencyId);
  const markComplete = useMarkSetupComplete(currentAgencyId);
  const [marking, setMarking] = useState(false);

  if (isLoading) return <PageSpinner />;
  if (!agency) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <p className="text-gray-600">No agency found.</p>
      </div>
    );
  }

  const stepStatuses = SETUP_STEPS.map((step) => ({
    ...step,
    completed: step.check(agency),
  }));

  const allComplete = stepStatuses.every((s) => s.completed);
  const completedCount = stepStatuses.filter((s) => s.completed).length;

  const handleMarkComplete = async () => {
    setMarking(true);
    try {
      await markComplete.mutateAsync();
      navigate('/agency/dashboard');
    } catch (err) {
      console.error('Failed to mark setup complete:', err);
    } finally {
      setMarking(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Rocket className="w-8 h-8 text-primary-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Welcome to QuoteSync</h1>
          <p className="text-gray-600 text-lg">Complete these steps before going live.</p>
          <div className="mt-4 flex items-center justify-center gap-2">
            <div className="h-2 w-48 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary-600 rounded-full transition-all duration-500"
                style={{ width: `${(completedCount / SETUP_STEPS.length) * 100}%` }}
              />
            </div>
            <span className="text-sm text-gray-500 font-medium">
              {completedCount}/{SETUP_STEPS.length}
            </span>
          </div>
        </div>

        {/* Steps */}
        <div className="space-y-3 mb-8">
          {stepStatuses.map((step, index) => (
            <Link
              key={step.key}
              to={step.link}
              className="flex items-center gap-4 bg-white rounded-xl border border-gray-200 p-5 hover:border-primary-300 hover:shadow-sm transition-all group"
            >
              <div className="flex-shrink-0">
                {step.completed ? (
                  <CheckCircle className="w-7 h-7 text-green-500" />
                ) : (
                  <Circle className="w-7 h-7 text-gray-300" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-400 font-medium">{index + 1}.</span>
                  <h3 className={`font-semibold ${step.completed ? 'text-gray-500' : 'text-gray-900'}`}>
                    {step.label}
                  </h3>
                </div>
                <p className="text-sm text-gray-500 mt-0.5">{step.description}</p>
              </div>
              <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-primary-500 transition-colors flex-shrink-0" />
            </Link>
          ))}
        </div>

        {/* Action buttons */}
        <div className="space-y-3">
          {allComplete && (
            <button
              onClick={handleMarkComplete}
              disabled={marking}
              className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-primary-600 hover:bg-primary-700 text-white font-bold rounded-xl transition-colors disabled:opacity-50"
            >
              {marking ? 'Completing...' : 'Mark Setup Complete'}
            </button>
          )}
          <Link
            to="/agency/dashboard"
            className="block w-full text-center text-sm text-gray-500 hover:text-gray-700 py-2 transition-colors"
          >
            Skip setup, go to dashboard &rarr;
          </Link>
        </div>
      </div>
    </div>
  );
}
