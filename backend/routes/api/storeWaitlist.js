const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const ContactOrchestrationService = require('../../services/contactOrchestration');

router.post('/store-waitlist',
  [body('email').isEmail().normalizeEmail()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    try {
      const { email, productInterest } = req.body;

      console.log(`📥 Waitlist signup: ${email}`);

      await ContactOrchestrationService.upsertContact({
        email,
        source: 'store_waitlist',
        metadata: {
          product_interest: productInterest || 'physical_products'
        },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      console.log(`✅ Added to waitlist: ${email}`);

      res.json({
        success: true,
        message: 'Successfully added to waitlist'
      });
    } catch (error) {
      console.error('❌ Waitlist error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to join waitlist',
        message: error.message
      });
    }
  }
);

module.exports = router;
