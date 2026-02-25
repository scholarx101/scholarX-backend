const express = require("express");
const router = express.Router();
const labController = require("../controllers/labController");
const { protect, requireRole, optionalAuth } = require("../middlewares/authMiddleware");
const { uploadImage } = require("../middlewares/uploadMiddleware");

// ─── Public / optional-auth ──────────────────────────────────────────────────
router.get("/", optionalAuth, labController.getLabs);              // list all labs
router.get("/:id", optionalAuth, labController.getLabById);        // get single lab

// ─── Admin only ──────────────────────────────────────────────────────────────
router.post("/", protect, requireRole("admin"), labController.createLab);             // create lab
router.patch("/:id", protect, requireRole("admin"), labController.updateLab);         // update lab details
router.delete("/:id", protect, requireRole("admin"), labController.deleteLab);        // delete lab

// Assign lab head (single teacher)
// PATCH /api/labs/:id/lab-head  — body: { teacherId }
router.patch(
  "/:id/lab-head",
  protect,
  requireRole("admin"),
  labController.assignLabHead
);

// Set moderators list
// PATCH /api/labs/:id/moderators  — body: { teacherIds: [...] }
router.patch(
  "/:id/moderators",
  protect,
  requireRole("admin"),
  labController.assignModerators
);

// Upload lab thumbnail
// POST /api/labs/:id/thumbnail  — multipart, field: "thumbnail"
router.post(
  "/:id/thumbnail",
  protect,
  requireRole("admin"),
  uploadImage.single("thumbnail"),
  labController.uploadLabThumbnail
);

module.exports = router;
