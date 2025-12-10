-- Migration: Convert photo field from TEXT (base64) to VARCHAR(255) (file path)
-- Date: 2025-12-10
-- Description: Change photo storage from base64 strings to file paths for better performance

-- Step 1: Create backup of current data (optional but recommended)
CREATE TABLE IF NOT EXISTS employees_backup_20251210 AS
SELECT * FROM employees WHERE photo IS NOT NULL AND photo != '';

-- Step 2: Clear existing base64 photo data (will be migrated via script)
-- Note: Run data migration script BEFORE this to convert base64 to files
UPDATE employees SET photo = NULL WHERE photo IS NOT NULL;

-- Step 3: Alter column type from TEXT to VARCHAR(255)
ALTER TABLE employees
ALTER COLUMN photo TYPE VARCHAR(255);

-- Step 4: Add comment to document the change
COMMENT ON COLUMN employees.photo IS 'Relative path to photo file (e.g., assets/photos/employee-123-1234567890.jpg)';

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Migration completed successfully! Photo field now stores file paths instead of base64 strings.';
    RAISE NOTICE 'Remember to run the data migration script to convert existing photos.';
END $$;
