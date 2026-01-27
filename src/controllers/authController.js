const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { OAuth2Client } = require("google-auth-library");
const User = require("../models/User");
const { sendEmail } = require("../utils/email");
const isProd = process.env.NODE_ENV === 'production';

// derive cookie maxAge from JWT_EXPIRES_IN (supports formats like '7d','24h','30m','3600s' or numeric seconds)
const jwtExpirySetting = process.env.JWT_EXPIRES_IN || '1d';
function parseExpiryToMs(val) {
  if (!val) return undefined;
  const s = String(val).trim();
  const m = s.match(/^(\d+)([smhd])$/i);
  if (m) {
    const n = parseInt(m[1], 10);
    const unit = m[2].toLowerCase();
    switch (unit) {
      case 's':
        return n * 1000;
      case 'm':
        return n * 60 * 1000;
      case 'h':
        return n * 60 * 60 * 1000;
      case 'd':
        return n * 24 * 60 * 60 * 1000;
    }
  }
  // if it's plain number, treat as seconds
  if (/^\d+$/.test(s)) {
    return parseInt(s, 10) * 1000;
  }
  return undefined;
}
const cookieMaxAgeMs = parseExpiryToMs(jwtExpirySetting);

// Cookie SameSite policy: prefer explicit env override, default to 'none' in production (for cross-site), 'lax' in dev
const cookieSameSite = process.env.COOKIE_SAMESITE || (isProd ? 'none' : 'lax');

// Helper: Set auth cookie
function setAuthCookie(res, token) {
  try {
    const cookieOptions = {
      httpOnly: true,
      secure: isProd,
      sameSite: cookieSameSite,
      path: "/",
    };
    if (cookieMaxAgeMs) cookieOptions.maxAge = cookieMaxAgeMs;
    res.cookie("token", token, cookieOptions);
  } catch (err) {
    console.error("Failed to set auth cookie", err.message || err);
  }
}

// Helper: Format user response object
function formatUserResponse(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    emailVerified: user.emailVerified,
    phone: user.phone,
    addressLine1: user.addressLine1,
    addressLine2: user.addressLine2,
    city: user.city,
    country: user.country,
  };
}

// Helper: Create JWT token
function createToken(user) {
  const payload = {
    id: user._id,
    role: user.role,
  };
  const secret = process.env.JWT_SECRET;
  const expiresIn = process.env.JWT_EXPIRES_IN || "1d";
  return jwt.sign(payload, secret, { expiresIn });
}

// validate returnTo path (only allow internal relative paths starting with '/')
function isValidReturnTo(path) {
  if (!path || typeof path !== 'string') return false;
  // disallow protocol or double-slash at start
  if (path.startsWith('//')) return false;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(path)) return false; // protocols like http:
  return path.startsWith('/');
}

// Register new user (student by default unless role is provided and allowed)
exports.register = async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      phone,
      addressLine1,
      addressLine2,
      city,
      country,
    } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email and password are required." });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ registered: true });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      phone,
      addressLine1,
      addressLine2,
      city,
      country,
      // all registered users are students; admins are created via seed script
      role: "student",
      emailVerified: false,
      emailVerificationCode: otp,
      emailVerificationExpires: otpExpires,
    });

    // send OTP email (fire-and-forget)
    sendEmail({
      to: user.email,
      subject: "ScholarX Account Verification Code",
      text: `Your verification code ${otp} will expire in 5 minutes.`,
      html: `<p>${user.name},</p><p>Your verification code <strong>${otp}</strong> will expire in 5 minutes.</p>`,
    }).catch((emailError) => console.error("Error sending verification email", emailError && emailError.message ? emailError.message : emailError));

    const token = createToken(user);
    setAuthCookie(res, token);

    res.status(201).json({
      user: formatUserResponse(user),
      token,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Login user
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required." });
    }

    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (!user.emailVerified) {
      return res
        .status(403)
        .json({ message: "Please verify your email before logging in." });
    }

    const token = createToken(user);
    setAuthCookie(res, token);

    res.json({
      user: formatUserResponse(user),
      token,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Verify email with OTP
exports.verifyEmail = async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ message: "Email and code are required." });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found!" });
    }

    if (!user.emailVerificationCode || !user.emailVerificationExpires) {
      return res.status(400).json({ message: "Verification code not found!" });
    }

    if (user.emailVerificationExpires < new Date()) {
      return res.status(400).json({ message: "Verification code has expired." });
    }

    if (user.emailVerificationCode !== code) {
      return res.status(400).json({ message: "Wrong verification code!" });
    }

    user.emailVerified = true;
    user.emailVerificationCode = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();
    // send registration success email (fire-and-forget)
    sendEmail({
      to: user.email,
      subject: "Registration successful!",
      text: "Your account has been created successfully after email verification.",
      html: `<p>Assalamu alaikum ${user.name},</p><p>Your email has been verified and your account is now active. You can log in and start learning, Insha'Allah.</p>`,
    }).catch((emailError) => console.error("Error sending registration success email", emailError && emailError.message ? emailError.message : emailError));

    return res.json({ message: "Email verified successfully." });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Login via Google ID token
