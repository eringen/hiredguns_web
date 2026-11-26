// Separate frequently changing positions from equipment, map geometry and machinery.
// Each section is replaced as a whole, including empty arrays and null values.
export function roomSections(state){
  const {squad,inventory,tick,worldChanged,events,...sections}=state;
  const {members,...cargo}=inventory;
  sections.cargo=cargo;
  sections.positions=squad.map(({x,y,floor,dir,mode,index,throwPower})=>({x,y,floor,dir,mode,index,throwPower}));
  sections.members=members.map(({x,y,floor,dir,path,...member})=>member);
  sections.paths=members.map(p=>p.path??[]);
  return sections;
}

// Each connection starts with a full set of sections. WebSocket delivers the
// following updates in order; reconnects always start with another full set.
export function readRoomUpdate(sections,packet){
  if(!packet.sections) return packet;
  Object.assign(sections,packet.sections);
  const {positions,members,paths,cargo,...shared}=sections;
  const squad=positions.map((pos,i)=>({...pos,held:members[i].held,pack:members[i].pack,fitness:members[i].fitness}));
  const inventory={...cargo,members:members.map((member,i)=>{
    const {x,y,floor,dir}=positions[i];
    return {...member,x,y,floor,dir,path:paths[i]};
  })};
  return {...shared,squad,inventory,slot:packet.slot,token:packet.token,tick:packet.tick,
    worldChanged:packet.worldChanged,events:packet.events};
}
