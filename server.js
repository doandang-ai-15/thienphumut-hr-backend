const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const dotenv = require('dotenv');
const fileUpload = require('express-fileupload');
const { testConnection } = require('./src/config/database');
const errorHandler = require('./src/middleware/errorHandler');

// Load environment variables
dotenv.config();

// Initialize express app
const app = express();

// Middleware
const corsOptions = {
    origin: process.env.NODE_ENV === 'production'
        ? [
            'https://thienphumut.vn',
            'https://www.thienphumut.vn',
            'https://thienphumut-hr-frontend.vercel.app'  // Frontend Vercel URL
          ]
        : '*',  // Allow all in development
    credentials: true,
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));  // Increase JSON payload limit for base64 images
app.use(express.urlencoded({ limit: '50mb', extended: true }));  // Increase URL-encoded payload limit
app.use(morgan('dev'));
app.use(fileUpload({
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
    abortOnLimit: true
}));

// Static files for uploads
app.use('/uploads', express.static('uploads'));
app.use('/assets', express.static('assets'));

// Test database connection
testConnection();

// Routes
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'PeopleHub HR API',
        version: '1.0.0',
        endpoints: {
            auth: '/api/auth',
            dashboard: '/api/dashboard',
            employees: '/api/employees',
            departments: '/api/departments',
            leaves: '/api/leaves',
            contracts: '/api/contracts'
        }
    });
});

// API Routes
app.use('/api/auth', require('./src/routes/authRoutes'));
app.use('/api/dashboard', require('./src/routes/dashboardRoutes'));
app.use('/api/employees', require('./src/routes/employeeRoutes'));
app.use('/api/departments', require('./src/routes/departmentRoutes'));
app.use('/api/leaves', require('./src/routes/leaveRoutes'));
app.use('/api/contracts', require('./src/routes/contractRoutes'));
app.use('/api/email', require('./src/routes/emailRoutes')); // Email endpoint
app.use('/api/activity-logs', require('./src/routes/activityLogRoutes')); // Activity logs endpoint
app.use('/api/seed', require('./src/routes/seedRoutes')); // Seed endpoint

// Error handler (must be last)
app.use(errorHandler);

// Export app for Vercel serverless
module.exports = app;

// Start server only if not in serverless environment
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
        console.log(`🚀 Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (err) => {
        console.log('❌ Unhandled Rejection:', err.message);
        process.exit(1);
    });
}
