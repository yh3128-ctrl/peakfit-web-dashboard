/**
 * poi.js — 맛집/POI 데이터 로드, 필터링, 렌더링
 *
 * 데이터 흐름:
 *   poi.json 로드 → mountain_name 매칭 → 하산지점 기준 Haversine 거리 계산
 *   → 1500m 이내 필터 → 정렬 → 렌더링 + 지도 마커 추가
 */

// 전역 상태
let _allPOIs = null;         // poi.json 전체 캐시 (1회 로드)
let _currentPOIs = [];       // 현재 코스 필터링된 POI 배열
let _poiSortMode = 'dist';   // 'dist' | 'rating' | 'review'
let _poiCategoryFilter = '전체';
const POI_RADIUS_M = 1500;   // 하산지점 기준 표시 반경(m)

// 카테고리별 색상/이모지
const CATEGORY_META = {
  '식당': { emoji: '🍜', color: 'bg-orange-100 text-orange-700', dot: '#f97316' },
  '카페': { emoji: '☕', color: 'bg-amber-100 text-amber-700', dot: '#d97706' },
  '관광지': { emoji: '🏛️', color: 'bg-blue-100 text-blue-700', dot: '#3b82f6' },
  '술집': { emoji: '🍺', color: 'bg-purple-100 text-purple-700', dot: '#7c3aed' },
  '기타': { emoji: '📍', color: 'bg-gray-100 text-gray-600', dot: '#6b7280' },
};

/**
 * poi.json을 한 번만 로드하고 이후에는 캐시를 사용합니다.
 */
async function loadPOIData() {
  if (_allPOIs !== null) return _allPOIs;
  try {
    const res = await fetch('data/poi.json');
    _allPOIs = await res.json();
    return _allPOIs;
  } catch (err) {
    console.error('poi.json 로드 실패:', err);
    _allPOIs = [];
    return [];
  }
}

/**
 * Haversine 공식으로 두 좌표 사이 직선거리(m)를 계산합니다.
 */
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = deg => deg * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * 코스 객체에서 하산 지점 좌표를 추출합니다.
 * 'end' 타입 웨이포인트 → 없으면 마지막 웨이포인트 → 없으면 최상위 End_Lat/End_Lon 사용
 */
function getEndPoint(course) {
  // 실제 Course Master 변환 데이터는 최상위에 End_Lat/End_Lon 보유
  if (course.End_Lat && course.End_Lon) {
    return { lat: parseFloat(course.End_Lat), lng: parseFloat(course.End_Lon) };
  }
  // 현재 mockup 데이터: waypoints 배열에서 추출
  if (course.waypoints && course.waypoints.length > 0) {
    const endWp = course.waypoints.find(wp => wp.type === 'end');
    const target = endWp || course.waypoints[course.waypoints.length - 1];
    return { lat: target.lat, lng: target.lng };
  }
  return null;
}

/**
 * 현재 코스에 맞는 POI를 필터링하고 거리를 계산합니다.
 *
 * @param {Object} course - courses.json 코스 객체
 * @returns {Array} 거리 계산된 POI 배열 (calcDist 필드 추가)
 */
async function filterPOIForCourse(course) {
  const allPOIs = await loadPOIData();
  const endPt = getEndPoint(course);
  if (!endPt) return [];

  // mountain_name으로 1차 필터
  const sameMountain = allPOIs.filter(p => p.mountain_name === course.mountain);

  // 하산지점 기준 거리 계산 + 1500m 이내 2차 필터
  const filtered = sameMountain
    .map(p => ({
      ...p,
      calcDist: Math.round(haversine(endPt.lat, endPt.lng, p.lat, p.lng)),
    }))
    .filter(p => p.calcDist <= POI_RADIUS_M);

  return filtered;
}

/**
 * 맛집 탭을 초기화합니다. course.html의 initCoursePage에서 호출됩니다.
 */
