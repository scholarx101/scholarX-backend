const mongoose = require("mongoose");

const lessonSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    // VPS URLs or paths for video and PDFs
    // Not required on initial lesson creation; set after upload
    videoUrl: { type: String },
    pdfUrls: [{ type: String }],
    // shared materials for all batches (pdf/image/ppt/etc)
    materialUrls: [{ type: String }],

    // live-class meeting/recording info per batch (batchId refers to course.live.batches._id)
    liveBatchLinks: [
      {
        batchId: { type: mongoose.Schema.Types.ObjectId, required: true },
        meetingUrl: { type: String, trim: true },
        recordingUrl: { type: String, trim: true },
      },
    ],
    // order of the lesson within the course
    order: { type: Number, required: true },
    // optional: estimated duration in minutes
    durationMinutes: { type: Number },
    isPublished: { type: Boolean, default: true },
    // module system fields
    moduleNumber: { type: Number },
    moduleTitle: { type: String, trim: true },
    moduleInstructor: { type: String, trim: true },
    lessonDate: { type: String, trim: true },
  },
  { _id: true, timestamps: true }
);

const courseSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["recorded", "live"],
      default: "recorded",
      index: true,
    },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    thumbnailUrl: { type: String, trim: true },

    // Optional: overall course start date (used for monthly access gating)
    // For live courses, you can still use live.startDate; this is a generic fallback.
    startsAt: { type: Date },

    // Pricing system:
    // - admissionFee: mandatory base fee
    // - monthlyFee: installment fee per month for regular plan
    // - comboFee: discounted full payment (includes admission)
    // - durationMonths: total months for the course (for display / validation)
    pricing: {
      admissionFee: { type: Number, min: 0 },
      monthlyFee: { type: Number, min: 0 },
      // Semester support: fee per semester and semester length in months
      semesterFee: { type: Number, min: 0 },
      semesterDurationMonths: { type: Number, min: 1 },
      comboFee: { type: Number, min: 0 },
      durationMonths: { type: Number, min: 1 },
      currency: { type: String, trim: true },
    },
    // e.g. "3 months", "12 weeks" (admin-entered display value)
    duration: { type: String, trim: true },
    // weekly classes count (admin-entered)
    daysPerWeek: { type: Number, min: 1, max: 7 },
    // for example: "quran", "aqeedah", etc.
    category: { type: String, trim: true },
    // you can have only two initial courses but this keeps it flexible
    level: { type: String, trim: true },
    // preferred: multiple teachers per course
    teachers: [{ type: mongoose.Schema.Types.ObjectId, ref: "Teacher" }],
    live: {
      // overall live start date (for card/details display)
      startDate: { type: Date },
      batches: [
        {
          title: { type: String, trim: true },
          time: { type: String, trim: true },
          capacity: { type: Number, min: 1 },
          isActive: { type: Boolean, default: true },
        },
      ],
      isEnrollmentOpen: { type: Boolean, default: true },
    },
    isPublished: { type: Boolean, default: false },
    // embedded lessons that admin can add one by one
    lessons: [lessonSchema],
  },
  { timestamps: true }
);

// Validation: require `pricing` to contain at least one recognizable fee
courseSchema.pre('validate', async function() {
  const p = this.pricing || {};
  const hasPricing =
    p.comboFee !== undefined ||
    p.admissionFee !== undefined ||
    p.monthlyFee !== undefined ||
    p.semesterFee !== undefined;

  if (!hasPricing) {
    this.invalidate('pricing', 'Course pricing is required');
  }
});

module.exports = mongoose.model('Course', courseSchema);
