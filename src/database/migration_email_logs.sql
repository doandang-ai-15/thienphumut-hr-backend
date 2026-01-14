-- Migration: Add email_logs table for tracking payroll emails
-- Date: 2026-01-14

-- Create email_logs table
CREATE TABLE IF NOT EXISTS email_logs (
    id SERIAL PRIMARY KEY,
    employee_id VARCHAR(50) NOT NULL,
    recipient_email VARCHAR(255) NOT NULL,
    subject VARCHAR(255),
    status VARCHAR(20) NOT NULL,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    error_message TEXT,
    CONSTRAINT chk_email_status CHECK (status IN ('sent', 'failed', 'pending'))
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_email_logs_employee ON email_logs(employee_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON email_logs(status);
CREATE INDEX IF NOT EXISTS idx_email_logs_sent_at ON email_logs(sent_at);

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'email_logs table created successfully!';
END $$;
