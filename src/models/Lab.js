const mongoose = require("mongoose");

const labSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    thumbnailUrl: { type: String, trim: true },

    // Roles assigned from available teachers
    labHead: { type: mongoose.Schema.Types.ObjectId, ref: "Teacher", default: null },
    moderators: [{ type: mongoose.Schema.Types.ObjectId, ref: "Teacher" }],

    // Monthly subscription pricing (payment gateway integration deferred)
    monthlyFee: { type: Number, min: 0, default: 0 },
    currency: { type: String, trim: true, default: "USD" },

    // Max capacity: null means unlimited
    maxMembers: { type: Number, min: 1, default: null },

    // AI tools enabled for this lab (admin picks from the known tool list)
    enabledAiTools: {
      type: [{
        type: String,
        enum: ["chat", "document_analysis", "code_explanation", "idea_generation", "tutoring", "text_review"],
      }],
      default: [],
    },

    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Lab", labSchema);
