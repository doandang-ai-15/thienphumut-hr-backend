const { pool } = require('./src/config/database');

async function createEmailLogsTable() {
    try {
        console.log('📊 Creating email_logs table...\n');

        // Create email_logs table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS email_logs (
                id SERIAL PRIMARY KEY,
                employee_id VARCHAR(50) NOT NULL,
                recipient_email VARCHAR(255) NOT NULL,
                subject VARCHAR(255),
                status VARCHAR(20) NOT NULL,
                sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                error_message TEXT,
                CONSTRAINT chk_email_status CHECK (status IN ('sent', 'failed', 'pending'))
            )
        `);

        console.log('✅ email_logs table created successfully!');

        // Create indexes
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_email_logs_employee ON email_logs(employee_id)
        `);
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_email_logs_status ON email_logs(status)
        `);
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_email_logs_sent_at ON email_logs(sent_at)
        `);

        console.log('✅ Indexes created successfully!');

        // Check table exists
        const result = await pool.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_name = 'email_logs'
            )
        `);

        console.log('\n📋 Table exists:', result.rows[0].exists);

        await pool.end();
        console.log('\n✅ Done!');

    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

createEmailLogsTable();
