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

module.exports = {
  sendOtpEmail,
  sendRegistrationSuccessEmail,
  sendCourseUpdateNotification,
};
