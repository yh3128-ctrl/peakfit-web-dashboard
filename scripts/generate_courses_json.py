"""
generate_courses_json.py
GPX 원본 파일을 직접 파싱해 실제 좌표/정상을 추출하고
PeakFit_Course_Master.csv 메타데이터와 결합하여
hiking-planner/data/courses.json 을 생성합니다.

실행:
  python scripts/generate_courses_json.py
"""

import csv
import json
import math
import sys
import os
import xml.etree.ElementTree as ET

sys.stdout.reconfigure(encoding='utf-8')

CSV_PATH = os.path.join(os.path.dirname(__file__), '..', '..', 'tracking-pjt', 'data', 'processed', 'PeakFit_Course_Master.csv')
GPX_BASE = os.path.join(os.path.dirname(__file__), '..', '..', 'tracking-pjt', 'data', 'raw', '100대명산')
OUT_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'courses.json')

TARGET_FILES = [
    # 서울/경기 근교
    '북한산_0000000031.gpx',
    '관악산_0000000001.gpx',
    '도봉산_0000000008.gpx',   # 출발 86m -> 정상 733m -> 하산 150m (정상적인 코스 데이터)
    '계룡산_0000000002.gpx',   # 원점회귀 8.55km  POI 53개
    '내장산_0000000001.gpx',   # 케이블카 코스 POI 27개
    '주왕산_0000000001.gpx',   # 기암 계곡 POI 44개
    '금정산_0000000001.gpx',   # 부산 케이블카 POI 159개
    # 설악산: 008이 실제 하산 완료 (끝=348m, 005는 387m에서 중단)
    '설악산_0000000008.gpx',
]

MOUNTAIN_SLUG = {
    '북한산': 'bukhansan',
    '관악산': 'gwanaksan',
    '도봉산': 'dobongsan',
    '계룡산': 'gyeryongsan',
    '내장산': 'naejangsan',
    '주왕산': 'juwangsan',
    '금정산': 'geumjeongsan',
    '설악산': 'seoraksan',
}

# 산별 Unsplash 실사진 썸네일 URL (400x300)
MOUNTAIN_THUMBNAIL = {
    '북한산': 'https://images.unsplash.com/photo-1547036967-23d11aacaee0?w=400&h=300&fit=crop',
    '관악산': 'https://images.unsplash.com/photo-1626196340348-b11c6f5f5f3e?w=400&h=300&fit=crop',
    '도봉산': 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=400&h=300&fit=crop',
    '계룡산': 'https://images.unsplash.com/photo-1560707303-4e980ce876ad?w=400&h=300&fit=crop',
    '내장산': 'https://images.unsplash.com/photo-1604999333679-b86d54738315?w=400&h=300&fit=crop',
    '주왕산': 'https://images.unsplash.com/photo-1596451190630-186aff535bf2?w=400&h=300&fit=crop',
    '금정산': 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=400&h=300&fit=crop',
    '설악산': 'https://images.unsplash.com/photo-1537519646099-335112f03225?w=400&h=300&fit=crop',
}

# 웨이포인트용 썸네일 URL (200x150)
WP_THUMBNAIL = {
    '북한산': 'https://images.unsplash.com/photo-1547036967-23d11aacaee0?w=200&h=150&fit=crop',
    '관악산': 'https://images.unsplash.com/photo-1626196340348-b11c6f5f5f3e?w=200&h=150&fit=crop',
    '도봉산': 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=200&h=150&fit=crop',
    '계룡산': 'https://images.unsplash.com/photo-1560707303-4e980ce876ad?w=200&h=150&fit=crop',
    '내장산': 'https://images.unsplash.com/photo-1604999333679-b86d54738315?w=200&h=150&fit=crop',
    '주왕산': 'https://images.unsplash.com/photo-1596451190630-186aff535bf2?w=200&h=150&fit=crop',
    '금정산': 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=200&h=150&fit=crop',
    '설악산': 'https://images.unsplash.com/photo-1537519646099-335112f03225?w=200&h=150&fit=crop',
}


def map_difficulty(band: str) -> str:
    b = band.lower()
    if '초보' in b or '입문' in b:
        return '초급'
    if '고급' in b:
        return '고급'
    return '중급'


def calc_time_str(distance_km: float, elevation_gain_m: float) -> str:
    """Naismith's Rule: 5 km/h + 1시간/600m 고도획득"""
    hours = distance_km / 5.0 + elevation_gain_m / 600.0
    total_min = round(hours * 60 / 30) * 30
    h, m = divmod(total_min, 60)
    if h == 0:
        return f"{m}분"
    if m == 0:
        return f"{h}시간"
    return f"{h}시간 {m}분"


