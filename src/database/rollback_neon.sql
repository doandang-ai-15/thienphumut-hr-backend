-- ============================================================
-- ROLLBACK PHOTO MIGRATION (NEON)
-- ============================================================
-- Use this to restore photos from backup if something goes wrong
-- ============================================================

BEGIN;

-- Step 1: Change column back to TEXT
ALTER TABLE employees
ALTER COLUMN photo TYPE TEXT;

-- Step 2: Restore photos from backup table
UPDATE employees e
SET photo = b.photo
FROM employees_photo_backup b
WHERE e.id = b.id;

-- Step 3: Remove constraint
ALTER TABLE employees
DROP CONSTRAINT IF EXISTS chk_photo_format;

-- Step 4: Update comment
COMMENT ON COLUMN employees.photo IS 'Employee photo (base64 or path)';

COMMIT;

-- Verify restoration
SELECT
    COUNT(*) as total_employees,
    COUNT(photo) as employees_with_photo,
    COUNT(CASE WHEN photo LIKE 'data:image/%' THEN 1 END) as base64_photos,
    COUNT(CASE WHEN photo LIKE 'assets/photos/%' THEN 1 END) as path_photos
FROM employees;

SELECT 'Rollback completed! Photos restored from backup.' as status;
