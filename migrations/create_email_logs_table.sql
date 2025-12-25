-- Create email_logs table to track daily email sending
CREATE TABLE IF NOT EXISTS email_logs (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
    email VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL, -- 'success' or 'failed'
    error TEXT,
    sent_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create index for faster date queries
CREATE INDEX IF NOT EXISTS idx_email_logs_sent_at ON email_logs(sent_at);
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON email_logs(status);

-- Create index for daily count queries
CREATE INDEX IF NOT EXISTS idx_email_logs_date_status ON email_logs(DATE(sent_at), status);
