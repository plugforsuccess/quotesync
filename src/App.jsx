import React, { useState, useEffect } from 'react';
import { Shield, Clock, CheckCircle, ArrowRight, Star, Award, TrendingDown, AlertCircle } from 'lucide-react';

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
   <div className="min-h-screen bg-gradient-to-br from-slate-600 via-blue-00 to-indigo-900 relative overflow-hidden">
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

        <div className="container mx-auto px-4 py-16 relative z-10">
          {/* Logo */}
          <div className={`text-center mb-20 transition-all duration-700 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
            <div className="inline-flex items-center gap-4 mb-8 relative">
              <div className="absolute inset-0 bg-gradient-to-r from-green-400/20 to-blue-400/20 blur-3xl rounded-full"></div>
              <img src="/quotesync-logo.svg" alt="QuoteSync Logo" className="w-16 h-16 relative z-10" />
                <div className="relative z-10">
                  <h1 className="text-6xl md:text-7xl font-black text-white tracking-tight">QuoteSync</h1>
                  <p className="text-lg md:text-xl text-white/80 font-medium mt-2">Insurance shopping, simplified</p>
                </div>
            </div>
          </div>
            <div className={`text-center mb-16 max-w-4xl mx-auto transition-all duration-1000 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-10'}`}>

          <div className={`text-center mb-16 max-w-4xl mx-auto transition-all duration-1000 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-10'}`}>
            {/* <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm px-4 py-2 rounded-full mb-8 border border-white/10">
              <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
              <span className="text-white text-sm font-medium">Rated 4.9/5 by 50,000+ customers</span>
            </div> */}
            
            <h1 className="text-6xl md:text-7xl font-black text-white mb-6 leading-tight">
              Save Up to{' '}
              <span className="bg-gradient-to-r from-yellow-400 via-orange-400 to-red-400 bg-clip-text text-transparent inline-block" style={{animation: 'wiggle 1s ease-in-out infinite'}}>
                $847
              </span>
              <br />on Auto Insurance
            </h1>
            
            <p className="text-xl md:text-2xl text-blue-100 mb-4 font-light">
        
            </p>
            <p className="text-blue-200/80 text-lg">Free. Fast. No obligation.</p>
          </div>
        </div>  
      <div className={`max-w-4xl mx-auto mb-16 bg-white/10 backdrop-blur-md rounded-2xl p-6 md:p-8 border border-white/20 transition-all duration-1000 delay-200 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-6">
      {[
        { value: '2M+', label: 'Happy Drivers' },
        { value: '$427', label: 'Avg. Savings' },
        { value: '40+', label: 'Insurers' },
        { value: '2 min', label: 'To Compare' }
      ].map((stat, i) => (
        <div key={i} className="text-center transform hover:scale-110 transition-transform duration-300">
          <div className="text-4xl md:text-5xl font-black text-white mb-1.5">{stat.value}</div>
          <div className="text-blue-100/90 text-sm md:text-base">{stat.label}</div>
        </div>
      ))}
    </div>
  </div>
  <div className={`w-full px-12 pb-24 mb-16 transition-all duration-1000 delay-300 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
      {[
        { icon: Clock, color: 'from-blue-500 to-blue-600', title: 'Instant Data Fetch', desc: 'Connect your current auto insurance carrier in seconds using Canopy Connect', delay: '0s' },
        { icon: CheckCircle, color: 'from-green-500 to-emerald-600', title: 'Accurate Quotes', desc: 'We sync your existing coverages so you get rates based on you', delay: '0.2s' },
        { icon: Shield, color: 'from-purple-500 to-purple-600', title: 'Skip the Forms', desc: 'QuoteSync is fully automated - no typing out your coverage limits, VIN numbers, or claims', delay: '0.4s' },
        { icon: TrendingDown, color: 'from-orange-500 to-orange-600', title: 'Enterprise Security', desc: 'We use the same security standards banks rely on', delay: '0.6s' },
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

        <div className={`max-w-2xl pt-24 mx-auto transition-all duration-1000 delay-500 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
          <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl p-10 md:p-12 border border-white/50 relative overflow-hidden">
            
             <div className="text-center mb-10">
              <h2 className="text-4xl font-black bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent mb-3">
                Start Your Free Quote
              </h2>
              <p className="text-gray-600 text-lg"></p>
            </div>

            {/* Trust Indicators */}
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-6 mb-8">
              <div className="flex items-start gap-3 mb-4">
                <Shield className="w-6 h-6 text-blue-600 flex-shrink-0 mt-1" />
                <div className="text-left">
                  <h3 className="font-bold text-gray-900 mb-1">Why is this safe?</h3>
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed">
                    QuoteSync is powered by <span className="font-semibold">Canopy Connect</span>, a secure platform that uses 256-bit encryption to protect your personal data the same way your bank does. </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0 mt-1" />
                <div className="text-left">
                  <h3 className="font-bold text-gray-900 mb-1">Your privacy is protected</h3>
                  <p className="text-sm text-gray-700 leading-relaxed">
                    We <span className="font-semibold">never store</span> your carrier login credentials. Your passwords are always encrypted and only used once to retrieve your current policy details.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              {/* Canopy Connect Embed */}
              <div className="text-center py-4">
                <a 
                  className="canopy-connect-embed inline-flex items-center justify-center gap-3 w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white font-black text-lg py-5 px-8 rounded-xl hover:from-blue-700 hover:via-indigo-700 hover:to-purple-700 transition-all duration-300 transform hover:scale-105 active:scale-95 shadow-2xl hover:shadow-blue-500/50 group no-underline"
                  href="https://app.usecanopy.com/c/camwileyagency" 
                  target="_blank"
                >
        
                  <span>Get My Quote</span>
                  <ArrowRight className="w-6 h-6 group-hover:translate-x-2 transition-transform" />
                </a>
                <p className="text-sm text-gray-500 mt-4">Takes less than 2 minutes • No manual forms to fill out</p>
              </div>

              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <p className="text-xs text-gray-600 text-center leading-relaxed">
                  <span className="font-semibold text-gray-700">How it works:</span> You'll log into your current insurance provider (like GEICO, State Farm, etc.) through Canopy Connect's secure portal. 
                  We retrieve your policy coverage details to provide accurate quotes. No data is sold to third parties.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-12 text-center">
            <p className="text-blue-100 font-semibold mb-6 text-lg">Partnered with America's Most Trusted Insurers</p>
            <div className="bg-white/95 backdrop-blur-sm rounded-2xl p-8 border border-white/20 overflow-hidden relative shadow-xl">
              <div className="flex overflow-hidden">
                <div className="logo-track">
                  <div className="flex gap-16 items-center min-w-max">
                    <img src="/logos/GEICO.png" alt="GEICO" className="h-12 w-auto hover:scale-110 transition-all duration-300 drop-shadow-lg" />
                    <img src="/logos/Progressive.png" alt="Progressive" className="h-12 w-auto hover:scale-110 transition-all duration-300 drop-shadow-lg" />
                    <img src="/logos/State-Farm.png" alt="State Farm" className="h-11 w-auto hover:scale-110 transition-all duration-300 drop-shadow-lg" />
                    <img src="/logos/Allstate.png" alt="Allstate" className="h-11 w-auto hover:scale-110 transition-all duration-300 drop-shadow-lg" />
                    <img src="/logos/Nationwide.png" alt="Nationwide" className="h-11 w-auto hover:scale-110 transition-all duration-300 drop-shadow-lg" />
                    <img src="/logos/USAA.png" alt="USAA" className="h-11 w-auto hover:scale-110 transition-all duration-300 drop-shadow-lg" />
                    <img src="/logos/Farmers.png" alt="Farmers" className="h-11 w-auto hover:scale-110 transition-all duration-300 drop-shadow-lg" />
                    <img src="/logos/Liberty-Mutual.png" alt="Liberty Mutual" className="h-11 w-auto hover:scale-110 transition-all duration-300 drop-shadow-lg" />
                  </div>
                  {/* Duplicate set for seamless loop */}
                  <div className="flex gap-16 items-center min-w-max">
                    <img src="/logos/GEICO.png" alt="GEICO" className="h-12 w-auto hover:scale-110 transition-all duration-300 drop-shadow-lg" />
                    <img src="/logos/Progressive.png" alt="Progressive" className="h-12 w-auto hover:scale-110 transition-all duration-300 drop-shadow-lg" />
                    <img src="/logos/State-Farm.png" alt="State Farm" className="h-11 w-auto hover:scale-110 transition-all duration-300 drop-shadow-lg" />
                    <img src="/logos/Allstate.png" alt="Allstate" className="h-11 w-auto hover:scale-110 transition-all duration-300 drop-shadow-lg" />
                    <img src="/logos/Nationwide.png" alt="Nationwide" className="h-11 w-auto hover:scale-110 transition-all duration-300 drop-shadow-lg" />
                    <img src="/logos/USAA.png" alt="USAA" className="h-11 w-auto hover:scale-110 transition-all duration-300 drop-shadow-lg" />
                    <img src="/logos/Farmers.png" alt="Farmers" className="h-11 w-auto hover:scale-110 transition-all duration-300 drop-shadow-lg" />
                    <img src="/logos/Liberty-Mutual.png" alt="Liberty Mutual" className="h-11 w-auto hover:scale-110 transition-all duration-300 drop-shadow-lg" />
                  </div>
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