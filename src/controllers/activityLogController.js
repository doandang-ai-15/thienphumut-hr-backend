const { pool } = require('../config/database');
const asyncHandler = require('../utils/asyncHandler');

// @desc    Get all activity logs
// @route   GET /api/activity-logs
// @access  Private (Admin)
exports.getActivityLogs = asyncHandler(async (req, res) => {
    const { limit = 50, offset = 0, action, employee_id } = req.query;

    let query = `
        SELECT
            al.id,
            al.employee_id,
            al.action,
            al.description,
            al.ip_address,
            al.created_at,
            e.first_name,
            e.last_name,
            e.email
        FROM activity_logs al
        LEFT JOIN employees e ON al.employee_id = e.id
        WHERE 1=1
    `;

    const params = [];
    let paramCounter = 1;

    // Filter by action if provided
    if (action) {
        query += ` AND al.action ILIKE $${paramCounter}`;
        params.push(`%${action}%`);
        paramCounter++;
    }

    // Filter by employee_id if provided
    if (employee_id) {
        query += ` AND al.employee_id = $${paramCounter}`;
        params.push(employee_id);
        paramCounter++;
    }

    query += ` ORDER BY al.created_at DESC LIMIT $${paramCounter} OFFSET $${paramCounter + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM activity_logs WHERE 1=1';
    const countParams = [];
    let countParamCounter = 1;

    if (action) {
        countQuery += ` AND action ILIKE $${countParamCounter}`;
        countParams.push(`%${action}%`);
        countParamCounter++;
    }

    if (employee_id) {
        countQuery += ` AND employee_id = $${countParamCounter}`;
        countParams.push(employee_id);
        countParamCounter++;
    }

    const countResult = await pool.query(countQuery, countParams);
    const totalCount = parseInt(countResult.rows[0].count);

    res.status(200).json({
        success: true,
        data: result.rows,
        pagination: {
            total: totalCount,
            limit: parseInt(limit),
            offset: parseInt(offset),
            hasMore: parseInt(offset) + parseInt(limit) < totalCount
        }
    });
});

// @desc    Get activity logs for current user
// @route   GET /api/activity-logs/me
// @access  Private
exports.getMyActivityLogs = asyncHandler(async (req, res) => {
    const { limit = 50, offset = 0 } = req.query;
    const employeeId = req.user.id;

    const query = `
        SELECT
            id,
            employee_id,
            action,
            description,
            ip_address,
            created_at
        FROM activity_logs
        WHERE employee_id = $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3
    `;

    const result = await pool.query(query, [employeeId, limit, offset]);

    // Get total count
    const countResult = await pool.query(
        'SELECT COUNT(*) FROM activity_logs WHERE employee_id = $1',
        [employeeId]
    );
    const totalCount = parseInt(countResult.rows[0].count);

    res.status(200).json({
        success: true,
        data: result.rows,
        pagination: {
            total: totalCount,
            limit: parseInt(limit),
            offset: parseInt(offset),
            hasMore: parseInt(offset) + parseInt(limit) < totalCount
        }
    });
});

// @desc    Create activity log (used internally by middleware)
// @route   POST /api/activity-logs
// @access  Private
exports.createActivityLog = asyncHandler(async (req, res) => {
    const { employee_id, action, description, ip_address } = req.body;

    const result = await pool.query(
        `INSERT INTO activity_logs (employee_id, action, description, ip_address)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [employee_id, action, description, ip_address]
    );

    res.status(201).json({
        success: true,
        data: result.rows[0]
    });
});

// @desc    Delete old activity logs (older than X days)
// @route   DELETE /api/activity-logs/cleanup
// @access  Private (Admin)
exports.cleanupOldLogs = asyncHandler(async (req, res) => {
    const { days = 90 } = req.query;

    const result = await pool.query(
        `DELETE FROM activity_logs
         WHERE created_at < NOW() - INTERVAL '${days} days'
         RETURNING id`
    );

    res.status(200).json({
        success: true,
        message: `Deleted ${result.rowCount} old activity logs`,
        deletedCount: result.rowCount
    });
});
