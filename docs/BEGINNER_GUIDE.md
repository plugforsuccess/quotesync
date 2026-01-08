# Unified Email CRM System - Beginner's Guide

**Welcome!** This guide will walk you through implementing the email capture system step-by-step, assuming you're new to backend development.

---

## 🎯 What Are We Building?

Think of your website like a store. Right now, when people visit your store (website), they look around, maybe try on some clothes (browse your content), but then they leave **without giving you their contact info**. You have no way to follow up with them.

**This system is like a guest book** where visitors leave their email before they:
- Get an insurance quote
- Buy a digital product
- Sign up for drivers ed
- Join a waitlist

Then you can:
- Send them helpful emails
- Remind them to come back
- Turn them into customers

---

## 🏗️ The Big Picture: How It All Fits Together

```
┌─────────────────────────────────────────────────────────────┐
│  YOUR WEBSITE (Frontend - What users see)                   │
│  - Email forms                                               │
│  - "Buy Now" buttons                                         │
│  - Quote requests                                            │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  │ When user submits email...
                  ▼
┌─────────────────────────────────────────────────────────────┐
│  BACKEND SERVER (The brain - processes everything)          │
│  - Receives emails from forms                                │
│  - Checks if email already exists                            │
│  - Saves to database                                         │
│  - Sends welcome emails                                      │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  │ Stores everything in...
                  ▼
┌─────────────────────────────────────────────────────────────┐
│  DATABASE (The filing cabinet - permanent storage)          │
│  - Contact info (emails, names, phones)                      │
│  - Purchase history                                          │
│  - Where they came from                                      │
└─────────────────────────────────────────────────────────────┘
```

**Analogy:**
- **Frontend** = The storefront customers see
- **Backend** = The back office where work happens
- **Database** = Filing cabinet where you keep customer records

---

## 📚 Phase-by-Phase Breakdown

### Phase 1: Backend Foundation (Setting Up the Back Office)

**What we're doing:** Creating a "back office" server that can receive and process emails.

**Think of it like:** Setting up an office with a desk, phone, and filing system before you can start doing business.

#### Step 1.1: Create the Office Space (Directory Structure)

```bash
mkdir -p backend/{routes,services,middleware,utils,config}
```

**Translation:**
- `mkdir` = "make directory" (create folders)
- `-p` = "create parent folders if they don't exist"
- `{}` = creates multiple folders at once

**What you're creating:**
```
backend/
├── routes/        ← Phone lines (API endpoints that receive requests)
├── services/      ← Workers (code that does the actual work)
├── middleware/    ← Security guards (check requests before processing)
├── utils/         ← Tools (helper functions)
└── config/        ← Settings (database connections, API keys)
```

#### Step 1.2: Install Tools (Dependencies)

```bash
npm install express cors dotenv pg
```

**What each tool does:**

| Package | What It Does | Analogy |
|---------|-------------|---------|
| `express` | Creates web server | The building that houses your office |
| `cors` | Allows frontend to talk to backend | Security clearance badge |
| `dotenv` | Loads secret keys from `.env` file | Password manager |
| `pg` | Talks to PostgreSQL database | Database translator |
| `helmet` | Security protection | Security system for your office |
| `stripe` | Processes payments | Credit card machine |

**Why we need them:**
- **express**: Without this, you can't receive web requests
- **cors**: Prevents "blocked by CORS policy" errors
- **dotenv**: Keeps secrets (API keys) out of your code
- **pg**: Lets you save/retrieve data from database

#### Step 1.3: Create the Main Office Manager (server.js)

This file is the **boss** that coordinates everything.

**Let's break down `server.js` line by line:**

```javascript
require('dotenv').config();
```
**Translation:** "Load all my secret passwords and API keys from the .env file"

```javascript
const express = require('express');
const app = express();
```
**Translation:** "Import the express tool and create a new app"

```javascript
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
```
**Translation:** "Allow my website (frontend) to talk to this backend. If someone tries to access from a different website, block them."

**Why?** Browsers block requests from other domains for security. CORS says "it's okay, I trust my own website."

```javascript
app.use(express.json());
```
**Translation:** "When forms send data, automatically convert it to a format I can use (JSON)"

**Without this:** You'd receive gibberish like `[object Object]`

```javascript
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
```
**Translation:** "When someone visits `/health`, respond with 'I'm alive!'"

