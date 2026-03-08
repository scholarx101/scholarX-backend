const express = require("express");
const router = express.Router();
const aiToolsController = require("../controllers/aiToolsController");
const { protect, requireRole, optionalAuth } = require("../middlewares/authMiddleware");

// ─── Public: see available tools for a lab (no access check) ─────────────────
// GET /api/ai-tools/labs/:labId/tools
router.get("/labs/:labId/tools", optionalAuth, aiToolsController.listLabTools);

// ─── Student/Teacher: AI Tools (requires active lab subscription) ─────────────

// General chat
// POST /api/ai-tools/chat
router.post("/chat", protect, aiToolsController.chat);

// Document analysis
// POST /api/ai-tools/analyze-document
router.post("/analyze-document", protect, aiToolsController.analyzeDocument);

// Code explanation
// POST /api/ai-tools/explain-code
router.post("/explain-code", protect, aiToolsController.explainCode);

// Generate research ideas
// POST /api/ai-tools/generate-ideas
router.post("/generate-ideas", protect, aiToolsController.generateIdeas);

// Tutoring / concept explanation
// POST /api/ai-tools/tutor
router.post("/tutor", protect, aiToolsController.tutor);

// Review text (lab report, proposal, etc)
// POST /api/ai-tools/review-text
router.post("/review-text", protect, aiToolsController.reviewText);

// Get my conversations
// GET /api/ai-tools/conversations?toolType=&labId=&status=
router.get("/conversations", protect, aiToolsController.getMyConversations);

// Get conversation details
// GET /api/ai-tools/conversations/:conversationId
router.get("/conversations/:conversationId", protect, aiToolsController.getConversation);

// Save/star conversation
// PATCH /api/ai-tools/conversations/:conversationId/save
router.patch("/conversations/:conversationId/save", protect, aiToolsController.saveConversation);

// Delete conversation
// DELETE /api/ai-tools/conversations/:conversationId
router.delete("/conversations/:conversationId", protect, aiToolsController.deleteConversation);

// ─── Admin ───────────────────────────────────────────────────────────────────

// AI usage statistics
// GET /api/ai-tools/admin/stats
router.get("/admin/stats", protect, requireRole("admin"), aiToolsController.getStats);

module.exports = router;
