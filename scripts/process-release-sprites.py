"""Extract the approved static creature atlases without clipping nominal grid edges."""
from pathlib import Path
import importlib.util
import json
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
skill_path = Path.home() / '.codex/skills/generate2dsprite/scripts/generate2dsprite.py'
spec = importlib.util.spec_from_file_location('sprite_processor', skill_path)
processor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(processor)
regions = ['verdant', 'ember', 'moonwell', 'mire', 'gale', 'frost', 'astral']
(ROOT / '.tools').mkdir(exist_ok=True)
ranks = ['N', 'S', 'G', 'H', 'E', 'B']
report = []
preview = Image.new('RGBA', (7 * 256, 6 * 256), '#e9dfbc')
for region_index, region in enumerate(regions):
    destination = ROOT / 'public/assets/release' / region
    destination.mkdir(parents=True, exist_ok=True)
    source = destination / 'creatures-source.png'
    cleaned = processor.remove_bg_magenta(Image.open(source).convert('RGBA'))
    components = processor.connected_components(cleaned, min_area=8)
    bodies = sorted(components[:6], key=lambda c: (int((c['bbox'][1]+c['bbox'][3])/2 >= cleaned.height/2), (c['bbox'][0]+c['bbox'][2])/2))
    assert len(bodies) == 6 and all(c['area'] > 10000 for c in bodies), region
    centers = [((c['bbox'][0]+c['bbox'][2])/2, (c['bbox'][1]+c['bbox'][3])/2) for c in bodies]
    groups = [[] for _ in bodies]
    for component in components:
        x0, y0, x1, y1 = component['bbox']
        center = ((x0+x1)/2, (y0+y1)/2)
        nearest = min(range(6), key=lambda n: (center[0]-centers[n][0])**2 + (center[1]-centers[n][1])**2)
        groups[nearest].append(component)
    for index, group in enumerate(groups):
        # Components are separated by magenta; copy their complete rectangles, not grid slots.
        isolated = Image.new('RGBA', cleaned.size)
        for component in group:
            box = component['bbox']
            isolated.paste(cleaned.crop(box), box[:2])
        bbox = isolated.getbbox()
        assert bbox and min(bbox[0], bbox[1], cleaned.width-bbox[2], cleaned.height-bbox[3]) > 0, (region, ranks[index], 'source clipping')
        sprite = isolated.crop(bbox)
        sprite.thumbnail((216, 216), Image.Resampling.LANCZOS)
        frame = Image.new('RGBA', (256, 256))
        frame.alpha_composite(sprite, ((256-sprite.width)//2, 236-sprite.height))
        alpha = np.asarray(frame.getchannel('A'))
        assert not (alpha[0].any() or alpha[-1].any() or alpha[:, 0].any() or alpha[:, -1].any())
        frame.save(destination / f'{ranks[index]}.png')
        preview.alpha_composite(frame, (region_index*256, index*256))
        report.append({'region': region, 'rank': ranks[index], 'size': [256,256], 'source_bbox': bbox, 'output_bbox': frame.getbbox(), 'edge_contact': False})
(ROOT / '.tools/release-sprite-qa.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
preview.convert('RGB').save(ROOT / '.tools/release-sprite-preview.jpg')
print(f'{len(report)} transparent sprites exported; all source and output edges intact.')
