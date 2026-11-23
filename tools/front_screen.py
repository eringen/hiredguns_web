"""Composite the CD32 front end from the original bitplanes and proportional fonts."""
import json
import re
import struct
import zlib


def build_front(root, out):
    front = root / 'Test/HiredGunsCD32/Front'
    copper = (root / 'Data/Front.dat/FrontCD32.s').read_text()
    banks = re.findall(r'C_BANK\s+0,(?:HI|LO)(.*?)(?=C_BANK)', copper, re.S)
    colors = [re.findall(r'C_MOVE\s+color\d+,\$([0-9a-f]{3})', bank) for bank in banks[:2]]
    palette = bytes(int(a+b,16) for hi,lo in zip(*colors) for a,b in zip(hi,lo))
    if len(palette) != 96:
        raise ValueError('Invalid CD32 front palette')

    def pixel(data, base, plane_size, bit, count):
        return sum(((data[base+n*plane_size] >> bit) & 1) << n for n in range(count))

    data = (front / 'Fill.dat').read_bytes()
    offset,w,h = struct.unpack_from('>IHH', data)
    area = w*h//8
    screen = bytearray(pixel(data,offset+i//8,area,7-i%8,5) for i in range(w*h))

    def label(font, text, x, y, high=0):
        start,width,height,mask,planes = struct.unpack_from('>I4H',font)
        glyphs = [ord(char)-32 for char in text]
        if x is None:
            x = w//2 - sum(font[20+i] for i in glyphs)//2
        y -= 25  # Front.s places the drawing buffer 25 lines before the display.
        plane_size = width*height//8
        for glyph in glyphs:
            base = start + glyph*plane_size*planes
            for row in range(height):
                for col in range(width):
                    pos = row*width+col
                    value = pixel(font,base+pos//8,plane_size,7-pos%8,planes)
                    if value & (1<<mask) and 0<=x+col<w and 0<=y+row<h:
                        screen[(y+row)*w+x+col] = high | (value & 7)
            x += font[20+glyph]

    def chunk(tag, payload):
        return struct.pack('>I',len(payload))+tag+payload+struct.pack('>I',zlib.crc32(tag+payload))

    def save(name):
        scanlines = b''.join(b'\0'+screen[y*w:(y+1)*w] for y in range(h))
        (out/name).write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,3,0,0,0))
                               +chunk(b'PLTE',palette)+chunk(b'IDAT',zlib.compress(scanlines))+chunk(b'IEND',b''))

    save('front-rock.png')
    big = (root / 'Data/Front.dat/FrontB.font').read_bytes()
    small = (front / 'Mesg.dat').read_bytes()
    label(big, "()2%$ '5.3", None, 34)
    label((front/'SmallMesg.dat').read_bytes(), 'AMIGA   CD   AGA   V39.26', None, 89, 8)
    header = screen[:]
    cards = [header]
    for title,y in [('Training',182),('Full campaign game',226),('Short action game',270),('Continue a saved game',344)]:
        label(small,title,75,y)
    save('front.png')
    cards.append(screen[:])

    # Select the CD32 branches of Front.s and expand the original English phrasebook.
    source = (root/'Sources/Front.s').read_text('latin1')
    book = (root/'Sources/engtext').read_bytes()
    def phrase(number):
        offset = struct.unpack_from('>H',book,(number-1)*2)[0]
        return book[offset:book.index(245,offset)].replace(b'\xfc',b'').decode('latin1')
    credits = [1,2,3,4,17,18,5,8,9,6]
    for number in credits:
        screen[:] = header
        block = source.split(f'\ncredit{number}_text',1)[1].split('ENDTEXT',1)[0]
        block = re.sub(r'IFD\s+CD32(.*?)ELSEIF.*?ENDC',r'\1',block,flags=re.S)
        y = int(re.search(r'0,(\d+)>>8',block)[1])
        lines = ''
        for line in block.splitlines():
            ref = re.search(r'PHRASE\s+(\d+)',line)
            if ref:
                lines += phrase(int(ref[1]))
            elif 'dc.b' in line:
                lines += ''.join('þ' if token=='NEWLINE' else token[1:-1]
                                 for token in re.findall(r'"[^"]*"|NEWLINE',line))
        for text in lines.split('þ'):
            if text:
                label(small,text,None,y)
            y += 44
        if number==1:
            save('front-credit.png')
        cards.append(screen[:])

    # Store the color indices losslessly so the moving copper bands affect only rock colors.
    gray = bytes(v for i in range(32) for v in (i,i,i))
    rows = b''.join(b'\0'+card[y*w:(y+1)*w] for card in cards for y in range(h))
    (out/'front-cards.png').write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,h*len(cards),8,3,0,0,0))
        +chunk(b'PLTE',gray)+chunk(b'IDAT',zlib.compress(rows))+chunk(b'IEND',b''))
    bands = [list(map(int,m)) for m in re.findall(r'SCAN\s+color16,\$0,\$0,\$0,(\d+),(\d+),(\d+)',copper)]
    assert len(bands)==15
    (out/'front-colors.json').write_text(json.dumps(dict(palette=list(palette),bands=bands)))

    # position_cursor joins six 32-pixel sprites to the right cap for a seven-wide frame.
    cursor = (root / 'Data/Front.dat/CursorCD32.hws').read_bytes()
    rows = bytearray()
    for y in range(22):
        rows.append(0)
        for tile in [0,1,2,3,4,5,7]:
            left,right = struct.unpack_from('>II',cursor,tile*192+8+y*8)
            for shift in range(31,-1,-1):
                rows.append(((left >> shift) & 1) | (((right >> shift) & 1) << 1))
    (out/'front-cursor.png').write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',224,22,8,3,0,0,0))
        +chunk(b'PLTE',bytes.fromhex('000000 ffffff bbbbbb 666666'))+chunk(b'tRNS',b'\0')
        +chunk(b'IDAT',zlib.compress(rows))+chunk(b'IEND',b''))
