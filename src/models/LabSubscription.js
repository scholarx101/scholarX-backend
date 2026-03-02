const mongoose = require("mongoose");

const labSubscriptionSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    lab: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lab",
      required: true,
    },
    // pending: submitted, waiting for admin approval
    // active:  approved and currently subscribed
    // cancelled: unsubscribed or rejected by admin
    status: {
      type: String,
      enum: ["pending", "active", "cancelled"],
      default: "pending",
      index: true,
    },
    // Tracks how many months the student has paid
    monthsPaid: { type: Number, default: 0, min: 0 },

    // Payment audit fields
    paymentProvider: { type: String, trim: true, default: "sslcommerz" },
    lastTransactionId: { type: String, trim: true, default: null },
    amountPaid: { type: Number, default: 0 },
    currency: { type: String, trim: true, default: null },

    subscribedAt: { type: Date, default: Date.now },
    cancelledAt: { type: Date },
  },
  { timestamps: true }
);

// A student can only have one active or pending subscription per lab at a time.
labSubscriptionSchema.index({ student: 1, lab: 1 }, { unique: true });

module.exports = mongoose.model("LabSubscription", labSubscriptionSchema);