**Why?** This is a quick way to check if your server is running. Visit `http://localhost:3000/health` in your browser.

```javascript
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});
```
**Translation:** "Start listening for requests on port 3000. Print a message when ready."

**Analogy:** Like opening your office doors at 9am and putting up the "OPEN" sign.

---

### Phase 2: Database Setup (Building the Filing Cabinet)

**What we're doing:** Creating a place to permanently store email addresses and customer data.

**Why we need it:** When your server restarts, everything in memory disappears. Database = permanent storage.

#### Understanding Databases

**Think of a database like Excel spreadsheets:**

**Contacts Table** (like a spreadsheet with columns)
```
| Email              | Phone        | First Name | Created At |
|--------------------|--------------|------------|------------|
| john@example.com   | 555-1234     | John       | 2026-01-07 |
| sarah@example.com  | 555-5678     | Sarah      | 2026-01-08 |
```

Each row = one contact
Each column = one piece of information

#### Step 2.1: Choose Your Database Host

**Option A: Railway (Recommended for beginners)**
- **Pros:** Easy setup, free tier, handles everything
- **Cons:** Need to create account

**Steps:**
1. Go to https://railway.app
2. Click "Start a New Project"
3. Click "Provision PostgreSQL"
4. Copy the `DATABASE_URL` they give you

**Option B: Docker (For local testing)**
- **Pros:** Run database on your computer, no account needed
- **Cons:** Need to install Docker first

**Which should you choose?**
- **Testing locally?** Use Docker
- **Want to deploy quickly?** Use Railway

#### Step 2.2: Connect to Database (database.js)

This file is like a **phone line to your filing cabinet**.

```javascript
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});
```

**Translation:**
- "Create a connection pool (phone line) to the database"
- "Use SSL (secure connection) in production"
- "Get the database location from environment variables"

**What's a connection pool?**
- Like having multiple phone lines instead of one
- If one call is busy, use another line
- More efficient than opening/closing connection each time

```javascript
module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};
```

**Translation:** "Export a `query` function that other files can use to talk to the database"

**How you'll use it:**
```javascript
const db = require('./config/database');
const result = await db.query('SELECT * FROM contacts');
// result.rows = array of contacts
```

#### Step 2.3: Create Tables (Run Migration)

**What's a migration?**
- A script that creates your database structure
- Like drawing the columns in your Excel spreadsheet

**The schema file creates 7 tables:**

1. **contacts** - Main customer list (email, name, phone)
2. **sources** - Where each contact came from (quote form, stripe, etc.)
3. **consents** - What they agreed to (marketing emails, SMS)
4. **events** - Log of everything that happened (email captured, purchase made)
5. **event_actions** - Automated actions taken (sent welcome email)
6. **orders** - Stripe purchases
7. **tracking_links** - Unique links for drivers ed tracking

**Run the migration:**
```bash
cd backend
node scripts/migrate.js
```

**What happens:**
1. Script reads `database-schema.sql`
2. Sends SQL commands to database
3. Database creates all 7 tables
4. Prints "✅ Migration completed successfully"

**Verify it worked:**
```bash
psql $DATABASE_URL
\dt    # Show all tables
```

You should see:
```
 contacts
 sources
 consents
 events
 event_actions
 orders
 tracking_links
```

---

### Phase 3: Core Services (Hiring Workers)

**What we're doing:** Creating specialized workers to handle specific tasks.

**Think of services like employees:**
- **Contact Orchestration** = HR Manager (manages all contact info)
- **Event Service** = Event Coordinator (triggers automated actions)
- **Email Service** = Marketing Manager (sends emails)

#### Service 1: Contact Orchestration (The HR Manager)

**File: `backend/services/contactOrchestration.js`**

**What it does:** Manages all contact information and prevents duplicates.

**Key function: `upsertContact()`**

```javascript
static async upsertContact(data) {
  const normalizedEmail = this.normalizeEmail(email);
  // Call database function...
}
```

**What's "upsert"?**
- **UP**date if exists
- In**SERT** if new
- Prevents duplicate email addresses

**Example:**

**First time John submits:**
```javascript
upsertContact({ email: 'john@example.com', source: 'post_quote' })
// Creates NEW contact
// Result: { isNew: true, email: 'john@example.com' }
```

