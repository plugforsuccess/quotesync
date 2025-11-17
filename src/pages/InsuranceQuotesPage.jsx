// src/pages/InsuranceQuotesPage.jsx
import React, { useState, useEffect } from 'react';
import { CheckCircle } from 'lucide-react';

import StepModal from './components/StepModal';
import QuoteHero from './components/QuoteHero';
import StartQuoteCard from './components/StartQuoteCard';
import WhyQuotesDifferent from './components/WhyQuotesDifferent';
import SmarterFasterSection from './components/SmarterFasterSection';

export default function InsuranceQuotesPage() {
  const [submitted, setSubmitted] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [confetti, setConfetti] = useState([]);
  const [modalStep, setModalStep] = useState(null);

  // these exist for your future form logic; success screen currently just resets them
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    zipCode: '',
    currentlyInsured: '',
  });
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});

  useEffect(() => {
    setIsVisible(true);
  }, []);

  useEffect(() => {
    if (submitted) {
      const newConfetti = Array.from({ length: 30 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 0.5,
        duration: 2 + Math.random() * 2,
      }));
      setConfetti(newConfetti);
    }
  }, [submitted]);

  // Step details for modal (unchanged)
  const stepDetails = {
    1: {
      title: 'Select your current insurance company',
      description:
        'Choose your insurance provider from our list of supported carriers. We support all major insurance companies including State Farm, Allstate, Progressive, GEICO, and many more.',
      screenshot: '/screenshots/step1-select-provider.png',
      tips: [
        'Use the search bar to quickly find your provider',
        "Can\'t find yours? Contact us for help",
        'We support 100+ insurance carriers',
      ],
    },
    2: {
      title: 'Log in securely using your existing credentials',
      description:
        "Enter the same username and password you use to access your insurance account online. Your credentials are encrypted and never stored on our servers.",
      screenshot: '/screenshots/step2-login.png',
      tips: [
        'Use your online account credentials',
        "This is the same login you use on your insurer\'s website",
        'Your password is encrypted with 256-bit security',
      ],
    },
    3: {
      title: 'Enter the quick verification code',
      description:
        "For your security, we'll send a verification code to your phone or email. This two-factor authentication ensures only you can access your policy information.",
      screenshot: '/screenshots/step3-verification.png',
      tips: [
        'Check your text messages or email',
        'The code expires in 10 minutes',
        "Didn\'t receive it? Request a new code",
      ],
    },
    4: {
      title: 'Your current policy details load automatically',
      description:
        'Once verified, we securely retrieve your policy information including coverage levels, deductibles, vehicle details, and driver information. No manual data entry required!',
      screenshot: '/screenshots/step4-loading.png',
      tips: [
        'This usually takes 10–30 seconds',
        'All data is transmitted with bank-level encryption',
        "We only access what\'s needed for your quote",
      ],
    },
    5: {
      title: 'Confirm your contact information',
      description:
        'Review and update your contact details to ensure we can reach you with your personalized quote. You can also set your preferred contact method and time.',
      screenshot: '/screenshots/step5-contact.png',
      tips: [
        'Double-check your email address',
        'Add a preferred contact time if needed',
        'Choose phone or email for your quote delivery',
      ],
    },
    6: {
      title: 'Add any drivers listed on your policy',
      description:
        'Confirm all drivers on your current policy. Accurate driver information, including driving history and experience, ensures you get the most accurate quote possible.',
      screenshot: '/screenshots/step6-drivers.png',
      tips: [
        'Include all licensed household members',
        'Driver history affects your rate',
        'Accurate information = accurate quotes',
      ],
    },
    7: {
      title: 'Done! Your policy is sent to Cameron',
      description:
        'That’s it! Your complete policy information is now securely transmitted to Cameron, who will prepare your personalized Allstate quote within 24 hours. You’ll receive a call or email with your custom comparison.',
      screenshot: '/screenshots/step7-complete.png',
      tips: [
        'Expect a call or email within 24 hours',
        'No obligation to switch',
        'Cameron will explain all your options',
      ],
    },
  };

  // Success screen (unchanged visually)
  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjA1IiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-30"></div>
        {confetti.map((item) => (
          <div
            key={item.id}
            className="absolute w-2 h-2 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full"
            style={{
              left: `${item.left}%`,
              top: '-10%',
              animation: `fall ${item.duration}s ease-in ${item.delay}s`,
              opacity: 0.8,
            }}
          />
        ))}

        <style>{`
          @keyframes wiggle {
            0%, 100% { transform: rotate(-3deg); }
            50% { transform: rotate(3deg); }
          }
          @keyframes float {
            0%, 100% { transform: translateY(0px); }
            50% { transform: translateY(-10px); }
          }
          @keyframes blob {
            0%, 100% { transform: translate(0, 0) scale(1); }
            33% { transform: translate(30px, -50px) scale(1.1); }
            66% { transform: translate(-20px, 20px) scale(0.9); }
          }
        `}</style>

        <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl p-10 max-w-lg w-full text-center relative z-10 border border-white/20">
          <div className="relative">
            <div className="w-20 h-20 bg-gradient-to-br from-green-400 to-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg animate-bounce">
              <CheckCircle className="w-12 h-12 text-white" />
            </div>
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 bg-green-400/20 rounded-full blur-2xl -z-10 animate-pulse"></div>
          </div>

          <h2 className="text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent mb-3">
            You're All Set!
          </h2>
          <p className="text-gray-600 mb-8 text-lg leading-relaxed">
            Our insurance specialists are reviewing your information. Expect personalized quotes from top providers within 24 hours.
          </p>

          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-6 mb-8 border border-blue-100">
            <p className="text-sm text-gray-700 mb-2">📧 Check your email for confirmation</p>
            <p className="text-sm text-gray-700">📱 Watch for our call with your quotes</p>
          </div>

          <button
            onClick={() => {
              setSubmitted(false);
              setFormData({
                firstName: '',
                lastName: '',
                email: '',
                phone: '',
                zipCode: '',
                currentlyInsured: '',
              });
              setErrors({});
              setTouched({});
            }}
            className="text-blue-600 hover:text-blue-700 font-semibold hover:underline transition"
          >
            ← Get Another Quote
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-600 via-blue-900 to-indigo-900 relative overflow-hidden">
      {/* Modal */}
      {modalStep && (
        <StepModal
          step={modalStep}
          onClose={() => setModalStep(null)}
          stepDetails={stepDetails}
          setModalStep={setModalStep}
        />
      )}

      {/* Animated blobs + background (unchanged) */}
      <div className="absolute inset-0 opacity-50 overflow-hidden">
        <div className="absolute top-10 left-10 w-64 h-64 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl animate-blob"></div>
        <div className="absolute top-10 right-10 w-64 h-64 bg-yellow-400 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-2000"></div>
        <div className="absolute bottom-10 left-20 w-64 h-64 bg-pink-500 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-4000"></div>
        <div className="absolute bottom-10 right-20 w-64 h-64 bg-cyan-400 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-6000"></div>
      </div>

      <style>{`
        @keyframes wiggle {
          0%, 100% { transform: rotate(-3deg) scale(1); }
          50% { transform: rotate(3deg) scale(1.05); }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-20px); }
        }
        @keyframes scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes blob {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
        }
        .animate-blob { animation: blob 7s infinite; }
        .animation-delay-2000 { animation-delay: 2s; }
        .animation-delay-4000 { animation-delay: 4s; }
        .animation-delay-6000 { animation-delay: 6s; }
        .logo-track {
          animation: scroll 20s linear infinite;
          display: flex;
          gap: 4rem;
        }
        .logo-track:hover { animation-play-state: paused; }
      `}</style>

      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjA1IiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-30"></div>
      <div className="absolute top-20 left-10 w-72 h-72 bg-blue-500/20 rounded-full blur-3xl animate-pulse"></div>
      <div
        className="absolute bottom-20 right-10 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl animate-pulse"
        style={{ animationDelay: '700ms' }}
      ></div>

      {/* DEV ONLY: preview thank-you route */}
      {import.meta.env.DEV && (
        <div className="fixed bottom-4 right-4 z-50">
          <a
            href="/success"
            className="bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg hover:bg-red-600 inline-block"
          >
            Preview Thank You Page
          </a>
        </div>
      )}

      {/* HERO */}
      <QuoteHero isVisible={isVisible} />

      {/* MAIN QUOTE CARD + PROCESS */}
      <StartQuoteCard isVisible={isVisible} setModalStep={setModalStep} />

      {/* WHY QUOTES ARE DIFFERENT */}
      <WhyQuotesDifferent />

      {/* SMARTER FASTER SECTION */}
      <SmarterFasterSection isVisible={isVisible} />
    </div>
  );
}
