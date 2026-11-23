#!/usr/bin/env python3
"""Verify and inventory the original archive, optionally extracting local references."""

import argparse
import collections
import hashlib
import json
from pathlib import Path, PurePosixPath
import tarfile


ROOT = Path(__file__).resolve().parents[1]
ARCHIVE_ROOT = "HiredGunsCD32_DevFiles"
SHA256 = "2af127e6f96215dad311b3e52683e84ef03c0680ee6335fad1f29e5a1890efdd"
SOURCE_URL = (
    "https://archive.org/download/hired-guns-cd-32-dev-files/"
    "HiredGunsCD32_DevFiles.tar.xz"
)


def digest_file(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def safe_destination(base, name):
    relative = PurePosixPath(name)
    if (
        relative.is_absolute()
        or ".." in relative.parts
        or not relative.parts
        or relative.parts[0] != ARCHIVE_ROOT
    ):
        raise ValueError("Unexpected archive path: " + name)
    destination = base.joinpath(*relative.parts)
    # Also reject existing symlinks, including ones pointing inside the tree.
    current = destination
    while current != base:
        if current.is_symlink():
            raise ValueError("Refusing to follow symlink: " + str(current))
        current = current.parent
    return destination


def import_source(archive, inventory_only=False):
    actual = digest_file(archive)
    if actual != SHA256:
        raise ValueError("Archive SHA-256 mismatch: " + actual)

    base = ROOT / "external" / "original"
    if base.is_symlink() or base.parent.is_symlink():
        raise ValueError("Reference directory must not be a symlink")
    records = []
    with tarfile.open(archive, "r:xz") as bundle:
        members = bundle.getmembers()
        # Validate every path/type before writing any archive contents.
        for member in members:
            safe_destination(base, member.name)
            if not (member.isfile() or member.isdir()):
                raise ValueError("Unsupported archive entry: " + member.name)
        for member in members:
            destination = safe_destination(base, member.name)
            if member.isdir():
                if not inventory_only:
                    destination.mkdir(parents=True, exist_ok=True)
                continue
            with bundle.extractfile(member) as stream:
                # Read once: rewinding an xz stream for each member would repeatedly
                # decompress the preceding archive. The archive hash pins its size.
                data = stream.read()
            digest = hashlib.sha256(data).hexdigest()
            relative = PurePosixPath(member.name).relative_to(ARCHIVE_ROOT)
            records.append({
                "path": str(relative),
                "bytes": member.size,
                "sha256": digest,
            })
            if not inventory_only:
                destination.parent.mkdir(parents=True, exist_ok=True)
                if destination.exists():
                    if digest_file(destination) != digest:
                        raise ValueError("Existing reference differs: " + str(destination))
                    continue
                # Never run archive tools or preserve executable permissions.
                with destination.open("xb") as output:
                    output.write(data)

    records.sort(key=lambda record: record["path"])
    extensions = collections.Counter(
        PurePosixPath(record["path"]).suffix.lower() or "(none)"
        for record in records
    )
    inventory = {
        "source_url": SOURCE_URL,
        "archive_sha256": actual,
        "file_count": len(records),
        "total_bytes": sum(record["bytes"] for record in records),
        "extensions": dict(sorted(extensions.items())),
        "files": records,
    }
    output = ROOT / "build" / "source-inventory.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(inventory, indent=2) + "\n", encoding="utf-8")
    print("Verified {} files ({} bytes).".format(len(records), inventory["total_bytes"]))
    print("Inventory: " + str(output))
    if not inventory_only:
        print("References: " + str(base / ARCHIVE_ROOT))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    parser.add_argument("--inventory-only", action="store_true")
    args = parser.parse_args()
    try:
        import_source(args.archive, args.inventory_only)
    except (OSError, ValueError, tarfile.TarError) as error:
        parser.exit(1, "error: {}\n".format(error))


if __name__ == "__main__":
    main()
