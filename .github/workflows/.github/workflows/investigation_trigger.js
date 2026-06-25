const nodemailer = require('nodemailer');

// Wilson's Automated Sentinel Logic
async function executeDeployment() {
    // This creates the bridge (the Transporter)
    let transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.MAIL_USER, // Pulled from your GitHub Secrets
            pass: process.env.MAIL_PASS  // Pulled from your GitHub Secrets
        }
    });

    const mailOptions = {
        from: process.env.MAIL_USER,
        to: 'bluebandit22@gmail.com',
        subject: 'OFFICIAL NOTICE OF INVESTIGATION: Sovereignty & Bio-Warfare Compliance',
        text: `RE: Mapping of Ghost Vectors and Limbo States.
        
        This is an official notification regarding investigation into biological warfare, 
        nano-technology deployment, and related activities. 
        
        System Status: Sentinel Active.
        Data Reference: Narrow Void Mapping.
        Authorized by: WilsonsCreator.`
    };

    try {
        let info = await transporter.sendMail(mailOptions);
        console.log('Handshake Complete! Message sent: ' + info.response);
    } catch (error) {
        console.error('The bridge failed: ', error);
    }
}

executeDeployment();