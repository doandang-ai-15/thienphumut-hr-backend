const XLSX = require('xlsx');
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs').promises;
const nodemailer = require('nodemailer');
const { pool } = require('../config/database');

/**
 * Generate batch payroll files from Overall-payroll.xlsx
 * Maps data from Overall-payroll to individual payroll-1.xlsx templates
 */
exports.generateBatchPayroll = async (req, res) => {
    try {
        console.log('📊 [BATCH PAYROLL] Starting batch generation...');

        // Check if file was uploaded
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No Overall-payroll file uploaded'
            });
        }

        const overallPayrollPath = req.file.path;
        const templatePath = path.join(__dirname, '../../temp-peyroll-form/payroll-1.xlsx');

        console.log('📂 Overall-payroll file:', overallPayrollPath);
        console.log('📂 Template file:', templatePath);

        // Read Overall-payroll file (File B)
        const overallWorkbook = XLSX.readFile(overallPayrollPath);
        const overallSheet = overallWorkbook.Sheets[overallWorkbook.SheetNames[0]];
        const overallData = XLSX.utils.sheet_to_json(overallSheet, { header: 1, defval: null, raw: false });

        // Calculate number of employees (max length - 3)
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
            return res.status(400).json({
                success: false,
                message: 'No employee data found in Overall-payroll file'
            });
        }

        // Generate payroll files for each employee
        const generatedFiles = [];

        for (let empIndex = 1; empIndex <= employeeCount; empIndex++) {
            const rowIndex = empIndex + 2; // empIndex 1 → array index 3 (row 4)
            const employeeName = overallData[rowIndex][0]; // Column A
            const employeeCode = overallData[rowIndex][1]; // Column B

            console.log(`\n📝 Processing Employee ${empIndex}: ${employeeName} (${employeeCode})`);

            // Create a copy of template using ExcelJS (to preserve formatting)
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.readFile(templatePath);
            const worksheet = workbook.getWorksheet(1);

            // Apply mapping
            const mappings = [
                { target: 'M1', source: { col: 1, row: 1 } },           // B1 - Month/Period
                { target: 'C5', source: { col: 0, row: rowIndex } },    // A[index+2] - Name
                { target: 'H5', source: { col: 1, row: rowIndex } },    // B[index+2] - Employee Code
                { target: 'C6', source: { col: 2, row: rowIndex } },    // C[index+2] - Department
                { target: 'C7', source: { col: 3, row: rowIndex } },    // D[index+2] - Start Date
                { target: 'H7', source: { col: 4, row: rowIndex } },    // E[index+2] - Base Salary
                { target: 'C8', source: { col: 5, row: rowIndex } },    // F[index+2] - Account Number
                { target: 'H8', source: { col: 6, row: rowIndex } },    // G[index+2] - Total Contract Salary
                { target: 'D10', source: { col: 7, row: rowIndex } },   // H[index+2] - Work Days
                { target: 'E10', source: { col: 8, row: rowIndex } },   // I[index+2] - Work Days Amount
                { target: 'D13', source: { col: 9, row: rowIndex } },   // J[index+2] - OT 150%
                { target: 'E13', source: { col: 10, row: rowIndex } },  // K[index+2] - OT Amount
                { target: 'H13', source: { col: 11, row: rowIndex } },  // L[index+2] - Gas Allowance
                { target: 'H14', source: { col: 12, row: rowIndex } },  // M[index+2] - Housing Allowance
                { target: 'H15', source: { col: 13, row: rowIndex } },  // N[index+2] - Phone Allowance
                { target: 'E23', source: { col: 14, row: rowIndex } },  // O[index+2] - Total Salary
                { target: 'E25', source: { col: 15, row: rowIndex } },  // P[index+2] - Union Deduction
                { target: 'H26', source: { col: 16, row: rowIndex } },  // Q[index+2] - Insurance
                { target: 'E28', source: { col: 17, row: rowIndex } },  // R[index+2] - Total Deductions
                { target: 'E29', source: { col: 18, row: rowIndex } }   // S[index+2] - Net Salary
            ];

            // Apply each mapping
            mappings.forEach(mapping => {
                const sourceValue = overallData[mapping.source.row]?.[mapping.source.col];

                if (sourceValue !== null && sourceValue !== undefined && sourceValue !== '') {
                    const cell = worksheet.getCell(mapping.target);

                    // Parse value - handle both number and formatted string
                    let finalValue = sourceValue;

                    // If value is string like "VND 7,000,000", extract the number
                    if (typeof sourceValue === 'string' && sourceValue.includes('VND')) {
                        const numStr = sourceValue.replace(/[^\d.-]/g, '');
                        finalValue = parseFloat(numStr) || sourceValue;
                    }

                    cell.value = finalValue;

                    console.log(`  ✓ ${mapping.target} ← ${sourceValue}`);
                }
            });

            // Save to temp file
            const outputFileName = `payroll_${employeeCode}_${employeeName.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`;
            const outputPath = path.join(__dirname, '../../uploads', outputFileName);

            await workbook.xlsx.writeFile(outputPath);

            generatedFiles.push({
                employeeName,
                employeeCode,
                fileName: outputFileName,
                downloadUrl: `/payroll/download/${outputFileName}`
            });

            console.log(`✅ Generated: ${outputFileName}`);
        }

        // Clean up uploaded file
        await fs.unlink(overallPayrollPath);

        console.log(`\n🎉 [BATCH PAYROLL] Successfully generated ${generatedFiles.length} payroll files`);

        res.json({
            success: true,
            message: `Successfully generated ${generatedFiles.length} payroll files`,
            data: generatedFiles
        });

    } catch (error) {
        console.error('❌ [BATCH PAYROLL] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate batch payroll',
            error: error.message
        });
    }
};

