const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const ContactOrchestrationService = require('../../services/contactOrchestration');

router.post('/email-capture',
  // Validation middleware
  [
    body('email')
      .isEmail()
      .withMessage('Valid email is required')
      .normalizeEmail(),
    body('phone')
      .optional()
      .trim(),
    body('source')
      .isString()
      .withMessage('Source is required'),
    body('context')
      .optional()
      .isString()
  ],
  async (req, res) => {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
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

      console.log(`📥 Email capture request: ${email} from ${source}`);

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

      console.log(`✅ Email captured successfully: ${email} (new: ${result.isNew})`);

      res.json({
        success: true,
        contact: result,
        message: result.isNew ? 'Contact created successfully' : 'Contact updated successfully'
      });
    } catch (error) {
      console.error('❌ Email capture error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to capture email',
        message: error.message
      });
    }
  }
);

module.exports = router;
