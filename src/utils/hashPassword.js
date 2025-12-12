// Utility to hash passwords for seeding database
const bcrypt = require('bcryptjs');

async function hashPassword(password) {
    const hash = await bcrypt.hash(password, 10);
    console.log(`Password: ${password}`);
    console.log(`Hashed: ${hash}`);
    return hash;
}

// Hash password "12345678" for HR Manager accounts
hashPassword('12345678');

// Verify it works
async function verifyPassword() {
    const password = '12345678';
    const hash = '$2a$10$N9qo8uLOickgx2ZoE5EKP.xrqJm0Km1RVqxRCcKq4xOQl2pHBgLqO';
    const match = await bcrypt.compare(password, hash);
    console.log(`\nVerification: ${password} matches hash? ${match}`);
}

verifyPassword();