**John submits again from different form:**
```javascript
upsertContact({ email: 'john@example.com', source: 'stripe_purchase' })
// UPDATES existing contact, adds new source
// Result: { isNew: false, sourceAdded: true }
```

**Why is this important?**
- Without it, you'd have duplicates: john@example.com listed 5 times
- Upsert = one contact, multiple sources tracked

**Visual:**
```
Before (Bad - Duplicates):
┌──────────────────┬─────────────┐
│ Email            │ Source      │
├──────────────────┼─────────────┤
│ john@example.com │ post_quote  │
│ john@example.com │ stripe      │  ← DUPLICATE!
│ john@example.com │ drivers_ed  │  ← DUPLICATE!
└──────────────────┴─────────────┘

After (Good - Single contact, multiple sources):
Contacts Table:
┌──────────────────┬────────────┐
│ Email            │ Created    │
├──────────────────┼────────────┤
│ john@example.com │ 2026-01-07 │
└──────────────────┴────────────┘

Sources Table:
┌──────────────────┬────────────┐
│ Email            │ Source     │
├──────────────────┼────────────┤
│ john@example.com │ post_quote │
│ john@example.com │ stripe     │
│ john@example.com │ drivers_ed │
└──────────────────┴────────────┘
```

#### Service 2: Event Service (The Event Coordinator)

**File: `backend/services/eventService.js`**

**What it does:** Triggers automated actions when something happens.

**Example scenario:**

```javascript
// User submits email from quote form
await eventService.triggerEvent('email_captured', 'john@example.com', {
  source: 'post_quote'
});
```

**What happens behind the scenes:**

1. **Creates event record** in database:
   ```
   Event: email_captured
   Contact: john@example.com
   Source: post_quote
   Time: 2026-01-07 10:30:00
   ```

2. **Looks up trigger rules:**
   ```javascript
   TRIGGER_RULES = {
     email_captured: {
       post_quote: [
         { type: 'send_email', template: 'welcome_quote' },
         { type: 'add_to_sequence', sequence: 'quote_nurture' }
       ]
     }
   }
   ```

3. **Queues actions:**
   - Action 1: Send welcome email
   - Action 2: Add to 7-day nurture sequence

4. **Job queue processes actions** (sends emails in background)

**Why use events?**
- **Separation of concerns:** Capturing email ≠ sending email
- **Reliability:** If email fails, retry automatically
- **Flexibility:** Easy to add new actions without changing code

**Analogy:**
- **Without events:** Chef takes order, cooks food, serves food, washes dishes (all at once)
- **With events:** Order → Kitchen ticket → Chef cooks → Server delivers → Dishwasher cleans (specialized roles)

#### Service 3: Email Service (The Marketing Manager)

**File: `backend/services/emailService.js`**

**What it does:** Sends emails via ConvertKit (email marketing platform).

**Why not send emails directly from your server?**
- **Deliverability:** Gmail/Yahoo will mark your emails as spam
- **Infrastructure:** You'd need to configure SPF, DKIM, DMARC records
- **Features:** ConvertKit provides templates, analytics, unsubscribe handling
- **Compliance:** Handles CAN-SPAM, GDPR requirements

**How it works:**

```javascript
await emailService.sendEmail('welcome_quote', 'john@example.com', {
  firstName: 'John',
  zipCode: '30307'
});
```

**Behind the scenes:**
1. Looks up template configuration
2. Calls ConvertKit API: "Add john@example.com with tag 'Quote Requested'"
3. ConvertKit sends the email from your account
4. Tracks opens, clicks, unsubscribes automatically

**Email Templates:**
```javascript
const TEMPLATES = {
  welcome_quote: {
    subject: 'Thanks for your quote request!',
    tagId: '12345',  // ConvertKit tag ID
    sequenceId: '67890'  // Email sequence ID
  }
}
```

**You'll configure these in ConvertKit's dashboard.**

---

### Phase 4: API Endpoints (Installing Phone Lines)

**What we're doing:** Creating URLs that your frontend can call to submit data.

**Analogy:** Like installing phone extensions in your office:
- Extension 101: Email capture
- Extension 102: Waitlist signup
- Extension 103: Drivers ed tracking

#### Understanding REST APIs

**REST API = A menu of actions your backend can perform**

