const nodemailer = require('nodemailer');
const asyncHandler = require('../utils/asyncHandler');

// @desc    Send payroll email with attachment
// @route   POST /api/email/send-payroll
// @access  Private (Admin)
exports.sendPayrollEmail = asyncHandler(async (req, res) => {
    const { senderEmail, smtpServer, smtpPort, appPassword, recipientEmail, subject, employeeName } = req.body;

    console.log('📧 [EMAIL CONTROLLER] Received request:', {
        senderEmail,
        smtpServer,
        smtpPort,
        recipientEmail,
        subject,
        employeeName,
        hasFile: !!req.files
    });

    // Validate required fields
    if (!senderEmail || !smtpServer || !smtpPort || !appPassword || !recipientEmail || !subject) {
        return res.status(400).json({
            success: false,
            message: 'Missing required fields'
        });
    }

    // Check if file was uploaded
    if (!req.files || !req.files.payrollFile) {
        return res.status(400).json({
            success: false,
            message: 'No file uploaded'
        });
    }

    const file = req.files.payrollFile;
    console.log('📎 [EMAIL CONTROLLER] File details:', {
        name: file.name,
        size: file.size,
        mimetype: file.mimetype
    });

    try {
        // Create transporter
        console.log('🔧 [EMAIL CONTROLLER] Creating SMTP transporter...');
        const transporter = nodemailer.createTransport({
            host: smtpServer.replace(/^https?:\/\//, ''), // Remove http:// or https://
            port: parseInt(smtpPort),
            secure: parseInt(smtpPort) === 465, // true for 465, false for other ports
            auth: {
                user: senderEmail,
                pass: appPassword
            }
        });

        // Verify connection
        console.log('✅ [EMAIL CONTROLLER] Verifying SMTP connection...');
        await transporter.verify();
        console.log('✅ [EMAIL CONTROLLER] SMTP connection verified');

        // Email content
        const mailOptions = {
            from: `"Thiên Phú Mút HR" <${senderEmail}>`,
            to: recipientEmail,
            subject: subject,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <div style="background: linear-gradient(135deg, #F875AA 0%, #AEDEFC 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                        <h1 style="color: white; margin: 0;">Thiên Phú Mút</h1>
                        <p style="color: white; margin: 10px 0 0 0;">Hệ thống quản lý nhân sự</p>
                    </div>
                    <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
                        <p style="font-size: 16px; color: #374151;">Xin chào <strong>${employeeName || 'bạn'}</strong>,</p>
                        <p style="font-size: 14px; color: #6b7280; line-height: 1.6;">
                            Đây là bảng lương của bạn cho kỳ lương này. Vui lòng kiểm tra file đính kèm để xem chi tiết.
                        </p>
                        <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
                            <p style="margin: 0; font-size: 13px; color: #6b7280;">
                                📎 File đính kèm: <strong>${file.name}</strong>
                            </p>
                        </div>
                        <p style="font-size: 13px; color: #9ca3af; margin-top: 30px;">
                            Nếu bạn có bất kỳ thắc mắc nào, vui lòng liên hệ với bộ phận nhân sự.
                        </p>
                        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
                        <p style="font-size: 12px; color: #9ca3af; text-align: center; margin: 0;">
                            © 2025 Thiên Phú Mút. Bản quyền thuộc về Công ty TNHH Thiên Phú Mút.
                        </p>
                    </div>
                </div>
            `,
            attachments: [
                {
                    // Nodemailer automatically handles UTF-8 encoding
                    filename: file.name,
                    content: file.data,
                    contentType: file.mimetype,
                    // Explicitly set encoding for proper handling
                    contentDisposition: 'attachment',
                    headers: {
                        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`
                    }
                }
            ]
        };

        console.log('📤 [EMAIL CONTROLLER] Sending email...');
        const info = await transporter.sendMail(mailOptions);
        console.log('✅ [EMAIL CONTROLLER] Email sent successfully:', info.messageId);

        res.status(200).json({
            success: true,
            message: 'Email sent successfully',
            messageId: info.messageId
        });

    } catch (error) {
        console.error('❌ [EMAIL CONTROLLER] Error sending email:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send email',
            error: error.message
        });
    }
});
