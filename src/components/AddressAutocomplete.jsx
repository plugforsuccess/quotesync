// src/components/AddressAutocomplete.jsx
// Production-grade Google Places autocomplete using the gmp-place-autocomplete
// web component. Race-condition safe, with Geocoder fallback for missing fields.
// Enterprise hardened: geocoder cache, non-PII telemetry, graceful failure UI.
import { useEffect, useMemo, useRef, useState } from "react";
import { loadGoogleMaps } from "./googleMapsLoader";
import { parseAddressComponents } from "../utils/parseAddress";
import { trackEvent } from "../lib/analytics";

// ── Session-scoped geocoder cache (avoids repeated calls for same placeId) ──
const geocoderCache = new Map();

async function geocodeByPlaceId(placeId) {
  if (geocoderCache.has(placeId)) return geocoderCache.get(placeId);

  const geocoder = new google.maps.Geocoder();
  const result = await new Promise((resolve) => {
    geocoder.geocode({ placeId }, (results, status) => {
      if (status === "OK" && results?.[0]) resolve(results[0]);
      else resolve(null);
    });
  });

  geocoderCache.set(placeId, result);
  return result;
}

function parseGeocoderComponents(addressComponents, formattedAddress) {
  const normalized = addressComponents.map((c) => ({
    longText: c.long_name,
    shortText: c.short_name,
    types: c.types,
  }));
  return parseAddressComponents(normalized, formattedAddress);
}

export default function AddressAutocomplete({
  apiKey,
  regionCodes = ["us"],
  onSelect,
  onError,
  onLoadFailure,
  placeholder = "Enter your address",
  className = "",
}) {
  const containerRef = useRef(null);
  const autocompleteElRef = useRef(null);
  const [loadState, setLoadState] = useState("loading"); // loading | ready | failed

  const ready = loadState === "ready";
  const includedRegionCodes = useMemo(() => regionCodes, [regionCodes]);

  // ── Load Google Maps once ───────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        await loadGoogleMaps(apiKey);
        if (cancelled) return;
        setLoadState("ready");
        trackEvent("places_maps_load", { outcome: "success" });
      } catch (e) {
        if (cancelled) return;
        setLoadState("failed");
        trackEvent("places_maps_load", {
          outcome: "failure",
          error_type: e?.message === "Google Maps load timeout" ? "timeout" : "script_error",
        });
        onLoadFailure?.();
        onError?.(e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [apiKey, onError, onLoadFailure]);

  // ── Mount the web component & attach listener ───────────────────────
  useEffect(() => {
    if (!ready || !containerRef.current) return;

    const el = document.createElement("gmp-place-autocomplete");
    el.setAttribute("placeholder", placeholder);
    el.includedRegionCodes = includedRegionCodes;

    containerRef.current.innerHTML = "";
    containerRef.current.appendChild(el);
    autocompleteElRef.current = el;

    let isMounted = true;

    const handlePlaceSelect = async (event) => {
      try {
        const place = event?.place;
        if (!place) return;

        let comps = [];
        let formatted;
        let fetchFieldsOk = false;

        // Primary path: fetchFields
        try {
          await place.fetchFields({
            fields: ["id", "formattedAddress", "addressComponents", "location"],
          });
          comps = place.addressComponents || [];
          formatted = place.formattedAddress;
          fetchFieldsOk = true;
        } catch {
          // fetchFields failed — fall through to geocoder
          trackEvent("places_fetch_fields", { outcome: "failure" });
        }

        if (fetchFieldsOk) {
          trackEvent("places_fetch_fields", { outcome: "success" });
        }

        let parsed = parseAddressComponents(comps, formatted);

        let lat;
        let lng;
        if (place.location) {
          lat = place.location.lat();
          lng = place.location.lng();
        }

        const missingCore =
          !parsed.street1 || !parsed.city || !parsed.state || !parsed.zip;

        // Secondary path: Geocoder fallback
        if (missingCore || !fetchFieldsOk) {
          trackEvent("places_geocoder_fallback", { reason: fetchFieldsOk ? "missing_fields" : "fetch_failed" });
          try {
            const geocoded = await geocodeByPlaceId(place.id);
            if (geocoded?.address_components?.length) {
              parsed = parseGeocoderComponents(
                geocoded.address_components,
                geocoded.formatted_address
              );
              if (!lat && geocoded.geometry?.location) {
                lat = geocoded.geometry.location.lat();
                lng = geocoded.geometry.location.lng();
              }
            }
          } catch {
            trackEvent("places_geocoder_fallback", { outcome: "failure" });
          }
        }

        const stillMissing =
          !parsed.street1 || !parsed.city || !parsed.state || !parsed.zip;
        if (stillMissing) {
          trackEvent("places_result", { outcome: "incomplete_address" });
        } else {
          trackEvent("places_result", { outcome: "complete" });
        }

        if (!isMounted) return;

        onSelect({
          address: parsed,
          lat,
          lng,
          placeId: place.id,
        });
      } catch (e) {
        trackEvent("places_select_error", { error_type: e?.name || "unknown" });
        onError?.(e);
      }
    };

    el.addEventListener("gmp-placeselect", handlePlaceSelect);

    return () => {
      isMounted = false;
      try {
        el.removeEventListener("gmp-placeselect", handlePlaceSelect);
      } catch {
        // ignore
      }
    };
  }, [ready, includedRegionCodes, onSelect, onError, placeholder]);

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <div className={className}>
      <div ref={containerRef} />
      {loadState === "loading" && (
        <div className="mt-2 text-xs text-gray-400">
          Loading address search…
        </div>
      )}
      {loadState === "failed" && (
        <div className="mt-2 text-xs text-red-500">
          Address search unavailable. Please enter your address manually.
        </div>
      )}
    </div>
  );
}
