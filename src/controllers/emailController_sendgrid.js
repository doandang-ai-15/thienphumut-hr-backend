const sgMail = require('@sendgrid/mail');
const asyncHandler = require('../utils/asyncHandler');

// Initialize SendGrid with API Key
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// @desc    Send payroll email using SendGrid API
// @route   POST /api/email/send-payroll
// @access  Private (Admin only)
exports.sendPayrollEmail = asyncHandler(async (req, res) => {
    const {
        recipientEmail,
        subject,
        employeeName
    } = req.body;

    console.log('📧 [SENDGRID] Received request:', {
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

    // Validate SendGrid configuration
    if (!process.env.SENDGRID_API_KEY) {
        console.error('❌ [SENDGRID] SENDGRID_API_KEY not configured');
        return res.status(500).json({
            success: false,
            message: 'SendGrid API key not configured'
        });
    }

    if (!process.env.SENDGRID_SENDER_EMAIL) {
        console.error('❌ [SENDGRID] SENDGRID_SENDER_EMAIL not configured');
        return res.status(500).json({
            success: false,
            message: 'SendGrid sender email not configured'
        });
    }

    console.log('🔧 [SENDGRID] Using sender:', process.env.SENDGRID_SENDER_EMAIL);

    // Prepare attachments
    let attachments = [];
    if (req.files && req.files.file) {
        const file = req.files.file;

        console.log('📎 [SENDGRID] File details:', {
            name: file.name,
            size: file.size,
            mimetype: file.mimetype
        });

        // Convert file buffer to base64
        const fileContent = file.data.toString('base64');

        attachments.push({
            content: fileContent,
            filename: file.name,
            type: file.mimetype,
            disposition: 'attachment'
        });
    }

    // Prepare email HTML
    const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
            <div style="background: linear-gradient(135deg, #F875AA 0%, #AEDEFC 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 28px;">Thiên Phú Mút</h1>
                <p style="color: white; margin: 10px 0 0 0; font-size: 14px;">Hệ thống Quản lý Nhân sự</p>
            </div>

            <div style="background-color: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                <h2 style="color: #F875AA; margin-top: 0;">Bảng lương</h2>
                <p style="color: #333; line-height: 1.6;">Xin chào <strong>${employeeName || 'bạn'}</strong>,</p>
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
    `;

    // Prepare email message
    const msg = {
        to: recipientEmail,
        from: {
            email: process.env.SENDGRID_SENDER_EMAIL,
            name: 'Thiên Phú Mút HR'
        },
        subject: subject,
        html: htmlContent,
        attachments: attachments
    };

    // Send email
    try {
        console.log('📤 [SENDGRID] Sending email to:', recipientEmail);

        const response = await sgMail.send(msg);

        console.log('✅ [SENDGRID] Email sent successfully');
        console.log('📧 [SENDGRID] Response status:', response[0].statusCode);
        console.log('📧 [SENDGRID] Response headers:', response[0].headers);

        res.status(200).json({
            success: true,
            message: 'Email sent successfully',
            statusCode: response[0].statusCode
        });
    } catch (error) {
        console.error('❌ [SENDGRID] Error sending email:', error);

        // SendGrid specific error handling
        if (error.response) {
            console.error('❌ [SENDGRID] Error response body:', error.response.body);
        }

        res.status(500).json({
            success: false,
            message: 'Failed to send email',
            error: error.message
        });
    }
});
