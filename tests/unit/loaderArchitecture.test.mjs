import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../..');

// ── Guard: Google Maps must be loaded via the loader singleton, not a script tag ──

test('index.html must not contain an eager Google Maps script tag', () => {
  const html = readFileSync(resolve(root, 'index.html'), 'utf8');
  const hasEagerScript = /maps\.googleapis\.com\/maps\/api\/js/.test(html);
  assert.equal(
    hasEagerScript,
    false,
    'index.html must not load Google Maps via a <script> tag — use the @googlemaps/js-api-loader singleton instead'
  );
});

test('AddressAutocomplete must import from googleMapsLoader', () => {
  const src = readFileSync(
    resolve(root, 'src/components/AddressAutocomplete.jsx'),
    'utf8'
  );
  assert.match(
    src,
    /from\s+["']\.\/googleMapsLoader["']/,
    'AddressAutocomplete must import loadGoogleMaps from ./googleMapsLoader'
  );
});

test('AddressAutocomplete must not use window.google.maps.places directly for init', () => {
  const src = readFileSync(
    resolve(root, 'src/components/AddressAutocomplete.jsx'),
    'utf8'
  );
  // This pattern catches the old API: new window.google.maps.places.PlaceAutocompleteElement
  const usesDirectInit = /new\s+window\.google\.maps\.places\.PlaceAutocompleteElement/.test(src);
  assert.equal(
    usesDirectInit,
    false,
    'AddressAutocomplete must not construct PlaceAutocompleteElement directly — use the gmp-place-autocomplete web component via createElement'
  );
});

test('AddressAutocomplete must import parseAddressComponents', () => {
  const src = readFileSync(
    resolve(root, 'src/components/AddressAutocomplete.jsx'),
    'utf8'
  );
  assert.match(
    src,
    /from\s+["']\.\.\/utils\/parseAddress["']/,
    'AddressAutocomplete must import parseAddressComponents from ../utils/parseAddress'
  );
});

test('googleMapsLoader.js must exist and export loadGoogleMaps', () => {
  const src = readFileSync(
    resolve(root, 'src/components/googleMapsLoader.js'),
    'utf8'
  );
  assert.match(src, /export\s+function\s+loadGoogleMaps/, 'googleMapsLoader must export loadGoogleMaps');
  assert.match(src, /@googlemaps\/js-api-loader/, 'googleMapsLoader must use @googlemaps/js-api-loader');
});
