# Unified Email Capture & CRM System Architecture

## Executive Summary

This document outlines the architecture for a unified email capture and CRM system that consolidates contacts from **policy shares**, **Stripe checkout**, and **drivers ed flows** into a single contact record with email as the primary identifier.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          FRONTEND (React SPA)                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │ Email Capture│  │ Stripe       │  │ Drivers Ed   │  │ Canopy      │ │
│  │ Component    │  │ Checkout     │  │ Pre-capture  │  │ Integration │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬──────┘ │
│         │                 │                 │                 │         │
└─────────┼─────────────────┼─────────────────┼─────────────────┼─────────┘
          │                 │                 │                 │
          │    HTTPS/JSON   │                 │                 │
          ▼                 ▼                 ▼                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      BACKEND API (Node.js/Express)                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │              CONTACT ORCHESTRATION SERVICE                       │    │
│  │  ┌────────────────────────────────────────────────────────────┐ │    │
│  │  │  1. Normalize Email (lowercase, trim)                      │ │    │
│  │  │  2. Check for existing contact (email lookup)              │ │    │
│  │  │  3. Merge or Create contact record                         │ │    │
│  │  │  4. Tag source (policy_share, stripe, drivers_ed, etc.)   │ │    │
│  │  │  5. Update consent flags                                   │ │    │
│  │  │  6. Trigger events                                         │ │    │
│  │  └────────────────────────────────────────────────────────────┘ │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                           │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────────┐    │
│  │ Email Service    │  │ Stripe Service   │  │ Event Queue        │    │
│  │ (ConvertKit)     │  │                  │  │ (Bull/BullMQ)      │    │
│  └──────────────────┘  └──────────────────┘  └────────────────────┘    │
│                                                                           │
└─────────────────────────┬───────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     DATABASE (PostgreSQL/MySQL)                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │  contacts    │  │  events      │  │  consents    │  │  sources    │ │
│  │              │  │              │  │              │  │             │ │
│  │  email (PK)  │  │  event_id    │  │  contact_id  │  │  source_id  │ │
│  │  phone       │  │  contact_id  │  │  type        │  │  contact_id │ │
│  │  first_name  │  │  event_type  │  │  granted     │  │  source     │ │
│  │  last_name   │  │  source      │  │  timestamp   │  │  metadata   │ │
│  │  zip_code    │  │  metadata    │  │              │  │  timestamp  │ │
│  │  created_at  │  │  timestamp   │  │              │  │             │ │
│  │  updated_at  │  │              │  │              │  │             │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └─────────────┘ │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     EXTERNAL WEBHOOKS (Inbound)                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌──────────────────┐  ┌──────────────────┐                             │
│  │ Stripe Webhooks  │  │ Canopy Webhooks  │                             │
│  │ - payment_intent │  │ - policy_shared  │                             │
│  │ - checkout.sess  │  │ - data_updated   │                             │
│  └──────────────────┘  └──────────────────┘                             │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow: Email Capture Points

### 1. Policy Share Flow (via Canopy)

```
User → Canopy Modal → Canopy API → Webhook → Backend API
                                      ↓
                            Contact Orchestration
                                      ↓
                          ┌───────────┴───────────┐
                          ▼                       ▼
                    Create/Update Contact    Tag: policy_share
                                      ↓
                            Trigger Events:
                          - email_captured
                          - policy_shared
                          - send_welcome_email
```

**Current State:** Data goes to Canopy's system only
**Recovery:** Need to implement Canopy webhook handler

### 2. Stripe Checkout Flow

```
User → Product Page → Checkout → Stripe → Webhook → Backend API
                                             ↓
                                Contact Orchestration
                                             ↓
                            ┌────────────────┴────────────────┐
                            ▼                                 ▼
                    Create/Update Contact              Tag: stripe_purchase
                            ↓                                 ↓
                    Store Order Record          Trigger Events:
                                                - email_captured
                                                - purchase_completed
                                                - send_receipt
                                                - send_download_link
```

**Current State:** Completely simulated, no real integration
**Recovery:** Need to implement full Stripe integration

### 3. Drivers Ed Pre-Capture Flow (NEW)

