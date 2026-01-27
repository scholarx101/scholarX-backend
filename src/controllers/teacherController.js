const Teacher = require("../models/Teacher");
const Course = require("../models/Course");
const Enrollment = require("../models/Enrollment");
const path = require("path");
const { deleteFile } = require("../utils/fileManager");

// Admin: create teacher
exports.createTeacher = async (req, res) => {
  try {
    const {
      name,
      designation,
      professionalExperience,
      languageExpertise,
      email,
      phone,
      socials,
      isActive,
    } = req.body;

    const teacher = await Teacher.create({
      name,
      designation,
      professionalExperience,
      languageExpertise,
      email,
      phone,
      socials,
      isActive,
    });

    res.status(201).json(teacher);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Public/Admin: list teachers
exports.getTeachers = async (req, res) => {
  try {
    const query = {};
    if (req.query.active === "true") query.isActive = true;
    if (req.query.active === "false") query.isActive = false;

    // Default behavior: public users see only active teachers.
    // Admins (authenticated) see all teachers unless they explicitly filter.
    const isAdmin = req.user && req.user.role === "admin";
    if (!isAdmin && req.query.active === undefined) {
      query.isActive = true;
    }

    const teachers = await Teacher.find(query).sort({ createdAt: -1 });
    res.json(teachers);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Public/Admin: get teacher
exports.getTeacherById = async (req, res) => {
  try {
    const isAdmin = req.user && req.user.role === "admin";
    const teacherQuery = isAdmin
      ? { _id: req.params.id }
      : { _id: req.params.id, isActive: true };

    const teacher = await Teacher.findOne(teacherQuery);
    if (!teacher) return res.status(404).json({ message: "Teacher not found" });
    res.json(teacher);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Admin: update teacher
exports.updateTeacher = async (req, res) => {
  try {
    const updates = (({
      name,
      designation,
      professionalExperience,
      languageExpertise,
      email,
      phone,
      socials,
      isActive,
      photoUrl,
    }) => ({
      name,
      designation,
      professionalExperience,
      languageExpertise,
      email,
      phone,
      socials,
      isActive,
      photoUrl,
    }))(req.body);

    Object.keys(updates).forEach((key) => updates[key] === undefined && delete updates[key]);

    const teacher = await Teacher.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });

    if (!teacher) return res.status(404).json({ message: "Teacher not found" });

    res.json(teacher);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Admin: delete teacher
exports.deleteTeacher = async (req, res) => {
  try {
    const teacher = await Teacher.findById(req.params.id);
    if (!teacher) return res.status(404).json({ message: "Teacher not found" });

    // Delete teacher photo from VPS
    if (teacher.photoUrl) {
      await deleteFile(teacher.photoUrl);
      console.log(`Deleted photo for teacher: ${teacher.name}`);
    }

    await Teacher.findByIdAndDelete(req.params.id);

    res.json({ message: "Teacher deleted" });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Admin: upload teacher photo
exports.uploadTeacherPhoto = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Photo file is required" });
    }

    const teacher = await Teacher.findById(req.params.id);
    if (!teacher) return res.status(404).json({ message: "Teacher not found" });

    const publicPath = "/uploads/" + path.basename(req.file.path);
    teacher.photoUrl = publicPath;

    await teacher.save();

    res.json({ teacher });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Teacher: get my assigned courses
exports.getMyCourses = async (req, res) => {
  try {
    // req.user is the logged-in user; find their teacher profile
    const teacher = await Teacher.findOne({ user: req.user.id });
    if (!teacher) {
      return res.status(404).json({ message: "Teacher profile not found. Please contact admin." });
    }

    // Find all courses where this teacher is assigned
    const courses = await Course.find({ teachers: teacher._id })
      .populate("teachers", "name designation photoUrl")
      .sort({ createdAt: -1 });

    res.json(courses);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Teacher: get student progress for a specific course
exports.getCourseStudentProgress = async (req, res) => {
  try {
    const { courseId } = req.params;
    
    // Verify teacher has access to this course
    const teacher = await Teacher.findOne({ user: req.user.id });
    if (!teacher) {
      return res.status(404).json({ message: "Teacher profile not found" });
    }

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    // Check if teacher is assigned to this course
    const isAssigned = course.teachers.some(t => t.toString() === teacher._id.toString());
    if (!isAssigned) {
      return res.status(403).json({ message: "You are not assigned to this course" });
    }

    // Get all active enrollments for this course
    const enrollments = await Enrollment.find({ 
      course: courseId, 
      status: "active" 
    })
      .populate("student", "name email")
      .sort({ createdAt: -1 });

    // If course has multiple teachers, group progress by modules
    const hasMultipleTeachers = course.teachers.length > 1;
    
    if (hasMultipleTeachers) {
      // Get modules managed by this teacher
      const teacherModules = course.lessons
        .filter(lesson => lesson.moduleInstructor && lesson.moduleInstructor.toString() === teacher._id.toString())
        .map(lesson => lesson.moduleNumber)
        .filter((v, i, a) => a.indexOf(v) === i); // unique module numbers

      const progressData = enrollments.map(enrollment => {
        const studentProgress = teacherModules.map(moduleNum => {
          const moduleLessons = course.lessons.filter(l => l.moduleNumber === moduleNum);
          const completedInModule = moduleLessons.filter(l => 
            enrollment.completedLessons.some(cl => cl.toString() === l._id.toString())
          ).length;
          
          return {
            moduleNumber: moduleNum,
            moduleTitle: moduleLessons[0]?.moduleTitle || `Module ${moduleNum}`,
            totalLessons: moduleLessons.length,
            completedLessons: completedInModule,
            progress: moduleLessons.length > 0 ? Math.round((completedInModule / moduleLessons.length) * 100) : 0
          };
        });

        return {
          student: enrollment.student,
          enrollmentId: enrollment._id,
          purchasedAt: enrollment.purchasedAt,
          moduleProgress: studentProgress
        };
      });

      return res.json({
        courseId,
        courseName: course.title,
        teacherModules,
        students: progressData
      });
    } else {
      // Single teacher: show overall progress
      const progressData = enrollments.map(enrollment => {
        const totalLessons = course.lessons.length;
        const completedLessons = enrollment.completedLessons.length;
        
        return {
          student: enrollment.student,
          enrollmentId: enrollment._id,
          purchasedAt: enrollment.purchasedAt,
          totalLessons,
          completedLessons,
          progress: totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0
        };
      });

      return res.json({
        courseId,
        courseName: course.title,
        students: progressData
      });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Teacher: get lessons/modules they can manage
exports.getMyLessons = async (req, res) => {
  try {
    const { courseId } = req.params;
    
    const teacher = await Teacher.findOne({ user: req.user.id });
    if (!teacher) {
      return res.status(404).json({ message: "Teacher profile not found" });
    }

    const course = await Course.findById(courseId).populate("teachers");
    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    const isAssigned = course.teachers.some(t => t._id.toString() === teacher._id.toString());
    if (!isAssigned) {
      return res.status(403).json({ message: "You are not assigned to this course" });
    }

    // If multiple teachers, filter lessons by module instructor
    if (course.teachers.length > 1) {
      const myLessons = course.lessons.filter(lesson => 
        lesson.moduleInstructor && lesson.moduleInstructor.toString() === teacher._id.toString()
      );
      return res.json({ 
        course: { _id: course._id, title: course.title, teachers: course.teachers },
        lessons: myLessons,
        managementType: "module-based"
      });
    }

    // Single teacher manages all lessons
    return res.json({ 
      course: { _id: course._id, title: course.title, teachers: course.teachers },
      lessons: course.lessons,
      managementType: "full-course"
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
