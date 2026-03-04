// src/utils/parseAddress.js
// Robust address component parser with fallback chains for city resolution.

function pick(comps, type, preferShort = false) {
  const c = comps.find((x) => x.types?.includes(type));
  if (!c) return "";
  return (preferShort ? c.shortText : c.longText) || "";
}

/**
 * Parse Google Places / Geocoder address components into a flat address object.
 *
 * Insurance funnels generally want:
 *   street_number + route  → street1
 *   locality (city) with fallbacks
 *   admin_area_level_1 short → state (e.g. GA)
 *   postal_code → zip
 *   country short → country (e.g. US)
 *
 * Handles edge cases:
 *   - Missing street_number (route-only, premise, or subpremise addresses)
 *   - PO Boxes (premise type)
 *   - Multi-unit addresses (subpremise → street2)
 */
export function parseAddressComponents(addressComponents, formattedAddress) {
  const streetNumber = pick(addressComponents, "street_number");
  const route = pick(addressComponents, "route");
  const premise = pick(addressComponents, "premise");

  // Build street1: prefer street_number + route; fall back to premise (PO Box, named buildings)
  let street1 = [streetNumber, route].filter(Boolean).join(" ").trim();
  if (!street1 && premise) {
    street1 = premise;
  }

  // Multi-unit / subpremise → street2
  const subpremise = pick(addressComponents, "subpremise");
  const street2 = subpremise || undefined;

  // City fallbacks: locality → postal_town → sublocality → sublocality_level_1 → admin_area_level_2
  const city =
    pick(addressComponents, "locality") ||
    pick(addressComponents, "postal_town") ||
    pick(addressComponents, "sublocality") ||
    pick(addressComponents, "sublocality_level_1") ||
    pick(addressComponents, "administrative_area_level_2");

  const state = pick(addressComponents, "administrative_area_level_1", true);
  const zip = pick(addressComponents, "postal_code");
  const country = pick(addressComponents, "country", true);

  return {
    street1,
    street2,
    city,
    state,
    zip,
    country,
    formattedAddress,
  };
}
