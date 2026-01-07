# Unified Email Capture & CRM System - Implementation Steps

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Phase 1: Backend Foundation](#phase-1-backend-foundation)
3. [Phase 2: Database Setup](#phase-2-database-setup)
4. [Phase 3: Core Services](#phase-3-core-services)
5. [Phase 4: API Endpoints](#phase-4-api-endpoints)
6. [Phase 5: Frontend Integration](#phase-5-frontend-integration)
7. [Phase 6: External Integrations](#phase-6-external-integrations)
8. [Phase 7: Testing & Deployment](#phase-7-testing--deployment)
9. [Phase 8: Monitoring & Optimization](#phase-8-monitoring--optimization)

---

## Prerequisites

### Required Accounts
- [ ] PostgreSQL database (Railway, Neon, or Supabase)
- [ ] Email service provider (ConvertKit recommended, or Resend for free tier)
- [ ] Stripe account (for payments)
- [ ] Hosting platform (Railway, Render, or Vercel with Serverless Functions)

### Development Tools
```bash
# Required installations
node --version  # v18+ required
npm --version   # v9+ required
git --version   # v2+ required
psql --version  # PostgreSQL client
```

---

## Phase 1: Backend Foundation

### Step 1.1: Create Backend Directory Structure

```bash
# From project root
mkdir -p backend/{routes,services,middleware,utils,config}
mkdir -p backend/routes/{api,webhooks}
cd backend
npm init -y
```

### Step 1.2: Install Dependencies

```bash
# Core dependencies
npm install express cors dotenv pg

# Security
npm install helmet express-rate-limit

# Validation
npm install express-validator

# Job Queue
npm install bull redis

# Email Service (choose one)
npm install convertkit-api  # For ConvertKit
# OR
npm install resend          # For Resend (free tier)

# Stripe
npm install stripe @stripe/stripe-js

# Development
npm install --save-dev nodemon
```

### Step 1.3: Create Backend Entry Point

**File: `backend/server.js`**
```javascript
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api', require('./routes/api'));
app.use('/webhooks', require('./routes/webhooks'));

// Error handling
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});
```

### Step 1.4: Configure Environment Variables

**File: `backend/.env`**
```bash
# Server
PORT=3000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/quotesync_crm

# Redis (for job queue)
REDIS_URL=redis://localhost:6379

# Email Service (ConvertKit)
CONVERTKIT_API_KEY=your_convertkit_api_key
CONVERTKIT_API_SECRET=your_convertkit_api_secret

# OR Email Service (Resend)
RESEND_API_KEY=your_resend_api_key

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PUBLISHABLE_KEY=pk_test_...

# Canopy (if webhooks available)
CANOPY_API_KEY=your_canopy_api_key
CANOPY_WEBHOOK_SECRET=your_canopy_webhook_secret

# Security
JWT_SECRET=your_random_secure_secret_key_here
```

### Step 1.5: Add Scripts to package.json

**File: `backend/package.json`**
```json
{
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "test": "jest",
    "migrate": "node scripts/migrate.js"
  }
}
```

---

## Phase 2: Database Setup

### Step 2.1: Set Up PostgreSQL Database

**Option A: Using Railway (Recommended)**
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and create project
railway login
railway init
railway add postgresql

# Get database URL
railway variables
```

**Option B: Using Docker (Local Development)**
```bash
# Create docker-compose.yml
cat > docker-compose.yml << 'EOF'
version: '3.8'
services:
  postgres:
    image: postgres:14
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
      POSTGRES_DB: quotesync_crm
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7
    ports:
      - "6379:6379"

volumes:
  postgres_data:
EOF

# Start services
docker-compose up -d
```

### Step 2.2: Create Database Connection Module

**File: `backend/config/database.js`**
```javascript
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Test connection
pool.on('connect', () => {
  console.log('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('Unexpected database error:', err);
  process.exit(-1);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};
```

### Step 2.3: Run Database Migration

**File: `backend/scripts/migrate.js`**
```javascript
const fs = require('fs');
const path = require('path');
const db = require('../config/database');

async function migrate() {
  try {
    console.log('Running database migration...');

    // Read SQL schema file
    const schemaPath = path.join(__dirname, '../../docs/database-schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    // Execute schema
    await db.query(schema);

    console.log('✅ Migration completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrate();
```

**Run the migration:**
```bash
cd backend
node scripts/migrate.js
```

### Step 2.4: Verify Database Setup

```bash
# Connect to database
psql $DATABASE_URL

# Verify tables
\dt

# Expected output:
# contacts, sources, consents, events, event_actions, orders, tracking_links

# Test query
SELECT COUNT(*) FROM contacts;

# Exit
\q
```

---

## Phase 3: Core Services

### Step 3.1: Contact Orchestration Service

**File: `backend/services/contactOrchestration.js`**
```javascript
const db = require('../config/database');
const eventService = require('./eventService');

class ContactOrchestrationService {
  /**
   * Normalize email address
   */
  static normalizeEmail(email) {
    return email.toLowerCase().trim();
  }

  /**
   * Upsert contact (create or update)
   */
  static async upsertContact(data) {
    const {
      email,
      phone,
      firstName,
      lastName,
      zipCode,
      source,
      metadata = {},
      utmSource,
      utmMedium,
      utmCampaign,
      ipAddress,
      userAgent
    } = data;

    const normalizedEmail = this.normalizeEmail(email);

    try {
      // Call database function
      const result = await db.query(
        `SELECT * FROM upsert_contact(
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
        )`,
        [
          normalizedEmail,
          phone,
          firstName,
          lastName,
          zipCode,
          source,
          JSON.stringify(metadata),
          utmSource,
          utmMedium,
          utmCampaign,
          ipAddress,
          userAgent
        ]
      );

      const contact = result.rows[0];

      // Trigger events
      if (contact.is_new) {
        await eventService.triggerEvent('email_captured', normalizedEmail, {
          source,
          metadata
        });
      }

      return {
        email: contact.email,
        isNew: contact.is_new,
        sourceAdded: contact.source_added
      };
    } catch (error) {
      console.error('Error in upsertContact:', error);
      throw error;
    }
  }

  /**
   * Get contact by email
   */
  static async getContact(email) {
    const normalizedEmail = this.normalizeEmail(email);

    const result = await db.query(
      'SELECT * FROM contact_summary WHERE email = $1',
      [normalizedEmail]
    );

    return result.rows[0] || null;
  }

  /**
   * Add consent
   */
  static async addConsent(email, consentType, granted, source, ipAddress = null) {
    const normalizedEmail = this.normalizeEmail(email);

    await db.query(
      'SELECT add_consent($1, $2, $3, $4, $5)',
      [normalizedEmail, consentType, granted, source, ipAddress]
    );

    return { success: true };
  }

  /**
   * Get contact consents
   */
  static async getConsents(email) {
    const normalizedEmail = this.normalizeEmail(email);

    const result = await db.query(
      'SELECT * FROM latest_consents WHERE contact_email = $1',
      [normalizedEmail]
    );

    return result.rows;
  }

  /**
   * Delete contact (soft delete)
   */
  static async deleteContact(email) {
    const normalizedEmail = this.normalizeEmail(email);

    await db.query(
      'UPDATE contacts SET deleted_at = NOW() WHERE email = $1',
      [normalizedEmail]
    );

    return { success: true };
  }
}

module.exports = ContactOrchestrationService;
```

### Step 3.2: Event Service

**File: `backend/services/eventService.js`**
```javascript
const db = require('../config/database');
const eventQueue = require('../config/queue');

// Event trigger rules (from architecture doc)
const TRIGGER_RULES = {
  email_captured: {
    post_quote: [
      { type: 'send_email', template: 'welcome_quote' },
      { type: 'add_to_sequence', sequence: 'quote_nurture' }
    ],
    drivers_ed: [
      { type: 'send_email', template: 'drivers_ed_confirmation' }
    ],
    store_waitlist: [
      { type: 'send_email', template: 'waitlist_confirmation' }
    ]
  },
  purchase_completed: {
    default: [
      { type: 'send_email', template: 'receipt_with_download' },
      { type: 'grant_access' }
    ]
  },
  policy_shared: {
    default: [
      { type: 'send_email', template: 'policy_received' },
      { type: 'notify_agent', channel: 'email' }
    ]
  }
};

class EventService {
  /**
   * Trigger an event and execute actions
   */
  static async triggerEvent(eventType, contactEmail, metadata = {}) {
    try {
      // Create event record
      const eventResult = await db.query(
        `INSERT INTO events (contact_email, event_type, source, metadata)
         VALUES ($1, $2, $3, $4)
         RETURNING event_id`,
        [contactEmail, eventType, metadata.source || null, JSON.stringify(metadata)]
      );

      const eventId = eventResult.rows[0].event_id;

      // Get trigger rules for this event
      const rules = TRIGGER_RULES[eventType];
      if (!rules) {
        console.log(`No trigger rules defined for event: ${eventType}`);
        return;
      }

      // Find matching rule based on source or use default
      const source = metadata.source || 'default';
      const actions = rules[source] || rules.default || [];

      // Queue actions
      for (const action of actions) {
        await this.queueAction(eventId, action, contactEmail, metadata);
      }

      return eventId;
    } catch (error) {
      console.error('Error triggering event:', error);
      throw error;
    }
  }

  /**
   * Queue an action for processing
   */
  static async queueAction(eventId, action, contactEmail, metadata) {
    // Insert event action
    await db.query(
      `INSERT INTO event_actions (event_id, action_type, action_data, status)
       VALUES ($1, $2, $3, 'pending')`,
      [eventId, action.type, JSON.stringify({ ...action, contactEmail, metadata })]
    );

    // Add to job queue for async processing
    await eventQueue.add('process-action', {
      eventId,
      action,
      contactEmail,
      metadata
    });
  }

  /**
   * Get events for a contact
   */
  static async getContactEvents(email, limit = 50) {
    const result = await db.query(
      `SELECT * FROM events
       WHERE contact_email = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [email, limit]
    );

    return result.rows;
  }
}

module.exports = EventService;
```

### Step 3.3: Email Service

**File: `backend/services/emailService.js`**
```javascript
const ConvertKit = require('convertkit-api');
// OR const { Resend } = require('resend');

const ck = new ConvertKit(process.env.CONVERTKIT_API_KEY);

// Email templates
const TEMPLATES = {
  welcome_quote: {
    subject: 'Thanks for your quote request!',
    tagId: process.env.CONVERTKIT_TAG_QUOTE || '12345',
    sequenceId: process.env.CONVERTKIT_SEQUENCE_NURTURE || '67890'
  },
  drivers_ed_confirmation: {
    subject: 'Your Drivers Ed link is ready',
    tagId: process.env.CONVERTKIT_TAG_DRIVERS_ED || '23456'
  },
  receipt_with_download: {
    subject: 'Your purchase receipt and download',
    tagId: process.env.CONVERTKIT_TAG_CUSTOMER || '34567'
  },
  policy_received: {
    subject: 'We received your policy information',
    tagId: process.env.CONVERTKIT_TAG_POLICY || '45678'
  },
  waitlist_confirmation: {
    subject: 'You\'re on the waitlist!',
    tagId: process.env.CONVERTKIT_TAG_WAITLIST || '56789'
  }
};

class EmailService {
  /**
   * Send email using template
   */
  static async sendEmail(templateName, contactEmail, data = {}) {
    const template = TEMPLATES[templateName];
    if (!template) {
      throw new Error(`Unknown email template: ${templateName}`);
    }

    try {
      // Add to ConvertKit
      await ck.addSubscriber({
        email: contactEmail,
        first_name: data.firstName,
        tags: [template.tagId],
        fields: {
          zip_code: data.zipCode,
          source: data.source
        }
      });

      console.log(`✅ Email sent: ${templateName} to ${contactEmail}`);
      return { success: true };
    } catch (error) {
      console.error(`❌ Email send failed:`, error);
      throw error;
    }
  }

  /**
   * Add to sequence
   */
  static async addToSequence(contactEmail, sequenceName) {
    const sequenceId = TEMPLATES[sequenceName]?.sequenceId;
    if (!sequenceId) {
      throw new Error(`Unknown sequence: ${sequenceName}`);
    }

    try {
      await ck.addSubscriberToSequence(sequenceId, {
        email: contactEmail
      });

      console.log(`✅ Added to sequence: ${sequenceName}`);
      return { success: true };
    } catch (error) {
      console.error(`❌ Add to sequence failed:`, error);
      throw error;
    }
  }

  /**
   * Tag subscriber
   */
  static async tagSubscriber(contactEmail, tagName) {
    const template = TEMPLATES[tagName];
    const tagId = template?.tagId;

    if (!tagId) {
      throw new Error(`Unknown tag: ${tagName}`);
    }

    try {
      await ck.tagSubscriber(tagId, { email: contactEmail });
      console.log(`✅ Tagged: ${tagName}`);
      return { success: true };
    } catch (error) {
      console.error(`❌ Tagging failed:`, error);
      throw error;
    }
  }
}

module.exports = EmailService;
```

### Step 3.4: Job Queue Configuration

**File: `backend/config/queue.js`**
```javascript
const Queue = require('bull');
const emailService = require('../services/emailService');
const db = require('./database');

const eventQueue = new Queue('event-processing', process.env.REDIS_URL);

// Process actions
eventQueue.process('process-action', async (job) => {
  const { eventId, action, contactEmail, metadata } = job.data;

  try {
    // Update status to processing
    await db.query(
      'UPDATE event_actions SET status = $1, processed_at = NOW() WHERE event_id = $2 AND action_type = $3',
      ['processing', eventId, action.type]
    );

    // Execute action
    switch (action.type) {
      case 'send_email':
        await emailService.sendEmail(action.template, contactEmail, metadata);
        break;

      case 'add_to_sequence':
        await emailService.addToSequence(contactEmail, action.sequence);
        break;

      case 'add_tag':
        await emailService.tagSubscriber(contactEmail, action.tag);
        break;

      case 'grant_access':
        // TODO: Implement access granting logic
        console.log('Grant access:', contactEmail, metadata.product_id);
        break;

      default:
        console.log('Unknown action type:', action.type);
    }

    // Mark as completed
    await db.query(
      'UPDATE event_actions SET status = $1, completed_at = NOW() WHERE event_id = $2 AND action_type = $3',
      ['completed', eventId, action.type]
    );

  } catch (error) {
    console.error('Action processing failed:', error);

    // Mark as failed and increment retry
    await db.query(
      `UPDATE event_actions
       SET status = 'failed', error_message = $1, retry_count = retry_count + 1
       WHERE event_id = $2 AND action_type = $3`,
      [error.message, eventId, action.type]
    );

    // Retry if under max retries
    const result = await db.query(
      'SELECT retry_count, max_retries FROM event_actions WHERE event_id = $1 AND action_type = $2',
      [eventId, action.type]
    );

    const { retry_count, max_retries } = result.rows[0];
    if (retry_count < max_retries) {
      throw error; // Bull will retry
    }
  }
});

module.exports = eventQueue;
```

---

## Phase 4: API Endpoints

### Step 4.1: Email Capture Endpoint

**File: `backend/routes/api/emailCapture.js`**
```javascript
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const ContactOrchestrationService = require('../../services/contactOrchestration');

router.post('/email-capture',
  // Validation
  [
    body('email').isEmail().normalizeEmail(),
    body('phone').optional().isMobilePhone(),
    body('source').isString(),
    body('context').optional().isString()
  ],
  async (req, res) => {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const {
        email,
        phone,
        firstName,
        lastName,
        zipCode,
        source,
        context,
        consent = {}
      } = req.body;

      // Upsert contact
      const result = await ContactOrchestrationService.upsertContact({
        email,
        phone,
        firstName,
        lastName,
        zipCode,
        source,
        metadata: { context },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      // Add consent if provided
      if (consent.marketing_email !== undefined) {
        await ContactOrchestrationService.addConsent(
          email,
          'marketing_email',
          consent.marketing_email,
          source,
          req.ip
        );
      }

      if (consent.sms_updates !== undefined && phone) {
        await ContactOrchestrationService.addConsent(
          email,
          'sms_updates',
          consent.sms_updates,
          source,
          req.ip
        );
      }

      res.json({
        success: true,
        contact: result
      });
    } catch (error) {
      console.error('Email capture error:', error);
      res.status(500).json({ error: 'Failed to capture email' });
    }
  }
);

module.exports = router;
```

### Step 4.2: Store Waitlist Endpoint

**File: `backend/routes/api/storeWaitlist.js`**
```javascript
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const ContactOrchestrationService = require('../../services/contactOrchestration');

router.post('/store-waitlist',
  [body('email').isEmail().normalizeEmail()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { email } = req.body;

      await ContactOrchestrationService.upsertContact({
        email,
        source: 'store_waitlist',
        metadata: { product_interest: 'physical_products' },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      res.json({ success: true });
    } catch (error) {
      console.error('Waitlist error:', error);
      res.status(500).json({ error: 'Failed to join waitlist' });
    }
  }
);

module.exports = router;
```

### Step 4.3: Drivers Ed Pre-capture Endpoint

**File: `backend/routes/api/driversEd.js`**
```javascript
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const ContactOrchestrationService = require('../../services/contactOrchestration');
const db = require('../../config/database');

router.post('/drivers-ed-capture',
  [
    body('email').isEmail().normalizeEmail(),
    body('course').isString()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { email, course } = req.body;

      // Upsert contact
      await ContactOrchestrationService.upsertContact({
        email,
        source: 'drivers_ed',
        metadata: { course },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      // Create tracking link
      const destinationUrls = {
        defensive_driving: 'https://insuredbycam.nationaldrivered.com/defensive',
        joshuas_law: 'https://insuredbycam.nationaldrivered.com/joshuas-law',
        returning_customer: 'https://insuredbycam.nationaldrivered.com/portal'
      };

      const result = await db.query(
        'SELECT * FROM create_tracking_link($1, $2, $3, $4, $5)',
        [
          email,
          destinationUrls[course],
          'national_drivers_ed',
          'drivers_ed',
          JSON.stringify({ course })
        ]
      );

      const trackingLink = result.rows[0];

      res.json({
        success: true,
        tracking_url: trackingLink.tracking_url
      });
    } catch (error) {
      console.error('Drivers ed capture error:', error);
      res.status(500).json({ error: 'Failed to create tracking link' });
    }
  }
);

module.exports = router;
```

### Step 4.4: Stripe Checkout Endpoint

**File: `backend/routes/api/stripe.js`**
```javascript
const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

router.post('/create-checkout-session', async (req, res) => {
  try {
    const { productId, productName, priceInCents } = req.body;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: productName,
            },
            unit_amount: priceInCents,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/products/${productId}`,
      metadata: {
        product_id: productId
      }
    });

    res.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('Stripe session creation error:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

module.exports = router;
```

### Step 4.5: Main API Router

**File: `backend/routes/api/index.js`**
```javascript
const express = require('express');
const router = express.Router();

// Import route modules
router.use(require('./emailCapture'));
router.use(require('./storeWaitlist'));
router.use(require('./driversEd'));
router.use(require('./stripe'));

module.exports = router;
```

### Step 4.6: Stripe Webhook Handler

**File: `backend/routes/webhooks/stripe.js`**
```javascript
const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const ContactOrchestrationService = require('../../services/contactOrchestration');
const db = require('../../config/database');

// Webhook endpoint (raw body needed for signature verification)
router.post('/stripe',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const sig = req.headers['stripe-signature'];

    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle event
    try {
      switch (event.type) {
        case 'checkout.session.completed':
          await handleCheckoutComplete(event.data.object);
          break;

        case 'payment_intent.succeeded':
          console.log('Payment succeeded:', event.data.object.id);
          break;

        default:
          console.log(`Unhandled event type: ${event.type}`);
      }

      res.json({ received: true });
    } catch (error) {
      console.error('Webhook handler error:', error);
      res.status(500).json({ error: 'Webhook handler failed' });
    }
  }
);

async function handleCheckoutComplete(session) {
  const { customer_details, metadata, amount_total } = session;

  // Upsert contact
  await ContactOrchestrationService.upsertContact({
    email: customer_details.email,
    phone: customer_details.phone,
    firstName: customer_details.name?.split(' ')[0],
    lastName: customer_details.name?.split(' ').slice(1).join(' '),
    source: 'stripe_purchase',
    metadata: {
      product_id: metadata.product_id,
      amount: amount_total,
      stripe_session_id: session.id
    }
  });

  // Create order record
  await db.query(
    `INSERT INTO orders (
      contact_email, stripe_session_id, stripe_payment_intent_id,
      product_id, product_name, amount_cents, status
    ) VALUES ($1, $2, $3, $4, $5, $6, 'completed')`,
    [
      customer_details.email,
      session.id,
      session.payment_intent,
      metadata.product_id,
      metadata.product_name || 'Unknown Product',
      amount_total
    ]
  );

  console.log('✅ Checkout completed for:', customer_details.email);
}

module.exports = router;
```

### Step 4.7: Canopy Webhook Handler (If Available)

**File: `backend/routes/webhooks/canopy.js`**
```javascript
const express = require('express');
const router = express.Router();
const ContactOrchestrationService = require('../../services/contactOrchestration');

router.post('/canopy', async (req, res) => {
  // TODO: Verify Canopy webhook signature if available
  const { event, data } = req.body;

  try {
    if (event === 'policy.shared' || event === 'connection.completed') {
      await ContactOrchestrationService.upsertContact({
        email: data.email || data.contact?.email,
        phone: data.phone || data.contact?.phone,
        firstName: data.first_name || data.contact?.first_name,
        lastName: data.last_name || data.contact?.last_name,
        source: 'policy_share',
        metadata: {
          canopy_session_id: data.session_id,
          policy_data: data.policy || {}
        }
      });

      console.log('✅ Canopy policy share captured:', data.email);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Canopy webhook error:', error);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

module.exports = router;
```

### Step 4.8: Webhook Router

**File: `backend/routes/webhooks/index.js`**
```javascript
const express = require('express');
const router = express.Router();

router.use(require('./stripe'));
router.use(require('./canopy'));

module.exports = router;
```

---

## Phase 5: Frontend Integration

### Step 5.1: Update Environment Variables

**File: `/src/config/api.js` (new file)**
```javascript
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export const API = {
  EMAIL_CAPTURE: `${API_BASE_URL}/api/email-capture`,
  STORE_WAITLIST: `${API_BASE_URL}/api/store-waitlist`,
  DRIVERS_ED_CAPTURE: `${API_BASE_URL}/api/drivers-ed-capture`,
  CREATE_CHECKOUT: `${API_BASE_URL}/api/create-checkout-session`,
};

export default API;
```

**File: `.env.local`**
```bash
VITE_API_URL=http://localhost:3000
```

### Step 5.2: Update EmailCapture Component

**File: `src/components/EmailCapture.jsx`**
```javascript
import { useState } from 'react';
import { API } from '../config/api';

export default function EmailCapture({ context = 'general', onSuccess }) {
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const response = await fetch(API.EMAIL_CAPTURE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          phone: phone || null,
          source: context,
          context,
          consent: {
            marketing_email: consent,
            sms_updates: phone ? consent : false
          }
        })
      });

      if (!response.ok) {
        throw new Error('Failed to submit');
      }

      setSubmitted(true);
      if (onSuccess) onSuccess();

      // Track in analytics
      if (window.gtag) {
        window.gtag('event', 'email_capture', { context });
      }
    } catch (error) {
      console.error('Email capture error:', error);
      alert('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="text-center p-6 bg-green-50 rounded-lg">
        <h3 className="text-xl font-bold text-green-800 mb-2">
          Success! Check your email.
        </h3>
        <p className="text-green-600">
          We've sent you a confirmation email.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium mb-1">
          Email Address *
        </label>
        <input
          type="email"
          id="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full px-4 py-2 border rounded-lg"
          placeholder="your@email.com"
        />
      </div>

      <div>
        <label htmlFor="phone" className="block text-sm font-medium mb-1">
          Phone Number (optional)
        </label>
        <input
          type="tel"
          id="phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="w-full px-4 py-2 border rounded-lg"
          placeholder="+1 (555) 123-4567"
        />
      </div>

      <div className="flex items-start">
        <input
          type="checkbox"
          id="consent"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-1 mr-2"
        />
        <label htmlFor="consent" className="text-sm text-gray-600">
          Send me insurance tips and updates
        </label>
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
      >
        {isSubmitting ? 'Submitting...' : 'Get Updates'}
      </button>
    </form>
  );
}
```

### Step 5.3: Update StorePage Waitlist

**File: `src/pages/StorePage.jsx`** (update waitlist section)
```javascript
import { API } from '../config/api';

// Inside StorePage component
const [waitlistEmail, setWaitlistEmail] = useState('');
const [waitlistSubmitted, setWaitlistSubmitted] = useState(false);

const handleWaitlistSubmit = async (e) => {
  e.preventDefault();

  try {
    const response = await fetch(API.STORE_WAITLIST, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: waitlistEmail })
    });

    if (!response.ok) throw new Error('Failed to join waitlist');

    setWaitlistSubmitted(true);
  } catch (error) {
    console.error('Waitlist error:', error);
    alert('Failed to join waitlist. Please try again.');
  }
};
```

### Step 5.4: Add Drivers Ed Email Gate

**File: `src/pages/DriversEdPage.jsx`** (add email gate modal)
```javascript
import { useState } from 'react';
import { API } from '../config/api';

export default function DriversEdPage() {
  const [showEmailGate, setShowEmailGate] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCourseClick = (courseType) => {
    setSelectedCourse(courseType);
    setShowEmailGate(true);
  };

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const response = await fetch(API.DRIVERS_ED_CAPTURE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, course: selectedCourse })
      });

      const data = await response.json();

      if (!response.ok) throw new Error('Failed to create tracking link');

      // Redirect to partner site with tracking
      window.location.href = data.tracking_url;
    } catch (error) {
      console.error('Drivers ed capture error:', error);
      alert('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      {/* Existing content */}

      {/* Email Gate Modal */}
      {showEmailGate && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-xl font-bold mb-4">
              One more step before we redirect you
            </h3>
            <p className="text-gray-600 mb-4">
              Enter your email so we can track your progress and send you updates.
            </p>

            <form onSubmit={handleEmailSubmit}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="your@email.com"
                className="w-full px-4 py-2 border rounded-lg mb-4"
              />

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowEmailGate(false)}
                  className="flex-1 px-4 py-2 border rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50"
                >
                  {isSubmitting ? 'Please wait...' : 'Continue'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Update course buttons to use handleCourseClick */}
      <button onClick={() => handleCourseClick('defensive_driving')}>
        Start Defensive Driving Course
      </button>
    </div>
  );
}
```

### Step 5.5: Update Product Checkout Flow

**File: `src/pages/ProductDetailPage.jsx`** (update checkout function)
```javascript
import { API } from '../config/api';

const handleCheckout = async () => {
  setIsProcessing(true);

  try {
    const response = await fetch(API.CREATE_CHECKOUT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: product.id,
        productName: product.title,
        priceInCents: product.price * 100
      })
    });

    const data = await response.json();

    if (!response.ok) throw new Error('Failed to create checkout session');

    // Redirect to Stripe checkout
    window.location.href = data.url;
  } catch (error) {
    console.error('Checkout error:', error);
    alert('Failed to start checkout. Please try again.');
  } finally {
    setIsProcessing(false);
  }
};
```

---

## Phase 6: External Integrations

### Step 6.1: ConvertKit Setup

1. **Create ConvertKit account** at https://convertkit.com
2. **Get API credentials:**
   - Go to Settings → API
   - Copy API Key and API Secret
   - Add to `.env` file

3. **Create tags:**
   - Quote Requested
   - Policy Shared
   - Customer
   - Drivers Ed Interest
   - Waitlist

4. **Create forms:**
   - Post Quote Form
   - Drivers Ed Form
   - Store Waitlist Form

5. **Create sequences:**
   - Quote Nurture Sequence
   - Customer Onboarding Sequence

6. **Update `.env` with tag/sequence IDs**

### Step 6.2: Stripe Setup

1. **Create Stripe account** at https://stripe.com
2. **Get API keys:**
   - Go to Developers → API keys
   - Copy Secret key and Publishable key
3. **Set up webhook:**
   ```bash
   # Install Stripe CLI
   brew install stripe/stripe-cli/stripe

   # Login
   stripe login

   # Forward webhooks to local
   stripe listen --forward-to localhost:3000/webhooks/stripe

   # Copy webhook signing secret to .env
   ```

4. **For production:**
   - Add webhook endpoint: `https://yourdomain.com/webhooks/stripe`
   - Select events: `checkout.session.completed`, `payment_intent.succeeded`
   - Copy webhook signing secret

### Step 6.3: Canopy Integration

1. **Contact Canopy support** to enable webhooks
2. **Request webhook events:**
   - `policy.shared`
   - `connection.completed`
3. **Get webhook signing secret**
4. **Add webhook URL:** `https://yourdomain.com/webhooks/canopy`

---

## Phase 7: Testing & Deployment

### Step 7.1: Local Testing

```bash
# Start database
docker-compose up -d

# Start backend
cd backend
npm run dev

# In another terminal, start frontend
cd ..
npm run dev

# Test email capture
curl -X POST http://localhost:3000/api/email-capture \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","source":"post_quote"}'

# Check database
psql $DATABASE_URL
SELECT * FROM contacts;
SELECT * FROM sources;
SELECT * FROM events;
```

### Step 7.2: Test Stripe Webhook Locally

```bash
# In one terminal
stripe listen --forward-to localhost:3000/webhooks/stripe

# In another terminal, trigger test webhook
stripe trigger checkout.session.completed
```

### Step 7.3: Deploy Backend

**Option A: Railway**
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Create new project
railway init

# Add PostgreSQL
railway add postgresql

# Add Redis
railway add redis

# Deploy
railway up

# Set environment variables
railway variables set CONVERTKIT_API_KEY=xxx
railway variables set STRIPE_SECRET_KEY=xxx
# ... etc
```

**Option B: Render**
1. Go to https://render.com
2. Create new Web Service
3. Connect GitHub repo
4. Add environment variables
5. Deploy

### Step 7.4: Update Frontend Environment

**File: `.env.production`**
```bash
VITE_API_URL=https://your-backend.railway.app
```

### Step 7.5: Deploy Frontend

```bash
# Build
npm run build

# Deploy to Vercel
npm install -g vercel
vercel

# Or commit and push to trigger Vercel deployment
git add .
git commit -m "Add unified CRM system"
git push
```

---

## Phase 8: Monitoring & Optimization

### Step 8.1: Set Up Logging

**Install logging library:**
```bash
cd backend
npm install winston
```

**File: `backend/config/logger.js`**
```javascript
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple(),
  }));
}

module.exports = logger;
```

### Step 8.2: Add Monitoring Dashboard

**Create admin dashboard endpoint:**
```javascript
// backend/routes/api/admin.js
router.get('/dashboard', async (req, res) => {
  const stats = await db.query(`
    SELECT
      (SELECT COUNT(*) FROM contacts WHERE deleted_at IS NULL) as total_contacts,
      (SELECT COUNT(*) FROM contacts WHERE created_at > NOW() - INTERVAL '7 days') as contacts_last_week,
      (SELECT COUNT(*) FROM events WHERE created_at > NOW() - INTERVAL '24 hours') as events_last_day,
      (SELECT COUNT(*) FROM orders WHERE status = 'completed') as total_orders
  `);

  const sources = await db.query(`
    SELECT source, COUNT(*) as count
    FROM sources
    WHERE captured_at > NOW() - INTERVAL '30 days'
    GROUP BY source
    ORDER BY count DESC
  `);

  res.json({
    stats: stats.rows[0],
    sources: sources.rows
  });
});
```

### Step 8.3: Performance Optimization

**Add database indexes (if not already present):**
```sql
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_last_seen ON contacts(last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_sources_source ON sources(source);
```

**Add caching with Redis:**
```javascript
const redis = require('redis');
const client = redis.createClient({ url: process.env.REDIS_URL });

// Cache contact lookup
async function getCachedContact(email) {
  const cached = await client.get(`contact:${email}`);
  if (cached) return JSON.parse(cached);

  const contact = await db.query('SELECT * FROM contacts WHERE email = $1', [email]);
  await client.setEx(`contact:${email}`, 3600, JSON.stringify(contact.rows[0]));

  return contact.rows[0];
}
```

---

## Verification Checklist

### Backend
- [ ] Backend server running
- [ ] Database connected
- [ ] All tables created
- [ ] Email service configured
- [ ] Stripe configured
- [ ] Job queue processing

### API Endpoints
- [ ] POST /api/email-capture working
- [ ] POST /api/store-waitlist working
- [ ] POST /api/drivers-ed-capture working
- [ ] POST /api/create-checkout-session working
- [ ] POST /webhooks/stripe working
- [ ] POST /webhooks/canopy working

### Frontend
- [ ] Email capture component updated
- [ ] Store waitlist form updated
- [ ] Drivers ed email gate added
- [ ] Stripe checkout updated
- [ ] All forms submit to backend

### Integration
- [ ] Emails captured in database
- [ ] De-duplication working
- [ ] Sources tagged correctly
- [ ] Events triggered
- [ ] Emails sent via ConvertKit
- [ ] Stripe webhooks received

### Data Verification
- [ ] Check `contacts` table has entries
- [ ] Check `sources` table has multiple sources per email
- [ ] Check `events` table has triggered events
- [ ] Check `event_actions` table shows completed actions
- [ ] Check `orders` table for Stripe purchases

---

## Troubleshooting

### Backend won't start
```bash
# Check logs
cd backend
npm run dev

# Common issues:
# - Missing .env file
# - Database connection failed
# - Port 3000 already in use (kill process or change port)
```

### Database connection failed
```bash
# Test connection
psql $DATABASE_URL

# If fails:
# - Check DATABASE_URL is correct
# - Check database exists
# - Check network access (firewall, IP whitelist)
```

### Emails not sending
```bash
# Check ConvertKit API key
curl -X GET "https://api.convertkit.com/v3/account?api_secret=YOUR_SECRET"

# Check job queue
# Install Redis CLI and check queue
redis-cli
> LLEN bull:event-processing:wait

# Check event_actions table
psql $DATABASE_URL
SELECT * FROM event_actions WHERE status = 'failed';
```

### Stripe webhook not working
```bash
# Check webhook secret
stripe listen --print-secret

# Verify webhook signature
# Check backend logs for signature verification errors

# Test webhook locally
stripe trigger checkout.session.completed
```

---

## Next Steps After Implementation

1. **Import existing contacts** from Canopy export
2. **Set up email sequences** in ConvertKit
3. **Create email templates** for each trigger
4. **Add more trigger rules** based on user behavior
5. **Implement A/B testing** for email campaigns
6. **Add SMS integration** (Twilio) if needed
7. **Create admin dashboard** for viewing contacts and stats
8. **Set up automated backups** for database
9. **Add GDPR compliance** features (data export, deletion requests)
10. **Monitor and optimize** based on metrics

---

**Document Version:** 1.0
**Estimated Implementation Time:** 2-3 weeks (full-time)
**Last Updated:** 2026-01-07