```
User → Drivers Ed Page → Email Gate → Submit → Backend API
                                                    ↓
                                        Contact Orchestration
                                                    ↓
                                    ┌───────────────┴───────────────┐
                                    ▼                               ▼
                            Create/Update Contact            Tag: drivers_ed
                                    ↓                               ↓
                            Generate Tracking Link      Trigger Events:
                                    ↓                     - email_captured
                            Redirect to Partner         - drivers_ed_interest
                                                         - send_confirmation
```

**Current State:** No email capture, direct external redirect
**Recovery:** Implement email gate before redirect with tracking parameters

### 4. General Email Capture (Post-Quote, Waitlist)

```
User → Email Form → Submit → Backend API
                                 ↓
                    Contact Orchestration
                                 ↓
                ┌────────────────┴────────────────┐
                ▼                                 ▼
        Create/Update Contact              Tag: context-specific
                ↓                          (post_quote, waitlist)
        Store Metadata                              ↓
                                          Trigger Events:
                                          - email_captured
                                          - send_lead_magnet
                                          - add_to_nurture_sequence
```

**Current State:** Frontend-only simulation, no backend
**Recovery:** Implement backend API endpoints

---

## De-Duplication Strategy

### Primary Key: Email Address (normalized)

```javascript
function normalizeEmail(email) {
  return email.toLowerCase().trim();
}
```

### Contact Merge Logic

```
1. Receive new email capture event
2. Normalize email address
3. Query database for existing contact
4. If EXISTS:
   a. Update last_seen timestamp
   b. Append new source to sources table
   c. Merge metadata (prefer non-null values)
   d. Preserve earliest created_at
   e. Update consent flags if changed
   f. Create event record
5. If NOT EXISTS:
   a. Create new contact record
   b. Create initial source record
   c. Set consent flags
   d. Create event record
6. Return unified contact ID
```

### Conflict Resolution Rules

| Field       | Resolution Strategy                    |
|-------------|----------------------------------------|
| email       | Always use normalized version          |
| phone       | Keep most recent non-empty value       |
| first_name  | Keep most recent non-empty value       |
| last_name   | Keep most recent non-empty value       |
| zip_code    | Keep most recent non-empty value       |
| consent     | Use latest consent status              |
| sources     | Append all (many-to-many)              |
| created_at  | Keep earliest timestamp                |
| updated_at  | Update to current timestamp            |

---

## Source Tagging System

### Source Types

| Source Code        | Description                           | Entry Point                    |
|-------------------|---------------------------------------|--------------------------------|
| `post_quote`      | Email captured after quote request    | ThankYouPage.jsx               |
| `policy_share`    | Contact from Canopy policy share      | Canopy webhook                 |
| `stripe_purchase` | Email from Stripe checkout            | Stripe webhook                 |
| `drivers_ed`      | Email before drivers ed redirect      | DriversEdPage.jsx (new gate)   |
| `store_waitlist`  | Physical products waitlist            | StorePage.jsx                  |
| `general_inquiry` | Generic email capture                 | EmailCapture component         |
| `education`       | Free education content                | Education pages                |

### Source Metadata Structure

```json
{
  "source": "drivers_ed",
  "timestamp": "2026-01-07T12:34:56Z",
  "metadata": {
    "course": "defensive_driving",
    "referrer": "https://insuredbycam.com/quotes",
    "utm_source": "email",
    "utm_campaign": "winter2026",
    "ip_address": "203.0.113.42",
    "user_agent": "Mozilla/5.0..."
  }
}
```

---

## Consent Tracking System

### Consent Types

| Consent Type           | Required | Opt-in/Opt-out | Description                    |
|-----------------------|----------|----------------|--------------------------------|
| `marketing_email`     | No       | Opt-in         | Marketing and promotional      |
| `transactional_email` | Yes      | Implicit       | Receipts, confirmations        |
| `sms_updates`         | No       | Opt-in         | SMS notifications              |
| `data_storage`        | Yes      | Implicit       | Store contact information      |
| `third_party_share`   | No       | Opt-out        | Share with insurance agents    |

### Consent Data Model

