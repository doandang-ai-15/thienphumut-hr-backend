require('dotenv').config();
const brevo = require('@getbrevo/brevo');

async function testBrevoAPI() {
    try {
        console.log('🔑 Testing Brevo API Connection...\n');
        console.log('API Key:', process.env.BREVO_API_KEY);
        console.log('Sender Email:', process.env.BREVO_SENDER_EMAIL);

        // Initialize Brevo API
        let apiInstance = new brevo.TransactionalEmailsApi();
        let apiKey = apiInstance.authentications['apiKey'];
        apiKey.apiKey = process.env.BREVO_API_KEY;

        console.log('\n📧 Attempting to send test email...\n');

        // Create email
        const sendSmtpEmail = new brevo.SendSmtpEmail();
        sendSmtpEmail.subject = "Test from Thiên Phú Mút HR";
        sendSmtpEmail.to = [{
            email: "dangdnm.ti.1720@gmail.com",
            name: "Test User"
        }];
        sendSmtpEmail.sender = {
            name: process.env.MAIL_FROM_NAME || 'Thiên Phú Mút HR',
            email: process.env.BREVO_SENDER_EMAIL || 'nhansu@thienphumut.vn'
        };
        sendSmtpEmail.htmlContent = `
            <html>
                <body>
                    <h2>Test Email from Brevo</h2>
                    <p>This is a test email to verify Brevo API integration.</p>
                    <p>If you received this, the API key is working correctly!</p>
                </body>
            </html>
        `;

        // Send email
        const result = await apiInstance.sendTransacEmail(sendSmtpEmail);

        console.log('✅ Email sent successfully!');
        console.log('Message ID:', result.messageId);
        console.log('\n✅ Brevo API is working correctly!');

    } catch (error) {
        console.error('❌ Error testing Brevo API:', error.message);

        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Status Text:', error.response.statusText);
            console.error('Response body:', error.response.body);
        }

        console.log('\n❌ API Key might be invalid or sender email not verified!');
        console.log('\nPlease check:');
        console.log('1. API Key is correct (get from: https://app.brevo.com/settings/keys/api)');
        console.log('2. Sender email is verified (check: https://app.brevo.com/senders)');
    }
}

testBrevoAPI();
