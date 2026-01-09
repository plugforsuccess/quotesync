# Quote Handling Standard Operating Procedure

**Version:** 1.0
**Last Updated:** January 9, 2026
**Owner:** Operations Team
**Review Frequency:** Quarterly

---

## Purpose

This SOP defines the daily workflow for managing insurance quote requests from initial submission through final disposition (sold or lost). Following this process ensures consistent customer experience and accurate tracking for performance analysis.

---

## Daily Workflow (Est. 30-45 minutes)

### Step 1: Access Quote Dashboard

1. Log into Supabase dashboard: https://supabase.com/dashboard/project/ghnpzllykteelveezhnv
2. Navigate to **Table Editor** → **quotes** table
3. Alternative: Access internal admin dashboard at `/admin/quotes` (when built)

### Step 2: Identify New Quotes

Filter criteria:
- `status = 'new'`
- `created_at > [yesterday's date]`

Expected volume: 3-10 quotes/day (current), 20-50/day (at scale)

### Step 3: Process Each New Quote

For each quote record:

#### A. Verify Data Completeness

**Required Fields:**
- ✅ `customer_email` or `customer_phone` (at least one)
- ✅ `zip_code`
- ✅ `canopy_quote_id` (confirms successful Canopy submission)

**If Missing Critical Data:**
- Update `status` → `lost`
- Set `lost_reason` → 'Incomplete contact information'
- Log in `notes`: "No email or phone provided, cannot follow up"
- STOP processing this quote

#### B. Check Service Area Eligibility

Verify ZIP code is within service area:
- Current: Georgia only (30000-31999, 39800-39901)
- Future: Check against `agency.service_zip_codes` array

**If Outside Service Area:**
- Update `status` → `lost`
- Set `lost_reason` → 'Outside service area'
- Send auto-response: "We appreciate your interest but don't currently serve [City]. Here are agents in your area: [link to state DOI agent finder]"
- STOP processing this quote

#### C. Assign to Agent (Multi-Tenant Only)

If multiple agents available:
- Check `assigned_zip_codes` for agents in the agency
- Assign quote to agent whose territory includes this ZIP
- Update `assigned_agent_id`

Current: Auto-assign to default agent (Cam)

#### D. Send Initial Outreach Email

**Template: NEW_QUOTE_EMAIL**

```
Subject: Your [Carrier] Quote Request - [Agent Name]

Hi [Customer Name or 'there' if name missing],

Thanks for requesting a quote through [Platform Name]. I'm [Agent Name],
your local licensed agent in [State].

I've received your information and will have a personalized quote ready
within 24 hours. In the meantime, here are the documents I'll need:

For Auto Insurance:
- Current policy declaration page
- Driver's licenses (all drivers)
- VIN numbers (all vehicles)

For Home Insurance:
- Current policy declaration page
- Property address and purchase date
- Recent home inspection (if available)

You can reply to this email or call me at [Phone].

Looking forward to saving you money!

Best,
[Agent Name]
[License #XXXXXXX]
[Email]
[Phone]

P.S. Did you know [Local Insurance Fact]? Check out our newsroom for more tips: [Link]
```

**Personalization Variables:**
- `[Customer Name]` → `quotes.customer_name` or 'there'
- `[Agent Name]` → `agencies.brand_name`
- `[Platform Name]` → 'InsuredByCam' or agency name
- `[State]` → Derived from ZIP code
- `[Carrier]` → `quotes.current_carrier` or 'current carrier'
- `[Local Insurance Fact]` → Rotate monthly (content calendar)

**Email Sending:**
- Current: Manual via `cameron@insuredbycam.com`
- Future: Automated via Resend/SendGrid API with templates

#### E. Update Quote Status

After sending email:
- Update `status` → 'contacted'
- Set `contacted_at` → Current timestamp
- Log in `notes`: "Initial outreach email sent [timestamp]"

---

## Follow-Up Workflow

### Day 2-3: First Follow-Up (If No Response)

Check for quotes where:
- `status = 'contacted'`
- `contacted_at` between 48-72 hours ago
- No reply received

**Template: FOLLOW_UP_EMAIL_1**

