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
 */
export function parseAddressComponents(addressComponents, formattedAddress) {
  const streetNumber = pick(addressComponents, "street_number");
  const route = pick(addressComponents, "route");
  const street1 = [streetNumber, route].filter(Boolean).join(" ").trim();

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
    city,
    state,
    zip,
    country,
    formattedAddress,
  };
}
