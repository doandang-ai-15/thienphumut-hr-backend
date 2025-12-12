-- Add have_gmail column to employees table
ALTER TABLE employees
ADD COLUMN IF NOT EXISTS have_gmail BOOLEAN DEFAULT true;

-- Update existing records to have default value
UPDATE employees
SET have_gmail = true
WHERE have_gmail IS NULL;

-- Add comment
COMMENT ON COLUMN employees.have_gmail IS 'Whether employee has a Gmail account configured';