**Each endpoint has:**
- **URL:** Where to send the request (`/api/email-capture`)
- **Method:** What action to take (`POST` = create/submit)
- **Input:** Data you send (email, name)
- **Output:** Response you get back (success/failure)

**Example conversation:**

**Frontend (website):**
```
POST /api/email-capture
{
  "email": "john@example.com",
  "source": "post_quote"
}
```

**Backend:**
```
200 OK
{
  "success": true,
  "contact": {
    "email": "john@example.com",
    "isNew": true
  }
}
```

#### Endpoint 1: Email Capture

**File: `backend/routes/api/emailCapture.js`**

Let's break down this endpoint step-by-step:

```javascript
router.post('/email-capture',
```
**Translation:** "When someone POSTs to `/api/email-capture`, do the following..."

```javascript
  [
    body('email').isEmail().normalizeEmail(),
    body('phone').optional().isMobilePhone(),
  ],
```
**Translation:** "First, validate the input:"
- Email must be valid format (no `john@fake` accepted)
- Phone is optional, but if provided, must be valid
- `normalizeEmail()` converts `John@EXAMPLE.com` → `john@example.com`

**Why validate?**
- **Security:** Prevents injection attacks
- **Data quality:** Ensures clean data in database
- **User experience:** Catches typos early

```javascript
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
```
**Translation:** "If validation failed, send back a 400 error with details"

**Example error response:**
```json
{
  "errors": [
    {
      "msg": "Invalid value",
      "param": "email",
      "location": "body"
    }
  ]
}
```

```javascript
    try {
      const { email, phone, source } = req.body;

      const result = await ContactOrchestrationService.upsertContact({
        email,
        phone,
        source,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });
```
**Translation:**
- "Extract email, phone, source from request"
- "Call the HR Manager (ContactOrchestration) to save this contact"
- "Also save IP address and browser info for tracking"

**Why save IP & user agent?**
- **Fraud detection:** Multiple signups from same IP
- **GDPR compliance:** Required for consent records
- **Analytics:** Understand what devices users use

```javascript
      res.json({ success: true, contact: result });
```
**Translation:** "Send success response back to frontend"

```javascript
    } catch (error) {
      console.error('Email capture error:', error);
      res.status(500).json({ error: 'Failed to capture email' });
    }
  }
);
```
**Translation:** "If anything goes wrong, log the error and tell the user it failed"

**Why try/catch?**
- Database might be down
- Network might fail
- Don't show users raw error messages (security risk)

#### Endpoint 2: Drivers Ed with Tracking

**File: `backend/routes/api/driversEd.js`**

**What makes this special:** Creates a unique tracking link before redirecting.

**Flow:**
1. User submits email
2. Backend saves email
3. Backend creates tracking link: `https://insuredbycam.com/track/abc123`
4. Backend responds with tracking URL
5. Frontend redirects user to tracking URL
6. Tracking URL redirects to partner site
7. Backend logs the click

**Why track?**
- Know if user completed the course
- Attribute revenue if partner pays commission
- Follow up if user abandons

**The tracking link table:**
```
┌──────────────────┬──────────────┬─────────────────────────────┐
│ Email            │ Tracking Code│ Destination                  │
├──────────────────┼──────────────┼─────────────────────────────┤
│ john@example.com │ abc123       │ partner.com/defensive       │
└──────────────────┴──────────────┴─────────────────────────────┘
```

**When user clicks `track/abc123`:**
1. Backend looks up: "abc123 = john@example.com going to partner.com/defensive"
2. Increments click count
3. Logs timestamp
4. Redirects to partner.com

---

### Phase 5: Frontend Integration (Connecting the Phone Lines)

**What we're doing:** Updating your website forms to actually send data to the backend.

**Before (current state):**
```javascript
// Fake submission - data disappears
setTimeout(() => {
  console.log('Email submitted!');
}, 1000);
```

**After (with backend):**
```javascript
// Real submission - data saved permanently
const response = await fetch('http://localhost:3000/api/email-capture', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, source: 'post_quote' })
});
```

#### Step 5.1: Create API Config File

**File: `src/config/api.js`**

```javascript
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export const API = {
  EMAIL_CAPTURE: `${API_BASE_URL}/api/email-capture`,
  STORE_WAITLIST: `${API_BASE_URL}/api/store-waitlist`,
  DRIVERS_ED_CAPTURE: `${API_BASE_URL}/api/drivers-ed-capture`,
  CREATE_CHECKOUT: `${API_BASE_URL}/api/create-checkout-session`,
};
```

