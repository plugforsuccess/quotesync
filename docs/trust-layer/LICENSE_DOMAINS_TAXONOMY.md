# License Domains Taxonomy

**Canonical Taxonomy of Regulated Authority Scopes**

---

## Introduction

This document defines **License Domains** (also referred to as **Authority Domains**) — the regulated scopes within which licensed actors may operate.

License Domains replace the term "lines of business." This terminology shift is intentional:

- **Lines of business** implies products and carriers
- **License Domains** implies regulated authority scope

Trust Layer is authority-focused, not product-focused.

---

## What Is a License Domain?

A License Domain represents a **regulated category of professional authority**.

License Domains are:
- Defined by regulatory bodies (state DOIs, FINRA, SEC, etc.)
- Tied to specific license types
- Scoped by jurisdiction
- Independent of specific products or carriers

License Domains answer: **"What category of professional activity is this actor authorized to perform?"**

---

## Taxonomy Structure

Trust Layer organizes License Domains into tiers based on implementation priority and regulatory complexity:

```
Tier 1: Insurance (v1 Primary Focus)
├── Property & Casualty
├── Life
├── Accident & Health
├── Personal Lines (alias)
└── Commercial Lines (alias)

Tier 2: Financial Services (Declared, not enforced)
├── Securities
├── Investment Advisory
├── Annuities
├── Mortgage Origination
├── Public Adjuster
└── Claims Adjuster

Tier 3: Other Regulated Actors (Future)
├── Notary
├── Real Estate Brokerage
├── Tax Preparation
└── Legal Representation
```

---

## Tier 1: Insurance

Primary focus for Trust Layer v1.

### Property & Casualty (P&C)

**Regulatory Authority:** State Departments of Insurance

**License Types:**
- Property License
- Casualty License
- Property & Casualty License (combined)

