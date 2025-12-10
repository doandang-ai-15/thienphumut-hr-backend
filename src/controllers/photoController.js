const cloudinary = require('cloudinary').v2;
const asyncHandler = require('../utils/asyncHandler');

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// @desc    Upload employee photo to Cloudinary
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

    try {
        // Upload to Cloudinary
        const result = await cloudinary.uploader.upload(file.tempFilePath, {
            folder: 'thienphumut-hr/employees', // Organize in folder
            resource_type: 'image',
            transformation: [
                { width: 500, height: 500, crop: 'limit' }, // Max 500x500
                { quality: 'auto' }, // Auto optimize quality
                { fetch_format: 'auto' } // Auto format (WebP, etc)
            ]
        });

        // Return Cloudinary URL (this is what we'll store in DB)
        res.status(200).json({
            success: true,
            message: 'Photo uploaded successfully',
            data: {
                filename: result.public_id,
                path: result.secure_url, // Full HTTPS URL
                url: result.secure_url
            }
        });
    } catch (error) {
        console.error('Cloudinary upload error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to upload photo to cloud storage'
        });
    }
});

// @desc    Delete employee photo from Cloudinary
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

    try {
        // Delete from Cloudinary
        // Filename format: thienphumut-hr/employees/xyz123
        const publicId = filename.includes('/')
            ? filename
            : `thienphumut-hr/employees/${filename}`;

        const result = await cloudinary.uploader.destroy(publicId);

        if (result.result === 'ok' || result.result === 'not found') {
            res.status(200).json({
                success: true,
                message: 'Photo deleted successfully'
            });
        } else {
            res.status(400).json({
                success: false,
                message: 'Failed to delete photo'
            });
        }
    } catch (error) {
        console.error('Cloudinary delete error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to delete photo from cloud storage'
        });
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

    // Cloudinary URLs are already full URLs, just return it
    res.status(200).json({
        success: true,
        data: {
            url: photoPath
        }
    });
});
