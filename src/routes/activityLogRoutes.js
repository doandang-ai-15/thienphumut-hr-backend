const express = require('express');
const router = express.Router();
const {
    getActivityLogs,
    getMyActivityLogs,
    createActivityLog,
    cleanupOldLogs
} = require('../controllers/activityLogController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect); // All routes require authentication

// Get my activity logs
router.get('/me', getMyActivityLogs);

// Admin only routes
router.get('/', authorize('admin'), getActivityLogs);
router.post('/', authorize('admin'), createActivityLog);
router.delete('/cleanup', authorize('admin'), cleanupOldLogs);

module.exports = router;
