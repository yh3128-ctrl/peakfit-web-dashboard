/**
 * chart.js — Chart.js 기반 고도 프로파일 차트 렌더링
 *
 * course.html의 renderAltitudeChart()에서 호출됩니다.
 */

/**
 * 고도 프로파일 라인 차트를 생성합니다.
 *
 * @param {Object} course - courses.json 코스 객체
 */
function renderAltitudeChart(course) {
  const canvas = document.getElementById('altitude-chart');
  if (!canvas) return;

  // 기존 차트가 있으면 파괴 후 재생성 (탭 전환 시 중복 생성 방지)
  if (window._altitudeChart) {
    window._altitudeChart.destroy();
  }

  const waypoints = course.waypoints;
  const labels  = waypoints.map(wp => wp.name);
  const altitudes = course.altitudeProfile;

  // 고도 범위 계산 — y축 여백을 위해 min/max 조정
  const minAlt = Math.min(...altitudes);
  const maxAlt = Math.max(...altitudes);
  const padding = (maxAlt - minAlt) * 0.15;

  // 그라데이션 채우기 — 산 테마 푸른빛
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.offsetHeight || 160);
  gradient.addColorStop(0, 'rgba(59, 130, 246, 0.35)');
  gradient.addColorStop(1, 'rgba(59, 130, 246, 0.03)');

  window._altitudeChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: '고도 (m)',
        data: altitudes,
        borderColor: '#3b82f6',
        borderWidth: 2.5,
        backgroundColor: gradient,
        fill: true,
        tension: 0.35,           // 부드러운 곡선
        pointBackgroundColor: waypoints.map(wp => {
          // 웨이포인트 타입별 포인트 색상
          const colors = { start:'#22c55e', waypoint:'#3b82f6', summit:'#ef4444', end:'#6b7280', caution:'#f59e0b' };
          return colors[wp.type] || '#3b82f6';
        }),
        pointRadius: 5,
        pointHoverRadius: 7,
        pointBorderColor: 'white',
        pointBorderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => items[0].label,
            label: (item) => ` 고도: ${item.parsed.y.toLocaleString()}m`,
            // 웨이포인트 타입 표시
            afterLabel: (item) => {
              const wp = waypoints[item.dataIndex];
              const labels = { start:'출발점', waypoint:'경유지', summit:'정상', end:'하산완료', caution:'주의구간' };
              return ` ${labels[wp.type] || ''}`;
            },
          },
          backgroundColor: 'rgba(17, 24, 39, 0.9)',
          titleColor: '#f9fafb',
          bodyColor: '#d1d5db',
          cornerRadius: 10,
          padding: 10,
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            font: { size: 10 },
            color: '#9ca3af',
            maxRotation: 30,
            // 레이블이 길면 축약 (10자 초과 시 '...' 처리)
            callback: function(val, idx) {
              const label = this.getLabelForValue(val);
              return label.length > 8 ? label.substring(0, 7) + '…' : label;
            },
          },
        },
        y: {
          min: Math.max(0, minAlt - padding),
          max: maxAlt + padding,
          grid: { color: 'rgba(0,0,0,0.05)' },
          ticks: {
            font: { size: 10 },
            color: '#9ca3af',
            callback: (val) => `${val}m`,
          },
        },
      },
    },
  });
}
