-- Custom Seed Script for PeopleHub HR System
-- 1 Admin account + 19 HR accounts

-- Clean existing data (optional - uncomment if needed)
-- DELETE FROM employees WHERE email LIKE '%@thienphumut.vn';

-- Insert Admin account
INSERT INTO employees (
    employee_id,
    first_name,
    last_name,
    email,
    phone,
    date_of_birth,
    gender,
    address,
    job_title,
    start_date,
    salary,
    status,
    role,
    password
) VALUES (
    'EMP001',
    'Nguyễn Thu',
    'Trang',
    'trangtn@thienphumut.vn',
    '0902357737',
    '1990-05-15',
    'female',
    '123 Đường Lê Lợi, Quận 1, TP.HCM',
    'Giám đốc Nhân sự',
    '2020-01-01',
    35000000,
    'active',
    'admin',
    '$2a$10$nED1765Jo2wg6WAnCChk4.lDoJfUvogDTNJuMUSVy2PvoYNie2rsW'
);

-- Verify inserted data
SELECT employee_id, first_name, last_name, email, role, job_title FROM employees ORDER BY employee_id;
