const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const payrollBatchController = require('../controllers/payrollBatchController');
const payrollBatchControllerSendGrid = require('../controllers/payrollBatchController_sendgrid');
const { protect, authorize } = require('../middleware/auth');

// Configure multer for file upload
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'overall-payroll-' + uniqueSuffix + path.extname(file.originalname));
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
    '/batch-generate',
    protect,
    authorize('admin'),
    upload.single('overallPayroll'),
    payrollBatchController.generateBatchPayroll
);

router.post(
    '/batch-send',
    protect,
    authorize('admin'),
    upload.single('overallPayroll'),
    payrollBatchControllerSendGrid.generateAndSendBatchPayroll
);

router.get(
    '/download/:fileName',
    protect,
    authorize('admin'),
    payrollBatchController.downloadPayrollFile
);

module.exports = router;
