// Canopy API Client - Backend Only
// Fetches pull data from Canopy API for enrichment

const CANOPY_API_BASE = 'https://api.usecanopy.com/v1'

interface CanopyPullResponse {
  id: string
  status: string
  policies?: CanopyPolicy[]
  documents?: CanopyDocument[]
  consumer?: {
    state?: string
    zip?: string
  }
}

interface CanopyPolicy {
  type: string // 'auto', 'home', 'life', etc.
  carrier?: string
  premium?: number
  effective_date?: string
  expiration_date?: string
  vehicles?: unknown[]
  drivers?: unknown[]
  properties?: unknown[]
}

interface CanopyDocument {
  id: string
  type: string
  name?: string
}

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

export async function fetchCanopyPull(pullId: string): Promise<CanopyPullResponse> {
  const apiKey = Deno.env.get('CANOPY_API_KEY')
  if (!apiKey) {
    throw new Error('CANOPY_API_KEY not configured')
  }

  const response = await fetch(`${CANOPY_API_BASE}/pulls/${pullId}`, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Canopy API error: ${response.status} - ${errorText}`)
  }

  return response.json()
}

export function normalizeToQuoteSummary(pull: CanopyPullResponse, hasDocuments: boolean): QuoteSummary {
  const policies = pull.policies || []
  const documents = pull.documents || []

  // Extract policy types
  const policyTypes = [...new Set(policies.map(p => p.type?.toLowerCase()).filter(Boolean))]

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
      if (policy.type?.toLowerCase() === 'auto') {
        autoTotal += policy.premium
      } else if (policy.type?.toLowerCase() === 'home' || policy.type?.toLowerCase() === 'homeowners') {
        homeTotal += policy.premium
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
  const addressesPresent = !!(pull.consumer?.state || pull.consumer?.zip)

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
      pointers: documents.map(d => d.id),
    },
  }
}
