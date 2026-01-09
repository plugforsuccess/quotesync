// src/lib/performance.js
// Performance monitoring and logging utilities

const SLOW_QUERY_THRESHOLD = 800; // ms
const SLOW_ROUTE_THRESHOLD = 1000; // ms

/**
 * Log performance metrics to console (and optionally to Sentry/monitoring service)
 */
const logPerformance = (metric, data) => {
  const timestamp = new Date().toISOString();
  const logData = {
    timestamp,
    metric,
    ...data
  };

  console.log(`[PERF] ${metric}:`, logData);

  // TODO: Send to Sentry or monitoring service
  // if (window.Sentry) {
  //   window.Sentry.captureMessage(`Performance: ${metric}`, {
  //     level: 'info',
  //     extra: logData
  //   });
  // }
};

/**
 * Measure Supabase query duration
 */
export const measureQuery = async (queryName, queryFn) => {
  const start = performance.now();

  try {
    const result = await queryFn();
    const duration = performance.now() - start;

    if (duration > SLOW_QUERY_THRESHOLD) {
      logPerformance('slow_query', {
        query: queryName,
        duration: Math.round(duration),
        status: 'completed'
      });
    }

    return result;
  } catch (error) {
    const duration = performance.now() - start;

    logPerformance('query_error', {
      query: queryName,
      duration: Math.round(duration),
      error: error.message
    });

    throw error;
  }
};

/**
 * Measure route load time
 */
export const measureRouteLoad = (routeName) => {
  const start = performance.now();

  return () => {
    const duration = performance.now() - start;

    if (duration > SLOW_ROUTE_THRESHOLD) {
      logPerformance('slow_route', {
        route: routeName,
        duration: Math.round(duration)
      });
    }
  };
};

/**
 * Get Web Vitals metrics
 */
export const logWebVitals = () => {
  // LCP - Largest Contentful Paint
  const lcpObserver = new PerformanceObserver((list) => {
    const entries = list.getEntries();
    const lastEntry = entries[entries.length - 1];
    logPerformance('lcp', {
      value: Math.round(lastEntry.renderTime || lastEntry.loadTime)
    });
  });

  try {
    lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
  } catch (e) {
    // Browser doesn't support LCP
  }

  // FID - First Input Delay
  const fidObserver = new PerformanceObserver((list) => {
    const entries = list.getEntries();
    entries.forEach((entry) => {
      logPerformance('fid', {
        value: Math.round(entry.processingStart - entry.startTime)
      });
    });
  });

  try {
    fidObserver.observe({ entryTypes: ['first-input'] });
  } catch (e) {
    // Browser doesn't support FID
  }

  // CLS - Cumulative Layout Shift
  let clsValue = 0;
  const clsObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (!entry.hadRecentInput) {
        clsValue += entry.value;
      }
    }

    logPerformance('cls', {
      value: clsValue.toFixed(3)
    });
  });

  try {
    clsObserver.observe({ entryTypes: ['layout-shift'] });
  } catch (e) {
    // Browser doesn't support CLS
  }
};

/**
 * Log API call duration
 */
export const measureAPICall = async (apiName, apiFn) => {
  const start = performance.now();

  try {
    const result = await apiFn();
    const duration = performance.now() - start;

    if (duration > SLOW_QUERY_THRESHOLD) {
      logPerformance('slow_api', {
        api: apiName,
        duration: Math.round(duration),
        status: 'success'
      });
    }

    return result;
  } catch (error) {
    const duration = performance.now() - start;

    logPerformance('api_error', {
      api: apiName,
      duration: Math.round(duration),
      error: error.message
    });

    throw error;
  }
};
