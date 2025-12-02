const { pool } = require('../config/database');
const asyncHandler = require('../utils/asyncHandler');

// @desc    Get dashboard statistics
// @route   GET /api/dashboard/stats
// @access  Private
exports.getDashboardStats = asyncHandler(async (req, res) => {
    // Get basic stats from view
    const statsResult = await pool.query('SELECT * FROM dashboard_stats');
    const stats = statsResult.rows[0];

    // Get new employees by month (last 3 months)
    const newEmployeesResult = await pool.query(`
        SELECT
            TO_CHAR(created_at, 'Month') as month,
            COUNT(*) as count
        FROM employees
        WHERE created_at >= CURRENT_DATE - INTERVAL '3 months'
        GROUP BY TO_CHAR(created_at, 'Month'), EXTRACT(MONTH FROM created_at)
        ORDER BY EXTRACT(MONTH FROM created_at)
    `);

    // Get department distribution
    const departmentDistResult = await pool.query(`
        SELECT
            d.name,
            d.color,
            COUNT(e.id) as employee_count
        FROM departments d
        LEFT JOIN employees e ON d.id = e.department_id AND e.status = 'active'
        GROUP BY d.id, d.name, d.color
        ORDER BY employee_count DESC
    `);

    // Get top 5 employees by performance
    const topEmployeesResult = await pool.query(`
        SELECT
            e.id,
            e.first_name,
            e.last_name,
            e.job_title,
            e.performance_score,
            e.photo,
            d.name as department
        FROM employees e
        LEFT JOIN departments d ON e.department_id = d.id
        WHERE e.status = 'active' AND e.performance_score > 0
        ORDER BY e.performance_score DESC
        LIMIT 5
    `);

    // Get recent activities
    const recentActivitiesResult = await pool.query(`
        SELECT
            al.action,
            al.description,
            al.created_at,
            e.first_name,
            e.last_name
        FROM activity_logs al
        LEFT JOIN employees e ON al.employee_id = e.id
        ORDER BY al.created_at DESC
        LIMIT 10
    `);

    // Get leave statistics
    const leaveStatsResult = await pool.query(`
        SELECT
            status,
            COUNT(*) as count
        FROM leave_applications
        WHERE EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM CURRENT_DATE)
        GROUP BY status
    `);

    res.status(200).json({
        success: true,
        data: {
            stats,
            newEmployeesByMonth: newEmployeesResult.rows,
            departmentDistribution: departmentDistResult.rows,
            topEmployees: topEmployeesResult.rows,
            recentActivities: recentActivitiesResult.rows,
            leaveStats: leaveStatsResult.rows
        }
    });
});

// @desc    Get monthly trends
// @route   GET /api/dashboard/trends
// @access  Private
exports.getMonthlyTrends = asyncHandler(async (req, res) => {
    const { months = 6 } = req.query;

    const trendsResult = await pool.query(`
        SELECT
            TO_CHAR(month, 'Mon YYYY') as month_name,
            new_employees,
            leaves_taken,
            contracts_signed
        FROM (
            SELECT
                date_trunc('month', generate_series(
                    CURRENT_DATE - INTERVAL '${months} months',
                    CURRENT_DATE,
                    INTERVAL '1 month'
                )) as month
        ) months
        LEFT JOIN (
            SELECT date_trunc('month', created_at) as month, COUNT(*) as new_employees
            FROM employees
            GROUP BY date_trunc('month', created_at)
        ) e ON months.month = e.month
        LEFT JOIN (
            SELECT date_trunc('month', created_at) as month, COUNT(*) as leaves_taken
            FROM leave_applications
            WHERE status = 'approved'
            GROUP BY date_trunc('month', created_at)
        ) l ON months.month = l.month
        LEFT JOIN (
            SELECT date_trunc('month', signed_at) as month, COUNT(*) as contracts_signed
            FROM contracts
            WHERE signed_at IS NOT NULL
            GROUP BY date_trunc('month', signed_at)
        ) c ON months.month = c.month
        ORDER BY months.month
    `);

    res.status(200).json({
        success: true,
        data: trendsResult.rows
    });
});
