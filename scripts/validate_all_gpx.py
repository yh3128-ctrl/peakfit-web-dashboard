import os
import sys
import csv
import xml.etree.ElementTree as ET

sys.stdout.reconfigure(encoding='utf-8')
gpx_base = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'tracking-pjt', 'data', 'raw', '100대명산'))
out_csv = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'data', 'best_gpx_per_mountain.csv'))

mountains = [d for d in os.listdir(gpx_base) if os.path.isdir(os.path.join(gpx_base, d))]
results = []

for mnt in mountains:
    mnt_dir = os.path.join(gpx_base, mnt)
    valid_files = []
    
    for fn in os.listdir(mnt_dir):
        if not fn.endswith('.gpx'): continue
        path = os.path.join(mnt_dir, fn)
        try:
            tree = ET.parse(path)
            root = tree.getroot()
            ns = root.tag.split('}')[0] + '}' if root.tag.startswith('{') else ''
            points = []
            for trkpt in root.iter(f'{ns}trkpt'):
                ele_el = trkpt.find(f'{ns}ele')
                if ele_el is not None:
                    points.append(float(ele_el.text))
            
            if len(points) < 100:
                continue # 너무 짧은 데이터 제외
            
            start_ele = points[0]
            max_ele = max(points)
            end_ele = points[-1]
            min_ele = min(points)
            
            # 비현실적 데이터 필터링
            # 정상 고도가 100m 이하면 산이 아님 (오류 데이터)
            if max_ele < 100: continue
                
            # 등반(고도상승)이 총 높이의 30%도 안되면 산 중턱에서 켠 것일 가능성이 큼
            # 단, 지리산/설악산 등 원래 시작고도가 높은 산들이 있으므로 (max_ele - min_ele) 대비 실제 상승폭을 검증
            real_gain = max_ele - min_ele
            actual_gain = max_ele - start_ele
            actual_loss = max_ele - end_ele
            
            if real_gain > 0:
                if actual_gain / real_gain < 0.5: continue # 전체 고도차의 절반도 안올랐으면 스킵
                if actual_loss / real_gain < 0.5: continue # 하산도 마찬가지
            
            # 점수가 높을수록 좋은 데이터: 포인트 수가 많고, 시작 고도가 낮을수록 좋음
            score = len(points) + (real_gain * 2) - start_ele
            valid_files.append({
                'mountain': mnt,
                'filename': fn,
                'pts_count': len(points),
                'start_ele': round(start_ele, 1),
                'max_ele': round(max_ele, 1),
                'end_ele': round(end_ele, 1),
                'score': score
            })
            
        except Exception as e:
            continue
            
    if valid_files:
        # 가장 점수가 높은(포인트 많고 현실적인 고도) 파일 1개 선정
        best = max(valid_files, key=lambda x: x['score'])
        results.append(best)
        print(f"[{mnt}] 채택: {best['filename']} (시작 {best['start_ele']}m -> 정상 {best['max_ele']}m -> 하산 {best['end_ele']}m, 포인트 {best['pts_count']}개)")
    else:
        print(f"[{mnt}] 적합한 GPX 파일을 찾지 못했습니다.")

# 결과를 CSV로 저장
with open(out_csv, 'w', encoding='utf-8-sig', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=['mountain', 'filename', 'pts_count', 'start_ele', 'max_ele', 'end_ele', 'score'])
    writer.writeheader()
    writer.writerows(results)

print(f"\n총 {len(results)}개 산의 최적 GPX 검증 완료! 결과 저장: {out_csv}")
