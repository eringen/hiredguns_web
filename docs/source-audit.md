# Original source audit

Inspected on 2026-11-21. Counts describe top-level archive members, without
unpacking the nested `.lha` archives.

## Provenance

- Item: <https://archive.org/details/hired-guns-cd-32-dev-files>
- Metadata: <https://archive.org/metadata/hired-guns-cd-32-dev-files>
- Download: `HiredGunsCD32_DevFiles.tar.xz`, 60,707,932 bytes.
- Archive SHA-1, matching Internet Archive metadata:
  `621d17bf34a9d60387dc5f6b529efc4058e05c12`.
- Locally computed SHA-256:
  `2af127e6f96215dad311b3e52683e84ef03c0680ee6335fad1f29e5a1890efdd`.
- 2,305 regular files, 104,993,600 uncompressed bytes; 2,477 total entries.
- The 16,173,056-byte beta ISO matches SHA-1 cc44afbe5b637256bbf3bddbbf53f3a2a0e20131. Its ISO directory includes 41 maps, five graphics styles, 19 monster graphics files, environmental samples, item graphics, the intro module, and five static-screen music modules. The browser boots the corresponding development installation from a virtual hard disk.

The uploader describes the CD32 build as incomplete and potentially non-working.
This is not evidence of a verified runnable release. The item has a Public Domain
Mark in its metadata, while source files retain original copyright notices; this
audit makes no determination about redistribution rights. No game files are tracked.

## Engine evidence

Paths below are relative to `external/original/HiredGunsCD32_DevFiles/`.

| Evidence | Finding |
| --- | --- |
| `Sources/Main.s` | 68k assembly; `CD32` enabled; `p=68020`; version `3926`, compatible version `3925`. |
| `Sources/Makefiles/Executeable` | Uses `genam`; original Amiga assigns and tool paths; not a portable C build. |
| `Sources/Hardware.i` | Amiga custom registers at `$dff000`, blitter, Copper, bitplanes, audio and CIA registers. |
| `Sources/Drawviews.s` | Four character views, planar buffers, blitter waits, Copper updates, vertical blank synchronization. |
| `Sources/Controls&Movement.s` | Original movement/input behavior to trace and port. |
| `Sources/MonsterMovement.s`, `Sources/ItemUsage.s` | Monster and item behavior reference. |
| `Sources/Equates.i`, `Sources/Data/Characters.s` | Game layout/constants and character definitions. |
| `Sources/RNC_1.S` | Original decompression routine, useful for validating packed asset decoding. |
| `Sources/MEDmodplayer.s` | Original music playback implementation; audio compatibility needs investigation. |
| `Sources/Versions` | Calls version `3925` a master and `3926` a patch; does not establish equivalence of this CD32 tree to the shipped game. |

There are 288 `.s` files and eight `.i` files across the archive. Many are asset
definitions rather than executable game logic. C exists mainly in the map editor,
plus a CD32 intro; it is not a portable implementation of the game engine.

## Existing content

The archive includes 231 `.ilbm`, 61 `.8svx`, 138 `.map`, 51 `.rnc`, and
18 `.mod` files. These are extension counts, not counts of unique usable assets.
There are additional raw graphics, packed data, audio, and alternate revisions.

CD32-specific data assembly is present in character selection, frontend, static
screens, world map, miscellaneous graphics, and Copper lists. Select compatible
assets by examining their palettes, dimensions, layout, and actual game use.

`Maps/Game/Map43_Training/43.map` is a 157,738-byte uncompressed candidate for the
first level parser; a 4,967-byte `.rnc` version and panel/horizon ILBMs are alongside
it. The raw reader consumes the 542-byte location record followed by the map structure. The three big-endian cell planes begin at file offsets 28478, 71718 and 114958. The compressed companion begins with RNC method 1 and declares a decoded length of 157738 bytes.

`MapEditor/HGmapstructure.h` describes 23 × 23 × 20 map cells in three sections,
plus player starts, monsters, doors, lifts, buttons, and messages. It is useful as
a file-format reference only. Binary offsets must be checked against game assembly
and actual bytes: host C structure packing and bitfield layout are not portable.

