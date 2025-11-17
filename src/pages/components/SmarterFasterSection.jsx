// src/components/SmarterFasterSection.jsx
import React from 'react';
import { Clock, PhoneCallIcon, BriefcaseBusiness, CheckCircle } from 'lucide-react';

const SmarterFasterSection = ({ isVisible }) => {
  const benefits = [
    {
      icon: Clock,
      color: 'from-blue-500 to-blue-600',
      title: 'Start Your Quote',
      desc: "Connect your current insurance instantly using our secure portal. That's it. No forms. No hassle.",
    },
    {
      icon: BriefcaseBusiness,
      color: 'from-orange-500 to-orange-600',
      title: 'I Do the Work',
      desc: "Once your details are retrieved, I'll take it from there and finish your quote within 24 hours.",
    },
    {
      icon: PhoneCallIcon,
      color: 'from-purple-500 to-purple-600',
      title: 'We Connect',
      desc: "I'll call you to walk through the numbers and answer any questions. Can't talk? I'll email the proposal.",
    },
    {
      icon: CheckCircle,
      color: 'from-green-500 to-emerald-600',
      title: 'You Decide',
      desc: 'Like it? I can get you switched over as early as tomorrow, or any future effective date you choose.',
    },
  ];

  return (
    <div
      className={`w-full px-4 sm:px-6 lg:px-12 pb-24 mb-12 transition-all duration-1000 delay-300 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
      }`}
    >
      <h2 className="text-center text-white font-extrabold text-3xl sm:text-4xl md:text-5xl tracking-tight mb-16">
        A Smarter, Faster Way to Shop Insurance
      </h2>

      {/* Clean Card Grid - No Tilting */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
        {benefits.map((benefit, index) => {
          const Icon = benefit.icon;
          return (
            <div
              key={index}
              className="bg-white/95 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-white/20 hover:shadow-2xl hover:scale-105 transition-all duration-300"
            >
              <div
                className={`w-14 h-14 rounded-full bg-gradient-to-br ${benefit.color} flex items-center justify-center mb-4 shadow-lg`}
              >
                <Icon className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">{benefit.title}</h3>
              <p className="text-gray-600 leading-relaxed text-sm">{benefit.desc}</p>
            </div>
          );
        })}
      </div>

      {/* Logo Carousel */}
      <div className="mt-24 text-center">
        <p className="text-blue-100 font-semibold mb-6 text-lg">
          Helping Customers Save More By Switching from These Carriers
        </p>
        <div className="bg-white/95 backdrop-blur-sm rounded-2xl p-8 border border-white/20 overflow-hidden relative shadow-xl">
          <div className="flex overflow-hidden">
            <div className="logo-track">
              <LogoRow />
              <LogoRow />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const LogoRow = () => (
  <div className="flex gap-16 items-center min-w-max">
    <img
      src="/logos/GEICO.png"
      alt="GEICO"
      className="h-12 w-auto hover:scale-110 transition-all duration-300 drop-shadow-lg grayscale hover:grayscale-0"
    />
    <img
      src="/logos/Progressive.png"
      alt="Progressive"
      className="h-12 w-auto hover:scale-110 transition-all duration-300 drop-shadow-lg grayscale hover:grayscale-0"
    />
    <img
      src="/logos/State-Farm.png"
      alt="State Farm"
      className="h-11 w-auto hover:scale-110 transition-all duration-300 drop-shadow-lg grayscale hover:grayscale-0"
    />
    <img
      src="/logos/AutoOwners.png"
      alt="AutoOwners"
      className="h-6 w-auto hover:scale-110 transition-all duration-300 drop-shadow-lg grayscale hover:grayscale-0"
    />
    <img
      src="/logos/Nationwide.png"
      alt="Nationwide"
      className="h-11 w-auto hover:scale-110 transition-all duration-300 drop-shadow-lg grayscale hover:grayscale-0"
    />
    <img
      src="/logos/USAA.png"
      alt="USAA"
      className="h-11 w-auto hover:scale-110 transition-all duration-300 drop-shadow-lg grayscale hover:grayscale-0"
    />
    <img
      src="/logos/Farmers.png"
      alt="Farmers"
      className="h-11 w-auto hover:scale-110 transition-all duration-300 drop-shadow-lg grayscale hover:grayscale-0"
    />
    <img
      src="/logos/Liberty-Mutual.png"
      alt="Liberty Mutual"
      className="h-11 w-auto hover:scale-110 transition-all duration-300 drop-shadow-lg grayscale hover:grayscale-0"
    />
  </div>
);

export default SmarterFasterSection;