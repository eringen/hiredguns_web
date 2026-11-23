"""Package the verified, single data track with its CUE for the PUAE core."""
import hashlib
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

disc = Path('external/downloads/HiredGunsCD32_Beta.iso').read_bytes()
if hashlib.sha256(disc).hexdigest() != '7840ef41a664c825bece23099e43754fcb8b325b5564ddb0f689f24f6852cb67':
    raise SystemExit('Unexpected CD32 disc checksum')
out = Path('build/preview')
out.mkdir(parents=True, exist_ok=True)
with ZipFile(out / 'disc.tmp', 'w', ZIP_DEFLATED) as bundle:
    bundle.writestr('Hired Guns.bin', disc)
    bundle.writestr('Hired Guns.cue', 'FILE "Hired Guns.bin" BINARY\n  TRACK 01 MODE1/2048\n    INDEX 01 00:00:00\n')
(out / 'disc.tmp').replace(out / 'hired-guns-cd32.zip')
