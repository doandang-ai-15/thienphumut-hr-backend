const XLSX = require('xlsx');
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs').promises;
const brevo = require('@getbrevo/brevo');
const { pool } = require('../config/database');

// Initialize Brevo API
let apiInstance = new brevo.TransactionalEmailsApi();
let apiKey = apiInstance.authentications['apiKey'];
apiKey.apiKey = process.env.BREVO_API_KEY;

// Daily email limit
const DAILY_EMAIL_LIMIT = 300; // Brevo free plan: 300 emails/day

/**
 * Get today's email count from database
 */
async function getTodayEmailCount() {
    try {
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

        const result = await pool.query(
            `SELECT COUNT(*) as count
             FROM email_logs
             WHERE DATE(sent_at) = $1 AND status = 'sent'`,
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
            `INSERT INTO email_logs (employee_id, recipient_email, status, error_message, sent_at)
             VALUES ($1, $2, $3, $4, NOW())`,
            [employeeId, email, status, error]
        );
    } catch (error) {
        console.error('❌ [EMAIL LOG] Error logging email:', error);
    }
}

/**
 * Generate batch payroll files AND send emails using Brevo API
 * With daily limit of 300 emails
 */
exports.generateAndSendBatchPayroll = async (req, res) => {
    try {
        console.log('📊 [BATCH SEND - BREVO] Starting batch generation and email sending...');

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
            limitReached: []
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

                // Apply mapping (same as other controllers)
                const mappings = [
                    { target: 'B1', source: { col: 1, row: 0 }, type: 'header' }, // A[B1] -> B[B1] with 3-line format
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
                    // New mappings - Số ngày (days format)
                    { target: 'D11', source: { col: 19, row: rowIndex }, type: 'days' },
                    { target: 'D12', source: { col: 21, row: rowIndex }, type: 'days' },
                    { target: 'D14', source: { col: 26, row: rowIndex }, type: 'days' },
                    { target: 'D15', source: { col: 28, row: rowIndex }, type: 'days' },
                    { target: 'D16', source: { col: 30, row: rowIndex }, type: 'days' },
                    { target: 'D17', source: { col: 32, row: rowIndex }, type: 'days' },
                    { target: 'D19', source: { col: 35, row: rowIndex }, type: 'days' },
                    { target: 'D20', source: { col: 37, row: rowIndex }, type: 'days' },
                    { target: 'D21', source: { col: 39, row: rowIndex }, type: 'days' },
                    // New mappings - Tiền tệ (currency format)
                    { target: 'E11', source: { col: 20, row: rowIndex }, type: 'currency' },
                    { target: 'E12', source: { col: 22, row: rowIndex }, type: 'currency' },
                    { target: 'H10', source: { col: 23, row: rowIndex }, type: 'currency' },
                    { target: 'H11', source: { col: 24, row: rowIndex }, type: 'currency' },
                    { target: 'H12', source: { col: 25, row: rowIndex }, type: 'currency' },
                    { target: 'E14', source: { col: 27, row: rowIndex }, type: 'currency' },
                    { target: 'E15', source: { col: 29, row: rowIndex }, type: 'currency' },
                    { target: 'E16', source: { col: 31, row: rowIndex }, type: 'currency' },
                    { target: 'E17', source: { col: 33, row: rowIndex }, type: 'currency' },
                    { target: 'E18', source: { col: 34, row: rowIndex }, type: 'currency' },
                    { target: 'E19', source: { col: 36, row: rowIndex }, type: 'currency' },
                    { target: 'E20', source: { col: 38, row: rowIndex }, type: 'currency' },
                    { target: 'E22', source: { col: 40, row: rowIndex }, type: 'currency' },
                    { target: 'H16', source: { col: 41, row: rowIndex }, type: 'currency' },
                    { target: 'H17', source: { col: 42, row: rowIndex }, type: 'currency' },
                    { target: 'H18', source: { col: 43, row: rowIndex }, type: 'currency' },
                    { target: 'H19', source: { col: 44, row: rowIndex }, type: 'currency' },
                    { target: 'H20', source: { col: 45, row: rowIndex }, type: 'currency' },
                    { target: 'H21', source: { col: 46, row: rowIndex }, type: 'currency' },
                    { target: 'H22', source: { col: 47, row: rowIndex }, type: 'currency' },
                    { target: 'E24', source: { col: 48, row: rowIndex }, type: 'currency' },
                    { target: 'E26', source: { col: 49, row: rowIndex }, type: 'currency' },
                    { target: 'E27', source: { col: 50, row: rowIndex }, type: 'currency' },
                    { target: 'H24', source: { col: 51, row: rowIndex }, type: 'currency' }, // A[AZ]
                    { target: 'H25', source: { col: 52, row: rowIndex }, type: 'currency' }, // A[BA]
                    { target: 'H26', source: { col: 54, row: rowIndex }, type: 'currency' }, // A[BC]
                    { target: 'H27', source: { col: 55, row: rowIndex }, type: 'currency' }, // A[BD]
                    { target: 'H28', source: { col: 56, row: rowIndex }, type: 'currency' }, // A[BE]
                    { target: 'H29', source: { col: 57, row: rowIndex }, type: 'currency' }, // A[BF]
                    { target: 'H30', source: { col: 58, row: rowIndex }, type: 'currency' }, // A[BG]
                    { target: 'E30', source: { col: 18, row: rowIndex } }, // A[S] -> B[E30]
                    // New mapping - A[BB] to B[H6]
                    { target: 'H6', source: { col: 53, row: rowIndex } } // A[BB]
                ];

                mappings.forEach(mapping => {
                    const sourceValue = overallData[mapping.source.row]?.[mapping.source.col];

                    // Skip if value is null, undefined, or empty string
                    if (sourceValue === null || sourceValue === undefined || sourceValue === '') {
                        return; // Don't map, keep original value in B file
                    }

                    // Skip if value is exactly 0 (number)
                    if (sourceValue === 0) {
                        return; // Don't map, keep original value in B file
                    }

                    // Skip if value is "VND 0" or similar currency zero formats
                    if (typeof sourceValue === 'string') {
                        const trimmed = sourceValue.trim();
                        // Check for "VND 0", "VND0", "0 VND", etc.
                        if (trimmed === 'VND 0' || trimmed === 'VND0' || trimmed === '0 VND' ||
                            trimmed === '0VND' || /^VND\s*0+$/.test(trimmed) || /^0+\s*VND$/.test(trimmed)) {
                            return; // Don't map, keep original value in B file
                        }
                    }

                    const cell = worksheet.getCell(mapping.target);
                    let finalValue = sourceValue;

                    // Handle different mapping types
                    if (mapping.type === 'header') {
                        // Special handling for B1 header cell (3-line merged cell)
                        // Format: Line 1: THIEN PHU MUT CO.,LTD
                        //         Line 2: PHIẾU LƯƠNG
                        //         Line 3: [Value from A[B1]]
                        finalValue = `THIEN PHU MUT CO.,LTD\nPHIẾU LƯƠNG\n${sourceValue}`;
                    } else if (mapping.type === 'currency') {
                        // Parse currency values (remove VND and convert to number)
                        if (typeof sourceValue === 'string' && sourceValue.includes('VND')) {
                            const numStr = sourceValue.replace(/[^\d.-]/g, '');
                            const parsedValue = parseFloat(numStr);

                            // Skip if parsed value is 0 or NaN
                            if (!parsedValue || parsedValue === 0) {
                                return; // Don't map, keep original value in B file
                            }

                            finalValue = parsedValue;
                        } else if (typeof sourceValue === 'number') {
                            // If it's already a number, check if it's 0
                            if (sourceValue === 0) {
                                return; // Don't map, keep original value in B file
                            }
                            finalValue = sourceValue;
                        }
                    } else if (mapping.type === 'days') {
                        // Keep days values as-is (already formatted with "ngày" in source data)
                        finalValue = sourceValue;

                        // Skip if value contains "0 ngày", "0.0 ngày", etc.
                        if (typeof sourceValue === 'string') {
                            const trimmed = sourceValue.trim();
                            // Extract number from string like "0 ngày", "0.0 ngày", "26 ngày"
                            const numMatch = trimmed.match(/^([\d.]+)\s*ngày/);
                            if (numMatch) {
                                const numValue = parseFloat(numMatch[1]);
                                // Skip if number is 0 or 0.0
                                if (numValue === 0) {
                                    return; // Don't map, keep original value in B file
                                }
                            }
                        }
                    } else {
                        // Default: parse currency if contains VND
                        if (typeof sourceValue === 'string' && sourceValue.includes('VND')) {
                            const numStr = sourceValue.replace(/[^\d.-]/g, '');
                            const parsedValue = parseFloat(numStr);

                            // Skip if parsed value is 0 or NaN
                            if (!parsedValue || parsedValue === 0) {
                                return; // Don't map, keep original value in B file
                            }

                            finalValue = parsedValue;
                        }
                    }

                    cell.value = finalValue;
                });

                // Save file to buffer
                const buffer = await workbook.xlsx.writeBuffer();
                const base64Attachment = buffer.toString('base64');

                // Prepare email with Brevo API
                const subject = `Bảng lương tháng ${monthPeriod} - ${employee.first_name} ${employee.last_name}`;
                const fileName = `payroll_${employeeCode}_${employeeName.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`;

                const sendSmtpEmail = new brevo.SendSmtpEmail();

                sendSmtpEmail.subject = subject;
                sendSmtpEmail.to = [{
                    email: employee.email,
                    name: `${employee.first_name} ${employee.last_name}`
                }];
                sendSmtpEmail.sender = {
                    name: process.env.MAIL_FROM_NAME || 'Thiên Phú Mút HR',
                    email: process.env.BREVO_SENDER_EMAIL || 'nhansu@thienphumut.vn'
                };
                sendSmtpEmail.htmlContent = `
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
                            <p style="color: #d32f2f; line-height: 1.6; font-weight: 600; background-color: #ffebee; padding: 10px; border-radius: 5px;">
                                ⚠️ Mọi thông tin trên phiếu lương chứa thông tin cá nhân và thu nhập, vui lòng người nhận giữ bí mật và không chia sẻ cho bên thứ ba.
                            </p>

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
                sendSmtpEmail.attachment = [{
                    content: base64Attachment,
                    name: fileName
                }];

                // Send email via Brevo
                const startTime = Date.now();
                await apiInstance.sendTransacEmail(sendSmtpEmail);
                const sendDuration = Date.now() - startTime;

                console.log(`✅ Email sent successfully to ${employee.email} via Brevo (took ${sendDuration}ms)`);

                // Log to database
                await logSentEmail(employee.id, employee.email, 'sent');

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
                    email: employee.email
                });

                // Rate limiting: wait 100ms before next email (Brevo allows 100+ emails/second)
                if (empIndex < employeeCount) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }

            } catch (emailError) {
                console.error(`❌ Failed to send email to ${employee.email}:`, emailError.message);

                // Log to database
                await logSentEmail(employee.id, employee.email, 'failed', emailError.message);

                results.failed.push({
                    employeeName: `${employee.first_name} ${employee.last_name}`,
                    employeeCode,
                    email: employee.email,
                    error: emailError.message
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

        console.log(`\n🎉 [BATCH SEND - BREVO] Processing complete!`);
        console.log(`✅ Success: ${results.success.length}`);
        console.log(`⚠️ No Gmail: ${results.noGmail.length}`);
        console.log(`❌ Not Found: ${results.notFound.length}`);
        console.log(`❌ Failed: ${results.failed.length}`);

        // Send final complete message
        sendProgress({
            type: 'complete',
            total: employeeCount,
            summary: {
                success: results.success.length,
                noGmail: results.noGmail.length,
                notFound: results.notFound.length,
                failed: results.failed.length,
                limitReached: results.limitReached.length
            },
            results: results
        });

        // Close SSE connection
        res.end();

    } catch (error) {
        console.error('❌ [BATCH SEND - BREVO] Error:', error);

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
