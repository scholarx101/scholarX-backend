// Dev environment - simple cookie options
function getAuthCookieOptions() {
  return {
    httpOnly: true,
    path: '/',
    maxAge: 15 * 60 * 1000, // 15 minutes
  };
}

function getRefreshCookieOptions() {
  return {
    httpOnly: true,
    path: '/api/auth',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  };
}

function getClearAuthCookieOptions() {
  return { httpOnly: true, path: '/' };
}

function getClearRefreshCookieOptions() {
  return { httpOnly: true, path: '/api/auth' };
}

module.exports = {
  getAuthCookieOptions,
  getRefreshCookieOptions,
  getClearAuthCookieOptions,
  getClearRefreshCookieOptions,
};
