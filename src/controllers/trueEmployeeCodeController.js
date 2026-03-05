const XLSX = require('xlsx');
const path = require('path');
const { pool } = require('../config/database');

/**
 * Scan true-employee-code.xlsx and compare employee codes with database
 * Column A = new employee code, Column B = full name (họ và tên đệm + tên)
 * @route GET /api/employees/validate-true-codes
 */
exports.validateTrueEmployeeCodes = async (req, res) => {
    try {
        // Read true-employee-code.xlsx file
        const filePath = path.join(__dirname, '../../temp-peyroll-form/true-employee-code.xlsx');
        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        // Get all employees from database with department info
        const dbResult = await pool.query(`
            SELECT e.id, e.first_name, e.last_name, e.employee_id, d.name as department_name
            FROM employees e
            LEFT JOIN departments d ON e.department_id = d.id
            ORDER BY e.id
        `);
        const dbEmployees = dbResult.rows;

        const toUpdate = [];       // Employees that need code update
        const noChange = [];       // Employees whose code already matches
        const tpPrefixed = [];     // Employees with codes starting with 'TP' (before update)
        const duplicateNames = []; // Employees with duplicate full names in DB
        const notFoundInDB = [];   // Names in file but not found in DB

        // Build a map of full names to DB employees (detect duplicates)
        const nameToEmployeesMap = {};
        for (const emp of dbEmployees) {
            const fullName = `${emp.first_name} ${emp.last_name}`.trim().toUpperCase();
            if (!nameToEmployeesMap[fullName]) {
                nameToEmployeesMap[fullName] = [];
            }
            nameToEmployeesMap[fullName].push(emp);
        }

        // Check employees with TP-prefixed codes (before any update)
        for (const emp of dbEmployees) {
            const code = String(emp.employee_id || '').trim();
            if (code.toUpperCase().startsWith('TP')) {
                tpPrefixed.push({
                    dbId: emp.id,
                    fullName: `${emp.first_name} ${emp.last_name}`,
                    currentCode: code,
                    department: emp.department_name || 'Chưa có phòng ban'
                });
            }
        }

        // Track which file names have duplicates
        const duplicateNamesSet = new Set();

        // Process each row in the Excel file (skip header row 0)
        for (let i = 1; i < data.length; i++) {
            const row = data[i];
            if (!row || !row[0]) continue;

            const newCode = String(row[0] || '').trim();  // Column A: new employee code
            const fullName = String(row[1] || '').trim();  // Column B: full name

            if (!newCode || !fullName) continue;

            const fullNameUpper = fullName.toUpperCase();
            const matchedEmployees = nameToEmployeesMap[fullNameUpper] || [];

            if (matchedEmployees.length === 0) {
                // Not found in DB
                notFoundInDB.push({
                    row: i + 1,
                    fullName,
                    newCode
                });
            } else if (matchedEmployees.length > 1) {
                // Duplicate names found - flag for manual check
                if (!duplicateNamesSet.has(fullNameUpper)) {
                    duplicateNamesSet.add(fullNameUpper);
                    for (const emp of matchedEmployees) {
                        duplicateNames.push({
                            dbId: emp.id,
                            fullName: `${emp.first_name} ${emp.last_name}`,
                            department: emp.department_name || 'Chưa có phòng ban',
                            currentCode: emp.employee_id,
                            newCode: newCode
                        });
                    }
                }
            } else {
                // Exactly one match
                const emp = matchedEmployees[0];
                const currentCode = String(emp.employee_id || '').trim();

                if (currentCode === newCode) {
                    noChange.push({
                        dbId: emp.id,
                        fullName: `${emp.first_name} ${emp.last_name}`,
                        code: currentCode
                    });
                } else {
                    toUpdate.push({
                        dbId: emp.id,
                        fullName: `${emp.first_name} ${emp.last_name}`,
                        department: emp.department_name || 'Chưa có phòng ban',
                        currentCode,
                        newCode
                    });
                }
            }
        }

        const summary = {
            totalInFile: data.length - 1,
            totalInDB: dbEmployees.length,
            toUpdateCount: toUpdate.length,
            noChangeCount: noChange.length,
            tpPrefixedCount: tpPrefixed.length,
            duplicateNamesCount: duplicateNames.length,
            notFoundInDBCount: notFoundInDB.length
        };

        res.json({
            success: true,
            summary,
            toUpdate,
            noChange,
            tpPrefixed,
            duplicateNames,
            notFoundInDB
        });

    } catch (error) {
        console.error('Error validating true employee codes:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

/**
 * Update employee codes from true-employee-code.xlsx
 * @route POST /api/employees/update-true-codes
 */
exports.updateTrueEmployeeCodes = async (req, res) => {
    try {
        const { updates } = req.body;

        if (!updates || !Array.isArray(updates) || updates.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No updates provided'
            });
        }

        const results = { success: [], failed: [] };

        for (const item of updates) {
            try {
                const updateResult = await pool.query(
                    `UPDATE employees
                     SET employee_id = $1
                     WHERE id = $2
                     RETURNING id, first_name, last_name, employee_id`,
                    [item.newCode, item.dbId]
                );

                if (updateResult.rowCount > 0) {
                    results.success.push({
                        id: item.dbId,
                        fullName: item.fullName,
                        oldCode: item.currentCode,
                        newCode: item.newCode
                    });
                } else {
                    results.failed.push({
                        id: item.dbId,
                        fullName: item.fullName,
                        error: 'No rows updated'
                    });
                }
            } catch (error) {
                results.failed.push({
                    id: item.dbId,
                    fullName: item.fullName,
                    error: error.message
                });
            }
        }

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
        console.error('Error updating true employee codes:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};
