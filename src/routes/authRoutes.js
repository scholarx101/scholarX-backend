const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");

// Public auth routes
router.post("/register", authController.register);
router.post("/login", authController.login);
router.post("/verify-email", authController.verifyEmail);
router.post("/google", authController.googleLogin);
router.post("/google/register", authController.googleRegister);
router.post("/refresh", authController.refreshToken);
router.post("/logout", authController.logout);
router.get("/me", authController.me);

module.exports = router;
