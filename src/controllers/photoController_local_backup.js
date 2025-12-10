const path = require('path');
const fs = require('fs').promises;
const asyncHandler = require('../utils/asyncHandler');

// @desc    Upload employee photo
// @route   POST /api/employees/upload-photo
// @access  Private (Admin/Manager)
exports.uploadPhoto = asyncHandler(async (req, res) => {
    // Check if file is provided
    if (!req.files || !req.files.photo) {
        return res.status(400).json({
            success: false,
            message: 'Please upload a photo file'
        });
    }

    const file = req.files.photo;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    if (!allowedTypes.includes(file.mimetype)) {
        return res.status(400).json({
            success: false,
            message: 'Please upload an image file (JPEG, JPG, or PNG)'
        });
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
        return res.status(400).json({
            success: false,
            message: 'File size cannot exceed 5MB'
        });
    }

    // Generate unique filename
    const fileExtension = path.extname(file.name);
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(7);
    const filename = `employee-${timestamp}-${randomString}${fileExtension}`;

    // Define upload path
    const uploadDir = path.join(__dirname, '../../assets/photos');
    const filePath = path.join(uploadDir, filename);

    // Ensure directory exists
    try {
        await fs.mkdir(uploadDir, { recursive: true });
    } catch (error) {
        console.error('Error creating directory:', error);
    }

    // Move file to destination
    await file.mv(filePath);

    // Return relative path (will be stored in database)
    const relativePath = `assets/photos/${filename}`;

    res.status(200).json({
        success: true,
        message: 'Photo uploaded successfully',
        data: {
            filename,
            path: relativePath,
            url: `${req.protocol}://${req.get('host')}/${relativePath}`
        }
    });
});

// @desc    Delete employee photo
// @route   DELETE /api/employees/delete-photo/:filename
// @access  Private (Admin/Manager)
exports.deletePhoto = asyncHandler(async (req, res) => {
    const { filename } = req.params;

    if (!filename) {
        return res.status(400).json({
            success: false,
            message: 'Filename is required'
        });
    }

    // Define file path
    const filePath = path.join(__dirname, '../../assets/photos', filename);

    try {
        // Check if file exists
        await fs.access(filePath);

        // Delete file
        await fs.unlink(filePath);

        res.status(200).json({
            success: true,
            message: 'Photo deleted successfully'
        });
    } catch (error) {
        if (error.code === 'ENOENT') {
            return res.status(404).json({
                success: false,
                message: 'Photo file not found'
            });
        }
        throw error;
    }
});

// @desc    Get photo URL from path
// @route   GET /api/employees/photo-url
// @access  Private
exports.getPhotoUrl = asyncHandler(async (req, res) => {
    const { path: photoPath } = req.query;

    if (!photoPath) {
        return res.status(400).json({
            success: false,
            message: 'Photo path is required'
        });
    }

    // Return full URL
    const url = `${req.protocol}://${req.get('host')}/${photoPath}`;

    res.status(200).json({
        success: true,
        data: {
            url
        }
    });
});
