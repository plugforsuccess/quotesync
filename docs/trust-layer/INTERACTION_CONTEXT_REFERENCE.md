# Interaction Context Reference

**Taxonomy of Trust-Evaluated Interactions**

---

## Introduction

This document defines **Interaction Contexts** — the types of interactions that Trust Layer evaluates for authority verification.

Interaction Context is the bridge between authority and action. It answers:

> **"What is this actor trying to do?"**

Trust is evaluated **per interaction context**. An actor may be trusted for one interaction and not another.

---

## What Is an Interaction Context?

An Interaction Context represents a **specific type of action** that requires authority verification.

Interaction Contexts are:
- Atomic (one context per evaluation)
- Mapped to required authority types
- Scoped by License Domain
- Evaluated against actor credentials

---

## Context Categories

Trust Layer organizes Interaction Contexts into categories based on workflow stage and authority requirements.

```
Insurance Lifecycle
├── Discovery & Quoting
├── Policy Binding
├── Policy Servicing
├── Claims Handling
└── Document Management

Financial Services
├── Advisory Interactions
├── Transaction Execution
└── Account Management

Platform Operations
├── Lead Management
├── Agency Operations
└── Compliance & Audit
```

---

## Insurance Lifecycle Contexts

### Discovery & Quoting

Interactions during the quote/discovery phase.

| Context | Description | Typical Authority |
|---------|-------------|-------------------|
| `policy_quote` | Generate or present a quote | Licensed Agent/Broker |
| `quote_comparison` | Compare multiple quotes | Licensed Agent/Broker |
| `needs_analysis` | Assess coverage needs | Licensed Agent/Broker |
| `product_explanation` | Explain coverage options | Licensed Agent/Broker |

---

### Policy Binding

Interactions that commit coverage.

| Context | Description | Typical Authority |
|---------|-------------|-------------------|
| `policy_bind` | Bind coverage / issue policy | Licensed Agent with Binding Authority |
| `policy_modification` | Modify existing coverage | Licensed Agent |
| `policy_renewal` | Renew existing policy | Licensed Agent |
| `policy_cancellation` | Cancel or non-renew policy | Licensed Agent |

---

### Policy Servicing

Ongoing policy administration.

| Context | Description | Typical Authority |
|---------|-------------|-------------------|
| `policy_review` | Review existing coverage | Licensed Agent/Broker, Delegate |
| `endorsement_request` | Request policy changes | Licensed Agent, Policyholder |
| `certificate_issuance` | Issue certificates of insurance | Licensed Agent, Delegate |
| `billing_inquiry` | Address billing questions | Licensed Agent, Delegate, CSR |
| `payment_processing` | Process premium payments | Licensed Agent, Delegate, System |

---

### Claims Handling

Claims-related interactions.

| Context | Description | Typical Authority |
|---------|-------------|-------------------|
| `claims_assistance` | Assist with claim filing | Licensed Agent, Claims Adjuster |
| `claims_investigation` | Investigate claim details | Claims Adjuster |
| `claims_negotiation` | Negotiate settlement | Claims Adjuster, Public Adjuster |
| `claims_advocacy` | Advocate for policyholder | Public Adjuster |
| `loss_assessment` | Assess damage/loss | Claims Adjuster |

---

### Document Management

Document-related interactions.

| Context | Description | Typical Authority |
|---------|-------------|-------------------|
| `document_exchange` | Exchange policy documents | Licensed Agent, Delegate |
| `document_signing` | Execute binding documents | Licensed Agent with Signing Authority |
| `document_notarization` | Notarize documents | Notary Public |
| `disclosure_delivery` | Deliver required disclosures | Licensed Agent |

---

## Financial Services Contexts

Declared for conceptual completeness. Not enforced in v1.

### Advisory Interactions

| Context | Description | Typical Authority |
|---------|-------------|-------------------|
| `financial_advice` | Provide investment/financial advice | RIA, IAR, CFP |
| `portfolio_review` | Review investment portfolio | RIA, IAR |
| `retirement_planning` | Retirement planning consultation | Licensed Professional |
| `risk_assessment` | Assess financial risk tolerance | Licensed Professional |

---

### Transaction Execution

