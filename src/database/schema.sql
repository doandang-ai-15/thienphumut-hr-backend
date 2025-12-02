-- PostgreSQL Schema for PeopleHub HR Management System

-- Create Database (run separately as postgres superuser)
-- CREATE DATABASE peoplehub_hr;
-- \c peoplehub_hr;

-- Enable UUID extension (optional, for future use)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop existing tables if they exist
DROP TABLE IF EXISTS activity_logs CASCADE;
DROP TABLE IF EXISTS contracts CASCADE;
DROP TABLE IF EXISTS leave_applications CASCADE;
DROP TABLE IF EXISTS employees CASCADE;
DROP TABLE IF EXISTS departments CASCADE;

-- Departments Table
CREATE TABLE departments (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    manager_id INTEGER,
    employee_count INTEGER DEFAULT 0,
    budget NUMERIC(12, 2),
    color VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Employees Table
CREATE TABLE employees (
    id SERIAL PRIMARY KEY,
    employee_id VARCHAR(50) UNIQUE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    date_of_birth DATE,
    gender VARCHAR(20) DEFAULT 'prefer-not',
    job_title VARCHAR(100),
    department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
    reports_to INTEGER REFERENCES employees(id) ON DELETE SET NULL,
    employment_type VARCHAR(20) DEFAULT 'full-time',
    start_date DATE,
    salary NUMERIC(12, 2),
    pay_frequency VARCHAR(20) DEFAULT 'monthly',
    address VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(100),
    zip_code VARCHAR(20),
    country VARCHAR(100) DEFAULT 'United States',
    photo TEXT,
    status VARCHAR(20) DEFAULT 'active',
    performance_score NUMERIC(5, 2) DEFAULT 0,
    role VARCHAR(20) DEFAULT 'employee',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_gender CHECK (gender IN ('male', 'female', 'other', 'prefer-not')),
    CONSTRAINT chk_employment_type CHECK (employment_type IN ('full-time', 'part-time', 'contract', 'intern')),
    CONSTRAINT chk_pay_frequency CHECK (pay_frequency IN ('monthly', 'bi-weekly', 'weekly', 'annually')),
    CONSTRAINT chk_status CHECK (status IN ('active', 'on-leave', 'inactive')),
    CONSTRAINT chk_role CHECK (role IN ('admin', 'manager', 'employee'))
);

-- Leave Applications Table
CREATE TABLE leave_applications (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    leave_type VARCHAR(20) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    days INTEGER NOT NULL,
    reason TEXT,
    status VARCHAR(20) DEFAULT 'chờ xét duyệt',
    approved_by INTEGER REFERENCES employees(id) ON DELETE SET NULL,
    approved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_leave_type CHECK (leave_type IN ('Du lịch', 'Bệnh', 'Lý do cá nhân', 'Nghỉ không lương', 'Thai sản', 'Nghĩa vụ quân sự', 'Khác')),
    CONSTRAINT chk_leave_status CHECK (status IN ('chờ xét duyệt', 'duyệt', 'không duyệt'))
);

-- Contracts Table
CREATE TABLE contracts (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    contract_type VARCHAR(20) NOT NULL,
    contract_number VARCHAR(50) UNIQUE,
    start_date DATE NOT NULL,
    end_date DATE,
    salary NUMERIC(12, 2),
    terms TEXT,
    status VARCHAR(20) DEFAULT 'dự thảo hợp đồng',
    file_path VARCHAR(255),
    signed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_contract_type CHECK (contract_type IN ('vĩnh viễn', 'có thời hạn', 'freelance', 'thực tập sinh')),
    CONSTRAINT chk_contract_status CHECK (status IN ('còn thời hạn', 'hết hạn', 'chấm dứt', 'dự thảo hợp đồng'))
);

-- Activity Logs Table
CREATE TABLE activity_logs (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    description TEXT,
    ip_address VARCHAR(45),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX idx_employee_email ON employees(email);
CREATE INDEX idx_employee_department ON employees(department_id);
CREATE INDEX idx_employee_status ON employees(status);
CREATE INDEX idx_leave_employee ON leave_applications(employee_id);
CREATE INDEX idx_leave_status ON leave_applications(status);
CREATE INDEX idx_contract_employee ON contracts(employee_id);
CREATE INDEX idx_contract_status ON contracts(status);

-- Create function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for auto-updating updated_at
CREATE TRIGGER update_departments_updated_at BEFORE UPDATE ON departments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_employees_updated_at BEFORE UPDATE ON employees
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_leave_applications_updated_at BEFORE UPDATE ON leave_applications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_contracts_updated_at BEFORE UPDATE ON contracts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create view for dashboard stats
CREATE OR REPLACE VIEW dashboard_stats AS
SELECT
    (SELECT COUNT(*) FROM employees WHERE status = 'active') as total_employees,
    (SELECT COUNT(*) FROM employees
     WHERE EXTRACT(MONTH FROM created_at) = EXTRACT(MONTH FROM CURRENT_DATE)
     AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM CURRENT_DATE)) as new_this_month,
    (SELECT COUNT(*) FROM departments) as total_departments,
    (SELECT ROUND(AVG(performance_score)::numeric, 2) FROM employees WHERE performance_score > 0) as avg_satisfaction;

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Database schema created successfully!';
END $$;
