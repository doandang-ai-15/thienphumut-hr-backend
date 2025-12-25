/**
 * Run database migration for email_logs table
 * Usage: node run-migration.js
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function runMigration() {
    console.log('📊 [MIGRATION] Starting email_logs table migration...');

    // Create PostgreSQL connection pool
    const pool = new Pool(
        process.env.DATABASE_URL
            ? {
                  connectionString: process.env.DATABASE_URL,
                  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
              }
            : {
                  host: process.env.DB_HOST,
                  user: process.env.DB_USER,
                  password: process.env.DB_PASSWORD,
                  database: process.env.DB_NAME,
                  port: process.env.DB_PORT,
              }
    );

    try {
        // Read SQL file
        const sqlPath = path.join(__dirname, 'migrations', 'create_email_logs_table.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('📄 [MIGRATION] Read SQL file:', sqlPath);
        console.log('🔧 [MIGRATION] Executing SQL...');

        // Execute SQL
        await pool.query(sql);

        console.log('✅ [MIGRATION] email_logs table created successfully!');
        console.log('✅ [MIGRATION] Indexes created successfully!');

        // Test table by querying it
        const result = await pool.query(`
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_name = 'email_logs'
            ORDER BY ordinal_position
        `);

        console.log('\n📋 [MIGRATION] Table structure:');
        result.rows.forEach(row => {
            console.log(`  - ${row.column_name}: ${row.data_type}`);
        });

    } catch (error) {
        console.error('❌ [MIGRATION] Error:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
        console.log('\n👋 [MIGRATION] Connection closed');
    }
}

// Run migration
runMigration();
