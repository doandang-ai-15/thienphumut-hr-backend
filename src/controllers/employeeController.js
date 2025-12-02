const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');
const asyncHandler = require('../utils/asyncHandler');

// @desc    Get all employees
// @route   GET /api/employees
// @access  Private
exports.getEmployees = asyncHandler(async (req, res) => {
    const {
        status,
        department,
        search,
        page = 1,
        limit = 50,
        sortBy = 'created_at',
        order = 'DESC'
    } = req.query;

    let query = `
        SELECT
            e.*,
            d.name as department_name,
            d.color as department_color,
            m.first_name as manager_first_name,
            m.last_name as manager_last_name
        FROM employees e
        LEFT JOIN departments d ON e.department_id = d.id
        LEFT JOIN employees m ON e.reports_to = m.id
        WHERE 1=1
    `;

    const queryParams = [];
    let paramCount = 1;

    // Filter by status
    if (status) {
        query += ` AND e.status = $${paramCount}`;
        queryParams.push(status);
        paramCount++;
    }

    // Filter by department
    if (department) {
        query += ` AND e.department_id = $${paramCount}`;
        queryParams.push(department);
        paramCount++;
    }

    // Search by name or email
    if (search) {
        query += ` AND (
            e.first_name ILIKE $${paramCount} OR
            e.last_name ILIKE $${paramCount} OR
            e.email ILIKE $${paramCount} OR
            e.employee_id ILIKE $${paramCount}
        )`;
        queryParams.push(`%${search}%`);
        paramCount++;
    }

    // Count total records
    const countQuery = `SELECT COUNT(*) FROM (${query}) as count_query`;
    const countResult = await pool.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].count);

    // Add sorting and pagination
    query += ` ORDER BY e.${sortBy} ${order}`;
    query += ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    queryParams.push(limit, (page - 1) * limit);

    const result = await pool.query(query, queryParams);

    res.status(200).json({
        success: true,
        count: result.rows.length,
        total,
        pages: Math.ceil(total / limit),
        currentPage: parseInt(page),
        data: result.rows
    });
});

// @desc    Get single employee
// @route   GET /api/employees/:id
// @access  Private
exports.getEmployee = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const result = await pool.query(
        `SELECT
            e.*,
            d.name as department_name,
            d.color as department_color,
            m.first_name as manager_first_name,
            m.last_name as manager_last_name,
            m.email as manager_email
        FROM employees e
        LEFT JOIN departments d ON e.department_id = d.id
        LEFT JOIN employees m ON e.reports_to = m.id
        WHERE e.id = $1`,
        [id]
    );

    if (result.rows.length === 0) {
        return res.status(404).json({
            success: false,
            message: 'Employee not found'
        });
    }

    // Get employee's subordinates
    const subordinatesResult = await pool.query(
        `SELECT id, employee_id, first_name, last_name, job_title, email
         FROM employees
         WHERE reports_to = $1`,
        [id]
    );

    // Get employee's leave history
    const leavesResult = await pool.query(
        `SELECT * FROM leave_applications
         WHERE employee_id = $1
         ORDER BY created_at DESC
         LIMIT 5`,
        [id]
    );

    // Get employee's contracts
    const contractsResult = await pool.query(
        `SELECT * FROM contracts
         WHERE employee_id = $1
         ORDER BY created_at DESC`,
        [id]
    );

    const employee = result.rows[0];
    delete employee.password; // Remove password from response

    res.status(200).json({
        success: true,
        data: {
            ...employee,
            subordinates: subordinatesResult.rows,
            recentLeaves: leavesResult.rows,
            contracts: contractsResult.rows
        }
    });
});

