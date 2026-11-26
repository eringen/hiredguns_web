"""Convert staged HUD planar art to PNG and portable JSON metadata."""
import json, struct, zlib
from pathlib import Path
out=Path('build/preview'); art=out/'art'; art.mkdir(exist_ok=True)
meta={}; palette=(out/'view-palette.bin').read_bytes(); window=(out/'window-palette.bin').read_bytes()
def chunk(t,d): return struct.pack('>I',len(d))+t+d+struct.pack('>I',zlib.crc32(t+d))
def png(name,w,h,pixels,colors):
    rows=b''.join(b'\0'+b''.join(bytes(colors[v*3:v*3+3])+b'\xff' if v>=0 else b'\0'*4 for v in pixels[y*w:(y+1)*w]) for y in range(h))
    (art/(name+'.png')).write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(rows))+chunk(b'IEND',b''))
def planar(name,b,off=18,n=4,masked=True,colors=palette,solid=None):
    w,h,x,y=struct.unpack_from('>HHhh',b,off); start=struct.unpack_from('>I',b,off+10)[0]; stride=w*h//8
    pixels=[]
    for i in range(w*h):
        p=start+i//8; bit=128>>(i%8)
        v=sum(bool(b[p+k*stride]&bit)<<k for k in range(n))
        pixels.append(-1 if (masked and not b[p+n*stride]&bit) or (solid is not None and not v) else solid if solid is not None else v)
    png(name,w,h,pixels,colors); return dict(x=x,y=y,width=w,height=h)
for d in 'nesw': planar('compass-'+d,(out/('compass-'+d+'.bin')).read_bytes(),n=5)
for name,count in [('VertLine',1),('HorizLine',1),('Rotations',4)]:
    b=(out/(name+'.bin')).read_bytes()
    for i in range(count): planar(name+str(i),b,18+i*14)
for name in ['Rip','Exit','Claws','BigClaws']:
    meta[name]=planar(name,(out/(name+'.bin')).read_bytes(),n=1,masked=False,solid=21 if name in ['Rip','Exit'] else 9,colors=window if name in ['Rip','Exit'] else palette)
for name in ['LeaderOff','Leader']:
    b=(out/(name+'.bin')).read_bytes(); pixels=[]
    for i in range(112):
        p=18+i//8; bit=128>>(i%8); pixels.append(sum(bool(b[p+k*14]&bit)<<k for k in range(5)) if b[p+70]&bit else -1)
    png(name,16,7,pixels,window)
for f in out.glob('figure*.bin'):
    b=f.read_bytes()[14224:]
    for i in range(2): planar(f.stem+'-face'+str(i),b,18+i*14)
for f in (out/'styles').glob('*/MapBlocks.bin'):
    b=f.read_bytes()
    for lit in range(2):
        for ident in range((len(b)-18)//128):
            pixels=[sum(((b[18+ident*128+k*32+i//8]>>(7-i%8))&1)<<k for k in range(4))+lit*16 for i in range(256)]
            png('map-'+f.parent.name+'-'+str(ident)+'-'+str(lit),16,16,pixels,palette)
font=(out/'hud-font.bin').read_bytes(); start=int.from_bytes(font[:4],'big')
png('hud-font',16*95,6,[1 if font[start+(x//16)*12+y*2+(x%16)//8]&(128>>(x%8)) else -1 for y in range(6) for x in range(16*95)],b'\0\0\0\xff\xff\xff')
meta['fontWidths']=list(font[20:115]); meta['palette']=list(palette); meta['windowPalette']=list(window)
b=(out/'fire-effects.bin').read_bytes()
def sprite(name,start,h,colors):
    pixels=[sum(bool(b[start+8+y*8+(x//8)+k*4]&(128>>(x%8)))<<k for k in range(2)) for y in range(h) for x in range(32)]
    png(name,32,h,[v if v else -1 for v in pixels],b'\0\0\0'+b''.join(v.to_bytes(3,'big') for v in colors))
equipment=json.loads((out/'equipment.json').read_text())
items=equipment['items'] if isinstance(equipment,dict) else equipment
meta['fire']=[]
for item in items:
    if not item or not item.get('animation'): continue
    anim=item['animation']; color=item['animColor']; key=f'{anim}-{color}'
    if key in meta['fire']: continue
    meta['fire'].append(key)
    def rgb(boost): return sum(17*min(15,((color>>s)&15)+boost if (color>>s)&15 else 0)<<(s*2) for s in [8,4,0])
    for frame in range(5):
        for n in range(2): sprite(f'fire-{key}-{frame}-{n}',200+(anim-1)*3360+frame*672+n*336,40,[0xf1fff3,rgb(3),rgb(0)])
for i in range(36): sprite('impact-'+str(i),10280+144*i,16,[0xffffff,0,0xffb9ab])
for n in range(2): sprite('health-'+str(n),15464+n*152,17,[0xffffff,0xffffff,0xffe1ff])
(art/'hud.json').write_text(json.dumps(meta,separators=(',',':')))
