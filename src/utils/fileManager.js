// Minimal file manager stub - prevent startup errors
// Add real implementation as needed

async function deleteCourseFiles(courseId) {
  // noop
  return Promise.resolve();
}

async function deleteLessonFiles(lessonId) {
  // noop
  return Promise.resolve();
}

module.exports = {
  deleteCourseFiles,
  deleteLessonFiles,
};
