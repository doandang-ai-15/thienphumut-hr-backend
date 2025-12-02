const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');

async function seedDatabase() {
    const client = await pool.connect();

    try {
        console.log('🌱 Starting database seeding...');

        // Start transaction
        await client.query('BEGIN');

        // Clear existing data
        await client.query('TRUNCATE TABLE activity_logs, contracts, leave_applications, employees, departments RESTART IDENTITY CASCADE');
        console.log('✅ Cleared existing data');

        // Seed Departments
        const departmentQuery = `
            INSERT INTO departments (name, description, manager_id, employee_count, budget, color)
            VALUES
                ('Engineering', 'Software development and technical operations', NULL, 65, 500000, '#F875AA'),
                ('Marketing', 'Brand management and customer acquisition', NULL, 42, 300000, '#AEDEFC'),
                ('Sales', 'Revenue generation and client relations', NULL, 38, 250000, '#a8e6b0'),
                ('HR', 'Human resources and employee management', NULL, 28, 200000, '#FDEDED'),
                ('Design', 'Product and graphic design', NULL, 35, 220000, '#fbbf24'),
                ('Finance', 'Financial planning and accounting', NULL, 40, 350000, '#c4b5fd')
            RETURNING id
        `;
        await client.query(departmentQuery);
        console.log('✅ Departments seeded');

        // Seed Employees
        const hashedPassword = await bcrypt.hash('password123', 10);

        const employeeQuery = `
            INSERT INTO employees (
                employee_id, first_name, last_name, email, password, phone, date_of_birth, gender,
                job_title, department_id, reports_to, employment_type, start_date, salary, pay_frequency,
                address, city, state, zip_code, country, photo, status, performance_score, role
            ) VALUES
                -- Admin
                ('EMP-001', 'John', 'Doe', 'john.doe@peoplehub.com', $1, '+1-555-0100', '1985-03-15', 'male', 'HR Manager', 4, NULL, 'full-time', '2020-01-15', 85000, 'monthly', '123 Main St', 'New York', 'NY', '10001', 'United States', NULL, 'active', 96, 'admin'),

                -- Top Performers
                ('EMP-002', 'Alex', 'Kim', 'alex.kim@peoplehub.com', $1, '+1-555-0101', '1990-05-20', 'male', 'Engineering Lead', 1, NULL, 'full-time', '2019-03-01', 120000, 'monthly', '456 Oak Ave', 'San Francisco', 'CA', '94102', 'United States', NULL, 'active', 98, 'manager'),
                ('EMP-003', 'Maria', 'Johnson', 'maria.johnson@peoplehub.com', $1, '+1-555-0102', '1988-08-12', 'female', 'Product Designer', 5, NULL, 'full-time', '2020-06-15', 95000, 'monthly', '789 Pine Rd', 'Austin', 'TX', '73301', 'United States', NULL, 'active', 95, 'employee'),
                ('EMP-004', 'David', 'Lee', 'david.lee@peoplehub.com', $1, '+1-555-0103', '1992-11-08', 'male', 'Marketing Manager', 2, NULL, 'full-time', '2021-01-10', 88000, 'monthly', '321 Elm St', 'Chicago', 'IL', '60601', 'United States', NULL, 'active', 92, 'manager'),
                ('EMP-005', 'Sophie', 'Wang', 'sophie.wang@peoplehub.com', $1, '+1-555-0104', '1991-07-25', 'female', 'HR Specialist', 4, 1, 'full-time', '2021-05-20', 72000, 'monthly', '654 Maple Dr', 'Seattle', 'WA', '98101', 'United States', NULL, 'active', 89, 'employee'),
                ('EMP-006', 'James', 'Brown', 'james.brown@peoplehub.com', $1, '+1-555-0105', '1989-04-18', 'male', 'Sales Executive', 3, NULL, 'full-time', '2020-09-01', 78000, 'monthly', '987 Cedar Ln', 'Miami', 'FL', '33101', 'United States', NULL, 'active', 87, 'employee'),

                -- Regular Employees
                ('EMP-007', 'Alice', 'Smith', 'alice.smith@peoplehub.com', $1, '+1-555-0106', '1993-02-14', 'female', 'Software Engineer', 1, 2, 'full-time', '2021-11-01', 95000, 'monthly', '111 First St', 'Boston', 'MA', '02101', 'United States', NULL, 'active', 88, 'employee'),
                ('EMP-008', 'Bob', 'Johnson', 'bob.johnson@peoplehub.com', $1, '+1-555-0107', '1987-09-30', 'male', 'UI/UX Designer', 5, NULL, 'full-time', '2020-04-15', 82000, 'monthly', '222 Second Ave', 'Portland', 'OR', '97201', 'United States', NULL, 'active', 85, 'employee'),
                ('EMP-009', 'Carol', 'White', 'carol.white@peoplehub.com', $1, '+1-555-0108', '1994-12-05', 'female', 'Marketing Coordinator', 2, 4, 'full-time', '2022-02-01', 65000, 'monthly', '333 Third Blvd', 'Denver', 'CO', '80201', 'United States', NULL, 'on-leave', 82, 'employee'),
                ('EMP-010', 'David', 'Miller', 'david.miller@peoplehub.com', $1, '+1-555-0109', '1990-06-22', 'male', 'Sales Representative', 3, NULL, 'full-time', '2021-08-10', 68000, 'monthly', '444 Fourth Ct', 'Atlanta', 'GA', '30301', 'United States', NULL, 'active', 84, 'employee'),
                ('EMP-011', 'Emma', 'Brown', 'emma.brown@peoplehub.com', $1, '+1-555-0110', '1992-03-17', 'female', 'HR Coordinator', 4, 1, 'full-time', '2022-01-15', 62000, 'monthly', '555 Fifth Way', 'Phoenix', 'AZ', '85001', 'United States', NULL, 'active', 86, 'employee'),
                ('EMP-012', 'Frank', 'Garcia', 'frank.garcia@peoplehub.com', $1, '+1-555-0111', '1986-10-09', 'male', 'Financial Analyst', 6, NULL, 'full-time', '2019-07-01', 78000, 'monthly', '666 Sixth Pl', 'Philadelphia', 'PA', '19101', 'United States', NULL, 'active', 87, 'employee'),
                ('EMP-013', 'Grace', 'Harris', 'grace.harris@peoplehub.com', $1, '+1-555-0112', '1995-01-28', 'female', 'Backend Developer', 1, 2, 'full-time', '2022-03-01', 92000, 'monthly', '777 Seventh St', 'San Diego', 'CA', '92101', 'United States', NULL, 'active', 89, 'employee'),
                ('EMP-014', 'Henry', 'King', 'henry.king@peoplehub.com', $1, '+1-555-0113', '1991-08-11', 'male', 'Graphic Designer', 5, NULL, 'full-time', '2021-06-15', 70000, 'monthly', '888 Eighth Ave', 'Dallas', 'TX', '75201', 'United States', NULL, 'active', 83, 'employee'),
                ('EMP-015', 'Ivy', 'Lee', 'ivy.lee@peoplehub.com', $1, '+1-555-0114', '1993-05-19', 'female', 'Content Marketer', 2, 4, 'full-time', '2022-04-01', 63000, 'monthly', '999 Ninth Rd', 'Houston', 'TX', '77001', 'United States', NULL, 'active', 81, 'employee'),
                ('EMP-016', 'Jack', 'Nelson', 'jack.nelson@peoplehub.com', $1, '+1-555-0115', '1988-11-23', 'male', 'Account Manager', 3, NULL, 'full-time', '2020-10-01', 72000, 'monthly', '1010 Tenth Dr', 'Columbus', 'OH', '43201', 'United States', NULL, 'inactive', 75, 'employee'),
                ('EMP-017', 'Kate', 'OBrien', 'kate.obrien@peoplehub.com', $1, '+1-555-0116', '1994-02-07', 'female', 'Recruiter', 4, 1, 'full-time', '2022-05-01', 58000, 'monthly', '1111 Eleventh Ln', 'Indianapolis', 'IN', '46201', 'United States', NULL, 'active', 84, 'employee'),
                ('EMP-018', 'Liam', 'Parker', 'liam.parker@peoplehub.com', $1, '+1-555-0117', '1987-07-14', 'male', 'Accountant', 6, NULL, 'full-time', '2020-02-15', 75000, 'monthly', '1212 Twelfth Ct', 'Charlotte', 'NC', '28201', 'United States', NULL, 'active', 86, 'employee')
        `;
        await client.query(employeeQuery, [hashedPassword]);
        console.log('✅ Employees seeded');

        // Seed Leave Applications
        const leaveQuery = `
            INSERT INTO leave_applications (employee_id, leave_type, start_date, end_date, days, reason, status, approved_by, approved_at)
            VALUES
                (2, 'Du lịch', '2024-12-20', '2024-12-27', 7, 'Nghỉ cuối năm', 'duyệt', 1, CURRENT_TIMESTAMP),
                (3, 'Bệnh', '2024-11-15', '2024-11-16', 2, 'Khám bệnh', 'duyệt', 1, CURRENT_TIMESTAMP),
                (9, 'Lý do cá nhân', '2024-11-28', '2024-11-29', 2, 'Sự kiện gia đình', 'chờ xét duyệt', NULL, NULL),
                (5, 'Du lịch', '2024-12-10', '2024-12-17', 7, 'Kỳ nghỉ lễ', 'chờ xét duyệt', NULL, NULL),
                (7, 'Bệnh', '2024-11-20', '2024-11-21', 2, 'Bị cúm', 'duyệt', 2, CURRENT_TIMESTAMP)
        `;
        await client.query(leaveQuery);
        console.log('✅ Leave applications seeded');

        // Seed Contracts
        const contractQuery = `
            INSERT INTO contracts (employee_id, contract_type, contract_number, start_date, end_date, salary, terms, status, file_path, signed_at)
            VALUES
                (2, 'vĩnh viễn', 'CNT-2019-001', '2019-03-01', NULL, 120000, 'Hợp đồng toàn thời gian vĩnh viễn với đầy đủ quyền lợi', 'còn thời hạn', NULL, '2019-03-01'),
                (3, 'vĩnh viễn', 'CNT-2020-002', '2020-06-15', NULL, 95000, 'Hợp đồng toàn thời gian vĩnh viễn', 'còn thời hạn', NULL, '2020-06-15'),
                (4, 'vĩnh viễn', 'CNT-2021-003', '2021-01-10', NULL, 88000, 'Hợp đồng quản lý với thưởng hiệu suất', 'còn thời hạn', NULL, '2021-01-10'),
                (7, 'vĩnh viễn', 'CNT-2021-004', '2021-11-01', NULL, 95000, 'Hợp đồng kỹ sư phần mềm', 'còn thời hạn', NULL, '2021-11-01'),
                (16, 'có thời hạn', 'CNT-2020-005', '2020-10-01', '2024-10-01', 72000, 'Hợp đồng có thời hạn - 4 năm', 'hết hạn', NULL, '2020-10-01')
        `;
        await client.query(contractQuery);
        console.log('✅ Contracts seeded');

        // Commit transaction
        await client.query('COMMIT');
        console.log('✅ Database seeding completed successfully!');

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Seeding failed:', error);
        throw error;
    } finally {
        client.release();
        process.exit(0);
    }
}

// Run seeding
seedDatabase();
