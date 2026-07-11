# Unified Email Capture & CRM System

> **A comprehensive solution to consolidate contacts from policy shares, Stripe checkout, and drivers ed flows into a single, de-duplicated contact record.**

---

## 📋 Executive Summary

### The Problem

Your application currently has **three separate email capture points** with **ZERO data persistence**:

1. **Policy Share (Canopy)** - Data goes to Canopy's system only
2. **Stripe Checkout** - Completely simulated, no real integration
3. **Drivers Ed Flows** - Direct external redirects, no email capture

**Result:** You're losing 100% of potential customer data.

### The Solution

A unified CRM system that:
- ✅ Captures emails from **all entry points**
- ✅ Uses **email as primary identifier** for de-duplication
- ✅ Tags each contact with **source information**
- ✅ Tracks **consent** for GDPR/CCPA compliance
- ✅ Triggers **automated actions** based on events
- ✅ Integrates with **ConvertKit** for email marketing
- ✅ Stores everything in a **PostgreSQL database**

---

## 🏗️ Architecture Overview

```
Frontend (React) → Backend API (Node.js) → Database (PostgreSQL)
                                         ↓
                              Email Service (ConvertKit)
                              Event Queue (Bull/Redis)
                              External Webhooks (Stripe, Canopy)
```

### Key Components

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Backend API** | Node.js + Express | Handle email capture, orchestrate contact management |
| **Database** | PostgreSQL | Store contacts, events, consents, sources |
| **Email Service** | ConvertKit | Email marketing and automation |
| **Job Queue** | Bull + Redis | Process events asynchronously |
| **Payment** | Stripe | Handle purchases and capture emails |
| **Policy Share** | Canopy | Integrate policy sharing data |

---

## 📊 Database Schema

### Core Tables

#### `contacts` - Central contact record
```sql
PRIMARY KEY: email (normalized, lowercase)
Fields: phone, first_name, last_name, zip_code, created_at, updated_at
```

#### `sources` - Track all entry points (many-to-many)
```sql
Fields: contact_email, source, metadata, utm_params, captured_at
Sources: post_quote, policy_share, stripe_purchase, drivers_ed, store_waitlist
```

#### `events` - Event log for triggers
```sql
Fields: contact_email, event_type, source, metadata, created_at
Events: email_captured, purchase_completed, policy_shared, drivers_ed_clicked
```

#### `consents` - GDPR/CCPA compliance
```sql
Fields: contact_email, consent_type, granted, granted_at, source, ip_address
Types: marketing_email, transactional_email, sms_updates, data_storage
```

#### `orders` - Stripe purchases
```sql
Fields: contact_email, stripe_session_id, product_id, amount_cents, status
```

#### `tracking_links` - Drivers ed tracking
```sql
Fields: contact_email, tracking_code, destination_url, click_count
```

**📄 Full schema:** See [`database-schema.sql`](./database-schema.sql)

---

## 🔄 Data Flow

### 1. Policy Share Flow

```
User fills out Canopy modal
    ↓
Canopy captures policy + contact info
    ↓
Canopy webhook → Backend API
    ↓
Contact Orchestration Service
    ↓
- Upsert contact (email as key)
- Tag source: policy_share
- Trigger event: policy_shared
    ↓
Actions:
- Send "Policy Received" email
- Add to nurture sequence
- Notify agent
```

### 2. Stripe Checkout Flow

```
User clicks "Buy Now"
    ↓
Backend creates Stripe checkout session
    ↓
Stripe captures payment + email
    ↓
Stripe webhook → Backend API
    ↓
Contact Orchestration Service
    ↓
- Upsert contact
- Create order record
- Tag source: stripe_purchase
- Trigger event: purchase_completed
    ↓
Actions:
- Send receipt + download link
- Grant product access
- Add "Customer" tag
```

### 3. Drivers Ed Flow (NEW)

```
User clicks course button
    ↓
Email gate modal appears
    ↓
User enters email
    ↓
POST /api/drivers-ed-capture
    ↓
Contact Orchestration Service
    ↓
- Upsert contact
- Create tracking link
- Tag source: drivers_ed
- Trigger event: drivers_ed_clicked
    ↓
Actions:
- Send confirmation email
- Redirect to partner site with tracking
- Schedule 24hr follow-up
```

