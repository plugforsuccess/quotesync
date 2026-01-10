// Canopy Webhook Payload Normalizer
// Extracts structured data from Canopy webhook payloads (via Zapier)

// deno-lint-ignore no-explicit-any
type CanopyPayload = Record<string, any>

export interface QuoteSummary {
  policy_types: string[]
  counts: {
    vehicles: number
    drivers: number
    properties: number
  }
  premium: {
    auto_total: number
    home_total: number
    total: number
    currency: string
    confidence: 'reported' | 'estimated' | 'unknown'
  }
  renewal: {
    earliest_renewal_date: string | null
    days_to_renewal: number | null
  }
  carriers: string[]
  effective_dates: {
    earliest_effective: string | null
  }
  addresses_present: boolean
  documents: {
    available: boolean
    count: number
    pointers: string[]
  }
}

// Normalize webhook payload to quote summary
// Handles various Canopy/Zapier payload formats
export function normalizeToQuoteSummary(payload: CanopyPayload, hasDocuments: boolean): QuoteSummary {
  // Extract from various possible payload structures
  const policies = payload.policies || payload.data?.policies || []
  const documents = payload.documents || payload.data?.documents || []
  const consumer = payload.consumer || payload.data?.consumer || {}

  // Extract policy types
  const policyTypes = [...new Set(
    policies.map((p: CanopyPayload) => p.type?.toLowerCase()).filter(Boolean)
  )] as string[]

  // Count assets
  let vehicleCount = 0
  let driverCount = 0
  let propertyCount = 0
  let autoTotal = 0
  let homeTotal = 0
  const carriers: string[] = []
  let earliestRenewal: string | null = null
  let earliestEffective: string | null = null

  for (const policy of policies) {
    // Count assets
    if (policy.vehicles) vehicleCount += policy.vehicles.length
    if (policy.drivers) driverCount += policy.drivers.length
    if (policy.properties) propertyCount += policy.properties.length

    // Sum premiums by type
    if (policy.premium) {
      const ptype = policy.type?.toLowerCase()
      if (ptype === 'auto') {
        autoTotal += Number(policy.premium) || 0
      } else if (ptype === 'home' || ptype === 'homeowners') {
        homeTotal += Number(policy.premium) || 0
      }
    }

    // Collect carriers
    if (policy.carrier && !carriers.includes(policy.carrier)) {
      carriers.push(policy.carrier)
    }

    // Track earliest dates
    if (policy.expiration_date) {
      if (!earliestRenewal || policy.expiration_date < earliestRenewal) {
        earliestRenewal = policy.expiration_date
      }
    }
    if (policy.effective_date) {
      if (!earliestEffective || policy.effective_date < earliestEffective) {
        earliestEffective = policy.effective_date
      }
    }
  }

  // Calculate days to renewal
  let daysToRenewal: number | null = null
  if (earliestRenewal) {
    const renewalDate = new Date(earliestRenewal)
    const today = new Date()
    daysToRenewal = Math.ceil((renewalDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  }

  // Check if addresses present
  const addressesPresent = !!(consumer.state || consumer.zip)

  return {
    policy_types: policyTypes,
    counts: {
      vehicles: vehicleCount,
      drivers: driverCount,
      properties: propertyCount,
    },
    premium: {
      auto_total: autoTotal,
      home_total: homeTotal,
      total: autoTotal + homeTotal,
      currency: 'USD',
      confidence: autoTotal > 0 || homeTotal > 0 ? 'reported' : 'unknown',
    },
    renewal: {
      earliest_renewal_date: earliestRenewal,
      days_to_renewal: daysToRenewal,
    },
    carriers,
    effective_dates: {
      earliest_effective: earliestEffective,
    },
    addresses_present: addressesPresent,
    documents: {
      available: hasDocuments && documents.length > 0,
      count: documents.length,
      pointers: documents.map((d: CanopyPayload) => d.id).filter(Boolean),
    },
  }
}
