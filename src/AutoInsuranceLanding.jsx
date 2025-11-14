import React, { useState, useEffect } from 'react';
import { Shield, Clock, CheckCircle, ArrowRight, Star, Award, TrendingDown, AlertCircle, PhoneCallIcon, BriefcaseBusiness } from 'lucide-react';

// Move InputField component outside to prevent recreation
const InputField = ({ label, name, type = 'text', placeholder, maxLength, isSelect, options, formData, errors, touched, onInputChange, onInputBlur }) => (
  <div>
    <label htmlFor={name} className="block text-sm font-bold text-gray-800 mb-2">
      {label} *
    </label>
    {isSelect ? (
      <select
        id={name}
        name={name}
        value={formData[name] || ''}
        onChange={onInputChange}
        onBlur={onInputBlur}
        aria-invalid={touched[name] && errors[name] ? 'true' : 'false'}
        aria-describedby={errors[name] ? `${name}-error` : undefined}
        className={`w-full px-5 py-4 bg-white border-2 rounded-xl transition-colors duration-200 focus:outline-none ${
          touched[name] && errors[name]
            ? 'border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-200'
            : 'border-gray-200 hover:border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200'
        }`}
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    ) : (
      <input
        id={name}
        type={type}
        name={name}
        value={formData[name] || ''}
        onChange={onInputChange}
        onBlur={onInputBlur}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-invalid={touched[name] && errors[name] ? 'true' : 'false'}
        aria-describedby={errors[name] ? `${name}-error` : undefined}
        className={`w-full px-5 py-4 bg-white border-2 rounded-xl transition-colors duration-200 focus:outline-none ${
          touched[name] && errors[name]
            ? 'border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-200'
            : 'border-gray-200 hover:border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200'
        }`}
      />
    )}
    {touched[name] && errors[name] && (
      <div id={`${name}-error`} className="mt-2 flex items-center gap-2 text-red-600 text-sm" role="alert">
        <AlertCircle className="w-4 h-4 flex-shrink-0" />
        <span>{errors[name]}</span>
      </div>
    )}
  </div>
);

