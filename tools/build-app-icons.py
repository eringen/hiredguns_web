#!/usr/bin/env python3
"""Extract the classic Workbench icon; no generated replacement artwork."""
from pathlib import Path
import struct
from PIL import Image

root = Path(__file__).resolve().parents[1]
source = root / 'external/original/HiredGunsCD32_DevFiles/Test/HiredGuns/Hired Guns.info'
data = source.read_bytes()
assert data[:2] == b'\xe3\x10'
# DiskObject (78 bytes), followed by its normal-state Image structure.
x, y, width, height, depth, pointer, pick, onoff, next_image = struct.unpack_from('>hhhhhIBBI', data, 78)
assert (depth, pick, onoff, next_image) == (3, 7, 0, 0)
stride = ((width + 15) // 16) * 2
raster = data[98:98 + stride * height * depth]
indices = [sum(((raster[p * stride * height + y * stride + x // 8] >> (7 - x % 8)) & 1) << p
               for p in range(depth)) for y in range(height) for x in range(width)]
# This classic icon has no private palette and uses Workbench pens 0–3 only.
assert max(indices) <= 3
palette = [(170, 170, 170), (0, 0, 0), (255, 255, 255), (102, 136, 187)]
art = Image.new('RGB', (width, height))
art.putdata([palette[i] for i in indices])
out = root / 'web/app-icons'
out.mkdir(exist_ok=True)
for size, maskable in [(180, False), (192, False), (512, False), (512, True)]:
    # Keep the rectangular artwork within Android's circular mask safe zone.
    scale = size * (0.70 if maskable else 0.92) / width
    scaled = art.resize((round(width * scale), round(height * scale)), Image.Resampling.NEAREST)
    icon = Image.new('RGB', (size, size), palette[0])
    icon.paste(scaled, ((size - scaled.width) // 2, (size - scaled.height) // 2))
    icon.save(out / f'hired-guns-{"maskable-" if maskable else ""}{size}.png')
