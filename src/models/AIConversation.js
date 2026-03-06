const mongoose = require("mongoose");

const aiConversationSchema = new mongoose.Schema(
  {
    // Map to user (student or teacher)
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Lab context (optional but useful for analytics)
    lab: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lab",
      default: null,
    },

    // Course context (optional)
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      default: null,
    },

    // Type of AI tool used
    toolType: {
      type: String,
      enum: [
        "chat",           // general chat
        "document_analysis",  // research paper analysis
        "code_explanation",   // explain code/data
        "idea_generation",    // research ideas
        "tutoring",           // concept explanation
        "text_review",        // feedback on writing
      ],
      required: true,
      index: true,
    },

    // Full conversation history (array of messages)
    conversation: [
      {
        role: { type: String, enum: ["user", "assistant"], required: true },
        content: { type: String, required: true },
        timestamp: { type: Date, default: Date.now },
      },
    ],

    // Title/summary of conversation
    title: { type: String, trim: true, default: null },

    // Token usage for cost tracking
    totalTokensUsed: { type: Number, default: 0 },
    estimatedCost: { type: Number, default: 0, min: 0 }, // in USD

    // Whether user saved/starred this conversation
    isSaved: { type: Boolean, default: false },

    // Status
    status: {
      type: String,
      enum: ["active", "archived", "deleted"],
      default: "active",
      index: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AIConversation", aiConversationSchema);
