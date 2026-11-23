"""Build a bootable Amiga volume and stage the pinned browser emulator."""
import argparse
import hashlib
import re
import subprocess
import tarfile
import tempfile
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--xdftool', required=True)
parser.add_argument('--runtime', type=Path, required=True)
args = parser.parse_args()
out = Path('build/preview')
out.mkdir(parents=True, exist_ok=True)
source = Path('external/original/HiredGunsCD32_DevFiles/Test/HiredGunsCD32')
if not (source / 'Hired Guns').is_file():
    parser.error('Run make source to import the original game.')
if hashlib.sha256(args.runtime.read_bytes()).hexdigest() != 'b98bd6a887cb4a37f134fe7d0e685240e69c0f5f5d5c5e1e95a4d2662be1c0e3':
    parser.error('Unexpected Scripted Amiga Emulator archive.')
with tarfile.open(args.runtime) as tar:
    prefix = tar.getmembers()[0].name + '/'
    def read(path):
        return tar.extractfile(prefix + path).read()
    scripts = re.findall(rb'src="(sae/[^"]+\.js)"', read('example2.htm'))
    (out / 'sae.js').write_bytes(b'\n'.join(read(s.decode()) for s in scripts))
    (out / 'sae').mkdir(exist_ok=True)
    (out / 'sae/audio_worklet.js').write_bytes(read('sae/audio_worklet.js'))
    (out / 'sae/license.html').write_bytes(read('gpl.htm'))

with tempfile.TemporaryDirectory(dir=out.parent) as staging:
    image = Path(staging) / 'HiredGuns.hdf'
    command = [args.xdftool, str(image), 'create', 'size=32M', '+', 'format', 'HiredGuns', 'ffs']
    for entry in sorted(source.iterdir()):
        command.extend(['+', 'write', str(entry)])
    subprocess.run(command, check=True)
    image.replace(out / image.name)
