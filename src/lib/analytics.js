// src/lib/analytics.js
// Unified analytics helper for Google Analytics and Meta Pixel

/**
 * Track a custom event
 * @param {string} eventName - Name of the event
 * @param {object} eventParams - Additional parameters for the event
 */
export const trackEvent = (eventName, eventParams = {}) => {
  // Google Analytics 4
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', eventName, eventParams);
  }

  // Meta Pixel
  if (typeof window !== 'undefined' && window.fbq) {
    window.fbq('track', eventName, eventParams);
  }

  // Console log for development
  if (import.meta.env.DEV) {
    console.log('📊 Analytics Event:', eventName, eventParams);
  }
};

/**
 * Track page view
 * @param {string} path - Page path
 * @param {string} title - Page title
 */
export const trackPageView = (path, title) => {
  // Google Analytics 4
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('config', window.GA_MEASUREMENT_ID, {
      page_path: path,
      page_title: title,
    });
  }

  // Meta Pixel
  if (typeof window !== 'undefined' && window.fbq) {
    window.fbq('track', 'PageView');
  }

  if (import.meta.env.DEV) {
    console.log('📄 Page View:', path, title);
  }
};

// ===== Conversion Events =====

/**
 * Track when user starts a quote
 */
export const trackQuoteStarted = () => {
  trackEvent('quote_started', {
    event_category: 'engagement',
    event_label: 'insurance_quote',
  });
};

/**
 * Track when user completes a quote submission
 */
export const trackQuoteCompleted = () => {
  trackEvent('quote_completed', {
    event_category: 'conversion',
    event_label: 'insurance_quote',
    value: 1,
  });

  // Meta Pixel Lead event
  if (typeof window !== 'undefined' && window.fbq) {
    window.fbq('track', 'Lead', {
      content_name: 'Insurance Quote',
      content_category: 'Insurance',
    });
  }
};

/**
 * Track when user views a product
 * @param {object} product - Product details
 */
export const trackProductView = (product) => {
  trackEvent('view_item', {
    event_category: 'ecommerce',
    event_label: product.name,
    items: [
      {
        item_id: product.id,
        item_name: product.name,
        item_category: product.category,
        price: product.price,
      },
    ],
  });

  // Meta Pixel ViewContent event
  if (typeof window !== 'undefined' && window.fbq) {
    window.fbq('track', 'ViewContent', {
      content_name: product.name,
      content_ids: [product.id],
      content_type: 'product',
      value: product.price,
      currency: 'USD',
    });
  }
};

/**
 * Track when user initiates checkout
 * @param {object} product - Product details
 */
export const trackBeginCheckout = (product) => {
  trackEvent('begin_checkout', {
    event_category: 'ecommerce',
    event_label: product.name,
    value: product.price,
    currency: 'USD',
    items: [
      {
        item_id: product.id,
        item_name: product.name,
        item_category: product.category,
        price: product.price,
      },
    ],
  });

  // Meta Pixel InitiateCheckout event
  if (typeof window !== 'undefined' && window.fbq) {
    window.fbq('track', 'InitiateCheckout', {
      content_name: product.name,
      content_ids: [product.id],
      content_type: 'product',
      value: product.price,
      currency: 'USD',
    });
  }
};

/**
 * Track completed purchase
 * @param {object} product - Product details
 * @param {string} transactionId - Transaction ID
 */
export const trackPurchase = (product, transactionId) => {
  trackEvent('purchase', {
    event_category: 'ecommerce',
    event_label: product.name,
    transaction_id: transactionId,
    value: product.price,
    currency: 'USD',
    items: [
      {
        item_id: product.id,
        item_name: product.name,
        item_category: product.category,
        price: product.price,
        quantity: 1,
      },
    ],
  });

  // Meta Pixel Purchase event
  if (typeof window !== 'undefined' && window.fbq) {
    window.fbq('track', 'Purchase', {
      content_name: product.name,
      content_ids: [product.id],
      content_type: 'product',
      value: product.price,
      currency: 'USD',
    });
  }
};

/**
 * Track email capture
 * @param {string} context - Where the email was captured (e.g., 'post-quote', 'education')
 */
export const trackEmailCapture = (context) => {
  trackEvent('email_capture', {
    event_category: 'engagement',
    event_label: context,
  });

  // Meta Pixel CompleteRegistration event
  if (typeof window !== 'undefined' && window.fbq) {
    window.fbq('track', 'CompleteRegistration', {
      content_name: 'Email Subscription',
      status: context,
    });
  }
};

/**
 * Track CTA clicks
 * @param {string} ctaName - Name of the CTA
 * @param {string} location - Where the CTA was clicked
 */
export const trackCTAClick = (ctaName, location) => {
  trackEvent('cta_click', {
    event_category: 'engagement',
    event_label: ctaName,
    cta_location: location,
  });
};

// ===== Google Ads Conversion Tracking =====

/**
 * Track Google Ads conversion
 * @param {string} conversionLabel - The conversion label from Google Ads
 * @param {number} value - Conversion value
 */
export const trackGoogleAdsConversion = (conversionLabel, value = 0) => {
  if (typeof window !== 'undefined' && window.gtag && window.GADS_CONVERSION_ID) {
    window.gtag('event', 'conversion', {
      send_to: `${window.GADS_CONVERSION_ID}/${conversionLabel}`,
      value: value,
      currency: 'USD',
    });
  }

  if (import.meta.env.DEV) {
    console.log('📊 Google Ads Conversion:', conversionLabel, value);
  }
};

// ===== Funnel Tracking (for /save funnel) =====

/**
 * Track funnel step completion
 * @param {number} step - Step number (1, 2, 3)
 * @param {object} data - Step data
 */
export const trackFunnelStep = (step, data = {}) => {
  const eventName = `funnel_step_${step}`;

  // GA4 only — fire directly to avoid the base trackEvent which also fires fbq
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', eventName, {
      event_category: 'funnel',
      event_label: `step_${step}`,
      ...data,
    });
  }

  // Meta Pixel - map to standard events (no duplicate custom event)
  if (typeof window !== 'undefined' && window.fbq) {
    if (step === 1) {
      window.fbq('track', 'Lead', { content_name: 'Funnel Step 1 - Qualifier' });
    } else if (step === 2) {
      window.fbq('track', 'CompleteRegistration', { content_name: 'Funnel Step 2 - Contact' });
    } else if (step === 3) {
      window.fbq('track', 'ViewContent', { content_name: 'Funnel Step 3 - Confirmation' });
    }
  }

  if (import.meta.env.DEV) {
    console.log('📊 Funnel Step:', step, data);
  }
};

/**
 * Track lead form submission (primary conversion event)
 * @param {object} leadData - Lead data for attribution
 */
export const trackLeadSubmission = (leadData = {}) => {
  // GA4 - primary conversion
  trackEvent('generate_lead', {
    event_category: 'conversion',
    event_label: 'manual_form',
    value: 60,
    currency: 'USD',
    ...leadData,
  });

  // Google Ads conversion
  trackGoogleAdsConversion('CONVERSION_LABEL_HERE', 60);

  // Meta Pixel
  if (typeof window !== 'undefined' && window.fbq) {
    window.fbq('track', 'Lead', {
      content_name: 'Insurance Lead',
      content_category: 'Insurance',
      value: 60,
      currency: 'USD',
    });
  }

  if (import.meta.env.DEV) {
    console.log('📊 Lead Submission:', leadData);
  }
};
