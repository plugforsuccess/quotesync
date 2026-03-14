// src/lib/leadScoring.js
// Deterministic lead scoring function (0-100)

/**
 * Compute lead score from available data
 * @param {Object} lead - Lead record
 * @param {Object} quoteSummary - Quote summary from lead_quotes.quote_summary
 * @returns {{ score: number, factors: Array<{ label: string, points: number }> }}
 */
export function computeLeadScore(lead, quoteSummary = null) {
  const factors = [];
  let score = 0;

  // 1. Completeness: has location data (max 10 points)
  if (lead.zip && lead.state) {
    factors.push({ label: 'Location complete', points: 10 });
    score += 10;
  } else if (lead.zip || lead.state) {
    factors.push({ label: 'Partial location', points: 5 });
    score += 5;
  }

  // 2. Enrichment available (max 15 points)
  if (quoteSummary && Object.keys(quoteSummary).length > 0) {
    factors.push({ label: 'Enrichment data', points: 15 });
    score += 15;
  }

  // 3. Bundle potential: multiple policy types (max 20 points)
  const policyTypes = quoteSummary?.policy_types || [];
  if (policyTypes.length >= 3) {
    factors.push({ label: 'Multi-policy bundle', points: 20 });
    score += 20;
  } else if (policyTypes.length === 2) {
    factors.push({ label: 'Two policies', points: 15 });
    score += 15;
  } else if (policyTypes.length === 1) {
    factors.push({ label: 'Single policy', points: 5 });
    score += 5;
  }

  // 4. Size proxy: vehicles/drivers count (max 15 points)
  const vehicleCount = quoteSummary?.vehicle_count || 0;
  const driverCount = quoteSummary?.driver_count || 0;
  const propertyCount = quoteSummary?.property_count || 0;
  const totalAssets = vehicleCount + driverCount + propertyCount;

  if (totalAssets >= 4) {
    factors.push({ label: `${totalAssets} assets`, points: 15 });
    score += 15;
  } else if (totalAssets >= 2) {
    factors.push({ label: `${totalAssets} assets`, points: 10 });
    score += 10;
  } else if (totalAssets >= 1) {
    factors.push({ label: `${totalAssets} asset`, points: 5 });
    score += 5;
  }

  // 5. Renewal proximity (max 15 points)
  const renewalDays = quoteSummary?.renewal_days || null;
  if (renewalDays !== null) {
    if (renewalDays <= 14) {
      factors.push({ label: 'Renewal < 2 weeks', points: 15 });
      score += 15;
    } else if (renewalDays <= 30) {
      factors.push({ label: 'Renewal < 30 days', points: 12 });
      score += 12;
    } else if (renewalDays <= 60) {
      factors.push({ label: 'Renewal < 60 days', points: 8 });
      score += 8;
    }
  }

  // 6. Documents available (max 10 points)
  const hasDocuments = quoteSummary?.has_documents || false;
  const documentCount = quoteSummary?.document_count || 0;
  if (hasDocuments && documentCount > 0) {
    factors.push({ label: `${documentCount} doc(s) available`, points: 10 });
    score += 10;
  }

  // 7. Attribution quality (max 15 points)
  if (lead.referral_code) {
    factors.push({ label: 'Referral', points: 15 });
    score += 15;
  } else if (lead.utm_campaign) {
    factors.push({ label: 'Campaign tracked', points: 8 });
    score += 8;
  } else if (lead.utm_source) {
    factors.push({ label: 'Source tracked', points: 5 });
    score += 5;
  }

  // Cap at 100
  score = Math.min(score, 100);

  return { score, factors };
}

/**
 * Risk flag display config
 */
export const RISK_FLAG_CONFIG = {
  green:  { label: 'Clean',     bg: 'bg-green-100',  text: 'text-green-700',  dot: 'bg-green-500'  },
  yellow: { label: 'Review',    bg: 'bg-yellow-100', text: 'text-yellow-700', dot: 'bg-yellow-500' },
  red:    { label: 'High Risk', bg: 'bg-red-100',    text: 'text-red-700',    dot: 'bg-red-500'    },
};

/**
 * Format score factors for display
 * @param {Array} factors - Score factors array
 * @returns {string[]} - Array of display strings
 */
export function formatScoreFactors(factors) {
  if (!factors || !Array.isArray(factors)) return [];
  return factors
    .sort((a, b) => b.points - a.points)
    .slice(0, 5)
    .map(f => f.label);
}

/**
 * Get score color class based on score value
 * @param {number} score - Lead score 0-100
 * @returns {string} - Tailwind color classes
 */
export function getScoreColor(score) {
  if (score >= 70) return 'text-green-700 bg-green-100';
  if (score >= 40) return 'text-yellow-700 bg-yellow-100';
  return 'text-gray-700 bg-gray-100';
}
