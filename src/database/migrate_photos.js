/**
 * Photo Migration Script
 *
 * This script migrates employee photos from base64 strings stored in the database
 * to actual image files stored in the assets/photos directory.
 *
 * Usage: node src/database/migrate_photos.js
 */

const fs = require('fs').promises;
const path = require('path');
const { pool } = require('../config/database');

const PHOTOS_DIR = path.join(__dirname, '../../assets/photos');

// Ensure photos directory exists
async function ensurePhotosDir() {
    try {
        await fs.mkdir(PHOTOS_DIR, { recursive: true });
        console.log('✅ Photos directory ready:', PHOTOS_DIR);
    } catch (error) {
        console.error('❌ Failed to create photos directory:', error);
        throw error;
    }
}

// Convert base64 to file
async function base64ToFile(base64String, employeeId) {
    try {
        // Check if it's a valid data URL
        if (!base64String.startsWith('data:image/')) {
            console.log(`   ℹ️  Not a base64 image, skipping`);
            return null;
        }

        // Extract mime type and base64 data
        const matches = base64String.match(/^data:image\/([a-zA-Z]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) {
            console.log(`   ⚠️  Invalid base64 format`);
            return null;
        }

        const mimeType = matches[1]; // e.g., 'jpeg', 'png'
        const base64Data = matches[2];

        // Generate filename
        const timestamp = Date.now();
        const filename = `employee-${employeeId}-${timestamp}.${mimeType}`;
        const filePath = path.join(PHOTOS_DIR, filename);

        // Convert base64 to buffer and write to file
        const buffer = Buffer.from(base64Data, 'base64');
        await fs.writeFile(filePath, buffer);

        console.log(`   ✅ Saved: ${filename} (${(buffer.length / 1024).toFixed(2)} KB)`);

        // Return relative path for database
        return `assets/photos/${filename}`;
    } catch (error) {
        console.error(`   ❌ Failed to convert base64 to file:`, error.message);
        return null;
    }
}

// Migrate photos for all employees
async function migratePhotos() {
    let migratedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    try {
        console.log('\n🚀 Starting photo migration...\n');

        // Ensure directory exists
        await ensurePhotosDir();

        // Get all employees with photos
        const result = await pool.query(
            'SELECT id, employee_id, first_name, last_name, photo FROM employees WHERE photo IS NOT NULL AND photo != \'\''
        );

        const employees = result.rows;
        console.log(`📊 Found ${employees.length} employees with photos\n`);

        if (employees.length === 0) {
            console.log('ℹ️  No photos to migrate');
            return;
        }

        // Process each employee
        for (const employee of employees) {
            console.log(`👤 Processing: ${employee.first_name} ${employee.last_name} (ID: ${employee.id})`);
            console.log(`   📷 Photo length: ${employee.photo.length} characters`);

            // Check if already migrated (path format)
            if (employee.photo.startsWith('assets/photos/')) {
                console.log(`   ℹ️  Already migrated, skipping`);
                skippedCount++;
                continue;
            }

            // Convert base64 to file
            const photoPath = await base64ToFile(employee.photo, employee.employee_id || employee.id);

            if (photoPath) {
                // Update database with new path
                await pool.query(
                    'UPDATE employees SET photo = $1 WHERE id = $2',
                    [photoPath, employee.id]
                );
                console.log(`   ✅ Database updated with path: ${photoPath}`);
                migratedCount++;
            } else {
                console.log(`   ⚠️  Skipped (invalid format or error)`);
                skippedCount++;
            }

            console.log(''); // Empty line for readability
        }

        // Summary
        console.log('═'.repeat(60));
        console.log('📊 MIGRATION SUMMARY');
        console.log('═'.repeat(60));
        console.log(`✅ Successfully migrated: ${migratedCount} photos`);
        console.log(`⏭️  Skipped: ${skippedCount} photos`);
        console.log(`❌ Errors: ${errorCount} photos`);
        console.log(`📁 Photos saved to: ${PHOTOS_DIR}`);
        console.log('═'.repeat(60));

        console.log('\n✨ Migration completed!\n');

    } catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    }
}

// Run migration
if (require.main === module) {
    migratePhotos()
        .then(() => {
            console.log('👋 Exiting...');
            process.exit(0);
        })
        .catch((error) => {
            console.error('💥 Fatal error:', error);
            process.exit(1);
        });
}

module.exports = { migratePhotos };