### 4. General Email Capture

```
User fills email form (post-quote, waitlist, etc.)
    ↓
POST /api/email-capture
    ↓
Contact Orchestration Service
    ↓
- Upsert contact
- Tag source + context
- Store consent preferences
- Trigger event: email_captured
    ↓
Actions based on context:
- post_quote → Welcome email + nurture sequence
- store_waitlist → Waitlist confirmation
- education → Lead magnet delivery
```

---

## 🎯 De-Duplication Strategy

### Email as Primary Key

```javascript
function normalizeEmail(email) {
  return email.toLowerCase().trim();
}

// Example:
"  USER@Example.com  " → "user@example.com"
```

### Merge Logic

When a contact submits their email from **multiple sources**:

1. **First submission** (e.g., post_quote):
   ```
   CREATE contact: user@example.com
   ADD source: post_quote
   TRIGGER: email_captured
   ```

2. **Second submission** (e.g., stripe_purchase):
   ```
   FIND existing: user@example.com ✓
   UPDATE contact (merge non-null fields)
   ADD source: stripe_purchase
   TRIGGER: contact_merged
   ```

3. **Result**: One unified contact with multiple sources
   ```json
   {
     "email": "user@example.com",
     "sources": ["post_quote", "stripe_purchase"],
     "source_count": 2,
     "created_at": "2026-01-07T10:00:00Z",
     "last_seen": "2026-01-07T14:30:00Z"
   }
   ```

### Conflict Resolution

| Field | Strategy |
|-------|----------|
| `email` | Always normalized |
| `phone` | Keep most recent non-null |
| `first_name` | Keep most recent non-null |
| `last_name` | Keep most recent non-null |
| `zip_code` | Keep most recent non-null |
| `sources` | Append all (no duplicates) |
| `created_at` | Keep earliest |
| `updated_at` | Update to current |

---

## 🚀 Quick Start

### Prerequisites

```bash
# Required
- Node.js 18+
- PostgreSQL 14+
- Redis (for job queue)

# Accounts needed
- ConvertKit (or Resend for free tier)
- Stripe
- Railway/Render (for hosting)
```

### Installation

```bash
# 1. Create backend directory
mkdir backend && cd backend
npm init -y

# 2. Install dependencies
npm install express cors dotenv pg stripe bull redis convertkit-api
npm install --save-dev nodemon

# 3. Set up database
# Option A: Railway
railway init && railway add postgresql && railway add redis

# Option B: Docker
docker-compose up -d  # Uses provided docker-compose.yml

# 4. Configure environment
cp .env.example .env
# Edit .env with your credentials

# 5. Run migrations
npm run migrate

# 6. Start backend
npm run dev

# 7. Update frontend .env
echo "VITE_API_URL=http://localhost:3000" > ../.env.local

# 8. Start frontend
cd .. && npm run dev
```

### Verify Setup

```bash
# Test email capture
curl -X POST http://localhost:3000/api/email-capture \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "source": "post_quote",
    "consent": {"marketing_email": true}
  }'

# Check database
psql $DATABASE_URL -c "SELECT * FROM contacts;"
psql $DATABASE_URL -c "SELECT * FROM sources;"
psql $DATABASE_URL -c "SELECT * FROM events;"
```

Expected output:
```
✅ Contact created: test@example.com
✅ Source added: post_quote
✅ Event triggered: email_captured
✅ Email queued: welcome_quote
```

---

## 📚 Documentation

| Document | Purpose |
|----------|---------|
| **[unified-crm-architecture.md](./unified-crm-architecture.md)** | Complete architecture with diagrams, data flows, and integration details |
| **[database-schema.sql](./database-schema.sql)** | Full PostgreSQL schema with tables, indexes, functions, and views |
| **[implementation-steps.md](./implementation-steps.md)** | Step-by-step implementation guide (8 phases) |
| **unified-crm-README.md** | This file - Quick start and overview |

---

## 🔌 API Endpoints

### Email Capture

