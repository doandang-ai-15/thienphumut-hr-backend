const express = require('express');
const router = express.Router();
const { testMailConnection } = require('../controllers/testMailController');
const { protect, authorize } = require('../middleware/auth');

// Test mail connection (admin only for security)
router.get('/test-mail', protect, authorize('admin'), testMailConnection);

module.exports = router;
