import {readRoomUpdate} from './room-wire.mjs';
// The socket owns one character for its lifetime. Selection never follows hover.
import {keyAction} from './controls.mjs';
export function connectRoom(id, config, names, render, receiveChart) {
  const bar=document.createElement('aside');
  bar.setAttribute('aria-live','polite');
  bar.textContent='Connecting to room…';
  document.querySelector('main').before(bar);
  const params=new URLSearchParams({updates:1}),sections={};
  if(id.startsWith('new')) {params.set('map',config.map);params.set('squad',config.ids.join(','));}
  else if(performance.getEntriesByType('navigation')[0]?.type==='reload'){
    const token=sessionStorage.getItem('hiredguns.peer.'+id);
    if(token) params.set('token',token);
  }
  let mode=0,phase;
  const socket=new WebSocket((location.protocol==='https:'?'wss:':'ws:')+'//'+location.host+'/rooms/'+encodeURIComponent(id)+'?'+params);
  let slot=-1;
  const status=document.createElement('span');
  const invite=document.createElement('button');
  invite.textContent='Copy invite link';
  const address=document.createElement('input');
  address.readOnly=true;
  address.hidden=true;
  address.setAttribute('aria-label','Room invite URL');
  invite.onclick=async ()=>{
    try {
      await navigator.clipboard.writeText(address.value);
      invite.textContent='Invite link copied';
    } catch {
      address.hidden=false;
      address.focus();
      address.select();
    }
  };
  socket.onmessage=event=>{
    const packet=JSON.parse(event.data);
    if(packet.type==='chart'){if(phase==='map' && slot!==0) receiveChart(packet.chart);return;}
    const state=readRoomUpdate(sections,packet);
    slot=state.slot;phase=state.phase;mode=state.squad[slot].mode;
    if (!invite.isConnected) {
      sessionStorage.setItem('hiredguns.peer.'+state.room,state.token);
      history.replaceState(null,'','?room='+state.room);
      address.value=location.href;
      bar.replaceChildren(status,invite,address);
    }
    status.textContent='You control '+names[slot]+' · '+state.occupied.filter(Boolean).length+'/'+state.occupied.length+' connected · ';
    render(state);
  };
  socket.onclose=event=>{
    slot=-1;
    bar.textContent=(event.reason || 'Disconnected from room.')+' ';
    const retry=document.createElement('a');
    retry.href='/';
    retry.textContent='Return to main menu';
    bar.append(retry);
  };
  function command(target,action,mouse=false) {
    if (target===slot && slot>=0 && socket.readyState===WebSocket.OPEN)
      socket.send(JSON.stringify({slot,action,mouse}));
  }
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape' && ['play','paused'].includes(phase)){
      event.preventDefault();
      if(!event.repeat) command(slot,phase==='paused'?'Resume':'Pause');
      return;
    }
    if(event.altKey || event.ctrlKey || event.metaKey || event.target.closest?.('aside,dialog')) return;
    if(event.key===['F1','F3','F2','F4'][slot]){
      event.preventDefault();if(!event.repeat) command(slot,'Return');return;
    }
    const key=keyAction(event.key,event.shiftKey,mode) || {v:'View',s:'Store',d:'DTS',t:'Stats'}[event.key.toLowerCase()];
    if (key) { event.preventDefault();if(!event.repeat || key==='Fire') command(slot,key); }
  });
  command.chart=view=>{
    if(slot===0 && phase==='map' && socket.readyState===WebSocket.OPEN)
      socket.send(JSON.stringify({slot,chart:view}));
  };
  return command;
}
