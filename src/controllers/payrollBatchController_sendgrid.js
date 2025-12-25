const XLSX = require('xlsx');
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs').promises;
const sgMail = require('@sendgrid/mail');
const { pool } = require('../config/database');

// Initialize SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Daily email limit
const DAILY_EMAIL_LIMIT = 80;

/**
 * Get today's email count from database
 */
async function getTodayEmailCount() {
    try {
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

        const result = await pool.query(
            `SELECT COUNT(*) as count
             FROM email_logs
             WHERE DATE(sent_at) = $1 AND status = 'success'`,
            [today]
        );

        return parseInt(result.rows[0]?.count || 0);
    } catch (error) {
        console.error('❌ [EMAIL COUNT] Error getting email count:', error);
        return 0;
    }
}

/**
 * Log sent email to database
 */
async function logSentEmail(employeeId, email, status, error = null) {
    try {
        await pool.query(
            `INSERT INTO email_logs (employee_id, email, status, error, sent_at)
             VALUES ($1, $2, $3, $4, NOW())`,
            [employeeId, email, status, error]
        );
    } catch (error) {
        console.error('❌ [EMAIL LOG] Error logging email:', error);
    }
}

/**
 * Generate batch payroll files AND send emails using SendGrid
 * With daily limit of 80 emails
 */