export default function AutoInsuranceLanding() {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    zipCode: '',
    currentlyInsured: ''
  });
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [confetti, setConfetti] = useState([]);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  useEffect(() => {
    if (submitted) {
      const newConfetti = Array.from({ length: 30 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 0.5,
        duration: 2 + Math.random() * 2
      }));
      setConfetti(newConfetti);
    }
  }, [submitted]);

  const validateField = (name, value) => {
    switch (name) {
      case 'firstName':
      case 'lastName':
        return value.trim().length < 2 ? 'Must be at least 2 characters' : '';
      case 'email':
        return !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? 'Invalid email address' : '';
      case 'phone':
        const digits = value.replace(/\D/g, '');
        return digits.length !== 10 ? 'Must be a valid 10-digit phone number' : '';
      case 'zipCode':
        return !/^\d{5}$/.test(value) ? 'Must be a valid 5-digit ZIP code' : '';
      case 'currentlyInsured':
        return !value ? 'Please select an option' : '';
      default:
        return '';
    }
  };

  const formatPhone = (value) => {
    const digits = value.replace(/\D/g, '').slice(0, 10);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    let formattedValue = value;

    if (name === 'phone') {
      formattedValue = formatPhone(value);
    } else if (name === 'zipCode') {
      formattedValue = value.replace(/\D/g, '').slice(0, 5);
    }

    setFormData(prev => ({ ...prev, [name]: formattedValue }));
  };

  const handleInputBlur = (e) => {
    const { name, value } = e.target;
    setTouched(prev => ({ ...prev, [name]: true }));
    setErrors(prev => ({ ...prev, [name]: validateField(name, value) }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const newTouched = Object.keys(formData).reduce((acc, key) => ({ ...acc, [key]: true }), {});
    setTouched(newTouched);

    const newErrors = Object.keys(formData).reduce((acc, key) => {
      const error = validateField(key, formData[key]);
      return error ? { ...acc, [key]: error } : acc;
    }, {});

    setErrors(newErrors);

    if (Object.keys(newErrors).length === 0) {
      setIsSubmitting(true);
      
      try {
        // Save lead data to your backend/database
        const response = await fetch('/api/save-lead', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });
        
        if (response.ok) {
          // After saving, open Canopy Connect in a new window
          const canopyUrl = 'https://app.usecanopy.com/c/camwileyagency';
          window.open(canopyUrl, '_blank', 'width=600,height=700');
          
          // Show success message
          setSubmitted(true);
          setIsSubmitting(false);
        } else {
          throw new Error('Failed to save lead');
        }
      } catch (error) {
        console.error('Error submitting form:', error);
        setIsSubmitting(false);
        alert('There was an error submitting your information. Please try again.');
      }
    }
  };

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
              opacity: 0.8
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

  .animate-blob {
    animation: blob 7s infinite;
  }

  .animation-delay-2000 {
    animation-delay: 2s;
  }

  .animation-delay-4000 {
    animation-delay: 4s;
  }

  .animation-delay-6000 {
    animation-delay: 6s;
  }
  
  .logo-track {
    display: flex;
    animation: scroll 30s linear infinite;
  }
  
  @keyframes scroll {
    0% { transform: translateX(0); }
    100% { transform: translateX(-50%); }
  }
  
  .logo-track:hover {
    animation-play-state: paused;
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
                currentlyInsured: ''
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
        {/* Animated Gradient Mesh */}
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
          .logo-track {
            animation: scroll 20s linear infinite;
            display: flex;
            gap: 4rem;
          }
          .logo-track:hover {
            animation-play-state: paused;
          }
        `}</style>

        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjA1IiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-30"></div>
        <div className="absolute top-20 left-10 w-72 h-72 bg-blue-500/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '700ms' }}></div>

        {/* DEV ONLY: Preview Button */}
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

       <div className="container mx-auto px-4 py-16 relative z-10">
  {/* Logo */}
  <div
    className={`text-center mb-20 transition-all duration-700 ${
      isVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4"
    }`}
  >
    <div className="inline-flex items-center justify-center gap-4 mb-4 relative">

      {/* Glow Behind Icon */}
      <div className="absolute -inset-6 bg-gradient-to-r from-green-400/20 to-blue-400/20 blur-3xl rounded-full"></div>

      {/* Icon */}
      <img
        src="/quotesync-logo.svg"
        alt="QuoteSync Logo"
        className="w-16 h-16 relative z-10 translate-y-[2px]" 
      />

      {/* Text Block */}
      <div className="relative z-10 flex flex-col">
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-white tracking-tight leading-none">
          insuredbycam
        </h1>
        <p className="text-lg md:text-xl text-white/80 font-medium mt-2">
          Insurance Shopping, Simplified
        </p>
      </div>
  </div>
</div>

          <div className={`text-center mb-16 max-w-4xl mx-auto transition-all duration-1000 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-10'}`}>
              <h1 className="text-6xl md:text-7xl font-black text-white mb-6 leading-tight">
                Save Up to{' '}
                <br />
                <span className="bg-gradient-to-r from-yellow-400 via-orange-400 to-red-400 bg-clip-text text-transparent inline-block" style={{animation: 'wiggle 1s ease-in-out infinite'}}>
                  $847
                </span>
                <br/> on Auto Insurance
              </h1>
              
              <p className="text-xl md:text-2xl text-blue-100 mb-4 font-light">
                Connect your current insurance policy and see if Allstate can beat your rate
              </p>
              <p className="text-blue-200/80 text-lg">Free comparison. No spam calls.</p>
          </div>
  
    <div className="flex flex-col md:flex-row items-center justify-center gap-8 mb-12">
          {/* Photo */}
          <div className="relative">
        <div className="w-36 h-36 md:w-40 md:h-40 rounded-full overflow-hidden border-4 border-white shadow-2xl ring-4 ring-blue-500/20">
          <img 
            src="/logos/A64C36F2-FC89-49D4-8C28-83161625C91C.jpeg"
            alt="Cameron Wiley"
            className="w-full h-full object-cover"
            style={{ objectPosition: '50% 30%' }}
          />
        </div>
          {/* Verified badge */}
          <div className="absolute -bottom-2 -right-2 bg-blue-600 text-white rounded-full p-2 shadow-lg">
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          </div>
          </div>
  
          {/* Text */}
          <div className="text-center md:text-left">
        <h1 className="text-4xl md:text-5xl font-black text-white mb-2">
          I'm Cameron
        </h1>
        <p className="text-xl text-white mb-4">
          Allstate Agency Owner in Georgia
        </p>
        <div className="flex items-center justify-center md:justify-start gap-2 text-sm text-gray-500">
          <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full font-semibold">Licensed Agent</span>
          <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full font-semibold"> Low Rates</span>
          <span className="px-3 py-1 bg-yellow-100 text-yellow-600 rounded-full font-semibold"> Great Service </span>
        </div>
     </div>
    </div>
  </div>
  
  <div className={`w-full px-12 pb-24 mb-16 transition-all duration-1000 delay-300 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
    
<div className={`max-w-4xl pt-0 mx-auto transition-all duration-1000 delay-500 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>    
  <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl p-4 sm:p-6 md:p-10 border border-white/50 relative overflow-hidden">
    <div className="text-center mb-10 pt-4 sm:pt-6">
            <h2 className="text-4xl font-black bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent mb-3">
              Start Your Quote
            </h2>
            {/* Canopy Connect Embed */}
            <div className="text-center py-4">
              <a 
                className="canopy-connect-embed inline-flex items-center justify-center gap-3 w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white font-black text-lg py-5 px-8 rounded-xl hover:from-blue-700 hover:via-indigo-700 hover:to-purple-700 transition-all duration-300 transform hover:scale-105 active:scale-95 shadow-2xl hover:shadow-blue-500/50 group no-underline"
                href="https://app.usecanopy.com/c/insuredbycam" 
                target="_blank"
              >
                <span className="whitespace-nowrap">Continue</span>
                <ArrowRight className="w-6 h-6 group-hover:translate-x-2 transition-transform" />
              </a>
            </div>
            <p className="text-gray-600 text-lg">Free. Fast. No obligation.</p>
             </div>
          {/* How It Works - ELI5 Style */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl p-4 sm:p-6 md:p-8 mb-8">
            <div className="flex items-start gap-4 w-full">
                <div className="text-left flex-1">
                  <h3 className="font-bold text-gray-900 mb-6 text-xl">How Does This Work?</h3>
                  
                  {/* The Comparison */}
                  <div className="space-y-5 text-gray-700 text-base leading-relaxed">
                    <div className="bg-white/60 rounded-xl p-5 border border-gray-200 transition-all duration-300 hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] cursor-pointer">
                      <p className="text-sm text-gray-500 font-semibold mb-2">The Old Way to Quote:</p>
                      <p className="text-base leading-relaxed">Manually fill out 20 minutes of online forms before getting <span className="font-semibold text-gray-900">spammed</span> by telemarketers.</p>
                    </div>
                    
                    <div className="bg-white/80 rounded-xl p-5 border-2 border-blue-300 transition-all duration-300 hover:shadow-xl hover:scale-[1.02] hover:border-blue-400 active:scale-[0.98] cursor-pointer">
                      <p className="text-sm text-blue-600 font-semibold mb-2">✓ The Modern Way:</p>
                      <p className="text-base leading-relaxed">Skip the forms and the spam callers. Just link your current insurance policy once. It takes <span className="font-semibold text-gray-900"> less than a minute</span>.</p>
                    </div>
                  </div>

                  <p className="text-base text-gray-600 mt-6 leading-relaxed">
                    Think of it like Plaid which links your bank account to Venmo or Cash App - same security, way faster than typing everything out manually.
                  </p>
                </div>
              </div>

              {/* Security Details - FIXED SPACING */}
              <div className="border-t border-blue-200 pt-8 mt-8">
                <div className="flex items-start gap-4 text-left w-full justify-start">
                  <CheckCircle className="w-7 h-7 text-green-600 flex-shrink-0 mt-0.5" />
                  <div className="text-left flex-1">
                    <h4 className="font-bold text-gray-900 mb-5 text-xl">Your Security Matters</h4>
                    <ul className="space-y-5 text-base text-gray-700">
                      <li className="flex items-start gap-3">
                        <span className="text-green-600 font-bold mt-0.5 text-xl flex-shrink-0">✓</span>
                        <span className="leading-relaxed">Your data is <span className="font-semibold text-gray-900">secure</span></span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-green-600 font-bold mt-0.5 text-xl flex-shrink-0">✓</span>
                        <span className="leading-relaxed">Your policy info is sent directly to me (Cameron)</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-green-600 font-bold mt-0.5 text-xl flex-shrink-0">✓</span>
                        <span className="leading-relaxed">Bank-level encryption (same tech that protects your banking apps)</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
      <div className="space-y-6">
        {/* Qualifier Warning */}
        <div className="bg-yellow-50 border-2 border-yellow-300 rounded-xl p-6 mb-6">
          <div className="flex items-start gap-3">
            <svg className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <h3 className="font-bold text-gray-900 mb-2">Important: Do you currently have auto insurance?</h3>
              <p className="text-sm text-gray-700 leading-relaxed">
                My service works by comparing your <span className="font-semibold">existing policy</span> to an Allstate Insurance quote. If you don't currently have <span className="font-semibold">active insurance</span>, I won't be able to help you through this process.
              </p>
            </div>
          </div>
        </div>

        {/* Canopy Connect Embed */}
        <div className="text-center py-4">
          <a 
            className="canopy-connect-embed inline-flex items-center justify-center gap-3 w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white font-black text-lg py-5 px-8 rounded-xl hover:from-blue-700 hover:via-indigo-700 hover:to-purple-700 transition-all duration-300 transform hover:scale-105 active:scale-95 shadow-2xl hover:shadow-blue-500/50 group no-underline"
            href="https://app.usecanopy.com/c/insuredbycam" 
            target="_blank"
          >
            <span className="whitespace-nowrap">Compare Rates</span>
            <ArrowRight className="w-6 h-6 group-hover:translate-x-2 transition-transform" />
          </a>
        </div>

        {/* What is Canopy Connect - Expandable */}
        <details className="bg-gray-50 rounded-lg border border-gray-200">
          <summary className="cursor-pointer p-4 font-semibold text-gray-700 hover:text-gray-900 text-sm flex items-center justify-between">
            <span>What is Canopy Connect?</span>
            <span className="text-gray-400">▼</span>
          </summary>
          <div className="px-4 pb-4 text-xs text-gray-600 leading-relaxed space-y-2">
            <p>
              Canopy Connect is a secure data-sharing tool used by insurance and financial companies enabling consumers to retrieve relevant information from their own insurance accounts and securely transfer that information to their agent. Linking your insurance accounts with Canopy Connect enables the sharing of key information I need to tailor advice just for you. 
            </p>
            <p>
              This technology works similar to:
            </p>
            <ul className="list-disc list-inside space-y-1 ml-2 text-gray-600">
              <li><span className="font-semibold">Plaid</span> (used by Venmo, Cash App, Robinhood, Coinbase)</li>
              <li><span className="font-semibold">Yodlee</span> (used by major banks)</li>
              <li><span className="font-semibold">Finicity</span> (owned by Mastercard)</li>
            </ul>
            <p className="mt-3">
            Your username and password are never stored or accessible to anyone. We use the most advanced security and encryption methods available to safely connect your insurance account, guaranteeing your information is protected at all times with 256-bit encryption. </p>
        </div>
        </details>
  </div>
</div>
<div className={`w-full px-12 pb-24 mb-12 transition-all duration-1000 delay-300 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}></div>
<h2 className="text-center text-white font-extrabold text-4xl md:text-5xl tracking-tight mb-24">
              A Smarter, Faster Way to Shop Insurance
            </h2>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
      {[
        { icon: Clock, color: 'from-blue-500 to-blue-600', title: 'Start Your Quote', desc: "Connect your current insurance instantly using our secure portal. That's it. No forms. No hassle.", delay: '0s' },
        { icon: BriefcaseBusiness, color: 'from-orange-500 to-orange-600', title: 'I Do the Work', desc: "Once your details sync, I'll take it from there and finish your quote within 24 hours.", delay: '0.2s' },
        { icon: PhoneCallIcon, color: 'from-purple-500 to-purple-600', title: 'We Connect', desc: "I'll call you to walk through the numbers and answer any questions. Can't talk? I'll email the proposal.", delay: '0.4s' },
        { icon: CheckCircle, color: 'from-green-500 to-emerald-600', title: 'You Decide', desc: "Like it? I can get you switched over as early as tomorrow, or any future effective date you choose.", delay: '0.6s' },
      ].map((benefit, i) => (
      
      <div
        key={i}
        className="bg-white/95 backdrop-blur-sm p-8 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-2 border border-white/50 group text-left min-h-[176px]"
        style={{ animation: `float 3s ease-in-out infinite ${benefit.delay}` }}
      >
        <div className={`w-10 h-10 bg-gradient-to-br ${benefit.color} rounded-3xl flex items-center justify-center mb-4 group-hover:scale-110 group-hover:rotate-12 transition-all duration-300 shadow-lg`}>
          <benefit.icon className="w-6 h-6 text-white" />
        </div>
        <h3 className="font-semibold text-gray-900 mb-1 text-lg">{benefit.title}</h3>
        <p className="text-gray-600 text-m leading-relaxed">{benefit.desc}</p>
      </div>
    ))}
</div>









      <div className="mt-12 pt-24 text-center">
        <p className="text-blue-100 font-semibold mb-6 text-lg">Helping Customers Save More By Switching from These Carriers </p>
        <div className="bg-white/95 backdrop-blur-sm rounded-2xl p-8 border border-white/20  overflow-x-hidden overflow-y-visible relative shadow-xl">
          <div className="flex overflow-visible">.
            <div className="logo-track">
              <div className="flex gap-16 items-center min-w-max">
                <img src="/logos/GEICO.png" alt="GEICO" className="h-12 w-auto hover:scale-110 transition-all duration-300 drop-shadow-lg" />
                <img src="/logos/Progressive.png" alt="Progressive" className="h-12 w-auto hover:scale-110 transition-all duration-300 drop-shadow-lg" />
                <img src="/logos/State-Farm.png" alt="State Farm" className="h-11 w-auto hover:scale-110 transition-all duration-300 drop-shadow-lg" />
                <img src="/logos/AutoOwners.png" alt="AutoOwners" className="h-6 w-auto hover:scale-110 transition-all duration-300 drop-shadow-lg" />
                <img src="/logos/Nationwide.png" alt="Nationwide" className="h-11 w-auto hover:scale-110 transition-all duration-300 drop-shadow-lg" />
                <img src="/logos/USAA.png" alt="USAA" className="h-11 w-auto hover:scale-110 transition-all duration-300 drop-shadow-lg" />
                <img src="/logos/Farmers.png" alt="Farmers" className="h-11 w-auto hover:scale-110 transition-all duration-300 drop-shadow-lg" />
                <img src="/logos/State-Farm.png" alt="State Farm" className="h-11 w-auto hover:scale-110 transition-all duration-300 drop-shadow-lg" />
                <img src="/logos/Liberty-Mutual.png" alt="Liberty Mutual" className="h-11 w-auto hover:scale-110 transition-all duration-300 drop-shadow-lg" />
              </div>
              {/* Duplicate set for seamless loop */}
              <div className="flex gap-16 items-center min-w-max">
                <img src="/logos/GEICO.png" alt="GEICO" className="h-12 w-auto hover:scale-110 transition-all duration-300 drop-shadow-lg" />
                <img src="/logos/Progressive.png" alt="Progressive" className="h-12 w-auto hover:scale-110 transition-all duration-300 drop-shadow-lg" />
                <img src="/logos/AutoOwners.png" alt="AutoOwners" className="h-6 w-auto hover:scale-110 transition-all duration-300 drop-shadow-lg" />
                <img src="/logos/Nationwide.png" alt="Nationwide" className="h-11 w-auto hover:scale-110 transition-all duration-300 drop-shadow-lg" />
                <img src="/logos/USAA.png" alt="USAA" className="h-11 w-auto hover:scale-110 transition-all duration-300 drop-shadow-lg" />
                <img src="/logos/Farmers.png" alt="Farmers" className="h-11 w-auto hover:scale-110 transition-all duration-300 drop-shadow-lg" />
                <img src="/logos/State-Farm.png" alt="State Farm" className="h-11 w-auto hover:scale-110 transition-all duration-300 drop-shadow-lg" />
                <img src="/logos/Liberty-Mutual.png" alt="Liberty Mutual" className="h-11 w-auto hover:scale-110 transition-all duration-300 drop-shadow-lg" />
              </div>
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  </div> 
);
}