```json
{
  "contact_email": "user@example.com",
  "consents": [
    {
      "type": "marketing_email",
      "granted": true,
      "timestamp": "2026-01-07T12:34:56Z",
      "source": "post_quote_form",
      "ip_address": "203.0.113.42"
    },
    {
      "type": "sms_updates",
      "granted": false,
      "timestamp": "2026-01-07T12:34:56Z",
      "source": "post_quote_form",
      "ip_address": "203.0.113.42"
    }
  ]
}
```

### Consent Collection Points

1. **Email Capture Form**
   - Checkbox: "Send me insurance tips and updates" → `marketing_email`
   - Phone field filled → prompt for `sms_updates` consent

2. **Stripe Checkout**
   - Implicit `transactional_email` consent
   - Optional: "Subscribe to newsletter" → `marketing_email`

3. **Policy Share (Canopy)**
   - Implicit `third_party_share` consent (required for service)
   - Optional: "Receive follow-up from agent" → `marketing_email`

4. **Drivers Ed Gate**
   - Required: "Store my email for tracking" → `data_storage`
   - Optional: "Send me driving tips" → `marketing_email`

---

## Event-Based Trigger System

### Event Types

```javascript
const EVENT_TYPES = {
  // Capture Events
  EMAIL_CAPTURED: 'email_captured',
  PHONE_CAPTURED: 'phone_captured',

  // Action Events
  POLICY_SHARED: 'policy_shared',
  PURCHASE_COMPLETED: 'purchase_completed',
  DRIVERS_ED_CLICKED: 'drivers_ed_clicked',
  WAITLIST_JOINED: 'waitlist_joined',

  // Engagement Events
  EMAIL_OPENED: 'email_opened',
  EMAIL_CLICKED: 'email_clicked',
  LINK_CLICKED: 'link_clicked',

  // System Events
  CONTACT_MERGED: 'contact_merged',
  CONSENT_UPDATED: 'consent_updated'
};
```

### Trigger Configuration

```javascript
const TRIGGER_RULES = [
  {
    event: 'email_captured',
    condition: { source: 'post_quote' },
    actions: [
      { type: 'send_email', template: 'welcome_quote' },
      { type: 'add_to_sequence', sequence: 'quote_nurture' },
      { type: 'create_crm_task', assignee: 'sales_team' }
    ]
  },
  {
    event: 'purchase_completed',
    condition: { product_type: 'digital' },
    actions: [
      { type: 'send_email', template: 'receipt_with_download' },
      { type: 'grant_access', product_id: '{{product_id}}' },
      { type: 'add_tag', tag: 'customer' }
    ]
  },
  {
    event: 'drivers_ed_clicked',
    condition: { course: 'defensive_driving' },
    actions: [
      { type: 'send_email', template: 'drivers_ed_confirmation' },
      { type: 'create_tracking_link', partner: 'national_drivers_ed' },
      { type: 'schedule_followup', delay_hours: 24 }
    ]
  },
  {
    event: 'policy_shared',
    condition: {},
    actions: [
      { type: 'send_email', template: 'policy_received' },
      { type: 'notify_agent', channel: 'slack' },
      { type: 'add_to_sequence', sequence: 'policy_review' }
    ]
  }
];
```

### Event Processing Flow

```
Event Generated → Event Queue → Event Processor → Action Dispatcher
                                        ↓
                                Filter by conditions
                                        ↓
                            ┌───────────┴───────────┐
                            ▼                       ▼
                    Execute Actions         Log to events table
                            ↓
                ┌───────────┼───────────┐
                ▼           ▼           ▼
          Send Email   Update CRM   Create Task
```

---

## Data Recovery Strategy

### 1. Canopy Policy Share Emails

**Problem:** Contact data currently stays in Canopy's system

**Solutions:**

#### Option A: Canopy Webhook Integration (Recommended)
```
Canopy → POST /api/webhooks/canopy
  {
    "event": "policy.shared",
    "data": {
      "email": "user@example.com",
      "phone": "+1-555-0123",
      "name": "John Doe",
      "policy_data": {...}
    }
  }
→ Store in contacts table
→ Tag source: policy_share
→ Trigger events
```

