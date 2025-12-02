# PeopleHub HR Management Backend

Backend API for PeopleHub HR Management System

## Installation

1. Install dependencies:
```bash
cd backend
npm install
```

2. Configure database:
- Create PostgreSQL database
- Copy `.env.example` to `.env`
- Update database credentials in `.env`

3. Setup database:
```bash
# Create database
psql -U postgres
CREATE DATABASE peoplehub_hr;
\q

# Run schema
psql -U postgres -d peoplehub_hr -f src/database/schema.sql

# Seed initial data
npm run seed
```

4. Start server:
```bash
# Development
npm run dev

# Production
npm start
```

## API Endpoints

### Authentication
- POST `/api/auth/login` - Login
- POST `/api/auth/register` - Register
- GET `/api/auth/me` - Get current user
- POST `/api/auth/logout` - Logout

### Employees
- GET `/api/employees` - Get all employees
- GET `/api/employees/:id` - Get employee by ID
- POST `/api/employees` - Create employee
- PUT `/api/employees/:id` - Update employee
- DELETE `/api/employees/:id` - Delete employee
- GET `/api/employees/top` - Get top performers

### Departments
- GET `/api/departments` - Get all departments
- GET `/api/departments/:id` - Get department by ID
- POST `/api/departments` - Create department
- PUT `/api/departments/:id` - Update department
- DELETE `/api/departments/:id` - Delete department

### Leave Applications
- GET `/api/leaves` - Get all leave applications
- GET `/api/leaves/:id` - Get leave by ID
- POST `/api/leaves` - Create leave application
- PUT `/api/leaves/:id` - Update leave status
- DELETE `/api/leaves/:id` - Delete leave

### Contracts
- GET `/api/contracts` - Get all contracts
- GET `/api/contracts/:id` - Get contract by ID
- POST `/api/contracts` - Create contract
- PUT `/api/contracts/:id` - Update contract
- DELETE `/api/contracts/:id` - Delete contract

### Dashboard
- GET `/api/dashboard/stats` - Get dashboard statistics

## Default Login

- Email: `john.doe@peoplehub.com`
- Password: `password123`
- Role: Admin
