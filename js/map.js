/**
 * map.js — 카카오 지도 초기화 및 마커/폴리라인 로직
 *
 * 사용 전 course.html의 스크립트 태그에서
 * YOUR_KAKAO_API_KEY 를 실제 Kakao Developers 앱 키로 교체하세요.
 * https://developers.kakao.com
 */

// 지도 관련 전역 변수
let kakaoMap = null;
let waypointMarkers = [];  // 웨이포인트별 마커 저장 (클릭 시 포커스용)
let infoWindows = [];      // 각 마커의 인포윈도우

// POI 마커 관련
let poiMarkers = [];       // 맛집 마커 저장
let poiInfoWindows = [];   // 맛집 인포윈도우
let _pendingPOIs = null;   // 지도 준비 전에 추가 요청된 POI 큐

// 웨이포인트 타입 → 색상 매핑
const WP_COLORS = {
  start:    '#22c55e',
  waypoint: '#3b82f6',
  summit:   '#ef4444',
  end:      '#6b7280',
  caution:  '#f59e0b',
};

// 웨이포인트 타입 → 한국어 레이블
const WP_LABELS = {
  start:    '출발점',
  waypoint: '경유지',
  summit:   '정상',
  end:      '하산완료',
  caution:  '주의구간',
};

/**
 * 특정 코스에 대한 카카오 지도를 초기화합니다.
 * kakao.maps.load() 콜백 안에서 실행되어 SDK 로드를 보장합니다.
 *
 * @param {Object} course - courses.json 의 코스 객체
 */
function initMapForCourse(course) {
  // SDK 또는 kakao 객체가 없으면 fallback UI 표시
  if (typeof kakao === 'undefined' || typeof kakao.maps === 'undefined') {
    showMapFallback(course);
    return;
  }

  kakao.maps.load(function () {
    try {
      const firstWp = course.waypoints[0];
      const container = document.getElementById('kakao-map');

      // 지도 생성 — 첫 번째 웨이포인트를 중심으로
      const options = {
        center: new kakao.maps.LatLng(firstWp.lat, firstWp.lng),
        level: 5,
      };
      kakaoMap = new kakao.maps.Map(container, options);

      // 마커 + 폴리라인 그리기
      addWaypointMarkers(course.waypoints);
      addRoutePolyline(course.waypoints);

      // 전체 경로가 지도에 맞도록 바운드 자동 조정
      fitMapBounds(course.waypoints);

      // 지도 준비 완료 플래그 + 대기 중인 POI 마커 처리
      window._mapReady = true;
      if (_pendingPOIs) {
        addPOIMarkersToMap(_pendingPOIs);
        _pendingPOIs = null;
      }

    } catch (err) {
      console.error('카카오 지도 초기화 실패:', err);
      showMapFallback(course);
    }
  });
}

/**
 * 각 웨이포인트에 커스텀 번호 마커를 추가합니다.
 * 마커 클릭 시 인포윈도우(이름+고도)가 열립니다.
 */
