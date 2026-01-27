const stripProtectedLessonFields = (lesson) => ({
  ...lesson,
  videoUrl: undefined,
  pdfUrls: [],
  materialUrls: [],
  liveBatchLinks: [],
});

const sanitizeCourseForPublic = (courseObj) => {
  if (!courseObj || !Array.isArray(courseObj.lessons)) return courseObj;

  courseObj.lessons = courseObj.lessons.map((lesson) => ({
    ...lesson,
    videoUrl: undefined,
    pdfUrls: [],
    materialUrls: [],
    liveBatchLinks: [],
  }));

  return courseObj;
};

const filterCourseForEnrollment = (courseObj, enrollment) => {
  if (!courseObj || !Array.isArray(courseObj.lessons)) return courseObj;
  if (!enrollment || !enrollment.batchId) return courseObj;
  if (courseObj.type !== "live") return courseObj;

  const batchId = enrollment.batchId.toString();
  courseObj.lessons = courseObj.lessons.map((lesson) => ({
    ...lesson,
    liveBatchLinks: Array.isArray(lesson.liveBatchLinks)
      ? lesson.liveBatchLinks.filter((x) => x?.batchId?.toString() === batchId)
      : [],
  }));

  return courseObj;
};

module.exports = {
  stripProtectedLessonFields,
  sanitizeCourseForPublic,
  filterCourseForEnrollment,
};
