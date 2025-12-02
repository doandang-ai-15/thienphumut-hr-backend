const express = require('express');
const router = express.Router();
const {
    getLeaves,
    getLeave,
    createLeave,
    updateLeaveStatus,
    deleteLeave,
    getLeaveStats
} = require('../controllers/leaveController');
const { protect, authorize, logActivity } = require('../middleware/auth');

router.use(protect); // All routes require authentication

router.get('/', getLeaves);
router.get('/stats/summary', getLeaveStats);
router.get('/:id', getLeave);
router.post('/', logActivity, createLeave);
router.delete('/:id', logActivity, deleteLeave);

// Manager/Admin only
router.put('/:id', authorize('admin', 'manager'), logActivity, updateLeaveStatus);

module.exports = router;
