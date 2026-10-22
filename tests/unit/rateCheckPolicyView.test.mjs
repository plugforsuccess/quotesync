// node --test tests/unit/rateCheckPolicyView.test.mjs
// The producer view of a scanned dec page, checked against a real household's
// scan (State Farm auto + home), with personal details removed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  nameCase, addressCase, vehicleTitle, vehicleShort, formatCoverage, autoCoverageGroups, vehicleCoverages, homeCoverageRows,
  lienholderFor, usageFor, propertyFacts, endorsementsOf, remainingNotes, driverRows, discountsOf, glance, headsUp,
} from '../../src/pages/components/rate-checks/policyView.js';

const auto = {
  policy_type: 'auto',
  coverages: { pd: '100000', rental: '50/1500 (vehicles 002, 003)', um_uim: '250000/500000/100000', med_pay: null, roadside: 'H (all vehicles)', bi_per_person: '250000', bi_per_accident: '500000', coll_deductible: '1000', comp_deductible: '200' },
  vehicles: [
    { vin: 'WDDUG8CB5FA189133', make: 'MERCEDES', year: 2015, model: 'S550' },
    { vin: 'SAJBL4GX8NCY91463', make: 'JAGUAR', year: 2022, model: 'XF' },
    { vin: 'SALYM2FU0MA324586', make: 'LAND ROVER', year: 2021, model: 'VELAR' },
  ],
  drivers: [{ age: 58, name: 'JOCELYN PEARSON' }, { age: 22, name: 'STEPHEN PEARSON' }, { age: 60, name: 'STEPHEN PEARSON' }],
  surcharges: [], claims: [],
  extracted: {
    notes: 'Policy period is approximately 5.7 months (February 4, 2026 to July 25, 2026). This is a mid-term endorsement adding a vehicle to an existing multicar policy. The page notes that beginning at next renewal all vehicles will be renewed for full policy term. Usage is stated as "To work, school, or pleasure" for all vehicles. There appear to be two people named Stephen Pearson (ages 22 and 60) plus Jocelyn Pearson (age 58). TD Auto Finance listed as creditor for Vehicle 003.',
    discounts: ['Multicar (because you insure more than one vehicle with us)', 'Multiple Lines (because you also have Homeowners with us)', 'Vehicle Safety (because your vehicle has important safety features)', 'Tenure (because you have been a loyal auto customer for 2 years)', 'Accident Free for the last 2 years', 'Good Student Discount (because 1 of 1 drivers have qualified)'],
  },
};

const home = {
  policy_type: 'home',
  coverages: { med_pay: '$1,000', dwelling: '$1,130,300', liability: '$100,000', deductible: '$11,303', loss_of_use: '$339,090', other_structures: '$113,030', personal_property: '$847,725' },
  vehicles: [], drivers: [], claims: [],
  extracted: {
    notes: 'Policy lists multiple endorsements including Option ID - Increased Dwelling up to $226,060, Option OL - Ordinance/Law 10%/$113,030, Option JF - Jewelry and Furs, HO-2465 Fungus (Incl Mold) Liability, HO-2584 Fungus (Incl Mold) Limited Cov, HO-2444.2 Back-Up Of Sewer Or Drain 5% of Coverage A/$56,515, and HO-2231.3 Amendatory Endorsement. Construction is Masonry Veneer, Year Built 2023, Roof Material Composition Shingle. Mortgage held by SELECT PORTFOLIO SERVICING INC with Loan Number 0031397854. Premium to be paid by mortgagee.',
    discounts: ['Utility Rating Credit', 'Home Alert Discount', 'Home/Auto Discount', 'Claim Record Discount', 'Loyal Customer'],
  },
};

test('names and vehicles read in normal case', () => {
  assert.equal(nameCase('JOCELYN PEARSON'), 'Jocelyn Pearson');
  assert.equal(nameCase("MARY O'NEIL-SMITH"), "Mary O'Neil-Smith");
  assert.equal(addressCase('255 WALTHAM WAY, FAYETTEVILLE GA 30214-3536'), '255 Waltham Way, Fayetteville GA 30214-3536');
  assert.equal(addressCase('88 RIDGE RD NW, ATLANTA, GA 30327'), '88 Ridge Rd NW, Atlanta, GA 30327');
  assert.equal(vehicleTitle(auto.vehicles[0]), '2015 Mercedes S550');
  assert.equal(vehicleTitle(auto.vehicles[2]), '2021 Land Rover Velar');
  assert.equal(vehicleShort(auto.vehicles[1]), '’22 Jaguar XF');
});

