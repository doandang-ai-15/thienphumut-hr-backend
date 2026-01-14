const { pool } = require('./src/config/database');

async function checkUser() {
    try {
        console.log('🔍 Checking user john.doe@peoplehub.com...\n');

        // Check by email
        const emailResult = await pool.query(
            'SELECT id, employee_id, first_name, last_name, email, role, status FROM employees WHERE email = $1',
            ['john.doe@peoplehub.com']
        );

        console.log('📧 Query by email:');
        if (emailResult.rows.length > 0) {
            console.log(emailResult.rows[0]);
        } else {
            console.log('❌ User not found by email');
        }

        console.log('\n');

        // Check by employee_id
        const empIdResult = await pool.query(
            'SELECT id, employee_id, first_name, last_name, email, role, status FROM employees WHERE employee_id = $1',
            ['EMP-001']
        );

        console.log('🆔 Query by employee_id:');
        if (empIdResult.rows.length > 0) {
            console.log(empIdResult.rows[0]);
        } else {
            console.log('❌ User not found by employee_id');
        }

        console.log('\n');

        // Check all admin users
        const adminResult = await pool.query(
            "SELECT id, employee_id, first_name, last_name, email, role, status FROM employees WHERE role = 'admin'"
        );

        console.log('👑 All admin users:');
        console.log(adminResult.rows);

        console.log('\n');

        // Check employees with employee_id 01115, 01116, 01117
        const payrollEmps = await pool.query(
            "SELECT id, employee_id, first_name, last_name, email, have_gmail, role FROM employees WHERE employee_id IN ('01115', '01116', '01117')"
        );

        console.log('📋 Employees in Overall-payroll (01115, 01116, 01117):');
        console.log(payrollEmps.rows);

        await pool.end();
        console.log('\n✅ Done');

    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

checkUser();
