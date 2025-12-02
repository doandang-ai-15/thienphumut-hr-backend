const { pool } = require('../config/database');
const asyncHandler = require('../utils/asyncHandler');

// @desc    Get all leave applications
// @route   GET /api/leaves
// @access  Private
exports.getLeaves = asyncHandler(async (req, res) => {
    const {
        status,
        employee_id,
        leave_type,
        page = 1,
        limit = 20
    } = req.query;

    let query = `
        SELECT
            l.*,
            e.first_name,
            e.last_name,
            e.employee_id as employee_code,
            e.job_title,
            e.photo as employee_photo,
            d.name as department,
            a.first_name as approver_first_name,
            a.last_name as approver_last_name,
            a.photo as approver_photo
        FROM leave_applications l
        JOIN employees e ON l.employee_id = e.id
        LEFT JOIN departments d ON e.department_id = d.id
        LEFT JOIN employees a ON l.approved_by = a.id
        WHERE 1=1
    `;

    const queryParams = [];
    let paramCount = 1;

    // If not admin/manager, only show own leaves
    if (req.user.role === 'employee') {
        query += ` AND l.employee_id = $${paramCount}`;
        queryParams.push(req.user.id);
        paramCount++;
    }

    if (status) {
        query += ` AND l.status = $${paramCount}`;
        queryParams.push(status);
        paramCount++;
    }

    if (employee_id) {
        query += ` AND l.employee_id = $${paramCount}`;
        queryParams.push(employee_id);
        paramCount++;
    }

    if (leave_type) {
        query += ` AND l.leave_type = $${paramCount}`;
        queryParams.push(leave_type);
        paramCount++;
    }

    // Count total
    const countQuery = `SELECT COUNT(*) FROM (${query}) as count_query`;
    const countResult = await pool.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].count);

    // Add pagination
    query += ` ORDER BY l.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
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

// @desc    Get single leave application
// @route   GET /api/leaves/:id
// @access  Private
exports.getLeave = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const result = await pool.query(`
        SELECT
            l.*,
            e.first_name,
            e.last_name,
            e.employee_id as employee_code,
            e.email,
            e.job_title,
            e.photo as employee_photo,
            d.name as department,
            a.first_name as approver_first_name,
            a.last_name as approver_last_name,
            a.photo as approver_photo
        FROM leave_applications l
        JOIN employees e ON l.employee_id = e.id
        LEFT JOIN departments d ON e.department_id = d.id
        LEFT JOIN employees a ON l.approved_by = a.id
        WHERE l.id = $1
    `, [id]);

    if (result.rows.length === 0) {
        return res.status(404).json({
            success: false,
            message: 'Leave application not found'
        });
    }

    const leave = result.rows[0];

    // Check permission - employees can only view their own leaves
    if (req.user.role === 'employee' && leave.employee_id !== req.user.id) {
        return res.status(403).json({
            success: false,
            message: 'Not authorized to view this leave application'
        });
    }

    res.status(200).json({
        success: true,
        data: leave
    });
});

// @desc    Create leave application
// @route   POST /api/leaves
// @access  Private
exports.createLeave = asyncHandler(async (req, res) => {
    const {
        employee_id,
        leave_type,
        start_date,
        end_date,
        days,
        reason
    } = req.body;

    // Employees can only create their own leaves
    const targetEmployeeId = req.user.role === 'employee' ? req.user.id : employee_id;

    if (!targetEmployeeId) {
        return res.status(400).json({
            success: false,
            message: 'Employee ID is required'
        });
    }

    // Check for overlapping leaves
    const overlapCheck = await pool.query(`
        SELECT id FROM leave_applications
        WHERE employee_id = $1
        AND status != 'không duyệt'
        AND (
            (start_date <= $2 AND end_date >= $2) OR
            (start_date <= $3 AND end_date >= $3) OR
            (start_date >= $2 AND end_date <= $3)
        )
    `, [targetEmployeeId, start_date, end_date]);

    if (overlapCheck.rows.length > 0) {
        return res.status(400).json({
            success: false,
            message: 'You already have a leave application for this period'
        });
    }

    const result = await pool.query(`
        INSERT INTO leave_applications (employee_id, leave_type, start_date, end_date, days, reason, status)
        VALUES ($1, $2, $3, $4, $5, $6, 'chờ xét duyệt')
        RETURNING *
    `, [targetEmployeeId, leave_type, start_date, end_date, days, reason]);

    // Log activity
    await pool.query(
        'INSERT INTO activity_logs (employee_id, action, description) VALUES ($1, $2, $3)',
        [req.user.id, 'CREATE_LEAVE', `Applied for ${leave_type} leave from ${start_date} to ${end_date}`]
    );

    res.status(201).json({
        success: true,
        message: 'Leave application submitted successfully',
        data: result.rows[0]
    });
});

// @desc    Update leave status (approve/reject)
// @route   PUT /api/leaves/:id
// @access  Private (Admin/Manager)
exports.updateLeaveStatus = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    if (!['duyệt', 'không duyệt'].includes(status)) {
        return res.status(400).json({
            success: false,
            message: 'Status must be either duyệt or không duyệt'
        });
    }

    // Check if leave exists
    const leaveCheck = await pool.query(
        'SELECT * FROM leave_applications WHERE id = $1',
        [id]
    );

    if (leaveCheck.rows.length === 0) {
        return res.status(404).json({
            success: false,
            message: 'Leave application not found'
        });
    }

    const leave = leaveCheck.rows[0];

    if (leave.status !== 'chờ xét duyệt') {
        return res.status(400).json({
            success: false,
            message: `Leave application is already ${leave.status}`
        });
    }

    // Update leave status
    const result = await pool.query(`
        UPDATE leave_applications
        SET status = $1, approved_by = $2, approved_at = CURRENT_TIMESTAMP
        WHERE id = $3
        RETURNING *
    `, [status, req.user.id, id]);

    // Update employee status if approved
    if (status === 'duyệt') {
        const today = new Date();
        const startDate = new Date(leave.start_date);
        const endDate = new Date(leave.end_date);

        // If leave is currently active, set employee status to on-leave
        if (today >= startDate && today <= endDate) {
            await pool.query(
                "UPDATE employees SET status = 'on-leave' WHERE id = $1",
                [leave.employee_id]
            );
        }
    }

    // Log activity
    await pool.query(
        'INSERT INTO activity_logs (employee_id, action, description) VALUES ($1, $2, $3)',
        [req.user.id, 'UPDATE_LEAVE', `${status === 'duyệt' ? 'Approved' : 'Rejected'} leave application #${id}`]
    );

    res.status(200).json({
        success: true,
        message: `Leave application ${status} successfully`,
        data: result.rows[0]
    });
});

