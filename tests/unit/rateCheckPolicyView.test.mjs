// node --test tests/unit/rateCheckPolicyView.test.mjs
// The producer view of a scanned dec page, checked against a real household's
// scan (State Farm auto + home), with personal details removed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  caps, insuredName, vehicleTitle, vehicleShort, formatCoverage, autoCoverageGroups, vehicleCoverages, homeCoverageRows,
  lienholderFor, propertyFacts, endorsementsOf, remainingNotes, driverRows, discountsOf, headsUp, insuredFirstNames, vehiclesNewestFirst, vehicleQuestions, vehicleCoverageSetup, summaryLines, dateSpan,
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
    insured_name: 'PEARSON, STEPHEN & JOCELYN',
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

test('data reads in capitals; name on policy is first name then last name', () => {
  assert.equal(insuredName('PEARSON, STEPHEN & JOCELYN'), 'STEPHEN & JOCELYN PEARSON');
  assert.equal(insuredName('Pearson, Stephen J'), 'STEPHEN J PEARSON');
  assert.equal(insuredName('PEARSON JR, STEPHEN'), 'STEPHEN PEARSON JR');
  assert.equal(insuredName('Keisha T. Example'), 'KEISHA T. EXAMPLE');
  assert.equal(caps('255 Waltham Way,  Fayetteville Ga 30214'), '255 WALTHAM WAY, FAYETTEVILLE GA 30214');
  assert.equal(vehicleTitle(auto.vehicles[0]), '2015 Mercedes S550');
  assert.equal(vehicleTitle({ year: 2021, make: 'Land Rover', model: 'Velar' }), '2021 Land Rover Velar');
  assert.equal(vehicleShort(auto.vehicles[1]), '2022 Jaguar XF');
  assert.equal(insuredName('STEPHEN PEARSON, JOCELYN PEARSON'), 'STEPHEN & JOCELYN PEARSON');
  assert.equal(insuredName('Stephen Pearson, Jocelyn Smith'), 'STEPHEN PEARSON & JOCELYN SMITH');
  assert.equal(insuredName('PEARSON JR, STEPHEN'), 'STEPHEN PEARSON JR');
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
    ['Medical payments', 'None listed'],
    ['Uninsured motorist', '$250k / $500k / $100k'],
  ]);
  const withDed = autoCoverageGroups({ ...auto, coverages: { ...auto.coverages, um_uim: '250000/500000/100000 (PD Deductible $250)' } })[0];
  assert.deepEqual([withDed.rows[3].value, withDed.rows[3].note], ['$250k / $500k / $100k', 'Deductible $250']);
  assert.equal(every.title, 'Every vehicle');
  assert.deepEqual(every.rows.map(r => [r.label, r.value]), [['Comprehensive', '$200'], ['Collision', '$1,000'], ['Roadside', 'Included (H)']]);
  assert.deepEqual(vehicleCoverages(auto, 0), []);
  assert.deepEqual(vehicleCoverages(auto, 1).map(r => [r.label, r.value, r.addOn]), [['Rental', '$50/day · $1,500 max', true]]);
  assert.deepEqual(every.rows.map(r => r.addOn), [false, false, true]); // roadside is an add-on
  assert.equal(vehicleCoverages(auto, 2).length, 1);
});

test('drivers: named insured, spouse, then the rest oldest to youngest', () => {
  assert.deepEqual(insuredFirstNames('PEARSON, STEPHEN & JOCELYN'), ['stephen', 'jocelyn']);
  assert.deepEqual(insuredFirstNames('Stephen and Jocelyn Pearson'), ['stephen', 'jocelyn']);
  assert.deepEqual(insuredFirstNames('Keisha T. Example'), ['keisha']);
  const fam = {
    extracted: { insured_name: 'DANA REYES' },
    drivers: [{ name: 'MAYA REYES', age: 16 }, { name: 'LUIS REYES', age: 44, status: 'Spouse' }, { name: 'ANA REYES', age: 19 }, { name: 'DANA REYES', age: 45 }],
  };
  assert.deepEqual(driverRows(fam).map(d => d.name), ['DANA REYES', 'LUIS REYES', 'ANA REYES', 'MAYA REYES']);
  // No name on the policy: oldest first.
  assert.deepEqual(driverRows({ drivers: fam.drivers }).map(d => d.age), [45, 44, 19, 16]);
});