**Why create this file?**
- **One place to change URLs:** Update `VITE_API_URL` instead of finding/replacing everywhere
- **Environment-aware:** Uses localhost in development, production URL when deployed
- **Type safety:** Import `API` instead of typing URLs (prevents typos)

**How to use:**
```javascript
import { API } from '../config/api';

fetch(API.EMAIL_CAPTURE, { /* ... */ })
```

#### Step 5.2: Update EmailCapture Component

**Before (simulated):**
```javascript
const handleSubmit = async (e) => {
  e.preventDefault();
  setIsSubmitting(true);

  setTimeout(() => {
    setSubmitted(true);
    setIsSubmitting(false);
  }, 1000);
};
```

**After (real API call):**
```javascript
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
        consent: { marketing_email: consent }
      })
    });

    if (!response.ok) {
      throw new Error('Failed to submit');
    }

    setSubmitted(true);
  } catch (error) {
    console.error('Error:', error);
    alert('Something went wrong. Please try again.');
  } finally {
    setIsSubmitting(false);
  }
};
```

**Let's break this down:**

```javascript
const response = await fetch(API.EMAIL_CAPTURE, {
```
**Translation:** "Send a request to the backend email capture endpoint and wait for response"

**What's `await`?**
- Network requests take time (100-500ms)
- `await` = "pause here until response comes back"
- Without `await`, code would continue before response arrives

```javascript
  method: 'POST',
```
**Translation:** "This is a POST request (submitting data), not GET (retrieving data)"

**POST vs GET:**
- **GET:** Retrieve data (like loading a page)
- **POST:** Submit data (like submitting a form)
- **PUT:** Update existing data
- **DELETE:** Remove data

```javascript
  headers: { 'Content-Type': 'application/json' },
```
**Translation:** "The data I'm sending is in JSON format"

**Why?** Backend needs to know how to parse the data. Without this header, backend might misinterpret the data.

```javascript
  body: JSON.stringify({
    email,
    phone: phone || null,
    source: context,
    consent: { marketing_email: consent }
  })
```
**Translation:** "Convert this JavaScript object to a JSON string and send it"

**Why JSON.stringify?**
```javascript
// JavaScript object (can't send over network):
{ email: "john@example.com" }

// JSON string (can send):
'{"email":"john@example.com"}'
```

```javascript
if (!response.ok) {
  throw new Error('Failed to submit');
}
```
**Translation:** "If server responded with error status (400, 500), throw an error"

**HTTP status codes:**
- **200:** Success
- **400:** Bad request (validation error)
- **401:** Unauthorized (need to log in)
- **404:** Not found
- **500:** Server error

```javascript
} catch (error) {
  console.error('Error:', error);
  alert('Something went wrong. Please try again.');
}
```
**Translation:** "If anything goes wrong (network error, server error), show user-friendly message"

**Why catch errors?**
- Network might be down
- Server might be overloaded
- Don't show technical errors to users

```javascript
} finally {
  setIsSubmitting(false);
}
```
**Translation:** "No matter what (success or error), stop showing loading spinner"

**Why finally?**
- Runs whether try succeeds or catch fires
- Prevents UI being stuck in "loading" state

---

### Phase 6: External Integrations (Connecting to Outside Services)

#### ConvertKit Setup (Email Marketing Platform)

**Why use ConvertKit?**
- **You:** Can't send emails directly (Gmail will block you)
- **ConvertKit:** Has relationships with Gmail/Yahoo, emails get delivered
- **Plus:** Provides templates, automation, analytics

**Setup steps:**

1. **Create account** at convertkit.com ($29/month, or free alternatives like Resend)

2. **Get API credentials:**
   - Go to Settings → Advanced → API
   - Copy "API Key" and "API Secret"
   - Add to `backend/.env`:
     ```
     CONVERTKIT_API_KEY=your_api_key_here
     CONVERTKIT_API_SECRET=your_secret_here
     ```

3. **Create tags in ConvertKit:**
   - Click "Grow" → "Tags"
   - Create tags:
     - "Quote Requested"
     - "Policy Shared"
     - "Customer"
     - "Drivers Ed Interest"
     - "Waitlist"

