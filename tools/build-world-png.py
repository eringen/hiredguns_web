#!/usr/bin/env python3
"""Convert projected world sprites to RGBA PNG atlases and placement metadata."""
import json
import struct
import sys
from pathlib import Path
from PIL import Image

def build(root):
    palette = (root / 'view-palette.bin').read_bytes()

    def sheet(data, target, mode=False, count=67, planes=(0, 1, 2, 3), colors=palette):
        if target.parent == root:
            target = root / "art" / "world" / target.name
        records = []
        unique = {}
        images = []
        lit = []
        indices = []

        def byte_at(offset):
            return data[offset] if offset < len(data) else 0
        for i in range(count):
            (w, h, x, y, control, start) = struct.unpack_from('>hhhhhI', data, 18 + i * 14)
            if not w or not h or control == 3:
                records.append(None)
                continue
            key = (start, w, h)
            if key not in unique:
                stride = w * h // 8
                normal = Image.new('RGBA', (w, h))
                bright = Image.new('RGBA', (w, h))
                indexed = Image.new('RGBA', (w, h))
                a = []
                b = []
                c = []
                for p in range(w * h):
                    byte = start + (p >> 3)
                    bit = 7 - (p & 7)
                    visible = bool(byte_at(byte + (0 if mode else len(planes) * stride)) & 1 << bit)
                    index = sum(((byte_at(byte + n * stride) >> bit & 1) << plane for (n, plane) in enumerate(planes))) if not mode else 0
                    color = (1, 254, 1) if mode == 'field' else tuple(colors[51:54]) if mode == 'foam' else (0, 0, 0) if mode else tuple(colors[index * 3:index * 3 + 3])
                    a.append((*color, 255 if visible else 0))
                    bright_index = index | 32
                    b.append((*colors[bright_index * 3:bright_index * 3 + 3], 255 if visible else 0) if not mode and len(colors) == 192 and (len(planes) == 4) else a[-1])
                    c.append((index, 0, 0, 255 if visible else 0))
                normal.putdata(a)
                bright.putdata(b)
                indexed.putdata(c)
                unique[key] = len(images)
                images.append(normal)
                lit.append(bright)
                indices.append(indexed)
            records.append(dict(image=unique[key], x=x, y=y, control=control))
        width = max((im.width for im in images), default=1)
        height = max(1, sum((im.height for im in images)))
        boxes = []
        top = 0
        for im in images:
            boxes.append([0, top, im.width, im.height])
            top += im.height
        target.parent.mkdir(parents=True, exist_ok=True)

        def save(parts, suffix):
            atlas = Image.new('RGBA', (width, height))
            for (im, box) in zip(parts, boxes):
                atlas.paste(im, (0, box[1]))
            atlas.save(target.with_name(target.name + suffix + '.png'))
        save(images, '')
        save(indices, '-indices')
        illuminated = not mode and len(colors) == 192 and (len(planes) == 4)
        if illuminated:
            save(lit, '-lit')
        target.with_suffix('.json').write_text(json.dumps(dict(sprites=records, boxes=boxes, lit=illuminated, mask=mode is True), separators=(',', ':')))
    for style in sorted((root / 'styles').iterdir()):
        if not style.is_dir():
            continue
        for name in ('Stone', 'Grass'):
            sheet((style / (name + '.bin')).read_bytes(), style / name)
        bank = (style / 'terrain.bin').read_bytes()
        for (name, (offset, size)) in json.loads((style / 'terrain.json').read_text()).items():
            sheet(bank[offset:offset + size], style / ('terrain-' + name), 'field' if name == 'field' else False)
    for path in root.glob('figure*.bin'):
        data = path.read_bytes()
        for d in range(4):
            sheet(data[d * 3556:(d + 1) * 3556], root / (path.stem + '-' + str(d)))
    for path in root.glob('Monster*.bin'):
        data = path.read_bytes()
        for d in range(4):
            sheet(data[d * 3556:(d + 1) * 3556], root / (path.stem + '-' + str(d)))
        sheet(data[14224:16710], root / (path.stem + '-remains'))
        sheet(data[16710:], root / (path.stem + '-attack'), count=1)
    for name in ('Skeleton', 'Grenade'):
        sheet((root / (name + '.bin')).read_bytes(), root / name)
    for name in [*(f'Water{n}' for n in range(1, 5)), *(f'Light{n}' for n in range(1, 4))]:
        sheet((root / (name + '.bin')).read_bytes(), root / name, True)
    sheet((root / 'Foam.bin').read_bytes(), root / 'Foam', 'foam', 4)
    explosion = (root / 'explosion-palette.bin').read_bytes()
    for n in range(1, 5):
        sheet((root / f'expl{n}.bin').read_bytes(), root / f'expl{n}', planes=(0, 3, 5), colors=explosion)
if __name__ == '__main__':
    build(Path(sys.argv[1] if len(sys.argv) > 1 else 'build/preview'))
