import os
import sys
import xml.etree.ElementTree as ET

sys.stdout.reconfigure(encoding='utf-8')
gpx_base = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'tracking-pjt', 'data', 'raw', '100대명산'))

targets = [
    ('북한산', '북한산_0000000031.gpx'),
    ('관악산', '관악산_0000000001.gpx'),
    ('도봉산', '도봉산_0000000003.gpx'),
    ('계룡산', '계룡산_0000000002.gpx'),
    ('내장산', '내장산_0000000001.gpx'),
    ('주왕산', '주왕산_0000000001.gpx'),
    ('금정산', '금정산_0000000001.gpx'),
    ('설악산', '설악산_0000000008.gpx'),
]

for mnt, fn in targets:
    path = os.path.join(gpx_base, mnt, fn)
    if not os.path.exists(path):
        print(f"Missing: {fn}")
        continue
    tree = ET.parse(path)
    root = tree.getroot()
    ns = root.tag.split('}')[0] + '}' if root.tag.startswith('{') else ''
    points = []
    for trkpt in root.iter(f'{ns}trkpt'):
        ele_el = trkpt.find(f'{ns}ele')
        if ele_el is not None:
            points.append(float(ele_el.text))
    if not points: continue
    start_ele = points[0]
    end_ele = points[-1]
    max_ele = max(points)
    max_idx = points.index(max_ele)
    print(f'{fn}: pts={len(points):<4}, start={start_ele:<5.1f}m, max={max_ele:<5.1f}m (@{max_idx:<3}), end={end_ele:<5.1f}m')
