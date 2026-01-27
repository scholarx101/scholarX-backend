const express = require("express");
const router = express.Router();
const courseController = require("../controllers/courseController");
const { protect, requireRole, optionalAuth } = require("../middlewares/authMiddleware");
const { upload, uploadImage } = require("../middlewares/uploadMiddleware");

// Courses CRUD
router.post("/", protect, requireRole("admin"), courseController.createCourse); // create course
router.get("/", optionalAuth, courseController.getCourses); // get all courses (public, but can enrich for admins)
router.get("/:id", optionalAuth, courseController.getCourseById); // get single course (public, but can enrich for enrolled users)
router.patch("/:id", protect, requireRole("admin"), courseController.updateCourse); // update course
router.delete("/:id", protect, requireRole("admin"), courseController.deleteCourse); // delete course

// Course thumbnail upload (admin)
router.post(
	"/:id/thumbnail",
	protect,
	requireRole("admin"),
	uploadImage.single("thumbnail"),
	courseController.uploadCourseThumbnail
);

// Lessons within a course
router.post("/:id/lessons", protect, requireRole("admin"), courseController.addLesson); // add lesson
router.patch("/:id/lessons/:lessonId", protect, requireRole("admin"), courseController.updateLesson); // update lesson
router.delete("/:id/lessons/:lessonId", protect, requireRole("admin"), courseController.deleteLesson); // delete lesson

// Lesson file uploads (admin)
router.post(
	"/:id/lessons/:lessonId/video",
	protect,
	requireRole("admin"),
	upload.single("video"),
	courseController.uploadLessonVideo
);

router.post(
	"/:id/lessons/:lessonId/pdfs",
	protect,
	requireRole("admin"),
	upload.array("pdfs"),
	courseController.uploadLessonPdfs
);

// Shared lesson materials for all batches (pdf/image/ppt/etc)
router.post(
	"/:id/lessons/:lessonId/materials",
	protect,
	requireRole("admin"),
	upload.array("materials"),
	courseController.uploadLessonMaterials
);

// Batch-specific live class links/recordings
router.patch(
	"/:id/lessons/:lessonId/batches/:batchId/meeting-link",
	protect,
	requireRole("admin"),
	courseController.setLessonBatchMeetingLink
);

router.post(
	"/:id/lessons/:lessonId/batches/:batchId/recording",
	protect,
	requireRole("admin"),
	upload.single("recording"),
	courseController.uploadLessonBatchRecording
);

module.exports = router;
