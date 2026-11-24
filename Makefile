PYTHON ?= python3
ARCHIVE := external/downloads/HiredGunsCD32_DevFiles.tar.xz
SOURCE_URL := https://archive.org/download/hired-guns-cd-32-dev-files/HiredGunsCD32_DevFiles.tar.xz

.PHONY: source inventory

source: $(ARCHIVE)
	$(PYTHON) tools/import_source.py "$(ARCHIVE)"

$(ARCHIVE):
	mkdir -p external/downloads
	curl --fail --location --retry 3 --output "$@.part" "$(SOURCE_URL)"
	mv "$@.part" "$@"

inventory:
	$(PYTHON) tools/import_source.py "$(ARCHIVE)" --inventory-only

SAE := external/downloads/sae-8ebce7b.tar.gz
XDFTOOL ?= build/amiga-tools/bin/xdftool

$(SAE):
	mkdir -p external/downloads
	curl --fail --location --retry 3 --output "$@.part" https://codeload.github.com/naTmeg/ScriptedAmigaEmulator/tar.gz/8ebce7b8beb9ebe243e5ea7b5150b3f16f665303
	mv "$@.part" "$@"

build/amiga-tools/bin/xdftool:
	$(PYTHON) -m venv build/amiga-tools
	build/amiga-tools/bin/python -m pip install amitools==0.8.1

build/preview/HiredGuns.hdf: tools/build-game.py $(SAE) $(XDFTOOL)
	$(PYTHON) tools/build-game.py --runtime "$(SAE)" --xdftool "$(XDFTOOL)"

.PHONY: preview-build preview reference-build
reference-build: build/preview/HiredGuns.hdf
	cp web/original.html web/original.mjs build/preview/

preview-build:
	mkdir -p build/preview/art
	cp web/app-icons/*.png build/preview/art/
	cp web/app.json build/preview/
	cp web/sprite-png.mjs web/index.html web/multiplayer.mjs web/front.mjs web/mission-menu.mjs web/world-map.mjs web/sky.mjs web/field.mjs web/fire-sprites.mjs web/hud.mjs web/preview.mjs web/original.html web/original.mjs src/chatter.mjs src/psionics.mjs src/combat.mjs src/controls.mjs src/room-wire.mjs src/effects.mjs src/machinery.mjs src/dts.mjs src/level.mjs src/inventory.mjs src/samples.mjs build/preview/
	$(PYTHON) tools/build-levels.py
	$(PYTHON) tools/build-world-png.py
	$(PYTHON) tools/build-hud-png.py
	$(PYTHON) tools/build-menu-png.py
	$(PYTHON) tools/build-audio-wav.py

preview: preview-build
	$(PYTHON) tools/serve.py

XMP_ARCHIVE := external/downloads/libxmp-4.6.2.tar.gz
$(XMP_ARCHIVE):
	mkdir -p external/downloads
	curl -fsSL https://codeload.github.com/libxmp/libxmp/tar.gz/refs/tags/libxmp-4.6.2 -o "$@.part"
	mv "$@.part" "$@"

build/render-music: tools/render-music.c $(XMP_ARCHIVE)
	echo "88c8c68a5e38966c8735b20e63c552ed014ec75dde711dc7549a3eff4e4555cd  $(XMP_ARCHIVE)" | shasum -a 256 -c -
	mkdir -p build/tracker-src
	tar -xf $(XMP_ARCHIVE) -C build/tracker-src --strip-components=1
	cmake -S build/tracker-src -B build/tracker -DBUILD_SHARED=OFF -DLIBXMP_DISABLE_DEPACKERS=ON -DCMAKE_BUILD_TYPE=Release
	cmake --build build/tracker --parallel 4
	$(CC) -Ibuild/tracker-src/include tools/render-music.c build/tracker/libxmp.a -lm -o "$@"

CHSELECT_MOD := external/original/HiredGunsCD32_DevFiles/Data/ChSelect.dat/ChSelect.mod
build/preview/chselect.mp3: MODULE = $(CHSELECT_MOD)
build/preview/chselect.mp3: $(CHSELECT_MOD)
FRONT_MOD := external/original/HiredGunsCD32_DevFiles/Data/Front.dat/Front.mod
build/preview/front.mp3: MODULE = $(FRONT_MOD)
build/preview/front.mp3: $(FRONT_MOD)
WORLD_MOD := external/original/HiredGunsCD32_DevFiles/Data/World.dat/World.mod
build/preview/world.mp3: MODULE = $(WORLD_MOD)
build/preview/world.mp3: $(WORLD_MOD)
DEATH_MOD := external/original/HiredGunsCD32_DevFiles/Data/Death.dat/Death.mod
build/preview/death.mp3: MODULE = $(DEATH_MOD)
build/preview/death.mp3: $(DEATH_MOD)
STATIC_TRACKS := $(addprefix build/preview/static-,$(addsuffix .mp3,01 02 03 04 05))
$(STATIC_TRACKS): build/preview/static-%.mp3: external/original/HiredGunsCD32_DevFiles/Test/HiredGunsCD32/Static/Static%.mod
$(STATIC_TRACKS): MODULE = $(filter %.mod,$^)
build/preview/chselect.mp3 build/preview/front.mp3 build/preview/world.mp3 build/preview/death.mp3 $(STATIC_TRACKS): build/render-music
	mkdir -p build/preview
	build/render-music "$(MODULE)" > "$@.pcm"
	ffmpeg -loglevel error -y -f s16le -ar 44100 -ac 2 -i "$@.pcm" -codec:a libmp3lame -q:a 4 "$@.tmp.mp3"
	mv "$@.tmp.mp3" "$@"
	$(RM) "$@.pcm"

preview-build: build/preview/chselect.mp3 build/preview/front.mp3 build/preview/world.mp3 build/preview/death.mp3 $(STATIC_TRACKS)
