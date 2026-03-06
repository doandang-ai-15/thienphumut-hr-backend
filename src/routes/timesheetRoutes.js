const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const timesheetBatchController = require('../controllers/timesheetBatchController');
const { protect, authorize } = require('../middleware/auth');

// Configure multer for file upload
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'overall-timesheet-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    fileFilter: function (req, file, cb) {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ext !== '.xlsx' && ext !== '.xls') {
            return cb(new Error('Only Excel files are allowed'));
        }
        cb(null, true);
    },
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});

// Routes
router.post(
    '/batch-send',
    protect,
    authorize('admin'),
    upload.single('timesheetFile'),
    timesheetBatchController.batchSendTimesheet
);

// Import history routes
router.get(
    '/import-history',
    protect,
    authorize('admin'),
    timesheetBatchController.getImportHistory
);

router.get(
    '/import-history/:sessionId',
    protect,
    authorize('admin'),
    timesheetBatchController.getImportSessionDetails
);

module.exports = router;
