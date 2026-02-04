const User = require("../models/User");
const Enrollment = require("../models/Enrollment");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { sendPasswordResetEmail } = require("../utils/emailTemplates");

// Admin: get all users
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select("-password").sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Admin: get a single user
exports.getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json(user);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Admin: update a user's basic info
exports.updateUser = async (req, res) => {
  try {
    const { name, email, phone, addressLine1, addressLine2, city, country, role } = req.body;

    const updates = {};
    if (name !== undefined) updates.name = name;
    if (email !== undefined) updates.email = email;
    if (phone !== undefined) updates.phone = phone;
    if (addressLine1 !== undefined) updates.addressLine1 = addressLine1;
    if (addressLine2 !== undefined) updates.addressLine2 = addressLine2;
    if (city !== undefined) updates.city = city;
    if (country !== undefined) updates.country = country;
    if (role !== undefined) updates.role = role;

    const user = await User.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    }).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(user);
  } catch (error) {
    // Handle duplicate email
    if (error.code === 11000 && error.keyPattern && error.keyPattern.email) {
      return res.status(409).json({ message: "Email already in use" });
    }
    res.status(400).json({ message: error.message });
  }
};

// Admin: delete a user
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    // Prevent deleting your own admin account
    if (req.user && req.user.id === id) {
      return res.status(400).json({ message: "You cannot delete your own account" });
    }

    const user = await User.findById(id).select("role email name");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Safety: do not allow deleting other admins via this route
    if (user.role === "admin") {
      return res.status(403).json({ message: "Deleting admin accounts is not allowed" });
    }

    // Cascade: remove enrollments for this user
    await Enrollment.deleteMany({ student: id });

    await User.findByIdAndDelete(id);

    res.json({ message: "User deleted" });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Admin: reset user password (generates new temporary password and emails it)
exports.resetUserPassword = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Generate new temporary password
    const tempPassword = crypto.randomBytes(12).toString('hex');
    const hashedPassword = await bcrypt.hash(tempPassword, 12);

    // Update user password
    user.password = hashedPassword;
    await user.save();

    // Send email with new password
    await sendPasswordResetEmail(user.email, user.name, tempPassword);

    res.json({
      message: "Password reset successfully. New password sent to user's email.",
      emailSent: true
    });
  } catch (error) {
    console.error("Password reset error:", error);
    res.status(500).json({ message: "Failed to reset password" });
  }
};
