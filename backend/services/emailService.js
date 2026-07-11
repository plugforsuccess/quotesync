const { Resend } = require('resend');

// Initialize Resend (will be null if API key not set)
let resend = null;
if (process.env.RESEND_API_KEY) {
  resend = new Resend(process.env.RESEND_API_KEY);
} else {
  console.warn('⚠️  RESEND_API_KEY not set - emails will not be sent');
}

// Email templates with HTML content
const TEMPLATES = {
  welcome_quote: {
    subject: 'Thanks for your insurance quote request!',
    html: (data) => `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #3b82f6; color: white; padding: 20px; text-align: center; }
          .content { padding: 30px 20px; background: #f9fafb; }
          .footer { padding: 20px; text-align: center; font-size: 12px; color: #6b7280; }
          .button { display: inline-block; padding: 12px 24px; background: #3b82f6; color: white; text-decoration: none; border-radius: 5px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>InsuredByCam</h1>
          </div>
          <div class="content">
            <h2>Thanks for your quote request${data.firstName ? ', ' + data.firstName : ''}!</h2>
            <p>We've received your request for an insurance quote. Our team will review your information and get back to you soon.</p>
            <p>In the meantime, check out our resources to learn more about insurance:</p>
            <ul>
              <li>Understanding Your Coverage</li>
              <li>How to Save on Insurance</li>
              <li>Claims Process Guide</li>
            </ul>
            <p><a href="https://insuredbycam.com/education" class="button">Explore Resources</a></p>
          </div>
          <div class="footer">
            <p>InsuredByCam | Helping you find better insurance</p>
            <p><a href="https://insuredbycam.com">Visit our website</a></p>
          </div>
        </div>
      </body>
      </html>
    `
  },

  drivers_ed_confirmation: {
    subject: 'Your Drivers Ed link is ready!',
    html: (data) => `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #10b981; color: white; padding: 20px; text-align: center; }
          .content { padding: 30px 20px; background: #f0fdf4; }
          .footer { padding: 20px; text-align: center; font-size: 12px; color: #6b7280; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🚗 Ready to Start Your Course?</h1>
          </div>
          <div class="content">
            <h2>Welcome${data.firstName ? ', ' + data.firstName : ''}!</h2>
            <p>You're all set to begin your drivers education course. We've saved your information and you can now proceed to the course portal.</p>
            <p>Don't forget - completing this course can help you save on your insurance premiums!</p>
            <p><strong>Next Steps:</strong></p>
            <ol>
              <li>Click the link you received to access the course</li>
              <li>Complete the modules at your own pace</li>
              <li>Get your certificate upon completion</li>
            </ol>
            <p>Questions? We're here to help!</p>
          </div>
          <div class="footer">
            <p>InsuredByCam | Your insurance education partner</p>
          </div>
        </div>
      </body>
      </html>
    `
  },

  waitlist_confirmation: {
    subject: "You're on the waitlist!",
    html: (data) => `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #8b5cf6; color: white; padding: 20px; text-align: center; }
          .content { padding: 30px 20px; background: #faf5ff; }
          .footer { padding: 20px; text-align: center; font-size: 12px; color: #6b7280; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 You're In!</h1>
          </div>
          <div class="content">
            <h2>Thanks for joining our waitlist${data.firstName ? ', ' + data.firstName : ''}!</h2>
            <p>We're excited to have you on board. You'll be among the first to know when our new products are available.</p>
            <p>We're working hard to bring you the best insurance-related products and resources.</p>
            <p><strong>What to expect:</strong></p>
            <ul>
              <li>Early access to new products</li>
              <li>Exclusive launch discounts</li>
              <li>Updates on our progress</li>
            </ul>
            <p>Stay tuned!</p>
          </div>
          <div class="footer">
            <p>InsuredByCam | Coming soon</p>
          </div>
        </div>
      </body>
      </html>
    `
  },

  policy_received: {
    subject: 'We received your policy information',
    html: (data) => `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #0ea5e9; color: white; padding: 20px; text-align: center; }
          .content { padding: 30px 20px; background: #f0f9ff; }
          .footer { padding: 20px; text-align: center; font-size: 12px; color: #6b7280; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📋 Policy Received</h1>
          </div>
          <div class="content">
            <h2>Thank you${data.firstName ? ', ' + data.firstName : ''}!</h2>
            <p>We've successfully received your policy information through Canopy Connect.</p>
            <p>Our team is now reviewing your policy details to find the best recommendations for you.</p>
            <p><strong>What happens next:</strong></p>
            <ol>
              <li>We'll analyze your current coverage</li>
              <li>Identify potential savings opportunities</li>
              <li>Reach out with personalized recommendations</li>
            </ol>
            <p>This process typically takes 1-2 business days. We'll be in touch soon!</p>
          </div>
          <div class="footer">
            <p>InsuredByCam | Better coverage, better rates</p>
          </div>
        </div>
      </body>
      </html>
    `
  },

  receipt_with_download: {
    subject: 'Your purchase receipt and download',
    html: (data) => `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #22c55e; color: white; padding: 20px; text-align: center; }
          .content { padding: 30px 20px; background: #f0fdf4; }
          .footer { padding: 20px; text-align: center; font-size: 12px; color: #6b7280; }
          .button { display: inline-block; padding: 12px 24px; background: #22c55e; color: white; text-decoration: none; border-radius: 5px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✅ Purchase Complete</h1>
          </div>
          <div class="content">
            <h2>Thanks for your purchase${data.firstName ? ', ' + data.firstName : ''}!</h2>
            <p>Your payment has been processed successfully.</p>
            ${data.downloadLink ? `
              <p><a href="${data.downloadLink}" class="button">Download Your Product</a></p>
            ` : ''}
            <p><strong>Order Details:</strong></p>
            <ul>
              ${data.productName ? `<li>Product: ${data.productName}</li>` : ''}
              ${data.amount ? `<li>Amount: $${(data.amount / 100).toFixed(2)}</li>` : ''}
            </ul>
            <p>Questions or issues? Contact us at support@insuredbycam.com</p>
          </div>
          <div class="footer">
            <p>InsuredByCam | Your purchase partner</p>
          </div>
        </div>
      </body>
      </html>
    `
  }
};

