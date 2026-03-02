// src/hooks/useFunnelMetrics.js
// Data hook for Funnel Dashboard — single query, client-side computation

import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

// ─── Time Range Helpers ───────────────────────────────────────────────────────

function getDateRange(timeRange) {
  const now = new Date();
  let startDate, endDate;

  endDate = now.toISOString();

  switch (timeRange) {
    case 'today': {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      startDate = start.toISOString();
      break;
    }
    case '7d': {
      const start = new Date(now);
      start.setDate(start.getDate() - 7);
      startDate = start.toISOString();
      break;
    }
    case '30d': {
      const start = new Date(now);
      start.setDate(start.getDate() - 30);
      startDate = start.toISOString();
      break;
    }
    case 'month': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      startDate = start.toISOString();
      break;
    }
    case 'all':
    default:
      startDate = '2020-01-01T00:00:00.000Z';
      break;
  }

  return { startDate, endDate };
}

function getPriorPeriodRange(timeRange) {
  const now = new Date();

  switch (timeRange) {
    case 'today': {
      const start = new Date(now);
      start.setDate(start.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      const end = new Date(now);
      end.setDate(end.getDate() - 1);
      end.setHours(23, 59, 59, 999);
      return { startDate: start.toISOString(), endDate: end.toISOString() };
    }
    case '7d': {
      const end = new Date(now);
      end.setDate(end.getDate() - 7);
      const start = new Date(end);
      start.setDate(start.getDate() - 7);
      return { startDate: start.toISOString(), endDate: end.toISOString() };
    }
    case '30d': {
      const end = new Date(now);
      end.setDate(end.getDate() - 30);
      const start = new Date(end);
      start.setDate(start.getDate() - 30);
      return { startDate: start.toISOString(), endDate: end.toISOString() };
    }
    case 'month': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { startDate: start.toISOString(), endDate: end.toISOString() };
    }
    case 'all':
    default:
      return null;
  }
}

// ─── Step Progression Detection ───────────────────────────────────────────────

function getLastStep(lead) {
  // Check steps in reverse order; return the furthest step reached
  if (lead.first_name != null && lead.phone != null) return 'contact';
  if (lead.street_address != null) return 'address';
  if (lead.date_of_birth != null) return 'dob';
  if (lead.marital_status != null) return 'maritalStatus';
  if (lead.vehicle_count != null) return 'vehicleCount';
  if (lead.auto_driving_record != null || lead.home_claims_history != null) return 'risk';
  if (lead.current_auto_carrier != null || lead.current_home_carrier != null || lead.current_renters_carrier != null) return 'carrier';
  if (lead.product_intent != null) return 'productIntent';
  if (lead.owns_home != null) return 'ownsHome';
  if (lead.zip != null) return 'zip';
  return 'none';
}

const STEP_ORDER = [
  'zip', 'ownsHome', 'productIntent', 'carrier', 'risk',
  'vehicleCount', 'maritalStatus', 'dob', 'address', 'contact'
];

const STEP_LABELS = {
  zip: 'ZIP Code',
  ownsHome: 'Own/Rent',
  productIntent: 'Product Intent',
  carrier: 'Carrier',
  risk: 'Risk Screening',
  vehicleCount: 'Vehicle Count',
  maritalStatus: 'Marital Status',
  dob: 'Date of Birth',
  address: 'Address',
  contact: 'Contact Info',
};

function reachedStep(lead, stepName) {
  switch (stepName) {
    case 'zip': return lead.zip != null;
    case 'ownsHome': return lead.owns_home != null;
    case 'productIntent': return lead.product_intent != null;
    case 'carrier': return lead.current_auto_carrier != null || lead.current_home_carrier != null || lead.current_renters_carrier != null;
    case 'risk': return lead.auto_driving_record != null || lead.home_claims_history != null;
    case 'vehicleCount': return lead.vehicle_count != null;
    case 'maritalStatus': return lead.marital_status != null;
    case 'dob': return lead.date_of_birth != null;
    case 'address': return lead.street_address != null;
    case 'contact': return lead.first_name != null && lead.phone != null;
    default: return false;
  }
}

// ─── Metric Computation ───────────────────────────────────────────────────────

function deriveChannel(lead) {
  if (lead.referral_code) return 'referral';
  if (lead.utm_source) return lead.utm_source.toLowerCase();
  return 'direct';
}

