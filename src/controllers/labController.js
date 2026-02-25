const Lab = require("../models/Lab");
const Teacher = require("../models/Teacher");

// ─── Admin: Create a lab ────────────────────────────────────────────────────
exports.createLab = async (req, res) => {
  try {
    const { name, description, monthlyFee, currency, maxMembers } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Lab name is required" });
    }

    const lab = await Lab.create({
      name,
      description,
      monthlyFee,
      currency,
      maxMembers: maxMembers || null,
    });

    res.status(201).json(lab);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── Public: Get all labs ───────────────────────────────────────────────────
exports.getLabs = async (req, res) => {
  try {
    const filter = {};
    // Non-admins only see active labs
    if (!req.user || req.user.role !== "admin") {
      filter.isActive = true;
    }

    const labs = await Lab.find(filter)
      .populate("labHead", "name designation photoUrl")
      .populate("moderators", "name designation photoUrl")
      .sort({ createdAt: -1 });

    res.json(labs);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── Public: Get single lab ─────────────────────────────────────────────────
exports.getLabById = async (req, res) => {
  try {
    const lab = await Lab.findById(req.params.id)
      .populate("labHead", "name designation photoUrl email socials")
      .populate("moderators", "name designation photoUrl email socials");

    if (!lab) {
      return res.status(404).json({ message: "Lab not found" });
    }

    // Non-admins cannot see inactive labs
    if (!lab.isActive && (!req.user || req.user.role !== "admin")) {
      return res.status(404).json({ message: "Lab not found" });
    }

    res.json(lab);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── Admin: Update lab details ──────────────────────────────────────────────
exports.updateLab = async (req, res) => {
  try {
    const allowedFields = [
      "name",
      "description",
      "monthlyFee",
      "currency",
      "maxMembers",
      "isActive",
    ];

    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    const lab = await Lab.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    })
      .populate("labHead", "name designation photoUrl")
      .populate("moderators", "name designation photoUrl");

    if (!lab) {
      return res.status(404).json({ message: "Lab not found" });
    }

    res.json(lab);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── Admin: Delete a lab ────────────────────────────────────────────────────
exports.deleteLab = async (req, res) => {
  try {
    const lab = await Lab.findByIdAndDelete(req.params.id);
    if (!lab) {
      return res.status(404).json({ message: "Lab not found" });
    }
    res.json({ message: "Lab deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── Admin: Assign or replace the lab head ─────────────────────────────────
// PATCH /api/labs/:id/lab-head
// Body: { teacherId }  — pass null to remove the lab head
exports.assignLabHead = async (req, res) => {
  try {
    const { teacherId } = req.body;

    if (teacherId) {
      const teacher = await Teacher.findById(teacherId);
      if (!teacher) {
        return res.status(404).json({ message: "Teacher not found" });
      }
    }

    const lab = await Lab.findByIdAndUpdate(
      req.params.id,
      { labHead: teacherId || null },
      { new: true, runValidators: true }
    )
      .populate("labHead", "name designation photoUrl")
      .populate("moderators", "name designation photoUrl");

    if (!lab) {
      return res.status(404).json({ message: "Lab not found" });
    }

    res.json(lab);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── Admin: Set moderators list ─────────────────────────────────────────────
// PATCH /api/labs/:id/moderators
// Body: { teacherIds: ["id1", "id2", ...] }
exports.assignModerators = async (req, res) => {
  try {
    const { teacherIds } = req.body;

    if (!Array.isArray(teacherIds)) {
      return res.status(400).json({ message: "teacherIds must be an array" });
    }

    // Validate all ids exist
    if (teacherIds.length > 0) {
      const found = await Teacher.find({ _id: { $in: teacherIds } }).select("_id");
      if (found.length !== teacherIds.length) {
        return res
          .status(404)
          .json({ message: "One or more teachers not found" });
      }
    }

    const lab = await Lab.findByIdAndUpdate(
      req.params.id,
      { moderators: teacherIds },
      { new: true, runValidators: true }
    )
      .populate("labHead", "name designation photoUrl")
      .populate("moderators", "name designation photoUrl");

    if (!lab) {
      return res.status(404).json({ message: "Lab not found" });
    }

    res.json(lab);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── Admin: Upload/replace lab thumbnail ───────────────────────────────────
// POST /api/labs/:id/thumbnail  (multipart, field: "thumbnail")
exports.uploadLabThumbnail = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const lab = await Lab.findByIdAndUpdate(
      req.params.id,
      { thumbnailUrl: req.file.path },
      { new: true }
    );

    if (!lab) {
      return res.status(404).json({ message: "Lab not found" });
    }

    res.json({ thumbnailUrl: lab.thumbnailUrl, lab });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
