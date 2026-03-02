const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    // "course" = course enrollment payment, "lab" = lab subscription payment
    type: {
      type: String,
      enum: ["course", "lab"],
      required: true,
      index: true,
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // populated based on type
    course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", default: null },
    lab: { type: mongoose.Schema.Types.ObjectId, ref: "Lab", default: null },

    // The enrollment/subscription created at init time (status = pending until paid)
    enrollment: { type: mongoose.Schema.Types.ObjectId, ref: "Enrollment", default: null },
    labSubscription: { type: mongoose.Schema.Types.ObjectId, ref: "LabSubscription", default: null },

    // Unique transaction ID we generate and send to SSLCommerz
    tranId: { type: String, required: true, unique: true, index: true },

    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, trim: true, default: "BDT" },

    // Course-specific: which plan this payment covers
    paymentPlan: {
      type: String,
      enum: ["combo", "monthly", "semester"],
      default: null,
    },
    // For monthly/semester plans: how many months/semesters this payment covers
    unitsCount: { type: Number, min: 1, default: 1 },

    // Whether this payment also covers the admission fee
    includesAdmissionFee: { type: Boolean, default: false },

    status: {
      type: String,
      enum: ["pending", "completed", "failed", "cancelled"],
      default: "pending",
      index: true,
    },

    // SSLCommerz validation response fields
    valId: { type: String, default: null },
    sslResponse: { type: mongoose.Schema.Types.Mixed, default: null },

    // Timestamps for state transitions
    paidAt: { type: Date, default: null },
    failedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Payment", paymentSchema);
