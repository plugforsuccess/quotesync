// src/pages/components/TrustBuilder.jsx
import React from 'react';
import { Shield, Users, Award, CheckCircle, Lock, Star } from 'lucide-react';

const TrustBuilder = () => {
  return (
    <section className="py-20 px-4 relative z-10">
      <div className="max-w-7xl mx-auto">
        {/* Why This Is Different */}
        <div className="mb-20">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-black text-white mb-4 leading-tight">
              Why This Is{' '}
              <span className="bg-gradient-to-r from-success-300 via-success-400 to-success-500 bg-clip-text text-transparent">
                Different
              </span>
            </h2>
            <p className="text-xl text-white/80 max-w-2xl mx-auto">
              Not another quote site. A real agent who actually compares coverage.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {/* Other Sites */}
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-gray-600 to-gray-700 rounded-2xl opacity-20 group-hover:opacity-30 blur transition duration-300"></div>
              <div className="relative bg-white/5 backdrop-blur-sm rounded-2xl p-8 border border-white/10">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-gray-500 to-gray-600 flex items-center justify-center">
                    <span className="text-2xl">😓</span>
                  </div>
                  <h3 className="text-2xl font-bold text-gray-300">Other Quote Sites</h3>
                </div>

                <ul className="space-y-4">
                  {[
                    "Fill out 20 minutes of forms",
                    "Sell your info to 12 different agents",
                    "Get spammed with calls for weeks",
                    "Compare price only (not coverage)",
                    "No one explains what you're buying"
                  ].map((item, idx) => (
                    <li key={idx} className="flex items-start gap-3 text-white/60">
                      <span className="text-red-400 mt-1 flex-shrink-0">✗</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* This Site */}
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-success-500 via-success-400 to-emerald-500 rounded-2xl opacity-30 group-hover:opacity-50 blur transition duration-300"></div>
              <div className="relative bg-white/10 backdrop-blur-sm rounded-2xl p-8 border-2 border-success-400/50">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-success-400 to-success-600 flex items-center justify-center shadow-lg">
                    <span className="text-2xl">✨</span>
                  </div>
                  <h3 className="text-2xl font-bold text-white">insuredbycam.com</h3>
                </div>

                <ul className="space-y-4">
                  {[
                    "Sync your policy in 2 minutes (no forms)",
                    "Cameron reviews it personally",
                    "One agent, no spam calls",
                    "Compare coverage + price",
                    "Actually understand your policy"
                  ].map((item, idx) => (
                    <li key={idx} className="flex items-start gap-3 text-white">
                      <CheckCircle className="w-5 h-5 text-success-400 mt-0.5 flex-shrink-0" />
                      <span className="font-medium">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Trust Indicators */}
        <div className="grid md:grid-cols-3 lg:grid-cols-5 gap-6 max-w-6xl mx-auto">
          <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 text-center">
            <div className="w-14 h-14 bg-gradient-to-br from-primary-500 to-primary-600 rounded-xl flex items-center justify-center mx-auto mb-4 shadow-lg">
              <Award className="w-7 h-7 text-white" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Licensed Allstate Agent</h3>
            <p className="text-sm text-white/70 leading-relaxed">
              Licensed Allstate agent in Georgia. A real person, not a call center.
            </p>
          </div>

          <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 text-center">
            <div className="w-14 h-14 bg-gradient-to-br from-success-500 to-success-600 rounded-xl flex items-center justify-center mx-auto mb-4 shadow-lg">
              <Lock className="w-7 h-7 text-white" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Info Never Sold</h3>
            <p className="text-sm text-white/70 leading-relaxed">
              Your info is never sold to third parties. One agent, zero spam.
            </p>
          </div>

          <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 text-center">
            <div className="w-14 h-14 bg-gradient-to-br from-secondary-500 to-secondary-600 rounded-xl flex items-center justify-center mx-auto mb-4 shadow-lg">
              <Users className="w-7 h-7 text-white" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">500+ Quotes Delivered</h3>
            <p className="text-sm text-white/70 leading-relaxed">
              Hundreds of Georgia families already trust Cam with their insurance.
            </p>
          </div>

          <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 text-center">
            <div className="w-14 h-14 bg-gradient-to-br from-accent-500 to-accent-600 rounded-xl flex items-center justify-center mx-auto mb-4 shadow-lg">
              <Star className="w-7 h-7 text-white" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Rated 5.0 on Google</h3>
            <p className="text-sm text-white/70 leading-relaxed">
              Top-rated by real customers on Google Reviews.
            </p>
          </div>

          <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 text-center">
            <div className="w-14 h-14 bg-gradient-to-br from-primary-500 to-primary-600 rounded-xl flex items-center justify-center mx-auto mb-4 shadow-lg">
              <Shield className="w-7 h-7 text-white" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">256-bit Encryption</h3>
            <p className="text-sm text-white/70 leading-relaxed">
              Bank-level security standard used by Plaid, Venmo, and major banks.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default TrustBuilder;
