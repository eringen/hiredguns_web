"""Decode the development build's indexed ILBM sheets and crunched figures."""
import struct
import zlib


def unpack_figure(data):
    # Sources/Miscroutines.s, decrunchc. The stream and destination run backwards.
    remaining, checksum, size, cursor = struct.unpack_from('>BBII', data)
    output = bytearray(size)
    dest = size
    cursor -= 1
    current = data[cursor]
    checksum ^= current

    def bits(count):
        nonlocal remaining, current, checksum, cursor
        value = 0
        for _ in range(count):
            if not remaining:
                cursor -= 1
                if cursor < 10:
                    raise ValueError('Short figure stream')
                current = data[cursor]
                checksum ^= current
                remaining = 8
            value = value * 2 + (current & 1)
            current >>= 1
            remaining -= 1
        return value

    while dest:
        distance = 0
        if bits(1):
            mode = bits(2)
            if mode < 2:
                count, distance = mode + 3, bits(9 + mode) + 1
            elif mode == 2:
                count, distance = bits(8) + 1, bits(12) + 1
            else:
                count = bits(8) + 9
        elif bits(1):
            count, distance = 2, bits(8) + 1
        else:
            count = bits(3) + 1
        if count > dest or dest + distance > size:
            raise ValueError('Invalid figure run')
        for _ in range(count):
            dest -= 1
            output[dest] = output[dest + distance] if distance else bits(8)
    if checksum:
        raise ValueError('Figure checksum mismatch')
    return output


def cut_sheet(path, rectangles, destination, prefix, transparency=b'', palette=None):
    data = path.read_bytes()
    chunks = {}
    pos = 12
    while pos + 8 <= len(data):
        length = int.from_bytes(data[pos+4:pos+8], 'big')
        chunks[data[pos:pos+4]] = data[pos+8:pos+8+length]
        pos += 8 + length + (length & 1)
    width, height, _, _, planes, mask, compression = struct.unpack_from('>HHhhBBB', chunks[b'BMHD'])
    if mask or compression != 1:
        raise ValueError(f'Unexpected ILBM encoding in {path}')
    stride = ((width + 15) // 16) * 2
    body = chunks[b'BODY']
    raw = bytearray()
    pos = 0
    while pos < len(body):
        code = body[pos]
        pos += 1
        if code < 128:
            raw.extend(body[pos:pos+code+1])
            pos += code+1
        elif code > 128:
            raw.extend(body[pos:pos+1] * (257-code))
            pos += 1
    if len(raw) != stride * planes * height:
        raise ValueError(f'Invalid ILBM raster in {path}')
    def chunk(tag, payload):
        return struct.pack('>I', len(payload)) + tag + payload + struct.pack('>I', zlib.crc32(tag + payload))
    destination.mkdir(exist_ok=True, parents=True)
    for i, (left, top, w, h) in enumerate(rectangles):
        raster = bytearray()
        for y in range(top, top+h):
            raster.append(0)
            for x in range(left, left+w):
                start = y*planes*stride + x//8
                raster.append(sum(((raw[start+n*stride] >> (7-x%8)) & 1) << n for n in range(planes)))
        png = (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w,h,8,3,0,0,0))
               + chunk(b'PLTE', palette or chunks[b'CMAP']) + (chunk(b'tRNS', transparency) if transparency else b'') + chunk(b'IDAT', zlib.compress(raster)) + chunk(b'IEND', b''))
        (destination / f'{prefix}{i}.png').write_bytes(png)


def cut_item_bobs(binary, sheet, destination):
    # ItemsCD32.s stores six colour planes followed by the blitter mask.
    data = binary.read_bytes()
    ilbm = sheet.read_bytes()
    palette = ilbm.index(b'CMAP') + 8
    colors = ilbm[palette:palette + int.from_bytes(ilbm[palette-4:palette], 'big')]
    def chunk(tag, value):
        return struct.pack('>I', len(value)) + tag + value + struct.pack('>I', zlib.crc32(tag + value))
    for i in range(90):
        w,h,x,y,control,start = struct.unpack_from('>HHhhhI', data, 18+i*14)
        stride = w*h//8
        if start+stride*7 > len(data) or control != 0:
            raise ValueError(f'Invalid CD32 item image {i}')
        pixels = bytearray()
        for row in range(h):
            pixels.append(0)
            for col in range(w):
                pixel=row*w+col
                byte=start+pixel//8
                bit=7-pixel%8
                if data[byte+stride*6] & (1<<bit):
                    index=sum(((data[byte+n*stride]>>bit)&1)<<n for n in range(6))
                    pixels.extend(colors[index*3:index*3+3]+b'\xff')
                else:
                    pixels.extend(b'\0'*4)
        png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,6,0,0,0))
        (destination/f'item{i}.png').write_bytes(png+chunk(b'IDAT',zlib.compress(pixels))+chunk(b'IEND',b''))
