/**
 * Test Mail Server Connection
 * Run: node test_mail.js
 */

const nodemailer = require('nodemailer');
require('dotenv').config();

async function testMailServer() {
    console.log('🧪 Testing mail server connection...\n');

    // Test configurations
    const configs = [
        {
            name: 'mail.thienphumut.vn:587 (TLS)',
            host: 'mail.thienphumut.vn',
            port: 587,
            secure: false
        },
        {
            name: 'mail.thienphumut.vn:465 (SSL)',
            host: 'mail.thienphumut.vn',
            port: 465,
            secure: true
        },
        {
            name: 'mail9358.maychuemail.com:587 (TLS)',
            host: 'mail9358.maychuemail.com',
            port: 587,
            secure: false
        },
        {
            name: 'mail9358.maychuemail.com:465 (SSL)',
            host: 'mail9358.maychuemail.com',
            port: 465,
            secure: true
        }
    ];

    for (const config of configs) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`Testing: ${config.name}`);
        console.log('='.repeat(60));

        const transporterConfig = {
            host: config.host,
            port: config.port,
            secure: config.secure,
            auth: {
                user: 'nhansu@thienphumut.vn',
                pass: 'phdg79kV78'
            },
            tls: {
                rejectUnauthorized: false
            },
            connectionTimeout: 10000,
            greetingTimeout: 10000
        };

        try {
            const transporter = nodemailer.createTransport(transporterConfig);

            console.log('⏳ Verifying connection...');
            await transporter.verify();

            console.log('✅ SUCCESS! Connection verified!');
            console.log('📧 Config that works:');
            console.log(`   MAIL_HOST=${config.host}`);
            console.log(`   MAIL_PORT=${config.port}`);
            console.log(`   MAIL_USER=nhansu@thienphumut.vn`);
            console.log(`   MAIL_PASSWORD=phdg79kV78`);

            // Try sending test email
            console.log('\n📤 Attempting to send test email...');
            const info = await transporter.sendMail({
                from: '"Thiên Phú Mút HR" <nhansu@thienphumut.vn>',
                to: 'nhansu@thienphumut.vn', // Send to self
                subject: 'Test Email - Mail Server Configuration',
                html: '<h1>Test Successful!</h1><p>Your mail server is configured correctly.</p>'
            });

            console.log('✅ Email sent successfully!');
            console.log('📧 Message ID:', info.messageId);

            console.log('\n🎉 THIS CONFIG WORKS! Use it in Render environment variables.');
            break; // Stop testing if found working config

        } catch (error) {
            console.log('❌ FAILED:', error.message);
            if (error.code) {
                console.log('   Error code:', error.code);
            }
        }
    }

    console.log('\n' + '='.repeat(60));
    console.log('Test completed');
    console.log('='.repeat(60));
}

testMailServer().catch(console.error);