def parse_tags(row: dict) -> list:
    raw = row.get('PeakFit_Tags', '') + ' ' + row.get('Persona_Tags', '')
    tags = {t for t in raw.split() if t.startswith('#') and len(t) > 1}
    # 태그 정규화: 중복/유사 태그 통일
    if '#케이블카찬스' in tags:
        tags.discard('#케이블카찬스')
        tags.add('#케이블카')
    if row.get('입문자추천') == 'O':
        tags.add('#초보가능')
    if row.get('대중교통접근') == 'O':
        tags.add('#대중교통가능')
    if row.get('Course_Type') == '원점회귀':
        tags.add('#원점회귀')
    if row.get('케이블카·곤돌라') == 'O':
        tags.add('#케이블카')
    return sorted(tags)[:6]


def derive_seasons(row: dict) -> list:
    mapping = [('봄_점수', 'spring'), ('여름_점수', 'summer'), ('가을_점수', 'autumn'), ('겨울_점수', 'winter')]
    seasons = []
    for col, season in mapping:
        try:
            if float(row.get(col) or 0) >= 60.0:
                seasons.append(season)
        except ValueError:
            pass
    return seasons or ['spring', 'summer', 'autumn', 'winter']


def safe_float(val, default=0.0):
    try:
        return float(val)
    except (TypeError, ValueError):
        return default


def parse_gpx(gpx_path: str) -> list:
    """GPX 파일에서 (lat, lon, ele) 튜플 리스트를 반환합니다."""
    tree = ET.parse(gpx_path)
    root = tree.getroot()
    ns = root.tag.split('}')[0] + '}' if root.tag.startswith('{') else ''

    points = []
    for trkpt in root.iter(f'{ns}trkpt'):
        lat = float(trkpt.attrib['lat'])
        lon = float(trkpt.attrib['lon'])
        ele_el = trkpt.find(f'{ns}ele')
        ele = float(ele_el.text) if ele_el is not None else 0.0
        points.append((lat, lon, ele))
    return points


def find_gpx_path(mountain: str, filename: str) -> str:
    """산 이름 디렉토리에서 GPX 파일 경로를 찾습니다."""
    candidate = os.path.join(GPX_BASE, mountain, filename)
    if os.path.exists(candidate):
        return candidate
    # 하위 디렉토리 전체 탐색
    for root, dirs, files in os.walk(GPX_BASE):
        if filename in files:
            return os.path.join(root, filename)
    return None


