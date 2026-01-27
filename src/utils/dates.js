const parseOptionalDate = (value) => {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date;
};

const parseOptionalNumber = (value) => {
  if (value === undefined || value === null || value === "") return undefined;
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return undefined;
  return num;
};

const diffMonths = (a, b) => (a.getFullYear() - b.getFullYear()) * 12 + (a.getMonth() - b.getMonth());

const computeLessonMonthNumber = (lesson, courseStartDate) => {
  if (!courseStartDate) return 1;
  const lessonDateRaw = lesson?.lessonDate;
  if (!lessonDateRaw) return 1;

  const d = lessonDateRaw instanceof Date ? lessonDateRaw : new Date(lessonDateRaw);
  if (Number.isNaN(d.getTime())) return 1;

  const m = diffMonths(d, courseStartDate);
  return Math.max(1, m + 1);
};

const getCourseStartDate = (course, enrollment) => {
  const start =
    course?.live?.startDate ||
    course?.startsAt ||
    (enrollment?.purchasedAt ? new Date(enrollment.purchasedAt) : undefined);

  if (!start) return undefined;
  const d = start instanceof Date ? start : new Date(start);
  if (Number.isNaN(d.getTime())) return undefined;
  return d;
};

module.exports = {
  parseOptionalDate,
  parseOptionalNumber,
  diffMonths,
  computeLessonMonthNumber,
  getCourseStartDate,
};
