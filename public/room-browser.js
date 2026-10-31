export function mountRooms({container,server,join,t}){
  let request=0;
  async function refresh(){
    const ticket=++request,sv=server();container.replaceChildren();
    if(!sv||sv.offline){container.textContent=t('rooms.selectOnline');return;}
    container.textContent=t('rooms.loading');const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),5000);
    try{
      const response=await fetch((sv.url||'').replace(/\/$/,'')+'/rooms',{cache:'no-store',signal:abort.signal});
      if(!response.ok)throw Error();const rooms=await response.json();if(!Array.isArray(rooms))throw Error();
      if(ticket!==request)return;container.replaceChildren();
      if(!rooms.length){container.textContent=t('rooms.empty');return;}
      for(const r of rooms){
        const row=document.createElement('div');row.className='field-row';
        const title=document.createElement('span');title.textContent=r.code+' · '+t('mode.'+r.mode)+' · '+r.players+'/'+r.capacity;
        const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent=t('menu.join');button.disabled=r.players>=r.capacity;button.onclick=()=>join(r.code);
        row.append(title,button);container.append(row);
      }
    }catch{if(ticket===request)container.textContent=t('rooms.unavailable');}finally{clearTimeout(timer);}
  }
  return {refresh};
}
