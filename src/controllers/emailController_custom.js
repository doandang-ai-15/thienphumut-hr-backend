const nodemailer = require('nodemailer');
const asyncHandler = require('../utils/asyncHandler');
const fs = require('fs').promises;

// @desc    Send payroll email using custom mail server
// @route   POST /api/email/send-payroll
// @access  Private (Admin only)
exports.sendPayrollEmail = asyncHandler(async (req, res) => {
    const {
        recipientEmail,
        subject,
        employeeName
    } = req.body;

    console.log('📧 [CUSTOM MAIL] Received request:', {
        recipientEmail,
        subject,
        employeeName,
        hasFile: !!req.files?.file
    });

    // Validate inputs
    if (!recipientEmail || !subject) {
        return res.status(400).json({
            success: false,
            message: 'Missing required fields: recipientEmail, subject'
        });
    }

    // Get mail config from environment
    const mailConfig = {
        host: process.env.MAIL_HOST,
        port: parseInt(process.env.MAIL_PORT),
        secure: process.env.MAIL_PORT === '465', // true for 465, false for other ports
        auth: {
            user: process.env.MAIL_USER,
            pass: process.env.MAIL_PASSWORD
        },
        tls: {
            rejectUnauthorized: false // Allow self-signed certificates
        },
        connectionTimeout: 60000, // 60 seconds
        greetingTimeout: 30000,   // 30 seconds
        socketTimeout: 60000      // 60 seconds
    };

    console.log('🔧 [CUSTOM MAIL] Mail config:', {
        host: mailConfig.host,
        port: mailConfig.port,
        secure: mailConfig.secure,
        user: mailConfig.auth.user
    });

    // Create transporter
    let transporter;
    try {
        transporter = nodemailer.createTransport(mailConfig);
        console.log('✅ [CUSTOM MAIL] Transporter created');
    } catch (error) {
        console.error('❌ [CUSTOM MAIL] Failed to create transporter:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to configure mail server',
            error: error.message
        });
    }

    // Skip verification - will verify when sending
    console.log('⏭️ [CUSTOM MAIL] Skipping verification, will verify during send');

    // Prepare attachments
    let attachments = [];
    if (req.files && req.files.file) {
        const file = req.files.file;

        console.log('📎 [CUSTOM MAIL] File details:', {
            name: file.name,
            size: file.size,
            mimetype: file.mimetype,
            tempFilePath: file.tempFilePath,
            dataType: typeof file.data,
            isBuffer: Buffer.isBuffer(file.data)
        });

        // Read file from temp path if available, otherwise use buffer
        let fileContent;
        if (file.tempFilePath) {
            console.log('📁 [CUSTOM MAIL] Reading file from temp path:', file.tempFilePath);
            fileContent = await fs.readFile(file.tempFilePath);
        } else {
            console.log('📦 [CUSTOM MAIL] Using file buffer directly');
            fileContent = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data);
        }

        attachments.push({
            filename: file.name,
            content: fileContent,
            contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' // Proper Excel MIME type
        });
    }

    // Prepare email
    const mailOptions = {
        from: {
            name: process.env.MAIL_FROM_NAME || 'Thiên Phú Mút HR',
            address: process.env.MAIL_FROM_ADDRESS || process.env.MAIL_USER
        },
        to: recipientEmail,
        subject: subject,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
                <div style="background: linear-gradient(135deg, #F875AA 0%, #AEDEFC 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
                    <h1 style="color: white; margin: 0; font-size: 28px;">Thiên Phú Mút</h1>
                    <p style="color: white; margin: 10px 0 0 0; font-size: 14px;">Hệ thống Quản lý Nhân sự</p>
                </div>

                <div style="background-color: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                    <h2 style="color: #F875AA; margin-top: 0;">Bảng lương</h2>
                    <p style="color: #333; line-height: 1.6;">Xin chào <strong>${employeeName}</strong>,</p>
                    <p style="color: #333; line-height: 1.6;">Vui lòng xem bảng lương của bạn trong file đính kèm.</p>
                    <p style="color: #333; line-height: 1.6;">Nếu có bất kỳ thắc mắc nào, vui lòng liên hệ với bộ phận nhân sự.</p>

                    <div style="margin: 30px 0; padding: 20px; background-color: #EDFFF0; border-left: 4px solid #AEDEFC; border-radius: 5px;">
                        <p style="margin: 0; color: #666; font-size: 14px;">
                            <strong>Lưu ý:</strong> Đây là email tự động từ hệ thống. Vui lòng không trả lời email này.
                        </p>
                    </div>

                    <p style="color: #666; margin-top: 30px;">Trân trọng,</p>
                    <p style="color: #666; margin: 5px 0;"><strong>Bộ phận Nhân sự</strong></p>
                    <p style="color: #666; margin: 0;">Thiên Phú Mút</p>
                </div>

                <div style="text-align: center; margin-top: 20px; padding: 20px; color: #999; font-size: 12px;">
                    <p style="margin: 0;">© ${new Date().getFullYear()} Thiên Phú Mút. All rights reserved.</p>
                    <p style="margin: 5px 0 0 0;">Email: nhansu@thienphumut.vn | Website: thienphumut.vn</p>
                </div>
            </div>
        `,
        attachments: attachments
    };

    // Send email
    let tempFilePath = null;
    try {
        console.log('📤 [CUSTOM MAIL] Sending email to:', recipientEmail);

        // Store temp file path for cleanup
        if (req.files && req.files.file && req.files.file.tempFilePath) {
            tempFilePath = req.files.file.tempFilePath;
        }

        const info = await transporter.sendMail(mailOptions);

        console.log('✅ [CUSTOM MAIL] Email sent successfully');
        console.log('📧 [CUSTOM MAIL] Message ID:', info.messageId);
        console.log('📧 [CUSTOM MAIL] Response:', info.response);

        // Cleanup temp file after successful send
        if (tempFilePath) {
            try {
                await fs.unlink(tempFilePath);
                console.log('🗑️ [CUSTOM MAIL] Cleaned up temp file:', tempFilePath);
            } catch (cleanupError) {
                console.warn('⚠️ [CUSTOM MAIL] Failed to cleanup temp file:', cleanupError.message);
            }
        }

        res.status(200).json({
            success: true,
            message: 'Email sent successfully',
            messageId: info.messageId
        });
    } catch (error) {
        console.error('❌ [CUSTOM MAIL] Error sending email:', error);

        // Cleanup temp file even on error
        if (tempFilePath) {
            try {
                await fs.unlink(tempFilePath);
                console.log('🗑️ [CUSTOM MAIL] Cleaned up temp file after error:', tempFilePath);
            } catch (cleanupError) {
                console.warn('⚠️ [CUSTOM MAIL] Failed to cleanup temp file:', cleanupError.message);
            }
        }

        res.status(500).json({
            success: false,
            message: 'Failed to send email',
            error: error.message
        });
    }
});
