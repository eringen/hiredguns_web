# Hired Guns — web port

A faithful browser port of the original Hired Guns, using the archived Amiga
CD32 development material as a source reference and allowing its enhanced graphics.

Preserve the original four-character views, gameplay rules, levels, inventory,
combat, puzzles, and atmosphere. A map editor is out of scope.

## Current state

Run `make source` once, then `make preview`. The preview build uses a C compiler,
CMake, and FFmpeg with MP3 encoding to render the archived character-selection
music. The first build downloads libxmp 4.6.2 and verifies its archive checksum.

Start a campaign to select four of the twelve characters. Use Left and Right to slide the portrait strip and Enter to add the highlighted character. Backspace removes the last choice. Press Enter again when the team is complete. Training assigns Cheule, CIM, Rorian and Jenillee.
On the campaign map, hold the arrow keys to move the red crosshair. The map scrolls beneath it. Aim at a dot to read the location report, then press Enter to enter a reachable mission. You can also tap a destination. On a completed area, F1 replays the mission and F2 travels there. A new game starts fresh. Continue a saved game restores a manual save. In a mission, press 1–4 to select a character. Mouse clicks act directly on
the character under the pointer. Click the upper centre to walk forward, the
lower centre to back up, the sides to turn and the lower corners to strafe.
Left-click the centre to use the held item, fire or push a block. Right-click
there to pull or reload. Right-click the pickup area at the lower left when
standing over equipment. The HUD tabs open View, Store, DTS and Stats. In
Store, click the middle pack item to equip it or the held item to stow it.
Click the information icon to read the held item's original description.
Click the yellow team square on each character who should move with the group. Move a team member to lead the others along that character’s recent route.
Arrow keys move and turn. Shift+Left/Right strafes, and Shift+Down pulls. With a hand grenade equipped, Shift+Up cycles four throw powers. Space fires or throws at the selected power. E interacts, and P also pulls. The inventory shows the
original equipment art and descriptions. Equip, stow, reload, drop, and pick up
items independently for each character. Escape opens the mission menu. To reveal the extra HTML controls for the current page, type `details` in the developer console and press Enter. Resume
preserves the current mission, while Start mission resets it. Choose **Save current game** in the mission menu, select one of five positions with F1–F5 or a tap, enter a description and confirm. **Load saved game** in the mission menu and **Continue a saved game** at the title screen open the same five positions. Refresh returns to the opening credits.

For the optional emulated comparison build run `make reference-build`. This
downloads Scripted Amiga Emulator and installs amitools in a local virtual environment.

[Launch the original CD32 beta](http://127.0.0.1:8000/original.html) and select
your 512 KiB `kick40060.CD32`. The browser mounts the archived
`Test/HiredGunsCD32` installation as an Amiga Fast File System volume and runs
its original startup sequence. This path uses a JavaScript AGA emulator with an
A1200 IDE controller and 4 MiB fast RAM. The IDE boot uses the main Kickstart
ROM. Firmware is read in the browser session. The emulated disk is currently
session-local, so refreshing discards changes.

[Explore the level data](http://127.0.0.1:8000/) to inspect all 47 development
maps with their five terrain styles. The disc contains 41 maps. The explorer also
includes the six development maps absent from the disc. The native preview reads the installed CD32 mission when available. The original executable provides a comparison for character selection, campaign
progression, combat, inventory, sound effects and music.

Run `node tools/read-level.mjs` for a text slice of the first training floor.
The [source audit](docs/source-audit.md) describes the 68k sources, and the
[porting plan](docs/porting-plan.md) tracks the independent portable core.

## Obtain and inspect the reference files

Requires Python 3.9 or later, `make`, and `curl`:

```sh
make source
make inventory
```

Or import an existing download:

```sh
python3 tools/import_source.py /path/to/HiredGunsCD32_DevFiles.tar.xz
```

The importer verifies the pinned SHA-256 before extraction, refuses unsafe archive
paths and links, and records every file's size and SHA-256. Repeating an import
checks existing files; it refuses to overwrite modified references.

- `external/original/HiredGunsCD32_DevFiles/` — original reference files.
- `build/source-inventory.json` — reproducible file inventory.
- `docs/` — findings, scope, and implementation milestones.
- `tools/` — project tools; archive executables are never run by the importer.

Downloaded and extracted material and generated output are Git-ignored.

Source: [Internet Archive development files](https://archive.org/details/hired-guns-cd-32-dev-files).