// Frontend should obtain idToken from Google Identity Services
// and POST { idToken } to /api/auth/google
exports.googleLogin = async (req, res) => {
  try {
    const { idToken, returnTo } = req.body || {};

    const safeReturnTo = isValidReturnTo(returnTo) ? returnTo : null;

    if (!idToken) {
      return res.status(400).json({ message: "idToken is required" });
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      return res
        .status(500)
        .json({ message: "Google login is not configured on the server" });
    }

    const client = new OAuth2Client(clientId);
    const ticket = await client.verifyIdToken({
      idToken,
      audience: clientId,
    });

    const payload = ticket.getPayload();
    const googleId = payload.sub;
    const email = payload.email;
    const name = payload.name || payload.given_name || "Student";

    if (!email || !googleId) {
      return res.status(400).json({ message: "Invalid Google token payload" });
    }

    // Try to find user by googleId first, then by email
    let user = await User.findOne({ googleId });
    if (!user) {
      user = await User.findOne({ email });
    }

    // If user doesn't exist, require explicit registration first
    if (!user) {
      return res.status(403).json({ registered: false });
    }

    // Link googleId if not set yet
    if (!user.googleId) {
      user.googleId = googleId;
    }

    // If email wasn't verified before, consider Google as verification and send welcome
    let sendWelcome = false;
    if (!user.emailVerified) {
      user.emailVerified = true;
      user.emailVerificationCode = undefined;
      user.emailVerificationExpires = undefined;
      sendWelcome = true;
    }

    await user.save();

    // Send registration success email if verification was just confirmed (fire-and-forget)
    if (sendWelcome) {
      sendEmail({
        to: user.email,
        subject: "Registration successful!",
        text: "Your account has been created successfully.",
        html: `<p>Assalamu alaikum ${user.name},</p><p>Your account has been created successfully and your email is verified. You can log in and start learning, Insha'Allah.</p>`,
      }).catch((emailError) => console.error("Error sending registration success email", emailError && emailError.message ? emailError.message : emailError));
    }

    const token = createToken(user);
    setAuthCookie(res, token);

    return res.json({
      user: formatUserResponse(user),
      token,
      returnTo: safeReturnTo,
    });
  } catch (error) {
    console.error("Google login error", error.message || error);
    return res.status(401).json({ message: "Google login failed" });
  }
};

// Logout - clear auth cookie
exports.logout = (req, res) => {
  try {
    res.clearCookie('token', { httpOnly: true, secure: isProd, sameSite: cookieSameSite, path: '/' });
    return res.json({ loggedOut: true });
  } catch (err) {
    console.error('Logout error', err.message || err);
    return res.status(500).json({ loggedOut: false });
  }
};

// Return current authenticated user (based on cookie or Bearer token)
exports.me = async (req, res) => {
  try {
    let token = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (!token) {
      return res.status(204).send();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) return res.status(204).send();

    return res.status(200).json({
      user: formatUserResponse(user),
    });
  } catch (err) {
    // If token is present but invalid/expired, respond 401 to force re-authentication on frontend.
    if (err && (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError')) {
      return res.status(401).json({ message: 'Not authorized: token invalid or expired' });
    }

    // For other errors, return a server error
    return res.status(500).json({ message: err.message || 'Server error' });
  }
};

// Register via Google ID token
// Frontend should obtain idToken from Google Identity Services
// and POST { idToken } to /api/auth/google/register
exports.googleRegister = async (req, res) => {
  try {
    const { idToken, returnTo } = req.body || {};

    const safeReturnTo = isValidReturnTo(returnTo) ? returnTo : null;

    if (!idToken) {
      return res.status(400).json({ message: "idToken is required" });
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      return res
        .status(500)
        .json({ message: "Google login is not configured on the server" });
    }

    const client = new OAuth2Client(clientId);
    const ticket = await client.verifyIdToken({
      idToken,
      audience: clientId,
    });

    const payload = ticket.getPayload();
    const googleId = payload.sub;
    const email = payload.email;
    const name = payload.name || payload.given_name || "Student";

    if (!email || !googleId) {
      return res.status(400).json({ message: "Invalid Google token payload" });
    }

    // If account already exists, don't create a duplicate
    let existing = await User.findOne({ $or: [{ googleId }, { email }] });
    if (existing) {
      return res.status(409).json({ registered: true });
    }

    const randomPassword = crypto.randomBytes(32).toString("hex");
    const hashedPassword = await bcrypt.hash(randomPassword, 10);

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      googleId,
      role: "student",
      emailVerified: true,
    });

    // send registration success email (fire-and-forget)
    sendEmail({
      to: user.email,
      subject: "Registration successful!",
      text: "Your account has been created successfully.",
      html: `<p>Assalamu alaikum ${user.name},</p><p>Your account has been created successfully and your email is verified. You can log in and start learning, Insha'Allah.</p>`,
    }).catch((emailError) => console.error("Error sending registration success email", emailError && emailError.message ? emailError.message : emailError));

    const token = createToken(user);
    setAuthCookie(res, token);

    return res.status(201).json({
      user: formatUserResponse(user),
      token,
      returnTo: safeReturnTo,
    });
  } catch (error) {
    console.error("Google register error", error.message || error);
    return res.status(400).json({ message: "Google register failed" });
  }
};
