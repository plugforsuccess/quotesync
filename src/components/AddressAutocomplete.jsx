// src/components/AddressAutocomplete.jsx
// Google Places Autocomplete wrapper for the funnel address step.
// Relies on the Maps JS API script tag loaded in index.html.
import { useEffect, useRef, useCallback, useState } from 'react';

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

  // Wait for the async Google Maps script to finish loading
  useEffect(() => {
    if (window.google?.maps?.places) {
      setLoaded(true);
      return;
    }
    const interval = setInterval(() => {
      if (window.google?.maps?.places) {
        setLoaded(true);
        clearInterval(interval);
      }
    }, 200);
    return () => clearInterval(interval);
  }, []);

  // Initialize autocomplete once the API is available
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
