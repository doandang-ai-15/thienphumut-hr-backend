const express = require('express');
const router = express.Router();
const {
    getEmployees,
    getEmployee,
    createEmployee,
    updateEmployee,
    deleteEmployee,
    getTopPerformers,
    getEmployeeStatistics
} = require('../controllers/employeeController');
const {
    uploadPhoto,
    deletePhoto,
    getPhotoUrl
} = require('../controllers/photoController');
const {
    validateEmployeeCodes
} = require('../controllers/employeeCodeValidatorController');
const { protect, authorize, logActivity } = require('../middleware/auth');

// All routes require authentication
router.use(protect);

// Public employee routes (all authenticated users)
router.get('/', getEmployees);
router.get('/statistics', getEmployeeStatistics);
router.get('/top/performers', getTopPerformers);
router.get('/photo-url', getPhotoUrl);
router.get('/validate-codes', authorize('admin'), validateEmployeeCodes);
router.get('/:id', getEmployee);

// Admin/Manager only routes
router.post('/', authorize('admin', 'manager'), logActivity, createEmployee);
router.post('/upload-photo', authorize('admin', 'manager'), uploadPhoto);
router.put('/:id', authorize('admin', 'manager'), logActivity, updateEmployee);

// Admin only routes
router.delete('/:id', authorize('admin'), logActivity, deleteEmployee);
router.delete('/delete-photo/:filename', authorize('admin', 'manager'), deletePhoto);

module.exports = router;
