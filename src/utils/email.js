const nodemailer = require('nodemailer');

// Create transporter with Gmail SMTP
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS, // App password
  },
});

async function sendEmail({ to, subject, text, html }) {
  try {
    const mailOptions = {
      from: `"ScholarX" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      text,
      html,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', info.messageId);
    return { accepted: info.accepted, rejected: info.rejected };
  } catch (error) {
    console.error('Email sending failed:', error.message);
    throw error;
  }
}

module.exports = { sendEmail };
