// Centralized email templates for consistent messaging across the app
const { sendEmail } = require('./email');

// Send OTP verification email
async function sendOtpEmail(email, name, otp) {
  return sendEmail({
    to: email,
    subject: "ScholarX Account Verification Code",
    text: `Your verification code ${otp} will expire in 5 minutes.`,
    html: `<p>${name},</p><p>Your verification code <strong>${otp}</strong> will expire in 5 minutes.</p>`,
  }).catch((emailError) => console.error("Error sending verification email", emailError && emailError.message ? emailError.message : emailError));
}

// Send registration success/welcome email (reusable for both manual and Google registration)
async function sendRegistrationSuccessEmail(email, name) {
  return sendEmail({
    to: email,
    subject: "Registration successful!",
    text: "Your account has been created successfully and your email is verified. You can log in and start learning.",
    html: `<p>Welcome ${name},</p><p>Your account has been created successfully and your email is verified. You can log in and start learning.</p>`,
  }).catch((emailError) => console.error("Error sending registration success email", emailError && emailError.message ? emailError.message : emailError));
}

// Send course update notification to enrolled students
async function sendCourseUpdateNotification(recipients, courseTitle, lessonTitle, updateText) {
  const subject = `Course update: ${courseTitle}`;
  const html = `<p>Assalamu alaikum,</p>
    <p>There is a new update in <strong>${courseTitle}</strong>${lessonTitle ? ` (Lesson: ${lessonTitle})` : ""}.</p>
    <p>${updateText}</p>
    <p>Please log in to view the latest materials in shaa Allah.</p>`;
  const text = `Course update: ${courseTitle}. ${lessonTitle ? `Lesson: ${lessonTitle}. ` : ""}${updateText}`;

  // Send to all recipients in parallel
  return Promise.allSettled(
    recipients.map((studentEmail) =>
      sendEmail({
        to: studentEmail,
        subject,
        html,
        text,
      })
    )
  ).catch((emailError) => console.error("Error sending course update notifications", emailError && emailError.message ? emailError.message : emailError));
}

// Send teacher application approval notification with login credentials
async function sendTeacherApprovalEmail(email, name, tempPassword) {
  return sendEmail({
    to: email,
    subject: "Congratulations! Your ScholarX Teacher Application is Approved",
    text: `Welcome to ScholarX, ${name}!\n\nYour teacher application has been approved!\n\nYour account details:\nEmail: ${email}\nTemporary Password: ${tempPassword}\n\nPlease log in at the ScholarX platform and change your password immediately.\n\nLogin URL: https://scholarx.example.com/login`,
    html: `<p>Assalamu alaikum ${name},</p>
    <p>We're excited to inform you that your teacher application has been <strong>approved</strong>!</p>
    <p>Your account is now active and ready to use. Here are your login credentials:</p>
    <table style="border-collapse: collapse; margin: 20px 0;">
      <tr><td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Email:</td><td style="padding: 10px; border: 1px solid #ddd;">${email}</td></tr>
      <tr><td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Temporary Password:</td><td style="padding: 10px; border: 1px solid #ddd;"><code>${tempPassword}</code></td></tr>
    </table>
    <p><strong>Important:</strong> Please log in immediately and change your password to something secure.</p>
    <p><a href="https://scholarx.example.com/login" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Login to ScholarX</a></p>
    <p>Once logged in, you can:</p>
    <ul>
      <li>View and manage your assigned courses</li>
      <li>Track student progress</li>
      <li>Upload lesson materials and recordings</li>
      <li>Update your teacher profile</li>
    </ul>
    <p>If you need any assistance, please contact our support team.</p>`,
  }).catch((emailError) => console.error("Error sending teacher approval email", emailError && emailError.message ? emailError.message : emailError));
}

module.exports = {
  sendOtpEmail,
  sendRegistrationSuccessEmail,
  sendCourseUpdateNotification,
  sendTeacherApprovalEmail,
};
