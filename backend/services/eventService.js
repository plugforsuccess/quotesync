const db = require('../config/database');
const emailService = require('./emailService');

// Event trigger rules - defines what actions happen for each event
const TRIGGER_RULES = {
  email_captured: {
    post_quote: [
      { type: 'send_email', template: 'welcome_quote' }
    ],
    drivers_ed: [
      { type: 'send_email', template: 'drivers_ed_confirmation' }
    ],
    store_waitlist: [
      { type: 'send_email', template: 'waitlist_confirmation' }
    ],
    policy_share: [
      { type: 'send_email', template: 'policy_received' }
    ]
  },
  purchase_completed: {
    default: [
      { type: 'send_email', template: 'receipt_with_download' }
    ]
  }
};

class EventService {
  /**
   * Trigger an event and execute associated actions
   */
  static async triggerEvent(eventType, contactEmail, metadata = {}) {
    try {
      // Create event record
      const eventResult = await db.query(
        `INSERT INTO events (contact_email, event_type, source, metadata)
         VALUES ($1, $2, $3, $4)
         RETURNING event_id`,
        [
          contactEmail,
          eventType,
          metadata.source || null,
          JSON.stringify(metadata)
        ]
      );

      const eventId = eventResult.rows[0].event_id;

      console.log(`📊 Event triggered: ${eventType} for ${contactEmail}`);

      // Get trigger rules for this event
      const rules = TRIGGER_RULES[eventType];
      if (!rules) {
        console.log(`ℹ️  No trigger rules defined for event: ${eventType}`);
        return eventId;
      }

      // Find matching rule based on source or use default
      const source = metadata.source || 'default';
      const actions = rules[source] || rules.default || [];

      if (actions.length === 0) {
        console.log(`ℹ️  No actions defined for ${eventType} with source ${source}`);
        return eventId;
      }

      // Execute actions (in production, use a job queue for this)
      for (const action of actions) {
        await this.executeAction(eventId, action, contactEmail, metadata);
      }

      return eventId;
    } catch (error) {
      console.error('❌ Error triggering event:', error);
      throw error;
    }
  }

  /**
   * Execute a single action
   */
  static async executeAction(eventId, action, contactEmail, metadata) {
    try {
      console.log(`⚡ Executing action: ${action.type} for ${contactEmail}`);

      // Create action record
      await db.query(
        `INSERT INTO event_actions (event_id, action_type, action_data, status)
         VALUES ($1, $2, $3, 'processing')`,
        [eventId, action.type, JSON.stringify({ ...action, contactEmail, metadata })]
      );

      // Execute the action based on type
      switch (action.type) {
        case 'send_email':
          await emailService.sendEmail(action.template, contactEmail, metadata);
          break;

        default:
          console.log(`⚠️  Unknown action type: ${action.type}`);
      }

      // Mark as completed
      await db.query(
        `UPDATE event_actions
         SET status = 'completed', completed_at = NOW()
         WHERE event_id = $1 AND action_type = $2`,
        [eventId, action.type]
      );

      console.log(`✅ Action completed: ${action.type}`);
    } catch (error) {
      console.error(`❌ Action failed: ${action.type}`, error);

      // Mark as failed
      await db.query(
        `UPDATE event_actions
         SET status = 'failed', error_message = $1
         WHERE event_id = $2 AND action_type = $3`,
        [error.message, eventId, action.type]
      );

      // Don't throw - we don't want one action failure to stop others
    }
  }

  /**
   * Get events for a contact
   */
  static async getContactEvents(email, limit = 50) {
    try {
      const result = await db.query(
        `SELECT * FROM events
         WHERE contact_email = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [email, limit]
      );

      return result.rows;
    } catch (error) {
      console.error('Error in getContactEvents:', error);
      throw new Error(`Failed to get contact events: ${error.message}`);
    }
  }

  /**
   * Get failed actions that need retry
   */
  static async getFailedActions() {
    try {
      const result = await db.query(
        `SELECT * FROM event_actions
         WHERE status = 'failed'
         AND retry_count < max_retries
         ORDER BY created_at ASC
         LIMIT 100`
      );

      return result.rows;
    } catch (error) {
      console.error('Error in getFailedActions:', error);
      throw new Error(`Failed to get failed actions: ${error.message}`);
    }
  }
}

module.exports = EventService;
