"""Rebuild the Static.s mission briefing from the installed pictures and location headers."""
import re
import struct
import subprocess
import tempfile
import zlib


def picture(path, target):
    raw = path.read_bytes()
    w, h, planes = 640, 340, 8
    assert len(raw) == 217856
    palette = b''.join(raw[i+1:i+4] for i in range(217600, len(raw), 4))
    # Wrap the non-interleaved HAM bitplanes for the same IFF decoder as the world map.
    stride = w//8
    body = b''.join(raw[(p*h+y)*stride:(p*h+y+1)*stride] for y in range(h) for p in range(planes))
    def chunk(tag, data):
        return tag + struct.pack('>I', len(data)) + data
    header = struct.pack('>HHhhBBBBHBBhh', w,h,0,0,planes,0,0,0,0,1,1,w,h)
    iff = chunk(b'FORM', b'ILBM'+chunk(b'BMHD',header)+chunk(b'CMAP',palette)
                +chunk(b'CAMG',struct.pack('>I',0x800))+chunk(b'BODY',body))
    with tempfile.NamedTemporaryFile(suffix='.ilbm') as f:
        f.write(iff)
        f.flush()
        subprocess.run(['ffmpeg','-loglevel','error','-y','-i',f.name,'-frames:v','1',str(target)],check=True)



def build_briefings(root, out, headers):
    directory = root/'Data/Static.dat'
    installed = root/'Test/HiredGunsCD32/Static'
    for number in sorted({h[527] for h in headers.values()} - {0}):
        path = installed/f'Static{number:02}.pic'
        target = out/f'static-{number}.png'
        if path.stat().st_size == 217856:
            picture(path, target)
        else:
            # The beta shipped HAM6 placeholders here. Use the corresponding
            # CD32 HAM8 conversion or its framed 24-bit development master.
            source = root/f'Graphics/Static/{number}.ham8'
            if not source.exists():
                source = root/f'Graphics/Static/{number}b.24ilbm'
            subprocess.run(['ffmpeg','-loglevel','error','-y','-i',str(source),
                            '-frames:v','1',str(target)],check=True)
    copper = (directory/'StaticCD32.s').read_text().split('C_MOVE\tcolor00,$000',1)[1]
    colors = re.findall(r'color\d+,\$([\da-f]{3})', copper, re.I)
    hi, lo = ['000']+colors[:31], colors[31:63]
    palette = bytes(int(a+b,16) for high,low in zip(hi,lo) for a,b in zip(high,low))
    panel = (directory/'PanelCD32.pic').read_bytes()
    font = (directory/'StaticCD32.font').read_bytes()
    start,w,h,mask,planes = struct.unpack_from('>I4H',font)
    def pixel(data, i, size, count, offset=0):
        return sum(((data[offset+p*size+i//8] >> (7-i%8)) & 1)<<p for p in range(count))
    width,height = 640,102
    background = bytearray(pixel(panel,i,width*height//8,5) for i in range(width*height))
    def chunk(tag, data):
        return struct.pack('>I',len(data))+tag+data+struct.pack('>I',zlib.crc32(tag+data))
    for ident,header in headers.items():
        pixels = background.copy()
        for pos in range(260,524,66):
            if header[pos] != 251:
                continue
            x,y = struct.unpack_from('>HH',header,pos+1)
            y = y*2+10
            line = header[pos+6:pos+66].split(b'\0')[0].rstrip(b'~')
            if header[pos+5] == 252:  # CENTRE
                x = width//2 - sum(font[20+c-32] for c in line if 32 <= c < 128)//2
            for char in line:
                g = char-32
                if not 0 <= g < 96:
                    continue
                for i in range(w*h):
                    ink = pixel(font,i,w*h//8,planes,start+g*w*h//8*planes)
                    xx,yy = x+i%w,y+i//w
                    if ink & (1<<mask) and 0<=xx<width and 0<=yy<height:
                        pixels[yy*width+xx] = ink & 7
                x += font[20+g]
        rows = b''.join(b'\0'+pixels[y*width:(y+1)*width] for y in range(height))
        (out/f'briefing-{ident}.png').write_bytes(b'\x89PNG\r\n\x1a\n'+
            chunk(b'IHDR',struct.pack('>IIBBBBB',width,height,8,3,0,0,0))+
            chunk(b'PLTE',palette)+chunk(b'IDAT',zlib.compress(rows))+chunk(b'IEND',b''))
