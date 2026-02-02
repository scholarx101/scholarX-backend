const Course = require("../models/Course");

async function getCourseOr404(res, id) {
  if (!id) {
    res.status(400).json({ message: "Course id is required" });
    return null;
  }

  const course = await Course.findById(id);
  if (!course) {
    res.status(404).json({ message: "Course not found" });
    return null;
  }
  return course;
}

function getLessonOr404(res, course, lessonId) {
  if (!lessonId) {
    res.status(400).json({ message: "lessonId is required" });
    return null;
  }

  const lesson = course.lessons.id(lessonId);
  if (!lesson) {
    res.status(404).json({ message: "Lesson not found" });
    return null;
  }
  return lesson;
}

module.exports = {
  getCourseOr404,
  getLessonOr404,
};
