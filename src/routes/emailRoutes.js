const express = require('express');
const router = express.Router();

// Use SendGrid controller (for production on Render)
const { sendPayrollEmail } = require('../controllers/emailController_sendgrid');
const { protect, authorize } = require('../middleware/auth');

router.use(protect); // All routes require authentication

// Admin only routes
router.post('/send-payroll', authorize('admin'), sendPayrollEmail);

module.exports = router;
