"""
generate_poi_json.py
PeakFit_POI_Master.csv → data/poi.json 변환 스크립트

실행:
  python scripts/generate_poi_json.py
"""

import csv
import json
import sys
import os
import ast

sys.stdout.reconfigure(encoding='utf-8')

CSV_PATH = os.path.join(os.path.dirname(__file__), '..', '..', 'tracking-pjt', 'data', 'processed', 'PeakFit_POI_Master.csv')
OUT_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'poi.json')


def map_category(raw: str) -> str:
    """Google/네이버 카테고리 → 한국어 단순화"""
    raw = raw.lower()
    # 네이버 직접 카테고리가 있으면 우선 사용 (한글)
    if any(c in raw for c in ['카페', 'cafe', '커피', '베이커리', 'bakery']):
        return '카페'
    if any(c in raw for c in ['냉면', '국밥', '한식', '막국수', '칼국수', '파전', '막걸리']):
        return '한식'
    if 'restaurant' in raw or 'food' in raw or 'meal' in raw:
        return '식당'
    if any(c in raw for c in ['tourist_attraction', '명소', '폭포', '계곡', '전망대', 'waterfall']):
        return '명소'
    if 'bar' in raw or '술집' in raw or '호프' in raw:
        return '술집'
    return '기타'


def parse_hours(raw: str) -> str:
    """영업시간 문자열 파싱 — JSON 배열이면 파이프(|) 구분으로 변환"""
    if not raw:
        return ''
    raw = raw.strip()
    if raw.startswith('['):
        try:
            items = ast.literal_eval(raw)
            # "월요일: 09:00~18:00" 형태로 짧게 정리
            def shorten(s):
                s = s.replace('"', '')
                return s[:30]  # 너무 길면 자르기
            return ' | '.join(shorten(i) for i in items if i)
        except Exception:
            pass
    return raw[:100]  # 안전하게 100자 자르기


def safe_float(val: str, default=None):
    try:
        return float(val)
    except (ValueError, TypeError):
        return default


def safe_rating(val: str):
    """'리뷰점수 없음' 등 비정상 값 처리"""
    if not val or val.strip() in ('리뷰점수 없음', '-', 'None'):
        return None
    return safe_float(val)


print(f"[1/3] CSV 읽는 중: {CSV_PATH}")
records = []

with open(CSV_PATH, encoding='utf-8-sig', newline='') as f:
    reader = csv.DictReader(f)
    for row in reader:
        lat = safe_float(row.get('lat', ''))
        lng = safe_float(row.get('lng', ''))
        if lat is None or lng is None:
            continue  # 좌표 없으면 제외

        dist = safe_float(row.get('nearest_end_dist_m', ''))

        # 카테고리 정제
        category = map_category(row.get('category', ''))

        # 평점 — 네이버 우선, 없으면 구글
        rating_naver = safe_rating(row.get('rating_naver', ''))
        rating_google = safe_float(row.get('rating_google', ''))
        best_rating = rating_naver if rating_naver is not None else rating_google

        # 리뷰 수
        visitor_review = safe_float(row.get('visitor_review', ''))
        user_ratings_total = safe_float(row.get('user_ratings_total', ''))
        review_count = int(visitor_review) if visitor_review else (int(user_ratings_total) if user_ratings_total else 0)

        records.append({
            'mountain_name': row.get('mountain_name', '').strip(),
            'name':          row.get('name', '').strip(),
            'category':      category,
            'address':       row.get('address', '').strip(),
            'lat':           round(lat, 6),
            'lng':           round(lng, 6),
            'rating':        round(best_rating, 2) if best_rating else None,
            'review_count':  review_count,
            'dist_m':        round(dist, 1) if dist is not None else None,
            'hours':         parse_hours(row.get('hours', '')),
            'tv_info':       row.get('tv_info', '').strip() or None,
            'naver_url':     row.get('naver_url', '').strip() or None,
            'source':        row.get('source', '').split(',')[0].strip(),  # 첫 번째 소스만
        })

total = len(records)
print(f"[2/3] 변환 완료: {total}개 레코드")

# 산별 통계
from collections import Counter
mountain_counts = Counter(r['mountain_name'] for r in records)
print(f"  산 수: {len(mountain_counts)}")
for m in ['북한산', '관악산', '설악산']:
    print(f"  {m}: {mountain_counts.get(m, 0)}개")

with open(OUT_PATH, 'w', encoding='utf-8') as f:
    json.dump(records, f, ensure_ascii=False, separators=(',', ':'))

size_kb = os.path.getsize(OUT_PATH) / 1024
print(f"[3/3] 저장 완료: {OUT_PATH}")
print(f"  파일 크기: {size_kb:.1f} KB")
