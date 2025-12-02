const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');
const generateToken = require('../utils/generateToken');
const asyncHandler = require('../utils/asyncHandler');

// @desc    Register new user
// @route   POST /api/auth/register
// @access  Public
exports.register = asyncHandler(async (req, res) => {
    const {
        first_name,
        last_name,
        email,
        password,
        phone,
        job_title,
        department_id,
        employment_type
    } = req.body;

    // Check if user already exists
    const userExists = await pool.query(
        'SELECT id FROM employees WHERE email = $1',
        [email]
    );

    if (userExists.rows.length > 0) {
        return res.status(400).json({
            success: false,
            message: 'User with this email already exists'
        });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate employee ID
    const lastEmployee = await pool.query(
        'SELECT employee_id FROM employees ORDER BY id DESC LIMIT 1'
    );

    let newEmployeeId = 'EMP-001';
    if (lastEmployee.rows.length > 0) {
        const lastId = parseInt(lastEmployee.rows[0].employee_id.split('-')[1]);
        newEmployeeId = `EMP-${String(lastId + 1).padStart(3, '0')}`;
    }

    // Create user
    const result = await pool.query(
        `INSERT INTO employees (
            employee_id, first_name, last_name, email, password, phone,
            job_title, department_id, employment_type, start_date, status, role
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_DATE, 'active', 'employee')
        RETURNING id, employee_id, first_name, last_name, email, role`,
        [newEmployeeId, first_name, last_name, email, hashedPassword, phone, job_title, department_id, employment_type]
    );

    const user = result.rows[0];

    // Generate token
    const token = generateToken(user.id);

    res.status(201).json({
        success: true,
        message: 'User registered successfully',
        data: {
            user,
            token
        }
    });
});

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
exports.login = asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
        return res.status(400).json({
            success: false,
            message: 'Please provide email and password'
        });
    }

    // Get user with password
    const result = await pool.query(
        `SELECT e.*, d.name as department_name
         FROM employees e
         LEFT JOIN departments d ON e.department_id = d.id
         WHERE e.email = $1`,
        [email]
    );

    if (result.rows.length === 0) {
        return res.status(401).json({
            success: false,
            message: 'Invalid credentials'
        });
    }

    const user = result.rows[0];

    // Check if user is active
    if (user.status === 'inactive') {
        return res.status(401).json({
            success: false,
            message: 'Your account has been deactivated. Please contact HR.'
        });
    }

    // Check password
    const isPasswordMatch = await bcrypt.compare(password, user.password);

    if (!isPasswordMatch) {
        return res.status(401).json({
            success: false,
            message: 'Invalid credentials'
        });
    }

    // Remove password from response
    delete user.password;

    // Generate token
    const token = generateToken(user.id);

    // Log activity
    await pool.query(
        'INSERT INTO activity_logs (employee_id, action, description, ip_address) VALUES ($1, $2, $3, $4)',
        [user.id, 'LOGIN', `${user.first_name} ${user.last_name} logged in`, req.ip]
    );

    res.status(200).json({
        success: true,
        message: 'Login successful',
        data: {
            user,
            token
        }
    });
});

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
exports.getMe = asyncHandler(async (req, res) => {
    const result = await pool.query(
        `SELECT e.*, d.name as department_name, d.color as department_color
         FROM employees e
         LEFT JOIN departments d ON e.department_id = d.id
         WHERE e.id = $1`,
        [req.user.id]
    );

    res.status(200).json({
        success: true,
        data: result.rows[0]
    });
});

// @desc    Logout user
// @route   POST /api/auth/logout
// @access  Private
exports.logout = asyncHandler(async (req, res) => {
    // Log activity
    await pool.query(
        'INSERT INTO activity_logs (employee_id, action, description, ip_address) VALUES ($1, $2, $3, $4)',
        [req.user.id, 'LOGOUT', `${req.user.first_name} ${req.user.last_name} logged out`, req.ip]
    );

    res.status(200).json({
        success: true,
        message: 'Logged out successfully'
    });
});

// @desc    Update password
// @route   PUT /api/auth/updatepassword
// @access  Private
exports.updatePassword = asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
        return res.status(400).json({
            success: false,
            message: 'Please provide current and new password'
        });
    }

    // Get user with password
    const result = await pool.query(
        'SELECT password FROM employees WHERE id = $1',
        [req.user.id]
    );

    const user = result.rows[0];

    // Check current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);

    if (!isMatch) {
        return res.status(401).json({
            success: false,
            message: 'Current password is incorrect'
        });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await pool.query(
        'UPDATE employees SET password = $1 WHERE id = $2',
        [hashedPassword, req.user.id]
    );

    // Log activity
    await pool.query(
        'INSERT INTO activity_logs (employee_id, action, description) VALUES ($1, $2, $3)',
        [req.user.id, 'PASSWORD_CHANGE', 'User changed password']
    );

    res.status(200).json({
        success: true,
        message: 'Password updated successfully'
    });
});
