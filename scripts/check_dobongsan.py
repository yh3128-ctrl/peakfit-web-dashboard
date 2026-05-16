import os
import sys
import xml.etree.ElementTree as ET

sys.stdout.reconfigure(encoding='utf-8')
gpx_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'tracking-pjt', 'data', 'raw', '100대명산', '도봉산'))

for fn in os.listdir(gpx_dir):
    if not fn.endswith('.gpx'): continue
    try:
        tree = ET.parse(os.path.join(gpx_dir, fn))
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
    except Exception as e:
        pass