**Action:** Contact Canopy support to enable webhooks

#### Option B: Manual Export & Import
```
1. Export contacts from Canopy dashboard (CSV)
2. Run bulk import script
3. Tag all with source: policy_share_import
4. Set imported_at timestamp
```

**Action:** Weekly/monthly manual sync until webhooks available

### 2. Stripe Checkout Emails

**Problem:** No backend, so no Stripe integration

**Solution:** Full Stripe Implementation

```
1. Create backend API endpoint: POST /api/create-checkout-session
2. Endpoint creates Stripe checkout with customer email
3. Stripe checkout captures email
4. Stripe webhook POST /api/webhooks/stripe on checkout.session.completed
5. Webhook extracts customer email from Stripe event
6. Contact Orchestration stores email with source: stripe_purchase
7. Trigger purchase_completed event → send receipt + download link
```

**Data Fields Available:**
- `event.data.object.customer_details.email`
- `event.data.object.customer_details.name`
- `event.data.object.customer_details.phone`

### 3. Drivers Ed Emails (COMPLETELY LOST)

**Problem:** Direct external redirects, no capture mechanism

**Solution:** Implement Email Gate (NEW FEATURE)

**Implementation:**
```javascript
// DriversEdPage.jsx

const [showEmailGate, setShowEmailGate] = useState(false);
const [selectedCourse, setSelectedCourse] = useState(null);

const handleCourseClick = (courseType) => {
  setSelectedCourse(courseType);
  setShowEmailGate(true);
};

const handleEmailSubmit = async (email) => {
  // Call backend API
  const response = await fetch('/api/email-capture', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      source: 'drivers_ed',
      metadata: { course: selectedCourse }
    })
  });

  const { tracking_url } = await response.json();

  // Redirect with tracking parameter
  window.location.href = tracking_url;
  // Example: https://insuredbycam.nationaldrivered.com/defensive?ref=abc123
};
```

**Tracking URLs:**
- Generate unique tracking code per email submission
- Store in database: `tracking_links` table
- Partner sites redirect back with completion status (if available)

**Recovery of Historical Data:**
- **NOT POSSIBLE** - No data was ever captured
- Start capturing immediately going forward

### 4. Physical Products Waitlist

**Problem:** Form has no submit handler

**Solution:** Connect to backend API

```javascript
// StorePage.jsx

const handleWaitlistSubmit = async (e) => {
  e.preventDefault();

  await fetch('/api/store-waitlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: waitlistEmail,
      source: 'store_waitlist',
      metadata: { product_interest: 'physical_products' }
    })
  });

  setShowWaitlistSuccess(true);
};
```

---

## Integration Points

### 1. Email Service Provider (ConvertKit Recommended)

**Why ConvertKit:**
- Built for creators/coaches
- Strong automation features
- Tag-based organization
- Good API documentation

**Integration:**
```javascript
// services/convertkit.js

const ConvertKit = require('convertkit-api');
const ck = new ConvertKit(process.env.CONVERTKIT_API_KEY);

async function addSubscriber(email, firstName, tags, customFields) {
  return await ck.addSubscriber({
    email,
    first_name: firstName,
    tags,
    fields: customFields
  });
}

async function tagSubscriber(email, tagId) {
  return await ck.tagSubscriber(tagId, { email });
}
```

**Tag Mapping:**
- `post_quote` → ConvertKit tag: "Quote Requested"
- `policy_share` → ConvertKit tag: "Policy Shared"
- `stripe_purchase` → ConvertKit tag: "Customer"
- `drivers_ed` → ConvertKit tag: "Drivers Ed Interest"

### 2. Stripe Integration

**Webhook Events to Handle:**
```javascript
const STRIPE_EVENTS = [
  'checkout.session.completed',  // Capture email + create order
  'payment_intent.succeeded',    // Confirm payment
  'customer.created',            // New customer record
  'customer.updated',            // Updated customer info
];
```

