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
    console.log('=== PLACE SELECT EVENT FIRED ===');
    console.log('PLACE OBJECT BEFORE FETCH:', place);
    console.log('PLACE KEYS:', Object.keys(place));

    await place.fetchFields({ fields: ['addressComponents', 'formattedAddress'] });

    console.log('ADDRESS COMPONENTS:', place.addressComponents);
    console.log('FORMATTED:', place.formattedAddress);

    // Log each component to see exact structure
    place.addressComponents?.forEach(c => {
      console.log('COMPONENT:', c.types, '→ longText:', c.longText, '| long_name:', c.long_name);
    });

    const getComponent = (type) => {
      const component = place.addressComponents?.find(c => c.types?.includes(type));
      return component?.longText || component?.long_name || '';
    };

    const getShort = (type) => {
      const component = place.addressComponents?.find(c => c.types?.includes(type));
      return component?.shortText || component?.short_name || '';
    };

    const city = getComponent('locality')
      || getComponent('sublocality_level_1')
      || getComponent('sublocality')
      || getComponent('administrative_area_level_2')
      || getComponent('neighborhood')
      || getComponent('postal_town');

    const result = {
      street: `${getComponent('street_number')} ${getComponent('route')}`.trim(),
      city,
      state: getShort('administrative_area_level_1'),
      zip: getComponent('postal_code'),
      fullAddress: place.formattedAddress,
    };
    console.log('PARSED RESULT:', result);

    onAddressSelect(result);
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
      includedRegionCodes: ['us'],
    });

    const container = containerRef.current;
    console.log('PlaceAutocompleteElement created:', placeAutocomplete);
    console.log('Element tag:', placeAutocomplete.tagName);

    // Listen for both possible event names
    placeAutocomplete.addEventListener('gmp-placeselect', handlePlaceSelect);
    placeAutocomplete.addEventListener('gmp-select', (e) => {
      console.log('gmp-select FIRED (alt event):', e);
    });

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