```bash
POST /api/email-capture
Content-Type: application/json

{
  "email": "user@example.com",
  "phone": "+1-555-123-4567",  // optional
  "firstName": "John",          // optional
  "lastName": "Doe",            // optional
  "zipCode": "30307",           // optional
  "source": "post_quote",
  "context": "insurance_quote",
  "consent": {
    "marketing_email": true,
    "sms_updates": false
  }
}

Response:
{
  "success": true,
  "contact": {
    "email": "user@example.com",
    "isNew": true,
    "sourceAdded": true
  }
}
```

### Store Waitlist

```bash
POST /api/store-waitlist
Content-Type: application/json

{
  "email": "user@example.com"
}

Response:
{
  "success": true
}
```

### Drivers Ed Capture

```bash
POST /api/drivers-ed-capture
Content-Type: application/json

{
  "email": "user@example.com",
  "course": "defensive_driving"
}

Response:
{
  "success": true,
  "tracking_url": "https://insuredbycam.com/track/abc123"
}
```

### Create Stripe Checkout

```bash
POST /api/create-checkout-session
Content-Type: application/json

{
  "productId": "claims-guide",
  "productName": "Claims Negotiation Guide",
  "priceInCents": 3700
}

Response:
{
  "sessionId": "cs_test_...",
  "url": "https://checkout.stripe.com/..."
}
```

---

## 🎨 Frontend Integration Examples

### EmailCapture Component

```javascript
import { API } from '../config/api';

const handleSubmit = async (e) => {
  e.preventDefault();

  const response = await fetch(API.EMAIL_CAPTURE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      phone,
      source: 'post_quote',
      consent: { marketing_email: true }
    })
  });

  if (response.ok) {
    // Show success message
  }
};
```

### Drivers Ed Email Gate

```javascript
const handleCourseClick = (course) => {
  setShowEmailGate(true);
  setSelectedCourse(course);
};

const handleEmailSubmit = async () => {
  const response = await fetch(API.DRIVERS_ED_CAPTURE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, course: selectedCourse })
  });

  const { tracking_url } = await response.json();
  window.location.href = tracking_url;
};
```

### Stripe Checkout

```javascript
const handleCheckout = async () => {
  const response = await fetch(API.CREATE_CHECKOUT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      productId: product.id,
      productName: product.title,
      priceInCents: product.price * 100
    })
  });

  const { url } = await response.json();
  window.location.href = url;
};
```

---

## 🔒 Security & Compliance

### GDPR/CCPA Features

✅ **Consent tracking** - All consent recorded with timestamp and IP
✅ **Right to access** - `GET /api/contacts/:email`
✅ **Right to deletion** - `DELETE /api/contacts/:email` (soft delete)
✅ **Right to portability** - `GET /api/contacts/:email/export`
✅ **Unsubscribe links** - All marketing emails include opt-out

### Security Measures

- 🔐 **TLS encryption** for data in transit
- 🔐 **Input validation** on all endpoints
- 🔐 **Rate limiting** (100 requests per 15 minutes)
- 🔐 **Webhook signature verification** (Stripe, Canopy)
- 🔐 **SQL injection prevention** (parameterized queries)
- 🔐 **XSS protection** via Helmet.js

---

## 📈 Monitoring & Analytics

### Key Metrics

```sql
-- Total contacts
SELECT COUNT(*) FROM contacts WHERE deleted_at IS NULL;

-- New contacts (last 7 days)
SELECT COUNT(*) FROM contacts WHERE created_at > NOW() - INTERVAL '7 days';

-- Source breakdown
SELECT source, COUNT(*) as count
FROM sources
GROUP BY source
ORDER BY count DESC;

-- Consent opt-in rate
SELECT * FROM consent_summary;

-- Events triggered (last 24 hours)
SELECT event_type, COUNT(*) as count
FROM events
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY event_type;

-- Revenue (completed orders)
SELECT SUM(amount_cents) / 100.0 as total_revenue
FROM orders
WHERE status = 'completed';
```

### Dashboard View

Access via `GET /api/admin/dashboard`:

```json
{
  "stats": {
    "total_contacts": 1523,
    "contacts_last_week": 87,
    "events_last_day": 342,
    "total_orders": 156
  },
  "sources": [
    { "source": "post_quote", "count": 654 },
    { "source": "policy_share", "count": 432 },
    { "source": "stripe_purchase", "count": 234 },
    { "source": "drivers_ed", "count": 203 }
  ]
}
```

