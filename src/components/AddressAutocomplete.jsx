// src/components/AddressAutocomplete.jsx
// Production-grade Google Places autocomplete using the gmp-place-autocomplete
// web component. Race-condition safe, with Geocoder fallback for missing fields.
import { useEffect, useMemo, useRef, useState } from "react";
import { loadGoogleMaps } from "./googleMapsLoader";
import { parseAddressComponents } from "../utils/parseAddress";

/** Geocoder fallback when place.fetchFields returns incomplete data. */
async function geocodeByPlaceId(placeId) {
  const geocoder = new google.maps.Geocoder();
  return new Promise((resolve) => {
    geocoder.geocode({ placeId }, (results, status) => {
      if (status === "OK" && results?.[0]) resolve(results[0]);
      else resolve(null);
    });
  });
}

/** Normalize Geocoder address components to the web-component format. */
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
  placeholder = "Enter your address",
  className = "",
}) {
  const containerRef = useRef(null);
  const autocompleteElRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [inputDisabled, setInputDisabled] = useState(true);

  // Keep stable reference to avoid re-binding listeners on every render
  const includedRegionCodes = useMemo(() => regionCodes, [regionCodes]);

  // ── Load Google Maps once ───────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        await loadGoogleMaps(apiKey);
        if (cancelled) return;
        setReady(true);
        setInputDisabled(false);
      } catch (e) {
        if (cancelled) return;
        setInputDisabled(true);
        onError?.(e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [apiKey, onError]);

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

        // Fetch minimal fields for performance
        await place.fetchFields({
          fields: ["id", "formattedAddress", "addressComponents", "location"],
        });

        const comps = place.addressComponents || [];
        const formatted = place.formattedAddress;
        let parsed = parseAddressComponents(comps, formatted);

        // Extract lat/lng if available
        let lat;
        let lng;
        if (place.location) {
          lat = place.location.lat();
          lng = place.location.lng();
        }

        // Fallback: if core fields are missing, try the Geocoder
        const missingCore =
          !parsed.street1 || !parsed.city || !parsed.state || !parsed.zip;

        if (missingCore) {
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
        }

        if (!isMounted) return;

        onSelect({
          address: parsed,
          lat,
          lng,
          placeId: place.id,
        });
      } catch (e) {
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

  return (
    <div className={className}>
      <div ref={containerRef} />
      {inputDisabled && (
        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
          Loading address search…
        </div>
      )}
    </div>
  );
}
