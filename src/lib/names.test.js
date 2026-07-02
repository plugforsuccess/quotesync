/**
 * Unit tests for name display helpers.
 * Run with: npx vitest src/lib/names.test.js
 */
import { describe, it, expect } from 'vitest';
import { titleCaseName, displayName } from './names';

describe('titleCaseName', () => {
  it('title-cases screaming-caps carrier names', () => {
    expect(titleCaseName('JONATHAN BLACKSHEAR')).toBe('Jonathan Blackshear');
  });

  it('leaves already-mixed-case names untouched', () => {
    expect(titleCaseName('McDonald')).toBe('McDonald');
    expect(titleCaseName('DeLuca')).toBe('DeLuca');
  });
});

describe('displayName', () => {
  it('title-cases a real name', () => {
    expect(displayName('BREANNA BONILLA')).toBe('Breanna Bonilla');
  });

  it('collapses blanks and whitespace to empty', () => {
    expect(displayName('')).toBe('');
    expect(displayName('   ')).toBe('');
    expect(displayName(null)).toBe('');
    expect(displayName(undefined)).toBe('');
  });

  it('collapses stringified nulls to empty (the stray "Undefined" bug)', () => {
    // A customer_name of the literal string "UNDEFINED" used to title-case to
    // "Undefined" and render as if it were a real customer.
    expect(displayName('UNDEFINED')).toBe('');
    expect(displayName('undefined')).toBe('');
    expect(displayName('Null')).toBe('');
    expect(displayName('null')).toBe('');
  });
});
