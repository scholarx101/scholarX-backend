const mongoose = require("mongoose");

const teacherApplicationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, required: true, trim: true },

    photoUrl: { type: String, required: false, trim: true },
    cvUrl: { type: String, trim: true },

    designation: { type: String, required: true, trim: true },
    professionalExperience: { type: String, required: true, trim: true },
    languageExpertise: {
      type: [{ type: String, trim: true }],
      required: true,
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length > 0,
        message: "At least one language is required",
      },
    },

    socials: {
      facebook: { type: String, trim: true },
      youtube: { type: String, trim: true },
      website: { type: String, trim: true },
    },

    message: { type: String, trim: true },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
    adminNote: { type: String, trim: true },

    // link once approved
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: "Teacher" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("TeacherApplication", teacherApplicationSchema);
