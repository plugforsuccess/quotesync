const express = require('express');
const router = express.Router();

// Import route modules
router.use(require('./emailCapture'));
router.use(require('./storeWaitlist'));
router.use(require('./driversEd'));
router.use(require('./canopyZapier'));

// Health check for API
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    api: 'operational',
    timestamp: new Date().toISOString(),
    endpoints: [
      'POST /api/email-capture',
      'POST /api/store-waitlist',
      'POST /api/drivers-ed-capture',
      'GET /api/track/:code',
      'POST /api/canopy-zapier'
    ]
  });
});

module.exports = router;
