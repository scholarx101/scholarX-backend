const express = require("express");
const router = express.Router();

const teacherApplicationController = require("../controllers/teacherApplicationController");
const { protect, requireRole } = require("../middlewares/authMiddleware");
const { upload } = require("../middlewares/uploadMiddleware");

// Public: submit teacher application form
router.post(
  "/",
  upload.fields([
    { name: "photo", maxCount: 1 },
    { name: "cv", maxCount: 1 },
  ]),
  teacherApplicationController.submitTeacherApplication
);

// Admin: review and manage
router.get("/", protect, requireRole("admin"), teacherApplicationController.getTeacherApplications);
router.get(
  "/:id",
  protect,
  requireRole("admin"),
  teacherApplicationController.getTeacherApplicationById
);
router.patch(
  "/:id",
  protect,
  requireRole("admin"),
  teacherApplicationController.updateTeacherApplication
);
router.post(
  "/:id/approve",
  protect,
  requireRole("admin"),
  teacherApplicationController.approveTeacherApplication
);

module.exports = router;
