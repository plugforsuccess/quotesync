// src/components/EmailCapture.jsx
import React, { useState } from 'react';
import { Mail, CheckCircle, ArrowRight } from 'lucide-react';

const EmailCapture = ({ context = 'general' }) => {
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    // IMPORTANT: In production, this should send to your email service
    // (ConvertKit, Mailchimp, etc.) via API
    // For now, simulating submission
    setTimeout(() => {
      setIsLoading(false);
      setIsSubmitted(true);
    }, 1000);
  };

  if (isSubmitted) {
    return (
      <div className="bg-gradient-to-r from-success-500/10 to-emerald-500/10 border-2 border-success-500/30 rounded-2xl p-6">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-success-500 rounded-full flex items-center justify-center flex-shrink-0">
            <CheckCircle className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-success-700 mb-1">You're In!</h3>
            <p className="text-sm text-success-700/80">
              Check your email for your first tip on understanding insurance coverage.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const getHeading = () => {
    switch (context) {
      case 'post-quote':
        return "Want Free Insurance Tips While You Wait?";
      case 'education':
        return "Get Weekly Insurance Insights";
      default:
        return "Stay Informed About Your Coverage";
    }
  };

  const getDescription = () => {
    switch (context) {
      case 'post-quote':
        return "Join 500+ drivers getting bite-sized insurance tips. No spam, unsubscribe anytime.";
      case 'education':
        return "Weekly emails with practical insurance tips, coverage breakdowns, and money-saving strategies.";
      default:
        return "Get practical tips about insurance, coverage, and saving money.";
    }
  };

  return (
    <div className="bg-gradient-to-r from-primary-500/5 to-secondary-500/5 border border-primary-500/20 rounded-2xl p-6">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-secondary-500 rounded-full flex items-center justify-center flex-shrink-0">
          <Mail className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <h3 className="font-bold text-gray-900 mb-1">
            {getHeading()}
          </h3>
          <p className="text-sm text-gray-600">
            {getDescription()}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Your email address"
            required
            className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all text-sm"
          />
        </div>

        <div>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Phone (optional for SMS updates)"
            className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all text-sm"
          />
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-3 px-6 bg-gradient-to-r from-primary-600 to-secondary-600 hover:from-primary-700 hover:to-secondary-700 text-white font-semibold rounded-xl transition-all duration-300 transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2"
        >
          {isLoading ? (
            'Subscribing...'
          ) : (
            <>
              Subscribe
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>

        <p className="text-xs text-gray-500 text-center">
          We respect your privacy. Unsubscribe anytime.
        </p>
      </form>
    </div>
  );
};

export default EmailCapture;