async function initPOITab(course) {
  // 로딩 표시
  const container = document.getElementById('tab-poi');
  if (!container) return;
  container.innerHTML = `
    <div class="flex flex-col items-center py-12">
      <div class="loading-spinner mb-3"></div>
      <p class="text-gray-400 text-sm">맛집 정보 불러오는 중...</p>
    </div>`;

  _currentPOIs = await filterPOIForCourse(course);

  if (_currentPOIs.length === 0) {
    container.innerHTML = `
      <div class="flex flex-col items-center py-16 text-center">
        <div class="text-4xl mb-3">🍽️</div>
        <p class="text-gray-600 font-semibold mb-1">주변 맛집 정보가 없습니다</p>
        <p class="text-gray-400 text-sm">하산지점 1.5km 반경에 등록된 맛집 데이터가 없어요</p>
      </div>`;
    return;
  }

  renderPOITab(course);

  // 지도에 마커 추가 (지도 준비 여부 체크)
  if (typeof addOrQueuePOIMarkers === 'function') {
    addOrQueuePOIMarkers(_currentPOIs);
  }
}

/**
 * 맛집 탭 전체 UI를 렌더링합니다 (정렬/필터 UI + 카드 목록).
 */
function renderPOITab(course) {
  const container = document.getElementById('tab-poi');
  const endPt = getEndPoint(course);
  const categories = ['전체', ...new Set(_currentPOIs.map(p => p.category).filter(Boolean))];

  container.innerHTML = `
    <!-- 하산지점 정보 -->
    <div class="flex items-center gap-2 mb-4 px-1">
      <div class="w-2.5 h-2.5 rounded-full bg-gray-400 flex-shrink-0"></div>
      <p class="text-xs text-gray-500">
        <strong class="text-gray-700">${course.mountain}</strong> 하산지점 기준
        <span class="ml-1 font-semibold text-green-600">${_currentPOIs.length}개</span> 맛집·명소 (1.5km 이내)
      </p>
    </div>

    <!-- 정렬 버튼 -->
    <div class="flex gap-2 mb-3">
      <span class="text-xs text-gray-500 self-center flex-shrink-0">정렬</span>
      <button class="poi-sort-btn text-xs px-3 py-1.5 rounded-full border font-medium transition-all ${_poiSortMode === 'dist' ? 'bg-green-500 text-white border-green-500' : 'bg-white text-gray-600 border-gray-200'}" data-sort="dist">거리순</button>
      <button class="poi-sort-btn text-xs px-3 py-1.5 rounded-full border font-medium transition-all ${_poiSortMode === 'rating' ? 'bg-green-500 text-white border-green-500' : 'bg-white text-gray-600 border-gray-200'}" data-sort="rating">평점순</button>
      <button class="poi-sort-btn text-xs px-3 py-1.5 rounded-full border font-medium transition-all ${_poiSortMode === 'review' ? 'bg-green-500 text-white border-green-500' : 'bg-white text-gray-600 border-gray-200'}" data-sort="review">리뷰순</button>
    </div>

    <!-- 카테고리 필터 -->
    <div class="flex gap-2 overflow-x-auto filter-scroll mb-4 pb-1">
      ${categories.map(cat => `
        <button class="poi-cat-btn text-xs px-3 py-1.5 rounded-full border font-medium whitespace-nowrap transition-all flex-shrink-0 ${_poiCategoryFilter === cat ? 'bg-orange-400 text-white border-orange-400' : 'bg-white text-gray-600 border-gray-200'}" data-cat="${cat}">
          ${cat !== '전체' ? (CATEGORY_META[cat]?.emoji || '📍') + ' ' : ''}${cat}
        </button>`).join('')}
    </div>

    <!-- 카드 목록 -->
    <div id="poi-card-list">
      ${buildPOICardList()}
    </div>
    <div class="h-20"></div>
  `;

  // 정렬 버튼 이벤트
  container.querySelectorAll('.poi-sort-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      _poiSortMode = this.dataset.sort;
      renderPOITab(course);
    });
  });

  // 카테고리 필터 이벤트
  container.querySelectorAll('.poi-cat-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      _poiCategoryFilter = this.dataset.cat;
      renderPOITab(course);
    });
  });
}

/**
 * 현재 정렬/필터 상태에 맞게 POI 카드 HTML을 생성합니다.
 */