function addWaypointMarkers(waypoints) {
  waypointMarkers = [];
  infoWindows = [];

  waypoints.forEach(function (wp, idx) {
    const color = WP_COLORS[wp.type] || '#6b7280';
    const latlng = new kakao.maps.LatLng(wp.lat, wp.lng);

    // 커스텀 마커 이미지 — SVG 원 + 번호
    const svgContent = `
      <svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44">
        <circle cx="18" cy="18" r="16" fill="${color}" stroke="white" stroke-width="2.5"/>
        <text x="18" y="23" text-anchor="middle" fill="white" font-size="13" font-weight="bold" font-family="sans-serif">${wp.order}</text>
        <path d="M18 34 L12 22 Q18 44 24 22 Z" fill="${color}"/>
      </svg>
    `.trim();

    const markerImage = new kakao.maps.MarkerImage(
      'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgContent),
      new kakao.maps.Size(36, 44),
      { offset: new kakao.maps.Point(18, 44) }
    );

    const marker = new kakao.maps.Marker({
      position: latlng,
      image: markerImage,
      map: kakaoMap,
    });

    // 인포윈도우 — 마커 클릭 시 표시
    const infoContent = `
      <div style="
        padding:8px 12px;
        background:white;
        border-radius:8px;
        box-shadow:0 2px 8px rgba(0,0,0,0.15);
        font-family:sans-serif;
        min-width:120px;
      ">
        <p style="font-size:11px;color:#6b7280;margin:0 0 2px">${WP_LABELS[wp.type] || wp.type}</p>
        <p style="font-size:13px;font-weight:700;color:#111827;margin:0 0 2px">${wp.name}</p>
        <p style="font-size:12px;color:#374151;margin:0">📈 ${wp.altitude}m</p>
      </div>
    `;

    const infoWindow = new kakao.maps.InfoWindow({
      content: infoContent,
      removable: true,
    });

    // 마커 클릭 → 인포윈도우 열기
    kakao.maps.event.addListener(marker, 'click', function () {
      // 다른 인포윈도우 닫기
      infoWindows.forEach(iw => iw.close());
      infoWindow.open(kakaoMap, marker);
      // 좌측 패널 웨이포인트 활성화 동기화
      document.querySelectorAll('.waypoint-item').forEach(el => el.classList.remove('active-wp'));
      const target = document.querySelector(`[data-wp-idx="${idx}"]`);
      if (target) {
        target.classList.add('active-wp');
        target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });

    waypointMarkers.push(marker);
    infoWindows.push(infoWindow);
  });
}

/**
 * 웨이포인트를 잇는 파란색 폴리라인(등산로)을 그립니다.
 */
function addRoutePolyline(waypoints) {
  const path = waypoints.map(wp => new kakao.maps.LatLng(wp.lat, wp.lng));

  const polyline = new kakao.maps.Polyline({
    path: path,
    strokeWeight: 4,
    strokeColor: '#3b82f6',
    strokeOpacity: 0.85,
    strokeStyle: 'solid',
    map: kakaoMap,
  });
}

/**
 * 모든 웨이포인트가 한 화면에 보이도록 지도 범위를 자동 조정합니다.
 */
function fitMapBounds(waypoints) {
  const bounds = new kakao.maps.LatLngBounds();
  waypoints.forEach(wp => bounds.extend(new kakao.maps.LatLng(wp.lat, wp.lng)));
  kakaoMap.setBounds(bounds);
}

/**
 * 좌측 패널 웨이포인트 클릭 시 지도를 해당 마커로 이동하고 줌인합니다.
 * course.html 인라인 스크립트의 focusWaypoint()에서 호출됩니다.
 *
 * @param {number} idx - 웨이포인트 인덱스 (0부터 시작)
 */
function panToWaypoint(idx) {
  if (!kakaoMap || !waypointMarkers[idx]) return;

  const marker = waypointMarkers[idx];
  const position = marker.getPosition();

  // 지도 중심 이동 및 줌인
  kakaoMap.setCenter(position);
  kakaoMap.setLevel(3);

  // 해당 마커의 인포윈도우 열기
  infoWindows.forEach(iw => iw.close());
  infoWindows[idx].open(kakaoMap, marker);
}

/**
 * poi.js에서 호출 — 지도가 준비되면 즉시, 아직이면 큐에 저장합니다.
 *
 * @param {Array} pois - 필터링된 POI 배열 (calcDist 포함)
 */
function addOrQueuePOIMarkers(pois) {
  if (window._mapReady && kakaoMap) {
    addPOIMarkersToMap(pois);
  } else {
    _pendingPOIs = pois;
  }
}

/**
 * 맛집 POI 마커들을 지도에 추가합니다.
 * 기존 POI 마커가 있으면 먼저 제거합니다.
 */
function addPOIMarkersToMap(pois) {
  if (!kakaoMap) return;

  // 기존 POI 마커 제거
  poiMarkers.forEach(m => m.setMap(null));
  poiInfoWindows.forEach(iw => iw.close());
  poiMarkers = [];
  poiInfoWindows = [];

  const CATEGORY_COLORS = {
    '식당': '#f97316',
    '카페': '#d97706',
    '명소': '#3b82f6',
    '술집': '#7c3aed',
    '기타': '#6b7280',
  };

  pois.forEach(function (poi) {
    const color = CATEGORY_COLORS[poi.category] || '#6b7280';
    const latlng = new kakao.maps.LatLng(poi.lat, poi.lng);

    // 작은 원형 마커 (웨이포인트와 구별되는 크기)
    const svgContent = `
      <svg xmlns="http://www.w3.org/2000/svg" width="26" height="32" viewBox="0 0 26 32">
        <circle cx="13" cy="13" r="11" fill="${color}" stroke="white" stroke-width="2"/>
        <text x="13" y="17" text-anchor="middle" fill="white" font-size="11">🍴</text>
        <path d="M13 24 L9 17 Q13 32 17 17 Z" fill="${color}"/>
      </svg>`.trim();

    const markerImage = new kakao.maps.MarkerImage(
      'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgContent),
      new kakao.maps.Size(26, 32),
      { offset: new kakao.maps.Point(13, 32) }
    );

    const marker = new kakao.maps.Marker({
      position: latlng,
      image: markerImage,
      map: kakaoMap,
    });
    marker._poiName = poi.name; // 이름 저장 (동일 좌표 구분을 위해)

    const distText = poi.calcDist < 1000
      ? `${poi.calcDist}m`
      : `${(poi.calcDist / 1000).toFixed(1)}km`;

    const ratingStr = poi.rating ? `★ ${poi.rating.toFixed(1)}` : '평점없음';

    const infoContent = `
      <div style="padding:8px 12px;background:white;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.15);font-family:sans-serif;min-width:130px;">
        <p style="font-size:11px;color:#6b7280;margin:0 0 2px">${poi.category}</p>
        <p style="font-size:13px;font-weight:700;color:#111827;margin:0 0 3px">${poi.name}</p>
        <p style="font-size:12px;color:#374151;margin:0 0 2px">${ratingStr}</p>
        <p style="font-size:11px;color:#16a34a;margin:0">📏 하산지점 ${distText}</p>
      </div>`;

    const infoWindow = new kakao.maps.InfoWindow({ content: infoContent, removable: true });

    kakao.maps.event.addListener(marker, 'click', function () {
      // 웨이포인트 인포윈도우 닫기
      infoWindows.forEach(iw => iw.close());
      poiInfoWindows.forEach(iw => iw.close());
      infoWindow.open(kakaoMap, marker);
    });

    poiMarkers.push(marker);
    poiInfoWindows.push(infoWindow);
  });
}

/**
 * poi.js의 focusPOIOnMap()에서 호출 — 해당 마커 위치로 지도를 이동합니다.
 */
function focusPOIMarker(lat, lng, name) {
  if (!kakaoMap) return;
  const pos = new kakao.maps.LatLng(lat, lng);
  kakaoMap.setCenter(pos);
  kakaoMap.setLevel(3);

  // 해당 이름의 인포윈도우 열기
  const idx = poiMarkers.findIndex((m, i) => {
    const p = m.getPosition();
    return Math.abs(p.getLat() - lat) < 0.0001 && Math.abs(p.getLng() - lng) < 0.0001 && m._poiName === name;
  });
  if (idx !== -1) {
    poiInfoWindows.forEach(iw => iw.close());
    infoWindows.forEach(iw => iw.close());
    poiInfoWindows[idx].open(kakaoMap, poiMarkers[idx]);
  }
}

/**
 * 카카오 맵 API 키 미설정 등으로 지도 로드 실패 시 fallback UI를 표시합니다.
 */
function showMapFallback(course) {
  const fallback = document.getElementById('map-fallback');
  if (!fallback) return;

  fallback.classList.remove('hidden');

  // fallback에 코스 좌표 표시 (개발자 참고용)
  const coords = document.getElementById('map-fallback-coords');
  if (coords && course.waypoints) {
    coords.innerHTML = course.waypoints
      .map(wp => `[${wp.order}] ${wp.name}: (${wp.lat}, ${wp.lng})`)
      .join('<br/>');
  }
}
