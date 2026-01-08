const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const ContactOrchestrationService = require('../../services/contactOrchestration');
const db = require('../../config/database');

router.post('/drivers-ed-capture',
  [
    body('email').isEmail().normalizeEmail(),
    body('course').isString().isIn(['defensive_driving', 'joshuas_law', 'returning_customer'])
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    try {
      const { email, course } = req.body;

      console.log(`📥 Drivers ed capture: ${email} for ${course}`);

      // Upsert contact
      await ContactOrchestrationService.upsertContact({
        email,
        source: 'drivers_ed',
        metadata: { course },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      // Course destination URLs
      const destinationUrls = {
        defensive_driving: 'https://insuredbycam.nationaldrivered.com/defensive',
        joshuas_law: 'https://insuredbycam.nationaldrivered.com/joshuas-law',
        returning_customer: 'https://insuredbycam.nationaldrivered.com/portal'
      };

      // Create tracking link using database function
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

      console.log(`✅ Tracking link created: ${trackingLink.tracking_code} for ${email}`);

      res.json({
        success: true,
        tracking_url: trackingLink.tracking_url,
        message: 'Email captured and tracking link created'
      });
    } catch (error) {
      console.error('❌ Drivers ed capture error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create tracking link',
        message: error.message
      });
    }
  }
);

// Track link click endpoint
router.get('/track/:code', async (req, res) => {
  try {
    const { code } = req.params;

    // Get tracking link details
    const result = await db.query(
      `SELECT * FROM tracking_links WHERE tracking_code = $1 AND active = true`,
      [code]
    );

    if (result.rows.length === 0) {
      return res.status(404).send('Tracking link not found or expired');
    }

    const link = result.rows[0];

    // Update click stats
    await db.query(
      `UPDATE tracking_links
       SET click_count = click_count + 1,
           last_clicked_at = NOW(),
           first_clicked_at = COALESCE(first_clicked_at, NOW())
       WHERE tracking_id = $1`,
      [link.tracking_id]
    );

    console.log(`📊 Track link clicked: ${code} -> ${link.destination_url}`);

    // Redirect to destination
    res.redirect(link.destination_url);
  } catch (error) {
    console.error('❌ Track link error:', error);
    res.status(500).send('Error processing tracking link');
  }
});

module.exports = router;
