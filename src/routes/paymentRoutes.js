const express = require("express");
const router = express.Router();
const paymentController = require("../controllers/paymentController");
const { protect, requireRole } = require("../middlewares/authMiddleware");

// ─── Student: Initiate payments ───────────────────────────────────────────────

// Start a course enrollment payment
// POST /api/payments/course/init  — body: { courseId, paymentPlan, unitsCount?, batchId? }
router.post("/course/init", protect, paymentController.initCoursePayment);

// Start a lab monthly subscription payment
// POST /api/payments/lab/init  — body: { labId }
router.post("/lab/init", protect, paymentController.initLabPayment);

// ─── Student: Payment history ─────────────────────────────────────────────────

// GET /api/payments/me
router.get("/me", protect, paymentController.getMyPayments);

// GET /api/payments/transaction/:tranId
router.get("/transaction/:tranId", protect, paymentController.getPaymentByTranId);

// ─── SSLCommerz callbacks (no auth — called by browser redirect / SSLCommerz server) ──

// POST /api/payments/success
router.post("/success", paymentController.handleSuccess);

// POST /api/payments/fail
router.post("/fail", paymentController.handleFail);

// POST /api/payments/cancel
router.post("/cancel", paymentController.handleCancel);

// POST /api/payments/ipn  (IPN — server-to-server)
router.post("/ipn", paymentController.handleIPN);

// ─── Admin ────────────────────────────────────────────────────────────────────

// GET /api/payments?type=course|lab&status=pending|completed|failed|cancelled
router.get("/", protect, requireRole("admin"), paymentController.getAllPayments);

module.exports = router;
