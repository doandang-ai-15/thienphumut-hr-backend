const { Pool } = require('pg');
require('dotenv').config();

// Create PostgreSQL connection pool
// Support both DATABASE_URL (Railway/Heroku) and individual credentials (local)
const pool = new Pool(
    process.env.DATABASE_URL
        ? {
              connectionString: process.env.DATABASE_URL,
              ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
              max: 10,
              idleTimeoutMillis: 30000,
              connectionTimeoutMillis: 2000,
          }
        : {
              host: process.env.DB_HOST,
              user: process.env.DB_USER,
              password: process.env.DB_PASSWORD,
              database: process.env.DB_NAME,
              port: process.env.DB_PORT,
              max: 10,
              idleTimeoutMillis: 30000,
              connectionTimeoutMillis: 2000,
          }
);

// Test connection (disabled for serverless)
const testConnection = async () => {
    // Serverless functions don't run at startup
    // Connection will be tested on first query
    return true;
};

// Handle pool errors (disabled for serverless - no persistent connections)
// pool.on('error', (err) => {
//     console.error('Unexpected error on idle client', err);
// });

module.exports = { pool, testConnection };