---

## 🧪 Testing

### Unit Tests

```javascript
// Test contact de-duplication
describe('Contact Orchestration', () => {
  test('merges duplicate contacts', async () => {
    await upsertContact({
      email: 'test@example.com',
      source: 'post_quote'
    });

    await upsertContact({
      email: 'test@example.com',
      source: 'stripe_purchase'
    });

    const contact = await getContact('test@example.com');
    expect(contact.sources).toHaveLength(2);
  });
});
```

### Integration Tests

```bash
# Test email capture endpoint
npm test -- emailCapture.test.js

# Test Stripe webhook
stripe trigger checkout.session.completed
```

### E2E Tests

```javascript
// Test full user flow
test('user can submit email and receive confirmation', async () => {
  await page.goto('/thank-you');
  await page.fill('[data-testid="email"]', 'test@example.com');
  await page.click('[data-testid="submit"]');
  await expect(page.locator('.success-message')).toBeVisible();
});
```

---

## 🚢 Deployment

### Backend (Railway)

```bash
# Install CLI
npm install -g @railway/cli

# Deploy
railway login
railway init
railway add postgresql redis
railway up

# Set environment variables
railway variables set CONVERTKIT_API_KEY=xxx
railway variables set STRIPE_SECRET_KEY=xxx
```

### Frontend (Vercel)

```bash
# Update .env.production
echo "VITE_API_URL=https://your-backend.railway.app" > .env.production

# Deploy
npm run build
vercel --prod
```

### Post-Deployment

1. ✅ Add Stripe webhook: `https://your-backend.railway.app/webhooks/stripe`
2. ✅ Add Canopy webhook: `https://your-backend.railway.app/webhooks/canopy`
3. ✅ Test all email capture points
4. ✅ Verify emails are being sent via ConvertKit
5. ✅ Monitor logs for errors

---

## 🔧 Troubleshooting

### "Database connection failed"

```bash
# Verify connection string
psql $DATABASE_URL

# Check if database exists
psql $DATABASE_URL -c "SELECT version();"

# Common fix: Update DATABASE_URL in .env
```

### "Emails not sending"

```bash
# Verify ConvertKit API key
curl -X GET "https://api.convertkit.com/v3/account?api_secret=YOUR_SECRET"

# Check job queue
redis-cli
> LLEN bull:event-processing:wait

# Check failed actions
psql $DATABASE_URL -c "SELECT * FROM event_actions WHERE status = 'failed';"
```

### "Stripe webhook not working"

```bash
# Test webhook locally
stripe listen --forward-to localhost:3000/webhooks/stripe
stripe trigger checkout.session.completed

# Verify webhook secret
echo $STRIPE_WEBHOOK_SECRET

# Check backend logs for signature errors
```

---

## 📊 Success Metrics

### Before Implementation

- ❌ 0 emails captured from policy shares
- ❌ 0 emails captured from Stripe checkout
- ❌ 0 emails captured from drivers ed clicks
- ❌ No unified contact database
- ❌ No email automation

### After Implementation

- ✅ 100% email capture rate across all sources
- ✅ Single unified contact record per email
- ✅ Automatic de-duplication
- ✅ Source attribution for all contacts
- ✅ Automated email sequences
- ✅ GDPR/CCPA compliant consent tracking
- ✅ Real-time event triggers
- ✅ Revenue tracking per contact

---

## 🎯 Next Steps

### Immediate (Week 1-2)

1. ✅ Set up backend infrastructure
2. ✅ Deploy database schema
3. ✅ Implement core services
4. ✅ Connect frontend to backend
5. ✅ Test all email capture points

### Short-term (Week 3-4)

6. ✅ Integrate ConvertKit
7. ✅ Set up Stripe webhooks
8. ✅ Request Canopy webhooks
9. ✅ Deploy to production
10. ✅ Verify all systems working

### Long-term (Month 2+)