```
Subject: Quick Follow-Up: Your [Carrier] Quote

Hi [Customer Name],

Just wanted to make sure my last email didn't get lost in your inbox!

I'm ready to prepare your personalized quote comparison. To get you
the most accurate pricing, I just need:

[List from initial email]

Most of my clients save 15-30% by switching. The whole process takes
about 10 minutes.

When's a good time to chat this week?

Best,
[Agent Name]
[Phone]
```

Update `notes`: "Follow-up #1 sent [timestamp]"

### Day 5-7: Second Follow-Up (Last Attempt)

Check for quotes where:
- `status = 'contacted'`
- `contacted_at` > 5 days ago
- Still no reply

**Template: FOLLOW_UP_EMAIL_2**

```
Subject: Last Call: Your Insurance Quote Request

Hi [Customer Name],

I know life gets busy! This is my last email so I don't spam you.

I'm here whenever you're ready to review your insurance options.
Just reply to this email or give me a call.

In the meantime, here's a helpful resource: [Link to top newsroom story]

Best,
[Agent Name]
```

Update `notes`: "Final follow-up sent [timestamp]"

### Day 10: Mark as Lost (No Response)

For quotes where:
- `status = 'contacted'`
- `contacted_at` > 10 days ago
- No customer reply

**Action:**
- Update `status` → 'lost'
- Set `lost_reason` → 'No response to outreach'
- Add to re-engagement email list (quarterly)

---

## Quote-to-Sold Workflow

### When Customer Responds Positively

1. Schedule call or gather information via email
2. Access Canopy dashboard to review synced policy data
3. Prepare quote comparison (Canopy or carrier tools)
4. Update `status` → 'quoted'
5. Set `quoted_at` → timestamp
6. Log `quoted_premium` amount
7. Add `notes`: "Quote presented: [amount] for [coverage details]"

### When Customer Purchases

1. Finalize policy with carrier
2. Update `status` → 'sold'
3. Set `sold_at` → timestamp
4. Log `sold_premium` (final premium)
5. Calculate and log `commission_amount`
6. Add `notes`: "Policy bound: [policy number], effective [date]"

**Success Email Template:**

```
Subject: Welcome! Your New Policy is Active

Hi [Customer Name],

Congratulations on your new [carrier] policy! You're now covered with
[coverage summary].

Your policy documents will arrive via email from [carrier] within 24 hours.

Important Details:
- Policy Number: [XXX]
- Effective Date: [Date]
- Premium: $[Amount]/month
- Next Payment: [Date]

Questions? I'm here to help. Save my contact info:
- Email: [Email]
- Phone: [Phone]

Thank you for trusting me with your insurance!

Best,
[Agent Name]
```

### When Customer Declines

1. Ask (politely): "What was the main factor in your decision?"
2. Update `status` → 'lost'
3. Set `lost_reason` → Select from:
   - 'Price too high'
   - 'Chose competitor'
   - 'Decided not to switch'
   - 'Timing - not ready'
   - 'Coverage needs not met'
   - 'Other: [free text]'
4. Add `notes`: Full explanation of lost reason
5. Add to nurture campaign (send newsroom content monthly)

---

## Weekly Review (Est. 15 minutes)

Every Monday morning:

### 1. Pipeline Health Check

Run query:
```sql
SELECT
  status,
  COUNT(*) AS count,
  AVG(EXTRACT(EPOCH FROM (NOW() - created_at)) / 86400) AS avg_age_days
FROM quotes
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY status;
```

**Healthy Metrics:**
- `new`: <5 quotes (should be processed daily)
- `contacted`: 10-20 quotes (normal pipeline)
- `quoted`: 5-10 quotes (actively closing)
- `sold`: 8-15 quotes (target: 30% conversion)
- `lost`: 20-30 quotes (expected attrition)

**Red Flags:**
- `new` > 10 quotes → Falling behind on outreach
- `contacted` avg_age > 7 days → Need to follow up faster
- `quoted` avg_age > 5 days → Need to close faster

### 2. Lost Reason Analysis

```sql
SELECT
  lost_reason,
  COUNT(*) AS count
FROM quotes
WHERE status = 'lost' AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY lost_reason
ORDER BY count DESC;
```

**Action Items:**
- If 'Price too high' is #1 → Review carrier options, emphasize value-add
- If 'No response' is #1 → Test different email templates
- If 'Outside service area' is high → Consider expansion