// @desc    Delete leave application
// @route   DELETE /api/leaves/:id
// @access  Private
exports.deleteLeave = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const leaveResult = await pool.query(
        'SELECT * FROM leave_applications WHERE id = $1',
        [id]
    );

    if (leaveResult.rows.length === 0) {
        return res.status(404).json({
            success: false,
            message: 'Leave application not found'
        });
    }

    const leave = leaveResult.rows[0];

    // Only allow deletion if pending or if user is admin
    if (leave.status !== 'chờ xét duyệt' && req.user.role !== 'admin') {
        return res.status(403).json({
            success: false,
            message: 'Cannot delete approved/rejected leave applications'
        });
    }

    // Employees can only delete their own pending leaves
    if (req.user.role === 'employee' && leave.employee_id !== req.user.id) {
        return res.status(403).json({
            success: false,
            message: 'Not authorized to delete this leave application'
        });
    }

    await pool.query('DELETE FROM leave_applications WHERE id = $1', [id]);

    // Log activity
    await pool.query(
        'INSERT INTO activity_logs (employee_id, action, description) VALUES ($1, $2, $3)',
        [req.user.id, 'DELETE_LEAVE', `Deleted leave application #${id}`]
    );

    res.status(200).json({
        success: true,
        message: 'Leave application deleted successfully'
    });
});

// @desc    Get leave statistics
// @route   GET /api/leaves/stats/summary
// @access  Private
exports.getLeaveStats = asyncHandler(async (req, res) => {
    const { year = new Date().getFullYear() } = req.query;

    // Stats by type
    const byTypeResult = await pool.query(`
        SELECT leave_type, COUNT(*) as count, SUM(days) as total_days
        FROM leave_applications
        WHERE EXTRACT(YEAR FROM created_at) = $1 AND status = 'duyệt'
        GROUP BY leave_type
    `, [year]);

    // Stats by status
    const byStatusResult = await pool.query(`
        SELECT status, COUNT(*) as count
        FROM leave_applications
        WHERE EXTRACT(YEAR FROM created_at) = $1
        GROUP BY status
    `, [year]);

    // Monthly trend
    const monthlyResult = await pool.query(`
        SELECT
            TO_CHAR(start_date, 'Mon') as month,
            COUNT(*) as count,
            SUM(days) as total_days
        FROM leave_applications
        WHERE EXTRACT(YEAR FROM start_date) = $1 AND status = 'duyệt'
        GROUP BY TO_CHAR(start_date, 'Mon'), EXTRACT(MONTH FROM start_date)
        ORDER BY EXTRACT(MONTH FROM start_date)
    `, [year]);

    res.status(200).json({
        success: true,
        data: {
            byType: byTypeResult.rows,
            byStatus: byStatusResult.rows,
            monthlyTrend: monthlyResult.rows
        }
    });
});