function buildPOICardList() {
  let pois = [..._currentPOIs];

  // 카테고리 필터
  if (_poiCategoryFilter !== '전체') {
    pois = pois.filter(p => p.category === _poiCategoryFilter);
  }

  // 정렬
  if (_poiSortMode === 'dist') {
    pois.sort((a, b) => a.calcDist - b.calcDist);
  } else if (_poiSortMode === 'rating') {
    pois.sort((a, b) => (b.rating || 0) - (a.rating || 0));
  } else if (_poiSortMode === 'review') {
    pois.sort((a, b) => (b.review_count || 0) - (a.review_count || 0));
  }

  if (pois.length === 0) {
    return `<div class="text-center py-8 text-gray-400 text-sm">해당 카테고리의 맛집이 없습니다</div>`;
  }

  return pois.map(poi => buildPOICard(poi)).join('');
}

/**
 * 단일 POI 카드 HTML을 생성합니다.
 */
function buildPOICard(poi) {
  const meta = CATEGORY_META[poi.category] || CATEGORY_META['기타'];
  const distText = poi.calcDist < 1000
    ? `${poi.calcDist}m`
    : `${(poi.calcDist / 1000).toFixed(1)}km`;

  const ratingHtml = poi.rating
    ? `<span class="text-yellow-400 text-xs">★</span><span class="text-xs font-semibold text-gray-800 ml-0.5">${poi.rating.toFixed(1)}</span>`
    : `<span class="text-xs text-gray-400">평점없음</span>`;

  const reviewHtml = poi.review_count > 0
    ? `<span class="text-xs text-gray-400">리뷰 ${poi.review_count.toLocaleString()}</span>`
    : '';

  const hoursHtml = poi.hours
    ? `<p class="text-xs text-gray-500 mt-1 truncate">🕐 ${poi.hours.split('|')[0].trim()}</p>`
    : '';

  const tvHtml = poi.tv_info
    ? `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 bg-red-50 text-red-600 text-xs rounded font-medium mt-1">📺 ${poi.tv_info.substring(0, 20)}</span>`
    : '';

  const naverBtn = poi.naver_url
    ? `<a href="${poi.naver_url}" target="_blank" onclick="event.stopPropagation()" class="text-xs text-green-600 hover:underline font-medium">네이버 보기 →</a>`
    : '';

  return `
    <div class="poi-card border border-gray-100 rounded-xl p-3 mb-2.5 bg-white hover:bg-gray-50 transition-colors cursor-pointer"
         onclick="focusPOIOnMap(${poi.lat}, ${poi.lng}, '${poi.name.replace(/'/g, '&apos;')}')">
      <div class="flex items-start gap-3">
        <div class="flex-1 min-w-0">
          <!-- 이름 + 카테고리 뱃지 -->
          <div class="flex items-center gap-2 flex-wrap mb-1">
            <a href="https://map.kakao.com/link/search/${encodeURIComponent((poi.address ? poi.address + ' ' : '') + poi.name)}" target="_blank" onclick="event.stopPropagation()" class="font-semibold text-sm text-gray-900 truncate hover:text-blue-600 hover:underline" title="카카오맵에서 보기">${meta.emoji} ${poi.name}</a>
            <span class="px-1.5 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${meta.color}">${poi.category}</span>
          </div>
          <!-- 평점 + 리뷰 -->
          <div class="flex items-center gap-2">
            ${ratingHtml}
            ${reviewHtml}
          </div>
          <!-- TV 정보 -->
          ${tvHtml}
          <!-- 영업시간 -->
          ${hoursHtml}
          <!-- 하단: 거리 + 링크 -->
          <div class="flex items-center justify-between mt-2">
            <span class="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
              📏 하산지점 ${distText}
            </span>
            ${naverBtn}
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * POI 카드 클릭 시 지도의 해당 마커로 이동합니다.
 * map.js의 focusPOIMarker()를 호출합니다.
 */
function focusPOIOnMap(lat, lng, name) {
  if (typeof focusPOIMarker === 'function') {
    focusPOIMarker(lat, lng, name);
  }
}