/**
 * Generate batch payroll files AND send emails automatically
 * Combines file generation + email sending with rate limiting
 */
exports.generateAndSendBatchPayroll = async (req, res) => {
    try {
        console.log('📊 [BATCH SEND] Starting batch generation and email sending...');

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

        const overallPayrollPath = req.file.path;
        const templatePath = path.join(__dirname, '../../temp-peyroll-form/payroll-1.xlsx');

        // Read Overall-payroll file
        const overallWorkbook = XLSX.readFile(overallPayrollPath);
        const overallSheet = overallWorkbook.Sheets[overallWorkbook.SheetNames[0]];
        const overallData = XLSX.utils.sheet_to_json(overallSheet, { header: 1, defval: null, raw: false });

        // Extract month/period from B1 for email subject (row 1 = index 0, column B = index 1)
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
            total: employeeCount
        });

        // Setup mail transporter
        const mailConfig = {
            host: process.env.MAIL_HOST,
            port: parseInt(process.env.MAIL_PORT),
            secure: process.env.MAIL_PORT === '465',
            auth: {
                user: process.env.MAIL_USER,
                pass: process.env.MAIL_PASSWORD
            },
            tls: {
                rejectUnauthorized: false
            },
            connectionTimeout: 90000,  // Increased to 90 seconds
            greetingTimeout: 60000,    // Increased to 60 seconds
            socketTimeout: 90000,      // Increased to 90 seconds
            logger: true,              // Enable logging
            debug: true                // Enable debug output
        };

        console.log('📧 [BATCH SEND] Mail config:', {
            host: mailConfig.host,
            port: mailConfig.port,
            secure: mailConfig.secure,
            user: mailConfig.auth.user
        });

        const transporter = nodemailer.createTransport(mailConfig);

        // Results tracking
        const results = {
            success: [],
            noGmail: [],
            notFound: [],
            failed: []
        };

        // Generate files and send emails with rate limiting (50 emails/minute = 1.2s delay)
        const RATE_LIMIT_DELAY = 1200; // 1.2 seconds

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

                // Send progress update
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

                // Send progress update
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

            try {
                // Generate payroll file
                const workbook = new ExcelJS.Workbook();
                await workbook.xlsx.readFile(templatePath);
                const worksheet = workbook.getWorksheet(1);

                // Apply mapping (same as generateBatchPayroll)
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

                // Save file to buffer instead of disk
                const buffer = await workbook.xlsx.writeBuffer();

                // Prepare email
                const subject = `Bảng lương tháng ${monthPeriod} - ${employee.first_name} ${employee.last_name}`;
                const fileName = `payroll_${employeeCode}_${employeeName.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`;

                const mailOptions = {
                    from: {
                        name: process.env.MAIL_FROM_NAME || 'Thiên Phú Mút HR',
                        address: process.env.MAIL_FROM_ADDRESS || process.env.MAIL_USER
                    },
                    to: employee.email,
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
                        filename: fileName,
                        content: buffer,
                        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                    }]
                };

                // Send email
                const startTime = Date.now();
                await transporter.sendMail(mailOptions);
                const sendDuration = Date.now() - startTime;

                console.log(`✅ Email sent successfully to ${employee.email} (took ${sendDuration}ms)`);
                results.success.push({
                    employeeName: `${employee.first_name} ${employee.last_name}`,
                    employeeCode,
                    email: employee.email,
                    status: 'Đã gửi thành công'
                });

                // Send progress update
                sendProgress({
                    type: 'progress',
                    current: empIndex,
                    total: employeeCount,
                    status: 'success',
                    employeeName: `${employee.first_name} ${employee.last_name}`,
                    employeeCode,
                    email: employee.email
                });

                // Rate limiting: wait 1.2 seconds before next email (50 emails/minute)
                if (empIndex < employeeCount) {
                    console.log(`⏱️ Waiting ${RATE_LIMIT_DELAY}ms before next email...`);
                    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
                    console.log(`✅ Delay complete, proceeding to next employee`);
                }

            } catch (emailError) {
                console.error(`❌ Failed to send email to ${employee.email}:`, emailError.message);
                results.failed.push({
                    employeeName: `${employee.first_name} ${employee.last_name}`,
                    employeeCode,
                    email: employee.email,
                    error: emailError.message
                });

                // Send progress update
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

        // Send final complete message
        sendProgress({
            type: 'complete',
            total: employeeCount,
            summary: {
                success: results.success.length,
                noGmail: results.noGmail.length,
                notFound: results.notFound.length,
                failed: results.failed.length
            },
            results: results
        });

        // Close SSE connection
        res.end();

    } catch (error) {
        console.error('❌ [BATCH SEND] Error:', error);

        // Send error via SSE if connection is still open
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

/**
 * Download generated payroll file
 */
exports.downloadPayrollFile = async (req, res) => {
    try {
        const fileName = req.params.fileName;
        const filePath = path.join(__dirname, '../../uploads', fileName);

        // Check if file exists
        try {
            await fs.access(filePath);
        } catch (err) {
            return res.status(404).json({
                success: false,
                message: 'File not found'
            });
        }

        console.log(`📥 Downloading: ${fileName}`);
        res.download(filePath, fileName);

    } catch (error) {
        console.error('❌ [DOWNLOAD] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to download file',
            error: error.message
        });
    }
};