**Webhook Handler:**
```javascript
// routes/webhooks/stripe.js

router.post('/webhooks/stripe', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const event = stripe.webhooks.constructEvent(
    req.body,
    sig,
    process.env.STRIPE_WEBHOOK_SECRET
  );

  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutComplete(event.data.object);
      break;
  }

  res.json({ received: true });
});

async function handleCheckoutComplete(session) {
  const { customer_details, metadata } = session;

  // Contact Orchestration
  const contact = await upsertContact({
    email: customer_details.email,
    phone: customer_details.phone,
    name: customer_details.name,
    source: 'stripe_purchase',
    metadata: {
      product_id: metadata.product_id,
      amount: session.amount_total,
      stripe_session_id: session.id
    }
  });

  // Trigger event
  await triggerEvent('purchase_completed', contact, metadata);
}
```

### 3. Canopy Webhook (If Available)

**Check with Canopy:** Does their API support webhooks?

**Potential Webhook Handler:**
```javascript
// routes/webhooks/canopy.js

router.post('/webhooks/canopy', async (req, res) => {
  const { event, data } = req.body;

  if (event === 'policy.shared') {
    await upsertContact({
      email: data.email,
      phone: data.phone,
      first_name: data.first_name,
      last_name: data.last_name,
      source: 'policy_share',
      metadata: {
        canopy_session_id: data.session_id,
        policy_data: data.policy
      }
    });

    await triggerEvent('policy_shared', { email: data.email }, data);
  }

  res.json({ received: true });
});
```

---

## Security & Compliance

### GDPR/CCPA Compliance

**Data Subject Rights:**
- Right to access: `GET /api/contacts/:email`
- Right to deletion: `DELETE /api/contacts/:email`
- Right to portability: `GET /api/contacts/:email/export`
- Right to rectification: `PATCH /api/contacts/:email`

**Consent Management:**
- Store consent timestamp and IP address
- Allow opt-out at any time
- Provide unsubscribe link in all marketing emails
- Honor "Do Not Sell" requests (CCPA)

**Data Retention:**
- Active contacts: Indefinite
- Unsubscribed contacts: 2 years (for compliance)
- Deleted contacts: 30-day soft delete, then purge

### Security Measures

1. **API Authentication:**
   - JWT tokens for frontend → backend
   - API keys for webhook endpoints
   - Rate limiting on all endpoints

2. **Data Encryption:**
   - TLS 1.3 for data in transit
   - Encrypt sensitive fields at rest (phone numbers)
   - Hash email addresses for analytics (privacy mode)

3. **Input Validation:**
   - Email format validation
   - Phone number normalization
   - Sanitize all user inputs
   - Prevent SQL injection

4. **Webhook Security:**
   - Verify Stripe signature
   - Verify Canopy signature (if available)
   - IP whitelist for known sources
   - Replay attack prevention

---

## Monitoring & Analytics

### Key Metrics to Track

1. **Capture Rate:**
   - Emails captured per day/week/month
   - Conversion rate by source
   - Form abandonment rate

2. **De-duplication Stats:**
   - Duplicate submission rate
   - Sources per contact (average)
   - Merge frequency

3. **Consent Tracking:**
   - Marketing consent opt-in rate
   - SMS consent opt-in rate
   - Unsubscribe rate

4. **Event Triggers:**
   - Events fired per day
   - Action completion rate
   - Email delivery rate
   - Email open rate

### Logging Strategy

```javascript
// Log all contact operations
logger.info('contact.created', {
  email: hashedEmail,
  source,
  timestamp: new Date()
});

logger.info('contact.merged', {
  email: hashedEmail,
  sources: [oldSources, newSource],
  timestamp: new Date()
});

logger.info('event.triggered', {
  event_type,
  contact_id,
  actions_scheduled: actionCount,
  timestamp: new Date()
});
```

---

## Testing Strategy

### Unit Tests

```javascript
describe('Contact Orchestration', () => {
  test('normalizes email addresses', () => {
    expect(normalizeEmail('  USER@Example.com  '))
      .toBe('user@example.com');
  });

  test('merges duplicate contacts', async () => {
    await createContact({ email: 'test@example.com', source: 'post_quote' });
    await createContact({ email: 'test@example.com', source: 'stripe_purchase' });

    const contact = await getContact('test@example.com');
    expect(contact.sources).toHaveLength(2);
  });
});
```

