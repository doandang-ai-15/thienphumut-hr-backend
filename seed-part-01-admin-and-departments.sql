-- ====================================================================
-- PART 1: Admin Account & Departments
-- ====================================================================
-- Custom Seed Script for PeopleHub HR System
-- Dữ liệu thực từ Thiên Phú Mút

-- Clean existing data (optional - uncomment if needed)
-- DELETE FROM employees WHERE email LIKE '%@thienphumut.vn';
-- DELETE FROM departments;

-- ====================================================================
-- Insert Admin Account
-- ====================================================================
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

-- ====================================================================
-- Insert Departments
-- ====================================================================
INSERT INTO departments (name, description, employee_count, budget, color) VALUES
('TÀI XẾ', 'Bộ phận Tài xế', 0, 0, '#3B82F6'),
('KHO', 'Bộ phận Kho', 0, 0, '#10B981'),
('QL KHO', 'Bộ phận Quản lý Kho', 0, 0, '#8B5CF6'),
('ÉP NỔI', 'Bộ phận Ép nổi', 0, 0, '#F59E0B'),
('VĂN PHÒNG', 'Bộ phận Văn phòng', 0, 0, '#EF4444'),
('BONDING', 'Bộ phận Bonding', 0, 0, '#EC4899'),
('KHUÔN', 'Bộ phận Khuôn', 0, 0, '#6366F1'),
('DÁN TAY', 'Bộ phận Dán tay', 0, 0, '#14B8A6'),
('GIA CÔNG', 'Bộ phận Gia công', 0, 0, '#F97316'),
('HÀNG ỐNG', 'Bộ phận Hàng ống', 0, 0, '#84CC16'),
('LẠNG HÀNG', 'Bộ phận Lạng hàng', 0, 0, '#06B6D4'),
('XUẤT HÀNG', 'Bộ phận Xuất hàng', 0, 0, '#A855F7'),
('XƯỞNG ATILON', 'Xưởng Atilon', 0, 0, '#F43F5E'),
('XƯỞNG EVA', 'Xưởng EVA', 0, 0, '#0EA5E9');

SELECT 'Part 1 completed: Admin account and Departments inserted' as status;
