// src/components/AddressAutocomplete.jsx
// Google Places Autocomplete using the new PlaceAutocompleteElement API.
// Relies on the Maps JS API script tag loaded in index.html.
import { useEffect, useRef, useCallback, useState } from 'react';

export default function AddressAutocomplete({ onAddressSelect, className = '' }) {
  const containerRef = useRef(null);
  const elementRef = useRef(null);
  const [loaded, setLoaded] = useState(!!window.google?.maps?.places);

  const handlePlaceSelect = useCallback(async (event) => {
    const place = event.place;
    await place.fetchFields({ fields: ['addressComponents', 'formattedAddress'] });

    const getComponent = (type) => {
      const component = place.addressComponents?.find(c => c.types?.includes(type));
      return component?.longText || component?.long_name || '';
    };

function parseGeocoderComponents(addressComponents, formattedAddress) {
  const normalized = addressComponents.map((c) => ({
    longText: c.long_name,
    shortText: c.short_name,
    types: c.types,
  }));
  return parseAddressComponents(normalized, formattedAddress);
}

    const city = getComponent('locality')
      || getComponent('sublocality_level_1')
      || getComponent('sublocality')
      || getComponent('administrative_area_level_2')
      || getComponent('neighborhood')
      || getComponent('postal_town');

    onAddressSelect({
      street: `${getComponent('street_number')} ${getComponent('route')}`.trim(),
      city,
      state: getShort('administrative_area_level_1'),
      zip: getComponent('postal_code'),
      fullAddress: place.formattedAddress,
    });
  }, [onAddressSelect]);

  // ── Load Google Maps once ───────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        await loadGoogleMaps(apiKey);
        if (cancelled) return;
        setReady(true);
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

    const placeAutocomplete = new window.google.maps.places.PlaceAutocompleteElement({
      includedRegionCodes: ['us'],
    });

    const container = containerRef.current;
    placeAutocomplete.addEventListener('gmp-placeselect', handlePlaceSelect);

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
