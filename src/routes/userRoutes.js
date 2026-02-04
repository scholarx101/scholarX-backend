const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const { protect, requireRole } = require("../middlewares/authMiddleware");

// Admin: get all users
router.get("/", protect, requireRole("admin"), userController.getAllUsers);

// Admin: get a single user
router.get("/:id", protect, requireRole("admin"), userController.getUserById);

// Admin: update a user's basic info
router.patch("/:id", protect, requireRole("admin"), userController.updateUser);

// Admin: delete a user
router.delete("/:id", protect, requireRole("admin"), userController.deleteUser);

// Admin: reset user password
router.post("/:id/reset-password", protect, requireRole("admin"), userController.resetUserPassword);

module.exports = router;