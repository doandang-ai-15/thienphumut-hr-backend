require('dotenv').config();

console.log('🔑 Testing Brevo API Key...\n');
console.log('BREVO_API_KEY:', process.env.BREVO_API_KEY);
console.log('BREVO_SENDER_EMAIL:', process.env.BREVO_SENDER_EMAIL);
console.log('MAIL_FROM_NAME:', process.env.MAIL_FROM_NAME);

if (!process.env.BREVO_API_KEY) {
    console.log('\n❌ BREVO_API_KEY is not set!');
} else {
    console.log('\n✅ BREVO_API_KEY is set');
    console.log('Length:', process.env.BREVO_API_KEY.length);
    console.log('First 10 chars:', process.env.BREVO_API_KEY.substring(0, 10));
}
