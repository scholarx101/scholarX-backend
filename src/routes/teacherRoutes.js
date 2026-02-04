const express = require("express");
const router = express.Router();

const teacherController = require("../controllers/teacherController");
const { protect, requireRole, optionalAuth } = require("../middlewares/authMiddleware");
const { uploadImage } = require("../middlewares/uploadMiddleware");

// Public list/get (useful for course detail pages)
router.get("/", optionalAuth, teacherController.getTeachers);
router.get("/:id", optionalAuth, teacherController.getTeacherById);

// Admin: update teacher photo (for approved teachers)
router.post(
  "/:id/photo",
  protect,
  requireRole("admin"),
  uploadImage.single("photo"),
  teacherController.uploadTeacherPhoto
);

// Teacher Dashboard Routes (for logged-in teachers)
router.get("/my/courses", protect, requireRole("teacher"), teacherController.getMyCourses);
router.get("/my/courses/:courseId/progress", protect, requireRole("teacher"), teacherController.getCourseStudentProgress);
router.get("/my/courses/:courseId/lessons", protect, requireRole("teacher"), teacherController.getMyLessons);

module.exports = router;
