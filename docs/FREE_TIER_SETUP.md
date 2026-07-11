# Free Tier Setup Guide - Zero Cost Implementation

This guide shows you how to implement the unified email CRM system **completely free** using Docker locally and free deployment options.

---

## 💰 Cost Breakdown

| Component | Free Option | Cost | Limitations |
|-----------|------------|------|-------------|
| **Local Database** | Docker PostgreSQL | **$0** | Runs on your computer |
| **Local Redis** | Docker Redis | **$0** | Runs on your computer |
| **Production Database** | Supabase | **$0** | 500MB storage, 2GB bandwidth |
| **Production Backend** | Render.com | **$0** | Sleeps after 15min, 750hrs/month |
| **Email Service** | Resend | **$0** | 3,000 emails/month |
| **Stripe** | Stripe | **$0** | 2.9% + 30¢ per transaction |
| **Zapier (Canopy)** | Zapier | **$0** | 100 tasks/month |
| **Frontend Hosting** | Vercel | **$0** | Unlimited (you're already using this) |
| **TOTAL** | | **$0/month** | ✅ Fully functional |

**Note:** Stripe takes a percentage of transactions, but there's no monthly fee.

---

## Phase 2: Database Setup (FREE with Docker)

### Option A: Docker (Recommended for Development)

**Pros:**
- ✅ 100% free
- ✅ Runs on your computer
- ✅ No signup required
- ✅ Full PostgreSQL + Redis
- ✅ No time limits
- ✅ Perfect for learning

**Cons:**
- ❌ Only accessible from your computer
- ❌ Data lost if you delete container (but easy to backup)

### Step 2.1: Install Docker Desktop

**Windows:**
1. Download: https://www.docker.com/products/docker-desktop/
2. Run installer
3. Restart computer if prompted
4. Start Docker Desktop

**Mac:**
1. Download: https://www.docker.com/products/docker-desktop/
2. Drag to Applications folder
3. Open Docker Desktop

**Verify installation:**
```bash
docker --version
# Should show: Docker version 24.x.x
```

### Step 2.2: Create Docker Compose File

**For Windows PowerShell:**
```powershell
cd backend
New-Item -ItemType File -Path docker-compose.yml
code docker-compose.yml
```

**For Mac/Linux or Git Bash:**
```bash
cd backend
touch docker-compose.yml
code docker-compose.yml
```

**Paste this into `backend/docker-compose.yml`:**

```yaml
version: '3.8'

services:
  # PostgreSQL Database
  postgres:
    image: postgres:14
    container_name: quotesync_postgres
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
      POSTGRES_DB: quotesync_crm
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

  # Redis (for job queue)
  redis:
    image: redis:7
    container_name: quotesync_redis
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/var/lib/redis
    restart: unless-stopped

  # pgAdmin (optional - database GUI)
  pgadmin:
    image: dpage/pgadmin4:latest
    container_name: quotesync_pgadmin
    environment:
      PGADMIN_DEFAULT_EMAIL: admin@quotesync.local
      PGADMIN_DEFAULT_PASSWORD: admin
    ports:
      - "5050:80"
    depends_on:
      - postgres
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
```

### Step 2.3: Start Docker Services

**Windows PowerShell:**
```powershell
# Start services (first time takes 1-2 minutes to download images)
docker-compose up -d

# Check if running
docker-compose ps
```

**Mac/Linux:**
```bash
docker-compose up -d
docker-compose ps
```

**You should see:**
```
NAME                  IMAGE               STATUS
quotesync_postgres    postgres:14         Up
quotesync_redis       redis:7             Up
quotesync_pgadmin     pgadmin4            Up
```

### Step 2.4: Update .env File

**File: `backend/.env`**
```bash
# Server
PORT=3000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173

# Database (Docker)
DATABASE_URL=postgresql://postgres:password@localhost:5432/quotesync_crm

# Redis (Docker)
REDIS_URL=redis://localhost:6379

# Email Service (Resend - free tier)
RESEND_API_KEY=

# Stripe (get from stripe.com)
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PUBLISHABLE_KEY=

# Zapier (no keys needed - Zapier handles auth)
# We'll set up the Zap URL later
```

### Step 2.5: Verify Database Connection

**Test connection with psql:**
```bash
# Install psql client if not installed
# Windows: Download from https://www.postgresql.org/download/windows/
# Mac: brew install postgresql

# Connect to database
psql postgresql://postgres:password@localhost:5432/quotesync_crm

# You should see:
# quotesync_crm=#

# List databases
\l

# Exit
\q
```

**Or use pgAdmin (GUI):**
1. Open browser: http://localhost:5050
2. Login:
   - Email: `admin@quotesync.local`
   - Password: `admin`
3. Add new server:
   - Name: QuoteSync Local
   - Host: `host.docker.internal` (Windows/Mac) or `172.17.0.1` (Linux)
   - Port: `5432`
   - Username: `postgres`
   - Password: `password`

### Step 2.6: Run Database Migration

**Create migration script:**

**File: `backend/scripts/migrate.js`**
```javascript
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function migrate() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  try {
    console.log('Connecting to database...');
    await client.connect();

    console.log('Running database migration...');

    // Read SQL schema file
    const schemaPath = path.join(__dirname, '../../docs/database-schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    // Execute schema
    await client.query(schema);

    console.log('✅ Migration completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

migrate();
```

**Create scripts folder:**
```bash
mkdir backend/scripts
```

**Run migration:**
```bash
cd backend
node scripts/migrate.js
```

**Expected output:**
```
Connecting to database...
Running database migration...
✅ Migration completed successfully
```

**Verify tables were created:**
```bash
psql postgresql://postgres:password@localhost:5432/quotesync_crm

\dt

# Should show:
# contacts, sources, consents, events, event_actions, orders, tracking_links

\q
```

---

## Docker Commands Cheat Sheet

```bash
# Start services
docker-compose up -d

# Stop services
docker-compose down

# Stop and delete all data (fresh start)
docker-compose down -v

# View logs
docker-compose logs postgres
docker-compose logs redis

# Check status
docker-compose ps

# Restart a service
docker-compose restart postgres

# Access PostgreSQL shell directly
docker exec -it quotesync_postgres psql -U postgres -d quotesync_crm
```

---

## Phase 6: External Integrations (Free Tier)

### Integration 1: Resend (Free Email Service)

**Why Resend instead of ConvertKit:**
- ✅ **Free tier:** 3,000 emails/month (vs $29/month for ConvertKit)
- ✅ **Simple API:** Easy to integrate
- ✅ **Good deliverability:** Trusted by developers
- ❌ **No sequences:** Can't do automated email courses (but you can build this yourself)

**Setup:**

1. **Create account:** https://resend.com/signup
2. **Get API key:**
   - Go to: https://resend.com/api-keys
   - Click "Create API Key"
   - Name it: "QuoteSync Backend"
   - Copy the key

3. **Add to .env:**
   ```bash
   RESEND_API_KEY=re_123abc...
   ```

4. **Install Resend SDK:**
   ```bash
   npm install resend
   ```

5. **Update Email Service:**

**File: `backend/services/emailService.js`**
```javascript
const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

class EmailService {
  /**
   * Send email using Resend
   */
  static async sendEmail(templateName, contactEmail, data = {}) {
    const templates = {
      welcome_quote: {
        subject: 'Thanks for your quote request!',
        html: `
          <h1>Hi ${data.firstName || 'there'}!</h1>
          <p>Thanks for requesting a quote. We'll be in touch soon.</p>
        `
      },
      drivers_ed_confirmation: {
        subject: 'Your Drivers Ed link is ready',
        html: `
          <h1>Ready to start your course?</h1>
          <p>Click the link we just gave you to get started.</p>
        `
      },
      receipt_with_download: {
        subject: 'Your purchase receipt and download',
        html: `
          <h1>Thanks for your purchase!</h1>
          <p>Download your product: ${data.downloadLink}</p>
        `
      },
      waitlist_confirmation: {
        subject: "You're on the waitlist!",
        html: `
          <h1>You're in!</h1>
          <p>We'll let you know when our products are available.</p>
        `
      }
    };

    const template = templates[templateName];
    if (!template) {
      throw new Error(`Unknown email template: ${templateName}`);
    }

    try {
      await resend.emails.send({
        from: 'InsuredByCam <noreply@insuredbycam.com>', // Use your verified domain
        to: contactEmail,
        subject: template.subject,
        html: template.html
      });

      console.log(`✅ Email sent: ${templateName} to ${contactEmail}`);
      return { success: true };
    } catch (error) {
      console.error(`❌ Email send failed:`, error);
      throw error;
    }
  }
}

module.exports = EmailService;
```

**Note:** You'll need to verify your domain in Resend to send from `@insuredbycam.com`. Until then, use Resend's default domain.

### Integration 2: Stripe (Free + Transaction Fees)

**Same setup as original guide** - No changes needed.

**Costs:**
- Monthly fee: **$0**
- Per transaction: **2.9% + 30¢**

Example: $37 product = $1.37 fee, you keep $35.63

### Integration 3: Canopy via Zapier (Free Tier)

**Why Zapier:**
- ✅ You don't have direct Canopy API access
- ✅ Canopy → Zapier webhook is available to you
- ✅ Free tier: 100 tasks/month (100 policy shares)
- ✅ Visual interface (easy to set up)

**Setup:**

1. **Create Zapier account:** https://zapier.com/sign-up (free tier)

2. **Create new Zap:**
   - Click "Create Zap"
   - Name it: "Canopy to QuoteSync"

3. **Set up Trigger:**
   - Search for "Canopy Connect"
   - Select trigger event: "New Connection" or "Policy Shared" (whatever Canopy provides)
   - Connect your Canopy account
   - Test trigger

4. **Set up Action:**
   - Search for "Webhooks by Zapier"
   - Choose: "POST"
   - URL: `https://your-backend.onrender.com/api/canopy-zapier`
   - Payload Type: JSON
   - Data:
     ```json
     {
       "email": "{{email}}",
       "phone": "{{phone}}",
       "firstName": "{{first_name}}",
       "lastName": "{{last_name}}",
       "policyData": "{{policy_data}}"
     }
     ```
   - Test action

5. **Turn on Zap**

**Backend Endpoint:**

**File: `backend/routes/api/canopyZapier.js`**
```javascript
const express = require('express');
const router = express.Router();
const ContactOrchestrationService = require('../../services/contactOrchestration');

router.post('/canopy-zapier', async (req, res) => {
  try {
    const { email, phone, firstName, lastName, policyData } = req.body;

    console.log('📥 Canopy data received via Zapier:', { email, firstName, lastName });

    // Upsert contact
    await ContactOrchestrationService.upsertContact({
      email,
      phone,
      firstName,
      lastName,
      source: 'policy_share',
      metadata: {
        canopy_data: policyData,
        via: 'zapier',
        received_at: new Date().toISOString()
      }
    });

    console.log('✅ Canopy policy share captured:', email);

    res.json({
      success: true,
      message: 'Contact captured successfully'
    });
  } catch (error) {
    console.error('❌ Canopy Zapier error:', error);
    res.status(500).json({
      error: 'Failed to process',
      message: error.message
    });
  }
});

module.exports = router;
```

**Add to routes:**

**File: `backend/routes/api/index.js`**
```javascript
const express = require('express');
const router = express.Router();

router.use(require('./emailCapture'));
router.use(require('./storeWaitlist'));
router.use(require('./driversEd'));
router.use(require('./stripe'));
router.use(require('./canopyZapier')); // ← Add this

module.exports = router;
```

**Testing with Zapier:**

1. Use **ngrok** to expose local backend:
   ```bash
   npx ngrok http 3000
   # Gives you: https://abc123.ngrok.io
   ```

2. Update Zap URL to: `https://abc123.ngrok.io/api/canopy-zapier`

3. Trigger test in Zapier

4. Check your database:
   ```bash
   psql postgresql://postgres:password@localhost:5432/quotesync_crm
   SELECT * FROM contacts WHERE source = 'policy_share';
   ```

---

## Phase 7: Deployment (Free Options)

### Option A: Render (Recommended - Easiest)

**What you get:**
- ✅ PostgreSQL database (90 days, then recreate)
- ✅ Web service hosting
- ✅ Automatic GitHub deployments
- ✅ SSL certificate included

**Limitations:**
- ⏰ Database expires after 90 days (export data, create new one)
- 😴 Service sleeps after 15 minutes inactivity
- 🐢 First request takes ~30 seconds (cold start)

**Setup:**

1. **Create account:** https://render.com

2. **Create PostgreSQL Database:**
   - Dashboard → "New +"
   - Select "PostgreSQL"
   - Name: `quotesync-db`
   - Database: `quotesync_crm`
   - User: `quotesync`
   - Region: Choose closest to you
   - Instance Type: **Free**
   - Click "Create Database"

3. **Copy connection details:**
   - Internal Database URL: `postgresql://quotesync:...@dpg-xxx/quotesync_crm`
   - External Database URL: `postgresql://quotesync:...@dpg-xxx-a.ohio-postgres.render.com/quotesync_crm`

4. **Create Web Service:**
   - Dashboard → "New +"
   - Select "Web Service"
   - Connect your GitHub repo
   - Root Directory: `backend`
   - Environment: `Node`
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Instance Type: **Free**

5. **Add Environment Variables:**
   - Click "Environment" tab
   - Add all variables from `.env`:
     ```
     DATABASE_URL=<paste from step 3>
     REDIS_URL=<we'll add this next>
     RESEND_API_KEY=re_...
     STRIPE_SECRET_KEY=sk_...
     FRONTEND_URL=https://quotesync.vercel.app
     ```

6. **Add Redis (Optional - for job queue):**
   - Sign up for Upstash: https://upstash.com (free tier)
   - Create Redis database
   - Copy connection URL
   - Add to Render environment variables

7. **Deploy:**
   - Click "Create Web Service"
   - Wait for deployment (~3 minutes)
   - You'll get URL: `https://quotesync-backend.onrender.com`

8. **Run Migration:**
   - Go to Shell tab
   - Run: `node scripts/migrate.js`

9. **Test:**
   ```bash
   curl https://quotesync-backend.onrender.com/health
   ```

### Option B: Supabase + Vercel Serverless (Most Advanced)

**What you get:**
- ✅ PostgreSQL database (free forever, 500MB)
- ✅ Serverless functions (free forever)
- ✅ No sleep/wake delays
- ✅ Auto-scaling

**Complexity:**
- 🔧 Requires converting Express app to serverless functions
- 📚 More setup steps

**I can help with this if you choose this option!**

---

## Quick Start Summary (Free Tier)

### Local Development (Phases 1-5)
```bash
# 1. Install Docker Desktop

# 2. Create docker-compose.yml
# (provided above)

# 3. Start services
docker-compose up -d

# 4. Update .env with local URLs
DATABASE_URL=postgresql://postgres:password@localhost:5432/quotesync_crm
REDIS_URL=redis://localhost:6379

# 5. Run migration
node scripts/migrate.js

# 6. Start backend
npm run dev
```

### Production Deployment (Phases 6-7)
```bash
# 1. Create Render account
# 2. Create PostgreSQL database
# 3. Create Web Service
# 4. Add environment variables
# 5. Deploy
# 6. Run migration
# 7. Update Zapier webhook URL
# 8. Update frontend VITE_API_URL
# 9. Test!
```

---

## Free Tier Limits

| Service | Free Limit | What Happens When Exceeded |
|---------|-----------|---------------------------|
| **Resend** | 3,000 emails/month | Need to upgrade or use another service |
| **Zapier** | 100 tasks/month | Zap stops, need to upgrade |
| **Render DB** | 90 days | Export data, create new DB |
| **Render Service** | 750 hours/month | More than enough (31 days = 744 hours) |
| **Supabase** | 500MB storage | Need to upgrade or clean old data |

**For most small businesses:** Free tier is enough for 6-12 months!

---

## Cost Optimization Tips

1. **Start local** (Docker) - Learn and test for free
2. **Use Resend** instead of ConvertKit - Save $29/month
3. **Use Zapier free tier** - 100 policy shares/month is plenty
4. **Deploy to Render** - Easy and free
5. **Upgrade only when needed** - Scale as you grow

**When to upgrade:**
- Resend: When sending >3,000 emails/month
- Zapier: When >100 policy shares/month
- Render: When database expires or need faster response times

---

## Backup Strategy (Important!)

**For Render (90-day database):**

**Before day 90, export your data:**

```bash
# Export database
pg_dump $DATABASE_URL > backup.sql

# Create new database on Render

# Import data
psql $NEW_DATABASE_URL < backup.sql

# Update environment variable
```

**Automated backup script:**

**File: `backend/scripts/backup.js`**
```javascript
const { exec } = require('child_process');
const fs = require('fs');

const timestamp = new Date().toISOString().split('T')[0];
const filename = `backup-${timestamp}.sql`;

exec(`pg_dump ${process.env.DATABASE_URL} > ${filename}`, (error) => {
  if (error) {
    console.error('Backup failed:', error);
    return;
  }
  console.log(`✅ Backup created: ${filename}`);
});
```

**Run weekly:**
```bash
node scripts/backup.js
```

---

**Ready to start?** Begin with Phase 1 (Backend Foundation) and use Docker for Phase 2 (Database)!

**Total setup time:** 2-3 hours for local development, 1 hour for deployment.

**Document Version:** 1.0 (Free Tier Edition)
**Last Updated:** 2026-01-08