| Context | Description | Typical Authority |
|---------|-------------|-------------------|
| `securities_trade` | Execute securities transaction | Series 6/7 Representative |
| `annuity_sale` | Sell annuity product | Life License + Securities (if variable) |
| `fund_transfer` | Transfer funds between accounts | Authorized Representative |

---

### Account Management

| Context | Description | Typical Authority |
|---------|-------------|-------------------|
| `account_access` | Access account information | Account Owner, Delegate |
| `account_modification` | Modify account settings | Account Owner, Authorized Representative |
| `beneficiary_change` | Change beneficiary designation | Account Owner |

---

## Platform Operations Contexts

Internal platform interactions.

### Lead Management

| Context | Description | Typical Authority |
|---------|-------------|-------------------|
| `lead_view` | View lead information | Agent Role |
| `lead_assignment` | Assign lead to agent | Owner/Manager Role |
| `lead_update` | Update lead status | Agent Role |
| `lead_routing` | Configure routing rules | Owner/Admin Role |

---

### Agency Operations

| Context | Description | Typical Authority |
|---------|-------------|-------------------|
| `agency_management` | Manage agency settings | Owner Role |
| `member_invitation` | Invite new agency members | Owner Role |
| `role_assignment` | Assign roles to members | Owner Role |
| `agency_reporting` | View agency reports | Owner/Manager Role |

---

### Compliance & Audit

| Context | Description | Typical Authority |
|---------|-------------|-------------------|
| `audit_access` | Access audit logs | Auditor Role |
| `compliance_export` | Export compliance data | Auditor Role |
| `impersonation_session` | Impersonate for troubleshooting | Platform Admin |

---

## Context-to-Authority Mapping

Each Interaction Context maps to required authority:

```
┌────────────────────┐     ┌─────────────────┐
│ Interaction Context│────▶│ Required        │
│                    │     │ Authority Type  │
└────────────────────┘     └─────────────────┘
         │                          │
         │                          ▼
         │                 ┌─────────────────┐
         │                 │ License Domain  │
         │                 └─────────────────┘
         │                          │
         ▼                          ▼
┌────────────────────┐     ┌─────────────────┐
│ Jurisdiction       │────▶│ Actor Authority │
│ (Where?)           │     │ (Verified)      │
└────────────────────┘     └─────────────────┘
```

**Example:**

| Context | Authority Type | License Domain | Jurisdiction |
|---------|----------------|----------------|--------------|
| `policy_bind` | Licensed Agent | P&C | CA |
| | ↓ | | |
| | Actor must hold: CA P&C License + Binding Authority | |

---

## Context Hierarchy

Some contexts imply others:

```
policy_bind
├── implies: policy_quote (can quote what you can bind)
├── implies: policy_review (can review what you can bind)
└── implies: document_exchange (can exchange related documents)

claims_negotiation
├── implies: claims_assistance
└── implies: loss_assessment
```

Trust Layer does not enforce hierarchy in v1. Platforms may implement context inheritance.

---

## Context Restrictions

Authority may be restricted to specific contexts:

| Restriction Type | Description |
|-----------------|-------------|
| Context whitelist | Actor can only perform listed contexts |
| Context blacklist | Actor cannot perform listed contexts |
| Conditional context | Context available only under conditions |
| Delegated context | Context available only when delegating actor is present |

---

## v1 Implementation Scope

Trust Layer v1 implements:

| Context Category | v1 Scope |
|------------------|----------|
| Lead Management | Enforced via role permissions |
| Agency Operations | Enforced via role permissions |
| Compliance & Audit | Enforced via role permissions |
| Insurance Lifecycle | Not enforced (declared only) |
| Financial Services | Not enforced (declared only) |

Interaction Context in v1 is implicit, derived from:
- Feature access (which page/function)
- Role permissions (what the role allows)
- RLS policies (what the database permits)

Future versions may implement:
- Explicit context declaration per API call
- Context-specific authority requirements
- Context audit logging

---

## Related Documentation

- [Trust Layer Platform](./TRUST_LAYER_PLATFORM.md) — Platform overview
- [Authority Verification Model](./AUTHORITY_VERIFICATION_MODEL.md) — Trust evaluation model
- [License Domains Taxonomy](./LICENSE_DOMAINS_TAXONOMY.md) — Authority scope taxonomy
