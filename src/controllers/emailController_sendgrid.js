const sgMail = require('@sendgrid/mail');
const asyncHandler = require('../utils/asyncHandler');

// Configure SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// @desc    Send payroll email using SendGrid
// @route   POST /api/email/send-payroll
// @access  Private (Admin only)
exports.sendPayrollEmail = asyncHandler(async (req, res) => {
    const {
        senderEmail,
        recipientEmail,
        subject,
        employeeName
    } = req.body;

    console.log('📧 [SENDGRID] Received request:', {
        senderEmail,
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

    // Check for file attachment
    let attachments = [];
    if (req.files && req.files.file) {
        const file = req.files.file;

        console.log('📎 [SENDGRID] File details:', {
            name: file.name,
            size: file.size,
            mimetype: file.mimetype
        });

        // SendGrid attachment format
        attachments.push({
            content: file.data.toString('base64'),
            filename: file.name,
            type: file.mimetype,
            disposition: 'attachment'
        });
    }

    // Prepare email
    const msg = {
        to: recipientEmail,
        from: {
            email: process.env.SENDGRID_SENDER_EMAIL || senderEmail,
            name: 'Thiên Phú Mút HR'
        },
        subject: subject,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #F875AA;">Bảng lương</h2>
                <p>Xin chào <strong>${employeeName}</strong>,</p>
                <p>Vui lòng xem bảng lương của bạn trong file đính kèm.</p>
                <p>Nếu có bất kỳ thắc mắc nào, vui lòng liên hệ với bộ phận nhân sự.</p>
                <br>
                <p style="color: #666;">Trân trọng,</p>
                <p style="color: #666;"><strong>Bộ phận Nhân sự - Thiên Phú Mút</strong></p>
            </div>
        `,
        attachments: attachments
    };

    try {
        console.log('🚀 [SENDGRID] Sending email via SendGrid...');

        // Send email
        await sgMail.send(msg);

        console.log('✅ [SENDGRID] Email sent successfully to:', recipientEmail);

        res.status(200).json({
            success: true,
            message: 'Email sent successfully via SendGrid'
        });
    } catch (error) {
        console.error('❌ [SENDGRID] Error sending email:', error);

        // SendGrid specific error handling
        if (error.response) {
            console.error('SendGrid Error Details:', error.response.body);
        }

        res.status(500).json({
            success: false,
            message: 'Failed to send email',
            error: error.message
        });
    }
});
