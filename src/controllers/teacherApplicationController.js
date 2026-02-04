const TeacherApplication = require("../models/TeacherApplication");
const Teacher = require("../models/Teacher");
const User = require("../models/User");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { sendTeacherApprovalEmail } = require("../utils/emailTemplates");

// Public: submit application to become a teacher
exports.submitTeacherApplication = async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      designation,
      professionalExperience,
      languageExpertise,
      socials,
      message,
    } = req.body;

    let photoUrl;
    let cvUrl;

    // support multer single-file (`req.file`) and fields (`req.files`) forms
    if (req.file) {
      const fileName = path.basename(req.file.path);
      const ext = path.extname(req.file.path).toLowerCase();
      if (ext === ".pdf" || req.file.mimetype === "application/pdf") {
        cvUrl = "/uploads/" + fileName;
      } else {
        photoUrl = "/uploads/" + fileName;
      }
    } else if (req.files) {
      // req.files is an object when using upload.fields()
      if (req.files.photo && req.files.photo.length) {
        const p = req.files.photo[0];
        photoUrl = "/uploads/" + path.basename(p.path);
      }
      if (req.files.cv && req.files.cv.length) {
        const c = req.files.cv[0];
        cvUrl = "/uploads/" + path.basename(c.path);
      }
      // fallback: if only one file present under other key, detect by mimetype
      if (!photoUrl && !cvUrl) {
        const allFiles = Object.values(req.files).flat();
        if (allFiles && allFiles.length) {
          const f = allFiles[0];
          const ext = path.extname(f.path).toLowerCase();
          if (ext === ".pdf" || f.mimetype === "application/pdf") cvUrl = "/uploads/" + path.basename(f.path);
          else photoUrl = "/uploads/" + path.basename(f.path);
        }
      }
    }

    const applicationData = {
      name,
      email,
      phone,
      designation,
      professionalExperience,
      languageExpertise,
      socials,
      message,
    };

    if (photoUrl) applicationData.photoUrl = photoUrl;
    if (cvUrl) applicationData.cvUrl = cvUrl;

    const application = await TeacherApplication.create(applicationData);

    res.status(201).json(application);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Admin: list applications
exports.getTeacherApplications = async (req, res) => {
  try {
    const query = {};
    if (req.query.status) query.status = req.query.status;

    const applications = await TeacherApplication.find(query)
      .populate("teacher")
      .sort({ createdAt: -1 });

    res.json(applications);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Admin: get one
exports.getTeacherApplicationById = async (req, res) => {
  try {
    const application = await TeacherApplication.findById(req.params.id).populate("teacher");
    if (!application) return res.status(404).json({ message: "Application not found" });
    res.json(application);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Admin: update status/note (no approval side-effects)
exports.updateTeacherApplication = async (req, res) => {
  try {
    const { status, adminNote } = req.body;

    const updates = {};
    if (status !== undefined) updates.status = status;
    if (adminNote !== undefined) updates.adminNote = adminNote;

    const application = await TeacherApplication.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    }).populate("teacher");

    if (!application) return res.status(404).json({ message: "Application not found" });

    res.json(application);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Admin: approve and create a Teacher + User record
exports.approveTeacherApplication = async (req, res) => {
  try {
    const application = await TeacherApplication.findById(req.params.id);
    if (!application) return res.status(404).json({ message: "Application not found" });

    if (application.status === "approved" && application.teacher) {
      const existingTeacher = await Teacher.findById(application.teacher).populate("user");
      return res.json({ 
        application, 
        teacher: existingTeacher,
        message: "Application already approved"
      });
    }

    // Check if user already exists with this email
    let user = await User.findOne({ email: application.email });
    let tempPassword = null;
    
    if (!user) {
      // Create User account for the teacher
      tempPassword = crypto.randomBytes(12).toString('hex');
      const hashedPassword = await bcrypt.hash(tempPassword, 10);

      user = await User.create({
        name: application.name,
        email: application.email,
        password: hashedPassword,
        role: "teacher",
        emailVerified: true, // Auto-verify approved teachers
      });
    } else if (user.role !== "teacher") {
      // Update role to teacher if existing user
      user.role = "teacher";
      await user.save();
    }

    // Create Teacher profile
    const teacher = await Teacher.create({
      name: application.name,
      designation: application.designation,
      professionalExperience: application.professionalExperience,
      languageExpertise: application.languageExpertise,
      email: application.email,
      phone: application.phone,
      socials: application.socials,
      photoUrl: application.photoUrl,
      cvUrl: application.cvUrl,
      user: user._id, // Link to user account
      isActive: true,
    });

    // Update application status
    application.status = "approved";
    application.teacher = teacher._id;
    await application.save();

    // Send approval notification email only if user was just created
    if (tempPassword) {
      await sendTeacherApprovalEmail(user.email, user.name, tempPassword);
    }

    const populatedTeacher = await Teacher.findById(teacher._id).populate("user");
    
    res.json({ 
      application, 
      teacher: populatedTeacher,
      message: "Teacher approved and user account created successfully",
      notificationSent: !!tempPassword
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
