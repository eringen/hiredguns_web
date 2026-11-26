"""Bake menu fonts, copper color variants, file fill and mission skies into PNGs."""
import json
import struct
from pathlib import Path
from PIL import Image

out = Path('build/preview')
art = out / 'art'
colors = json.loads((art/'front-colors.json').read_text())
for name, world in [('menu-font',False),('menu-title',False),('world-font',True)]:
    data = (out/(name+'.bin')).read_bytes()
    start,w,h,mask,planes = struct.unpack_from('>I4H',data)
    stride = w*h//8
    palette = [[0,0,0],[255,255,255],[170,170,170],[102,102,102]] if world else [colors['palette'][i:i+3] for i in range(0,96,3)]
    image = Image.new('RGBA',(96*w,h))
    pixels = image.load()
    for g in range(96):
        for i in range(w*h):
            pos = start+g*stride*planes+i//8
            bit = 128>>(i%8)
            if pos+mask*stride<len(data) and data[pos+mask*stride]&bit:
                ink = sum((1<<n) for n in range(2 if world else 3) if data[pos+n*stride]&bit)
                pixels[g*w+i%w,i//w] = (*palette[ink],255)
    image.save(art/(name+'.png'))
    (art/(name+'.json')).write_text(json.dumps(dict(width=w,height=h,widths=list(data[20:116]))))
palette = (out/'view-palette.bin').read_bytes()
fill = (out/'Fill.bin').read_bytes()
image = Image.new('RGB',(320,2))
image.putdata([tuple(palette[3*ink:3*ink+3]) for i in range(640) for ink in [sum(((fill[32+p*80+i//8]>>(7-i%8))&1)<<p for p in range(5))]])
image.save(art/'file-fill.png')
(art/'file-colors.json').write_text(json.dumps(list(palette)))
# Each PNG uses the final original RGB palette, including copper scan band variants.
indices = Image.open(art/'front-cards.png')
for variant,band in enumerate([[0,0,0]]+colors['bands']):
    pal = [v if i<48 else (min(15,(v>>4)+band[i%3])<<4)|(v&15) for i,v in enumerate(colors['palette'])]
    image = indices.copy()
    image.putpalette(pal)
    image.save(art/f'front-cards-{variant}.png')
tables = json.loads((out/'sky.json').read_text())
planet = (out/'Planet.bin').read_bytes()
planet_start = struct.unpack_from('>I',planet,28)[0]
def bit(data,start,i):
    return data[start+i//8] & (128>>(i%8))
for path in (out/'maps').glob('*.map'):
    data = path.read_bytes()
    sky = data[532]
    image = Image.new('RGB',(144,84*4))
    pixels = image.load()
    for direction in range(4):
        for y in range(84):
            line = 44*sky+min(43,y+2)
            for x in range(144):
                color = tables['nosky'][line] if y<42 else [0,0,0]
                if direction==2 and 20<=x<116 and y<42 and bit(planet,planet_start,y*96+x-20):
                    color = tables['nosky_planet'][line]
                if 10<=y<42:
                    k = (y-10)*144+x
                    if bit(data,1208+576*((direction+2)%4),k): color=tables['scotch_mist'][line]
                    if bit(data,1208+576*direction,k): color=[0,0,0]
                pixels[x,direction*84+y] = tuple(color)
    image.save(art/f'sky-{int(path.stem)}.png')
