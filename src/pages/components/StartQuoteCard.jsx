// src/components/StartQuoteCard.jsx - ULTRA ADVANCED VERSION
import React, { useState } from 'react';
import { ArrowRight, CheckCircle, Shield, Zap, Lock, Eye } from 'lucide-react';

const StartQuoteCard = ({ isVisible, setModalStep }) => {
  return (
    <div
      className={`w-full px-4 sm:px-6 lg:px-12 pb-24 mb-16 transition-all duration-1000 delay-300 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
      }`}
    >
      <div
        className={`max-w-5xl pt-0 mx-auto transition-all duration-1000 delay-500 ${
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
        }`}
      >
        {/* Main Card with Advanced Glassmorphism */}
        <div className="relative group">
          {/* Animated Gradient Border */}
          <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 rounded-[2rem] opacity-75 group-hover:opacity-100 blur-sm group-hover:blur-md transition duration-1000 animate-gradient-x"></div>
          
          {/* Card Content */}
          <div className="relative bg-white/95 backdrop-blur-2xl rounded-[2rem] shadow-2xl p-6 sm:p-8 md:p-12 border border-white/50 overflow-hidden">
            {/* Animated Mesh Background */}
            <div className="absolute inset-0 opacity-[0.03]">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 animate-mesh"></div>
            </div>

            {/* Floating Orbs */}
            <div className="absolute top-10 right-10 w-32 h-32 bg-gradient-to-br from-blue-400/20 to-purple-400/20 rounded-full blur-3xl animate-float"></div>
            <div className="absolute bottom-10 left-10 w-40 h-40 bg-gradient-to-br from-purple-400/20 to-pink-400/20 rounded-full blur-3xl animate-float-delayed"></div>

            {/* Content */}
            <div className="relative z-10">
              {/* Header with Gradient Text */}
              <div className="text-center mb-4">
                <div className="inline-block mb-4">
              
                </div>

                <h2 className="text-4xl sm:text-5xl font-black mb-4 leading-tight">
                  <span className="bg-gradient-to-r from-gray-900 via-blue-900 to-purple-900 bg-clip-text text-transparent animate-gradient-x">
                    Start Your Quote
                  </span>
                </h2>

                {/* Primary CTA with Advanced Styling */}
                <div className="max-w-xl mx-auto">
                  <a
                    className="canopy-connect-embed group relative inline-flex items-center justify-center gap-3 w-full overflow-hidden rounded-2xl p-0.5 transition-all duration-500 hover:scale-[1.02] active:scale-[0.98] no-underline"
                    href="https://app.usecanopy.com/c/insuredbycam"
                    target="_blank"
                  >
                    {/* Animated Gradient Border */}
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 animate-gradient-x"></div>
                    
                    {/* Button Content */}
                    <div className="relative flex items-center justify-center gap-3 w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-8 py-5 rounded-2xl transition-all duration-300">
                      {/* Shine Effect */}
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000"></div>
                      
                      <span className="relative z-10 text-white font-black text-lg tracking-wide whitespace-nowrap">
                        Continue
                      </span>
                      <ArrowRight className="relative z-10 w-6 h-6 text-white transition-transform duration-300 group-hover:translate-x-2" />
                    </div>
                  </a>

                  <div className="flex items-center justify-center gap-6 mt-4 text-sm text-gray-600">
                    <span className="flex items-center gap-1">
                      <Shield className="w-4 h-4 text-green-600" />
                      Bank-level security
                    </span>
                    <span className="flex items-center gap-1">
                      <Zap className="w-4 h-4 text-blue-600" />
                      Takes 2-3 minutes
                    </span>
                  </div>
                </div>
              </div>
st
              {/* Process Steps with Advanced Design */}
              <ProcessSteps setModalStep={setModalStep} />

              {/* How it works + Security */}
              <HowItWorks />
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes gradient-x {
          0%, 100% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
        }

        @keyframes mesh {
          0%, 100% {
            transform: translate(0, 0) scale(1);
          }
          33% {
            transform: translate(5%, -5%) scale(1.05);
          }
          66% {
            transform: translate(-5%, 5%) scale(0.95);
          }
        }

        @keyframes float {
          0%, 100% {
            transform: translate(0, 0) rotate(0deg);
          }
          33% {
            transform: translate(10px, -10px) rotate(5deg);
          }
          66% {
            transform: translate(-10px, 10px) rotate(-5deg);
          }
        }

        .animate-gradient-x {
          background-size: 200% 200%;
          animation: gradient-x 3s ease infinite;
        }

        .animate-mesh {
          animation: mesh 20s ease-in-out infinite;
        }

        .animate-float {
          animation: float 8s ease-in-out infinite;
        }

        .animate-float-delayed {
          animation: float 10s ease-in-out infinite;
          animation-delay: -5s;
        }
      `}</style>
    </div>
  );
};

const ProcessSteps = ({ setModalStep }) => {
  const [hoveredStep, setHoveredStep] = useState(null);

  const steps = [
    { step: 1, text: 'Select your current insurance company', icon: '🔍' },
    { step: 2, text: 'Log in securely using your existing credentials', icon: '🔐' },
    { step: 3, text: 'Enter the quick verification code', icon: '📱' },
    { step: 4, text: 'Your current policy details load automatically', icon: '⚡' },
    { step: 5, text: 'Confirm your contact information', icon: '✉️' },
    { step: 6, text: 'Add any drivers listed on your policy', icon: '👥' },
    { step: 7, text: 'Done — sent directly to Cameron', icon: '🎉' },
  ];

  return (
    <div className="mt-16 relative">
      {/* Background Card with Advanced Gradient */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-50 via-blue-50 to-purple-50 border-2 border-indigo-200 p-8 shadow-2xl">
        {/* Animated Background Pattern */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(99,102,241,0.1)_25%,rgba(99,102,241,0.1)_50%,transparent_50%,transparent_75%,rgba(99,102,241,0.1)_75%,rgba(99,102,241,0.1))] bg-[length:20px_20px] animate-slide"></div>
        </div>

        {/* Floating Gradient Orbs */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-blue-400/10 to-purple-400/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-indigo-400/10 to-pink-400/10 rounded-full blur-2xl"></div>

        <div className="relative z-10">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-3 mb-3">
                <h2 className="text-2xl sm:text-3xl font-black bg-gradient-to-r from-gray-900 via-indigo-900 to-purple-900 bg-clip-text text-transparent">
                The Process is Simple
              </h2>
            </div>
            <p className="text-sm font-semibold text-indigo-600">Click any step for details</p>
          </div>

          {/* Steps Grid */}
          <div className="space-y-3">
            {steps.map((item) => (
              <div
                key={item.step}
                onClick={() => setModalStep(item.step)}
                onMouseEnter={() => setHoveredStep(item.step)}
                onMouseLeave={() => setHoveredStep(null)}
                className="relative group cursor-pointer"
              >
                {/* Glow Effect on Hover */}
                <div className={`absolute -inset-0.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-2xl opacity-0 group-hover:opacity-50 blur transition duration-300`}></div>
                
                {/* Step Card */}
                <div className="relative flex items-start gap-4 bg-white/90 backdrop-blur-sm rounded-2xl p-5 shadow-md group-hover:shadow-2xl transition-all duration-300 transform group-hover:-translate-y-1 border border-indigo-100 group-hover:border-indigo-300">
                  {/* Step Number with Advanced Styling */}
                  <div className="flex-shrink-0 relative">
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg transition-all duration-300 ${
                      hoveredStep === item.step ? 'scale-110 rotate-2' : 'scale-100 rotate-0'
                    }`}>
                      <span className="text-white font-bold text-lg">{item.step}</span>
                    </div>
                    {/* Connecting Line (except last) */}
                    {item.step < steps.length && (
                      <div className="absolute top-12 left-1/2 -translate-x-1/2 w-0.5 h-3 bg-gradient-to-b from-indigo-300 to-transparent"></div>
                    )}
                  </div>

                  {/* Step Text */}
                  <div className="flex-1 pt-2.5">
                    <p className="text-gray-800 font-semibold text-base leading-relaxed group-hover:text-indigo-900 transition-colors">
                      {item.text}
                    </p>
                  </div>

                  {/*Icon with Animation*/}
                  <div className={`flex-shrink-0 text-3xl transition-all duration-300 ${
                    hoveredStep === item.step ? 'scale-125 rotate-12' : 'scale-100 rotate-0'
                  }`}>
                    {item.icon}
                  </div>

                  {/* Click Indicator
                  <div className="absolute top-1/2 right-4 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <Eye className="w-5 h-5 text-indigo-500" />
                  </div> */}
                </div>
              </div>
            ))}
          </div>

          {/* Bottom CTA */}
          <div className="mt-8 text-center">
            <a
              className="group inline-flex items-center justify-center gap-3 relative overflow-hidden rounded-2xl p-0.5 transition-all duration-500 hover:scale-105 active:scale-95 no-underline"
              href="https://app.usecanopy.com/c/insuredbycam"
              target="_blank"
            >
              {/* Animated Border */}
              <div className="absolute inset-0 bg-gradient-to-r from-emerald-500 via-green-500 to-teal-500 animate-gradient-x"></div>
              
              {/* Button Content */}
                <a
                 className="canopy-connect-embed group relative flex items-center justify-center gap-3 
                                bg-gradient-to-r from-emerald-500 via-green-500 to-teal-500 
                                px-8 py-4 rounded-2xl text-white font-black text-lg
                                hover:from-emerald-600 hover:via-green-600 hover:to-teal-600
                                transition-all duration-300 transform hover:scale-105 active:scale-95
                                shadow-xl hover:shadow-emerald-500/50 no-underline"
                    href="https://app.usecanopy.com/c/insuredbycam"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setModalStep(1)}   // open modal at step 1
                    >
                 <span className="text-white font-black text-lg whitespace-nowrap">Start My Quote</span>
                <ArrowRight className="w-5 h-5 text-white transition-transform group-hover:translate-x-2" />
                </a>
            </a>
            <p className="text-xs text-gray-500 mt-3 flex items-center justify-center gap-4">
              <span className="flex items-center gap-1">
                <CheckCircle className="w-3 h-3 text-green-600" />
                No credit check
              </span>
              <span className="flex items-center gap-1">
                <Lock className="w-3 h-3 text-blue-600" />
                No card required
              </span>
            </p>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes slide {
          0% {
            transform: translateX(0) translateY(0);
          }
          100% {
            transform: translateX(20px) translateY(20px);
          }
        }

        .animate-slide {
          animation: slide 20s linear infinite;
        }
      `}</style>
    </div>
  );
};

const HowItWorks = () => {
  return (
    <div className="mt-12 space-y-8">
      {/* How it works Section */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 border-2 border-blue-200 p-8 shadow-xl">
        {/* Animated Background */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-blue-400/10 to-transparent rounded-full blur-3xl"></div>
        
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
              <span className="text-2xl">💡</span>
            </div>
            <h3 className="text-2xl font-black text-gray-900">How Does This Work?</h3>
          </div>

          <div className="grid sm:grid-cols-2 gap-4 mb-8">
            {/* Old Way */}
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-gray-400 to-gray-500 rounded-2xl opacity-20 group-hover:opacity-40 blur transition duration-300"></div>
              <div className="relative bg-white/80 backdrop-blur-sm rounded-2xl p-6 border-2 border-gray-200 transition-all duration-300 group-hover:shadow-lg">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-2xl">😓</span>
                  <p className="text-sm font-bold text-gray-500 uppercase tracking-wider">
                    The Old Way
                  </p>
                </div>
                <p className="text-gray-700 leading-relaxed">
                  Manually fill out <span className="font-bold text-gray-900">20 minutes</span> of online forms before getting{' '}
                  <span className="font-bold text-red-600">spammed</span> by telemarketers.
                </p>
              </div>
            </div>

            {/* Modern Way */}
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 rounded-2xl opacity-50 group-hover:opacity-75 blur transition duration-300"></div>
              <div className="relative bg-white backdrop-blur-sm rounded-2xl p-6 border-2 border-blue-300 transition-all duration-300 group-hover:shadow-xl group-hover:scale-[1.02]">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-2xl">✨</span>
                  <p className="text-sm font-bold text-blue-600 uppercase tracking-wider">
                    The Modern Way
                  </p>
                </div>
                <p className="text-gray-700 leading-relaxed">
                  Skip the forms and spam. Just link your current insurance policy{' '}
                  <span className="font-bold text-blue-600">one time</span> in{' '}
                  <span className="font-bold text-gray-900">2 minutes</span>.
                </p>
              </div>
            </div>
          </div>

          {/* Comparison */}
          <div className="bg-gradient-to-r from-blue-100/50 to-indigo-100/50 rounded-2xl p-6 border border-blue-200">
            <p className="text-gray-700 leading-relaxed text-center">
              <span className="font-semibold text-gray-900">Think of it like Plaid</span> (which links your bank to Venmo or Cash App) –{' '}
              <span className="font-semibold text-blue-600">same security, way faster</span> than typing everything manually.
            </p>
          </div>
        </div>
      </div>

      {/* Security Section
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 border-2 border-green-200 p-8 shadow-xl">
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-gradient-to-tr from-green-400/10 to-transparent rounded-full blur-3xl"></div>
        
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center shadow-lg">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <h4 className="text-2xl font-black text-gray-900">Your Security Matters</h4>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            {[
              { icon: '🔒', text: 'Your data is secure' },
              { icon: '👤', text: 'Sent directly to Cameron' },
              { icon: '🏦', text: 'Bank-level encryption' },
            ].map((item, i) => (
              <div
                key={i}
                className="bg-white/80 backdrop-blur-sm rounded-xl p-5 border border-green-200 hover:shadow-lg transition-all duration-300 hover:scale-105"
              >
                <div className="text-3xl mb-3">{item.icon}</div>
                <p className="text-gray-700 font-medium leading-relaxed">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </div> */}

      {/* Important Qualifier */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-yellow-50 to-amber-50 border-2 border-yellow-300 p-6 shadow-lg">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 bg-gradient-to-br from-yellow-400 to-amber-500 rounded-xl flex items-center justify-center flex-shrink-0 shadow-md">
            <span className="text-xl">⚠️</span>
          </div>
          <div>
            <h3 className="font-bold text-gray-900 mb-2 text-lg">
              Important: Do you currently have auto insurance?
            </h3>
            <p className="text-sm text-gray-700 leading-relaxed">
              This service works by comparing your{' '}
              <span className="font-semibold text-gray-900">existing policy</span> to an Allstate quote. 
              You must have <span className="font-semibold text-gray-900">active insurance</span> to use this process.
            </p>
          </div>
        </div>
      </div>

      {/* Final CTA */}
      <div className="text-center">
        <a
          className="group inline-flex items-center justify-center gap-3 relative overflow-hidden rounded-2xl p-0.5 transition-all duration-500 hover:scale-105 active:scale-95 no-underline w-full max-w-2xl mx-auto"
          href="https://app.usecanopy.com/c/insuredbycam"
          target="_blank"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 animate-gradient-x"></div>
          <div className="relative flex items-center justify-center gap-3 w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-8 py-5 rounded-2xl">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000"></div>
            <span className="relative z-10 text-white font-black text-lg whitespace-nowrap">Compare Rates Now</span>
            <ArrowRight className="relative z-10 w-6 h-6 text-white transition-transform group-hover:translate-x-2" />
          </div>
        </a>
      </div>

      {/* Canopy FAQ */}
      <details className="group bg-gradient-to-br from-gray-50 to-slate-50 rounded-2xl border-2 border-gray-200 overflow-hidden shadow-md hover:shadow-lg transition-shadow duration-300">
        <summary className="cursor-pointer p-6 font-bold text-gray-900 flex items-center justify-between group-hover:bg-gray-100 transition-colors">
          <span className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-gray-600 to-gray-800 rounded-lg flex items-center justify-center">
              <span className="text-white text-sm font-bold">?</span>
            </div>
            What is Canopy Connect?
          </span>
          <span className="text-gray-400 group-open:rotate-180 transition-transform duration-300">▼</span>
        </summary>
        <div className="px-6 pb-6 text-sm text-gray-600 leading-relaxed space-y-3 bg-white/50">
          <p className="font-medium text-gray-700">
            Canopy Connect is a secure data-sharing tool enabling you to safely transfer insurance information to your agent.
          </p>
          <p>This technology works similar to:</p>
          <div className="grid sm:grid-cols-3 gap-3">
            {[
              { name: 'Plaid', used: 'Venmo, Cash App, Robinhood' },
              { name: 'Yodlee', used: 'Major banks' },
              { name: 'Finicity', used: 'Mastercard' },
            ].map((tech) => (
              <div key={tech.name} className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-3 border border-blue-200">
                <p className="font-bold text-gray-900 mb-1">{tech.name}</p>
                <p className="text-xs text-gray-600">{tech.used}</p>
              </div>
            ))}
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mt-4">
            <p className="font-semibold text-green-900 mb-2">🔒 Security Guarantee</p>
            <p className="text-xs text-gray-700">
              Your credentials are never stored. We use 256-bit encryption—the same security standard used by banks and financial institutions.
            </p>
          </div>
        </div>
      </details>
    </div>
  );
};

export default StartQuoteCard;