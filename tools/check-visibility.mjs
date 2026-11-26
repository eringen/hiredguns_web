import assert from 'node:assert/strict';
import {hideOccludedCells} from '../src/dts.mjs';
// Occlusion requires every blocker in a case, and any matching case hides it.
const target={terrain:1,floorType:0,blockType:null,contents:0x80000000};
const opaque={terrain:64,blockType:0};
assert.equal(hideOccludedCells([{...target},{...opaque},null],[[[1,2]],[],[]])[0].floorType,0);
const cells=hideOccludedCells([{...target},{...opaque},{...opaque}],[[[1,2]],[],[]]);
assert.equal(cells[0].terrain,128);
assert.equal(cells[0].floorType,null);
assert.equal(cells[0].contents,0x80000000);
assert.equal(target.terrain,1,'The view must not mutate the level');
// Source scan_view processes cells in order; removed cells cease blocking later ones.
const ordered=hideOccludedCells([{...opaque},{...target},{...opaque}],[[[2]],[[0]],[]]);
assert.equal(ordered[0].terrain,128);
assert.equal(ordered[1].terrain,1);
console.log('Source visibility rules passed');
