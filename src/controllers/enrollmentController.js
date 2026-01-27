const Enrollment = require("../models/Enrollment");
const Course = require("../models/Course");
const mongoose = require("mongoose");

const {
  getCourseStartDate,
  diffMonths,
  computeLessonMonthNumber,
} = require("../utils/dates");

const { stripProtectedLessonFields } = require("../utils/courseSanitizer");

// Apply monthly access gating to course lessons based on payment
const applyMonthlyAccessGating = (courseObj, enrollment) => {
  if (!courseObj || !Array.isArray(courseObj.lessons)) return courseObj;
  if (!enrollment || enrollment.paymentPlan !== "monthly") return courseObj;

  const startDate = getCourseStartDate(courseObj, enrollment);
  const now = new Date();
  const courseMonthNow = startDate ? Math.max(1, diffMonths(now, startDate) + 1) : 1;
  const paidMonths = typeof enrollment.monthsPaid === "number" ? enrollment.monthsPaid : 0;
  const allowedMonth = Math.max(0, Math.min(paidMonths, courseMonthNow));

  courseObj.lessons = courseObj.lessons.map((lesson) => {
    const lessonMonth = computeLessonMonthNumber(lesson, startDate);
    return lessonMonth <= allowedMonth
      ? { ...lesson, monthNumber: lessonMonth }
      : { ...stripProtectedLessonFields(lesson), monthNumber: lessonMonth };
  });

  return courseObj;
;}

// Get current student's enrollments
exports.getMyEnrollments = async (req, res) => {
  try {
    const studentId = req.user.id;

    const enrollments = await Enrollment.find({ student: studentId })
      .populate("course")
      .sort({ createdAt: -1 });


    const payload = enrollments.map((e) => {
      const obj = e.toObject();
        if (obj.course) {
          // Backwards compatibility: if enrollment predates new fields, treat as combo (fully paid)
          if (!obj.paymentPlan) {
            obj.paymentPlan = "combo";
            obj.isFullyPaid = true;
            obj.monthsPaid = obj.course?.pricing?.durationMonths ?? obj.monthsPaid ?? 0;
          }

          obj.course = applyMonthlyAccessGating(obj.course, obj);
        }
      return obj;
    });

    res.json(payload);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Mark a lesson as completed for the logged-in student
exports.markLessonCompleted = async (req, res) => {
  try {
    const studentId = req.user.id;
    const { courseId, lessonId } = req.params;

    // Admin audit UX: allow admin UI to call this endpoint without mutating data.
    // If admin clicks "mark completed", we return a successful response but do not save.
    if (req.user && req.user.role === "admin") {
      return res.json({
        ignored: true,
        message: "Admin progress updates are disabled",
        courseId,
        lessonId,
      });
    }

    const enrollment = await Enrollment.findOne({ student: studentId, course: courseId });
    if (!enrollment || enrollment.status !== "active") {
      return res.status(403).json({ message: "You are not enrolled in this course" });
    }

    // ensure lessonId is present in course lessons
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    const hasLesson = course.lessons.id(lessonId);
    if (!hasLesson) {
      return res.status(404).json({ message: "Lesson not found in this course" });
    }

    const lessonObjectId = hasLesson._id;

    const alreadyCompleted = enrollment.completedLessons.some(
      (id) => id.toString() === lessonObjectId.toString()
    );

    if (!alreadyCompleted) {
      enrollment.completedLessons.push(lessonObjectId);
      // if all lessons completed, mark enrollment completed
      if (course.lessons.length > 0 && enrollment.completedLessons.length >= course.lessons.length) {
        enrollment.status = "completed";
      }
      await enrollment.save();
    }

    res.json(enrollment);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Admin: get all enrollments (for reporting/audit)
exports.getAllEnrollments = async (req, res) => {
  try {
    const enrollments = await Enrollment.find({})
      .populate("student", "name email role")
      .populate("course", "title type")
      .sort({ createdAt: -1 });

    res.json(enrollments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Admin: get enrollments for a specific course
exports.getEnrollmentsForCourse = async (req, res) => {
  try {
    const { courseId } = req.params;

    const enrollments = await Enrollment.find({ course: courseId })
      .populate("student", "name email role")
      .populate("course", "title type pricing")
      .sort({ createdAt: -1 });

    res.json(enrollments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Admin: summary for a specific course (counts + revenue)
exports.getEnrollmentSummaryForCourse = async (req, res) => {
  try {
    const { courseId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(courseId)) {
      return res.status(400).json({ message: "Invalid courseId" });
    }

    const courseObjectId = new mongoose.Types.ObjectId(courseId);

    const [agg] = await Enrollment.aggregate([
      { $match: { course: courseObjectId } },
      {
        $facet: {
          byStatus: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
          revenueByCurrency: [
            {
              $group: {
                _id: { $ifNull: ["$currency", "UNKNOWN"] },
                totalAmount: {
                  $sum: {
                    $convert: {
                      input: "$amountPaid",
                      to: "double",
                      onError: 0,
                      onNull: 0,
                    },
                  },
                },
              },
            },
          ],
        },
      },
    ]);

    const statusCounts = {
      pending: 0,
      active: 0,
      completed: 0,
      cancelled: 0,
    };

    for (const row of agg?.byStatus || []) {
      if (row && row._id && Object.prototype.hasOwnProperty.call(statusCounts, row._id)) {
        statusCounts[row._id] = row.count;
      }
    }

    const totalsByCurrency = (agg?.revenueByCurrency || []).map((row) => ({
      currency: row._id,
      totalAmount: row.totalAmount,
    }));

    const totalRevenue = totalsByCurrency.reduce(
      (sum, r) => sum + (typeof r.totalAmount === "number" ? r.totalAmount : 0),
      0
    );

    const totalEnrollments = Object.values(statusCounts).reduce((a, b) => a + b, 0);

    return res.json({
      courseId,
      totalEnrollments,
      statusCounts,
      totalRevenue,
      totalsByCurrency,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Admin: update enrollment status (e.g., active/cancelled)
exports.updateEnrollmentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const allowedStatuses = ["pending", "active", "completed", "cancelled"];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status value" });
    }

    const enrollment = await Enrollment.findByIdAndUpdate(
      id,
      { status },
      { new: true, runValidators: true }
    )
      .populate("student", "name email role")
      .populate("course", "title type pricing");

    if (!enrollment) {
      return res.status(404).json({ message: "Enrollment not found" });
    }

    res.json(enrollment);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