## Still unverified

- Whether the beta ISO or included executables boot and complete a level.
- Whether all original campaign assets are present and mutually compatible.
- Which CD32 changes affect rules or content, beyond graphics.
- Original tick timing, random seed behavior, and save format compatibility.
- Contents of nested archives such as `Unused/Docs.lha`.
- Completeness of historical build dependencies and Amiga SDK includes.

A legacy build and reference emulation session remain outstanding.

## Native gameplay checks

The preview stages the 41 installed CD32 mission files and six additional development
maps. Training Zone 1 differs between the installation and the development tree.
The concatenated 47 development location headers match the unpacked byte count
and CRC in the installation's Locations.dat. WorldMap.s reads the outgoing
location numbers from those headers. The campaign starts at location 13 and
offers Abandoned Depot (7). Finishing the Depot opens travel to locations 2 and 1.

Controls&Movement.s compares the item number against the individual door's key
field. The common and ornate keys are 71–72. The four security access wafers
are 73–76. The field-generator drop routine compares the ring subtype against
the generator's auxiliary data. These are the placements in the installed maps.

| Ring subtype | Item | Collection map | Spaceport generator (x, y, floor) |
| --- | --- | --- | --- |
| 1 | 29 | 18 Fusion Reactor | 8, 1, 2 |
| 2 | 67 | 11 Satellite Uplink | 10, 1, 2 |
| 3 | 68 | 4 Laboratory | 12, 1, 2 |
| 4 | 69 | 17 Operation Centre | 14, 1, 2 |

The browser uses the mouse gadget rectangles and action numbers in ColdStartup.s.
Use the centre of a character's view to fire or push. Right-click there to pull
a block or reload. The lower corners strafe. When an item is at the character's
feet, right-click the lower-left pickup area to put it in the pack. The Store
panel also has separate pickup, equip, stow and drop areas. Its 90 masked
item images come directly from the installed CD32 Items.gfx.

Drawviews.s and Tables.s supply the scanner viewport, occlusion and terrain
symbols. Item 79 reveals the character's explored terrain. Item 80 also displays
unexplored terrain. Open DTS to center the map, click its four regions to pan,
and right-click inside the map to center it again.

Main.s selects the location's Atmos00–07 sample, or Water when a living,
unexited player occupies water. The preview uses the original loop boundaries,
volume and period for these sounds. Main.s also supplies the timed door,
drowning, water movement and fall routines. The fall formula uses carried weight,
agility and physique. Race 1 skips drowning and still takes landing damage.

Run `make preview-build` and `node tools/check-gameplay.mjs` for the source-data
and mechanics checks. The browser screen check exercises the mouse, Store,
DTS, campaign entry, save/load and all 47 starts. Three active button action
entries refer to empty machinery slots in the archive (map 21 button 18 in and
out, map 46 button 1 in, with zero-based button indices). Matching every puzzle
and completing each mission in both engines are still open verification tasks.

Drawviews.s draws the required key or wafer from the door record, including its item
sprite and shadow. Main.s consumes it on unlock and displays the used-item panel.
The lock notice lasts 100 PAL fields. A failed inventory insertion or blocked
drop sets the no-room notice for 150 fields. Excess weight has its own indicator.

ColdStartup.s selects one of three five-frame CD32 firing sequences and one of
four sets of directional impact sprites. Main.s records small and large claw
marks for melee injuries. Its lift routine starts extra sample 9 at period 412
and volume 40 when a moving platform carries a player, then mutes it after
the last ridden movement.

The mission file contains four 144×32 horizon masks and a sky visibility bit
for each compass direction in each cell. The native renderer uses these masks
with the scanline colours in Sky.s. The southern sky includes the planet mask.

Character remains use the shared skeleton sprite. The original stores the dead
squad member's index with the remains, so another member can retrieve the held
item first and then the stored items. Monster remains use the dead figure from
the mission's corresponding monster graphics pack when the cell can hold it.
