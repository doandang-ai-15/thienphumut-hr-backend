const { pool } = require('../config/database');
const asyncHandler = require('../utils/asyncHandler');

// @desc    Get all contracts
// @route   GET /api/contracts
// @access  Private
exports.getContracts = asyncHandler(async (req, res) => {
    const {
        status,
        employee_id,
        contract_type,
        page = 1,
        limit = 20
    } = req.query;

    let query = `
        SELECT
            c.*,
            e.first_name,
            e.last_name,
            e.employee_id as employee_code,
            e.email,
            e.job_title,
            e.photo as employee_photo,
            d.name as department
        FROM contracts c
        JOIN employees e ON c.employee_id = e.id
        LEFT JOIN departments d ON e.department_id = d.id
        WHERE 1=1
    `;

    const queryParams = [];
    let paramCount = 1;

    // Employees can only see their own contracts
    if (req.user.role === 'employee') {
        query += ` AND c.employee_id = $${paramCount}`;
        queryParams.push(req.user.id);
        paramCount++;
    }

    if (status) {
        query += ` AND c.status = $${paramCount}`;
        queryParams.push(status);
        paramCount++;
    }

    if (employee_id) {
        query += ` AND c.employee_id = $${paramCount}`;
        queryParams.push(employee_id);
        paramCount++;
    }

    if (contract_type) {
        query += ` AND c.contract_type = $${paramCount}`;
        queryParams.push(contract_type);
        paramCount++;
    }

    // Count total
    const countQuery = `SELECT COUNT(*) FROM (${query}) as count_query`;
    const countResult = await pool.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].count);

    // Add pagination
    query += ` ORDER BY c.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
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

// @desc    Get single contract
// @route   GET /api/contracts/:id
// @access  Private
exports.getContract = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const result = await pool.query(`
        SELECT
            c.*,
            e.first_name,
            e.last_name,
            e.employee_id as employee_code,
            e.email,
            e.job_title,
            e.phone,
            e.photo as employee_photo,
            d.name as department
        FROM contracts c
        JOIN employees e ON c.employee_id = e.id
        LEFT JOIN departments d ON e.department_id = d.id
        WHERE c.id = $1
    `, [id]);

    if (result.rows.length === 0) {
        return res.status(404).json({
            success: false,
            message: 'Contract not found'
        });
    }

    const contract = result.rows[0];

    // Employees can only view their own contracts
    if (req.user.role === 'employee' && contract.employee_id !== req.user.id) {
        return res.status(403).json({
            success: false,
            message: 'Not authorized to view this contract'
        });
    }

    res.status(200).json({
        success: true,
        data: contract
    });
});

// @desc    Create contract
// @route   POST /api/contracts
// @access  Private (Admin/Manager)
exports.createContract = asyncHandler(async (req, res) => {
    const {
        employee_id,
        contract_type,
        start_date,
        end_date,
        salary,
        terms,
        status = 'dự thảo hợp đồng'
    } = req.body;

    // Generate contract number
    const lastContract = await pool.query(
        "SELECT contract_number FROM contracts WHERE contract_number LIKE 'CNT-%' ORDER BY id DESC LIMIT 1"
    );

    let newContractNumber = 'CNT-2024-001';
    if (lastContract.rows.length > 0) {
        const lastNumber = parseInt(lastContract.rows[0].contract_number.split('-')[2]);
        const year = new Date().getFullYear();
        newContractNumber = `CNT-${year}-${String(lastNumber + 1).padStart(3, '0')}`;
    }

    // Check if employee exists
    const employeeCheck = await pool.query(
        'SELECT id FROM employees WHERE id = $1',
        [employee_id]
    );

    if (employeeCheck.rows.length === 0) {
        return res.status(404).json({
            success: false,
            message: 'Employee not found'
        });
    }

    const result = await pool.query(`
        INSERT INTO contracts (
            employee_id, contract_type, contract_number, start_date,
            end_date, salary, terms, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
    `, [employee_id, contract_type, newContractNumber, start_date, end_date, salary, terms, status]);

    // Log activity
    await pool.query(
        'INSERT INTO activity_logs (employee_id, action, description) VALUES ($1, $2, $3)',
        [req.user.id, 'CREATE_CONTRACT', `Created contract ${newContractNumber} for employee ID ${employee_id}`]
    );

    res.status(201).json({
        success: true,
        message: 'Contract created successfully',
        data: result.rows[0]
    });
});

// @desc    Update contract
// @route   PUT /api/contracts/:id
// @access  Private (Admin/Manager)
exports.updateContract = asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Check if contract exists
    const exists = await pool.query(
        'SELECT id FROM contracts WHERE id = $1',
        [id]
    );

    if (exists.rows.length === 0) {
        return res.status(404).json({
            success: false,
            message: 'Contract not found'
        });
    }

    const allowedFields = [
        'contract_type', 'start_date', 'end_date', 'salary',
        'terms', 'status', 'file_path', 'signed_at'
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
    const result = await pool.query(
        `UPDATE contracts SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
        values
    );

    // Log activity
    await pool.query(
        'INSERT INTO activity_logs (employee_id, action, description) VALUES ($1, $2, $3)',
        [req.user.id, 'UPDATE_CONTRACT', `Updated contract #${id}`]
    );

    res.status(200).json({
        success: true,
        message: 'Contract updated successfully',
        data: result.rows[0]
    });
});

