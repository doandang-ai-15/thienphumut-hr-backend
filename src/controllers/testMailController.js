const nodemailer = require('nodemailer');

/**
 * Test mail server connection
 * @route GET /api/test-mail
 */
exports.testMailConnection = async (req, res) => {
    try {
        console.log('🔍 [TEST MAIL] Testing mail server connection...');

        // Test multiple port configurations
        const ports = [587, 465, 25];
        const results = [];

        for (const port of ports) {
            console.log(`\n📧 [TEST MAIL] Testing port ${port}...`);

            const mailConfig = {
                host: process.env.MAIL_HOST,
                port: port,
                secure: port === 465,
                auth: {
                    user: process.env.MAIL_USER,
                    pass: process.env.MAIL_PASSWORD
                },
                tls: {
                    rejectUnauthorized: false
                },
                connectionTimeout: 10000,
                greetingTimeout: 10000,
                socketTimeout: 10000
            };

            console.log(`🔧 [TEST MAIL] Config for port ${port}:`, {
                host: mailConfig.host,
                port: mailConfig.port,
                secure: mailConfig.secure,
                user: mailConfig.auth.user
            });

            const transporter = nodemailer.createTransport(mailConfig);

            try {
                const startTime = Date.now();
                await transporter.verify();
                const duration = Date.now() - startTime;

                console.log(`✅ [TEST MAIL] Port ${port} - SUCCESS (${duration}ms)`);
                results.push({
                    port: port,
                    status: 'success',
                    duration: `${duration}ms`,
                    message: 'Connection successful'
                });
            } catch (error) {
                console.log(`❌ [TEST MAIL] Port ${port} - FAILED:`, error.message);
                results.push({
                    port: port,
                    status: 'failed',
                    error: error.message,
                    code: error.code
                });
            }
        }

        // Summary
        console.log('\n📊 [TEST MAIL] Summary:', results);

        res.status(200).json({
            success: true,
            message: 'Mail server connection test completed',
            environment: process.env.NODE_ENV,
            host: process.env.MAIL_HOST,
            results: results
        });

    } catch (error) {
        console.error('❌ [TEST MAIL] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to test mail connection',
            error: error.message
        });
    }
};
