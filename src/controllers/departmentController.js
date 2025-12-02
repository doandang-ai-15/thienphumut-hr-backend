const { pool } = require('../config/database');
const asyncHandler = require('../utils/asyncHandler');

// @desc    Get all departments
// @route   GET /api/departments
// @access  Private
exports.getDepartments = asyncHandler(async (req, res) => {
    const result = await pool.query(`
        SELECT
            d.*,
            e.first_name as manager_first_name,
            e.last_name as manager_last_name,
            e.email as manager_email,
            e.photo as manager_photo,
            COUNT(emp.id) as actual_employee_count
        FROM departments d
        LEFT JOIN employees e ON d.manager_id = e.id
        LEFT JOIN employees emp ON d.id = emp.department_id AND emp.status = 'active'
        GROUP BY d.id, e.first_name, e.last_name, e.email, e.photo
        ORDER BY d.name
    `);

    res.status(200).json({
        success: true,
        count: result.rows.length,
        data: result.rows
    });
});

// @desc    Get single department
// @route   GET /api/departments/:id
// @access  Private
exports.getDepartment = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const result = await pool.query(`
        SELECT
            d.*,
            e.first_name as manager_first_name,
            e.last_name as manager_last_name,
            e.email as manager_email,
            e.photo as manager_photo
        FROM departments d
        LEFT JOIN employees e ON d.manager_id = e.id
        WHERE d.id = $1
    `, [id]);

    if (result.rows.length === 0) {
        return res.status(404).json({
            success: false,
            message: 'Department not found'
        });
    }

    // Get department employees
    const employeesResult = await pool.query(`
        SELECT
            id, employee_id, first_name, last_name, email, job_title,
            employment_type, status, performance_score, photo
        FROM employees
        WHERE department_id = $1
        ORDER BY created_at DESC
    `, [id]);

    // Get department statistics
    const statsResult = await pool.query(`
        SELECT
            COUNT(*) FILTER (WHERE status = 'active') as active_count,
            COUNT(*) FILTER (WHERE status = 'on-leave') as on_leave_count,
            COUNT(*) FILTER (WHERE status = 'inactive') as inactive_count,
            ROUND(AVG(salary)::numeric, 2) as avg_salary,
            ROUND(AVG(performance_score)::numeric, 2) as avg_performance
        FROM employees
        WHERE department_id = $1
    `, [id]);

    res.status(200).json({
        success: true,
        data: {
            ...result.rows[0],
            employees: employeesResult.rows,
            statistics: statsResult.rows[0]
        }
    });
});

// @desc    Create department
// @route   POST /api/departments
// @access  Private (Admin)
exports.createDepartment = asyncHandler(async (req, res) => {
    const { name, description, manager_id, budget, color } = req.body;

    // Check if department name already exists
    const exists = await pool.query(
        'SELECT id FROM departments WHERE name = $1',
        [name]
    );

    if (exists.rows.length > 0) {
        return res.status(400).json({
            success: false,
            message: 'Department with this name already exists'
        });
    }

    const result = await pool.query(
        `INSERT INTO departments (name, description, manager_id, budget, color)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [name, description, manager_id, budget, color]
    );

    // Log activity
    await pool.query(
        'INSERT INTO activity_logs (employee_id, action, description) VALUES ($1, $2, $3)',
        [req.user.id, 'CREATE_DEPARTMENT', `Created department: ${name}`]
    );

    res.status(201).json({
        success: true,
        message: 'Department created successfully',
        data: result.rows[0]
    });
});

// @desc    Update department
// @route   PUT /api/departments/:id
// @access  Private (Admin)
exports.updateDepartment = asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Check if department exists
    const exists = await pool.query(
        'SELECT id FROM departments WHERE id = $1',
        [id]
    );

    if (exists.rows.length === 0) {
        return res.status(404).json({
            success: false,
            message: 'Department not found'
        });
    }

    const allowedFields = ['name', 'description', 'manager_id', 'budget', 'color', 'employee_count'];
    const updates = [];
    const values = [];
    let paramCount = 1;

    Object.keys(req.body).forEach(key => {
        if (allowedFields.includes(key) && req.body[key] !== undefined) {
            updates.push(`${key} = $${paramCount}`);
            values.push(req.body[key]);
            paramCount++;
        }
    });

    if (updates.length === 0) {
        return res.status(400).json({
            success: false,
            message: 'No valid fields to update'
        });
    }

    values.push(id);
    const result = await pool.query(
        `UPDATE departments SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
        values
    );

    // Log activity
    await pool.query(
        'INSERT INTO activity_logs (employee_id, action, description) VALUES ($1, $2, $3)',
        [req.user.id, 'UPDATE_DEPARTMENT', `Updated department: ${result.rows[0].name}`]
    );

    res.status(200).json({
        success: true,
        message: 'Department updated successfully',
        data: result.rows[0]
    });
});

// @desc    Delete department
// @route   DELETE /api/departments/:id
// @access  Private (Admin)
exports.deleteDepartment = asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Check if department exists
    const deptResult = await pool.query(
        'SELECT name FROM departments WHERE id = $1',
        [id]
    );

    if (deptResult.rows.length === 0) {
        return res.status(404).json({
            success: false,
            message: 'Department not found'
        });
    }

    // Check if department has employees
    const employeesResult = await pool.query(
        'SELECT COUNT(*) FROM employees WHERE department_id = $1',
        [id]
    );

    if (parseInt(employeesResult.rows[0].count) > 0) {
        return res.status(400).json({
            success: false,
            message: 'Cannot delete department with employees. Please reassign employees first.'
        });
    }

    await pool.query('DELETE FROM departments WHERE id = $1', [id]);

    // Log activity
    await pool.query(
        'INSERT INTO activity_logs (employee_id, action, description) VALUES ($1, $2, $3)',
        [req.user.id, 'DELETE_DEPARTMENT', `Deleted department: ${deptResult.rows[0].name}`]
    );

    res.status(200).json({
        success: true,
        message: 'Department deleted successfully'
    });
});