function computeAllMetrics(leads, timeRange) {
  const funnelLeads = leads.filter(l => l.source === 'funnel');
  const completedFunnel = funnelLeads.filter(l => l.status !== 'partial');
  const partialFunnel = funnelLeads.filter(l => l.status === 'partial');

  // ── KPIs ──
  const submissions = completedFunnel.length;
  const totalFunnel = funnelLeads.length;
  const conversionRate = totalFunnel > 0 ? (submissions / totalFunnel) * 100 : 0;

  const scores = completedFunnel.map(l => l.lead_score).filter(s => s != null);
  const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

  // Run rate projection
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysElapsed = Math.max(1, Math.floor((now - startOfMonth) / (1000 * 60 * 60 * 24)) + 1);
  const submissionsThisMonth = funnelLeads.filter(l => {
    const created = new Date(l.created_at);
    return created >= startOfMonth && l.status !== 'partial';
  }).length;
  const projectedMonthly = Math.round((submissionsThisMonth / daysElapsed) * daysInMonth);
  const gapTo700 = projectedMonthly - 700;

  // ── Funnel Step Drop-off ──
  const funnelSteps = STEP_ORDER.map((stepKey, idx) => {
    const count = funnelLeads.filter(l => reachedStep(l, stepKey)).length;
    return { key: stepKey, name: STEP_LABELS[stepKey], count };
  });

  // Compute drop-off percentages
  for (let i = 0; i < funnelSteps.length; i++) {
    if (i === 0) {
      funnelSteps[i].dropOffPercent = 0;
    } else {
      const prev = funnelSteps[i - 1].count;
      const curr = funnelSteps[i].count;
      funnelSteps[i].dropOffPercent = prev > 0 ? ((prev - curr) / prev) * 100 : 0;
    }
  }

  // Find worst step (skip step 0)
  let worstStep = null;
  let worstDropOff = 0;
  for (let i = 1; i < funnelSteps.length; i++) {
    if (funnelSteps[i].dropOffPercent > worstDropOff) {
      worstDropOff = funnelSteps[i].dropOffPercent;
      worstStep = funnelSteps[i];
    }
  }

  // ── Lead Quality ──
  const scoreBuckets = [
    { bucket: '0-19', min: 0, max: 19, count: 0 },
    { bucket: '20-39', min: 20, max: 39, count: 0 },
    { bucket: '40-59', min: 40, max: 59, count: 0 },
    { bucket: '60-79', min: 60, max: 79, count: 0 },
    { bucket: '80-100', min: 80, max: 100, count: 0 },
  ];
  completedFunnel.forEach(l => {
    const s = l.lead_score || 0;
    for (const b of scoreBuckets) {
      if (s >= b.min && s <= b.max) { b.count++; break; }
    }
  });

  const owners = completedFunnel.filter(l => l.owns_home === true).length;
  const renters = completedFunnel.filter(l => l.owns_home === false).length;

  const intentCounts = { auto: 0, home: 0, bundle: 0, auto_renters: 0, unsure: 0 };
  completedFunnel.forEach(l => {
    const intent = l.product_intent || 'unsure';
    if (intent in intentCounts) intentCounts[intent]++;
    else intentCounts.unsure++;
  });

  // Risk profile
  let cleanDriving = 0, incidents12 = 0, incidents3plus = 0;
  let claims01 = 0, claims2plus = 0;
  completedFunnel.forEach(l => {
    if (l.auto_driving_record === 'clean') cleanDriving++;
    else if (l.auto_driving_record === '1-2') incidents12++;
    else if (l.auto_driving_record === '3+') incidents3plus++;

    if (l.home_claims_history === '0-1') claims01++;
    else if (l.home_claims_history === '2+') claims2plus++;
  });

  // ── Channel Performance ──
  const channelMap = {};
  funnelLeads.forEach(l => {
    const ch = deriveChannel(l);
    if (!channelMap[ch]) {
      channelMap[ch] = { channel: ch, total: 0, completed: 0, scores: [], intents: {} };
    }
    channelMap[ch].total++;
    if (l.status !== 'partial') {
      channelMap[ch].completed++;
      if (l.lead_score != null) channelMap[ch].scores.push(l.lead_score);
      const intent = l.product_intent || 'unsure';
      channelMap[ch].intents[intent] = (channelMap[ch].intents[intent] || 0) + 1;
    }
  });
  const channels = Object.values(channelMap).map(ch => {
    const avgChScore = ch.scores.length > 0 ? Math.round(ch.scores.reduce((a, b) => a + b, 0) / ch.scores.length) : 0;
    const topIntent = Object.entries(ch.intents).sort((a, b) => b[1] - a[1])[0]?.[0] || '-';
    return {
      channel: ch.channel,
      leads: ch.completed,
      conversionRate: ch.total > 0 ? Math.round((ch.completed / ch.total) * 100) : 0,
      avgScore: avgChScore,
      topIntent,
    };
  }).sort((a, b) => b.leads - a.leads);

  // ── Partials ──
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const recoverablePartials = partialFunnel.filter(l => {
    return l.zip != null && new Date(l.created_at) >= sevenDaysAgo;
  });

  const dropOffByStep = {};
  partialFunnel.forEach(l => {
    const last = getLastStep(l);
    dropOffByStep[last] = (dropOffByStep[last] || 0) + 1;
  });

  const recentRecoverable = recoverablePartials
    .sort((a, b) => {
      // Sort by number of populated fields descending
      const fieldsA = countPopulatedFields(a);
      const fieldsB = countPopulatedFields(b);
      return fieldsB - fieldsA;
    })
    .slice(0, 20)
    .map(l => ({
      id: l.id,
      zip: l.zip,
      ownsHome: l.owns_home,
      intent: l.product_intent,
      carrier: l.current_auto_carrier || l.current_home_carrier || l.current_renters_carrier || null,
      lastStep: STEP_LABELS[getLastStep(l)] || 'Unknown',
      score: l.lead_score,
      createdAt: l.created_at,
    }));

  // Recovery rate: partials that later completed (same session_id)
  const partialSessionIds = new Set(partialFunnel.map(l => l.session_id).filter(Boolean));
  const completedSessionIds = new Set(completedFunnel.map(l => l.session_id).filter(Boolean));
  const recoveredCount = [...partialSessionIds].filter(sid => completedSessionIds.has(sid)).length;
  const recoveryRate = partialSessionIds.size > 0 ? (recoveredCount / partialSessionIds.size) * 100 : 0;

  return {
    kpis: {
      submissions,
      conversionRate: Math.round(conversionRate * 10) / 10,
      avgScore: Math.round(avgScore),
      runRate: submissionsThisMonth,
      projectedMonthly,
      gapTo700,
      daysElapsed,
      daysInMonth,
    },
    funnel: {
      steps: funnelSteps,
      worstStep,
    },
    quality: {
      scoreDistribution: scoreBuckets,
      ownerRenterSplit: { owners, renters },
      intentMix: intentCounts,
      riskProfile: { cleanDriving, incidents12, incidents3plus, claims01, claims2plus },
    },
    channels,
    partials: {
      total: partialFunnel.length,
      recoverableCount: recoverablePartials.length,
      dropOffByStep: Object.entries(dropOffByStep).map(([step, count]) => ({
        step: STEP_LABELS[step] || step,
        count,
      })).sort((a, b) => b.count - a.count),
      recentRecoverable,
      recoveryRate: Math.round(recoveryRate * 10) / 10,
    },
    priorPeriod: null, // Filled below if applicable
  };
}

