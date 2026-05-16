/**
 * bookmark.js — LocalStorage 기반 코스 북마크 관리
 *
 * localStorage 키: 'hiking_bookmarks'
 * 저장 형식: JSON 배열 (코스 ID 문자열)
 * 예시: ["bukhansan-baegumdae", "seoraksan-daecheongbong"]
 */

const BOOKMARK_KEY = 'hiking_bookmarks';

/**
 * 저장된 북마크 ID 배열을 반환합니다.
 * localStorage 파싱 실패 시 빈 배열을 반환합니다.
 *
 * @returns {string[]}
 */
function getAllBookmarks() {
  try {
    return JSON.parse(localStorage.getItem(BOOKMARK_KEY)) || [];
  } catch {
    return [];
  }
}

/**
 * 코스 ID가 북마크에 있는지 확인합니다.
 *
 * @param {string} courseId
 * @returns {boolean}
 */
function isBookmarked(courseId) {
  return getAllBookmarks().includes(courseId);
}

/**
 * 코스 ID를 북마크에 추가하거나 제거합니다 (토글).
 * 이미 있으면 제거, 없으면 추가합니다.
 *
 * @param {string} courseId
 * @returns {boolean} 토글 후의 북마크 상태 (true=저장됨)
 */
function toggleBookmark(courseId) {
  const bookmarks = getAllBookmarks();
  const idx = bookmarks.indexOf(courseId);

  if (idx === -1) {
    bookmarks.push(courseId);
  } else {
    bookmarks.splice(idx, 1);
  }

  localStorage.setItem(BOOKMARK_KEY, JSON.stringify(bookmarks));
  return idx === -1;  // 추가되었으면 true
}

/**
 * 특정 코스 ID를 북마크에 추가합니다 (이미 있으면 무시).
 *
 * @param {string} courseId
 */
function addBookmark(courseId) {
  if (!isBookmarked(courseId)) {
    const bookmarks = getAllBookmarks();
    bookmarks.push(courseId);
    localStorage.setItem(BOOKMARK_KEY, JSON.stringify(bookmarks));
  }
}

/**
 * 특정 코스 ID를 북마크에서 제거합니다.
 *
 * @param {string} courseId
 */
function removeBookmark(courseId) {
  const bookmarks = getAllBookmarks().filter(id => id !== courseId);
  localStorage.setItem(BOOKMARK_KEY, JSON.stringify(bookmarks));
}

/**
 * 모든 북마크를 삭제합니다.
 */
function clearAllBookmarks() {
  localStorage.removeItem(BOOKMARK_KEY);
}
