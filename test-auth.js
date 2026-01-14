const jwt = require('jsonwebtoken');
require('dotenv').config();

// Simulate creating a token for john.doe@peoplehub.com
const user = {
    id: 1,
    employee_id: 'EMP-001',
    email: 'john.doe@peoplehub.com',
    role: 'admin'
};

console.log('🔑 Testing JWT Token Generation\n');
console.log('User Data:', user);
console.log('JWT_SECRET:', process.env.JWT_SECRET);
console.log('JWT_EXPIRE:', process.env.JWT_EXPIRE);

// Generate token
const token = jwt.sign(
    {
        id: user.id,
        email: user.email,
        role: user.role
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE }
);

console.log('\n📝 Generated Token:');
console.log(token);

// Verify token
try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('\n✅ Token Verified Successfully:');
    console.log(decoded);
} catch (error) {
    console.log('\n❌ Token Verification Failed:');
    console.log(error.message);
}

// Instructions for testing
console.log('\n\n📋 Testing Instructions:');
console.log('1. Copy the token above');
console.log('2. Open browser DevTools > Application > Local Storage');
console.log('3. Find key "peoplehub_token" and replace its value with the token above');
console.log('4. Refresh the page and try sending payroll again');
console.log('\n   OR');
console.log('\n5. Use this cURL command to test the API directly:');
console.log(`\ncurl -X POST http://localhost:5000/api/payroll/batch-send \\
  -H "Authorization: Bearer ${token}" \\
  -F "overallPayroll=@temp-peyroll-form/Overall-payroll.xlsx"`);
