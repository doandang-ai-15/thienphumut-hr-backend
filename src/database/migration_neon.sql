-- ============================================================
-- PHOTO MIGRATION FOR NEON DATABASE
-- ============================================================
-- Description: Convert photo field from TEXT (base64) to VARCHAR(255) (file path)
-- Date: 2025-12-10
-- Platform: Neon (PostgreSQL)
--
-- IMPORTANT: Run this AFTER you have uploaded/migrated photo files to your server
-- ============================================================

BEGIN;

-- Step 1: Create backup table with current data
DROP TABLE IF EXISTS employees_photo_backup;
CREATE TABLE employees_photo_backup AS
SELECT id, employee_id, first_name, last_name, photo, created_at
FROM employees
WHERE photo IS NOT NULL AND photo != '';

-- Log how many photos we backed up
DO $$
DECLARE
    backup_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO backup_count FROM employees_photo_backup;
    RAISE NOTICE 'Backed up % employees with photos', backup_count;
END $$;

-- Step 2: Clear existing base64 photo data
-- (You will need to run the Node.js migration script to convert these to files)
UPDATE employees
SET photo = NULL
WHERE photo IS NOT NULL AND photo LIKE 'data:image/%';

-- Step 3: Alter column type from TEXT to VARCHAR(255)
ALTER TABLE employees
ALTER COLUMN photo TYPE VARCHAR(255);

-- Step 4: Add comment to document the change
COMMENT ON COLUMN employees.photo IS 'Relative path to photo file (e.g., assets/photos/employee-123-1234567890.jpg). Updated: 2025-12-10';

-- Step 5: Add check constraint to ensure valid path format (optional)
ALTER TABLE employees
DROP CONSTRAINT IF EXISTS chk_photo_format;

ALTER TABLE employees
ADD CONSTRAINT chk_photo_format
CHECK (
    photo IS NULL
    OR photo = ''
    OR photo LIKE 'assets/photos/%'
);

-- Step 6: Create index for faster photo lookups (optional)
DROP INDEX IF EXISTS idx_employees_photo;
CREATE INDEX idx_employees_photo
ON employees(photo)
WHERE photo IS NOT NULL AND photo != '';

COMMIT;

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================

-- Check the backup table
SELECT
    COUNT(*) as total_backed_up,
    COUNT(CASE WHEN photo LIKE 'data:image/%' THEN 1 END) as base64_photos,
    COUNT(CASE WHEN photo LIKE 'assets/photos/%' THEN 1 END) as path_photos
FROM employees_photo_backup;

-- Check current employees table
SELECT
    COUNT(*) as total_employees,
    COUNT(photo) as employees_with_photo,
    COUNT(CASE WHEN photo LIKE 'assets/photos/%' THEN 1 END) as valid_paths
FROM employees;

-- View sample of employees with photos
SELECT id, employee_id, first_name, last_name,
       CASE
           WHEN photo IS NULL THEN 'NO PHOTO'
           WHEN photo = '' THEN 'EMPTY'
           WHEN photo LIKE 'assets/photos/%' THEN 'FILE PATH'
           ELSE 'OTHER'
       END as photo_type,
       photo
FROM employees
WHERE photo IS NOT NULL AND photo != ''
LIMIT 10;

-- ============================================================
-- SUCCESS MESSAGE
-- ============================================================
DO $$
BEGIN
    RAISE NOTICE '====================================================';
    RAISE NOTICE 'MIGRATION COMPLETED SUCCESSFULLY!';
    RAISE NOTICE '====================================================';
    RAISE NOTICE 'Next steps:';
    RAISE NOTICE '1. Check backup table: employees_photo_backup';
    RAISE NOTICE '2. Upload existing photos using the migration script';
    RAISE NOTICE '3. Update employee records with new photo paths';
    RAISE NOTICE '4. Test photo display on frontend';
    RAISE NOTICE '====================================================';
END $$;
