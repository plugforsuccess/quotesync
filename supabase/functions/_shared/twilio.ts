// Shared Twilio utilities for Edge Functions
// Centralizes SMS sending, phone formatting, and webhook signature validation

/**
 * Send SMS via Twilio REST API
 * Returns the Twilio message SID on success, or an error code/message on failure
 */
export async function sendSMS(
  accountSid: string,
  authToken: string,
  from: string,
  to: string,
  body: string
): Promise<{ success: boolean; sid?: string; error?: string; code?: number }> {
  const auth = btoa(`${accountSid}:${authToken}`)
  const params = new URLSearchParams()
  params.append('To', to)
  params.append('From', from)
  params.append('Body', body)

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    }
  )

  const data = await response.json()
  if (!response.ok) {
    return {
      success: false,
      error: data.message || 'Twilio SMS failed',
      code: data.code,
    }
  }
  return { success: true, sid: data.sid }
}

/**
 * Format a US phone number to E.164 format (+1XXXXXXXXXX)
 * Accepts: (404) 555-1234, 4045551234, +14045551234, 1-404-555-1234
 * Returns null if the input cannot be parsed as a valid US number
 */
export function formatPhoneUS(phone: string): string | null {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return null
}

/**
 * Normalize a phone number to canonical 10-digit US format for storage
 * This is the format stored in the leads table so all lookups are consistent
 */
export function normalizePhoneForStorage(phone: string): string | null {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return digits
  if (digits.length === 11 && digits.startsWith('1')) return digits.substring(1)
  return null
}

/**
 * Validate Twilio's request signature (HMAC-SHA1)
 * See: https://www.twilio.com/docs/usage/security#validating-requests
 *
 * Twilio signs every webhook request with your Auth Token. This prevents
 * attackers from spoofing webhook calls to your endpoints.
 */
export async function validateTwilioSignature(
  req: Request,
  authToken: string,
  publicUrl: string
): Promise<boolean> {
  const signature = req.headers.get('X-Twilio-Signature')
  if (!signature) return false

  // Parse the form body to get params for signature validation
  const formData = await req.clone().formData()
  const params: Record<string, string> = {}
  for (const [key, value] of formData.entries()) {
    params[key] = value.toString()
  }

  // Build the data string: URL + sorted params concatenated as key+value pairs
  const sortedKeys = Object.keys(params).sort()
  let dataString = publicUrl
  for (const key of sortedKeys) {
    dataString += key + params[key]
  }

  // HMAC-SHA1
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(authToken),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(dataString))
  const expectedSignature = btoa(String.fromCharCode(...new Uint8Array(sig)))

  return signature === expectedSignature
}

/**
 * Validate that all required environment variables are set.
 * Returns the first missing variable name, or null if all are present.
 */
export function checkRequiredEnvVars(varNames: string[]): string | null {
  for (const varName of varNames) {
    if (!Deno.env.get(varName)) {
      return varName
    }
  }
  return null
}
