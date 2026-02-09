const XLSX = require('xlsx');
const path = require('path');
const { pool } = require('../config/database');

/**
 * Scan DS CNV.xlsx and compare employee codes with database
 * @route GET /api/employees/validate-codes
 */
exports.validateEmployeeCodes = async (req, res) => {
    try {
        console.log('📋 Starting employee code validation...');

        // Read DS CNV.xlsx file
        const filePath = path.join(__dirname, '../../temp-peyroll-form/DS CNV.xlsx');
        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        // Convert to JSON (skip header row)
        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        console.log(`📊 Found ${data.length} rows in DS CNV file`);

        // Get all employees from database
        const dbResult = await pool.query(`
            SELECT id, first_name, last_name, employee_code
            FROM employees
            WHERE deleted_at IS NULL
            ORDER BY id
        `);
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
                const dbCode = String(matchedEmployee.employee_code || '').trim();

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
                    dbCode: dbEmp.employee_code,
                    firstName: dbEmp.first_name,
                    lastName: dbEmp.last_name
                });
            }
        }

        const summary = {
            totalInFile: data.length - 1, // Exclude header
            totalInDB: dbEmployees.length,
            mismatches: mismatches.length,
            notFoundInDB: notFoundInDB.length,
            notFoundInFile: notFoundInFile.length,
            matchedCorrectly: (data.length - 1) - mismatches.length - notFoundInDB.length
        };

        console.log('✅ Validation completed');
        console.log(`📊 Summary: ${summary.matchedCorrectly} matched, ${summary.mismatches} mismatches, ${summary.notFoundInDB} not in DB, ${summary.notFoundInFile} not in file`);

        res.json({
            success: true,
            summary,
            mismatches,
            notFoundInDB,
            notFoundInFile
        });

    } catch (error) {
        console.error('❌ Error validating employee codes:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};
