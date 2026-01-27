const mongoose = require("mongoose");

const enrollmentSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
    },
    // For live courses: which batch the student belongs to (course.live.batches._id)
    batchId: {
      type: mongoose.Schema.Types.ObjectId,
    },
    status: {
      type: String,
      enum: ["pending", "active", "completed", "cancelled"],
      default: "active",
    },
    // track which lessons in the course this student has completed
    completedLessons: [
      {
        type: mongoose.Schema.Types.ObjectId,
      },
    ],
    // Module-based progress tracking (for multi-teacher courses)
    moduleProgress: [
      {
        moduleNumber: { type: Number, required: true },
        completedLessons: [{ type: mongoose.Schema.Types.ObjectId }],
        completedAt: { type: Date },
      },
    ],
    purchasedAt: {
      type: Date,
      default: Date.now,
    },

    // New pricing/payment plan fields
    paymentPlan: {
      type: String,
      enum: ["combo", "monthly", "semester"],
      default: "combo",
      index: true,
    },
    admissionFeePaid: {
      type: Boolean,
      default: false,
    },
    monthsPaid: {
      type: Number,
      default: 0,
      min: 0,
    },
    // For semester plan: how many semesters the student has paid for
    semestersPaid: {
      type: Number,
      default: 0,
      min: 0,
    },
    isFullyPaid: {
      type: Boolean,
      default: false,
    },

    // Payment audit fields (useful for admin reporting)
    paymentProvider: {
      type: String,
      trim: true,
    },
    transactionId: {
      type: String,
      trim: true,
    },
    invoiceId: {
      type: String,
      trim: true,
    },
    amountPaid: {
      type: String,
      trim: true,
    },
    currency: {
      type: String,
      trim: true,
    },
    expiresAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

// A student should only have one enrollment per course
enrollmentSchema.index({ student: 1, course: 1 }, { unique: true });

module.exports = mongoose.model("Enrollment", enrollmentSchema);
