// Main.s shake_screen: one vertical display offset per PAL field (20 ms).
// Start at 1 for a block landing, 17 for an explosion, or 20 for a stun grenade.
// The source terminator (-127) is omitted; stepping past the table ends the effect.
export const SHAKE_TABLE=Object.freeze([0,12,16,12,0,-10,-14,-10,0,8,12,8,0,-7,-11,-7,0,6,8,6,0,-6,0,5,0,-4,0,3,0,-2,0,1,0,-1,0,1,0,-1,0]);

// These counters are measured in PAL video fields (20 ms).
const timers=['flashFrames','healthFrames','lockFrames','noRoomFrames','drowningFrames','invalidFrames','psiFlash','monsterAttackFrames'];
const marks=['claws','bigClaws'];

export function advanceEffects(p,equipment){
  let repaint=false;
  for(const key of timers) if(p[key] && --p[key]===0) repaint=true;
  for(const key of marks) if(p[key] && --p[key].frames<=0){p[key]=null;repaint=true;}
  const shot=p.shot;
  if(shot){
    if(--shot.remaining<=0) p.shot=null;
    else {
      shot.frame=(shot.frame+1)%5;
      const accuracy=equipment.items[shot.id].accuracy;
      const spread=()=>accuracy?accuracy-(Math.floor(Math.random()*65536)&(2*accuracy-1)):0;
      shot.x=spread();shot.y=spread();
    }
    repaint=true;
  }
  return repaint;
}

export function activeEffects(p){
  const effects={};
  for(const key of [...timers,...marks,'shot']) if(p[key]) effects[key]=p[key];
  if(p.flashFrames) effects.flashColor=p.flashColor;
  if(p.lockFrames) effects.lockNotice=p.lockNotice;
  return effects;
}

// Inventory saves carry some HUD timers too. Preserve the locally advancing
// animation on repeated snapshots with the same authoritative expiration.
export function syncEffects(p,effects,tick,deadlines){
  for(const key of [...timers,...marks,'shot']){
    const value=effects[key];
    const duration=value?.remaining ?? value?.frames ?? value ?? 0;
    const end=duration?tick+duration:0;
    if(deadlines[key]!==end){
      p[key]=value && typeof value==='object'?{...value}:value ?? null;
      deadlines[key]=end;
    }
  }
  p.flashColor=effects.flashColor;
  p.lockNotice=effects.lockNotice;
}
