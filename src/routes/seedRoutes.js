const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const bcrypt = require('bcryptjs');

// @desc    Seed database (ONLY FOR INITIAL SETUP)
// @route   POST /api/seed/init
// @access  Public (Should be protected in production)
router.post('/init', async (req, res) => {
    const client = await pool.connect();

    try {
        // Check if already seeded
        const check = await client.query('SELECT COUNT(*) FROM employees');
        if (parseInt(check.rows[0].count) > 0) {
            return res.status(400).json({
                success: false,
                message: 'Database already seeded. Delete all data first if you want to re-seed.'
            });
        }

        await client.query('BEGIN');

        // Hash password
        const hashedPassword = await bcrypt.hash('password123', 10);

        // Seed Departments
        const deptQuery = `
            INSERT INTO departments (name, description, manager_id, employee_count, budget, color)
            VALUES
                ('Engineering', 'Software Development and Engineering', 1, 5, 500000, '#3B82F6'),
                ('Human Resources', 'HR Management and Recruitment', 2, 3, 150000, '#F875AA'),
                ('Marketing', 'Marketing and Brand Management', NULL, 2, 200000, '#AEDEFC'),
                ('Sales', 'Sales and Business Development', NULL, 3, 300000, '#10B981'),
                ('Finance', 'Financial Planning and Accounting', NULL, 2, 250000, '#F59E0B')
        `;
        await client.query(deptQuery);

        // Seed Employees
        const employeeQuery = `
            INSERT INTO employees (
                employee_id, first_name, last_name, email, password, phone,
                date_of_birth, gender, job_title, department_id, reports_to,
                employment_type, start_date, salary, pay_frequency,
                address, city, state, zip_code, country, status, performance_score, role
            ) VALUES
                ('EMP-001', 'Nguyễn', 'Văn An', 'admin@thienphumut.vn', $1, '0123456789', '1985-05-15', 'male', 'CEO & Founder', 1, NULL, 'full-time', '2019-01-01', 150000, 'monthly', '123 Đường ABC', 'Hồ Chí Minh', 'Hồ Chí Minh', '700000', 'Vietnam', 'active', 95, 'admin'),
                ('EMP-002', 'Trần', 'Thị Bình', 'hr@thienphumut.vn', $1, '0987654321', '1990-08-20', 'female', 'HR Manager', 2, 1, 'full-time', '2019-03-01', 80000, 'monthly', '456 Đường XYZ', 'Hồ Chí Minh', 'Hồ Chí Minh', '700000', 'Vietnam', 'active', 88, 'manager'),
                ('EMP-003', 'Lê', 'Văn Công', 'engineer@thienphumut.vn', $1, '0912345678', '1992-03-10', 'male', 'Senior Engineer', 1, 1, 'full-time', '2020-06-15', 70000, 'monthly', '789 Đường DEF', 'Hồ Chí Minh', 'Hồ Chí Minh', '700000', 'Vietnam', 'active', 92, 'employee')
        `;
        await client.query(employeeQuery, [hashedPassword]);

        // Seed Leave Applications
        const leaveQuery = `
            INSERT INTO leave_applications (employee_id, leave_type, start_date, end_date, days, reason, status, approved_by, approved_at)
            VALUES
                (2, 'Du lịch', CURRENT_DATE + INTERVAL '30 days', CURRENT_DATE + INTERVAL '37 days', 7, 'Nghỉ cuối năm', 'chờ xét duyệt', NULL, NULL),
                (3, 'Bệnh', CURRENT_DATE - INTERVAL '5 days', CURRENT_DATE - INTERVAL '4 days', 2, 'Khám bệnh', 'duyệt', 1, CURRENT_TIMESTAMP)
        `;
        await client.query(leaveQuery);

        // Seed Contracts
        const contractQuery = `
            INSERT INTO contracts (employee_id, contract_type, contract_number, start_date, end_date, salary, terms, status, signed_at)
            VALUES
                (1, 'vĩnh viễn', 'CNT-2019-001', '2019-01-01', NULL, 150000, 'Hợp đồng vĩnh viễn CEO', 'còn thời hạn', '2019-01-01'),
                (2, 'vĩnh viễn', 'CNT-2019-002', '2019-03-01', NULL, 80000, 'Hợp đồng vĩnh viễn HR Manager', 'còn thời hạn', '2019-03-01'),
                (3, 'vĩnh viễn', 'CNT-2020-003', '2020-06-15', NULL, 70000, 'Hợp đồng vĩnh viễn Senior Engineer', 'còn thời hạn', '2020-06-15')
        `;
        await client.query(contractQuery);

        await client.query('COMMIT');

        res.status(200).json({
            success: true,
            message: 'Database seeded successfully!',
            credentials: {
                admin: {
                    email: 'admin@thienphumut.vn',
                    password: 'password123'
                },
                manager: {
                    email: 'hr@thienphumut.vn',
                    password: 'password123'
                },
                employee: {
                    email: 'engineer@thienphumut.vn',
                    password: 'password123'
                }
            }
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Seeding error:', error);
        res.status(500).json({
            success: false,
            message: 'Database seeding failed',
            error: error.message
        });
    } finally {
        client.release();
    }
});

module.exports = router;
