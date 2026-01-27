const mongoose = require("mongoose");

const teacherSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    // e.g. "Islamic Teacher", "Hifz Instructor" (designation/ability)
    designation: { type: String, required: true, trim: true },
    // human readable experience (can be bullets separated by newlines)
    professionalExperience: { type: String, required: true, trim: true },
    // e.g. ["Bangla", "Arabic", "Urdu", "English"]
    languageExpertise: {
      type: [{ type: String, trim: true }],
      required: true,
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length > 0,
        message: "At least one language is required",
      },
    },
    photoUrl: { type: String, trim: true },
    cvUrl: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    socials: {
      facebook: { type: String, trim: true },
      youtube: { type: String, trim: true },
      website: { type: String, trim: true },
    },
    // Link to User account (for teacher login)
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", sparse: true, unique: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Teacher", teacherSchema);
