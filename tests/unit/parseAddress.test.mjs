import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAddressComponents } from '../../src/utils/parseAddress.js';

// Helper: build a component with types
function comp(types, longText, shortText) {
  return { types, longText, shortText: shortText ?? longText };
}

test('standard US residential address', () => {
  const comps = [
    comp(['street_number'], '123'),
    comp(['route'], 'Peachtree Street NE'),
    comp(['locality'], 'Atlanta'),
    comp(['administrative_area_level_1'], 'Georgia', 'GA'),
    comp(['postal_code'], '30309'),
    comp(['country'], 'United States', 'US'),
  ];
  const result = parseAddressComponents(comps, '123 Peachtree Street NE, Atlanta, GA 30309');
  assert.equal(result.street1, '123 Peachtree Street NE');
  assert.equal(result.street2, undefined);
  assert.equal(result.city, 'Atlanta');
  assert.equal(result.state, 'GA');
  assert.equal(result.zip, '30309');
  assert.equal(result.country, 'US');
});

test('missing street_number (route only)', () => {
  const comps = [
    comp(['route'], 'Rural Route 4'),
    comp(['locality'], 'Moultrie'),
    comp(['administrative_area_level_1'], 'Georgia', 'GA'),
    comp(['postal_code'], '31768'),
    comp(['country'], 'United States', 'US'),
  ];
  const result = parseAddressComponents(comps);
  assert.equal(result.street1, 'Rural Route 4');
  assert.equal(result.city, 'Moultrie');
});

test('premise fallback (PO Box / named building)', () => {
  const comps = [
    comp(['premise'], 'PO Box 1234'),
    comp(['locality'], 'Savannah'),
    comp(['administrative_area_level_1'], 'Georgia', 'GA'),
    comp(['postal_code'], '31401'),
    comp(['country'], 'United States', 'US'),
  ];
  const result = parseAddressComponents(comps);
  assert.equal(result.street1, 'PO Box 1234');
});

test('subpremise maps to street2', () => {
  const comps = [
    comp(['street_number'], '500'),
    comp(['route'], 'Piedmont Ave NE'),
    comp(['subpremise'], 'Suite 200'),
    comp(['locality'], 'Atlanta'),
    comp(['administrative_area_level_1'], 'Georgia', 'GA'),
    comp(['postal_code'], '30308'),
    comp(['country'], 'United States', 'US'),
  ];
  const result = parseAddressComponents(comps);
  assert.equal(result.street1, '500 Piedmont Ave NE');
  assert.equal(result.street2, 'Suite 200');
});

test('city falls back to postal_town', () => {
  const comps = [
    comp(['street_number'], '10'),
    comp(['route'], 'High Street'),
    comp(['postal_town'], 'Camberley'),
    comp(['administrative_area_level_1'], 'England', 'England'),
    comp(['postal_code'], 'GU15 3SY'),
    comp(['country'], 'United Kingdom', 'GB'),
  ];
  const result = parseAddressComponents(comps);
  assert.equal(result.city, 'Camberley');
});

test('city falls back to sublocality', () => {
  const comps = [
    comp(['street_number'], '42'),
    comp(['route'], 'Broadway'),
    comp(['sublocality', 'sublocality_level_1'], 'Manhattan'),
    comp(['administrative_area_level_1'], 'New York', 'NY'),
    comp(['postal_code'], '10006'),
    comp(['country'], 'United States', 'US'),
  ];
  const result = parseAddressComponents(comps);
  assert.equal(result.city, 'Manhattan');
});

test('city falls back to administrative_area_level_2', () => {
  const comps = [
    comp(['street_number'], '1'),
    comp(['route'], 'County Rd'),
    comp(['administrative_area_level_2'], 'Fulton County'),
    comp(['administrative_area_level_1'], 'Georgia', 'GA'),
    comp(['postal_code'], '30301'),
    comp(['country'], 'United States', 'US'),
  ];
  const result = parseAddressComponents(comps);
  assert.equal(result.city, 'Fulton County');
});

test('empty components returns empty strings', () => {
  const result = parseAddressComponents([]);
  assert.equal(result.street1, '');
  assert.equal(result.street2, undefined);
  assert.equal(result.city, '');
  assert.equal(result.state, '');
  assert.equal(result.zip, '');
  assert.equal(result.country, '');
});

test('formattedAddress is passed through', () => {
  const result = parseAddressComponents([], '123 Main St, Atlanta, GA 30309');
  assert.equal(result.formattedAddress, '123 Main St, Atlanta, GA 30309');
});

test('prefers shortText for state and country', () => {
  const comps = [
    comp(['administrative_area_level_1'], 'Georgia', 'GA'),
    comp(['country'], 'United States', 'US'),
  ];
  const result = parseAddressComponents(comps);
  assert.equal(result.state, 'GA');
  assert.equal(result.country, 'US');
});

test('street_number + route preferred over premise', () => {
  const comps = [
    comp(['street_number'], '100'),
    comp(['route'], 'Main St'),
    comp(['premise'], 'City Hall'),
    comp(['locality'], 'Atlanta'),
    comp(['administrative_area_level_1'], 'Georgia', 'GA'),
    comp(['postal_code'], '30303'),
    comp(['country'], 'United States', 'US'),
  ];
  const result = parseAddressComponents(comps);
  assert.equal(result.street1, '100 Main St');
});