### Integration Tests

```javascript
describe('Stripe Webhook', () => {
  test('creates contact on checkout complete', async () => {
    const event = createMockStripeEvent('checkout.session.completed');

    await request(app)
      .post('/api/webhooks/stripe')
      .set('stripe-signature', generateSignature(event))
      .send(event)
      .expect(200);

    const contact = await getContact('test@example.com');
    expect(contact).toBeDefined();
    expect(contact.sources).toContain('stripe_purchase');
  });
});
```

### E2E Tests

```javascript
describe('Email Capture Flow', () => {
  test('captures email from post-quote form', async () => {
    await page.goto('/thank-you');
    await page.fill('[data-testid="email-input"]', 'test@example.com');
    await page.click('[data-testid="submit-button"]');

    await page.waitForSelector('[data-testid="success-message"]');

    // Verify backend received it
    const contact = await getContact('test@example.com');
    expect(contact.source).toBe('post_quote');
  });
});
```

---

## Scalability Considerations

### Database Optimization

1. **Indexes:**
   ```sql
   CREATE INDEX idx_contacts_email ON contacts(email);
   CREATE INDEX idx_events_contact_timestamp ON events(contact_email, timestamp);
   CREATE INDEX idx_sources_contact ON sources(contact_email);
   ```

2. **Partitioning:**
   - Partition `events` table by month
   - Archive old events after 2 years

3. **Caching:**
   - Redis cache for frequently accessed contacts
   - Cache TTL: 1 hour
   - Invalidate on contact update

### Queue Processing

**Use Bull (Redis-backed queue) for:**
- Email sending (async)
- Event processing (decoupled)
- Webhook retry logic
- Batch operations

```javascript
const emailQueue = new Queue('email-sending', {
  redis: { host: 'localhost', port: 6379 }
});

emailQueue.process(async (job) => {
  const { template, contact, data } = job.data;
  await sendEmail(template, contact, data);
});
```

### Rate Limiting

```javascript
const rateLimit = require('express-rate-limit');

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP'
});

app.use('/api/', apiLimiter);
```

---

## Cost Estimates

### Infrastructure

| Component          | Service          | Estimated Cost     |
|-------------------|------------------|--------------------|
| Backend Hosting   | Railway/Render   | $15-25/month       |
| Database          | Railway/Render   | $10-15/month       |
| Redis Queue       | Upstash          | $0-10/month        |
| Email Service     | ConvertKit       | $29+/month         |
| Stripe            | Stripe           | 2.9% + 30¢/txn     |
| **Total**         |                  | **$54-79/month**   |

### Alternative Free Tier Options (Lower Volume)

| Component          | Service          | Cost               |
|-------------------|------------------|--------------------|
| Backend           | Vercel           | Free               |
| Database          | Neon/Supabase    | Free (500MB)       |
| Email Service     | Resend           | Free (3K/month)    |
| **Total**         |                  | **$0-20/month**    |

---

## Success Criteria

### Phase 1: Foundation (Week 1-2)
- ✅ Backend API deployed
- ✅ Database schema implemented
- ✅ Contact orchestration service working
- ✅ De-duplication logic tested
- ✅ Basic email capture working

### Phase 2: Integration (Week 3-4)
- ✅ Stripe integration complete
- ✅ Canopy webhook handler ready
- ✅ Drivers ed email gate implemented
- ✅ All frontend forms connected to backend
- ✅ Event trigger system operational

### Phase 3: Launch (Week 5-6)
- ✅ All emails being captured
- ✅ Zero data loss
- ✅ ConvertKit integration live
- ✅ Monitoring dashboard active
- ✅ GDPR compliance verified

---

## Next Steps

1. **Review & Approve Architecture** (You are here)
2. **Set Up Backend Infrastructure** (See implementation steps)
3. **Implement Contact Orchestration Service**
4. **Connect Frontend to Backend APIs**
5. **Integrate External Services (Stripe, Canopy, ConvertKit)**
6. **Test & Deploy**
7. **Monitor & Optimize**

---

**Document Version:** 1.0
**Last Updated:** 2026-01-07
**Author:** Claude (AI Assistant)
