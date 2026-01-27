const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 8,
      select: false,
    },
    // For social login (Google)
    googleId: {
      type: String,
      unique: true,
      sparse: true,
    },
    // Optional profile/contact fields used for payment billing info
    phone: { type: String, trim: true },
    addressLine1: { type: String, trim: true },
    addressLine2: { type: String, trim: true },
    city: { type: String, trim: true },
    country: { type: String, trim: true },
    role: {
      type: String,
      enum: ["admin", "student", "teacher"],
      default: "student",
      required: true,
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerificationCode: String,
    emailVerificationExpires: Date,
    // Refresh token for JWT authentication
    refreshToken: {
      type: String,
      select: false, // Don't include in queries by default
    },
    refreshTokenExpires: Date,
  },
  { timestamps: true }
);

// Automatically delete unverified users after emailVerificationExpires
// We set emailVerificationExpires to "now + 5 minutes" on register.
// When the user verifies, we unset this field, so verified users are not affected.
userSchema.index({ emailVerificationExpires: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("User", userSchema);