test('lienholder lands on the right vehicle, and its payoff year is flagged to ask', () => {
  assert.equal(lienholderFor(auto, 0), null);
  assert.equal(lienholderFor(auto, 2), 'TD AUTO FINANCE');
  assert.deepEqual(vehicleQuestions(auto), ['Loan payoff year for the 2021 Land Rover Velar']);
});

test('vehicles newest to oldest, keeping their original index', () => {
  assert.deepEqual(vehiclesNewestFirst(auto).map(({ v, index }) => [v.year, index]), [[2022, 1], [2021, 2], [2015, 0]]);
  assert.deepEqual(vehiclesNewestFirst({ vehicles: [{ year: null }, { year: 2019 }] }).map(x => x.index), [1, 0]);
});

test('drivers with the same name are told apart; discounts are short tags', () => {
  assert.deepEqual(driverRows(auto).map(d => d.name), ['STEPHEN PEARSON (60)', 'JOCELYN PEARSON', 'STEPHEN PEARSON (22)']);
  assert.deepEqual(driverRows(auto).map(d => d.role), ['insured', 'spouse', null]);
  assert.equal(driverRows(auto)[2].young, true);
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
  assert.equal(p.construction, 'Masonry Veneer'); // shown in capitals by the sheet
  assert.equal(p.roof_material, 'Composition Shingle');
  assert.equal(p.mortgagee, 'SELECT PORTFOLIO SERVICING INC');
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

test('summary names vehicles instead of page numbers', () => {
  assert.deepEqual(
    headsUp({ ...auto, summary: 'Mid-term change adding a car (Vehicle 003); short term.' }),
    ['Mid-term change adding a car (2021 Land Rover Velar); short term.'],
  );
  assert.deepEqual(
    headsUp({ ...auto, summary: 'Adds Vehicle 003 (2021 Land Rover Velar) mid-term.' }),
    ['Adds 2021 Land Rover Velar mid-term.'],
  );
});

test('vehicle coverages group vehicles that share a value', () => {
  const { vehicles, coverages } = vehicleCoverageSetup(auto);
  assert.deepEqual(vehicles.map(v => [v.index, v.level]), [[1, 'full'], [2, 'full'], [0, 'full']]);
  const by = Object.fromEntries(coverages.map(c => [c.key, c]));
  assert.equal(by.comp_deductible.same, true);
  assert.equal(by.comp_deductible.groups[0].value, '$200');
  assert.equal(by.coll_deductible.same, true);
  assert.equal(by.roadside.same, true);
  assert.equal(by.rental.same, false);
  assert.deepEqual(by.rental.groups, [{ value: '$50/day · $1,500 max', indexes: [1, 2] }]);
  assert.deepEqual(by.rental.none, [0]);

  const liabilityCar = { ...auto, coverages: { ...auto.coverages, comp_deductible: '200 (vehicles 002, 003)', coll_deductible: '1000 (vehicles 002, 003)' } };
  const lc = vehicleCoverageSetup(liabilityCar);
  assert.equal(lc.vehicles.find(v => v.index === 0).level, 'liability');
  // The liability-only car doesn't break the deductible match.
  const comp = lc.coverages.find(c => c.key === 'comp_deductible');
  assert.deepEqual([comp.same, comp.count, comp.scope, comp.none], [true, 2, 'full-coverage', []]);
});


test('summary: short term and renewal computed from the dates', () => {
  const rc = { ...auto, effective_date: '2026-02-04', expiration_date: '2026-07-25', term_months: 6, summary: 'The Velar was added mid-term.' };
  assert.equal(dateSpan('2026-02-04', '2026-07-25'), '2/4/2026 to 7/25/2026');
  assert.equal(dateSpan('2025-12-01', '2026-06-01'), '12/1/2025 to 6/1/2026');
  assert.deepEqual(summaryLines(rc, new Date('2026-07-13T12:00:00')), [
    { tag: 'Short term', text: '2/4/2026 to 7/25/2026 (5.6 months).' },
    { tag: 'Renews', text: '7/25/2026 (in 12 days).' },
    { tag: 'Note', text: 'The Velar was added mid-term.' },
  ]);
  // A full 6-month term is not flagged; an expired policy says so.
  const full = summaryLines({ ...rc, effective_date: '2026-06-01', expiration_date: '2026-12-01', summary: null, extracted: { notes: null } }, new Date('2026-12-10T12:00:00'));
  assert.deepEqual(full, [{ tag: 'Expired', text: '12/1/2026 (9 days ago).' }]);
});
