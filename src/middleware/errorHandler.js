// Error handler middleware
const errorHandler = (err, req, res, next) => {
    let error = { ...err };
    error.message = err.message;

    // Log error for debugging
    console.error('Error:', err);

    // PostgreSQL unique constraint error
    if (err.code === '23505') {
        const field = err.detail?.match(/Key \(([^)]+)\)/)?.[1] || 'field';
        error.message = `${field} already exists`;
        error.statusCode = 400;
    }

    // PostgreSQL foreign key constraint error
    if (err.code === '23503') {
        error.message = 'Referenced record does not exist';
        error.statusCode = 400;
    }

    // PostgreSQL invalid input error
    if (err.code === '22P02') {
        error.message = 'Invalid input value';
        error.statusCode = 400;
    }

    // JWT errors
    if (err.name === 'JsonWebTokenError') {
        error.message = 'Invalid token';
        error.statusCode = 401;
    }

    if (err.name === 'TokenExpiredError') {
        error.message = 'Token expired';
        error.statusCode = 401;
    }

    // Validation errors
    if (err.name === 'ValidationError') {
        error.message = Object.values(err.errors).map(e => e.message).join(', ');
        error.statusCode = 400;
    }

    res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'Server Error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
};

module.exports = errorHandler;
