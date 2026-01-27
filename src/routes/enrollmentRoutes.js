const express = require("express");
const router = express.Router();
const enrollmentController = require("../controllers/enrollmentController");
const { protect, requireRole } = require("../middlewares/authMiddleware");

// Student: get own enrollments
router.get("/my", protect, enrollmentController.getMyEnrollments);

// Student: mark a lesson as completed
router.post(
  "/:courseId/lessons/:lessonId/complete",
  protect,
  enrollmentController.markLessonCompleted
);

// Admin: get enrollments for a course
router.get(
  "/course/:courseId",
  protect,
  requireRole("admin"),
  enrollmentController.getEnrollmentsForCourse
);

// Admin: course enrollment summary (counts + revenue)
router.get(
  "/course/:courseId/summary",
  protect,
  requireRole("admin"),
  enrollmentController.getEnrollmentSummaryForCourse
);

// Admin: get all enrollments (audit)
router.get(
  "/",
  protect,
  requireRole("admin"),
  enrollmentController.getAllEnrollments
);

// Admin: update enrollment status (e.g., revoke by setting cancelled)
router.patch(
  "/:id/status",
  protect,
  requireRole("admin"),
  enrollmentController.updateEnrollmentStatus
);

module.exports = router;
