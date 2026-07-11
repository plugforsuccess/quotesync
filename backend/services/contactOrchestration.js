const db = require('../config/database');
const eventService = require('./eventService');

class ContactOrchestrationService {
  /**
   * Normalize email address (lowercase, trim whitespace)
   */
  static normalizeEmail(email) {
    return email.toLowerCase().trim();
  }

  /**
   * Upsert contact (create or update)
   * This is the main entry point for all contact creation
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
      // Call database function (defined in database-schema.sql)
      const result = await db.query(
        `SELECT * FROM upsert_contact(
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
        )`,
        [
          normalizedEmail,
          phone || null,
          firstName || null,
          lastName || null,
          zipCode || null,
          source,
          JSON.stringify(metadata),
          utmSource || null,
          utmMedium || null,
          utmCampaign || null,
          ipAddress || null,
          userAgent || null
        ]
      );

      const contact = result.rows[0];

      // Trigger events asynchronously (don't await to avoid blocking)
      if (contact.is_new) {
        eventService.triggerEvent('email_captured', normalizedEmail, {
          source,
          metadata
        }).catch(err => console.error('Event trigger error:', err));
      }

      return {
        email: contact.email,
        isNew: contact.is_new,
        sourceAdded: contact.source_added
      };
    } catch (error) {
      console.error('Error in upsertContact:', error);
      throw new Error(`Failed to upsert contact: ${error.message}`);
    }
  }

  /**
   * Get contact by email
   */
  static async getContact(email) {
    const normalizedEmail = this.normalizeEmail(email);

    try {
      const result = await db.query(
        'SELECT * FROM contact_summary WHERE email = $1',
        [normalizedEmail]
      );

      return result.rows[0] || null;
    } catch (error) {
      console.error('Error in getContact:', error);
      throw new Error(`Failed to get contact: ${error.message}`);
    }
  }

  /**
   * Add consent record
   */
  static async addConsent(email, consentType, granted, source, ipAddress = null) {
    const normalizedEmail = this.normalizeEmail(email);

    try {
      await db.query(
        'SELECT add_consent($1, $2, $3, $4, $5)',
        [normalizedEmail, consentType, granted, source, ipAddress]
      );

      return { success: true };
    } catch (error) {
      console.error('Error in addConsent:', error);
      throw new Error(`Failed to add consent: ${error.message}`);
    }
  }

  /**
   * Get contact consents
   */
  static async getConsents(email) {
    const normalizedEmail = this.normalizeEmail(email);

    try {
      const result = await db.query(
        'SELECT * FROM latest_consents WHERE contact_email = $1',
        [normalizedEmail]
      );

      return result.rows;
    } catch (error) {
      console.error('Error in getConsents:', error);
      throw new Error(`Failed to get consents: ${error.message}`);
    }
  }

  /**
   * Delete contact (soft delete)
   */
  static async deleteContact(email) {
    const normalizedEmail = this.normalizeEmail(email);

    try {
      await db.query(
        'UPDATE contacts SET deleted_at = NOW() WHERE email = $1',
        [normalizedEmail]
      );

      return { success: true };
    } catch (error) {
      console.error('Error in deleteContact:', error);
      throw new Error(`Failed to delete contact: ${error.message}`);
    }
  }

  /**
   * Export contact data (for GDPR compliance)
   */
  static async exportContactData(email) {
    const normalizedEmail = this.normalizeEmail(email);

    try {
      // Get contact info
      const contact = await this.getContact(normalizedEmail);
      if (!contact) {
        throw new Error('Contact not found');
      }

      // Get sources
      const sources = await db.query(
        'SELECT * FROM sources WHERE contact_email = $1',
        [normalizedEmail]
      );

      // Get consents
      const consents = await this.getConsents(normalizedEmail);

      // Get events
      const events = await db.query(
        'SELECT * FROM events WHERE contact_email = $1 ORDER BY created_at DESC',
        [normalizedEmail]
      );

      // Get orders
      const orders = await db.query(
        'SELECT * FROM orders WHERE contact_email = $1',
        [normalizedEmail]
      );

      return {
        contact,
        sources: sources.rows,
        consents,
        events: events.rows,
        orders: orders.rows
      };
    } catch (error) {
      console.error('Error in exportContactData:', error);
      throw new Error(`Failed to export contact data: ${error.message}`);
    }
  }
}

module.exports = ContactOrchestrationService;
