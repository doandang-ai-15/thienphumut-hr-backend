-- ====================================================================
-- Add HR Manager Accounts
-- ====================================================================
-- Password: 12345678
-- Hashed with bcrypt: $2a$10$N9qo8uLOickgx2ZoE5EKP.xrqJm0Km1RVqxRCcKq4xOQl2pHBgLqO

-- Insert HR Manager: Hùng
INSERT INTO employees (
    employee_id,
    first_name,
    last_name,
    email,
    phone,
    date_of_birth,
    gender,
    job_title,
    start_date,
    salary,
    status,
    role,
    password,
    have_gmail
) VALUES (
    'EMP-HUNG',
    'Nguyễn Văn',
    'Hùng',
    'hung@thienphumut.vn',
    '0901234567',
    '1988-03-20',
    'male',
    'Quản lý Nhân sự',
    '2021-06-01',
    25000000,
    'active',
    'manager',
    '$2a$10$N9qo8uLOickgx2ZoE5EKP.xrqJm0Km1RVqxRCcKq4xOQl2pHBgLqO',
    true
) ON CONFLICT (email) DO NOTHING;

-- Insert HR Manager: Khoa
INSERT INTO employees (
    employee_id,
    first_name,
    last_name,
    email,
    phone,
    date_of_birth,
    gender,
    job_title,
    start_date,
    salary,
    status,
    role,
    password,
    have_gmail
) VALUES (
    'EMP-KHOA',
    'Trần Minh',
    'Khoa',
    'khoa@thienphumut.vn',
    '0907654321',
    '1990-07-15',
    'male',
    'Quản lý Nhân sự',
    '2022-01-15',
    25000000,
    'active',
    'manager',
    '$2a$10$N9qo8uLOickgx2ZoE5EKP.xrqJm0Km1RVqxRCcKq4xOQl2pHBgLqO',
    true
) ON CONFLICT (email) DO NOTHING;

SELECT 'HR Manager accounts created successfully' as status;
SELECT email, first_name, last_name, role FROM employees WHERE role IN ('admin', 'manager');
