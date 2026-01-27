const Course = require("../models/Course");
const Enrollment = require("../models/Enrollment");
const path = require("path");
const { sendEmail } = require("../utils/email");
const { deleteCourseFiles, deleteLessonFiles } = require("../utils/fileManager");

const {
  parseOptionalDate,
  parseOptionalNumber,
  diffMonths,
  computeLessonMonthNumber,
  getCourseStartDate,
} = require("../utils/dates");

const { normalizePricingPayload, attachEffectivePrice } = require("../utils/pricing");

const { stripProtectedLessonFields, sanitizeCourseForPublic, filterCourseForEnrollment } = require("../utils/courseSanitizer");

const normalizeLivePayload = (live, liveStartDate) => {
  if (!live && !liveStartDate) return undefined;

  const result = { ...(live || {}) };

  // Support live start date from multiple sources
  const topStart = parseOptionalDate(result.startsAt || result.startDate || liveStartDate);
  if (topStart) {
    result.startDate = topStart;
  }
  delete result.startsAt;

  if (Array.isArray(result.batches)) {
    result.batches = result.batches.map((batch) => {
      // Accept various field names but store only: title, time, capacity
      const title = (batch?.title || batch?.name || batch?.batchTitle || batch?.batchName || "").trim() || undefined;
      const time = (batch?.time || batch?.timeText || "").trim() || undefined;
      const capacity = parseOptionalNumber(batch?.capacity ?? batch?.seats ?? batch?.seatCount);

      return {
        title,
        time,
        capacity,
        isActive: batch?.isActive === undefined ? true : !!batch.isActive,
      };
    });
  }

  return result;
};

const isAdminRequest = (req) => !!(req.user && req.user.role === "admin");

// `sanitizeCourseForPublic` delegated to utils/courseSanitizer

// `attachEffectivePrice` delegated to utils/pricing

// `filterCourseForEnrollment` delegated to utils/courseSanitizer

async function notifyEnrolledStudents({ course, lessonTitle, updateText, batchId }) {
  try {
    const query = { course: course._id, status: "active" };
    if (batchId) query.batchId = batchId;

    const enrollments = await Enrollment.find(query).populate("student", "name email");
    const recipients = enrollments
      .map((e) => e.student)
      .filter((s) => s && s.email);

    if (recipients.length === 0) return;

    const subject = `Course update: ${course.title}`;
    const html = `<p>Assalamu alaikum,</p>
      <p>There is a new update in <strong>${course.title}</strong>${lessonTitle ? ` (Lesson: ${lessonTitle})` : ""}.</p>
      <p>${updateText}</p>
      <p>Please log in to view the latest materials in shaa Allah.</p>`;

    await Promise.allSettled(
      recipients.map((student) =>
        sendEmail({
          to: student.email,
          subject,
          html,
          text: `Course update: ${course.title}. ${lessonTitle ? `Lesson: ${lessonTitle}. ` : ""}${updateText}`,
        })
      )
    );
  } catch (error) {
    console.error("Notify enrolled students error", error.message || error);
  }
}

