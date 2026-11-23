# Faithful game port

## Scope

The target is original Hired Guns gameplay in a browser. CD32 enhanced graphics
are allowed. Preserve four simultaneous character views, original maps, movement,
combat, inventory, characters, puzzles, and audio behavior. Preserve original local
multiplayer behavior as the engine matures. No map editor, redesigned mechanics,
new campaign, or online multiplayer in the initial scope.

Treat the CD32 development tree as evidence, not automatically as the behavioral
authority. Where beta behavior differs from the original release, prefer verified
original behavior and record the difference. Establish an exact reference build
before making claims of fidelity.

## Technical direction

Provisional recommendation: manually port game logic and rendering semantics to a
portable C core, compile it to WebAssembly with Emscripten, and keep a small
JavaScript layer for browser input, canvas presentation, audio, and saved data.
Use fixed-width arithmetic and explicit big-endian readers for original data.
Keep core simulation independent of browser frame scheduling.

WebAssembly does not execute Motorola instructions. The original assembly needs
translation or an emulator. Amiga hardware calls also need replacement; translating
CPU instructions alone would not reproduce the display, sound, and timing.

| Approach | Assessment |
| --- | --- |
| Portable game core → Wasm | Proposed long-term implementation; substantial manual work, but allows a browser-native game with traceable original rules. |
| Amiga emulator → Wasm | Useful candidate for reference playback and possibly an earlier playable build. Requires a compatible emulator, boot environment, and a working game binary; none is verified yet. |
| Direct Emscripten build of archive | Not viable: the core is 68k assembly plus Amiga hardware/OS dependencies. |

Start with a software framebuffer and preserve original pixel layout, palette
behavior, and sprite ordering. Choose the browser presentation backend after
measuring the first viewport. There is no need to choose a UI framework now.

Emscripten's [porting guidance](https://emscripten.org/docs/porting/guidelines/api_limitations.html)
also requires returning control to the browser event loop and adapting filesystem
access. These constraints belong in the browser adapter rather than game rules.

## Milestones and acceptance criteria

1. **Source baseline — initial audit done.** Verified archive, per-file hashes,
   source map, scope, and identified uncertainties. Next establish a runnable
   reference build and capture its version and machine configuration.
2. **Read original content.** Decode an uncompressed training map, its player
   starts, cell flags, original graphics, and palettes. Validate offsets and
   dimensions against both source definitions and file lengths. Implement packed
   formats only as required by selected game assets.
3. **Reproduce one viewport.** Render an actual training-level position using
   original/CD32 assets. Match reference images for all four directions, nearby
   walls, doors, floor, sky, and occlusion. No placeholder scene as proof of a port.
4. **First playable training level.** Four character views, character selection,
   movement and collision, doors/buttons, essential inventory actions, and exit.
   Build a native test executable and Wasm from the same game core. Match recorded
   input sequences and resulting positions/state to the reference.
5. **Gameplay coverage.** Combat, AI, equipment, effects, hazards, lifts, puzzles,
   campaign progression, sound/music, and original local multiplayer controls.
   Add comparison cases for each subsystem as it becomes playable.
6. **Browser release.** Save persistence and import/export, pause/resume, keyboard
   and gamepad handling, audio startup, scaling, and performance verification in
   target browsers. Verify complete campaign progression before calling it complete.

## Fidelity rules

- Map and gameplay behavior come from source and observed original play.
- Label unresolved behavior rather than inventing a replacement.
- Separate enhanced graphics selection from gameplay decisions.
- Preserve source provenance for decoded assets and translated routines.
- Validate timing, numeric overflow, random behavior, and state transitions;
  visual similarity alone is insufficient.
- Keep downloaded reference files unchanged and outside tracked source.

## Screen and level verification

The requested deliverable includes the complete original interface, screen transitions,
controls, audio and playable levels. Reconstruct each native screen using the original
assets. Capture matching states in the emulated game, compare the visible playfields
and selection states at the original resolution, and record discrepancies. Verify
timing and input separately from still frames.

| Screen or flow | Current evidence | Open comparisons |
| --- | --- | --- |
| Intro and credits | Captured the emulated intro. Reconstructed the front-end credit card from the CD32 fill, palette and fonts and compared it beside the emulator. | Intro playback, scan effects, credit sequence timing and sound |
| Main menu | Compared the default Training selection. Used the original font metrics and seven-piece hardware cursor. | Interlace, copper color changes, cursor placement for every choice, menu transitions and music |
| Number of players and controller assignment | Captured the original Player One assignment screen. | Native controls and multiplayer flow |
| Character selection | Native roster, portraits and loadouts exist. | Original layout, scrolling, selection sequence and timing |
| Briefings, world map and progression | The native campaign map uses the original route records. The Depot exit and follow-on destinations have browser coverage. | Briefings, matched map screens and a complete campaign playthrough |
| Mission HUD and inventory | Native item state, artwork, descriptions and four views run. | Original panel layout, controls, lighting, animation, background and interaction timing |
| End states and saved games | Native save/continue verified for the current mission state. | Original save UI, level exit, death, victory and credits |

Run `node tools/check-screens.cjs http://127.0.0.1:8000` with Playwright and
Chrome available to regenerate the native captures. The check records each map
ID, name, style, group and painted pixel count for each of the four starting views
in `build/comparison/levels.json`. Images are written beside the report.
The current run covered 19 campaign, 17 action, five training and six additional
development maps. All 188 initial viewports rendered pixels. Each playable map
still needs matched emulator captures at the same starts and orientations,
interaction and audio checks, and a verified route to its exit. Track development
maps separately when the disc has no counterpart.