**Scope:**
- Property insurance (homeowners, renters, commercial property)
- Casualty insurance (auto, liability, workers' compensation)
- Multi-peril policies

**Common Aliases:**
- Personal Lines (consumer-focused P&C)
- Commercial Lines (business-focused P&C)

---

### Life

**Regulatory Authority:** State Departments of Insurance

**License Types:**
- Life Insurance License
- Life & Health License (combined in many states)

**Scope:**
- Term life insurance
- Whole life insurance
- Universal life insurance
- Variable life insurance (may require securities license)

---

### Accident & Health

**Regulatory Authority:** State Departments of Insurance

**License Types:**
- Health Insurance License
- Accident & Health License
- Life & Health License (combined)
- Health & Sickness License (state-specific terminology)

**Scope:**
- Major medical insurance
- Supplemental health insurance
- Disability insurance
- Long-term care insurance
- Medicare supplements

---

### Personal Lines

**Classification:** Alias of Property & Casualty

**Scope:**
Subset of P&C focused on individual/consumer coverage:
- Personal auto
- Homeowners
- Renters
- Personal umbrella

---

### Commercial Lines

**Classification:** Alias of Property & Casualty

**Scope:**
Subset of P&C focused on business/entity coverage:
- Commercial property
- General liability
- Professional liability (E&O)
- Workers' compensation
- Commercial auto
- Business owner's policy (BOP)

---

## Tier 2: Financial Services

Declared for conceptual completeness. Not enforced in v1.

### Securities

**Regulatory Authority:** FINRA, SEC, State Securities Regulators

**License Types:**
- Series 6 (Investment Company Products)
- Series 7 (General Securities Representative)
- Series 63 (State Law)
- Series 65 (Investment Advisor Representative)
- Series 66 (Combined 63/65)

**Scope:**
- Stocks and bonds
- Mutual funds
- Variable annuities (requires both insurance and securities licenses)
- Exchange-traded funds (ETFs)

---

### Investment Advisory

**Regulatory Authority:** SEC, State Securities Regulators

**License Types:**
- Registered Investment Advisor (RIA)
- Investment Advisor Representative (IAR)

**Scope:**
- Investment advice for compensation
- Portfolio management
- Financial planning (when including investment advice)

---

### Annuities

**Regulatory Authority:** State Departments of Insurance (fixed), FINRA/SEC (variable)

**License Types:**
- Life Insurance License (fixed annuities)
- Securities License (variable annuities)

**Scope:**
- Fixed annuities
- Fixed indexed annuities
- Variable annuities
- Immediate annuities
- Deferred annuities

---

### Mortgage Origination

**Regulatory Authority:** NMLS, State Banking/Financial Regulators

**License Types:**
- Mortgage Loan Originator (MLO) License

**Scope:**
- Residential mortgage origination
- Mortgage brokering
- Loan modification

---

### Public Adjuster

**Regulatory Authority:** State Departments of Insurance

**License Types:**
- Public Adjuster License

**Scope:**
- Claims advocacy for policyholders
- Loss assessment
- Settlement negotiation

---

### Claims Adjuster

**Regulatory Authority:** State Departments of Insurance

**License Types:**
- Independent Adjuster License
- Company Adjuster License (some states)
- Catastrophe Adjuster License

**Scope:**
- Claims investigation
- Damage assessment
- Settlement recommendation

---

## Tier 3: Other Regulated Actors

Future consideration. Not in v1 scope.

### Notary

**Regulatory Authority:** Secretary of State (varies by state)

**License Types:**
- Notary Public Commission
- Remote Online Notary (RON) Authorization

**Scope:**
- Witnessing signatures
- Administering oaths
- Certifying documents

---

### Real Estate Brokerage

**Regulatory Authority:** State Real Estate Commissions

**License Types:**
- Real Estate Salesperson License
- Real Estate Broker License

**Scope:**
- Property sales representation
- Property purchase representation
- Lease negotiation

---

### Tax Preparation

**Regulatory Authority:** IRS (federal), State Tax Authorities

**License Types:**
- PTIN (Preparer Tax Identification Number)
- Enrolled Agent (EA)
- CPA License (state-issued)

**Scope:**
- Tax return preparation
- Tax planning advice
- IRS representation (Enrolled Agents and CPAs)

---

### Legal Representation

**Regulatory Authority:** State Bar Associations

**License Types:**
- Bar Admission

**Scope:**
- Trust Layer scope limited to **attorney verification only**
- Does not extend to legal practice management
- Verification that an individual is a licensed attorney in good standing

---

## Domain Relationships

Some interactions require authority across multiple domains:

| Interaction | Required Domains |
|-------------|------------------|
| Variable life insurance sale | Life + Securities |
| Variable annuity sale | Annuities + Securities |
| Insurance-linked investment advice | P&C or Life + Investment Advisory |
| Mortgage with title insurance | Mortgage Origination + P&C |

Trust Layer evaluates each domain independently. The platform determines whether combined authority is sufficient.

---

## v1 Implementation Scope

Trust Layer v1 declares this full taxonomy.

v1 enforcement is limited to:
- **Property & Casualty** (implicit in agency operations)
- Domain is inferred from platform context
- No explicit domain selection or validation

Future versions may implement:
- Explicit domain tagging on actors
- Multi-domain authority verification
- Domain-specific interaction rules

---

## Terminology Reference

| Legacy Term | Trust Layer Term |
|-------------|------------------|
| Lines of business | License Domains |
| Product types | Authority Scopes |
| Carrier appointments | Authority Sources |
| Licensed agent | Licensed Professional |

---

## Related Documentation

- [Trust Layer Platform](./TRUST_LAYER_PLATFORM.md) — Platform overview
- [Authority Verification Model](./AUTHORITY_VERIFICATION_MODEL.md) — Trust evaluation model
- [Interaction Context Reference](./INTERACTION_CONTEXT_REFERENCE.md) — Interaction types