def haversine_m(lat1, lon1, lat2, lon2) -> float:
    R = 6371000
    to_rad = lambda d: d * math.pi / 180
    dLat = to_rad(lat2 - lat1)
    dLon = to_rad(lon2 - lon1)
    a = math.sin(dLat/2)**2 + math.cos(to_rad(lat1)) * math.cos(to_rad(lat2)) * math.sin(dLon/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def cumulative_distance_km(points: list) -> list:
    """각 포인트까지의 누적 거리(km) 리스트를 반환합니다."""
    dists = [0.0]
    for i in range(1, len(points)):
        d = haversine_m(points[i-1][0], points[i-1][1], points[i][0], points[i][1])
        dists.append(dists[-1] + d / 1000.0)
    return dists


def make_waypoints_from_gpx(row: dict, gpx_points: list) -> list:
    """
    GPX 트랙 포인트에서 5개 웨이포인트를 추출합니다:
    1. 출발 (첫 번째 포인트)
    2. 오르막 중간 (최대고도 지점까지의 중간)
    3. 정상부 (최고 고도 지점)
    4. 하산 중간 (정상~끝 중간)
    5. 하산 완료 (마지막 포인트)
    """
    mountain = row['Mountain']
    course_type = row.get('Course_Type', '종주')
    slug = MOUNTAIN_SLUG.get(mountain, mountain)
    total = len(gpx_points)

    # 최고 고도 인덱스 = 정상부
    summit_idx = max(range(total), key=lambda i: gpx_points[i][2])

    # 오르막 중간 인덱스
    ascent_mid_idx = summit_idx // 2

    # 하산 중간 인덱스 (정상~끝 사이)
    descent_mid_idx = summit_idx + (total - summit_idx) // 2

    key_indices = [0, ascent_mid_idx, summit_idx, descent_mid_idx, total - 1]
    cum_dist = cumulative_distance_km(gpx_points)
    total_dist_km = cum_dist[-1]

    wp_types = ['start', 'waypoint', 'summit', 'waypoint', 'end']
    wp_names = [
        f'{mountain} 등산로 입구',
        f'{mountain} 오르막 중간',
        f'{mountain} 정상부 (약 {int(gpx_points[summit_idx][2])}m)',
        f'{mountain} 하산 중간',
        f'{mountain} 하산 완료지점',
    ]
    wp_descs = [
        f'{mountain} GPS 기반 출발지점. {row.get("메모", "").strip()}',
        f'정상부까지 오르는 오르막 구간. 고도 {int(gpx_points[ascent_mid_idx][2])}m.',
        (f'이 코스의 최고 고도 지점 ({int(gpx_points[summit_idx][2])}m). '
         f'{"원점회귀 코스이며 출발지 방향으로 하산합니다." if course_type == "원점회귀" else "종주 코스이며 반대 방향으로 하산합니다."}'),
        f'정상에서 내려오는 하산 구간. 고도 {int(gpx_points[descent_mid_idx][2])}m. 무릎 보호에 주의하세요.',
        f'{mountain} 하산 완료지점. 인근 맛집과 대중교통 이용 가능.',
    ]

    waypoints = []
    for order, (idx, wp_type, name, desc) in enumerate(
            zip(key_indices, wp_types, wp_names, wp_descs), start=1):
        pt = gpx_points[idx]
        dist_from_prev = 0 if order == 1 else round(cum_dist[idx] - cum_dist[key_indices[order - 2]], 2)
        time_from_prev = '출발' if order == 1 else f'약 {calc_time_str(dist_from_prev, abs(pt[2] - gpx_points[key_indices[order-2]][2]))}'

        waypoints.append({
            'order': order,
            'type': wp_type,
            'name': name,
            'lat': round(pt[0], 6),
            'lng': round(pt[1], 6),
            'altitude': round(pt[2], 1),
            'description': desc.strip(),
            'distanceFromPrev': dist_from_prev,
            'timeFromPrev': time_from_prev,
            'thumbnail': WP_THUMBNAIL.get(mountain, f'https://picsum.photos/seed/{slug}-wp{order}/200/150'),
        })
    return waypoints


def make_altitude_profile(gpx_points: list, n_samples: int = 50) -> list:
    """GPX 포인트에서 n_samples개의 고도 프로파일을 균등 샘플링합니다."""
    total = len(gpx_points)
    step = max(1, total // n_samples)
    profile = [round(gpx_points[i][2], 1) for i in range(0, total, step)]
    return profile[:n_samples]


def build_course(row: dict, gpx_points: list) -> dict:
    mountain   = row['Mountain']
    filename   = row['Filename']
    slug       = MOUNTAIN_SLUG.get(mountain, mountain)
    num        = filename.replace(f'{mountain}_', '').replace('.gpx', '')
    short_num  = str(int(num))

    difficulty  = map_difficulty(row.get('Difficulty_Band', ''))
    total_dist  = safe_float(row['Total_Distance_km'])
    elev_gain   = safe_float(row['Elevation_Gain_m'])
    max_elev    = safe_float(row['Max_Elevation_m'])
    min_elev    = safe_float(row['Min_Elevation_m'])
    course_type = row.get('Course_Type', '종주')
    region      = row.get('소재지', '').strip()
    diff_rank   = row.get('Difficulty_Rank', '?')
    total_cnt   = row.get('Mountain_Course_Count', '?')
    persona     = row.get('Persona_Type', '').strip()
    memo        = row.get('메모', '').strip()
    score_end   = round(safe_float(row.get('Score_Endurance')), 1)
    score_joint = round(safe_float(row.get('Score_Joint_Strain')), 1)
    foodie      = round(safe_float(row.get('Foodie_Index_100')), 1)
    best_season = row.get('최고시즌', '').strip()

    name = f"{mountain} {course_type}코스 #{short_num} ({difficulty})"
    est_time = calc_time_str(total_dist, elev_gain)

    waypoints = make_waypoints_from_gpx(row, gpx_points)
    altitude_profile = make_altitude_profile(gpx_points)

    return {
        'id':                 f'{slug}-{short_num}',
        'name':               name,
        'mountain':           mountain,
        'region':             region,
        'difficulty':         difficulty,
        'totalDistance':      round(total_dist, 2),
        'estimatedTime':      est_time,
        'maxAltitude':        round(max_elev, 1),
        'cumulativeAltitude': round(elev_gain, 1),
        'tags':               parse_tags(row),
        'seasons':            derive_seasons(row),
        'thumbnail':          MOUNTAIN_THUMBNAIL.get(mountain, f'https://picsum.photos/seed/{slug}/400/300'),
        'rating':             None,
        'ratingCount':        0,
        'parking':            f'{mountain} 인근 공영주차장 이용 (현장 확인 권장)',  # [샘플]
        'transit':            memo or f'{mountain} 대중교통 접근 가능 (지역 버스·지하철 이용)',
        'cautions': (
            f'누적 고도획득 {int(elev_gain)}m · {course_type} 코스 · '
            f'산 내 난이도 {diff_rank}/{total_cnt}위. '
            f'{"충분한 체력 준비 필요. " if score_end > 60 else ""}'
            f'{"하산 시 무릎 보호대 권장. " if score_joint > 40 else ""}'
            f'일몰 전 하산 필수.'
        ),
        'scoreEndurance':     score_end,
        'scoreJoint':         score_joint,
        'foodieIndex':        foodie,
        'personaType':        persona,
        'courseType':         course_type,
        'difficultyRank':     int(diff_rank) if str(diff_rank).isdigit() else None,
        'totalCourseCount':   int(total_cnt) if str(total_cnt).isdigit() else None,
        'bestSeason':         best_season,
        'waypoints':          waypoints,
        'altitudeProfile':    altitude_profile,
        'relatedArticles': [  # [샘플] - 실제 기사 URL로 교체 필요
            {
                'title': f'{mountain} 코스 완전 정복 — {difficulty} 등산객을 위한 가이드',
                'url': '#',
                'thumbnail': f'https://picsum.photos/seed/{slug}-article1/400/200',
                '_sample': True,
            },
            {
                'title': f'서울 근교 {mountain} 당일치기 등산 후기',
                'url': '#',
                'thumbnail': f'https://picsum.photos/seed/{slug}-article2/400/200',
                '_sample': True,
            },
        ],
        '_source_file': filename,
        '_gpx_points_count': len(gpx_points),
    }


# ── 메인 ──────────────────────────────────────────────────────────────
print(f'[1/3] CSV 읽는 중: {CSV_PATH}')
rows_by_file = {}
with open(CSV_PATH, encoding='utf-8-sig', newline='') as f:
    for row in csv.DictReader(f):
        if row['Filename'] in TARGET_FILES:
            rows_by_file[row['Filename']] = row

print(f'[2/3] GPX 파싱 + {len(rows_by_file)}개 코스 변환 중...')
courses = []
for fn in TARGET_FILES:
    row = rows_by_file.get(fn)
    if not row:
        print(f'  ⚠️  {fn} 를 CSV에서 찾지 못했습니다.')
        continue

    mountain = row['Mountain']
    gpx_path = find_gpx_path(mountain, fn)
    if not gpx_path:
        print(f'  ⚠️  GPX 파일을 찾지 못했습니다: {fn}')
        continue

    gpx_points = parse_gpx(gpx_path)
    summit_idx = max(range(len(gpx_points)), key=lambda i: gpx_points[i][2])
    summit_pt = gpx_points[summit_idx]
    print(f'  GPX 로드: {fn} → {len(gpx_points)}포인트, 실제정상 {summit_pt[2]:.1f}m @ idx={summit_idx}')

    course = build_course(row, gpx_points)
    courses.append(course)
    end_pt = gpx_points[-1]
    print(f'  ✓  [{course["id"]}] {course["name"]}')
    print(f'       거리={course["totalDistance"]}km  소요={course["estimatedTime"]}  '
          f'정상={summit_pt[2]:.1f}m  하산완료={end_pt[2]:.1f}m  태그={course["tags"][:3]}')

with open(OUT_PATH, 'w', encoding='utf-8') as f:
    json.dump(courses, f, ensure_ascii=False, indent=2)

print(f'\n[3/3] 저장 완료 → {OUT_PATH}')
print(f'  코스 수: {len(courses)}개')
print()
print('⚠️  [샘플 데이터 항목 — 실제 데이터로 교체 필요]')
print('  - thumbnail: Unsplash 실사진 적용 완료 ✓')
print('  - waypoints[].thumbnail: Unsplash 실사진 적용 완료 ✓')
print('  - relatedArticles: url="#" 플레이스홀더')
print('  - parking: 일반 안내 문구')
print('  - rating: null (실제 평점 데이터 없음)')
