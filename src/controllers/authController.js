const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { OAuth2Client } = require("google-auth-library");
const User = require("../models/User");
const { sendOtpEmail, sendRegistrationSuccessEmail } = require("../utils/emailTemplates");

// Minimal user formatter used in responses (keeps payload small & stable)
function formatUserResponse(user) {
  if (!user) return null;
  return {
    id: user._id || user.id,
    name: user.name || undefined,
    email: user.email || undefined,
    role: user.role || 'student',
  };
}

// JWT Token Configuration
// Access Token: Short-lived (15 minutes) for API authentication
const ACCESS_TOKEN_EXPIRES = '15m';
// Refresh Token: Long-lived (7 days) for getting new access tokens
const REFRESH_TOKEN_EXPIRES = '1d';

// Centralized cookie options (see src/utils/cookieOptions.js)
const {
  getAuthCookieOptions,
  getRefreshCookieOptions,
  getClearAuthCookieOptions,
  getClearRefreshCookieOptions,
} = require("../utils/cookieOptions");

// Helper: Set auth cookie (for access token)
function setAuthCookie(res, token) {
  try {
    res.cookie('accessToken', token, getAuthCookieOptions());
  } catch (err) {
    console.error('Failed to set auth cookie', err.message || err);
  }
}

// Helper: Set refresh token cookie
function setRefreshCookie(res, token) {
  try {
    res.cookie('refreshToken', token, getRefreshCookieOptions());
  } catch (err) {
    console.error('Failed to set refresh cookie', err.message || err);
  }
}

// Helper: Create access token (short-lived)
function createAccessToken(user) {
  const payload = {
    id: user._id,
    role: user.role,
    type: 'access'
  };
  const secret = process.env.JWT_SECRET;
  return jwt.sign(payload, secret, { expiresIn: ACCESS_TOKEN_EXPIRES });
}

// Helper: Create refresh token (long-lived)
function createRefreshToken(user) {
  const payload = {
    id: user._id,
    type: 'refresh'
  };
  const secret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;
  return jwt.sign(payload, secret, { expiresIn: REFRESH_TOKEN_EXPIRES });
}

// validate returnTo path (only allow internal relative paths starting with '/')
function isValidReturnTo(path) {
  if (!path || typeof path !== 'string') return false;
  // disallow protocol or double-slash at start
  if (path.startsWith('//')) return false;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(path)) return false; // protocols like http:
  return path.startsWith('/');
}

// Helper: Send OTP verification email
function sendOtpEmailHelper(email, name, otp) {
  return sendOtpEmail(email, name, otp);
}

// Helper: Send registration success/welcome email (reusable for both manual and Google registration)
function sendRegistrationSuccessEmailHelper(email, name) {
  return sendRegistrationSuccessEmail(email, name);
}

// Helper: Create and store tokens for a user
async function createAndStoreTokens(user) {
  const accessToken = createAccessToken(user);
  const refreshToken = createRefreshToken(user);
  
  // Store refresh token in database
  user.refreshToken = refreshToken;
  user.refreshTokenExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  await user.save();
  
  return { accessToken, refreshToken };
}

// Helper: Set both auth cookies and return token response
function sendTokenResponse(res, user, accessToken, refreshToken, statusCode = 200, returnTo = null) {
  setAuthCookie(res, accessToken);
  setRefreshCookie(res, refreshToken);
  
  const response = {
    user: formatUserResponse(user),
    accessToken,
    refreshToken,
  };
  
  if (returnTo) response.returnTo = returnTo;
  
  return res.status(statusCode).json(response);
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

    // Send OTP email (fire-and-forget)
    sendOtpEmailHelper(user.email, user.name, otp);

    // Create tokens and send response
    const { accessToken, refreshToken } = await createAndStoreTokens(user);
    sendTokenResponse(res, user, accessToken, refreshToken, 201);
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
      return res.status(404).json({ message: "You are not registered. Please register first.", registered: false });
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

    // Create tokens and send response
    const { accessToken, refreshToken } = await createAndStoreTokens(user);
    sendTokenResponse(res, user, accessToken, refreshToken);
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
    
    // Send registration success email (fire-and-forget)
    sendRegistrationSuccessEmailHelper(user.email, user.name);

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
      sendRegistrationSuccessEmailHelper(user.email, user.name);
    }

    // Create tokens and send response
    const { accessToken, refreshToken } = await createAndStoreTokens(user);
    return sendTokenResponse(res, user, accessToken, refreshToken, 200, safeReturnTo);
  } catch (error) {
    console.error("Google login error", error.message || error);
    return res.status(401).json({ message: "Google login failed" });
  }
};

// Refresh access token using refresh token
exports.refreshToken = async (req, res) => {
  try {
    let refreshToken = null;

    // Get refresh token from cookie or body
    if (req.cookies && req.cookies.refreshToken) {
      refreshToken = req.cookies.refreshToken;
    } else if (req.body.refreshToken) {
      refreshToken = req.body.refreshToken;
    }

    if (!refreshToken) {
      return res.status(401).json({ message: "Refresh token required" });
    }

    // Verify refresh token
    const secret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;
    const decoded = jwt.verify(refreshToken, secret);

    if (decoded.type !== 'refresh') {
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    // Find user and check if refresh token matches
    const user = await User.findById(decoded.id).select('+refreshToken');
    if (!user || user.refreshToken !== refreshToken) {
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    // Check if refresh token is expired
    if (user.refreshTokenExpires < new Date()) {
      // Clear expired refresh token
      user.refreshToken = undefined;
      user.refreshTokenExpires = undefined;
      await user.save();
      return res.status(401).json({ message: "Refresh token expired" });
    }

    // Create new access token
    const newAccessToken = createAccessToken(user);
    setAuthCookie(res, newAccessToken);

    res.json({
      accessToken: newAccessToken,
      user: formatUserResponse(user),
    });
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: "Refresh token expired" });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: "Invalid refresh token" });
    }
    res.status(500).json({ message: error.message });
  }
};

// Logout - clear auth cookies and refresh token
exports.logout = async (req, res) => {
  try {
    // Clear refresh token from database if user is logged in
    if (req.user && req.user.id) {
      await User.findByIdAndUpdate(req.user.id, {
        refreshToken: undefined,
        refreshTokenExpires: undefined
      });
    }

    // Clear cookies
    res.clearCookie('accessToken', getClearAuthCookieOptions());
    res.clearCookie('refreshToken', getClearRefreshCookieOptions());

    return res.json({ loggedOut: true });
  } catch (err) {
    console.error('Logout error', err.message || err);
    return res.status(500).json({ loggedOut: false });
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
    sendRegistrationSuccessEmailHelper(user.email, user.name);

    // Create tokens and send response
    const { accessToken, refreshToken } = await createAndStoreTokens(user);
    return sendTokenResponse(res, user, accessToken, refreshToken, 201, safeReturnTo);
  } catch (error) {
    console.error("Google register error", error.message || error);
    return res.status(400).json({ message: "Google register failed" });
  }
};

// Return current authenticated user (based on cookie or Bearer token)
exports.me = async (req, res) => {
  try {
    let token = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.cookies && req.cookies.accessToken) {
      token = req.cookies.accessToken;
    }

    if (!token) {
      return res.status(204).send();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.type !== 'access') {
      return res.status(401).json({ message: 'Invalid token type' });
    }

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