4. **Get tag IDs:**
   - Click on a tag
   - URL will be: `app.convertkit.com/tags/123456`
   - `123456` = tag ID
   - Add to `.env`:
     ```
     CONVERTKIT_TAG_QUOTE=123456
     CONVERTKIT_TAG_CUSTOMER=234567
     ```

5. **Create email sequences:**
   - Click "Send" → "Sequences"
   - Create "Quote Nurture Sequence":
     - Day 0: Welcome email
     - Day 3: Educational content
     - Day 7: Case study
   - Copy sequence ID from URL
   - Add to `.env`:
     ```
     CONVERTKIT_SEQUENCE_NURTURE=345678
     ```

**How it connects:**
```
Your Backend → ConvertKit API → ConvertKit sends email → User's inbox
```

#### Stripe Setup (Payment Processing)

**Why use Stripe?**
- Handles credit card processing (you can't store card numbers yourself - PCI compliance)
- Prevents fraud
- Handles refunds, disputes
- Sends you money

**Setup steps:**

1. **Create account** at stripe.com

2. **Get test API keys:**
   - Click "Developers" → "API keys"
   - Copy "Publishable key" (starts with `pk_test_`)
   - Copy "Secret key" (starts with `sk_test_`)
   - Add to `backend/.env`:
     ```
     STRIPE_SECRET_KEY=sk_test_...
     STRIPE_PUBLISHABLE_KEY=pk_test_...
     ```

3. **Install Stripe CLI** (for testing webhooks locally):
   ```bash
   # Mac:
   brew install stripe/stripe-cli/stripe

   # Windows:
   # Download from: https://github.com/stripe/stripe-cli/releases
   ```

4. **Login to Stripe CLI:**
   ```bash
   stripe login
   # Opens browser, click "Allow access"
   ```

5. **Forward webhooks to local backend:**
   ```bash
   stripe listen --forward-to localhost:3000/webhooks/stripe
   ```

   **What this does:**
   - Stripe CLI listens for webhook events
   - When you make a test payment, Stripe sends webhook to CLI
   - CLI forwards it to your local server
   - You can test webhooks without deploying!

6. **Copy webhook secret:**
   - CLI will print: `whsec_...`
   - Add to `.env`:
     ```
     STRIPE_WEBHOOK_SECRET=whsec_...
     ```

**Testing the flow:**

```bash
# Terminal 1: Run your backend
cd backend
npm run dev

# Terminal 2: Forward webhooks
stripe listen --forward-to localhost:3000/webhooks/stripe

# Terminal 3: Trigger test payment
stripe trigger checkout.session.completed
```

**What you'll see:**
1. Terminal 3: "Event sent"
2. Terminal 2: "Forwarding event to localhost"
3. Terminal 1 (backend): "✅ Checkout completed for: test@example.com"

---

### Phase 7: Testing & Deployment

#### Local Testing Checklist

**1. Test database connection:**
```bash
psql $DATABASE_URL -c "SELECT COUNT(*) FROM contacts;"
# Expected: 0 (or count of test contacts)
```

**2. Test email capture endpoint:**
```bash
curl -X POST http://localhost:3000/api/email-capture \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","source":"post_quote"}'
```

**Expected response:**
```json
{
  "success": true,
  "contact": {
    "email": "test@example.com",
    "isNew": true,
    "sourceAdded": true
  }
}
```

**3. Verify database entry:**
```bash
psql $DATABASE_URL
SELECT * FROM contacts WHERE email = 'test@example.com';
SELECT * FROM sources WHERE contact_email = 'test@example.com';
SELECT * FROM events WHERE contact_email = 'test@example.com';
```

**4. Test duplicate submission:**
```bash
# Submit same email again
curl -X POST http://localhost:3000/api/email-capture \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","source":"stripe_purchase"}'
```

**Expected:**
```json
{
  "success": true,
  "contact": {
    "email": "test@example.com",
    "isNew": false,
    "sourceAdded": true
  }
}
```

**Verify in database:**
```sql
SELECT * FROM sources WHERE contact_email = 'test@example.com';
-- Should see TWO sources: post_quote AND stripe_purchase
```

#### Deployment to Production

**Option A: Railway (Easiest)**

**What Railway does:**
- Hosts your backend code
- Provides PostgreSQL database
- Provides Redis for job queue
- Gives you a URL: `your-app.railway.app`

**Steps:**

1. **Install Railway CLI:**
   ```bash
   npm install -g @railway/cli
   ```

2. **Login:**
   ```bash
   railway login
   ```

3. **Create new project:**
   ```bash
   cd backend
   railway init
   # Select "Create new project"
   # Name it: "quotesync-backend"
   ```

4. **Add database:**
   ```bash
   railway add
   # Select "PostgreSQL"
   ```

5. **Add Redis:**
   ```bash
   railway add
   # Select "Redis"
   ```

6. **Set environment variables:**
   ```bash
   railway variables set CONVERTKIT_API_KEY=your_key_here
   railway variables set STRIPE_SECRET_KEY=sk_test_...
   # ... set all variables from .env
   ```

7. **Deploy:**
   ```bash
   railway up
   ```

8. **Get your URL:**
   ```bash
   railway domain
   # Prints: https://quotesync-backend-production.up.railway.app
   ```

9. **Run migration:**
   ```bash
   railway run node scripts/migrate.js
   ```

10. **Test production endpoint:**
    ```bash
    curl -X POST https://your-app.railway.app/api/email-capture \
      -H "Content-Type: application/json" \
      -d '{"email":"test@example.com","source":"post_quote"}'
    ```

#### Update Frontend to Use Production Backend

**File: `.env.production`**
```bash
VITE_API_URL=https://your-app.railway.app
```

**Deploy frontend:**
```bash
npm run build
vercel --prod
```

---

## 🎓 Key Concepts for Beginners

### What is an API?

**API = Application Programming Interface**

**Think of it like a restaurant:**
- **You (Frontend):** Customer
- **Menu (API Documentation):** List of available actions
- **Waiter (API Endpoint):** Takes your order
- **Kitchen (Backend):** Prepares the food
- **Food (Response):** What you get back

**Example:**
```
You: "I'd like the email capture, please"
Waiter: "Sure, what email?"
You: "john@example.com from the quote form"
Kitchen: *saves to database*
Waiter: "Here's your confirmation"
```

### What is JSON?

**JSON = JavaScript Object Notation**

**A way to structure data that both humans and computers can read:**

```json
{
  "email": "john@example.com",
  "name": "John Doe",
  "consent": true
}
```

**Rules:**
- Keys in quotes: `"email"`
- Strings in quotes: `"john@example.com"`
- Numbers without quotes: `123`
- Booleans without quotes: `true`, `false`
- Arrays: `["item1", "item2"]`

### What is async/await?

**Handles operations that take time (like network requests):**

```javascript
// ❌ Wrong - doesn't wait for response
const response = fetch(url);
console.log(response); // undefined!

// ✅ Right - waits for response
const response = await fetch(url);
console.log(response); // actual response!
```

**Think of it like:**
- **Regular code:** "Do this, then immediately do this"
- **Async/await:** "Do this, WAIT for it to finish, THEN do this"

### What is a REST API?

**REST = Representational State Transfer**

**A set of rules for building APIs:**

| HTTP Method | Purpose | Example |
|------------|---------|---------|
| GET | Retrieve data | Get list of contacts |
| POST | Create data | Submit new email |
| PUT | Update data | Update contact info |
| DELETE | Remove data | Delete contact |

**Example REST API:**
```
GET    /api/contacts          → Get all contacts
GET    /api/contacts/:email   → Get one contact
POST   /api/contacts          → Create contact
PUT    /api/contacts/:email   → Update contact
DELETE /api/contacts/:email   → Delete contact
```

### What is a Database Index?

**Think of it like an index in a book:**

**Without index:**
- Want to find "email"?
- Read every page until you find it
- Slow! ❌

**With index:**
- Look up "email" in index
- Index says "page 234"
- Jump directly to page 234
- Fast! ✅

**In databases:**
```sql
CREATE INDEX idx_contacts_email ON contacts(email);
```
Now searching for an email is instant instead of scanning every row.

---

## 🚨 Common Beginner Mistakes

### 1. Forgetting to Start the Server

**Symptom:** Frontend shows "Failed to fetch" or "Network error"

**Fix:**
```bash
# Make sure backend is running!
cd backend
npm run dev
# Should print: "Backend server running on port 3000"
```

### 2. Wrong API URL

**Symptom:** 404 Not Found errors

**Check:**
```javascript
// ❌ Wrong
fetch('http://localhost:3000/email-capture')

// ✅ Right
fetch('http://localhost:3000/api/email-capture')
//                           ^^^^^ don't forget /api/
```

### 3. CORS Errors

**Symptom:** "Blocked by CORS policy"

**Fix:** Make sure CORS is configured in `server.js`:
```javascript
app.use(cors({
  origin: 'http://localhost:5173', // ← Your frontend URL
  credentials: true
}));
```

### 4. Forgetting .env File

**Symptom:** "DATABASE_URL is undefined"

**Fix:**
```bash
# Create .env file in backend folder
cd backend
touch .env

# Add your variables
echo "DATABASE_URL=postgresql://..." >> .env
```

### 5. Database Not Migrated

**Symptom:** "relation 'contacts' does not exist"

**Fix:**
```bash
cd backend
node scripts/migrate.js
```

### 6. Wrong Content-Type Header

**Symptom:** Backend receives empty `req.body`

**Fix:**
```javascript
fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json' // ← Don't forget this!
  },
  body: JSON.stringify(data)
})
```

---

## 📝 Checklist for Beginners

**Phase 1: Backend Setup**
- [ ] Created `backend/` folder structure
- [ ] Ran `npm init -y`
- [ ] Installed dependencies: `express`, `cors`, `dotenv`, `pg`
- [ ] Created `server.js` file
- [ ] Created `.env` file with DATABASE_URL
- [ ] Started server: `npm run dev`
- [ ] Tested health check: `http://localhost:3000/health`

**Phase 2: Database**
- [ ] Created PostgreSQL database (Railway or Docker)
- [ ] Copied DATABASE_URL to `.env`
- [ ] Created `config/database.js`
- [ ] Created `scripts/migrate.js`
- [ ] Ran migration: `node scripts/migrate.js`
- [ ] Verified tables: `psql $DATABASE_URL` then `\dt`

**Phase 3: Services**
- [ ] Created `services/contactOrchestration.js`
- [ ] Created `services/eventService.js`
- [ ] Created `services/emailService.js`
- [ ] Created `config/queue.js`

**Phase 4: API Endpoints**
- [ ] Created `routes/api/emailCapture.js`
- [ ] Created `routes/api/storeWaitlist.js`
- [ ] Created `routes/api/driversEd.js`
- [ ] Created `routes/api/stripe.js`
- [ ] Created `routes/webhooks/stripe.js`
- [ ] Created `routes/api/index.js`
- [ ] Tested with curl commands

**Phase 5: Frontend**
- [ ] Created `src/config/api.js`
- [ ] Created `.env.local` with `VITE_API_URL`
- [ ] Updated `EmailCapture.jsx` component
- [ ] Updated `StorePage.jsx` waitlist
- [ ] Updated `DriversEdPage.jsx` with email gate
- [ ] Updated `ProductDetailPage.jsx` checkout
- [ ] Tested forms in browser

**Phase 6: Integrations**
- [ ] Created ConvertKit account
- [ ] Added API keys to `.env`
- [ ] Created tags and sequences
- [ ] Created Stripe account
- [ ] Added Stripe keys to `.env`
- [ ] Tested webhook with Stripe CLI

**Phase 7: Deployment**
- [ ] Deployed backend to Railway
- [ ] Set all environment variables
- [ ] Ran migration on production database
- [ ] Updated frontend `.env.production`
- [ ] Deployed frontend to Vercel
- [ ] Tested production endpoints

---

## 🎯 Next Steps

1. **Read through this guide completely**
2. **Set up Phase 1** (backend foundation) and test it
3. **Set up Phase 2** (database) and verify tables exist
4. **Add Phase 3** (services) one at a time
5. **Test each phase** before moving to the next
6. **Ask questions** when you get stuck (check error messages carefully!)

**Remember:** Programming is like building with LEGO blocks. Each piece must click into place before adding the next. Take it slow, test frequently, and you'll succeed!

---

**Need help?** Common error messages and solutions in the troubleshooting section of `implementation-steps.md`.

**Document Version:** 1.0
**Target Audience:** Beginners with basic JavaScript knowledge
**Estimated Learning Time:** 1-2 weeks to understand all concepts
