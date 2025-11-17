import React, { useState, useEffect } from 'react';
import { Shield, Clock, CheckCircle, ArrowRight, Star, Award, TrendingDown, AlertCircle, PhoneCallIcon, BriefcaseBusiness, X } from 'lucide-react';

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

// Step Modal Component
const StepModal = ({ step, onClose, stepDetails, setModalStep }) => {
  if (!step || !stepDetails[step]) return null;

  const detail = stepDetails[step];

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-3xl shadow-2xl max-w-xl w-full max-h-[85vh] overflow-y-auto animate-slideUp"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-6 rounded-t-3xl flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center font-bold text-xl">
              {step}
            </div>
            <div>
              <h3 className="text-2xl font-black">{detail.title}</h3>
              <p className="text-indigo-100 text-sm mt-1">Step {step} of 7</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white transition-colors p-2 hover:bg-white/10 rounded-full"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Description */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-5 border border-indigo-100">
            <p className="text-gray-700 leading-relaxed">{detail.description}</p>
          </div>

          {/* Screenshot Section - Smaller Size */}
          <div className="bg-white rounded-2xl overflow-hidden flex items-center justify-center p-4">
            {/* Actual screenshots for steps 1 and 2 */}
            {step === 1 && (
              <div className="w-full max-w-xs bg-white">
                <img 
                  src="/screenshots/canopy-step1-select-provider.png"
                  alt="Step 1: Select your insurance provider"
                  className="w-full h-auto object-cover rounded-lg shadow-md"
                />
              </div>
            )}
            {step === 2 && (
              <div className="w-full max-w-xs bg-white">
                <img 
                  src="/screenshots/canopy-step2-login.png"
                  alt="Step 2: Modal view showing step details"
                  className="w-full h-auto object-cover rounded-lg shadow-md"
                />
              </div>
            )}
            {step === 3 && (
              <div className="aspect-[9/16] flex items-center justify-center p-8">
                <div className="text-center">
                  <div className="w-20 h-20 bg-gradient-to-br from-indigo-400 to-purple-500 rounded-full mx-auto mb-4 flex items-center justify-center">
                    <span className="text-3xl">📱</span>
                  </div>
                  <p className="text-gray-500 font-medium">Verification Code Screen</p>
                  <p className="text-sm text-gray-400 mt-2">You'll receive a code via text or email</p>
                </div>
              </div>
            )}
            {step === 4 && (
              <div className="w-full max-w-xs bg-white">
                <img 
                  src="/screenshots/canopy-step3-loading-policy.png"
                  alt="Step 1: Select your insurance provider"
                  className="w-full h-auto object-cover rounded-lg shadow-md"
                />
              </div>
            )}
            {step === 5 && (
              <div className="aspect-[9/16] flex items-center justify-center p-8">
                <div className="text-center">
                  <div className="w-20 h-20 bg-gradient-to-br from-indigo-400 to-purple-500 rounded-full mx-auto mb-4 flex items-center justify-center">
                    <span className="text-3xl">✓</span>
                  </div>
                  <p className="text-gray-500 font-medium">Contact Information</p>
                  <p className="text-sm text-gray-400 mt-2">Verify your contact details</p>
                </div>
              </div>
            )}
            {step === 6 && (
              <div className="aspect-[9/16] flex items-center justify-center p-8">
                <div className="text-center">
                  <div className="w-20 h-20 bg-gradient-to-br from-indigo-400 to-purple-500 rounded-full mx-auto mb-4 flex items-center justify-center">
                    <span className="text-3xl">👥</span>
                  </div>
                  <p className="text-gray-500 font-medium">Add Drivers</p>
                  <p className="text-sm text-gray-400 mt-2">Confirm all drivers on your policy</p>
                </div>
              </div>
            )}
            {step === 7 && (
              <div className="aspect-[9/16] flex items-center justify-center p-8">
                <div className="text-center">
                  <div className="w-20 h-20 bg-gradient-to-br from-green-400 to-emerald-500 rounded-full mx-auto mb-4 flex items-center justify-center">
                    <span className="text-3xl">🎉</span>
                  </div>
                  <p className="text-gray-500 font-medium">All Done!</p>
                  <p className="text-sm text-gray-400 mt-2">Your quote is on the way</p>
                </div>
              </div>
            )}
          </div>

          {/* Pro Tips */}
          {detail.tips && detail.tips.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-5">
              <h4 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                <span className="text-xl">💡</span> Pro Tips
              </h4>
              <ul className="space-y-2">
                {detail.tips.map((tip, index) => (
                  <li key={index} className="flex items-start gap-2 text-sm text-gray-700">
                    <span className="text-yellow-600 font-bold mt-0.5">•</span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        {/* Footer */}
        <div className="border-t border-gray-200 p-6 flex justify-between items-center bg-gray-50 rounded-b-3xl">
          <button
            onClick={() => {
              if (step > 1) {
                setModalStep(step - 1);
              }
            }}
            disabled={step === 1}
            className={`px-6 py-3 font-semibold rounded-xl transition-all ${
              step === 1
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md hover:shadow-lg'
            }`}
          >
            ← Previous
          </button>

          <button
            onClick={() => {
              if (step < 7) {
                setModalStep(step + 1);
              }
            }}
            disabled={step === 7}
            className={`px-6 py-3 font-semibold rounded-xl transition-all ${
              step === 7
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md hover:shadow-lg'
            }`}
          >
            Next →
          </button>
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { 
            opacity: 0;
            transform: translateY(20px);
          }
          to { 
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.2s ease-out;
        }
        .animate-slideUp {
          animation: slideUp 0.3s ease-out;
        }
      `}</style>
    </div>
  );
};

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
  const [modalStep, setModalStep] = useState(null);

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

  // Step details for modal
  const stepDetails = {
    1: {
      title: "Select your current insurance company",
      description: "Choose your insurance provider from our list of supported carriers. We support all major insurance companies including State Farm, Allstate, Progressive, GEICO, and many more.",
      screenshot: "/screenshots/step1-select-provider.png",
      tips: ["Use the search bar to quickly find your provider", "Can't find yours? Contact us for help", "We support 100+ insurance carriers"]
    },
    2: {
      title: "Log in securely using your existing credentials",
      description: "Enter the same username and password you use to access your insurance account online. Your credentials are encrypted and never stored on our servers.",
      screenshot: "/screenshots/step2-login.png",
      tips: ["Use your online account credentials", "This is the same login you use on your insurer's website", "Your password is encrypted with 256-bit security"]
    },
    3: {
      title: "Enter the quick verification code",
      description: "For your security, we'll send a verification code to your phone or email. This two-factor authentication ensures only you can access your policy information.",
      screenshot: "/screenshots/step3-verification.png",
      tips: ["Check your text messages or email", "The code expires in 10 minutes", "Didn't receive it? Request a new code"]
    },
    4: {
      title: "Your current policy details load automatically",
      description: "Once verified, we securely retrieve your policy information including coverage levels, deductibles, vehicle details, and driver information. No manual data entry required!",
      screenshot: "/screenshots/step4-loading.png",
      tips: ["This usually takes 10-30 seconds", "All data is transmitted with bank-level encryption", "We only access what's needed for your quote"]
    },
    5: {
      title: "Confirm your contact information",
      description: "Review and update your contact details to ensure we can reach you with your personalized quote. You can also set your preferred contact method and time.",
      screenshot: "/screenshots/step5-contact.png",
      tips: ["Double-check your email address", "Add a preferred contact time if needed", "Choose phone or email for your quote delivery"]
    },
    6: {
      title: "Add any drivers listed on your policy",
      description: "Confirm all drivers on your current policy. Accurate driver information, including driving history and experience, ensures you get the most accurate quote possible.",
      screenshot: "/screenshots/step6-drivers.png",
      tips: ["Include all licensed household members", "Driver history affects your rate", "Accurate information = accurate quotes"]
    },
    7: {
      title: "Done! Your policy is sent to Cameron",
      description: "That's it! Your complete policy information is now securely transmitted to Cameron, who will prepare your personalized Allstate quote within 24 hours. You'll receive a call or email with your custom comparison.",
      screenshot: "/screenshots/step7-complete.png",
      tips: ["Expect a call or email within 24 hours", "No obligation to switch", "Cameron will explain all your options"]
    }
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
      {/* Modal */}
      {modalStep && (
        <StepModal 
          step={modalStep} 
          onClose={() => setModalStep(null)} 
          stepDetails={stepDetails}
          setModalStep={setModalStep}
        />
      )}

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
            <br/>  by Switching
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

      {/* WHITE CARD SECTION STARTS */}
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
              
              {/* QuoteSteps Component Inline - ULTRA STYLED VERSION WITH MODALS */}
              <div className="mt-16 bg-gradient-to-br from-indigo-50 via-blue-50 to-purple-50 border-2 border-indigo-200 rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
                {/* Decorative background elements */}
                <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-blue-400/10 to-purple-400/10 rounded-full blur-3xl"></div>
                <div className="absolute bottom-0 left-0 w-32 h-32 bg-gradient-to-tr from-indigo-400/10 to-pink-400/10 rounded-full blur-2xl"></div>
                
                <div className="relative z-10">
                  {/* Header */}
                  <div className="flex items-center justify-center gap-3 mb-6">
                    
                    <div className="text-center">
                      <h2 className="text-xl sm:text-2xl font-black bg-gradient-to-r from-gray-900 via-indigo-900 to-purple-900 bg-clip-text text-transparent">
                        The Process is Simple
                      </h2>
                      <p className="text-sm text-indigo-600 font-semibold mt-0.5">Takes 2–3 Minutes</p>
                    </div>
                  </div>

                  {/* Steps */}
                  <div className="space-y-4">
                    {[
                      { step: 1, text: "Select your current insurance company", icon: "🏢" },
                      { step: 2, text: "Log in securely using your existing credentials", icon: "🔐" },
                      { step: 3, text: "Enter the quick verification code (text or email)", icon: "📱" },
                      { step: 4, text: "Your current policy details load automatically", icon: "⚡" },
                      { step: 5, text: "Confirm your contact information", icon: "✓" },
                      { step: 6, text: "Add any drivers listed on your policy", icon: "👥" },
                      { step: 7, text: "Done — your policy is sent directly to Cameron to shop better rates", icon: "🎉" }
                    ].map((item) => (
                      <div 
                        key={item.step}
                        onClick={() => setModalStep(item.step)}
                        className="flex items-start gap-4 bg-white/80 backdrop-blur-sm rounded-2xl p-4 sm:p-5 shadow-md hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 border border-indigo-100 group cursor-pointer"
                      >
                        {/* Step Number Circle */}
                        <div className="flex-shrink-0">
                          <div className="relative">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300">
                              <span className="text-white font-bold text-sm">{item.step}</span>
                            </div>
                          </div>
                        </div>
                        
                        {/* Content */}
                        <div className="flex-1 pt-1.5">
                          <p className="text-gray-800 font-medium text-base leading-relaxed">
                            {item.text}
                          </p>
                         {/* <span className="inline-block mt-2 text-xs text-indigo-600 font-semibold group-hover:text-indigo-700 transition-colors">
                           Preview →
                          </span> */}
                      
                        </div>

                        {/* Icon */}
                        <div className="flex-shrink-0 text-2xl group-hover:scale-125 transition-transform duration-300">
                          {item.icon}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Bottom CTA Button */}
                  <div className="mt-6 text-center">
                    <a 
                      className="canopy-connect-embed inline-flex items-center justify-center gap-3 bg-gradient-to-r from-emerald-500 via-green-500 to-teal-500 text-white font-black text-base py-4 px-8 rounded-xl hover:from-emerald-600 hover:via-green-600 hover:to-teal-600 transition-all duration-300 transform hover:scale-105 active:scale-95 shadow-xl hover:shadow-emerald-500/50 group no-underline"
                      href="https://app.usecanopy.com/c/insuredbycam" 
                      target="_blank"
                    >
                      <span className="whitespace-nowrap">Start My Quote</span>
                      <ArrowRight className="w-5 h-5 group-hover:translate-x-2 transition-transform" />
                    </a>
                    <p className="text-xs text-gray-500 mt-3">✓ No hard credit pull • No card required  </p>
                  </div>
                </div>
              </div>
            </div>

            {/* How It Works - ELI5 Style */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl p-4 sm:p-6 md:p-8 mb-8">
              <div className="flex items-start gap-4 w-full">
                <div className="text-center flex-1">
                  <h3 className="font-bold text-gray-900 mb-6 text-xl">How Does This Work?</h3>
                  
                  {/* The Comparison */}
                  <div className="space-y-5 text-gray-700 text-base leading-relaxed">
                    <div className="bg-white/60 rounded-xl p-5 border border-gray-200 transition-all duration-300 hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] cursor-pointer">
                      <p className="text-sm text-gray-500 font-semibold mb-2">The Old Way to Quote:</p>
                      <p className="text-base leading-relaxed">Manually fill out 20 minutes of online forms before getting <span className="font-semibold text-gray-900">spammed</span> by telemarketers.</p>
                    </div>
                    
                    <div className="bg-white/80 rounded-xl p-5 border-2 border-blue-300 transition-all duration-300 hover:shadow-xl hover:scale-[1.02] hover:border-blue-400 active:scale-[0.98] cursor-pointer">
                      <p className="text-sm text-blue-600 font-semibold mb-2">✓ The Modern Way:</p>
                      <p className="text-base leading-relaxed">Skip the forms and the spam callers. Just link your current insurance policy <span className="font-semibold text-gray-900"> one time</span>.</p>
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
                     <div className="text-center flex-1"></div>
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
                    Your username and password are never stored or accessible to anyone. We use the most advanced security and encryption methods available to safely connect your insurance account, guaranteeing your information is protected at all times with 256-bit encryption.
                  </p>
                </div>
              </details>
            </div>
          </div>
        </div>
      </div>
      {/* WHITE CARD SECTION ENDS */}

      {/* WHY MY QUOTES ARE DIFFERENT SECTION - TAILWIND VERSION */}
      <div className="relative mx-auto max-w-6xl sm:px-6 lg:px-8 my-16 pt-12 pb-24 mb-12">
        <div className="relative bg-gradient-to-br from-[#1e3a5f] to-[#2d4a6f] rounded-2xl shadow-2xl p-8 sm:p-12 overflow-hidden">
          {/* Gradient border effect */}
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl -m-[3px] -z-10"></div>
          
          {/* Heading */}
          <h2 className="text-white text-3xl md:text-4xl font-bold text-center mb-10">
            Why My Quotes Are Different
          </h2>
          
          {/* Features Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            
            {/* Feature 1 */}
            <div className="flex items-start gap-4 text-left">
              <div className="flex-shrink-0 w-9 h-9 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center shadow-lg">
                <span className="text-white font-bold text-xl">✓</span>
              </div>
              <div>
                <h3 className="text-white text-lg font-semibold mb-2">
                  I verify your actual vehicle details
                </h3>
                <p className="text-white/85 text-base leading-relaxed">
                  VIN, trim level, safety features - not what you remember
                </p>
              </div>
            </div>

            {/* Feature 2 */}
            <div className="flex items-start gap-4 text-left">
              <div className="flex-shrink-0 w-9 h-9 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center shadow-lg">
                <span className="text-white font-bold text-xl">✓</span>
              </div>
              <div>
                <h3 className="text-white text-lg font-semibold mb-2">
                  I check your real policy coverage
                </h3>
                <p className="text-white/85 text-base leading-relaxed">
                  Apples-to-apples comparison, no guessing
                </p>
              </div>
            </div>

            {/* Feature 3 */}
            <div className="flex items-start gap-4 text-left">
              <div className="flex-shrink-0 w-9 h-9 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center shadow-lg">
                <span className="text-white font-bold text-xl">✓</span>
              </div>
              <div>
                <h3 className="text-white text-lg font-semibold mb-2">
                  No surprises at sign-up
                </h3>
                <p className="text-white/85 text-base leading-relaxed">
                  The price you see is the price you pay (unlike online aggregators that lowball you). No time wasted.
                </p>
              </div>
            </div>

            {/* Feature 4 */}
            <div className="flex items-start gap-4 text-left">
              <div className="flex-shrink-0 w-9 h-9 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center shadow-lg">
                <span className="text-white font-bold text-xl">✓</span>
              </div>
              <div>
                <h3 className="text-white text-lg font-semibold mb-2">
                  All Allstate discounts included
                </h3>
                <p className="text-white/85 text-base leading-relaxed">
                  I catch discounts you might not even know you qualify for
                </p>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* A SMARTER FASTER WAY SECTION */}
      <div className={`w-full px-12 pb-24 mb-12 transition-all duration-1000 delay-300 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
        <h2 className="text-center text-white font-extrabold text-4xl md:text-5xl tracking-tight mb-24">
          A Smarter, Faster Way to Shop Insurance
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
          {[
            { icon: Clock, color: 'from-blue-500 to-blue-600', title: 'Start Your Quote', desc: "Connect your current insurance instantly using our secure portal. That's it. No forms. No hassle.", delay: '0s' },
            { icon: BriefcaseBusiness, color: 'from-orange-500 to-orange-600', title: 'I Do the Work', desc: "Once your details are received, I'll take it from there and finish your quote within 24 hours.", delay: '0.2s' },
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
            <div className="flex overflow-visible">
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

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/10 mt-24">
        <div className="container mx-auto px-4 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-white/60 text-sm">
              © {new Date().getFullYear()} insuredbycam. All rights reserved.
            </p>
            <div className="flex items-center gap-6">
              <a 
                href="/defensive-driving" 
                className="text-white/80 hover:text-white text-sm font-medium transition-colors duration-200 hover:underline"
              >
                Driver Education Courses
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}