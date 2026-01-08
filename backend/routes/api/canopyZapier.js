const express = require('express');
const router = express.Router();
const ContactOrchestrationService = require('../../services/contactOrchestration');

// Receives data from Zapier (Canopy → Zapier → This endpoint)
router.post('/canopy-zapier', async (req, res) => {
  try {
    const { email, phone, firstName, lastName, policyData } = req.body;

    // Validate required field
    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    console.log(`📥 Canopy data received via Zapier:`, {
      email,
      firstName,
      lastName,
      hasPhone: !!phone,
      hasPolicyData: !!policyData
    });

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

    console.log(`✅ Canopy policy share captured: ${email}`);

    res.json({
      success: true,
      message: 'Contact captured successfully',
      email: email
    });
  } catch (error) {
    console.error('❌ Canopy Zapier error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process',
      message: error.message
    });
  }
});

// Health check for Zapier
router.get('/canopy-zapier/health', (req, res) => {
  res.json({
    status: 'ok',
    endpoint: 'canopy-zapier',
    ready: true
  });
});

module.exports = router;
