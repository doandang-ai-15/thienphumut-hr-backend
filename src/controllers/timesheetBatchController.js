const XLSX = require('xlsx');
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs').promises;
const brevo = require('@getbrevo/brevo');
const { pool } = require('../config/database');
const cloudinary = require('cloudinary').v2;

// Initialize Brevo API
let apiInstance = new brevo.TransactionalEmailsApi();
let apiKey = apiInstance.authentications['apiKey'];
apiKey.apiKey = process.env.BREVO_API_KEY;

const DAILY_EMAIL_LIMIT = 300;

/**
 * Convert Excel time decimal to time string (e.g., 0.3125 → "7:30", 0.6875 → "16:30")
 */
function excelTimeToString(decimal) {
    if (decimal === null || decimal === undefined || decimal === '' || typeof decimal !== 'number') return '';
    if (decimal <= 0 || decimal >= 1) return '';
    const totalMinutes = Math.round(decimal * 24 * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Get today's email count from database
 */
async function getTodayEmailCount() {
    try {
        const today = new Date().toISOString().split('T')[0];
        const result = await pool.query(
            `SELECT COUNT(*) as count FROM email_logs WHERE DATE(sent_at) = $1 AND status = 'sent'`,
            [today]
        );
        return parseInt(result.rows[0]?.count || 0);
    } catch (error) {
        console.error('Error getting email count:', error);
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
        console.error('Error logging email:', error);
    }
}

/**
 * Batch send timesheet to all employees via Brevo
 * @route POST /api/timesheet/batch-send
 */
exports.batchSendTimesheet = async (req, res) => {
    try {
        console.log('[TIMESHEET] Starting batch timesheet sending...');

        // Setup SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const sendProgress = (data) => {
            res.write(`data: ${JSON.stringify(data)}\n\n`);
        };

        // Validate file
        if (!req.file) {
            sendProgress({ type: 'error', message: 'Chưa tải lên file bảng chấm công tổng hợp' });
            res.end();
            return;
        }

        const timesheetNumber = parseInt(req.body.timesheet_number) || 1;
        const saveMonth = (req.body.save_month || '').trim();

        if (!saveMonth) {
            sendProgress({ type: 'error', message: 'Vui lòng nhập tháng/năm' });
            res.end();
            return;
        }

        // Validate save_month format: MM / YYYY
        const monthMatch = saveMonth.match(/^(\d{1,2})\s*\/\s*(\d{4})$/);
        if (!monthMatch) {
            sendProgress({ type: 'error', message: 'Định dạng tháng/năm không hợp lệ. Vui lòng nhập theo định dạng THÁNG / NĂM (ví dụ: 01 / 2026)' });
            res.end();
            return;
        }

        const month = parseInt(monthMatch[1]);
        const year = parseInt(monthMatch[2]);

        // Check daily limit
        const todayCount = await getTodayEmailCount();
        if (todayCount >= DAILY_EMAIL_LIMIT) {
            sendProgress({ type: 'error', message: `Đã đạt giới hạn ${DAILY_EMAIL_LIMIT} emails/ngày. Hôm nay đã gửi ${todayCount} emails.` });
            res.end();
            return;
        }

        const remainingQuota = DAILY_EMAIL_LIMIT - todayCount;
        const uploadedPath = req.file.path;
        const templatePath = path.join(__dirname, '../../temp-peyroll-form/timesheet-1.xlsx');

        // Read file B (overall timesheet) - always read sheet "CCT9"
        const workbook = XLSX.readFile(uploadedPath);
        console.log(`[TIMESHEET] Sheet names in workbook: ${JSON.stringify(workbook.SheetNames)}`);

        const TARGET_SHEET = 'CCT9';
        const sheet = workbook.Sheets[TARGET_SHEET];
        if (!sheet) {
            sendProgress({ type: 'error', message: `Không tìm thấy sheet "${TARGET_SHEET}" trong file. Các sheet có: ${workbook.SheetNames.join(', ')}` });
            res.end();
            return;
        }

        const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
        console.log(`[TIMESHEET] Read ${data.length} rows from sheet "${TARGET_SHEET}"`);

        // DEBUG: Log first 10 rows
        console.log('[TIMESHEET] ===== DEBUG: First 10 rows =====');
        for (let r = 0; r < Math.min(10, data.length); r++) {
            const row = data[r];
            if (row) {
                const cols = [];
                for (let c = 0; c < Math.min(20, row.length); c++) {
                    if (row[c] !== null && row[c] !== undefined) {
                        cols.push(`[${c}]=${JSON.stringify(row[c])}`);
                    }
                }
                console.log(`  Row ${r} (excel row ${r + 1}): ${cols.join(', ')}`);
            } else {
                console.log(`  Row ${r} (excel row ${r + 1}): <empty>`);
            }
        }

        // DEBUG: Log row 7 (index 6) - day number row
        console.log('[TIMESHEET] ===== DEBUG: Row 7 (index 6) - Day number row =====');
        const row6 = data[6];
        if (row6) {
            const nonNullCols = [];
            for (let c = 0; c < row6.length; c++) {
                if (row6[c] !== null && row6[c] !== undefined) {
                    nonNullCols.push(`[col ${c}]="${row6[c]}" (type: ${typeof row6[c]})`);
                }
            }
            console.log(`  Non-null values: ${nonNullCols.join(', ')}`);
        } else {
            console.log('  Row 6 is undefined/null!');
        }

        // Determine max_month: scan row 7 (index 6) from col F (index 5), every 2 cols
        // Use MAX value (not last value) because after the main days, there may be extra columns (1,2,3...) before "Tiền cơm"
        let maxMonth = 0;
        for (let col = 5; col < 200; col += 2) {
            const cellValue = data[6]?.[col];
            if (cellValue === null || cellValue === undefined) continue;
            const strVal = String(cellValue).trim();
            if (strVal.includes('Tiền cơm')) break;
            const numVal = parseInt(strVal);
            if (!isNaN(numVal) && numVal > 0 && numVal <= 31) {
                if (numVal > maxMonth) {
                    maxMonth = numVal;
                }
            }
        }

        console.log(`[TIMESHEET] maxMonth after scan = ${maxMonth}`);

        if (maxMonth === 0) {
            // Extra debug: dump all of row 7
            console.log('[TIMESHEET] ===== DEBUG: maxMonth=0, full row 7 dump =====');
            if (row6) {
                for (let c = 0; c < row6.length; c++) {
                    const val = row6[c];
                    if (val !== null && val !== undefined) {
                        console.log(`  row6[${c}] = ${JSON.stringify(val)} (type: ${typeof val})`);
                    }
                }
            }
            sendProgress({ type: 'error', message: 'Không thể xác định số ngày trong tháng từ file. Kiểm tra lại cấu trúc file.' });
            res.end();
            return;
        }

        console.log(`[TIMESHEET] Max days in month: ${maxMonth}`);

        // Find summary column positions by scanning row 7 headers
        let lateCol = -1, earlyCol = -1, approvedLeaveCol = -1, unapprovedLeaveCol = -1;
        if (row6) {
            for (let c = 0; c < row6.length; c++) {
                const val = row6[c];
                if (val === null || val === undefined) continue;
                const str = String(val).trim();
                if (str === 'ĐI TRỄ') lateCol = c;
                else if (str === 'VỀ SỚM') earlyCol = c;
                else if (str === 'NGHỈ CP') approvedLeaveCol = c;
                else if (str === 'NGHỈ KP') unapprovedLeaveCol = c;
            }
        }
        console.log(`[TIMESHEET] Summary columns: late=${lateCol}, early=${earlyCol}, approvedLeave=${approvedLeaveCol}, unapprovedLeave=${unapprovedLeaveCol}`);

        // Count employees: start at row 10 (index 9), 2 rows per employee
        let employeeCount = 0;
        for (let n = 0; ; n++) {
            const startRow = 9 + 2 * n;
            const endRow = startRow + 1;
            if (endRow >= data.length) break;
            const code = data[endRow]?.[1];
            const name = data[endRow]?.[2];
            if (!code && !name) break;
            employeeCount++;
        }

        if (employeeCount === 0) {
            sendProgress({ type: 'error', message: 'Không tìm thấy dữ liệu nhân viên trong file' });
            res.end();
            return;
        }

        console.log(`[TIMESHEET] Found ${employeeCount} employees, timesheet_number=${timesheetNumber}, month=${saveMonth}`);

        // Send initial progress
        sendProgress({
            type: 'start',
            total: employeeCount,
            dailyLimit: DAILY_EMAIL_LIMIT,
            todayCount,
            remainingQuota
        });

        const results = { success: [], noGmail: [], notFound: [], failed: [], limitReached: [] };
        let emailsSentThisSession = 0;

        for (let n = 0; n < employeeCount; n++) {
            const startRow = 9 + 2 * n;
            const endRow = startRow + 1;
            const empNum = n + 1;

            const employeeCode = String(data[endRow]?.[1] || '').trim();
            const employeeName = String(data[endRow]?.[2] || '').trim();
            const department = String(data[endRow]?.[3] || '').trim();
            const workingDays = data[startRow]?.[4] || 0;
            const overtimeHours = data[endRow]?.[4] || 0;
            const lateCount = lateCol >= 0 ? (data[endRow]?.[lateCol] || 0) : 0;
            const earlyCount = earlyCol >= 0 ? (data[endRow]?.[earlyCol] || 0) : 0;
            const approvedLeave = approvedLeaveCol >= 0 ? (data[endRow]?.[approvedLeaveCol] || 0) : 0;
            const unapprovedLeave = unapprovedLeaveCol >= 0 ? (data[endRow]?.[unapprovedLeaveCol] || 0) : 0;

            console.log(`[TIMESHEET] Processing ${empNum}/${employeeCount}: ${employeeName} (${employeeCode})`);

            // Lookup employee in DB by employee_id
            const empResult = await pool.query(
                'SELECT id, first_name, last_name, email, have_gmail FROM employees WHERE employee_id = $1',
                [employeeCode]
            );

            if (empResult.rows.length === 0) {
                results.notFound.push({ employeeName, employeeCode, reason: 'Không tìm thấy trong hệ thống' });
                sendProgress({ type: 'progress', current: empNum, total: employeeCount, status: 'notFound', employeeName, employeeCode });
                continue;
            }

            const employee = empResult.rows[0];

            // Check Gmail status
            if (!employee.have_gmail || !employee.email) {
                results.noGmail.push({
                    employeeName: `${employee.first_name} ${employee.last_name}`,
                    employeeCode,
                    email: employee.email || 'N/A',
                    reason: 'Chưa cập nhật Gmail'
                });
                sendProgress({ type: 'progress', current: empNum, total: employeeCount, status: 'noGmail', employeeName: `${employee.first_name} ${employee.last_name}`, employeeCode });
                continue;
            }

            // Check daily limit
            if (todayCount + emailsSentThisSession >= DAILY_EMAIL_LIMIT) {
                results.limitReached.push({
                    employeeName: `${employee.first_name} ${employee.last_name}`,
                    employeeCode,
                    email: employee.email,
                    reason: `Đã đạt giới hạn ${DAILY_EMAIL_LIMIT} emails/ngày`
                });
                sendProgress({ type: 'progress', current: empNum, total: employeeCount, status: 'limitReached', employeeName: `${employee.first_name} ${employee.last_name}`, employeeCode, email: employee.email });
                continue;
            }

            try {
                // Load template and fill data
                const wb = new ExcelJS.Workbook();
                await wb.xlsx.readFile(templatePath);
                const ws = wb.getWorksheet(1);

                // Map summary cells
                ws.getCell('A3').value = `THÁNG ${saveMonth}`;
                const cellC5 = ws.getCell('C5');
                cellC5.value = employeeName;
                cellC5.alignment = { ...(cellC5.alignment || {}), shrinkToFit: true, vertical: 'middle' };
                ws.getCell('H5').value = employeeCode;
                ws.getCell('L5').value = department;
                ws.getCell('C6').value = `${workingDays}/ ngày`;
                ws.getCell('C7').value = `${overtimeHours}/ tiếng`;
                ws.getCell('H6').value = lateCount;
                ws.getCell('H7').value = earlyCount;
                ws.getCell('L6').value = unapprovedLeave;
                ws.getCell('L7').value = approvedLeave;

                // Column mapping based on timesheet_number: 1→C,D / 2→E,F / 3→G,H
                const inColLetter = timesheetNumber === 1 ? 'C' : timesheetNumber === 2 ? 'E' : 'G';
                const outColLetter = timesheetNumber === 1 ? 'D' : timesheetNumber === 2 ? 'F' : 'H';

                // Fill daily rows from row 11
                for (let d = 1; d <= maxMonth; d++) {
                    const templateRow = 10 + d; // Row 11 for day 1, 12 for day 2, etc.

                    // Column A: date (M/D/YYYY format)
                    ws.getCell(`A${templateRow}`).value = `${month}/${d}/${year}`;

                    // Column B: weekday from row 8 (index 7) of file B
                    const dayCol = 5 + 2 * (d - 1);
                    const weekday = data[7]?.[dayCol] || '';
                    ws.getCell(`B${templateRow}`).value = weekday;

                    // Clock-in/out from file B (Start row)
                    const clockIn = data[startRow]?.[dayCol];
                    const clockOut = data[startRow]?.[dayCol + 1];

                    // Working hours and overtime from file B (End row)
                    const workHours = data[endRow]?.[dayCol];
                    const overtime = data[endRow]?.[dayCol + 1];

                    // Write clock-in/out to correct columns based on timesheet_number
                    // Convert Excel time decimals to formatted time strings to avoid format issues
                    const clockInStr = excelTimeToString(clockIn);
                    const clockOutStr = excelTimeToString(clockOut);
                    if (clockInStr) {
                        ws.getCell(`${inColLetter}${templateRow}`).value = clockInStr;
                    }
                    if (clockOutStr) {
                        ws.getCell(`${outColLetter}${templateRow}`).value = clockOutStr;
                    }

                    // Calculate late minutes (Column I): check-in > 7:30 AM (0.3125)
                    let lateMinutes = 0;
                    if (typeof clockIn === 'number' && clockIn > 0.3125) {
                        lateMinutes = Math.round((clockIn - 0.3125) * 24 * 60);
                    }

                    // Calculate early minutes (Column J): check-out < 16:30 PM (0.6875)
                    let earlyMinutes = 0;
                    if (typeof clockOut === 'number' && clockOut > 0 && clockOut < 0.6875) {
                        earlyMinutes = Math.round((0.6875 - clockOut) * 24 * 60);
                    }

                    ws.getCell(`I${templateRow}`).value = lateMinutes || '';
                    ws.getCell(`J${templateRow}`).value = earlyMinutes || '';

                    // Column K: working hours (skip if 0)
                    if (workHours !== null && workHours !== undefined && workHours !== '' && workHours !== 0) {
                        ws.getCell(`K${templateRow}`).value = workHours;
                    }

                    // Column L: overtime (skip if 0)
                    if (overtime !== null && overtime !== undefined && overtime !== '' && overtime !== 0) {
                        ws.getCell(`L${templateRow}`).value = overtime;
                    }

                    // Column M: notes - V (đúng giờ) / X (đi trễ hoặc về sớm) / trống (CN)
                    const isSunday = String(weekday).trim() === 'CN';
                    if (!isSunday && (clockInStr || clockOutStr)) {
                        ws.getCell(`M${templateRow}`).value = (lateMinutes > 0 || earlyMinutes > 0) ? 'X' : 'V';
                    }

                    // Row fill: cyan (#00FFFF) for Sunday, white for other days
                    // Must use cell.style spread to avoid ExcelJS shared style reference issue
                    const rowCols = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M'];
                    const rowFill = isSunday
                        ? { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00FFFF' } }
                        : { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
                    for (const col of rowCols) {
                        const cell = ws.getCell(`${col}${templateRow}`);
                        cell.style = { ...cell.style, fill: rowFill };
                    }
                }

                // Generate buffer
                const buffer = await wb.xlsx.writeBuffer();
                const base64Attachment = buffer.toString('base64');

                // Prepare email
                const fullName = `${employee.first_name} ${employee.last_name}`;
                const subject = `Bảng chấm công tháng ${saveMonth} - ${fullName}`;
                const fileName = `timesheet_${employeeCode}_${employeeName.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`;

                const sendSmtpEmail = new brevo.SendSmtpEmail();
                sendSmtpEmail.subject = subject;
                sendSmtpEmail.to = [{ email: employee.email, name: fullName }];
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
                            <h2 style="color: #F875AA; margin-top: 0;">Bảng chấm công tháng ${saveMonth}</h2>
                            <p style="color: #333; line-height: 1.6;">Xin chào <strong>${fullName}</strong>,</p>
                            <p style="color: #333; line-height: 1.6;">Vui lòng xem bảng chấm công của bạn trong file đính kèm.</p>
                            <p style="color: #333; line-height: 1.6;">Nếu có bất kỳ thắc mắc nào, vui lòng liên hệ với bộ phận nhân sự.</p>
                            <p style="color: #d32f2f; line-height: 1.6; font-weight: 600; background-color: #ffebee; padding: 10px; border-radius: 5px;">
                                ⚠️ Mọi thông tin trên bảng chấm công chứa thông tin cá nhân, vui lòng người nhận giữ bí mật và không chia sẻ cho bên thứ ba.
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
                sendSmtpEmail.attachment = [{ content: base64Attachment, name: fileName }];

                // Send via Brevo
                const startTime = Date.now();
                await apiInstance.sendTransacEmail(sendSmtpEmail);
                console.log(`[TIMESHEET] Email sent to ${employee.email} (${Date.now() - startTime}ms)`);

                await logSentEmail(employee.id, employee.email, 'sent');
                emailsSentThisSession++;

                results.success.push({
                    employeeName: fullName,
                    employeeCode,
                    email: employee.email,
                    status: 'Đã gửi thành công'
                });

                sendProgress({
                    type: 'progress',
                    current: empNum,
                    total: employeeCount,
                    status: 'success',
                    employeeName: fullName,
                    employeeCode,
                    email: employee.email
                });

                // Rate limiting
                if (empNum < employeeCount) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }

            } catch (emailError) {
                console.error(`[TIMESHEET] Failed to send to ${employee.email}:`, emailError.message);
                await logSentEmail(employee.id, employee.email, 'failed', emailError.message);

                results.failed.push({
                    employeeName: `${employee.first_name} ${employee.last_name}`,
                    employeeCode,
                    email: employee.email,
                    error: emailError.message
                });

                sendProgress({
                    type: 'progress',
                    current: empNum,
                    total: employeeCount,
                    status: 'failed',
                    employeeName: `${employee.first_name} ${employee.last_name}`,
                    employeeCode,
                    email: employee.email,
                    error: emailError.message
                });
            }
        }

        // Save import history (upload file to Cloudinary + save session/details to DB)
        const importedBy = req.user
            ? { id: req.user.id, name: `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim() }
            : null;
        await saveImportSession({
            filePath: uploadedPath,
            fileName: req.file.originalname,
            monthPeriod: saveMonth,
            timesheetNumber,
            results,
            employeeCount,
            importedBy
        });

        // Clean up uploaded file
        try { await fs.unlink(uploadedPath); } catch (e) { /* ignore */ }

        console.log(`[TIMESHEET] Complete! Success: ${results.success.length}, NoGmail: ${results.noGmail.length}, NotFound: ${results.notFound.length}, Failed: ${results.failed.length}, LimitReached: ${results.limitReached.length}`);

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
            results
        });

        res.end();

    } catch (error) {
        console.error('[TIMESHEET] Error:', error);
        try {
            res.write(`data: ${JSON.stringify({ type: 'error', message: 'Lỗi xử lý bảng chấm công', error: error.message })}\n\n`);
        } catch (e) { /* ignore */ }
        res.end();
    }
};

/**
 * Upload file to Cloudinary and save import session + details to DB
 */
async function saveImportSession({ filePath, fileName, monthPeriod, timesheetNumber, results, employeeCount, importedBy }) {
    let cloudinaryResult = null;

    // Step 1: Upload to Cloudinary
    try {
        await fs.access(filePath);
        cloudinaryResult = await cloudinary.uploader.upload(filePath, {
            folder: 'thienphumut-hr/timesheet-imports',
            resource_type: 'raw',
            public_id: `timesheet_${Date.now()}_${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`,
            use_filename: false
        });
        console.log(`[TIMESHEET] Cloudinary upload OK: ${cloudinaryResult.secure_url}`);
    } catch (err) {
        console.error(`[TIMESHEET] Cloudinary upload failed: ${err.message}`);
    }

    // Step 2: Save session record
    try {
        const sessionResult = await pool.query(
            `INSERT INTO timesheet_import_sessions
                (file_name, file_url, cloudinary_public_id, month_period, timesheet_number,
                 total_employees, total_success, total_no_gmail, total_not_found,
                 total_failed, total_limit_reached, imported_by_id, imported_by_name)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
             RETURNING id`,
            [
                fileName,
                cloudinaryResult?.secure_url || null,
                cloudinaryResult?.public_id || null,
                monthPeriod,
                timesheetNumber,
                employeeCount,
                results.success.length,
                results.noGmail.length,
                results.notFound.length,
                results.failed.length,
                results.limitReached.length,
                importedBy?.id || null,
                importedBy?.name || null
            ]
        );

        const sessionId = sessionResult.rows[0].id;
        console.log(`[TIMESHEET] Session saved: id=${sessionId}`);

        // Step 3: Save per-employee details
        const details = [
            ...results.success.map(e => ({ ...e, status: 'sent', error_message: null })),
            ...results.noGmail.map(e => ({ ...e, status: 'no_gmail', error_message: e.reason || null })),
            ...results.notFound.map(e => ({ ...e, status: 'not_found', error_message: e.reason || null })),
            ...results.failed.map(e => ({ ...e, status: 'failed', error_message: e.error || null })),
            ...results.limitReached.map(e => ({ ...e, status: 'limit_reached', error_message: e.reason || null }))
        ];

        for (const detail of details) {
            await pool.query(
                `INSERT INTO timesheet_import_details (session_id, employee_code, employee_name, email, status, error_message)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [sessionId, detail.employeeCode || null, detail.employeeName || null,
                 detail.email || null, detail.status, detail.error_message]
            );
        }

        console.log(`[TIMESHEET] ${details.length} detail records saved`);
        return sessionId;
    } catch (dbErr) {
        console.error(`[TIMESHEET] DB save failed: ${dbErr.message}`);
    }
}

/**
 * GET /api/timesheet/import-history
 */
exports.getImportHistory = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, imported_at, file_name, file_url, month_period, timesheet_number,
                    total_employees, total_success, total_no_gmail,
                    total_not_found, total_failed, total_limit_reached,
                    imported_by_id, imported_by_name
             FROM timesheet_import_sessions
             ORDER BY imported_at DESC
             LIMIT 100`
        );
        res.json({ success: true, sessions: result.rows });
    } catch (error) {
        console.error('[TIMESHEET] getImportHistory error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch import history', error: error.message });
    }
};

/**
 * GET /api/timesheet/import-history/:sessionId
 */
exports.getImportSessionDetails = async (req, res) => {
    try {
        const { sessionId } = req.params;

        const sessionResult = await pool.query(
            `SELECT id, imported_at, file_name, file_url, month_period, timesheet_number,
                    total_employees, total_success, total_no_gmail,
                    total_not_found, total_failed, total_limit_reached,
                    imported_by_id, imported_by_name
             FROM timesheet_import_sessions WHERE id = $1`,
            [sessionId]
        );

        if (sessionResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Session not found' });
        }

        const detailsResult = await pool.query(
            `SELECT id, employee_code, employee_name, email, status, error_message, processed_at
             FROM timesheet_import_details
             WHERE session_id = $1
             ORDER BY id ASC`,
            [sessionId]
        );

        res.json({
            success: true,
            session: sessionResult.rows[0],
            details: detailsResult.rows
        });
    } catch (error) {
        console.error('[TIMESHEET] getImportSessionDetails error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch session details', error: error.message });
    }
};