exports.generateAndSendBatchPayroll = async (req, res) => {
    try {
        console.log('📊 [BATCH SEND] Starting batch generation and email sending with SendGrid...');

        // Setup SSE headers for real-time progress
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // Helper function to send progress updates
        const sendProgress = (data) => {
            res.write(`data: ${JSON.stringify(data)}\n\n`);
        };

        // Check if file was uploaded
        if (!req.file) {
            sendProgress({
                type: 'error',
                message: 'No Overall-payroll file uploaded'
            });
            res.end();
            return;
        }

        // Check daily email limit
        const todayCount = await getTodayEmailCount();
        console.log(`📧 [DAILY LIMIT] Emails sent today: ${todayCount}/${DAILY_EMAIL_LIMIT}`);

        if (todayCount >= DAILY_EMAIL_LIMIT) {
            sendProgress({
                type: 'error',
                message: `Đã đạt giới hạn ${DAILY_EMAIL_LIMIT} emails/ngày. Hôm nay đã gửi ${todayCount} emails.`
            });
            res.end();
            return;
        }

        const remainingQuota = DAILY_EMAIL_LIMIT - todayCount;
        console.log(`📧 [DAILY LIMIT] Remaining quota: ${remainingQuota} emails`);

        const overallPayrollPath = req.file.path;
        const templatePath = path.join(__dirname, '../../temp-peyroll-form/payroll-1.xlsx');

        // Read Overall-payroll file
        const overallWorkbook = XLSX.readFile(overallPayrollPath);
        const overallSheet = overallWorkbook.Sheets[overallWorkbook.SheetNames[0]];
        const overallData = XLSX.utils.sheet_to_json(overallSheet, { header: 1, defval: null, raw: false });

        // Extract month/period from B1 for email subject
        console.log('📅 [BATCH SEND] First 3 rows of Overall-payroll:', overallData.slice(0, 3));
        const monthPeriod = overallData[0]?.[1] || 'N/A';
        console.log('📅 [BATCH SEND] Month period extracted:', monthPeriod);

        // Calculate number of employees
        let maxLength = 0;
        for (let i = overallData.length - 1; i >= 0; i--) {
            const row = overallData[i];
            if (row && row.some(cell => cell !== null && cell !== undefined && cell !== '')) {
                maxLength = i + 1;
                break;
            }
        }

        const employeeCount = maxLength - 3;
        console.log(`👥 Found ${employeeCount} employees to process`);

        if (employeeCount <= 0) {
            sendProgress({
                type: 'error',
                message: 'No employee data found in Overall-payroll file'
            });
            res.end();
            return;
        }

        // Send initial progress
        sendProgress({
            type: 'start',
            total: employeeCount,
            dailyLimit: DAILY_EMAIL_LIMIT,
            todayCount: todayCount,
            remainingQuota: remainingQuota
        });

        // Results tracking
        const results = {
            success: [],
            noGmail: [],
            notFound: [],
            failed: [],
            limitReached: []  // New category for emails not sent due to limit
        };

        let emailsSentThisSession = 0;

        for (let empIndex = 1; empIndex <= employeeCount; empIndex++) {
            const rowIndex = empIndex + 2;
            const employeeName = overallData[rowIndex][0]; // Column A
            const employeeCode = overallData[rowIndex][1]; // Column B

            console.log(`\n📝 Processing Employee ${empIndex}/${employeeCount}: ${employeeName} (${employeeCode})`);

            // Query employee from database by employee_id
            const employeeResult = await pool.query(
                'SELECT id, first_name, last_name, email, have_gmail FROM employees WHERE employee_id = $1',
                [employeeCode]
            );

            if (employeeResult.rows.length === 0) {
                console.log(`⚠️ Employee ${employeeCode} not found in database`);
                results.notFound.push({
                    employeeName,
                    employeeCode,
                    reason: 'Không tìm thấy nhân viên trong hệ thống'
                });

                sendProgress({
                    type: 'progress',
                    current: empIndex,
                    total: employeeCount,
                    status: 'notFound',
                    employeeName,
                    employeeCode
                });
                continue;
            }

            const employee = employeeResult.rows[0];

            // Check if employee has Gmail configured
            if (!employee.have_gmail || !employee.email) {
                console.log(`⚠️ Employee ${employeeCode} has not configured Gmail`);
                results.noGmail.push({
                    employeeName: `${employee.first_name} ${employee.last_name}`,
                    employeeCode,
                    email: employee.email || 'N/A',
                    reason: 'Chưa cập nhật Gmail'
                });

                sendProgress({
                    type: 'progress',
                    current: empIndex,
                    total: employeeCount,
                    status: 'noGmail',
                    employeeName: `${employee.first_name} ${employee.last_name}`,
                    employeeCode
                });
                continue;
            }

            // Check if we've reached daily limit
            const currentTotalSent = todayCount + emailsSentThisSession;
            if (currentTotalSent >= DAILY_EMAIL_LIMIT) {
                console.log(`⚠️ Daily limit reached (${DAILY_EMAIL_LIMIT}). Stopping email sending.`);
                results.limitReached.push({
                    employeeName: `${employee.first_name} ${employee.last_name}`,
                    employeeCode,
                    email: employee.email,
                    reason: `Đã đạt giới hạn ${DAILY_EMAIL_LIMIT} emails/ngày`
                });

                sendProgress({
                    type: 'progress',
                    current: empIndex,
                    total: employeeCount,
                    status: 'limitReached',
                    employeeName: `${employee.first_name} ${employee.last_name}`,
                    employeeCode,
                    email: employee.email
                });
                continue;
            }

            try {
                // Generate payroll file
                const workbook = new ExcelJS.Workbook();
                await workbook.xlsx.readFile(templatePath);
                const worksheet = workbook.getWorksheet(1);

                // Apply mapping
                const mappings = [
                    { target: 'M1', source: { col: 1, row: 1 } },
                    { target: 'C5', source: { col: 0, row: rowIndex } },
                    { target: 'H5', source: { col: 1, row: rowIndex } },
                    { target: 'C6', source: { col: 2, row: rowIndex } },
                    { target: 'C7', source: { col: 3, row: rowIndex } },
                    { target: 'H7', source: { col: 4, row: rowIndex } },
                    { target: 'C8', source: { col: 5, row: rowIndex } },
                    { target: 'H8', source: { col: 6, row: rowIndex } },
                    { target: 'D10', source: { col: 7, row: rowIndex } },
                    { target: 'E10', source: { col: 8, row: rowIndex } },
                    { target: 'D13', source: { col: 9, row: rowIndex } },
                    { target: 'E13', source: { col: 10, row: rowIndex } },
                    { target: 'H13', source: { col: 11, row: rowIndex } },
                    { target: 'H14', source: { col: 12, row: rowIndex } },
                    { target: 'H15', source: { col: 13, row: rowIndex } },
                    { target: 'E23', source: { col: 14, row: rowIndex } },
                    { target: 'E25', source: { col: 15, row: rowIndex } },
                    { target: 'H26', source: { col: 16, row: rowIndex } },
                    { target: 'E28', source: { col: 17, row: rowIndex } },
                    { target: 'E29', source: { col: 18, row: rowIndex } }
                ];

                mappings.forEach(mapping => {
                    const sourceValue = overallData[mapping.source.row]?.[mapping.source.col];
                    if (sourceValue !== null && sourceValue !== undefined && sourceValue !== '') {
                        const cell = worksheet.getCell(mapping.target);
                        let finalValue = sourceValue;
                        if (typeof sourceValue === 'string' && sourceValue.includes('VND')) {
                            const numStr = sourceValue.replace(/[^\d.-]/g, '');
                            finalValue = parseFloat(numStr) || sourceValue;
                        }
                        cell.value = finalValue;
                    }
                });

                // Save file to buffer
                const buffer = await workbook.xlsx.writeBuffer();

                // Prepare email with SendGrid
                const subject = `Bảng lương tháng ${monthPeriod} - ${employee.first_name} ${employee.last_name}`;
                const fileName = `payroll_${employeeCode}_${employeeName.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`;

                const msg = {
                    to: employee.email,
                    from: {
                        email: process.env.SENDGRID_SENDER_EMAIL,
                        name: process.env.MAIL_FROM_NAME || 'Thiên Phú Mút HR'
                    },
                    subject: subject,
                    html: `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
                            <div style="background: linear-gradient(135deg, #F875AA 0%, #AEDEFC 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
                                <h1 style="color: white; margin: 0; font-size: 28px;">Thiên Phú Mút</h1>
                                <p style="color: white; margin: 10px 0 0 0; font-size: 14px;">Hệ thống Quản lý Nhân sự</p>
                            </div>

                            <div style="background-color: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                                <h2 style="color: #F875AA; margin-top: 0;">Bảng lương tháng ${monthPeriod}</h2>
                                <p style="color: #333; line-height: 1.6;">Xin chào <strong>${employee.first_name} ${employee.last_name}</strong>,</p>
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
                    attachments: [{
                        content: buffer.toString('base64'),
                        filename: fileName,
                        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                        disposition: 'attachment'
                    }]
                };

                // Send email with SendGrid
                const startTime = Date.now();
                await sgMail.send(msg);
                const sendDuration = Date.now() - startTime;

                console.log(`✅ Email sent successfully to ${employee.email} (took ${sendDuration}ms)`);

                // Log to database
                await logSentEmail(employee.id, employee.email, 'success');

                emailsSentThisSession++;

                results.success.push({
                    employeeName: `${employee.first_name} ${employee.last_name}`,
                    employeeCode,
                    email: employee.email,
                    status: 'Đã gửi thành công'
                });

                sendProgress({
                    type: 'progress',
                    current: empIndex,
                    total: employeeCount,
                    status: 'success',
                    employeeName: `${employee.first_name} ${employee.last_name}`,
                    employeeCode,
                    email: employee.email,
                    emailsSentToday: todayCount + emailsSentThisSession,
                    remainingQuota: DAILY_EMAIL_LIMIT - (todayCount + emailsSentThisSession)
                });

                // Small delay to avoid rate limiting (SendGrid allows 600 emails/second but let's be safe)
                await new Promise(resolve => setTimeout(resolve, 100));

            } catch (emailError) {
                console.error(`❌ Failed to send email to ${employee.email}:`, emailError);

                // Log to database
                await logSentEmail(employee.id, employee.email, 'failed', emailError.message);

                results.failed.push({
                    employeeName: `${employee.first_name} ${employee.last_name}`,
                    employeeCode,
                    email: employee.email,
                    error: emailError.message || 'Unknown error'
                });

                sendProgress({
                    type: 'progress',
                    current: empIndex,
                    total: employeeCount,
                    status: 'failed',
                    employeeName: `${employee.first_name} ${employee.last_name}`,
                    employeeCode,
                    email: employee.email,
                    error: emailError.message
                });
            }
        }

        // Clean up uploaded file
        await fs.unlink(overallPayrollPath);

        console.log(`\n🎉 [BATCH SEND] Processing complete!`);
        console.log(`✅ Success: ${results.success.length}`);
        console.log(`⚠️ No Gmail: ${results.noGmail.length}`);
        console.log(`❌ Not Found: ${results.notFound.length}`);
        console.log(`❌ Failed: ${results.failed.length}`);
        console.log(`⏸️ Limit Reached: ${results.limitReached.length}`);
        console.log(`📧 Total emails sent today: ${todayCount + emailsSentThisSession}/${DAILY_EMAIL_LIMIT}`);

        // Send final complete message
        sendProgress({
            type: 'complete',
            total: employeeCount,
            summary: {
                success: results.success.length,
                noGmail: results.noGmail.length,
                notFound: results.notFound.length,
                failed: results.failed.length,
                limitReached: results.limitReached.length,
                totalSentToday: todayCount + emailsSentThisSession,
                dailyLimit: DAILY_EMAIL_LIMIT,
                remainingQuota: DAILY_EMAIL_LIMIT - (todayCount + emailsSentThisSession)
            },
            results: results
        });

        res.end();

    } catch (error) {
        console.error('❌ [BATCH SEND] Error:', error);

        try {
            res.write(`data: ${JSON.stringify({
                type: 'error',
                message: 'Failed to process batch payroll',
                error: error.message
            })}\n\n`);
        } catch (e) {
            // Ignore if response already closed
        }
        res.end();
    }
};
