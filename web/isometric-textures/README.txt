Abandoned Depot texture overrides

Place PNG, JPEG or WebP textures in this directory.
Edit web/isometric-textures.json, for example:
"walls": {"url":"./isometric-textures/walls.png", "repeat":[1,1]}

Slots: walls, floors, doors, metal, water, field.
url:null uses the original extracted artwork or the default material.
Optional color is a CSS hex color; roughness ranges from 0 to 1.
Repeat controls horizontal and vertical repetition per geometry face.
Run make isometric-build and refresh /isometric.html after changes.
The viewer uses the actual map 7 (Abandoned Depot); geometry for props
and stairs is provisional. Original projected art is a temporary texture
fallback, not a reconstructed seamless material. No characters are loaded.
Requires npm install before building. Existing server serves build/preview.

Supplied material sets live in depot/ (seven sets, albedo/bump/specular).
Level 7 overrides assign them through isometric-textures.json.
Albedo uses sRGB; bump and specularIntensityMap use linear/no color space.
MeshPhysicalMaterial uses specular maps as dielectric intensity, not metalness.
Dirt UVs span three world cells and align between adjoining meshes.
Decorative floor/wall panels retain intentional one-cell repeats.
Continuous mapping cannot fix mismatched image edges: prepare matching edges,
corner/end-cap variants and separate trim/decal sheets for final architecture.
Ceiling undersides are optional and follow overhead solid cells.
