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
const { protect, authorize, logActivity } = require('../middleware/auth');

// All routes require authentication
router.use(protect);

// Public employee routes (all authenticated users)
router.get('/', getEmployees);
router.get('/statistics', getEmployeeStatistics);
router.get('/top/performers', getTopPerformers);
router.get('/:id', getEmployee);

// Admin/Manager only routes
router.post('/', authorize('admin', 'manager'), logActivity, createEmployee);
router.put('/:id', authorize('admin', 'manager'), logActivity, updateEmployee);

// Admin only routes
router.delete('/:id', authorize('admin'), logActivity, deleteEmployee);

module.exports = router;
