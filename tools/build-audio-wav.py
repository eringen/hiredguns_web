"""Wrap the original signed PCM samples in browser-readable WAV files."""
import json
import struct
import wave
from pathlib import Path

root = Path('build/preview')
target = root / 'art' / 'audio'
target.mkdir(parents=True, exist_ok=True)
manifest = {}

def save(name, samples, start=0, end=0):
    with wave.open(str(target / (name + '.wav')), 'wb') as output:
        output.setnchannels(1)
        output.setsampwidth(1)
        output.setframerate(22050)
        output.writeframes(bytes(value ^ 128 for value in samples))
    manifest[name] = dict(start=start / 22050, end=end / 22050)

for path in root.glob('*.pcm'):
    save(path.stem, path.read_bytes())
for path in [root / 'DoorOpening.8svx', root / 'Lift.8svx', *sorted((root / 'atmos').glob('*.sfx'))]:
    data = path.read_bytes()
    pos = 12
    start = end = 0
    samples = None
    while pos + 8 <= len(data):
        tag = data[pos:pos+4]
        size = struct.unpack_from('>I', data, pos+4)[0]
        body = data[pos+8:pos+8+size]
        if tag == b'VHDR':
            start, length = struct.unpack_from('>II', body)
            end = start + length
        elif tag == b'BODY':
            samples = body
        pos += 8 + size + (size & 1)
    if samples is None or not 0 <= start <= end <= len(samples):
        raise ValueError(f'Invalid audio in {path}')
    save(path.stem, samples, start, end)
(target / 'loops.json').write_text(json.dumps(manifest))
