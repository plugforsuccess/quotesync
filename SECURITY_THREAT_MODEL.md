# Newsroom Security Threat Model

**Last Updated:** January 2026
**System:** Insurance Newsroom CMS

---

## Threat: Unauthorized Story Publishing

### Attack Vectors

#### 1. Direct API Call to Supabase
**Scenario:** Attacker obtains Supabase URL and attempts to UPDATE story status to 'published'

**Example Attack:**
```javascript
// Malicious script
const { data } = await supabase
  .from('stories')
  .update({ status: 'published' })
  .eq('id', 'some-story-id');
```

**Defense:**
- ✅ **RLS Policy Enforcement** - Supabase checks `auth.uid()` against `user_roles` table
- ✅ **Admin-Only Policy** - Only users with `role = 'admin'` can UPDATE any story
- ✅ **Editor Restriction** - Editors can only UPDATE `status IN ('draft', 'review')`
- ✅ **Anon Key Limitation** - Supabase anon key has no special privileges

**Result:** `UPDATE` fails with permission error:
```
Error: new row violates row-level security policy for table "stories"
```

---

#### 2. Client-Side JavaScript Manipulation
**Scenario:** Attacker modifies client-side code to bypass role checks

**Example Attack:**
```javascript
// Browser console
setUserRole('admin'); // Try to fake admin role
handlePublish(storyId);
```

**Defense:**
- ✅ **No Reliance on Client State** - Role is fetched from server on every action
- ✅ **RLS Re-validates** - Even if client thinks user is admin, database checks actual role
- ✅ **JWT Verification** - Supabase verifies auth token on every request

**Result:** Database rejects UPDATE because `auth.uid()` doesn't have admin role

---

#### 3. Stolen Admin Credentials
**Scenario:** Attacker compromises admin account credentials

**Example Attack:**
```javascript
// Attacker logs in as admin
const { user } = await supabase.auth.signInWithPassword({
  email: 'admin@example.com',
  password: 'stolen-password'
});

// Now has legitimate admin access
await supabase.from('stories').update({ status: 'published' });
```

**Defense:**
- ⚠️ **Limited by Authentication Security**
- ✅ **Audit Trail** - All changes tracked with `author_id` and `updated_at`
- ✅ **Analytics Logging** - Story publishes tracked in `story_analytics`
- 🔄 **Recommended:** Enable Supabase MFA for admin accounts

**Mitigation:**
- Enable multi-factor authentication (MFA) in Supabase
- Monitor unusual publishing patterns via analytics
- Set up alerts for rapid-fire publishes

**Result:** Attack succeeds IF credentials compromised (standard auth threat)

---

#### 4. SQL Injection via Story Fields
**Scenario:** Attacker tries to inject SQL through story title/body

**Example Attack:**
```javascript
await supabase.from('stories').insert({
  title: "'; DROP TABLE stories; --",
  body: "malicious content"
});
```

**Defense:**
- ✅ **Parameterized Queries** - Supabase client uses prepared statements
- ✅ **No Raw SQL from Client** - All queries go through Supabase's query builder
- ✅ **Input Sanitization** - PostgreSQL escapes all input automatically

**Result:** Attack fails - title stored as literal string

---

#### 5. Feature Story Without Permission
**Scenario:** Non-admin tries to set `is_featured = true`

**Example Attack:**
```javascript
await supabase
  .from('stories')
  .update({ is_featured: true })
  .eq('id', 'my-story-id');
```

**Defense:**
- ✅ **Admin-Only UPDATE Policy** - Only admins can UPDATE any story
- ✅ **Editor Self-Restriction** - Editors can only UPDATE their own drafts
- ✅ **Feature Flag Protection** - `is_featured` field requires admin UPDATE permission

**Result:** UPDATE fails unless user is admin

---

## Defense-in-Depth Summary

### Layer 1: Client-Side (UX Protection)
- Role-based UI hiding
- Navigation guards
- **Purpose:** Prevent accidental misuse, NOT security

### Layer 2: Supabase RLS (Primary Security)
- Row-level security policies
- JWT-based auth validation
- Role hierarchy enforcement
- **Purpose:** ENFORCE all permissions at database level

### Layer 3: Database Triggers (Data Integrity)
- Auto-set timestamps
- Validate status transitions
- Audit logging
- **Purpose:** Maintain consistency even if policies bypass

---

## Permission Matrix

