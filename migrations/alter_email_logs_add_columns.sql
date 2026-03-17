-- Migration: Add missing columns to email_logs table
-- The old migration created columns (email, error), but code uses (recipient_email, error_message)
-- This migration adds the new columns so both old and new column names exist

-- Add recipient_email column (mirrors existing 'email' column)
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS recipient_email VARCHAR(255);

-- Backfill recipient_email from email for existing rows
UPDATE email_logs SET recipient_email = email WHERE recipient_email IS NULL AND email IS NOT NULL;

-- Add error_message column (mirrors existing 'error' column)
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Backfill error_message from error for existing rows
UPDATE email_logs SET error_message = error WHERE error_message IS NULL AND error IS NOT NULL;

-- Add subject column if missing
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS subject VARCHAR(255);