11. 📧 Create email sequences in ConvertKit
12. 📊 Build admin dashboard
13. 🔄 Set up automated backups
14. 📈 Implement analytics tracking
15. 🧪 A/B test email campaigns
16. 📱 Add SMS integration (optional)
17. 🤖 Add AI-powered lead scoring
18. 🔗 Integrate with CRM (HubSpot/Salesforce)

---

## 💰 Cost Estimate

### Monthly Operating Costs

| Service | Free Tier | Paid Plan | Notes |
|---------|-----------|-----------|-------|
| **Backend** (Railway) | - | $15-25 | Includes hosting |
| **Database** (PostgreSQL) | ✅ | $10-15 | Free with Railway |
| **Redis** (Upstash) | ✅ | $0-10 | Free tier available |
| **Email** (ConvertKit) | - | $29+ | Starts at 1,000 subscribers |
| **Email** (Resend) | ✅ | Free | 3,000 emails/month free |
| **Stripe** | ✅ | 2.9% + 30¢ | Per transaction |
| **Total** | **~$0** | **$54-79** | Or free with Resend |

**Recommended for starting:** Use free tiers (Resend, Railway free, etc.) until you reach scale.

---

## 📞 Support & Resources

### Documentation

- [Architecture Details](./unified-crm-architecture.md)
- [Database Schema](./database-schema.sql)
- [Implementation Guide](./implementation-steps.md)

### External Resources

- [ConvertKit API Docs](https://developers.convertkit.com/)
- [Stripe API Docs](https://stripe.com/docs/api)
- [PostgreSQL Docs](https://www.postgresql.org/docs/)
- [Bull Queue Docs](https://github.com/OptimalBits/bull)

### Getting Help

- Check [Troubleshooting](#-troubleshooting) section
- Review backend logs: `railway logs`
- Test endpoints with Postman
- Verify database with `psql $DATABASE_URL`

---

## ✅ Verification Checklist

### Backend Setup
- [ ] Backend server running on port 3000
- [ ] Database connected successfully
- [ ] All 7 tables created
- [ ] Redis queue connected
- [ ] Environment variables configured

### API Endpoints
- [ ] `POST /api/email-capture` returns 200
- [ ] `POST /api/store-waitlist` returns 200
- [ ] `POST /api/drivers-ed-capture` returns 200
- [ ] `POST /api/create-checkout-session` returns session URL
- [ ] `POST /webhooks/stripe` receives test webhooks
- [ ] `POST /webhooks/canopy` ready for integration

### Frontend Integration
- [ ] EmailCapture component submits to backend
- [ ] Store waitlist form submits to backend
- [ ] Drivers ed email gate shows before redirect
- [ ] Stripe checkout creates real sessions
- [ ] No console errors on form submission

### Data Flow
- [ ] Emails appear in `contacts` table
- [ ] Sources appear in `sources` table
- [ ] Events appear in `events` table
- [ ] Duplicate submissions don't create duplicate contacts
- [ ] Consents recorded in `consents` table

### External Integrations
- [ ] ConvertKit receives new subscribers
- [ ] Stripe webhooks received successfully
- [ ] Canopy webhook endpoint ready
- [ ] Emails being sent automatically
- [ ] Job queue processing actions

### Compliance
- [ ] Consent checkboxes present on forms
- [ ] Unsubscribe links in emails
- [ ] Privacy policy updated
- [ ] Data retention policy defined
- [ ] Backup strategy implemented

---

## 🎉 Conclusion

This unified email capture and CRM system will transform your data collection from **0% to 100%** across all touchpoints. With proper implementation, you'll have:

✅ **Single source of truth** for all contacts
✅ **Automated email marketing** via ConvertKit
✅ **Revenue tracking** from Stripe
✅ **Compliance** with GDPR/CCPA
✅ **Scalable infrastructure** ready to grow

**Estimated implementation time:** 2-3 weeks full-time

**ROI:** Every captured email is a potential customer. With 100% capture rate vs. 0%, the ROI is infinite.

---

**Ready to start?** Follow the [Quick Start](#-quick-start) guide or dive into the [Implementation Steps](./implementation-steps.md).

**Questions?** Review the [Architecture Document](./unified-crm-architecture.md) for detailed explanations.

**Let's build this! 🚀**

---

**Document Version:** 1.0
**Created:** 2026-01-07
**Status:** Ready for Implementation
