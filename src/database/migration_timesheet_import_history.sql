-- Migration: Create timesheet import history tables (Cloudinary storage version)
-- Run this once in your PostgreSQL database

-- Table 1: Each import session (one per file upload)
CREATE TABLE IF NOT EXISTS timesheet_import_sessions (
    id SERIAL PRIMARY KEY,
    imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    file_name VARCHAR(255) NOT NULL,
    file_url TEXT,                              -- Cloudinary secure URL for download
    cloudinary_public_id VARCHAR(500),          -- Cloudinary public_id (for deletion if needed)
    month_period VARCHAR(100),                  -- e.g. "02 / 2026"
    timesheet_number INTEGER DEFAULT 1,        -- Số máy chấm công (1, 2, 3)
    total_employees INTEGER DEFAULT 0,
    total_success INTEGER DEFAULT 0,
    total_no_gmail INTEGER DEFAULT 0,
    total_not_found INTEGER DEFAULT 0,
    total_failed INTEGER DEFAULT 0,
    total_limit_reached INTEGER DEFAULT 0,
    imported_by_id INTEGER,                     -- Employee ID of admin who imported
    imported_by_name VARCHAR(255)               -- Snapshot of admin name at import time
);

-- Table 2: Per-employee result for each session
CREATE TABLE IF NOT EXISTS timesheet_import_details (
    id SERIAL PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES timesheet_import_sessions(id) ON DELETE CASCADE,
    employee_code VARCHAR(50),
    employee_name VARCHAR(255),
    email VARCHAR(255),
    status VARCHAR(30) NOT NULL,                -- 'sent', 'failed', 'not_found', 'no_gmail', 'limit_reached'
    error_message TEXT,
    processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_timesheet_detail_status CHECK (
        status IN ('sent', 'failed', 'not_found', 'no_gmail', 'limit_reached')
    )
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_timesheet_sessions_imported_at ON timesheet_import_sessions(imported_at DESC);
CREATE INDEX IF NOT EXISTS idx_timesheet_details_session_id ON timesheet_import_details(session_id);
CREATE INDEX IF NOT EXISTS idx_timesheet_details_status ON timesheet_import_details(status);