// Create a new course (admin)
exports.createCourse = async (req, res) => {
  try {
    const {
      title,
      description,
      duration,
      daysPerWeek,
      category,
      level,
      isPublished,
      type,
      thumbnailUrl,
      teacher,
      teachers,
      live,
      liveStartDate,
      startsAt,
      price,
    } = req.body;

    const normalizedLive = normalizeLivePayload(live, liveStartDate);

    // Require new `pricing` object
    const normalizedPricing = normalizePricingPayload(req.body);
    if (!normalizedPricing) {
      return res.status(400).json({ message: "Course pricing is required (provide pricing object)" });
    }

    const courseData = {
      type,
      title,
      description,
      thumbnailUrl,
      duration,
      daysPerWeek: parseOptionalNumber(daysPerWeek),
      category,
      level,
      ...(teachers && teachers.length > 0 ? { teachers: teachers.filter(Boolean) } : {}),
      live: normalizedLive,
      startsAt: parseOptionalDate(startsAt),
      pricing: normalizedPricing,
      isPublished,
    };

    const course = await Course.create(courseData);

    res.status(201).json(course);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Get all courses
exports.getCourses = async (req, res) => {
  try {
    const courses = await Course.find()
      .populate("teachers")
      .sort({ createdAt: -1 });

    if (isAdminRequest(req)) {
      const adminPayload = courses.map((c) => attachEffectivePrice(c.toObject()));
      return res.json(adminPayload);
    }

    const payload = courses.map((c) => attachEffectivePrice(sanitizeCourseForPublic(c.toObject())));
    return res.json(payload);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get single course by id
exports.getCourseById = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id).populate("teachers");
    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    if (isAdminRequest(req)) {
      return res.json(attachEffectivePrice(course.toObject()));
    }

    // If logged in and enrolled, return full course (but for live courses filter batch-specific links)
    if (req.user && req.user.id) {
      const enrollment = await Enrollment.findOne({
        student: req.user.id,
        course: req.params.id,
        status: "active",
      });

        if (enrollment) {
          let obj = attachEffectivePrice(course.toObject());
          const filtered = filterCourseForEnrollment(obj, enrollment);

        if (enrollment.paymentPlan === "monthly") {
          const startDate = getCourseStartDate(course, enrollment);
          const now = new Date();
          const courseMonthNow = startDate ? Math.max(1, diffMonths(now, startDate) + 1) : 1;
          const paidMonths = typeof enrollment.monthsPaid === "number" ? enrollment.monthsPaid : 0;
          const allowedMonth = Math.max(0, Math.min(paidMonths, courseMonthNow));

          if (Array.isArray(filtered.lessons)) {
            filtered.lessons = filtered.lessons.map((lesson) => {
              const lessonMonth = computeLessonMonthNumber(lesson, startDate);
              return lessonMonth <= allowedMonth
                ? { ...lesson, monthNumber: lessonMonth }
                : { ...stripProtectedLessonFields(lesson), monthNumber: lessonMonth };
            });
          }
        }

        // Semester-based gating: allow access to lessons whose semester <= paid & current semester
        if (enrollment.paymentPlan === "semester") {
          const startDate = getCourseStartDate(course, enrollment);
          const now = new Date();
          const courseMonthNow = startDate ? Math.max(1, diffMonths(now, startDate) + 1) : 1;

          const semesterDurationMonths =
            course?.pricing && course.pricing.semesterDurationMonths ? parseOptionalNumber(course.pricing.semesterDurationMonths) : undefined;

          const paidSemesters = typeof enrollment.semestersPaid === "number" ? enrollment.semestersPaid : 0;

          if (semesterDurationMonths && semesterDurationMonths > 0) {
            const currentSemesterNow = Math.max(1, Math.ceil(courseMonthNow / semesterDurationMonths));
            const allowedSemester = Math.max(0, Math.min(paidSemesters, currentSemesterNow));

            if (Array.isArray(filtered.lessons)) {
              filtered.lessons = filtered.lessons.map((lesson) => {
                const lessonMonth = computeLessonMonthNumber(lesson, startDate);
                const lessonSemester = Math.max(1, Math.ceil(lessonMonth / semesterDurationMonths));
                return lessonSemester <= allowedSemester
                  ? { ...lesson, monthNumber: lessonMonth, semesterNumber: lessonSemester }
                  : { ...stripProtectedLessonFields(lesson), monthNumber: lessonMonth, semesterNumber: lessonSemester };
              });
            }
          } else {
            // Semester length not configured: default to hiding protected fields unless fully paid
            const fullyPaid = enrollment.isFullyPaid === true;
            if (Array.isArray(filtered.lessons)) {
              filtered.lessons = filtered.lessons.map((lesson) => {
                const lessonMonth = computeLessonMonthNumber(lesson, startDate);
                return fullyPaid
                  ? { ...lesson, monthNumber: lessonMonth }
                  : { ...stripProtectedLessonFields(lesson), monthNumber: lessonMonth };
              });
            }
          }
        }

        // include current semester info for enrolled users
        const courseSemesterNow = (function () {
          const startDate = getCourseStartDate(course, enrollment);
          if (!startDate) return undefined;
          if (!course?.pricing?.semesterDurationMonths) return undefined;
          const now = new Date();
          const courseMonthNow = Math.max(1, diffMonths(now, startDate) + 1);
          return Math.max(1, Math.ceil(courseMonthNow / Number(course.pricing.semesterDurationMonths)));
        })();

        const out = { ...filtered };
        if (courseSemesterNow !== undefined) out.courseSemesterNow = courseSemesterNow;
        return res.json(out);
      }
    }

    // Public (not enrolled): hide protected lesson fields
    return res.json(sanitizeCourseForPublic(attachEffectivePrice(course.toObject())));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Update course basic info (admin)
exports.updateCourse = async (req, res) => {
  try {
    const updates = (({ title, description, duration, daysPerWeek, category, level, isPublished, type, thumbnailUrl, teachers, live, startsAt }) => ({
      title,
      description,
      duration,
      daysPerWeek,
      category,
      level,
      isPublished,
      type,
      thumbnailUrl,
      teachers,
      live,
      startsAt,
    }))(req.body);

    if (req.body.daysPerWeek !== undefined) {
      updates.daysPerWeek = parseOptionalNumber(req.body.daysPerWeek);
    }

    // Update teachers array
    if (req.body.teachers !== undefined) {
      updates.teachers = Array.isArray(req.body.teachers) ? req.body.teachers.filter(Boolean) : undefined;
    }

    // Normalize live payload (supports frontend keys like title/date/time/seats)
    if (req.body.live !== undefined || req.body.liveStartDate !== undefined) {
      updates.live = normalizeLivePayload(req.body.live, req.body.liveStartDate);
    }

    if (req.body.startsAt !== undefined || req.body.startDate !== undefined) {
      updates.startsAt = parseOptionalDate(req.body.startsAt || req.body.startDate);
    }

    if (
      req.body.pricing !== undefined ||
      req.body.admissionFee !== undefined ||
      req.body.monthlyFee !== undefined ||
      req.body.comboFee !== undefined ||
      req.body.durationMonths !== undefined ||
      req.body.currency !== undefined
    ) {
      updates.pricing = normalizePricingPayload(req.body);
    }

    // remove undefined fields so we only update what is sent
    Object.keys(updates).forEach((key) => updates[key] === undefined && delete updates[key]);

    const course = await Course.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });

    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    res.json(course);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Upload course thumbnail (admin)
const { getCourseOr404 } = require("../utils/controllerHelpers");

exports.uploadCourseThumbnail = async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.file) {
      return res.status(400).json({ message: "Thumbnail file is required" });
    }

    const course = await getCourseOr404(res, id);
    if (!course) return; // response already sent by helper

    const publicPath = "/uploads/" + path.basename(req.file.path);
    course.thumbnailUrl = publicPath;
    await course.save();

    res.json({ course });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Delete course (admin)
exports.deleteCourse = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    // Delete all associated files from VPS
    const filesDeleted = await deleteCourseFiles(course);
    console.log(`Deleted ${filesDeleted} files from VPS for course: ${course.title}`);

    // Delete course from database
    await Course.findByIdAndDelete(req.params.id);

    res.json({ 
      message: "Course deleted",
      filesDeleted 
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Add a lesson to a course (admin)
exports.addLesson = async (req, res) => {
  try {
    const { title, description, videoUrl, pdfUrls, order, durationMinutes, isPublished, moduleNumber, moduleTitle, moduleInstructor, lessonDate } = req.body;

    const course = await Course.findById(req.params.id);
    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    const lessonOrder = order || course.lessons.length + 1;

    course.lessons.push({
      title,
      description,
      videoUrl,
      pdfUrls,
      order: lessonOrder,
      durationMinutes,
      isPublished,
      moduleNumber,
      moduleTitle,
      moduleInstructor,
      lessonDate,
    });

    await course.save();

    res.status(201).json(course);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Update a lesson in a course (admin)
exports.updateLesson = async (req, res) => {
  try {
    const { lessonId } = req.params;
    const { title, description, videoUrl, pdfUrls, order, durationMinutes, isPublished, moduleNumber, moduleTitle, moduleInstructor, lessonDate } = req.body;

    const course = await Course.findById(req.params.id);
    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    const lesson = course.lessons.id(lessonId);
    if (!lesson) {
      return res.status(404).json({ message: "Lesson not found" });
    }

    if (title !== undefined) lesson.title = title;
    if (description !== undefined) lesson.description = description;
    if (videoUrl !== undefined) lesson.videoUrl = videoUrl;
    if (pdfUrls !== undefined) lesson.pdfUrls = pdfUrls;
    if (order !== undefined) lesson.order = order;
    if (durationMinutes !== undefined) lesson.durationMinutes = durationMinutes;
    if (isPublished !== undefined) lesson.isPublished = isPublished;
    if (moduleNumber !== undefined) lesson.moduleNumber = moduleNumber;
    if (moduleTitle !== undefined) lesson.moduleTitle = moduleTitle;
    if (moduleInstructor !== undefined) lesson.moduleInstructor = moduleInstructor;
    if (lessonDate !== undefined) lesson.lessonDate = lessonDate;

    await course.save();

    res.json(course);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Delete a lesson from a course (admin)
exports.deleteLesson = async (req, res) => {
  try {
    const { lessonId } = req.params;

    const course = await Course.findById(req.params.id);
    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    const lesson = course.lessons.id(lessonId);
    if (!lesson) {
      return res.status(404).json({ message: "Lesson not found" });
    }

    // Delete all associated files from VPS
    const filesDeleted = await deleteLessonFiles(lesson);
    console.log(`Deleted ${filesDeleted} files from VPS for lesson: ${lesson.title}`);

    course.lessons.pull(lessonId);
    await course.save();

    res.json({ 
      course,
      filesDeleted 
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Upload lesson video (admin)
exports.uploadLessonVideo = async (req, res) => {
  try {
    const { id, lessonId } = req.params;

    if (!req.file) {
      return res.status(400).json({ message: "Video file is required" });
    }

    const course = await Course.findById(id);
    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    const lesson = course.lessons.id(lessonId);
    if (!lesson) {
      return res.status(404).json({ message: "Lesson not found" });
    }

    const publicPath = "/uploads/" + path.basename(req.file.path);
    lesson.videoUrl = publicPath;

    await course.save();

    await notifyEnrolledStudents({
      course,
      lessonTitle: lesson.title,
      updateText: "A new class recording/video has been added.",
    });

    res.json({ lesson });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Upload lesson PDFs (admin)
exports.uploadLessonPdfs = async (req, res) => {
  try {
    const { id, lessonId } = req.params;

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: "At least one PDF file is required" });
    }

    const course = await Course.findById(id);
    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    const lesson = course.lessons.id(lessonId);
    if (!lesson) {
      return res.status(404).json({ message: "Lesson not found" });
    }

    const newPdfUrls = req.files.map((file) => "/uploads/" + path.basename(file.path));

    if (!Array.isArray(lesson.pdfUrls)) {
      lesson.pdfUrls = [];
    }
    lesson.pdfUrls.push(...newPdfUrls);

    if (!Array.isArray(lesson.materialUrls)) {
      lesson.materialUrls = [];
    }
    lesson.materialUrls.push(...newPdfUrls);

    await course.save();

    await notifyEnrolledStudents({
      course,
      lessonTitle: lesson.title,
      updateText: "New reading materials have been uploaded.",
    });

    res.json({ lesson });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Upload lesson materials (pdf/image/ppt/etc) shared across all batches (admin)
exports.uploadLessonMaterials = async (req, res) => {
  try {
    const { id, lessonId } = req.params;

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: "At least one material file is required" });
    }

    const course = await Course.findById(id);
    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    const lesson = course.lessons.id(lessonId);
    if (!lesson) {
      return res.status(404).json({ message: "Lesson not found" });
    }

    const newUrls = req.files.map((file) => "/uploads/" + path.basename(file.path));
    if (!Array.isArray(lesson.materialUrls)) {
      lesson.materialUrls = [];
    }
    lesson.materialUrls.push(...newUrls);

    await course.save();

    await notifyEnrolledStudents({
      course,
      lessonTitle: lesson.title,
      updateText: "New course materials have been uploaded.",
    });

    res.json({ lesson });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Set per-batch meeting link (admin)
exports.setLessonBatchMeetingLink = async (req, res) => {
  try {
    const { id, lessonId, batchId } = req.params;
    const { meetingUrl, recordingUrl } = req.body;

    if (!meetingUrl && !recordingUrl) {
      return res.status(400).json({ message: "meetingUrl or recordingUrl is required" });
    }

    const course = await Course.findById(id);
    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    const batchExists = course.live?.batches?.id(batchId);
    if (!batchExists) {
      return res.status(404).json({ message: "Batch not found" });
    }

    const lesson = course.lessons.id(lessonId);
    if (!lesson) {
      return res.status(404).json({ message: "Lesson not found" });
    }

    if (!Array.isArray(lesson.liveBatchLinks)) {
      lesson.liveBatchLinks = [];
    }

    const existing = lesson.liveBatchLinks.find((x) => x.batchId?.toString() === batchId);
    if (existing) {
      if (meetingUrl !== undefined) existing.meetingUrl = meetingUrl;
      if (recordingUrl !== undefined) existing.recordingUrl = recordingUrl;
    } else {
      lesson.liveBatchLinks.push({
        batchId,
        meetingUrl,
        recordingUrl,
      });
    }

    await course.save();

    await notifyEnrolledStudents({
      course,
      lessonTitle: lesson.title,
      updateText: "A new live class link has been added/updated for your batch.",
      batchId,
    });

    res.json({ lesson });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Upload per-batch recording video (admin)
exports.uploadLessonBatchRecording = async (req, res) => {
  try {
    const { id, lessonId, batchId } = req.params;

    if (!req.file) {
      return res.status(400).json({ message: "Recording file is required" });
    }

    const course = await Course.findById(id);
    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    const batchExists = course.live?.batches?.id(batchId);
    if (!batchExists) {
      return res.status(404).json({ message: "Batch not found" });
    }

    const lesson = course.lessons.id(lessonId);
    if (!lesson) {
      return res.status(404).json({ message: "Lesson not found" });
    }

    const publicPath = "/uploads/" + path.basename(req.file.path);

    if (!Array.isArray(lesson.liveBatchLinks)) {
      lesson.liveBatchLinks = [];
    }

    const existing = lesson.liveBatchLinks.find((x) => x.batchId?.toString() === batchId);
    if (existing) {
      existing.recordingUrl = publicPath;
    } else {
      lesson.liveBatchLinks.push({
        batchId,
        recordingUrl: publicPath,
      });
    }

    await course.save();

    await notifyEnrolledStudents({
      course,
      lessonTitle: lesson.title,
      updateText: "A new class recording has been uploaded for your batch.",
      batchId,
    });

    res.json({ lesson });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