| Action | Viewer | Editor | Admin | RLS Policy |
|--------|--------|--------|-------|------------|
| View published stories | ✅ | ✅ | ✅ | `status = 'published'` |
| View all stories | ❌ | ✅ | ✅ | `role IN ('editor', 'admin')` |
| Create story | ❌ | ✅ | ✅ | `role IN ('editor', 'admin')` |
| Update own draft | ❌ | ✅ | ✅ | `author_id = auth.uid() AND status IN ('draft', 'review')` |
| Update any story | ❌ | ❌ | ✅ | `role = 'admin'` |
| Publish story | ❌ | ❌ | ✅ | `role = 'admin'` |
| Feature story | ❌ | ❌ | ✅ | `role = 'admin'` |
| Delete story | ❌ | ❌ | ✅ | `role = 'admin'` |

---

## Attack Surface Reduction

### What's Exposed?
- **Supabase URL** - Public (in client code)
- **Supabase Anon Key** - Public (in client code)
- **Story Content** - Public (published stories)

### What's Protected?
- **User Roles** - Server-side only (user_roles table)
- **Draft Content** - RLS prevents non-authors from viewing
- **Admin Actions** - Enforced by RLS policies
- **Service Role Key** - Never exposed to client

---

## Recommended Security Enhancements

### Immediate (Before Production)
1. ✅ **Enable RLS on all tables** - Already implemented
2. ✅ **Use anon key for client** - Already using
3. ⚠️ **Add rate limiting** - Supabase has built-in limits
4. ⚠️ **Enable MFA for admins** - Configure in Supabase Auth

### Future Enhancements
1. **Audit Log Table** - Track all publish/unpublish events
2. **Approval Workflow** - Require 2 admins to publish
3. **Scheduled Publishing** - Queue stories with publish time
4. **Content Moderation** - Flag stories for review before publish
5. **IP Allowlisting** - Restrict admin access to office IPs

---

## Monitoring & Alerting

### Key Metrics to Monitor
1. **Failed RLS Attempts** - Check Supabase logs for permission errors
2. **Rapid Publishing** - Alert if >5 stories published in 1 hour
3. **Account Creation** - Alert on new user_roles entries
4. **Unusual Login Patterns** - Geographic anomalies

### Supabase Dashboard Queries
```sql
-- Check for permission errors in last 24h
SELECT * FROM auth.logs
WHERE error IS NOT NULL
AND created_at > NOW() - INTERVAL '24 hours';

-- View recent publishes
SELECT s.id, s.title, s.published_at, u.email
FROM stories s
JOIN auth.users u ON s.author_id = u.id
WHERE s.status = 'published'
ORDER BY s.published_at DESC
LIMIT 20;
```

---

## Incident Response Plan

### If Unauthorized Publish Detected

1. **Immediately:**
   - Unpublish story via admin dashboard
   - Reset affected admin passwords
   - Check Supabase logs for unauthorized access

2. **Within 1 hour:**
   - Review all recent publishes
   - Check for additional compromised stories
   - Enable MFA if not already active

3. **Within 24 hours:**
   - Audit all user_roles entries
   - Review Supabase access logs
   - Update security policies if needed

---

## Compliance Notes

### Data Protection
- **Anonymous Analytics** - No PII in story_analytics table
- **Session IDs** - Generated client-side, not tied to users
- **Public Content** - Published stories are public by design

### Content Ownership
- **Source Attribution** - Required for third-party content
- **Copyright** - Admins responsible for verifying rights
- **DMCA Process** - Implement takedown request handling

---

## Testing Checklist

### Before Deploying
- [ ] Verify viewer cannot access /news/editor
- [ ] Verify editor cannot publish stories
- [ ] Verify editor can only edit own drafts
- [ ] Verify admin can publish any story
- [ ] Test RLS policies with different users
- [ ] Check Supabase logs for errors

### Penetration Testing
- [ ] Attempt direct API calls as non-admin
- [ ] Try to bypass client-side role checks
- [ ] Test SQL injection in all text fields
- [ ] Verify JWT token validation
- [ ] Check rate limiting effectiveness

---

## Conclusion

**Primary Security Mechanism:** Supabase Row-Level Security (RLS)

**Key Principle:** NEVER trust the client. All permissions enforced server-side.

**Attack Prevention:**
- ✅ Unauthorized publishing → Blocked by RLS
- ✅ Feature manipulation → Blocked by RLS
- ✅ Draft access → Blocked by RLS
- ✅ SQL injection → Blocked by parameterized queries
- ⚠️ Credential compromise → Standard auth threat (enable MFA)

**Confidence Level:** HIGH - Database-level enforcement means even if client is compromised, data remains protected.
