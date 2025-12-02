const express = require('express');
const router = express.Router();
const {
    getDashboardStats,
    getMonthlyTrends
} = require('../controllers/dashboardController');
const { protect } = require('../middleware/auth');

router.use(protect); // All dashboard routes require authentication

router.get('/stats', getDashboardStats);
router.get('/trends', getMonthlyTrends);

module.exports = router;
