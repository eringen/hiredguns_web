#!/bin/sh
set -eu
mkdir -p build/preview/vendor/three/addons
cp node_modules/three/build/three.module.js node_modules/three/build/three.core.js build/preview/vendor/three/
cp node_modules/three/examples/jsm/controls/OrbitControls.js build/preview/vendor/three/addons/
mkdir -p build/preview/vendor/three/addons/controls
cp node_modules/three/examples/jsm/controls/OrbitControls.js build/preview/vendor/three/addons/controls/
cp web/isometric.html web/isometric.mjs web/isometric-textures.json build/preview/
if [ -d web/isometric-textures ]; then cp -R web/isometric-textures build/preview/; fi
mkdir -p build/preview/vendor/three/addons/loaders build/preview/vendor/three/addons/utils
cp node_modules/three/examples/jsm/loaders/GLTFLoader.js build/preview/vendor/three/addons/loaders/
cp node_modules/three/examples/jsm/utils/BufferGeometryUtils.js node_modules/three/examples/jsm/utils/SkeletonUtils.js build/preview/vendor/three/addons/utils/
cp web/isometric-character.mjs build/preview/
cp web/isometric-audio.mjs build/preview/