// @desc    Delete contract
// @route   DELETE /api/contracts/:id
// @access  Private (Admin)
exports.deleteContract = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const contractResult = await pool.query(
        'SELECT contract_number FROM contracts WHERE id = $1',
        [id]
    );

    if (contractResult.rows.length === 0) {
        return res.status(404).json({
            success: false,
            message: 'Contract not found'
        });
    }

    await pool.query('DELETE FROM contracts WHERE id = $1', [id]);

    // Log activity
    await pool.query(
        'INSERT INTO activity_logs (employee_id, action, description) VALUES ($1, $2, $3)',
        [req.user.id, 'DELETE_CONTRACT', `Deleted contract #${id}`]
    );

    res.status(200).json({
        success: true,
        message: 'Contract deleted successfully'
    });
});

// @desc    Sign contract
// @route   POST /api/contracts/:id/sign
// @access  Private (Admin/Manager)
exports.signContract = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const contractResult = await pool.query(
        'SELECT * FROM contracts WHERE id = $1',
        [id]
    );

    if (contractResult.rows.length === 0) {
        return res.status(404).json({
            success: false,
            message: 'Contract not found'
        });
    }

    const contract = contractResult.rows[0];

    if (contract.status === 'còn thời hạn' && contract.signed_at) {
        return res.status(400).json({
            success: false,
            message: 'Contract is already signed'
        });
    }

    const result = await pool.query(`
        UPDATE contracts
        SET status = 'còn thời hạn', signed_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *
    `, [id]);

    // Log activity
    await pool.query(
        'INSERT INTO activity_logs (employee_id, action, description) VALUES ($1, $2, $3)',
        [req.user.id, 'SIGN_CONTRACT', `Signed contract ${contract.contract_number}`]
    );

    res.status(200).json({
        success: true,
        message: 'Contract signed successfully',
        data: result.rows[0]
    });
});

// @desc    Get contract statistics
// @route   GET /api/contracts/stats/summary
// @access  Private (Admin/Manager)
exports.getContractStats = asyncHandler(async (req, res) => {
    // Contracts by type
    const byTypeResult = await pool.query(`
        SELECT contract_type, COUNT(*) as count
        FROM contracts
        GROUP BY contract_type
    `);

    // Contracts by status
    const byStatusResult = await pool.query(`
        SELECT status, COUNT(*) as count
        FROM contracts
        GROUP BY status
    `);

    // Expiring soon (within 30 days)
    const expiringSoonResult = await pool.query(`
        SELECT
            c.*,
            e.first_name,
            e.last_name,
            e.employee_id as employee_code,
            e.photo as employee_photo
        FROM contracts c
        JOIN employees e ON c.employee_id = e.id
        WHERE c.end_date IS NOT NULL
        AND c.end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
        AND c.status = 'còn thời hạn'
        ORDER BY c.end_date
    `);

    res.status(200).json({
        success: true,
        data: {
            byType: byTypeResult.rows,
            byStatus: byStatusResult.rows,
            expiringSoon: expiringSoonResult.rows
        }
    });
});
