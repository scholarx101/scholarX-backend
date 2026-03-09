const AIConversation = require("../models/AIConversation");
const LabSubscription = require("../models/LabSubscription");
const Lab = require("../models/Lab");
const openrouterService = require("../utils/openrouterService");

// All recognized tool keys
const ALL_TOOLS = [
  "chat",
  "document_analysis",
  "code_explanation",
  "idea_generation",
  "tutoring",
  "text_review",
];

// ─── Access guard ─────────────────────────────────────────────────────────────
// Verifies:
//  1. labId is provided and the lab exists
//  2. toolType is enabled for that lab
//  3. The requesting user is admin OR has an active subscription to the lab
const checkLabToolAccess = async (userId, userRole, labId, toolType) => {
  if (!labId) {
    return { allowed: false, status: 400, message: "labId is required to use AI tools" };
  }

  const lab = await Lab.findById(labId).select("enabledAiTools isActive name");
  if (!lab || !lab.isActive) {
    return { allowed: false, status: 404, message: "Lab not found or inactive" };
  }

  if (!lab.enabledAiTools.includes(toolType)) {
    return {
      allowed: false,
      status: 403,
      message: `The tool "${toolType}" is not enabled for this lab`,
    };
  }

  // Admins bypass subscription check
  if (userRole === "admin") {
    return { allowed: true, lab };
  }

  const subscription = await LabSubscription.findOne({
    student: userId,
    lab: labId,
    status: "active",
  });

  if (!subscription) {
    return {
      allowed: false,
      status: 403,
      message: "You must have an active subscription to this lab to use its AI tools",
    };
  }

  return { allowed: true, lab };
};