### 3. Top Performers

Identify which lead sources are converting best:

```sql
SELECT
  COALESCE(utm_source, 'direct') AS source,
  COUNT(*) FILTER (WHERE status = 'sold') AS sold,
  COUNT(*) AS total,
  ROUND(COUNT(*) FILTER (WHERE status = 'sold')::NUMERIC / COUNT(*) * 100, 2) AS conv_rate
FROM quotes
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY utm_source
ORDER BY sold DESC;
```

**Action:** Double down on highest-converting sources

---

## Monthly Performance Report

First Monday of each month, generate and review:

### Key Metrics:
1. Total quotes received
2. Quotes sold (conversion rate)
3. Total premium sold
4. Total commission earned
5. Average days to close
6. Lost reasons breakdown
7. Lead source attribution

**Template:** See `QUOTE_FUNNEL_METRICS.pdf` example in main architecture doc

**Distribution:**
- Owner/Founder
- Platform admin (if multi-tenant)
- Investors (if applicable)

---

## Tools & Access

### Required Access:
- Supabase dashboard (read/write on quotes table)
- Email account (agent email)
- Canopy dashboard (view quote details)
- CRM (if integrated)

### Future Automation:
- Auto-send initial email via webhook
- Auto-assign agents by territory
- Auto-flag stale quotes (no activity in 7 days)
- Auto-generate weekly pipeline report

---

## Training Checklist

New agents must complete:

- [ ] Read this SOP in full
- [ ] Shadow experienced agent for 5 quote interactions
- [ ] Review 10 past quotes (mix of sold and lost)
- [ ] Practice using email templates
- [ ] Complete role-play scenarios:
  - Price objection
  - Coverage question
  - Competitor comparison
  - Customer goes dark (no response)
- [ ] Pass knowledge check quiz (90% minimum)

---

## Common Scenarios & Responses

### Scenario 1: "Your quote is higher than my current premium"

**Response:**
"I understand price is important. Let me make sure we're comparing apples to apples. Can you share your current declaration page? Often the difference is in coverage levels - you might have lower limits or higher deductibles than I quoted. Let's review together."

**Then:** Adjust quote or explain value of better coverage

---

### Scenario 2: "I'm getting quotes from 3 other agents"

**Response:**
"Smart move! Shopping around is the right thing to do. Here's what I'd focus on when comparing:
1. Coverage limits (not just price)
2. Deductibles
3. Additional coverages (rental car, roadside, etc.)
4. Claims service reputation

I'm confident we'll be competitive, and I'm here to explain any questions you have about the other quotes."

---

### Scenario 3: "I need to think about it"

**Response:**
"Of course! This is an important decision. What specific questions or concerns can I address while you're thinking it over? I want to make sure you have all the information you need."

**Then:**
- Address concerns
- Set follow-up date: "Can I check back with you on Friday?"
- Send helpful resource (newsroom article on their concern)

---

### Scenario 4: Customer ghosts (no response after initial interest)

**Action:**
- Follow standard 2-3-7-10 day cadence
- After 10 days, move to lost with reason 'No response'
- Add to quarterly re-engagement campaign
- Don't take personally - life happens!

---

## Compliance Notes

**Do NOT:**
- ❌ Make guarantees about specific savings ("You'll definitely save $500")
- ❌ Disparage other carriers or agents
- ❌ Offer rebates, cash incentives, or gift cards for purchasing
- ❌ Misrepresent coverage to get a sale
- ❌ Share customer information with third parties without consent

**DO:**
- ✅ Be honest about coverage differences
- ✅ Disclose all fees and charges
- ✅ Respect customer's decision
- ✅ Follow state insurance laws
- ✅ Document all interactions in notes field

---

## Emergency Contacts

**Technical Issues:**
- Supabase down → Contact: [Platform Admin]
- Canopy not working → Contact: Canopy support (support@usecanopy.com)
- Email deliverability issues → Check spam, contact IT

**Compliance Questions:**
- Contact: [Compliance Reviewer / Legal Counsel]
- DOI Hotline: [State-specific]

---

## Changelog

| Date | Version | Changes | Author |
|------|---------|---------|--------|
| 2026-01-09 | 1.0 | Initial SOP created | Platform Team |

---

**Next Review Date:** April 9, 2026