// @desc    Create new employee
// @route   POST /api/employees
// @access  Private (Admin/Manager)
exports.createEmployee = asyncHandler(async (req, res) => {
    const {
        first_name,
        last_name,
        email,
        password = 'password123', // Default password
        phone,
        date_of_birth,
        gender,
        job_title,
        department_id,
        reports_to,
        employment_type,
        start_date,
        salary,
        pay_frequency,
        address,
        city,
        state,
        zip_code,
        country,
        photo,
        role = 'employee'
    } = req.body;

    // Check if email already exists
    const emailExists = await pool.query(
        'SELECT id FROM employees WHERE email = $1',
        [email]
    );

    if (emailExists.rows.length > 0) {
        return res.status(400).json({
            success: false,
            message: 'Employee with this email already exists'
        });
    }

    // Generate employee ID
    const lastEmployee = await pool.query(
        'SELECT employee_id FROM employees ORDER BY id DESC LIMIT 1'
    );

    let newEmployeeId = 'EMP-001';
    if (lastEmployee.rows.length > 0) {
        const lastId = parseInt(lastEmployee.rows[0].employee_id.split('-')[1]);
        newEmployeeId = `EMP-${String(lastId + 1).padStart(3, '0')}`;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create employee
    const result = await pool.query(
        `INSERT INTO employees (
            employee_id, first_name, last_name, email, password, phone,
            date_of_birth, gender, job_title, department_id, reports_to,
            employment_type, start_date, salary, pay_frequency,
            address, city, state, zip_code, country, photo, role, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, 'active')
        RETURNING *`,
        [
            newEmployeeId, first_name, last_name, email, hashedPassword, phone,
            date_of_birth, gender, job_title, department_id, reports_to,
            employment_type, start_date, salary, pay_frequency,
            address, city, state, zip_code, country, photo, role
        ]
    );

    const employee = result.rows[0];
    delete employee.password;

    // Update department employee count
    if (department_id) {
        await pool.query(
            'UPDATE departments SET employee_count = employee_count + 1 WHERE id = $1',
            [department_id]
        );
    }

    // Log activity
    await pool.query(
        'INSERT INTO activity_logs (employee_id, action, description) VALUES ($1, $2, $3)',
        [req.user.id, 'CREATE_EMPLOYEE', `Created new employee: ${first_name} ${last_name}`]
    );

    res.status(201).json({
        success: true,
        message: 'Employee created successfully',
        data: employee
    });
});

// @desc    Update employee
// @route   PUT /api/employees/:id
// @access  Private (Admin/Manager)
exports.updateEmployee = asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Check if employee exists
    const employeeExists = await pool.query(
        'SELECT id, department_id FROM employees WHERE id = $1',
        [id]
    );

    if (employeeExists.rows.length === 0) {
        return res.status(404).json({
            success: false,
            message: 'Employee not found'
        });
    }

    const oldDepartmentId = employeeExists.rows[0].department_id;

    // Build update query dynamically
    const allowedFields = [
        'first_name', 'last_name', 'email', 'phone', 'date_of_birth', 'gender',
        'job_title', 'department_id', 'reports_to', 'employment_type',
        'start_date', 'salary', 'pay_frequency', 'address', 'city', 'state',
        'zip_code', 'country', 'status', 'performance_score', 'role', 'photo'
    ];

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
    const query = `
        UPDATE employees
        SET ${updates.join(', ')}
        WHERE id = $${paramCount}
        RETURNING *
    `;

    const result = await pool.query(query, values);
    const employee = result.rows[0];
    delete employee.password;

    // Update department counts if department changed
    if (req.body.department_id && req.body.department_id !== oldDepartmentId) {
        if (oldDepartmentId) {
            await pool.query(
                'UPDATE departments SET employee_count = employee_count - 1 WHERE id = $1',
                [oldDepartmentId]
            );
        }
        await pool.query(
            'UPDATE departments SET employee_count = employee_count + 1 WHERE id = $1',
            [req.body.department_id]
        );
    }

    // Log activity
    await pool.query(
        'INSERT INTO activity_logs (employee_id, action, description) VALUES ($1, $2, $3)',
        [req.user.id, 'UPDATE_EMPLOYEE', `Updated employee: ${employee.first_name} ${employee.last_name}`]
    );

    res.status(200).json({
        success: true,
        message: 'Employee updated successfully',
        data: employee
    });
});

