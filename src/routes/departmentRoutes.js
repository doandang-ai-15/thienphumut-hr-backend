const express = require('express');
const router = express.Router();
const {
    getDepartments,
    getDepartment,
    createDepartment,
    updateDepartment,
    deleteDepartment,
    addEmployeeToDepartment,
    removeEmployeeFromDepartment
} = require('../controllers/departmentController');
const { protect, authorize, logActivity } = require('../middleware/auth');

router.use(protect); // All routes require authentication

router.get('/', getDepartments);
router.get('/:id', getDepartment);

// Admin only routes
router.post('/', authorize('admin'), logActivity, createDepartment);
router.put('/:id', authorize('admin'), logActivity, updateDepartment);
router.delete('/:id', authorize('admin'), logActivity, deleteDepartment);

// Employee management in department
router.post('/:id/employees', authorize('admin'), logActivity, addEmployeeToDepartment);
router.delete('/:id/employees/:employeeId', authorize('admin'), logActivity, removeEmployeeFromDepartment);

module.exports = router;
