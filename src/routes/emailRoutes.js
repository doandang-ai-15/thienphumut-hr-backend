const express = require('express');
const router = express.Router();
const { sendPayrollEmail } = require('../controllers/emailController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect); // All routes require authentication

// Admin only routes
router.post('/send-payroll', authorize('admin'), sendPayrollEmail);

module.exports = router;
