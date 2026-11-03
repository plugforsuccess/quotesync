import { T } from '../components/SiteCopy';
import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import EmailCapture from '../components/EmailCapture';
import ProductUpsell from '../components/ProductUpsell';
import { trackQuoteCompleted, trackEvent } from '../lib/analytics';
import { supabase } from '../lib/supabase';
import './ThankYouPage.css';

const SESSION_KEYS_LEAD_ID = 'qs_funnel_lead_id';

const ThankYouPage = () => {
  const [smsOptIn, setSmsOptIn] = useState(false);
  const [smsSubmitted, setSmsSubmitted] = useState(false);

  // Track quote completed on page load
  useEffect(() => {
    trackQuoteCompleted();
  }, []);

  // Handle SMS opt-in toggle
  const handleSmsOptIn = useCallback(async (checked) => {
    setSmsOptIn(checked);
    if (checked && !smsSubmitted) {
      const leadId = sessionStorage.getItem(SESSION_KEYS_LEAD_ID);
      if (leadId) {
        try {
          await supabase.from('leads').update({ sms_opt_in: true }).eq('id', leadId);
          setSmsSubmitted(true);
          trackEvent('sms_opt_in', { context: 'thank_you_page' });
        } catch (err) {
          console.error('Failed to update SMS opt-in:', err);
        }
      }
    }
  }, [smsSubmitted]);

  return (
    <div className="thank-you-container">
      {/* Main Success Card */}
      <div className="success-card">
        <div className="checkmark-wrapper">
          <svg className="checkmark" viewBox="0 0 24 24">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>
        
        <h1><T k="pages.thankyoupage.50d1f8">You're All Set!</T></h1>
        <p className="subtitle">
          <T k="pages.thankyoupage.e0f14a">I received your current policy details, and I'm already working on your quote.</T>
        </p>

        {/* Personal Video Section */}
        <div className="video-section">
          <h2 className="video-title"><T k="pages.thankyoupage.c9c9b7">A Quick Message from Cameron</T></h2>
          <div className="video-wrapper">
            <iframe
              src="https://www.youtube.com/embed/CBmtFPMUcr0"
              title="Message from Cameron"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            ></iframe>
          </div>
        </div>
        
        <div className="info-box">
          <h2><T k="pages.thankyoupage.77bbc8">Here's What I'm Doing Right Now:</T></h2>
          
          <div className="info-item">
            <div className="info-icon">
              <svg viewBox="0 0 24 24">
                <path d="M9 11l3 3L22 4"></path>
                <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"></path>
              </svg>
            </div>
            <div className="info-text">
              <strong><T k="pages.thankyoupage.a798f1">Analyzing your current policy</T></strong> <T k="pages.thankyoupage.f0c6b9">to understand your coverage, deductibles, and household drivers</T>
            </div>
          </div>
          
          <div className="info-item">
            <div className="info-icon">
              <svg viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M12 6v6l4 2"></path>
              </svg>
            </div>
            <div className="info-text">
              <strong><T k="pages.thankyoupage.af3b2a">Building your custom Allstate quote</T></strong> <T k="pages.thankyoupage.e4e5c8">to see if I can beat what you are currently paying</T>
            </div>
          </div>
          
          <div className="info-item">
            <div className="info-icon">
              <svg viewBox="0 0 24 24">
                <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"></path>
              </svg>
            </div>
            <div className="info-text">
              <strong><T k="pages.thankyoupage.90c95f">I'll call you within 24 hours</T></strong> <T k="pages.thankyoupage.e59965">to show you the comparison. Can't talk? No problem. I'll email everything instead.</T>
            </div>
          </div>
        </div>

        {/* SMS Opt-In */}
        <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-xl text-sm" style={{ marginTop: '1.5rem', padding: '1rem', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '0.75rem', fontSize: '0.875rem' }}>
          <p style={{ fontWeight: 600, marginBottom: '0.5rem' }}>
            <T k="pages.thankyoupage.a78fc7">Get a text when your quote is ready?</T>
          </p>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={smsOptIn}
              onChange={e => handleSmsOptIn(e.target.checked)}
            />
            <T k="pages.thankyoupage.318bcb">Yes — text me at the number I provided</T>
          </label>
          {smsOptIn && (
            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
              <T k="pages.thankyoupage.b41410">By checking this box, you agree to receive SMS updates from Insured by Cam. Message & data rates may apply. Reply STOP to unsubscribe.</T>
            </p>
          )}
        </div>

        {/* Value-Add Section */}
        <div className="value-section">
          <h3><T k="pages.thankyoupage.c35199">💡 While You Wait, Here's What to Expect</T></h3>
          <div className="value-content">
            <p><strong><T k="pages.thankyoupage.7f48c4">Honest Comparison:</T></strong> <T k="pages.thankyoupage.aa24c8">I'll show you exactly how Allstate stacks up against what you're paying now - apples to apples.</T></p>
            <p><strong><T k="pages.thankyoupage.bcaa1a">Your Questions Answered:</T></strong> <T k="pages.thankyoupage.614988">Whether it's about coverage limits, deductibles, or eligible discounts - I've got you covered.</T></p>
            <p><strong><T k="pages.thankyoupage.1ed5ad">Zero Pressure:</T></strong> <T k="pages.thankyoupage.ebc7cb">If Allstate saves you money, that's great! If not, I'll tell you honestly. You're in complete control.</T> </p>
          </div>
        </div>

        {/* NEW: Product Upsell */}
        <div style={{ marginTop: '2rem' }}>
          <ProductUpsell context="post-quote" />
        </div>
      </div>

      {/* NEW: Email Capture */}
      <div style={{ maxWidth: '600px', margin: '0 auto', marginBottom: '2rem' }}>
        <EmailCapture context="post-quote" />
      </div>

      {/* Driver Education CTA */}
      <div className="driver-ed-cta">
        <div className="driver-ed-content">
          <h3><T k="pages.thankyoupage.264f6c">💰 Want to Save Even More on Insurance?</T></h3>
          <p><T k="pages.thankyoupage.251987">While you wait for your quote, check out how Georgia drivers can earn recurring insurance discounts by taking a simple online course.</T></p>
          <Link to="/courses" className="driver-ed-button">
            <T k="pages.thankyoupage.b61ac7">Explore Driver Education Courses →</T>
          </Link>
        </div>
      </div>

      {/* Social Proof */}
      <div className="social-proof">
        <p className="social-proof-text">
          <T k="pages.thankyoupage.f0bcd2">Join hundreds of drivers who've simplified their insurance shopping on insuredbycam.com</T>
        </p>
        <div className="trust-badges">
          <div className="trust-badge">
            <svg viewBox="0 0 24 24">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
            </svg>
            <T k="pages.thankyoupage.4b2f0e">Accurate Quotes</T>
          </div>
          <div className="trust-badge">
            <svg viewBox="0 0 24 24">
              <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"></path>
            </svg>
            <T k="pages.thankyoupage.87c00d">No Spam Calls</T>
          </div>
          <div className="trust-badge">
            <svg viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            <T k="pages.thankyoupage.180d14">24-Hour Response</T>
          </div>
        </div>
      </div>

      {/* Back to Homepage */}
      <div className="back-link">
        <Link to="/quotes"><T k="pages.thankyoupage.0fa120">← Back to Home</T></Link>
        {/* or `to="/"` if you prefer the root as your primary quote page */}
      </div>
    </div>
  );
};

export default ThankYouPage;