// @desc    Delete employee
// @route   DELETE /api/employees/:id
// @access  Private (Admin only)
exports.deleteEmployee = asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Check if employee exists
    const employeeResult = await pool.query(
        'SELECT id, first_name, last_name, department_id FROM employees WHERE id = $1',
        [id]
    );

    if (employeeResult.rows.length === 0) {
        return res.status(404).json({
            success: false,
            message: 'Employee not found'
        });
    }

    const employee = employeeResult.rows[0];

    // Prevent deleting yourself
    if (parseInt(id) === req.user.id) {
        return res.status(400).json({
            success: false,
            message: 'You cannot delete your own account'
        });
    }

    // Delete employee
    await pool.query('DELETE FROM employees WHERE id = $1', [id]);

    // Update department count
    if (employee.department_id) {
        await pool.query(
            'UPDATE departments SET employee_count = employee_count - 1 WHERE id = $1',
            [employee.department_id]
        );
    }

    // Log activity
    await pool.query(
        'INSERT INTO activity_logs (employee_id, action, description) VALUES ($1, $2, $3)',
        [req.user.id, 'DELETE_EMPLOYEE', `Deleted employee: ${employee.first_name} ${employee.last_name}`]
    );

    res.status(200).json({
        success: true,
        message: 'Employee deleted successfully'
    });
});

// @desc    Get top performing employees
// @route   GET /api/employees/top/performers
// @access  Private
exports.getTopPerformers = asyncHandler(async (req, res) => {
    const { limit = 5 } = req.query;

    const result = await pool.query(
        `SELECT
            e.id,
            e.employee_id,
            e.first_name,
            e.last_name,
            e.job_title,
            e.performance_score,
            d.name as department,
            d.color as department_color
        FROM employees e
        LEFT JOIN departments d ON e.department_id = d.id
        WHERE e.status = 'active' AND e.performance_score > 0
        ORDER BY e.performance_score DESC
        LIMIT $1`,
        [limit]
    );

    res.status(200).json({
        success: true,
        count: result.rows.length,
        data: result.rows
    });
});

// @desc    Get employee statistics
// @route   GET /api/employees/statistics
// @access  Private
exports.getEmployeeStatistics = asyncHandler(async (req, res) => {
    // Total employees by status
    const statusStats = await pool.query(`
        SELECT status, COUNT(*) as count
        FROM employees
        GROUP BY status
    `);

    // Employees by department
    const departmentStats = await pool.query(`
        SELECT
            d.name as department,
            COUNT(e.id) as count
        FROM departments d
        LEFT JOIN employees e ON d.id = e.department_id
        GROUP BY d.name
        ORDER BY count DESC
    `);

    // Employees by employment type
    const employmentTypeStats = await pool.query(`
        SELECT employment_type, COUNT(*) as count
        FROM employees
        GROUP BY employment_type
    `);

    // Gender distribution
    const genderStats = await pool.query(`
        SELECT gender, COUNT(*) as count
        FROM employees
        WHERE gender IS NOT NULL
        GROUP BY gender
    `);

    // Average salary by department
    const avgSalaryByDept = await pool.query(`
        SELECT
            d.name as department,
            ROUND(AVG(e.salary)::numeric, 2) as avg_salary
        FROM departments d
        LEFT JOIN employees e ON d.id = e.department_id
        WHERE e.salary IS NOT NULL
        GROUP BY d.name
        ORDER BY avg_salary DESC
    `);

    res.status(200).json({
        success: true,
        data: {
            byStatus: statusStats.rows,
            byDepartment: departmentStats.rows,
            byEmploymentType: employmentTypeStats.rows,
            byGender: genderStats.rows,
            avgSalaryByDepartment: avgSalaryByDept.rows
        }
    });
});
