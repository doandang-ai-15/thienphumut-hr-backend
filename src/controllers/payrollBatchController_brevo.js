const XLSX = require('xlsx');
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs').promises;
const brevo = require('@getbrevo/brevo');
const { pool } = require('../config/database');
const cloudinary = require('cloudinary').v2;

// Configure Cloudinary (uses same env vars as photoController)
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

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
 * Upload a file to Cloudinary as a raw resource and save import session + details to DB
 */
async function saveImportSession({ filePath, fileName, monthPeriod, results, employeeCount, importedBy }) {
    console.log('🔍 [IMPORT HISTORY] ========== saveImportSession START ==========');
    console.log(`🔍 [IMPORT HISTORY] filePath   : ${filePath}`);
    console.log(`🔍 [IMPORT HISTORY] fileName   : ${fileName}`);
    console.log(`🔍 [IMPORT HISTORY] monthPeriod: ${monthPeriod}`);
    console.log(`🔍 [IMPORT HISTORY] importedBy : ${JSON.stringify(importedBy)}`);

    // Check Cloudinary config loaded from env
    const cfgCheck = cloudinary.config();
    console.log(`🔍 [IMPORT HISTORY] Cloudinary config → cloud_name: "${cfgCheck.cloud_name}", api_key: "${cfgCheck.api_key ? cfgCheck.api_key.toString().slice(0, 6) + '...' : 'MISSING'}"`);

    // Check file exists on disk before uploading
    let fileExists = false;
    try {
        await fs.access(filePath);
        const stat = await fs.stat(filePath);
        fileExists = true;
        console.log(`🔍 [IMPORT HISTORY] File on disk: EXISTS (${stat.size} bytes)`);
    } catch (accessErr) {
        console.error(`❌ [IMPORT HISTORY] File on disk: NOT FOUND → ${accessErr.message}`);
    }

    let cloudinaryResult = null;

    // Step 1: Upload to Cloudinary (raw resource for non-image files)
    if (fileExists) {
        console.log('🔍 [IMPORT HISTORY] Step 1: Uploading to Cloudinary...');
        try {
            const uploadOptions = {
                folder: 'thienphumut-hr/payroll-imports',
                resource_type: 'raw',
                public_id: `payroll_${Date.now()}_${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`,
                use_filename: false
            };
            console.log(`🔍 [IMPORT HISTORY] Upload options: ${JSON.stringify(uploadOptions)}`);

            cloudinaryResult = await cloudinary.uploader.upload(filePath, uploadOptions);

            console.log(`✅ [IMPORT HISTORY] Step 1 OK → secure_url: ${cloudinaryResult.secure_url}`);
            console.log(`✅ [IMPORT HISTORY]             public_id : ${cloudinaryResult.public_id}`);
            console.log(`✅ [IMPORT HISTORY]             resource_type: ${cloudinaryResult.resource_type}`);
            console.log(`✅ [IMPORT HISTORY]             bytes: ${cloudinaryResult.bytes}`);
        } catch (uploadErr) {
            console.error(`❌ [IMPORT HISTORY] Step 1 FAILED → ${uploadErr.message}`);
            console.error(`❌ [IMPORT HISTORY] Full error:`, uploadErr);
        }
    } else {
        console.warn('⚠️ [IMPORT HISTORY] Step 1 SKIPPED: file not on disk');
    }

    // Step 2: Save session record to DB
    console.log('🔍 [IMPORT HISTORY] Step 2: Saving session to DB...');
    console.log(`🔍 [IMPORT HISTORY] file_url to save: ${cloudinaryResult?.secure_url || 'NULL'}`);
    try {
        const sessionResult = await pool.query(
            `INSERT INTO payroll_import_sessions
                (file_name, file_url, cloudinary_public_id, month_period,
                 total_employees, total_success, total_no_gmail, total_not_found,
                 total_failed, total_limit_reached, imported_by_id, imported_by_name)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
             RETURNING id`,
            [
                fileName,
                cloudinaryResult?.secure_url || null,
                cloudinaryResult?.public_id || null,
                monthPeriod,
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
        console.log(`✅ [IMPORT HISTORY] Step 2 OK → session id: ${sessionId}`);

        // Step 3: Save per-employee detail rows
        console.log('🔍 [IMPORT HISTORY] Step 3: Saving employee details...');
        const details = [
            ...results.success.map(e => ({ ...e, status: 'sent', error_message: null })),
            ...results.noGmail.map(e => ({ ...e, status: 'no_gmail', error_message: e.reason || null })),
            ...results.notFound.map(e => ({ ...e, status: 'not_found', error_message: e.reason || null })),
            ...results.failed.map(e => ({ ...e, status: 'failed', error_message: e.error || null })),
            ...results.limitReached.map(e => ({ ...e, status: 'limit_reached', error_message: e.reason || null }))
        ];
        console.log(`🔍 [IMPORT HISTORY] Total detail rows to insert: ${details.length}`);

        for (const detail of details) {
            await pool.query(
                `INSERT INTO payroll_import_details (session_id, employee_code, employee_name, email, status, error_message)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [sessionId, detail.employeeCode || null, detail.employeeName || null,
                 detail.email || null, detail.status, detail.error_message]
            );
        }

        console.log(`✅ [IMPORT HISTORY] Step 3 OK → ${details.length} detail records saved`);
        console.log('🔍 [IMPORT HISTORY] ========== saveImportSession DONE ==========');
        return sessionId;
    } catch (dbErr) {
        console.error(`❌ [IMPORT HISTORY] Step 2/3 DB FAILED → ${dbErr.message}`);
        console.error('❌ [IMPORT HISTORY] Full DB error:', dbErr);
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
        const originalFileName = req.file.originalname || req.file.filename;
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

        const employeeCount = maxLength - 2; // Row 1 = title, Row 2 = headers, Row 3+ = data
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
            const rowIndex = empIndex + 1; // overallData[2] = Excel row 3 = first employee
            const employeeCode = overallData[rowIndex][0]; // Column A (A[A] = Mã NV)
            const employeeName = overallData[rowIndex][3]; // Column D (A[D] = Họ và tên)

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

                // Apply mapping (A[col] -> B[cell])
                const mappings = [
                    { target: 'B1',  source: { col: 1,  row: 0        }, type: 'header'              }, // A[B1] -> B[B1] tháng/kỳ lương (overallData[0][1] = "Tháng 02/2026")
                    { target: 'H5',  source: { col: 0,  row: rowIndex }                              }, // A[A]
                    { target: 'C8',  source: { col: 1,  row: rowIndex }                              }, // A[B]
                    { target: 'C6',  source: { col: 2,  row: rowIndex }                              }, // A[C]
                    { target: 'C5',  source: { col: 3,  row: rowIndex }                              }, // A[D]
                    { target: 'C7',  source: { col: 4,  row: rowIndex }                              }, // A[E]
                    { target: 'H8',  source: { col: 5,  row: rowIndex }, type: 'currency'            }, // A[F]
                    { target: 'H7',  source: { col: 6,  row: rowIndex }, type: 'currency'            }, // A[G]
                    { target: 'D11', source: { col: 7,  row: rowIndex }, type: 'days'                }, // A[H]
                    { target: 'E11', source: { col: 8,  row: rowIndex }, type: 'currency'            }, // A[I]
                    { target: 'D12', source: { col: 9,  row: rowIndex }, type: 'days'                }, // A[J]
                    { target: 'E12', source: { col: 10, row: rowIndex }, type: 'currency'            }, // A[K]
                    { target: 'D10', source: { col: 11, row: rowIndex }, type: 'days'                }, // A[L]
                    { target: 'E10', source: { col: 12, row: rowIndex }, type: 'currency'            }, // A[M]
                    { target: 'D13', source: { col: 13, row: rowIndex }, type: 'hours'               }, // A[N]
                    { target: 'E13', source: { col: 14, row: rowIndex }, type: 'currency'            }, // A[O]
                    { target: 'D14', source: { col: 15, row: rowIndex }, type: 'hours'               }, // A[P]
                    { target: 'E14', source: { col: 16, row: rowIndex }, type: 'currency'            }, // A[Q]
                    { target: 'D15', source: { col: 17, row: rowIndex }, type: 'hours'               }, // A[R]
                    { target: 'E15', source: { col: 18, row: rowIndex }, type: 'currency'            }, // A[S]
                    { target: 'D16', source: { col: 19, row: rowIndex }, type: 'days'                }, // A[T]
                    { target: 'E16', source: { col: 20, row: rowIndex }, type: 'currency'            }, // A[U]
                    { target: 'H13', source: { col: 21, row: rowIndex }, type: 'currency'            }, // A[V]
                    { target: 'H14', source: { col: 22, row: rowIndex }, type: 'currency'            }, // A[W]
                    { target: 'H15', source: { col: 23, row: rowIndex }, type: 'currency'            }, // A[X]
                    { target: 'H10', source: { col: 24, row: rowIndex }, type: 'currency'            }, // A[Y]
                    { target: 'H11', source: { col: 25, row: rowIndex }, type: 'currency'            }, // A[Z]
                    { target: 'H12', source: { col: 26, row: rowIndex }, type: 'currency'            }, // A[AA]
                    { target: 'D17', source: { col: 27, row: rowIndex }, type: 'days'                }, // A[AB]
                    { target: 'E17', source: { col: 28, row: rowIndex }, type: 'currency'            }, // A[AC]
                    { target: 'D19', source: { col: 29, row: rowIndex }, type: 'days'                }, // A[AD]
                    { target: 'E19', source: { col: 30, row: rowIndex }, type: 'currency'            }, // A[AE]
                    { target: 'H16', source: { col: 31, row: rowIndex }, type: 'currency'            }, // A[AF]
                    { target: 'H17', source: { col: 32, row: rowIndex }, type: 'currency'            }, // A[AG]
                    { target: 'H18', source: { col: 33, row: rowIndex }, type: 'currency'            }, // A[AH]
                    { target: 'H19', source: { col: 34, row: rowIndex }, type: 'currency'            }, // A[AI]
                    { target: 'H20', source: { col: 35, row: rowIndex }, type: 'currency'            }, // A[AJ]
                    { target: 'H21', source: { col: 36, row: rowIndex }, type: 'currency'            }, // A[AK]
                    { target: 'H22', source: { col: 37, row: rowIndex }, type: 'currency'            }, // A[AL]
                    { target: 'E18', source: { col: 38, row: rowIndex }, type: 'currency'            }, // A[AM]
                    { target: 'D20', source: { col: 39, row: rowIndex }, type: 'days'                }, // A[AN]
                    { target: 'E21', source: { col: 40, row: rowIndex }, type: 'currency'            }, // A[AO]
                    { target: 'D21', source: { col: 41, row: rowIndex }, type: 'days'                }, // A[AP]
                    { target: 'E22', source: { col: 42, row: rowIndex }, type: 'currency'            }, // A[AQ]
                    { target: 'H27', source: { col: 43, row: rowIndex }                              }, // A[AR]
                    { target: 'H28', source: { col: 44, row: rowIndex }                              }, // A[AS]
                    { target: 'H29', source: { col: 45, row: rowIndex }, type: 'percentage'          }, // A[AT]
                    { target: 'H30', source: { col: 46, row: rowIndex }, type: 'currency'            }, // A[AU]
                    { target: 'E23', source: { col: 47, row: rowIndex }, type: 'currency'            }, // A[AV]
                    { target: 'H6',  source: { col: 48, row: rowIndex }, type: 'currency'            }, // A[AW]
                    { target: 'E25', source: { col: 49, row: rowIndex }, type: 'currency'            }, // A[AX]
                    { target: 'E24', source: { col: 50, row: rowIndex }, type: 'currency'            }, // A[AY]
                    { target: 'H26', source: { col: 51, row: rowIndex }, type: 'currency_allow_zero' }, // A[AZ]
                    // A[BA] col 52 — skip
                    { target: 'E26', source: { col: 53, row: rowIndex }, type: 'currency'            }, // A[BB]
                    { target: 'E27', source: { col: 54, row: rowIndex }, type: 'currency'            }, // A[BC]
                    { target: 'H24', source: { col: 55, row: rowIndex }, type: 'currency'            }, // A[BD]
                    { target: 'H25', source: { col: 56, row: rowIndex }, type: 'currency'            }, // A[BE]
                    { target: 'E28', source: { col: 57, row: rowIndex }, type: 'currency'            }, // A[BF]
                    { target: 'E30', source: { col: 58, row: rowIndex }, type: 'currency'            }, // A[BG]
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
                    } else if (mapping.type === 'currency' || mapping.type === 'currency_allow_zero') {
                        // Parse currency values and format with comma separator (no VND prefix)
                        let numericValue = 0;

                        if (typeof sourceValue === 'string' && sourceValue.includes('VND')) {
                            // e.g. "VND 10,000,000" → strip all non-numeric
                            const numStr = sourceValue.replace(/[^\d.-]/g, '');
                            numericValue = parseFloat(numStr);
                        } else if (typeof sourceValue === 'number') {
                            numericValue = sourceValue;
                        } else if (typeof sourceValue === 'string') {
                            // raw:false returns comma-formatted strings e.g. "10,000,000"
                            // parseFloat("10,000,000") would stop at the comma and return 10 → wrong!
                            // Strip thousand-separator commas first, then parse
                            const cleanStr = sourceValue.replace(/,/g, '').trim();
                            if (cleanStr !== '' && !isNaN(parseFloat(cleanStr))) {
                                numericValue = parseFloat(cleanStr);
                            }
                        }

                        // Skip if value is 0 or NaN (unless type is currency_allow_zero)
                        if (mapping.type === 'currency' && (!numericValue || numericValue === 0)) {
                            return; // Don't map, keep original value in B file
                        }

                        // For currency_allow_zero: if source is empty/null, map 0
                        if (mapping.type === 'currency_allow_zero' && (sourceValue === null || sourceValue === undefined || sourceValue === '')) {
                            numericValue = 0;
                        }

                        // Format with comma separator only (no VND prefix, no decimal points)
                        finalValue = numericValue === 0 ? '0' : new Intl.NumberFormat('vi-VN').format(numericValue);
                    } else if (mapping.type === 'days') {
                        // Format days values to "X ngày" format
                        let numericValue = 0;

                        if (typeof sourceValue === 'string') {
                            const trimmed = sourceValue.trim();
                            // Extract number from string like "0 ngày", "0.0 ngày", "26 ngày"
                            const numMatch = trimmed.match(/^([\d.]+)\s*ngày/);
                            if (numMatch) {
                                numericValue = parseFloat(numMatch[1]);
                            } else if (!isNaN(parseFloat(trimmed))) {
                                // Handle raw number as string "26"
                                numericValue = parseFloat(trimmed);
                            }
                        } else if (typeof sourceValue === 'number') {
                            numericValue = sourceValue;
                        }

                        // Skip if number is 0 or 0.0
                        if (numericValue === 0) {
                            return; // Don't map, keep original value in B file
                        }

                        // Format as "X ngày" (remove decimal if it's whole number)
                        const displayValue = Number.isInteger(numericValue) ? numericValue : numericValue.toFixed(1);
                        finalValue = `${displayValue} ngày`;
                    } else if (mapping.type === 'hours') {
                        // Format hours values to "X giờ" format
                        let numericValue = 0;

                        if (typeof sourceValue === 'string') {
                            const trimmed = sourceValue.trim();
                            // Extract number from string like "0 giờ", "31.5 giờ", "26 giờ"
                            const numMatch = trimmed.match(/^([\d.]+)\s*giờ/);
                            if (numMatch) {
                                numericValue = parseFloat(numMatch[1]);
                            } else if (!isNaN(parseFloat(trimmed))) {
                                // Handle raw number as string "26"
                                numericValue = parseFloat(trimmed);
                            }
                        } else if (typeof sourceValue === 'number') {
                            numericValue = sourceValue;
                        }

                        // Skip if number is 0 or 0.0
                        if (numericValue === 0) {
                            return; // Don't map, keep original value in B file
                        }

                        // Format as "X giờ" (remove decimal if it's whole number)
                        const displayValue = Number.isInteger(numericValue) ? numericValue : numericValue.toFixed(1);
                        finalValue = `${displayValue} giờ`;
                    } else if (mapping.type === 'percentage') {
                        // Format percentage values
                        // If input already has %, keep as-is: "-30%" → "-30%"
                        // If input is decimal, convert: -0.3 → "-30%"
                        let percentageValue = 0;
                        let alreadyPercentage = false;

                        if (typeof sourceValue === 'string' && sourceValue.includes('%')) {
                            // Already formatted as percentage: "-30%" or "100%"
                            alreadyPercentage = true;
                            const cleaned = sourceValue.replace(/[^\d.-]/g, '');
                            percentageValue = parseFloat(cleaned);
                        } else if (typeof sourceValue === 'number') {
                            // Decimal format: -0.3 → multiply by 100
                            percentageValue = sourceValue * 100;
                        } else if (typeof sourceValue === 'string') {
                            // String decimal: "-0.3"
                            const cleaned = sourceValue.replace(/[^\d.-]/g, '');
                            const numValue = parseFloat(cleaned);
                            percentageValue = numValue * 100;
                        }

                        // Skip if value is NaN
                        if (isNaN(percentageValue)) {
                            return; // Don't map, keep original value in B file
                        }

                        // Format with up to 1 decimal place if needed
                        const formatted = Number.isInteger(percentageValue)
                            ? percentageValue
                            : percentageValue.toFixed(1);
                        finalValue = `${formatted}%`;
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

        // Save import history (upload file to Cloudinary + save session/details to DB)
        const importedBy = req.user
            ? { id: req.user.id, name: `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim() }
            : null;
        await saveImportSession({
            filePath: overallPayrollPath,   // still on disk, not deleted yet
            fileName: originalFileName,
            monthPeriod,
            results,
            employeeCount,
            importedBy
        });

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

/**
 * GET /payroll/import-history
 * List all import sessions (metadata only, no file content)
 */
exports.getImportHistory = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, imported_at, file_name, file_url, month_period,
                    total_employees, total_success, total_no_gmail,
                    total_not_found, total_failed, total_limit_reached,
                    imported_by_id, imported_by_name
             FROM payroll_import_sessions
             ORDER BY imported_at DESC
             LIMIT 100`
        );
        res.json({ success: true, sessions: result.rows });
    } catch (error) {
        console.error('❌ [IMPORT HISTORY] getImportHistory error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch import history', error: error.message });
    }
};

/**
 * GET /payroll/import-history/:sessionId
 * Per-employee details for a specific session
 */
exports.getImportSessionDetails = async (req, res) => {
    try {
        const { sessionId } = req.params;

        const sessionResult = await pool.query(
            `SELECT id, imported_at, file_name, file_url, month_period,
                    total_employees, total_success, total_no_gmail,
                    total_not_found, total_failed, total_limit_reached,
                    imported_by_id, imported_by_name
             FROM payroll_import_sessions WHERE id = $1`,
            [sessionId]
        );

        if (sessionResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Session not found' });
        }

        const detailsResult = await pool.query(
            `SELECT id, employee_code, employee_name, email, status, error_message, processed_at
             FROM payroll_import_details
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
        console.error('❌ [IMPORT HISTORY] getImportSessionDetails error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch session details', error: error.message });
    }
};
