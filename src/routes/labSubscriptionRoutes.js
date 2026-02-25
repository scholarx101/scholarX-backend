const express = require("express");
const router = express.Router();
const labSubController = require("../controllers/labSubscriptionController");
const { protect, requireRole } = require("../middlewares/authMiddleware");

// ─── Student routes ───────────────────────────────────────────────────────────

// Subscribe to a lab
// POST /api/lab-subscriptions  — body: { labId }
router.post("/", protect, labSubController.subscribe);

// Get current user's subscriptions
// GET /api/lab-subscriptions/me
router.get("/me", protect, labSubController.getMySubscriptions);

// Cancel own subscription (students can cancel their own; admin can cancel any)
// PATCH /api/lab-subscriptions/:id/cancel
router.patch("/:id/cancel", protect, labSubController.cancelSubscription);

// ─── Admin routes ─────────────────────────────────────────────────────────────

// Get all subscriptions (optional filter: ?status=&labId=)
// GET /api/lab-subscriptions
router.get("/", protect, requireRole("admin"), labSubController.getAllSubscriptions);

// Get all subscriptions for a specific lab (optional filter: ?status=)
// GET /api/lab-subscriptions/lab/:labId
router.get("/lab/:labId", protect, requireRole("admin"), labSubController.getLabSubscriptions);

// Update subscription status (approve / reject / cancel)
// PATCH /api/lab-subscriptions/:id/status  — body: { status }
router.patch("/:id/status", protect, requireRole("admin"), labSubController.updateSubscriptionStatus);

module.exports = router;
