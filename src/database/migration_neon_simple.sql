-- ============================================================
-- SIMPLE PHOTO MIGRATION FOR NEON (No Backup)
-- ============================================================
-- Use this if you don't have any existing photos or don't need backup
-- ============================================================

-- 1. Change column type
ALTER TABLE employees
ALTER COLUMN photo TYPE VARCHAR(255);

-- 2. Clear any existing base64 data
UPDATE employees
SET photo = NULL
WHERE photo IS NOT NULL AND photo LIKE 'data:image/%';

-- 3. Add comment
COMMENT ON COLUMN employees.photo IS 'Photo file path (assets/photos/filename.jpg)';

-- 4. Add validation constraint (optional)
ALTER TABLE employees
DROP CONSTRAINT IF EXISTS chk_photo_format;

ALTER TABLE employees
ADD CONSTRAINT chk_photo_format
CHECK (photo IS NULL OR photo = '' OR photo LIKE 'assets/photos/%');

-- Done!
SELECT 'Migration completed! Photo column is now VARCHAR(255)' as status;
