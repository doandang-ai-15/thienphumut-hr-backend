const XLSX = require('xlsx');
const path = require('path');
const { pool } = require('../config/database');

/**
 * Scan DS CNV.xlsx and compare employee codes with database
 * @route GET /api/employees/validate-codes
 */
exports.validateEmployeeCodes = async (req, res) => {
    console.log('🚀 [STEP 1] API validateEmployeeCodes called');

    try {
        console.log('📋 [STEP 2] Starting employee code validation...');

        // Read DS CNV.xlsx file
        const filePath = path.join(__dirname, '../../temp-peyroll-form/DS CNV.xlsx');
        console.log(`📁 [STEP 3] File path: ${filePath}`);

        console.log('📖 [STEP 4] Reading Excel file...');
        const workbook = XLSX.readFile(filePath);
        console.log('✅ [STEP 5] Excel file read successfully');

        const sheetName = workbook.SheetNames[0];
        console.log(`📄 [STEP 6] Sheet name: ${sheetName}`);

        const worksheet = workbook.Sheets[sheetName];

        // Convert to JSON (skip header row)
        console.log('🔄 [STEP 7] Converting sheet to JSON...');
        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        console.log(`📊 [STEP 8] Found ${data.length} rows in DS CNV file`);

        if (data.length > 0) {
            console.log(`📝 [STEP 9] Sample row 1:`, data[0]);
            if (data.length > 1) {
                console.log(`📝 [STEP 10] Sample row 2:`, data[1]);
            }
        }

        // Get all employees from database
        console.log('💾 [STEP 11] Querying database for employees...');
        const dbResult = await pool.query(`
            SELECT id, first_name, last_name, employee_id
            FROM employees
            ORDER BY id
        `);
        console.log(`✅ [STEP 12] Database query successful`);

        const dbEmployees = dbResult.rows;

        console.log(`👥 Found ${dbEmployees.length} employees in database`);

        const mismatches = [];
        const notFoundInDB = [];
        const notFoundInFile = [];

        // Start from row 1 (skip header row 0)
        for (let i = 1; i < data.length; i++) {
            const row = data[i];

            // Skip empty rows
            if (!row || !row[0]) continue;

            const fullName = String(row[0] || '').trim(); // Column A: Full name
            const fileCode = String(row[1] || '').trim(); // Column B: Employee code

            if (!fullName || !fileCode) continue;

            // Split full name into last_name (tên) and first_name (họ và tên đệm)
            // Vietnamese name format: "HỌ VÀ TÊN ĐỆM TÊN"
            // Example: "NGUYỄN VĂN CHUNG" → first_name: "NGUYỄN VĂN", last_name: "CHUNG"
            const nameParts = fullName.split(' ');
            const lastName = nameParts[nameParts.length - 1]; // Last word is "tên"
            const firstName = nameParts.slice(0, -1).join(' '); // Rest is "họ và tên đệm"

            // Find matching employee in database
            const matchedEmployee = dbEmployees.find(emp => {
                const empFirstName = String(emp.first_name || '').trim().toUpperCase();
                const empLastName = String(emp.last_name || '').trim().toUpperCase();
                const searchFirstName = firstName.toUpperCase();
                const searchLastName = lastName.toUpperCase();

                return empFirstName === searchFirstName && empLastName === searchLastName;
            });

            if (matchedEmployee) {
                // Found employee, check if code matches
                const dbCode = String(matchedEmployee.employee_id || '').trim();

                if (dbCode !== fileCode) {
                    mismatches.push({
                        row: i + 1, // Excel row number (1-indexed + header)
                        fullName,
                        fileCode,
                        dbCode,
                        dbId: matchedEmployee.id,
                        firstName: matchedEmployee.first_name,
                        lastName: matchedEmployee.last_name
                    });

                    console.log(`⚠️  Row ${i + 1}: ${fullName} - File: ${fileCode} vs DB: ${dbCode}`);
                }
            } else {
                // Employee not found in database
                notFoundInDB.push({
                    row: i + 1,
                    fullName,
                    fileCode,
                    searchedFirstName: firstName,
                    searchedLastName: lastName
                });

                console.log(`❌ Row ${i + 1}: ${fullName} (${fileCode}) - NOT FOUND in database`);
            }
        }

        // Check for employees in DB but not in file
        for (const dbEmp of dbEmployees) {
            const dbFullName = `${dbEmp.first_name} ${dbEmp.last_name}`.trim().toUpperCase();

            const foundInFile = data.slice(1).some(row => {
                if (!row || !row[0]) return false;
                const fileFullName = String(row[0]).trim().toUpperCase();
                return fileFullName === dbFullName;
            });

            if (!foundInFile) {
                notFoundInFile.push({
                    dbId: dbEmp.id,
                    fullName: `${dbEmp.first_name} ${dbEmp.last_name}`,
                    dbCode: dbEmp.employee_id,
                    firstName: dbEmp.first_name,
                    lastName: dbEmp.last_name
                });
            }
        }

        console.log('📊 [STEP 13] Creating summary...');
        const summary = {
            totalInFile: data.length - 1, // Exclude header
            totalInDB: dbEmployees.length,
            mismatches: mismatches.length,
            notFoundInDB: notFoundInDB.length,
            notFoundInFile: notFoundInFile.length,
            matchedCorrectly: (data.length - 1) - mismatches.length - notFoundInDB.length
        };

        console.log('✅ [STEP 14] Validation completed successfully!');
        console.log(`📊 [STEP 15] Summary: ${summary.matchedCorrectly} matched, ${summary.mismatches} mismatches, ${summary.notFoundInDB} not in DB, ${summary.notFoundInFile} not in file`);

        console.log('📤 [STEP 16] Sending response to client...');
        res.json({
            success: true,
            summary,
            mismatches,
            notFoundInDB,
            notFoundInFile
        });
        console.log('✅ [STEP 17] Response sent successfully!');

    } catch (error) {
        console.error('❌ [ERROR] Error validating employee codes:', error);
        console.error('❌ [ERROR] Error stack:', error.stack);
        console.error('❌ [ERROR] Error message:', error.message);

        res.status(500).json({
            success: false,
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};

/**
 * Update all mismatched employee codes from DS CNV to database
 * @route POST /api/employees/update-codes
 */
exports.updateEmployeeCodes = async (req, res) => {
    console.log('🔄 [UPDATE STEP 1] API updateEmployeeCodes called');

    try {
        const { mismatches } = req.body;

        if (!mismatches || !Array.isArray(mismatches) || mismatches.length === 0) {
            console.log('⚠️  [UPDATE STEP 2] No mismatches provided');
            return res.status(400).json({
                success: false,
                error: 'No mismatches provided'
            });
        }

        console.log(`📊 [UPDATE STEP 3] Updating ${mismatches.length} employee codes...`);

        const results = {
            success: [],
            failed: []
        };

        for (const mismatch of mismatches) {
            try {
                console.log(`🔄 [UPDATE] Updating employee ID ${mismatch.dbId}: ${mismatch.dbCode} → ${mismatch.fileCode}`);

                const updateResult = await pool.query(
                    `UPDATE employees 
                     SET employee_id = $1 
                     WHERE id = $2 
                     RETURNING id, first_name, last_name, employee_id`,
                    [mismatch.fileCode, mismatch.dbId]
                );

                if (updateResult.rowCount > 0) {
                    results.success.push({
                        id: mismatch.dbId,
                        fullName: mismatch.fullName,
                        oldCode: mismatch.dbCode,
                        newCode: mismatch.fileCode
                    });
                    console.log(`✅ [UPDATE] Successfully updated employee ID ${mismatch.dbId}`);
                } else {
                    results.failed.push({
                        id: mismatch.dbId,
                        fullName: mismatch.fullName,
                        error: 'No rows updated'
                    });
                    console.log(`❌ [UPDATE] Failed to update employee ID ${mismatch.dbId}: No rows affected`);
                }

            } catch (error) {
                results.failed.push({
                    id: mismatch.dbId,
                    fullName: mismatch.fullName,
                    error: error.message
                });
                console.error(`❌ [UPDATE] Error updating employee ID ${mismatch.dbId}:`, error.message);
            }
        }

        console.log(`✅ [UPDATE STEP 4] Update completed: ${results.success.length} success, ${results.failed.length} failed`);

        res.json({
            success: true,
            results: {
                successCount: results.success.length,
                failedCount: results.failed.length,
                success: results.success,
                failed: results.failed
            }
        });

    } catch (error) {
        console.error('❌ [UPDATE ERROR] Error updating employee codes:', error);
        console.error('❌ [UPDATE ERROR] Error stack:', error.stack);

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};
