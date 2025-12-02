const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');

// Protect routes - verify JWT token
exports.protect = async (req, res, next) => {
    try {
        let token;

        // Check if token exists in headers
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
        }

        // Check if token exists
        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Not authorized to access this route'
            });
        }

        try {
            // Verify token
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // Get user from database
            const result = await pool.query(
                'SELECT id, employee_id, first_name, last_name, email, role, department_id, status FROM employees WHERE id = $1',
                [decoded.id]
            );

            if (result.rows.length === 0) {
                return res.status(401).json({
                    success: false,
                    message: 'User not found'
                });
            }

            // Check if user is active
            if (result.rows[0].status === 'inactive') {
                return res.status(401).json({
                    success: false,
                    message: 'User account is inactive'
                });
            }

            // Attach user to request
            req.user = result.rows[0];
            next();

        } catch (error) {
            return res.status(401).json({
                success: false,
                message: 'Invalid or expired token'
            });
        }

    } catch (error) {
        console.error('Auth middleware error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// Authorize specific roles
exports.authorize = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: `Role '${req.user.role}' is not authorized to access this route`
            });
        }
        next();
    };
};

// Log activity
exports.logActivity = async (req, res, next) => {
    try {
        if (req.user) {
            const action = `${req.method} ${req.originalUrl}`;
            const description = `${req.user.first_name} ${req.user.last_name} performed ${action}`;
            const ipAddress = req.ip || req.connection.remoteAddress;

            await pool.query(
                'INSERT INTO activity_logs (employee_id, action, description, ip_address) VALUES ($1, $2, $3, $4)',
                [req.user.id, action, description, ipAddress]
            );
        }
        next();
    } catch (error) {
        console.error('Activity log error:', error);
        next(); // Continue even if logging fails
    }
};
