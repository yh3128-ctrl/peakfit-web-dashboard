/**
 * chart.js — 페르소나 적합도 레이더 차트
 *
 * renderAltitudeChart(course) 를 호출하면 6축 레이더 차트를 그립니다.
 * 축: 난이도 / 코스거리 / 조망 / 맛집연계 / 대중교통 / 케이블카·편의
 */

// ── 페르소나 이상값 (0~100) ────────────────────────────────
const PERSONA_IDEAL = {
  A: [20, 30, 75, 65, 85, 65],   // 산책·인스타: 쉽고 짧게, 경치+맛집+교통 중시
  B: [80, 70, 55, 40, 45, 20],   // 성취감·운동: 높은 난이도+거리, 편의 낮음
  C: [55, 80, 90, 60, 55, 70],   // 풍경·장거리: 장거리+조망+케이블카 중시
};

const AXES = ['난이도', '코스 거리', '조망', '맛집 연계', '대중교통', '케이블카·편의'];

// ── 코스 실제값 계산 ──────────────────────────────────────
function calcCourseValues(course) {
  const tags    = course.tags || [];
  const hasTag  = (t) => tags.some(tag => tag.includes(t));

  // 1. 난이도: scoreEndurance (0~100)
  const difficulty = Math.round(course.scoreEndurance || 0);

  // 2. 코스 거리: 총 거리 km → 25km = 100점
  const dist = Math.min(Math.round((course.totalDistance || 0) / 25 * 100), 100);

  // 3. 조망: 태그 기반
  let view = 45;
  if (hasTag('인생샷'))   view = 85;
  else if (hasTag('케이블카'))  view = 72;
  else if (hasTag('초보가능')) view = 40;

  // 4. 맛집 연계: foodieIndex (재계산된 값 사용)
  const foodie = Math.round(course.foodieIndex || 0);

  // 5. 대중교통: 태그 기반
  const transit = hasTag('대중교통') ? 85 : 25;

  // 6. 케이블카·편의: 태그 기반
  let cable = 20;
  if (hasTag('케이블카'))  cable = 90;
  else if (hasTag('초보가능')) cable = 45;

  return [difficulty, dist, view, foodie, transit, cable];
}

// ── 적합도 % 계산 ─────────────────────────────────────────
function calcCompatibility(actual, ideal) {
  const diffs = actual.map((v, i) => Math.abs(v - ideal[i]));
  const avgDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  return Math.max(0, Math.round(100 - avgDiff * 0.85));
}

// ── 페르소나 타입 추출 ────────────────────────────────────
function getPersonaKey(personaType) {
  if (!personaType) return 'A';
  if (personaType.includes('B')) return 'B';
  if (personaType.includes('C')) return 'C';
  return 'A';
}

// ── 메인: 레이더 차트 렌더링 ─────────────────────────────
function renderAltitudeChart(course) {
  const canvas = document.getElementById('altitude-chart');
  if (!canvas) return;

  if (window._altitudeChart) {
    window._altitudeChart.destroy();
    window._altitudeChart = null;
  }

  const pk      = getPersonaKey(course.personaType);
  const ideal   = PERSONA_IDEAL[pk];
  const actual  = calcCourseValues(course);
  const compat  = calcCompatibility(actual, ideal);

  // 헤더 업데이트
  const headerEl = document.getElementById('radar-header');
  const compatEl = document.getElementById('radar-compat');
  const subEl    = document.getElementById('radar-sub');
  if (headerEl) headerEl.textContent = `페르소나 ↔ ${course.mountain} 적합도`;
  if (compatEl) compatEl.textContent = `적합도 ${compat}%`;
  if (subEl)    subEl.textContent    = '두 도형이 포개질수록 적합';

  // 배지 색상
  const badgeEl = document.getElementById('radar-compat');
  if (badgeEl) {
    badgeEl.style.background =
      compat >= 80 ? 'var(--forest)' :
      compat >= 60 ? '#f59e0b' : 'var(--crimson)';
  }

  const forestGreen = getComputedStyle(document.documentElement)
    .getPropertyValue('--forest').trim() || '#1B4332';

  window._altitudeChart = new Chart(canvas, {
    type: 'radar',
    data: {
      labels: AXES,
      datasets: [
        {
          label: '페르소나 이상',
          data: ideal,
          borderColor: 'rgba(27,67,50,0.4)',
          borderDash: [5, 4],
          borderWidth: 1.5,
          backgroundColor: 'rgba(27,67,50,0.06)',
          pointRadius: 3,
          pointBackgroundColor: 'rgba(27,67,50,0.4)',
        },
        {
          label: `${course.mountain} 실제`,
          data: actual,
          borderColor: forestGreen,
          borderWidth: 2.5,
          backgroundColor: 'rgba(27,67,50,0.18)',
          pointRadius: 4,
          pointBackgroundColor: forestGreen,
          pointBorderColor: 'white',
          pointBorderWidth: 1.5,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            font: { size: 11 },
            color: '#6b7280',
            padding: 12,
            usePointStyle: true,
            pointStyleWidth: 16,
          },
        },
        tooltip: {
          callbacks: {
            label: (item) => ` ${item.dataset.label}: ${item.parsed.r}점`,
          },
          backgroundColor: 'rgba(17,24,39,0.88)',
          titleColor: '#f9fafb',
          bodyColor: '#d1d5db',
          cornerRadius: 10,
          padding: 10,
        },
      },
      scales: {
        r: {
          min: 0,
          max: 100,
          ticks: {
            count: 5,
            display: false,
          },
          pointLabels: {
            font: { size: 11, weight: '600' },
            color: '#374151',
          },
          grid: { color: 'rgba(0,0,0,0.08)' },
          angleLines: { color: 'rgba(0,0,0,0.1)' },
        },
      },
    },
  });
}