class EmailService {
  /**
   * Send email using template
   */
  static async sendEmail(templateName, contactEmail, data = {}) {
    const template = TEMPLATES[templateName];

    if (!template) {
      throw new Error(`Unknown email template: ${templateName}`);
    }

    // If Resend not configured, log and return
    if (!resend) {
      console.log(`📧 [DRY RUN] Would send email: ${templateName} to ${contactEmail}`);
      return { success: true, dryRun: true };
    }

    try {
      const emailData = {
        from: 'InsuredByCam <onboarding@resend.dev>', // Use resend.dev until domain verified
        to: contactEmail,
        subject: template.subject,
        html: typeof template.html === 'function' ? template.html(data) : template.html
      };

      const result = await resend.emails.send(emailData);

      console.log(`✅ Email sent: ${templateName} to ${contactEmail} (ID: ${result.data?.id})`);

      return {
        success: true,
        messageId: result.data?.id,
        template: templateName
      };
    } catch (error) {
      console.error(`❌ Email send failed for ${templateName}:`, error);
      throw new Error(`Failed to send email: ${error.message}`);
    }
  }

  /**
   * Send custom email (not from template)
   */
  static async sendCustomEmail(to, subject, html, from = 'InsuredByCam <onboarding@resend.dev>') {
    if (!resend) {
      console.log(`📧 [DRY RUN] Would send custom email to ${to}`);
      return { success: true, dryRun: true };
    }

    try {
      const result = await resend.emails.send({
        from,
        to,
        subject,
        html
      });

      console.log(`✅ Custom email sent to ${to}`);

      return {
        success: true,
        messageId: result.data?.id
      };
    } catch (error) {
      console.error(`❌ Custom email failed:`, error);
      throw new Error(`Failed to send custom email: ${error.message}`);
    }
  }
}

module.exports = EmailService;