function countPopulatedFields(lead) {
  const fields = [
    lead.zip, lead.owns_home, lead.product_intent,
    lead.current_auto_carrier, lead.current_home_carrier, lead.current_renters_carrier,
    lead.auto_driving_record, lead.home_claims_history,
    lead.vehicle_count, lead.marital_status, lead.date_of_birth,
    lead.street_address, lead.first_name, lead.phone, lead.email,
  ];
  return fields.filter(f => f != null).length;
}

function computePriorPeriodKpis(leads) {
  const funnelLeads = leads.filter(l => l.source === 'funnel');
  const completed = funnelLeads.filter(l => l.status !== 'partial');
  const submissions = completed.length;
  const convRate = funnelLeads.length > 0 ? (submissions / funnelLeads.length) * 100 : 0;
  const scores = completed.map(l => l.lead_score).filter(s => s != null);
  const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  return {
    submissions,
    conversionRate: Math.round(convRate * 10) / 10,
    avgScore: Math.round(avgScore),
  };
}

// ─── Main Hook ────────────────────────────────────────────────────────────────

export function useFunnelMetrics(agencyId, timeRange) {
  return useQuery({
    queryKey: ['funnel_metrics', agencyId, timeRange],
    queryFn: async () => {
      const { startDate, endDate } = getDateRange(timeRange);

      const { data, error } = await supabase
        .from('leads')
        .select(`
          id, status, source, zip, state,
          owns_home, product_intent, vehicle_count,
          current_auto_carrier, current_home_carrier, current_renters_carrier,
          auto_driving_record, home_claims_history,
          marital_status, date_of_birth, street_address,
          first_name, phone, email,
          lead_score, allstate_conflict, risk_flag,
          utm_source, utm_medium, utm_campaign, referral_code,
          session_id, created_at, first_contact_at
        `)
        .eq('agency_id', agencyId)
        .gte('created_at', startDate)
        .lte('created_at', endDate)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const metrics = computeAllMetrics(data || [], timeRange);

      // Fetch prior period data for trend arrows
      const priorRange = getPriorPeriodRange(timeRange);
      if (priorRange) {
        const { data: priorData, error: priorError } = await supabase
          .from('leads')
          .select(`
            id, status, source, lead_score,
            utm_source, referral_code, created_at
          `)
          .eq('agency_id', agencyId)
          .gte('created_at', priorRange.startDate)
          .lte('created_at', priorRange.endDate);

        if (!priorError && priorData) {
          metrics.priorPeriod = computePriorPeriodKpis(priorData);
        }
      }

      return metrics;
    },
    enabled: !!agencyId,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });
}
