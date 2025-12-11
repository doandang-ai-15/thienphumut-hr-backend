const express = require('express');
const router = express.Router();

// Use Custom Mail Server (nhansu@thienphumut.vn)
const { sendPayrollEmail } = require('../controllers/emailController_custom');
const { protect, authorize } = require('../middleware/auth');

router.use(protect); // All routes require authentication

// Admin only routes
router.post('/send-payroll', authorize('admin'), sendPayrollEmail);

module.exports = router;
