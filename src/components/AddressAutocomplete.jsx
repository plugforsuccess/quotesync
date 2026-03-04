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

    console.log('Address components:', place.addressComponents);
    console.log('Formatted address:', place.formattedAddress);

    const getComponent = (type) => {
      const component = place.addressComponents?.find(c => c.types?.includes(type));
      return component?.longText || '';
    };

    const getShort = (type) => {
      const component = place.addressComponents?.find(c => c.types?.includes(type));
      return component?.shortText || '';
    };

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

  // Create and mount the PlaceAutocompleteElement
  useEffect(() => {
    if (!loaded || !containerRef.current || !window.google?.maps?.places?.PlaceAutocompleteElement) return;

    const placeAutocomplete = new window.google.maps.places.PlaceAutocompleteElement({
      includedPrimaryTypes: ['address'],
      includedRegionCodes: ['us'],
    });

    const container = containerRef.current;
    placeAutocomplete.addEventListener('gmp-placeselect', handlePlaceSelect);
    container.appendChild(placeAutocomplete);
    elementRef.current = placeAutocomplete;

    return () => {
      placeAutocomplete.removeEventListener('gmp-placeselect', handlePlaceSelect);
      if (container.contains(placeAutocomplete)) {
        container.removeChild(placeAutocomplete);
      }
      elementRef.current = null;
    };
  }, [loaded, handlePlaceSelect]);

  return (
    <div ref={containerRef} className={className} />
  );
}
