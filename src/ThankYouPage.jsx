import React from 'react';
import './ThankYouPage.css';

const ThankYouPage = () => {
  return (
    <div className="thank-you-container">
      {/* Main Success Card */}
      <div className="success-card">
        <div className="checkmark-wrapper">
          <svg className="checkmark" viewBox="0 0 24 24">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>
        
        <h1>You're All Set!</h1>
        <p className="subtitle">
          I received your current policy details, and I'm already working on your quote.
        </p>

        {/* Personal Video Section */}
        <div className="video-section">
          <h2 className="video-title">A Quick Message from Cameron</h2>
          <div className="video-wrapper">
            {/* Replace the src with your actual video URL */}
            <iframe
              src="https://www.youtube.com/embed/CBmtFPMUcr0"
              title="Message from Cameron"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            ></iframe>
            {/* Alternative: If using a direct video file */}
            {/* <video controls>
              <source src="/path-to-your-video.mp4" type="video/mp4" />
              Your browser does not support the video tag.
            </video> */}
          </div>
        </div>
        
        <div className="info-box">
          <h2>Here's What I'm Doing Right Now:</h2>
          
          <div className="info-item">
            <div className="info-icon">
              <svg viewBox="0 0 24 24">
                <path d="M9 11l3 3L22 4"></path>
                <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"></path>
              </svg>
            </div>
            <div className="info-text">
              <strong>Analyzing your current policy</strong> to understand your coverage, deductibles, and household drivers
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
              <strong>Building your custom Allstate quote</strong> to see if I can beat what you are currently paying
            </div>
          </div>
          
          <div className="info-item">
            <div className="info-icon">
              <svg viewBox="0 0 24 24">
                <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"></path>
              </svg>
            </div>
            <div className="info-text">
              <strong>I'll call you within 24 hours</strong> to show you the comparison. Can't talk? No problem. I'll email everything instead.
            </div>
          </div>
        </div>

        {/* Value-Add Section */}
        <div className="value-section">
          <h3>💡 While You Wait, Here's What to Expect</h3>
          <div className="value-content">
            <p><strong>Honest Comparison:</strong> I'll show you exactly how Allstate stacks up against what you're paying now - apples to apples.</p>
            <p><strong>Your Questions Answered:</strong> Whether it's about coverage limits, deductibles, or eligible discounts - I've got you covered.</p>
            <p><strong>Zero Pressure:</strong> If Allstate saves you money, that's great! If not, I'll tell you honestly. You're in complete control. </p>
          </div>
        </div>
      </div>

      {/* Driver Education CTA */}
      <div className="driver-ed-cta">
        <div className="driver-ed-content">
          <h3>💰 Want to Save Even More on Insurance?</h3>
          <p>While you wait for your quote, check out how Georgia drivers can earn recurring insurance discounts by taking a simple online course.</p>
          <a href="/defensive-driving" className="driver-ed-button">
            Explore Driver Education Courses →
          </a>
        </div>
      </div>

      {/* Social Proof */}
      <div className="social-proof">
        <p className="social-proof-text">Join hundreds of drivers who've simplified their insurance shopping on insuredbycam.com</p>
        <div className="trust-badges">
          <div className="trust-badge">
            <svg viewBox="0 0 24 24">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
            </svg>
            Accurate Quotes
          </div>
          <div className="trust-badge">
            <svg viewBox="0 0 24 24">
              <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"></path>
            </svg>
            No Spam Calls
          </div>
          <div className="trust-badge">
            <svg viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            24-Hour Response
          </div>
        </div>
      </div>

      {/* Back to Homepage */}
      <div className="back-link">
        <a href="/">← Back to Home</a>
      </div>
    </div>
  );
};

export default ThankYouPage;