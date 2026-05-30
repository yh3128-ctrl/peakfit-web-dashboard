/**
 * filter.js — index.html 코스 목록 필터링 및 카드 렌더링
 *
 * 필터 전략:
 *   - 난이도: 단일 선택 (전체 / 초급 / 중급 / 고급)
 *   - 태그: 다중 선택 + OR 로직 (선택 태그 중 하나라도 포함하면 표시)
 */

// 필터 상태
window._selectedDifficulty = '전체';
window._selectedTags = [];
window._allCourses = [];   // 전체 코스 캐시 (북마크 모달에서도 참조)

/**
 * 페이지 초기화 — courses.json 로드 후 카드 렌더링
 */
async function initFilterPage() {
  try {
    const res = await fetch('data/courses.json?v=20260530');
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.url}`);
    window._allCourses = await res.json();

    document.getElementById('loading').style.display = 'none';

    applyFilters();
    bindFilterEvents();

  } catch (err) {
    console.error('courses.json 로드 실패:', err);
    // loading 대신 course-grid에 에러 표시 (loading은 이미 hidden일 수 있음)
    document.getElementById('loading').style.display = 'none';
    document.getElementById('course-grid').innerHTML = `
      <div class="col-span-3 text-center py-16">
        <div class="text-5xl mb-4">⚠️</div>
        <p class="text-gray-600 font-semibold mb-1">데이터를 불러오지 못했습니다</p>
        <p class="text-gray-400 text-sm mb-2">Live Server로 실행해주세요.</p>
        <code class="bg-red-50 text-red-600 text-xs px-2 py-1 rounded">${err.message}</code>
      </div>`;
  }
}

/**
 * 필터 버튼 이벤트 바인딩
 */
function bindFilterEvents() {
  // 난이도 버튼
  document.querySelectorAll('.difficulty-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.difficulty-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      window._selectedDifficulty = this.dataset.difficulty;
      applyFilters();
    });
  });

  // 태그 버튼 (다중 선택 토글)
  document.querySelectorAll('.tag-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      const tag = this.dataset.tag;
      const idx = window._selectedTags.indexOf(tag);

      if (idx === -1) {
        window._selectedTags.push(tag);
        this.classList.add('active');
      } else {
        window._selectedTags.splice(idx, 1);
        this.classList.remove('active');
      }
      applyFilters();
    });
  });
}

/**
 * 현재 필터 상태를 적용하여 코스 카드를 렌더링합니다.
 */
function applyFilters() {
  const filtered = filterCourses(window._selectedDifficulty, window._selectedTags);
  renderCourseCards(filtered);
  updateActiveFilterChips();
}

/**
 * 난이도 + 태그 조건으로 코스를 필터링합니다.
 *
 * 태그 전략: OR 로직 — 선택한 태그 중 하나라도 포함하면 표시
 *
 * @param {string} difficulty  - '전체' | '초급' | '중급' | '고급'
 * @param {string[]} tags      - 선택된 태그 배열 (예: ['#당일치기', '#암릉'])
 * @returns {Array}
 */
function filterCourses(difficulty, tags) {
  return window._allCourses.filter(course => {
    // 1단계: 난이도 필터 (전체면 통과)
    const difficultyMatch = difficulty === '전체' || course.difficulty === difficulty;
    if (!difficultyMatch) return false;

    // 2단계: 태그 필터 — 선택된 태그 없으면 전부 통과
    if (tags.length === 0) return true;

    // OR 로직: 코스의 tags 중 선택한 태그가 하나라도 포함되면 통과
    return tags.some(selectedTag => course.tags.includes(selectedTag));
  });
}

/**
 * 코스 카드 목록을 DOM에 렌더링합니다.
 *
 * @param {Array} courses - 렌더링할 코스 배열
 */
function renderCourseCards(courses) {
  const grid = document.getElementById('course-grid');
  const noResults = document.getElementById('no-results');
  const resultCount = document.getElementById('result-count');

  resultCount.textContent = courses.length;

  if (courses.length === 0) {
    grid.innerHTML = '';
    noResults.classList.remove('hidden');
    noResults.style.display = 'flex';
    return;
  }

  noResults.classList.add('hidden');
  noResults.style.display = 'none';

  try {
    grid.innerHTML = courses.map(course => buildCourseCard(course)).join('');
  } catch (err) {
    console.error('카드 렌더링 실패:', err);
    grid.innerHTML = `
      <div class="col-span-3 text-center py-12">
        <p class="text-red-500 font-semibold mb-2">카드 렌더링 오류</p>
        <code class="bg-red-50 text-red-600 text-xs px-2 py-1 rounded">${err.message}</code>
      </div>`;
  }
}

/**
 * 코스 객체를 받아 카드 HTML 문자열을 반환합니다.
 *
 * @param {Object} course
 * @returns {string}
 */
function buildCourseCard(course) {
  const difficultyClass = course.difficulty === '초급' ? 'badge-easy' :
                          course.difficulty === '중급' ? 'badge-medium' : 'badge-hard';

  const seasonIcons = { spring: '🌸', summer: '🌿', autumn: '🍁', winter: '❄️' };
  const seasons = (course.seasons || []).map(s => seasonIcons[s] || '').join(' ');

  const bookmarked = isBookmarked(course.id);
  const bookmarkIcon = bookmarked ? '❤️' : '🤍';

  const tags = course.tags.slice(0, 4).map(t =>
    `<span class="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full">${t}</span>`
  ).join('');

  return `
    <article class="course-card" onclick="location.href='course.html?id=${course.id}'">
      <!-- 썸네일 -->
      <div class="relative">
        <img
          src="${course.thumbnail}"
          alt="${course.name}"
          class="w-full aspect-video object-cover"
          loading="lazy"
          onerror="this.src='https://picsum.photos/seed/fallback/400/225'"
        />
        <!-- 난이도 뱃지 (좌상단) -->
        <span class="absolute top-2 left-2 px-2.5 py-1 rounded-full text-xs font-bold ${difficultyClass}">
          ${course.difficulty}
        </span>
        <!-- 시즌 아이콘 (우상단) -->
        <span class="absolute top-2 right-10 text-sm">${seasons}</span>
        <!-- 북마크 버튼 (우상단) -->
        <button
          class="absolute top-1.5 right-1.5 w-8 h-8 bg-white/80 backdrop-blur-sm rounded-full flex items-center justify-center text-base hover:bg-white transition-colors shadow-sm"
          data-bookmark-id="${course.id}"
          onclick="event.stopPropagation(); toggleBookmarkCard('${course.id}', this)"
          title="코스 저장"
        >${bookmarkIcon}</button>
      </div>

      <!-- 카드 본문 -->
      <div class="p-4">
        <!-- 코스명 -->
        <h2 class="font-bold text-gray-900 text-base leading-tight mb-0.5">${course.name}</h2>
        <!-- 산 이름 + 지역 -->
        <p class="text-sm text-gray-400 mb-3">${course.mountain} · ${course.region}</p>

        <!-- 메타 정보 -->
        <div class="flex items-center gap-3 text-xs text-gray-600 mb-3 flex-wrap">
          <span class="flex items-center gap-1">📏 <strong>${course.totalDistance}km</strong></span>
          <span class="flex items-center gap-1">⏱ <strong>${course.estimatedTime}</strong></span>
          <span class="flex items-center gap-1">📈 <strong>${course.maxAltitude}m</strong></span>
        </div>

        <!-- 평점 -->
        <div class="flex items-center gap-1 mb-3">
          <span class="text-yellow-400 text-sm">★</span>
          <span class="text-sm font-semibold text-gray-800">${course.rating != null ? course.rating.toFixed(1) : '-'}</span>
          <span class="text-xs text-gray-400">${course.ratingCount > 0 ? `(${course.ratingCount})` : '후기없음'}</span>
        </div>

        <!-- 해시태그 -->
        <div class="flex flex-wrap gap-1.5 mb-4">${tags}</div>

        <!-- 코스 보기 버튼 -->
        <a
          href="course.html?id=${course.id}"
          onclick="event.stopPropagation()"
          class="block w-full text-center py-2.5 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded-xl transition-colors"
        >코스 보기 →</a>
      </div>
    </article>
  `;
}

/**
 * 카드에서 북마크 버튼 클릭 시 상태를 즉시 업데이트합니다.
 *
 * @param {string} courseId
 * @param {HTMLElement} btn - 클릭된 버튼 요소
 */
function toggleBookmarkCard(courseId, btn) {
  toggleBookmark(courseId);
  const saved = isBookmarked(courseId);
  btn.textContent = saved ? '❤️' : '🤍';
}

/**
 * 활성 필터 표시 칩을 업데이트합니다.
 */
function updateActiveFilterChips() {
  const container = document.getElementById('active-filters');
  if (!container) return;

  const chips = [];

  if (window._selectedDifficulty !== '전체') {
    chips.push(`
      <span class="flex items-center gap-1 px-2.5 py-1 bg-green-100 text-green-700 text-xs rounded-full font-medium">
        ${window._selectedDifficulty}
        <button onclick="clearDifficultyFilter()" class="ml-1 hover:text-green-900">✕</button>
      </span>`);
  }

  window._selectedTags.forEach(tag => {
    chips.push(`
      <span class="flex items-center gap-1 px-2.5 py-1 bg-blue-100 text-blue-700 text-xs rounded-full font-medium">
        ${tag}
        <button onclick="removeTag('${tag}')" class="ml-1 hover:text-blue-900">✕</button>
      </span>`);
  });

  container.innerHTML = chips.join('');
}

function clearDifficultyFilter() {
  window._selectedDifficulty = '전체';
  document.querySelectorAll('.difficulty-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('[data-difficulty="전체"]').classList.add('active');
  applyFilters();
}

function removeTag(tag) {
  window._selectedTags = window._selectedTags.filter(t => t !== tag);
  document.querySelector(`[data-tag="${tag}"]`)?.classList.remove('active');
  applyFilters();
}
