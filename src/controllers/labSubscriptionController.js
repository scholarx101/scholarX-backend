const LabSubscription = require("../models/LabSubscription");
const Lab = require("../models/Lab");

// ─── Student: Subscribe to a lab ───────────────────────────────────────────
// POST /api/lab-subscriptions
// Body: { labId }
exports.subscribe = async (req, res) => {
  try {
    const { labId } = req.body;
    const studentId = req.user.id;

    if (!labId) {
      return res.status(400).json({ message: "labId is required" });
    }

    const lab = await Lab.findById(labId);
    if (!lab || !lab.isActive) {
      return res.status(404).json({ message: "Lab not found or inactive" });
    }

    // Check for existing subscription (unique index: student + lab)
    const existing = await LabSubscription.findOne({
      student: studentId,
      lab: labId,
    });

    if (existing) {
      if (existing.status === "active") {
        return res.status(409).json({ message: "You are already subscribed to this lab" });
      }
      if (existing.status === "pending") {
        return res.status(409).json({ message: "Your subscription request is already pending" });
      }
      // Re-subscribe if previously cancelled
      existing.status = "pending";
      existing.cancelledAt = undefined;
      existing.subscribedAt = new Date();
      await existing.save();
      return res.status(200).json({ message: "Re-subscription request submitted", subscription: existing });
    }

    // Check max capacity
    if (lab.maxMembers) {
      const activeCount = await LabSubscription.countDocuments({
        lab: labId,
        status: "active",
      });
      if (activeCount >= lab.maxMembers) {
        return res.status(409).json({ message: "This lab has reached its maximum member capacity" });
      }
    }

    const subscription = await LabSubscription.create({
      student: studentId,
      lab: labId,
    });

    res.status(201).json({ message: "Subscription request submitted", subscription });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── Student: Get my lab subscriptions ─────────────────────────────────────
// GET /api/lab-subscriptions/me
exports.getMySubscriptions = async (req, res) => {
  try {
    const subs = await LabSubscription.find({ student: req.user.id })
      .populate("lab", "name description thumbnailUrl monthlyFee currency labHead moderators isActive")
      .sort({ createdAt: -1 });

    res.json(subs);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── Student / Admin: Cancel a subscription ────────────────────────────────
// PATCH /api/lab-subscriptions/:id/cancel
exports.cancelSubscription = async (req, res) => {
  try {
    const sub = await LabSubscription.findById(req.params.id);
    if (!sub) {
      return res.status(404).json({ message: "Subscription not found" });
    }

    const isAdmin = req.user.role === "admin";
    const isOwner = sub.student.toString() === req.user.id;

    if (!isAdmin && !isOwner) {
      return res.status(403).json({ message: "Forbidden" });
    }

    if (sub.status === "cancelled") {
      return res.status(400).json({ message: "Subscription is already cancelled" });
    }

    sub.status = "cancelled";
    sub.cancelledAt = new Date();
    await sub.save();

    res.json({ message: "Subscription cancelled", subscription: sub });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── Admin: Get all subscriptions for a specific lab ───────────────────────
// GET /api/lab-subscriptions/lab/:labId
exports.getLabSubscriptions = async (req, res) => {
  try {
    const { labId } = req.params;
    const { status } = req.query; // optional filter: ?status=pending|active|cancelled

    const filter = { lab: labId };
    if (status) filter.status = status;

    const subs = await LabSubscription.find(filter)
      .populate("student", "name email phone")
      .sort({ createdAt: -1 });

    res.json(subs);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── Admin: Update subscription status ─────────────────────────────────────
// PATCH /api/lab-subscriptions/:id/status
// Body: { status: "active" | "pending" | "cancelled" }
exports.updateSubscriptionStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ["pending", "active", "cancelled"];

    if (!allowed.includes(status)) {
      return res.status(400).json({ message: `Status must be one of: ${allowed.join(", ")}` });
    }

    const sub = await LabSubscription.findByIdAndUpdate(
      req.params.id,
      {
        status,
        ...(status === "cancelled" ? { cancelledAt: new Date() } : {}),
      },
      { new: true, runValidators: true }
    ).populate("student", "name email").populate("lab", "name");

    if (!sub) {
      return res.status(404).json({ message: "Subscription not found" });
    }

    res.json(sub);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── Admin: Get all subscriptions (all labs) ───────────────────────────────
// GET /api/lab-subscriptions
exports.getAllSubscriptions = async (req, res) => {
  try {
    const { status, labId } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (labId) filter.lab = labId;

    const subs = await LabSubscription.find(filter)
      .populate("student", "name email phone")
      .populate("lab", "name monthlyFee currency")
      .sort({ createdAt: -1 });

    res.json(subs);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