test('limits read like money', () => {
  assert.equal(formatCoverage('250000/500000/100000', 'um_uim').value, '$250k / $500k / $100k');
  assert.equal(formatCoverage('100/300', 'um_uim').value, '$100k / $300k');
  assert.equal(formatCoverage('100000', 'pd').value, '$100,000');
  assert.equal(formatCoverage('50/1500', 'rental').value, '$50/day · $1,500 max');
  assert.equal(formatCoverage('H (all vehicles)', 'roadside').value, 'Included (H)');
  assert.equal(formatCoverage(null, 'med_pay'), null);
});

test('auto coverages are grouped, and vehicle-specific ones move to the vehicle', () => {
  const [liab, every] = autoCoverageGroups(auto);
  assert.deepEqual(liab.rows.map(r => [r.label, r.value]), [
    ['Bodily injury', '$250k / $500k'],
    ['Property damage', '$100,000'],
    ['Uninsured motorist', '$250k / $500k / $100k'],
    ['Medical payments', 'None listed'],
  ]);
  assert.equal(every.title, 'Every vehicle');
  assert.deepEqual(every.rows.map(r => [r.label, r.value]), [['Comprehensive', '$200'], ['Collision', '$1,000'], ['Roadside', 'Included (H)']]);
  assert.deepEqual(vehicleCoverages(auto, 0), []);
  assert.deepEqual(vehicleCoverages(auto, 1).map(r => [r.label, r.value]), [['Rental', '$50/day · $1,500 max']]);
  assert.equal(vehicleCoverages(auto, 2).length, 1);
});

test('lienholder and usage land on the right vehicle', () => {
  assert.equal(lienholderFor(auto, 0), null);
  assert.equal(lienholderFor(auto, 2), 'TD Auto Finance');
  assert.equal(usageFor(auto, 1), 'To work, school, or pleasure');
});

test('drivers with the same name are told apart; discounts are short tags', () => {
  assert.deepEqual(driverRows(auto).map(d => d.name), ['Jocelyn Pearson', 'Stephen Pearson (22)', 'Stephen Pearson (60)']);
  assert.equal(driverRows(auto)[1].young, true);
  assert.deepEqual(discountsOf(auto), ['Multicar', 'Multiple Lines', 'Vehicle Safety', 'Tenure 2 yrs', 'Accident Free 2 yrs', 'Good Student']);
  assert.deepEqual(discountsOf(home), ['Utility Rating Credit', 'Home Alert', 'Home/Auto', 'Claim Record', 'Loyal Customer']);
  assert.deepEqual(discountsOf({ extracted: { discounts: ['Drive Safe &amp; Save'] } }), ['Drive Safe & Save']);
});

test('home: coverages A–F, % deductible, property facts and endorsements', () => {
  assert.deepEqual(homeCoverageRows(home).map(r => r.label), [
    'Dwelling (A)', 'Other structures (B)', 'Personal property (C)', 'Loss of use (D)', 'Personal liability (E)', 'Medical payments (F)', 'Deductible',
  ]);
  assert.equal(homeCoverageRows(home).find(r => r.key === 'deductible').note, '1% of dwelling');
  const p = propertyFacts(home);
  assert.equal(p.year_built, 2023);
  assert.equal(p.construction, 'Masonry Veneer');
  assert.equal(p.roof_material, 'Composition Shingle');
  assert.equal(p.mortgagee, 'Select Portfolio Servicing Inc');
  assert.equal(p.loan_number, '0031397854');
  assert.equal(p.paid_by_mortgagee, true);
  const e = endorsementsOf(home);
  assert.equal(e.length, 7);
  assert.deepEqual(e[0], { code: 'Option ID', name: 'Increased Dwelling', limit: 'up to $226,060' });
  assert.deepEqual(e[5], { code: 'HO-2444.2', name: 'Back-Up Of Sewer Or Drain', limit: '5% of Coverage A/$56,515' });
  assert.deepEqual(e[6], { code: 'HO-2231.3', name: 'Amendatory Endorsement', limit: null });
});

test('what is left of the notes is only what no field shows', () => {
  assert.deepEqual(remainingNotes(home), []);
  assert.deepEqual(remainingNotes(auto), [
    'Policy period is approximately 5.7 months (February 4, 2026 to July 25, 2026).',
    'This is a mid-term endorsement adding a vehicle to an existing multicar policy.',
    'The page notes that beginning at next renewal all vehicles will be renewed for full policy term.',
  ]);
  assert.deepEqual(headsUp({ ...auto, summary: 'Mid-term change.' }), ['Mid-term change.']);
});

test('at a glance', () => {
  assert.deepEqual(glance(auto).map(c => c.text), ['3 vehicles', '3 drivers', 'Driver age 22', '$250k / $500k liability', '1 financed']);
  assert.deepEqual(glance(home).map(c => c.text), ['$1.13M dwelling', '$100k liability', 'Built 2023', 'Masonry Veneer', 'Composition Shingle roof', 'Paid from escrow']);
});