// ─── Public: list enabled AI tools for a lab ──────────────────────────────────
// GET /api/ai-tools/labs/:labId/tools
exports.listLabTools = async (req, res) => {
  try {
    const lab = await Lab.findById(req.params.labId).select("name enabledAiTools isActive");
    if (!lab || !lab.isActive) {
      return res.status(404).json({ message: "Lab not found or inactive" });
    }

    const toolMeta = {
      chat: { label: "AI Chat", description: "General research assistant chat" },
      document_analysis: { label: "Document Analysis", description: "Summarize and analyze research papers" },
      code_explanation: { label: "Code Explanation", description: "Understand code and data scripts" },
      idea_generation: { label: "Research Idea Generator", description: "Generate innovative research ideas" },
      tutoring: { label: "AI Tutor", description: "Get concept explanations at your level" },
      text_review: { label: "Text Review", description: "Get feedback on reports, proposals, writing" },
    };

    const enabledList = Array.isArray(lab.enabledAiTools) ? lab.enabledAiTools : [];
    const tools = ALL_TOOLS.map((key) => ({
      key,
      ...toolMeta[key],
      enabled: enabledList.includes(key),
    }));

    res.json({ labId: lab._id, labName: lab.name, tools });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── General chat endpoint ────────────────────────────────────────────
// POST /api/ai-tools/chat
// Body: { message, conversationId?, labId, courseId? }
exports.chat = async (req, res) => {
  try {
    const { message, conversationId, labId, courseId } = req.body;
    const userId = req.user.id;

    if (!message || message.trim().length === 0) {
      return res.status(400).json({ message: "Message cannot be empty" });
    }
    if (message.length > 5000) {
      return res.status(400).json({ message: "Message too long (max 5000 chars)" });
    }

    const access = await checkLabToolAccess(userId, req.user.role, labId, "chat");
    if (!access.allowed) {
      return res.status(access.status).json({ message: access.message });
    }

    let conversation;

    // Find or create conversation
    if (conversationId) {
      conversation = await AIConversation.findById(conversationId);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      if (conversation.user.toString() !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }
    } else {
      conversation = await AIConversation.create({
        user: userId,
        lab: labId || null,
        course: courseId || null,
        toolType: "chat",
        title: message.substring(0, 50) + (message.length > 50 ? "..." : ""),
      });
    }

    // Build message history (limit to last 10 messages for context)
    const recentHistory = conversation.conversation.slice(-10).map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    // Call OpenRouter
    const aiResponse = await openrouterService.chat(message, recentHistory);

    if (!aiResponse.success) {
      return res.status(502).json({
        message: "AI service error",
        error: aiResponse.error,
      });
    }

    // Add user message
    conversation.conversation.push({
      role: "user",
      content: message,
      timestamp: new Date(),
    });

    // Add AI response
    conversation.conversation.push({
      role: "assistant",
      content: aiResponse.content,
      timestamp: new Date(),
    });

    // Track usage
    if (aiResponse.usage) {
      conversation.totalTokensUsed += (aiResponse.usage.total_tokens || 0);
      // Rough estimate: ~$0.0001 per 1000 tokens for cheap models
      conversation.estimatedCost = (conversation.totalTokensUsed / 1000) * 0.0001;
    }

    await conversation.save();

    res.json({
      conversationId: conversation._id,
      response: aiResponse.content,
      usage: aiResponse.usage,
      tokenCount: conversation.totalTokensUsed,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── Document analysis ───────────────────────────────────────────────────────
// POST /api/ai-tools/analyze-document
// Body: { documentText, analysisType: "summarize"|"keyfindings"|"methodology"|"critique", labId, courseId? }
exports.analyzeDocument = async (req, res) => {
  try {
    const { documentText, analysisType = "summarize", labId, courseId } = req.body;
    const userId = req.user.id;

    if (!documentText || documentText.trim().length === 0) {
      return res.status(400).json({ message: "Document cannot be empty" });
    }
    if (documentText.length > 20000) {
      return res.status(400).json({ message: "Document too long (max 20000 chars)" });
    }

    const access = await checkLabToolAccess(userId, req.user.role, labId, "document_analysis");
    if (!access.allowed) {
      return res.status(access.status).json({ message: access.message });
    }

    const conversation = await AIConversation.create({
      user: userId,
      lab: labId || null,
      course: courseId || null,
      toolType: "document_analysis",
      title: `Document Analysis: ${analysisType}`,
    });

    const aiResponse = await openrouterService.analyzeDocument(documentText, analysisType);

    if (!aiResponse.success) {
      return res.status(502).json({
        message: "AI service error",
        error: aiResponse.error,
      });
    }

    conversation.conversation.push({
      role: "user",
      content: `Analyze this document (${analysisType}): ${documentText.substring(0, 100)}...`,
    });

    conversation.conversation.push({
      role: "assistant",
      content: aiResponse.content,
    });

    if (aiResponse.usage) {
      conversation.totalTokensUsed = aiResponse.usage.total_tokens || 0;
      conversation.estimatedCost = (conversation.totalTokensUsed / 1000) * 0.0001;
    }

    await conversation.save();

    res.json({
      conversationId: conversation._id,
      analysis: aiResponse.content,
      analysisType,
      usage: aiResponse.usage,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── Code explanation ────────────────────────────────────────────────────────
// POST /api/ai-tools/explain-code
// Body: { code, language: "javascript"|"python"|..., labId, courseId? }
exports.explainCode = async (req, res) => {
  try {
    const { code, language = "javascript", labId, courseId } = req.body;
    const userId = req.user.id;

    if (!code || code.trim().length === 0) {
      return res.status(400).json({ message: "Code cannot be empty" });
    }
    if (code.length > 10000) {
      return res.status(400).json({ message: "Code too long (max 10000 chars)" });
    }

    const access = await checkLabToolAccess(userId, req.user.role, labId, "code_explanation");
    if (!access.allowed) {
      return res.status(access.status).json({ message: access.message });
    }

    const conversation = await AIConversation.create({
      user: userId,
      lab: labId || null,
      course: courseId || null,
      toolType: "code_explanation",
      title: `Code Explanation (${language})`,
    });

    const aiResponse = await openrouterService.explainCode(code, language);

    if (!aiResponse.success) {
      return res.status(502).json({
        message: "AI service error",
        error: aiResponse.error,
      });
    }

    conversation.conversation.push({
      role: "user",
      content: `Explain this ${language} code: ${code.substring(0, 100)}...`,
    });

    conversation.conversation.push({
      role: "assistant",
      content: aiResponse.content,
    });

    if (aiResponse.usage) {
      conversation.totalTokensUsed = aiResponse.usage.total_tokens || 0;
      conversation.estimatedCost = (conversation.totalTokensUsed / 1000) * 0.0001;
    }

    await conversation.save();

    res.json({
      conversationId: conversation._id,
      explanation: aiResponse.content,
      language,
      usage: aiResponse.usage,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── Generate research ideas ─────────────────────────────────────────────────
// POST /api/ai-tools/generate-ideas
// Body: { topic, context?, labId, courseId? }
exports.generateIdeas = async (req, res) => {
  try {
    const { topic, context = "", labId, courseId } = req.body;
    const userId = req.user.id;

    if (!topic || topic.trim().length === 0) {
      return res.status(400).json({ message: "Topic cannot be empty" });
    }

    const access = await checkLabToolAccess(userId, req.user.role, labId, "idea_generation");
    if (!access.allowed) {
      return res.status(access.status).json({ message: access.message });
    }

    const conversation = await AIConversation.create({
      user: userId,
      lab: labId || null,
      course: courseId || null,
      toolType: "idea_generation",
      title: `Research Ideas: ${topic}`,
    });

    const aiResponse = await openrouterService.generateIdeas(topic, context);

    if (!aiResponse.success) {
      return res.status(502).json({
        message: "AI service error",
        error: aiResponse.error,
      });
    }

    conversation.conversation.push({
      role: "user",
      content: `Generate research ideas for: ${topic}${context ? ` (${context})` : ""}`,
    });

    conversation.conversation.push({
      role: "assistant",
      content: aiResponse.content,
    });

    if (aiResponse.usage) {
      conversation.totalTokensUsed = aiResponse.usage.total_tokens || 0;
      conversation.estimatedCost = (conversation.totalTokensUsed / 1000) * 0.0001;
    }

    await conversation.save();

    res.json({
      conversationId: conversation._id,
      ideas: aiResponse.content,
      topic,
      usage: aiResponse.usage,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── Tutoring / Concept explanation ──────────────────────────────────────────
// POST /api/ai-tools/tutor
// Body: { concept, level: "beginner"|"intermediate"|"advanced", labId, courseId? }
exports.tutor = async (req, res) => {
  try {
    const { concept, level = "beginner", labId, courseId } = req.body;
    const userId = req.user.id;

    if (!concept || concept.trim().length === 0) {
      return res.status(400).json({ message: "Concept cannot be empty" });
    }

    const access = await checkLabToolAccess(userId, req.user.role, labId, "tutoring");
    if (!access.allowed) {
      return res.status(access.status).json({ message: access.message });
    }

    const conversation = await AIConversation.create({
      user: userId,
      lab: labId || null,
      course: courseId || null,
      toolType: "tutoring",
      title: `Tutoring: ${concept} (${level})`,
    });

    const aiResponse = await openrouterService.tutorExplain(concept, level);

    if (!aiResponse.success) {
      return res.status(502).json({
        message: "AI service error",
        error: aiResponse.error,
      });
    }

    conversation.conversation.push({
      role: "user",
      content: `Explain this concept (${level}): ${concept}`,
    });

    conversation.conversation.push({
      role: "assistant",
      content: aiResponse.content,
    });

    if (aiResponse.usage) {
      conversation.totalTokensUsed = aiResponse.usage.total_tokens || 0;
      conversation.estimatedCost = (conversation.totalTokensUsed / 1000) * 0.0001;
    }

    await conversation.save();

    res.json({
      conversationId: conversation._id,
      explanation: aiResponse.content,
      level,
      usage: aiResponse.usage,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── Review text ────────────────────────────────────────────────────────────
// POST /api/ai-tools/review-text
// Body: { text, reviewType: "academic"|"technical"|"proposal", labId, courseId? }
exports.reviewText = async (req, res) => {
  try {
    const { text, reviewType = "academic", labId, courseId } = req.body;
    const userId = req.user.id;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ message: "Text cannot be empty" });
    }
    if (text.length > 15000) {
      return res.status(400).json({ message: "Text too long (max 15000 chars)" });
    }

    const access = await checkLabToolAccess(userId, req.user.role, labId, "text_review");
    if (!access.allowed) {
      return res.status(access.status).json({ message: access.message });
    }

    const conversation = await AIConversation.create({
      user: userId,
      lab: labId || null,
      course: courseId || null,
      toolType: "text_review",
      title: `Text Review (${reviewType})`,
    });

    const aiResponse = await openrouterService.reviewText(text, reviewType);

    if (!aiResponse.success) {
      return res.status(502).json({
        message: "AI service error",
        error: aiResponse.error,
      });
    }

    conversation.conversation.push({
      role: "user",
      content: `Review this ${reviewType} text: ${text.substring(0, 100)}...`,
    });

    conversation.conversation.push({
      role: "assistant",
      content: aiResponse.content,
    });

    if (aiResponse.usage) {
      conversation.totalTokensUsed = aiResponse.usage.total_tokens || 0;
      conversation.estimatedCost = (conversation.totalTokensUsed / 1000) * 0.0001;
    }

    await conversation.save();

    res.json({
      conversationId: conversation._id,
      review: aiResponse.content,
      reviewType,
      usage: aiResponse.usage,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── Get my conversations ───────────────────────────────────────────────────
// GET /api/ai-tools/conversations?toolType=&labId=&status=
exports.getMyConversations = async (req, res) => {
  try {
    const filter = { user: req.user.id };
    if (req.query.toolType) filter.toolType = req.query.toolType;
    if (req.query.labId) filter.lab = req.query.labId;
    if (req.query.status) filter.status = req.query.status;

    const conversations = await AIConversation.find(filter)
      .populate("lab", "name")
      .populate("course", "title")
      .select("-conversation") // Don't include full history in list
      .sort({ createdAt: -1 });

    res.json(conversations);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── Get conversation details ───────────────────────────────────────────────
// GET /api/ai-tools/conversations/:conversationId
exports.getConversation = async (req, res) => {
  try {
    const conversation = await AIConversation.findById(req.params.conversationId)
      .populate("lab", "name")
      .populate("course", "title");

    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    if (conversation.user.toString() !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    res.json(conversation);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── Save/star conversation ─────────────────────────────────────────────────
// PATCH /api/ai-tools/conversations/:conversationId/save
exports.saveConversation = async (req, res) => {
  try {
    const conversation = await AIConversation.findById(req.params.conversationId);

    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    if (conversation.user.toString() !== req.user.id) {
      return res.status(403).json({ message: "Forbidden" });
    }

    conversation.isSaved = !conversation.isSaved;
    await conversation.save();

    res.json({
      message: conversation.isSaved ? "Saved" : "Unsaved",
      isSaved: conversation.isSaved,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── Delete conversation ────────────────────────────────────────────────────
// DELETE /api/ai-tools/conversations/:conversationId
exports.deleteConversation = async (req, res) => {
  try {
    const conversation = await AIConversation.findById(req.params.conversationId);

    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    if (conversation.user.toString() !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    conversation.status = "deleted";
    await conversation.save();

    res.json({ message: "Conversation deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── Admin: AI usage stats ───────────────────────────────────────────────────
// GET /api/ai-tools/admin/stats
exports.getStats = async (req, res) => {
  try {
    const stats = await AIConversation.aggregate([
      {
        $group: {
          _id: "$toolType",
          count: { $sum: 1 },
          totalTokens: { $sum: "$totalTokensUsed" },
          totalCost: { $sum: "$estimatedCost" },
        },
      },
    ]);

    const totalConversations = await AIConversation.countDocuments();
    const totalCost = stats.reduce((sum, s) => sum + s.totalCost, 0);

    res.json({
      totalConversations,
      totalTokensUsed: stats.reduce((sum, s) => sum + s.totalTokens, 0),
      totalEstimatedCost: totalCost,
      byToolType: stats,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
