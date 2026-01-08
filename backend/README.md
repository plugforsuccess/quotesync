# QuoteSync Backend API

Backend API for the unified email capture and CRM system.

## Quick Start

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Set Up Environment Variables

Copy the `.env` file and add your API keys:

```bash
# Required
RESEND_API_KEY=your_resend_api_key_here

# The rest have defaults for local development
```

### 3. Start Database (Docker)

```bash
docker-compose up -d
```

This starts:
- PostgreSQL on port 5432
- pgAdmin (database GUI) on port 5050

### 4. Run Database Migration

```bash
npm run migrate
```

This creates all necessary tables.

### 5. Start Backend Server

```bash
npm run dev
```

Server will start on http://localhost:3000

### 6. Test It Works

Visit: http://localhost:3000/health

You should see:
```json
{
  "status": "ok",
  "timestamp": "2026-01-08T...",
  "environment": "development"
}
```

## API Endpoints

### Email Capture
```bash
POST /api/email-capture
Content-Type: application/json

{
  "email": "user@example.com",
  "phone": "+1-555-123-4567",
  "source": "post_quote",
  "firstName": "John",
  "lastName": "Doe",
  "consent": {
    "marketing_email": true,
    "sms_updates": false
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
```

### Drivers Ed Capture
```bash
POST /api/drivers-ed-capture
Content-Type: application/json

{
  "email": "user@example.com",
  "course": "defensive_driving"
}
```

### Canopy (via Zapier)
```bash
POST /api/canopy-zapier
Content-Type: application/json

{
  "email": "user@example.com",
  "phone": "+1-555-123-4567",
  "firstName": "John",
  "lastName": "Doe",
  "policyData": {...}
}
```

## Testing

### Test Email Capture

```bash
curl -X POST http://localhost:3000/api/email-capture \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "source": "post_quote",
    "consent": {"marketing_email": true}
  }'
```

### Check Database

```bash
# Connect to database
docker exec -it quotesync_postgres psql -U postgres -d quotesync_crm

# View contacts
SELECT * FROM contacts;

# View sources
SELECT * FROM sources;

# Exit
\q
```

### Use pgAdmin (GUI)

1. Open http://localhost:5050
2. Login:
   - Email: `admin@quotesync.local`
   - Password: `admin`
3. Add server:
   - Host: `host.docker.internal` (Windows/Mac) or `172.17.0.1` (Linux)
   - Port: `5432`
   - Username: `postgres`
   - Password: `password`
   - Database: `quotesync_crm`

## Project Structure

```
backend/
├── config/
│   └── database.js          # Database connection
├── routes/
│   └── api/
│       ├── index.js         # Main API router
│       ├── emailCapture.js  # Email capture endpoint
│       ├── storeWaitlist.js # Waitlist endpoint
│       ├── driversEd.js     # Drivers ed + tracking
│       └── canopyZapier.js  # Canopy via Zapier
├── services/
│   ├── contactOrchestration.js  # Main contact management
│   ├── eventService.js          # Event triggers
│   └── emailService.js          # Email sending (Resend)
├── scripts/
│   └── migrate.js           # Database migration script
├── .env                     # Environment variables
├── docker-compose.yml       # Docker services
├── package.json             # Dependencies
└── server.js                # Main entry point
```

## Available Scripts

```bash
npm run dev       # Start with auto-reload (nodemon)
npm start         # Start production server
npm run migrate   # Run database migration
```

## Troubleshooting

### "Database connection failed"

1. Make sure Docker is running
2. Check containers: `docker-compose ps`
3. Restart: `docker-compose restart postgres`

### "RESEND_API_KEY not set"

1. Get key from https://resend.com/api-keys
2. Add to `.env` file
3. Restart server

### "Port 3000 already in use"

```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <pid> /F

# Mac/Linux
lsof -ti:3000 | xargs kill -9
```

## Next Steps

1. **Add your Resend API key** to `.env`
2. **Update frontend** to use `http://localhost:3000/api` endpoints
3. **Set up Zapier** for Canopy integration
4. **Deploy** to Render.com when ready

## Documentation

Full documentation in `/docs`:
- `BEGINNER_GUIDE.md` - Detailed explanations
- `FREE_TIER_SETUP.md` - Free deployment guide
- `implementation-steps.md` - Complete implementation guide
- `unified-crm-architecture.md` - System architecture

## Support

Questions? Check the troubleshooting guides in the docs folder.
