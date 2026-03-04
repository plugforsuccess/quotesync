// src/components/AddressAutocomplete.jsx
// Google Places Autocomplete wrapper for the funnel address step
import { useEffect, useRef, useCallback, useState } from 'react';
import { Loader } from '@googlemaps/js-api-loader';

let loaderPromise = null;

function getGoogleMapsLoader() {
  if (loaderPromise) return loaderPromise;
  const apiKey = import.meta.env.VITE_GOOGLE_PLACES_API_KEY;
  if (!apiKey) return null;
  const loader = new Loader({
    apiKey,
    version: 'weekly',
    libraries: ['places'],
  });
  loaderPromise = loader.load();
  return loaderPromise;
}

export default function AddressAutocomplete({ onAddressSelect, defaultValue = '', className = '' }) {
  const inputRef = useRef(null);
  const autocompleteRef = useRef(null);
  const [loaded, setLoaded] = useState(!!window.google?.maps?.places);

  const handlePlaceSelect = useCallback(() => {
    const place = autocompleteRef.current.getPlace();
    if (!place?.address_components) return;

    const getComponent = (type) => {
      const component = place.address_components.find(c => c.types.includes(type));
      return component?.long_name || '';
    };

    const getComponentShort = (type) => {
      const component = place.address_components.find(c => c.types.includes(type));
      return component?.short_name || '';
    };

    const address = {
      street: `${getComponent('street_number')} ${getComponent('route')}`.trim(),
      city: getComponent('locality') || getComponent('sublocality_level_1'),
      state: getComponentShort('administrative_area_level_1'),
      zip: getComponent('postal_code'),
      fullAddress: place.formatted_address,
    };

    onAddressSelect(address);
  }, [onAddressSelect]);

  // Load Google Maps API
  useEffect(() => {
    if (window.google?.maps?.places) {
      setLoaded(true);
      return;
    }
    const promise = getGoogleMapsLoader();
    if (!promise) return;
    promise.then(() => setLoaded(true)).catch(() => {});
  }, []);

  // Initialize autocomplete once loaded
  useEffect(() => {
    if (!loaded || !inputRef.current || !window.google?.maps?.places) return;

    autocompleteRef.current = new window.google.maps.places.Autocomplete(
      inputRef.current,
      {
        types: ['address'],
        componentRestrictions: { country: 'us' },
        fields: ['address_components', 'formatted_address'],
      }
    );

    autocompleteRef.current.addListener('place_changed', handlePlaceSelect);

    return () => {
      if (autocompleteRef.current) {
        window.google.maps.event.clearInstanceListeners(autocompleteRef.current);
      }
    };
  }, [loaded, handlePlaceSelect]);

  return (
    <input
      ref={inputRef}
      type="text"
      defaultValue={defaultValue}
      placeholder="Start typing your address..."
      autoComplete="off"
      className={className}
    />
  );
}
