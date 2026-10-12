/* =====================================================================
   CONFIGURACIÓN — pegá acá los datos de tu proyecto de Supabase
   (Supabase → Project Settings → API: "Project URL" y la clave "anon" o "publishable")
   ===================================================================== */
const SUPABASE_URL = https://efiljdsoypdoyuqcefuf.supabase.co/rest/v1/;
const SUPABASE_KEY = sb_publishable_kJYcDfSVdp8cOUNvhlUcbw_0E34YTG7;

/* ---------- utilidades ---------- */
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad=n=>String(n).padStart(2,'0');
const fmt=n=>n==null?'–':Number(n).toLocaleString('es-AR',{maximumFractionDigits:1});
const todayStr=()=>{const d=new Date();return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`};
let TODAY=todayStr(),THIS_YM=TODAY.slice(0,7);
const ls={get(k){try{return localStorage.getItem(k)}catch(e){return null}},set(k,v){try{v==null?localStorage.removeItem(k):localStorage.setItem(k,v)}catch(e){}}};
const TABS=[['mes','Tabla del mes'],['juegos','Por juego'],['hist','Histórico'],['ajustes','Jugadores y juegos']];
const COLORS=[['blue','Azul'],['red','Rojo'],['green','Verde'],['purple','Violeta'],['orange','Naranja']];
const ERR={bad_name:'El nombre tiene que tener entre 1 y 20 letras',name_taken:'Ya hay un jugador con ese nombre',
  taken:'Ese jugador ya está en uso en otro celu. Pedile al administrador que lo libere.',
  bad_token:'Este celu ya no está vinculado a tu jugador. Volvé a elegirlo cuando el administrador lo libere.',
  bad_day:'Elegí un día válido',not_admin:'Clave de administrador incorrecta'};

/* ---------- conexión con Supabase (API REST, sin librerías) ---------- */
const CONFIGURED=/^https:\/\//.test(SUPABASE_URL)&&SUPABASE_KEY.length>20;
function headers(extra){const h={apikey:SUPABASE_KEY,'Content-Type':'application/json',...extra};
  if(SUPABASE_KEY.startsWith('eyJ'))h.Authorization='Bearer '+SUPABASE_KEY;return h}
async function get(path){const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{headers:headers()});if(!r.ok)throw new Error(await r.text());return r.json()}
async function rpc(fn,args){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`,{method:'POST',headers:headers(),body:JSON.stringify(args)});
  if(!r.ok)throw new Error(await r.text());return r.json();
}

/* ---------- estado ---------- */
// Sesión del dispositivo: {id, token}. La llave (token) se guarda solo en este navegador.
let session=null;try{session=JSON.parse(ls.get('liga_session')||'null')}catch(e){}
const S={loaded:false,error:false,players:new Map(),games:new Map(),puntos:new Map(),
  tab:'mes',ym:THIS_YM,adminPass:ls.get('liga_admin'),form:{date:TODAY,dirty:false},confirm:null,playOpen:false,busy:false};
{const t=ls.get('tab');if(TABS.some(x=>x[0]===t))S.tab=t}

async function load(){
  if(!CONFIGURED)return render();
  try{
    const [players,games]=await Promise.all([get('liga_players_public?select=id,name,libre'),get('liga_games?select=*&order=sort')]);
    let rows=[],off=0;
    for(;;){const page=await get(`liga_scores?select=player_id,game_id,day,points&order=day,player_id,game_id&limit=1000&offset=${off}`);rows=rows.concat(page);if(page.length<1000)break;off+=1000}
    S.players=new Map(players.map(p=>[p.id,{name:p.name,libre:p.libre}]));
    S.games=new Map(games.map(g=>[g.id,{...g,order:g.sort}]));
    const pm=new Map();
    for(const r of rows){const ym=r.day.slice(0,7),d=String(+r.day.slice(8));
      const p=pm.get(r.player_id)||{m:{}};pm.set(r.player_id,p);((p.m[ym]??={})[d]??={})[r.game_id]=Number(r.points)}
    S.puntos=pm;S.loaded=true;S.error=false;
  }catch(e){console.error(e);S.error=true}
  render();
}

/* ---------- cálculos ---------- */
const myId=()=>session&&S.players.has(session.id)?session.id:null;
const playersList=()=>[...S.players].map(([id,p])=>({id,...p})).sort((a,b)=>a.name.localeCompare(b.name,'es'));
const gamesList=(all)=>[...S.games].map(([id,g])=>({...g,id})).filter(g=>all||!g.archived).sort((a,b)=>(a.order||0)-(b.order||0));
const gcls=g=>'c-'+(COLORS.some(c=>c[0]===g.color)?g.color:'blue');
const glabel=g=>`${g.emoji?esc(g.emoji)+' ':''}${esc(g.name)}`;
const monthName=ym=>new Date(+ym.slice(0,4),+ym.slice(5)-1,1).toLocaleDateString('es-AR',{month:'long',year:'numeric'});
const daysIn=ym=>new Date(+ym.slice(0,4),+ym.slice(5),0).getDate();
const dayMap=(ym,pid)=>S.puntos.get(pid)?.m?.[ym]||{};
const sumDay=(vals)=>{let t=0,any=false;for(const g of S.games.keys()){if(typeof vals?.[g]==='number'){t+=vals[g];any=true}}return any?t:null};
// Total de un jugador en un mes = suma de los puntos de todos los juegos, todos los días.
function monthStats(ym){
  return playersList().map(p=>{
    const d=dayMap(ym,p.id);const by={};let total=0,days=0;
    for(const k in d){const st=sumDay(d[k]);if(st==null)continue;days++;total+=st;
      for(const g of S.games.keys())if(typeof d[k][g]==='number'){(by[g]??={sum:0,n:0,best:-Infinity});by[g].sum+=d[k][g];by[g].n++;by[g].best=Math.max(by[g].best,d[k][g])}}
    return {...p,total,days,by};
  });
}
const rank=(rows,key)=>rows.slice().sort((a,b)=>key(b)-key(a)||a.name.localeCompare(b.name,'es'));
const allMonths=()=>{const s=new Set();for(const p of S.puntos.values())for(const ym in p.m)s.add(ym);return [...s].sort()};
const safeUrl=u=>{u=String(u||'').trim();if(!u)return '';if(!/^https?:\/\//i.test(u))u='https://'+u;try{const x=new URL(u);return /^https?:$/.test(x.protocol)?x.href:''}catch(e){return ''}};

/* ---------- pantallas ---------- */
function render(){
  const me=myId();
  $('#tabs').innerHTML=TABS.map(([k,l])=>`<button role="tab" data-tab="${k}" aria-selected="${S.tab===k}">${l}</button>`).join('');
  {const m=monthName(S.ym);$('#monthLbl').textContent=m[0].toUpperCase()+m.slice(1)}
  $('#monthNav').hidden=S.tab==='hist'||S.tab==='ajustes'||S.tab==='cargar';
  $('[data-act="next"]').disabled=S.ym>=THIS_YM;
  $('#me').innerHTML=me?`Jugás como <b>${esc(S.players.get(me).name)}</b>${S.adminPass?' · administrador':''}`:'Mapa, medidas y puntos, todos los días';
  $('#banner').innerHTML=!CONFIGURED?`<div class="note warn">Falta conectar la base de datos: completá SUPABASE_URL y SUPABASE_KEY en <b>app.js</b>.</div>`
    :S.error?`<div class="note warn">No se pudo conectar con la liga. Revisá tu conexión y recargá.</div>`:'';
  if(!S.loaded){$('#today').innerHTML='';if(CONFIGURED&&!S.error)$('#view').innerHTML='<div class="panel">Cargando la liga…</div>';return}
  if(!me&&S.tab==='cargar')S.tab='mes';
  $('#today').innerHTML=me&&S.tab!=='cargar'?todayCard(me)+playBox(me):'';
  if(S.tab==='cargar'&&S.form.dirty&&$('#loadForm'))return; // no pisar lo que se está tipeando
  $('#view').innerHTML=(me?'':whoView())+({mes:mesView,juegos:juegosView,hist:histView,cargar:cargarView,ajustes:ajustesView})[S.tab]();
}
function todayCard(me){
  const gs=gamesList();if(!gs.length)return '';
  const v=dayMap(THIS_YM,me)[String(+TODAY.slice(8))]||{};
  const done=gs.filter(g=>typeof v[g.id]==='number').length;
  if(!done)return `<button class="primary cta" data-act="load" data-date="${TODAY}">＋ Cargar mis puntos de hoy</button>`;
  return `<div class="panel today"><div><div class="lbl">Tus puntos de hoy</div><div class="tot">${fmt(sumDay(v))}</div></div>
  <div class="chips">${gs.map(g=>`<span class="gchip ${gcls(g)}">${glabel(g)}<b>${typeof v[g.id]==='number'?fmt(v[g.id]):'falta'}</b></span>`).join('')}</div>
  <button ${done<gs.length?'class="primary"':''} data-act="load" data-date="${TODAY}">${done<gs.length?'Completar':'Editar'}</button></div>`;
}
function playBox(me){
  const gs=gamesList();if(!gs.length)return '';
  const v=dayMap(THIS_YM,me)[String(+TODAY.slice(8))]||{};
  if(gs.every(g=>typeof v[g.id]==='number'))return '';
  return `<div class="panel"><div class="play"><span class="q">¿Todavía no jugaste hoy?</span><button class="primary" data-act="togglePlay" aria-expanded="${S.playOpen}">${S.playOpen?'Cerrar':'▶ Jugar'}</button></div>
  ${S.playOpen?`<div class="gbtns">${gs.map(g=>{const u=safeUrl(g.url);const done=typeof v[g.id]==='number';
    return u?`<a class="gbtn ${gcls(g)}" href="${esc(u)}" target="_blank" rel="noopener">${glabel(g)}<span class="ok">${done?'✓ ya cargado':'Jugar ↗'}</span></a>`:`<span class="gbtn nolink ${gcls(g)}">${glabel(g)} · sin link</span>`}).join('')}</div>
  <div class="sub">Cuando termines, volvé y cargá tus puntos.</div>`:''}</div>`;
}
function whoView(){
  const libres=playersList().filter(p=>p.libre);
  return `<div class="panel"><h2>Sumate a la liga</h2>
  <form class="row" data-form="join"><input id="joinName" placeholder="Tu nombre" maxlength="20" required style="flex:1 1 160px" autocomplete="off"><button class="primary" ${S.busy?'disabled':''}>Entrar</button></form>
  ${libres.length?`<div class="sub">¿Cambiaste de celu? Elegí tu nombre:</div><div class="chips">${libres.map(p=>`<button data-act="claim" data-id="${p.id}">Soy ${esc(p.name)}</button>`).join('')}</div>`:''}
  <div class="sub">Tu jugador queda guardado en este celu: solo desde acá vas a poder cargar tus puntos. Si ya jugabas desde otro celu, pedile al administrador que libere tu nombre.</div></div>`;
}
function missingToday(){
  if(S.ym!==THIS_YM||!S.players.size)return '';
  const day=String(+TODAY.slice(8));const gs=gamesList();
  const miss=playersList().filter(p=>{const v=dayMap(THIS_YM,p.id)[day]||{};return gs.some(g=>typeof v[g.id]!=='number')});
  if(!miss.length)return `<div class="note">Hoy ya cargaron todos.</div>`;
  return `<div class="note">Faltan cargar hoy: <b>${miss.map(p=>esc(p.name)).join(', ')}</b></div>`;
}
function mesView(){
  const st=monthStats(S.ym),me=myId();
  const gs=gamesList(true).filter(g=>!g.archived||st.some(r=>r.by[g.id]));
  const rows=rank(st,r=>r.total);const top=rows[0]?.total||0;const closed=S.ym<THIS_YM;
  let h=missingToday();
  h+=`<div class="panel"><h2>${closed?'Tabla final':'Posiciones'} de ${monthName(S.ym)}</h2><div class="scroll"><table>
  <tr><th>#</th><th class="name">Jugador</th>${gs.map(g=>`<th class="g ${gcls(g)}">${glabel(g)}</th>`).join('')}<th>Días</th><th>Total</th></tr>
  ${rows.map((r,i)=>`<tr class="${top>0&&r.total===top?'lead':''} ${r.id===me?'mine':''}"><td><span class="pos">${i+1}</span></td><td class="name">${esc(r.name)}${closed&&top>0&&r.total===top?' 🏆':''}</td>${gs.map(g=>`<td>${r.by[g.id]?fmt(r.by[g.id].sum):'–'}</td>`).join('')}<td>${r.days}</td><td class="tot">${fmt(r.total)}</td></tr>`).join('')||`<tr><td colspan="9" class="sub">Todavía no se sumó nadie.</td></tr>`}
  </table></div><div class="sub">El total suma los puntos de todos los juegos en el mes.</div></div>`;
  const ps=playersList();if(!ps.length)return h;
  const last=S.ym===THIS_YM?+TODAY.slice(8):daysIn(S.ym);let g='';
  for(let d=last;d>=1;d--){
    const date=`${S.ym}-${pad(d)}`;const wd=new Date(date+'T12:00').toLocaleDateString('es-AR',{weekday:'short'});
    g+=`<tr><td>${wd} ${d}</td>${ps.map(p=>{const t=sumDay(dayMap(S.ym,p.id)[d]);
      return p.id===me?`<td><button class="cell ${t==null?'empty':''}" data-act="load" data-date="${date}" title="Cargar o editar">${t==null?'+':fmt(t)}</button></td>`:`<td>${t==null?'<span class="sub">·</span>':fmt(t)}</td>`}).join('')}</tr>`;
  }
  return h+`<div class="panel"><h2>Día por día</h2><div class="sub">En tu columna podés tocar cualquier día para cargarlo o corregirlo.</div><div class="scroll"><table><tr><th>Día</th>${ps.map(p=>`<th>${esc(p.name)}</th>`).join('')}</tr>${g}</table></div></div>`;
}
function juegosView(){
  const st=monthStats(S.ym),me=myId();
  const gs=gamesList(true).filter(g=>!g.archived||st.some(r=>r.by[g.id]));
  if(!gs.length)return `<div class="panel">Todavía no hay juegos.</div>`;
  return gs.map(g=>{
    const rows=rank(st,r=>r.by[g.id]?.sum||0);const top=rows[0]?.by[g.id]?.sum||0;
    return `<div class="panel"><div class="chips"><span class="gchip ${gcls(g)}" style="font-size:1.05rem">${glabel(g)}</span>${g.archived?'<span class="tag">archivado</span>':''}</div><div class="scroll"><table>
    <tr><th>#</th><th class="name">Jugador</th><th>Días</th><th>Promedio</th><th>Mejor día</th><th>Total</th></tr>
    ${rows.map((r,i)=>{const b=r.by[g.id];return `<tr class="${top>0&&b?.sum===top?'lead':''} ${r.id===me?'mine':''}"><td><span class="pos">${i+1}</span></td><td class="name">${esc(r.name)}</td><td>${b?b.n:0}</td><td>${b?fmt(b.sum/b.n):'–'}</td><td>${b?fmt(b.best):'–'}</td><td class="tot">${b?fmt(b.sum):'–'}</td></tr>`}).join('')}
    </table></div></div>`}).join('');
}
function histView(){
  const ps=playersList(),me=myId();
  const acc=new Map(ps.map(p=>[p.id,{...p,total:0,days:0,titles:0,by:{}}]));const champs=[];
  for(const ym of allMonths()){
    const st=monthStats(ym);const top=Math.max(0,...st.map(r=>r.total));
    for(const r of st){const a=acc.get(r.id);a.total+=r.total;a.days+=r.days;for(const g in r.by)a.by[g]=(a.by[g]||0)+r.by[g].sum}
    if(ym<THIS_YM&&top>0){const w=st.filter(r=>r.total===top);w.forEach(r=>acc.get(r.id).titles++);champs.push({ym,names:w.map(r=>r.name),top})}
  }
  const gs=gamesList(true);const rows=rank([...acc.values()],r=>r.total);const top=rows[0]?.total||0;
  return `<div class="panel"><h2>Tabla histórica</h2><div class="sub">Suma de todos los meses. No se resetea nunca.</div><div class="scroll"><table>
  <tr><th>#</th><th class="name">Jugador</th>${gs.map(g=>`<th class="g ${gcls(g)}">${glabel(g)}</th>`).join('')}<th>Días</th><th>Títulos</th><th>Total</th></tr>
  ${rows.map((r,i)=>`<tr class="${top>0&&r.total===top?'lead':''} ${r.id===me?'mine':''}"><td><span class="pos">${i+1}</span></td><td class="name">${esc(r.name)}</td>${gs.map(g=>`<td>${r.by[g.id]!=null?fmt(r.by[g.id]):'–'}</td>`).join('')}<td>${r.days}</td><td>${r.titles?'🏆 '+r.titles:'–'}</td><td class="tot">${fmt(r.total)}</td></tr>`).join('')}
  </table></div></div>
  <div class="panel"><h2>Campeones por mes</h2>${champs.length?`<div class="scroll"><table><tr><th>Mes</th><th class="name">Campeón</th><th>Puntos</th></tr>${champs.reverse().map(c=>`<tr><td style="text-transform:capitalize"><button class="link" data-act="goto" data-ym="${c.ym}">${monthName(c.ym)}</button></td><td class="name">🏆 ${esc(c.names.join(' y '))}</td><td class="tot">${fmt(c.top)}</td></tr>`).join('')}</table></div>`:`<div class="sub">El primer campeón aparece acá cuando termine ${monthName(THIS_YM)}.</div>`}</div>`;
}
function cargarView(){
  const f=S.form,me=myId();const ym=f.date.slice(0,7),day=String(+f.date.slice(8));
  const cur=dayMap(ym,me)[day]||{};
  const gs=gamesList(true).filter(g=>!g.archived||typeof cur[g.id]==='number');const has=sumDay(cur)!=null;
  return `<form class="panel" id="loadForm" data-form="load"><h2>${has?'Editar mis puntos':'Cargar mis puntos'}</h2>
  ${gs.length?`<div class="row">${gs.map(g=>`<div class="field g ${gcls(g)}"><label for="g_${g.id}">${glabel(g)}</label><input id="g_${g.id}" data-game="${g.id}" inputmode="decimal" placeholder="–" autocomplete="off" value="${typeof cur[g.id]==='number'?String(cur[g.id]).replace('.',','):''}"></div>`).join('')}</div>`:`<div class="note">No hay juegos activos.</div>`}
  <div class="row"><div class="field"><label for="fDate">Día</label><input type="date" id="fDate" value="${f.date}" max="${TODAY}" required></div></div>
  ${f.date!==TODAY?`<div class="note">Estás cargando un día pasado. <button type="button" class="link" data-act="today">Volver a hoy</button></div>`:''}
  <div class="row"><button class="primary" ${S.busy?'disabled':''}>Guardar</button><button type="button" data-act="cancel">Cancelar</button>${has?`<button type="button" class="danger" data-act="clearDay">Borrar este día</button>`:''}</div></form>`;
}
function confirmBtns(key,label){
  return S.confirm===key?`<span class="sub">¿Seguro?</span><button class="danger" data-act="yes" data-key="${key}">Sí, borrar</button><button data-act="no">No</button>`:`<button class="danger" data-act="ask" data-key="${key}">${label}</button>`;
}
function ajustesView(){
  const ps=playersList(),gs=gamesList(true),me=myId(),A=!!S.adminPass;
  return `<div class="panel"><h2>Jugadores</h2>
  ${ps.map(p=>`<div class="item"><span class="grow"><b>${esc(p.name)}</b> ${p.id===me?'<span class="tag">vos</span>':''}${p.libre?' <span class="tag">liberado</span>':''}</span>${p.id===me?`<button data-act="renameP">Cambiar mi nombre</button>`:''}${A&&!p.libre?`<button data-act="release" data-id="${p.id}">Liberar</button>`:''}${A?confirmBtns('p:'+p.id,'Quitar'):''}</div>`).join('')||'<div class="sub">Sin jugadores todavía.</div>'}
  <div class="sub">Cada uno se suma solo poniendo su nombre. ${A?'<b>Liberar</b> sirve cuando alguien cambia de celu: después elige su nombre de nuevo y conserva sus puntos. <b>Quitar</b> borra al jugador y todos sus puntos.':''}</div></div>
  <div class="panel"><h2>Juegos</h2>
  ${gs.map(g=>`<div class="item"><span class="grow"><span class="gchip ${gcls(g)}">${glabel(g)}</span> ${g.archived?'<span class="tag">archivado</span>':''}${safeUrl(g.url)?'':' <span class="tag">sin link</span>'}</span>${A?`<button data-act="editLink" data-id="${g.id}">Link</button><button data-act="archive" data-id="${g.id}">${g.archived?'Reactivar':'Archivar'}</button>${confirmBtns('g:'+g.id,'Eliminar')}`:''}</div>`).join('')||'<div class="sub">Sin juegos todavía.</div>'}
  ${A?`<form class="row" data-form="addGame"><input id="newEmoji" placeholder="🎯" maxlength="4" style="width:4.2em" aria-label="Emoji"><input id="newGame" placeholder="Nombre del juego nuevo" maxlength="24" required style="flex:1 1 150px"><select id="newColor" aria-label="Color">${COLORS.map(c=>`<option value="${c[0]}">${c[1]}</option>`).join('')}</select><input id="newUrl" placeholder="Link del juego (https://…)" required style="flex:1 1 100%"><button>Agregar juego</button></form>
  <div class="sub"><b>Archivar</b> saca el juego de la carga diaria pero conserva sus puntos. <b>Eliminar</b> lo borra con todos sus puntos.</div>`:''}</div>
  <div class="panel"><h2>Administrador</h2>${A?`<div class="row"><span class="sub grow">Estás como administrador en este dispositivo.</span><button data-act="adminOut">Salir de administrador</button></div>`
    :`<form class="row" data-form="admin"><input id="adminPass" type="password" placeholder="Clave de administrador" required style="flex:1 1 160px" autocomplete="current-password"><button>Entrar</button></form>`}</div>
  <div id="renameBox"></div>`;
}

/* ---------- acciones ---------- */
let toastT;function toast(m){const t=$('#toast');t.textContent=m;t.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>t.hidden=true,3000)}
// Llama una función de la base; muestra el error si lo hay y recarga los datos si salió bien.
async function act(fn,args,ok){
  if(S.busy)return null;S.busy=true;
  try{
    const r=await rpc(fn,args);
    if(r&&r.error){
      if(r.error==='bad_token'){session=null;ls.set('liga_session',null)}
      if(r.error==='not_admin'){S.adminPass=null;ls.set('liga_admin',null)}
      toast(ERR[r.error]||'No se pudo guardar');return null}
    if(ok)toast(ok);return r||{};
  }catch(e){console.error(e);toast('No se pudo guardar. Revisá tu conexión.');return null}
  finally{S.busy=false;await load()}
}
const setTab=t=>{S.tab=t;S.confirm=null;S.form.dirty=false;if(t!=='cargar')ls.set('tab',t);render()};
const saveSession=r=>{session={id:r.id,token:r.token};ls.set('liga_session',JSON.stringify(session))};

document.addEventListener('submit',async e=>{
  e.preventDefault();const k=e.target.dataset.form;
  if(k==='join'){const name=$('#joinName').value.trim();if(!name)return;
    const r=await act('liga_join',{p_name:name},`¡Bienvenido, ${name}!`);if(r?.ok){saveSession(r);render()}}
  if(k==='rename'){const name=$('#renameInput').value.trim();if(!name)return;
    await act('liga_rename',{p_player:session.id,p_token:session.token,p_name:name},'Nombre actualizado')}
  if(k==='load'){
    const vals={};let bad=false;
    e.target.querySelectorAll('[data-game]').forEach(i=>{const v=i.value.trim().replace(',','.');if(v==='')return;const n=Number(v);if(!isFinite(n))bad=true;else vals[i.dataset.game]=n});
    if(bad){toast('Revisá los puntos: tienen que ser números');return}
    const date=$('#fDate').value;if(!date||date>TODAY){toast('Elegí un día válido');return}
    S.form.dirty=false;
    const r=await act('liga_save_day',{p_player:session.id,p_token:session.token,p_day:date,p_scores:vals},'Puntos guardados');
    if(r){S.ym=date.slice(0,7);setTab('mes')}
  }
  if(k==='admin'){const pass=$('#adminPass').value;
    try{if(await rpc('liga_admin_check',{p_pass:pass})){S.adminPass=pass;ls.set('liga_admin',pass);toast('Entraste como administrador');render()}else toast(ERR.not_admin)}
    catch(err){toast('No se pudo conectar')}}
  if(k==='addGame'){const url=safeUrl($('#newUrl').value);if(!url){toast('Pegá un link válido del juego');return}
    await act('liga_admin_save_game',{p_pass:S.adminPass,p_id:null,p_name:$('#newGame').value.trim(),p_emoji:$('#newEmoji').value.trim(),p_color:$('#newColor').value,p_url:url,p_archived:false},'Juego agregado')}
  if(k==='link'){const g=S.games.get(e.target.dataset.id);const url=safeUrl($('#linkInput').value);if(!url){toast('Pegá un link válido del juego');return}
    await act('liga_admin_save_game',{p_pass:S.adminPass,p_id:g.id,p_name:g.name,p_emoji:g.emoji,p_color:g.color,p_url:url,p_archived:g.archived},'Link guardado')}
});
document.addEventListener('input',e=>{if(e.target.closest('#loadForm')&&e.target.dataset.game)S.form.dirty=true});
document.addEventListener('change',e=>{if(e.target.id==='fDate'&&e.target.value){S.form.date=e.target.value>TODAY?TODAY:e.target.value;S.form.dirty=false;render()}});
document.addEventListener('click',async e=>{
  const t=e.target.closest('[data-tab],[data-act]');if(!t)return;
  if(t.dataset.tab){setTab(t.dataset.tab);return}
  const a=t.dataset.act,id=t.dataset.id;
  if(a==='prev'||a==='next'){const d=new Date(+S.ym.slice(0,4),+S.ym.slice(5)-1+(a==='prev'?-1:1),1);const ym=`${d.getFullYear()}-${pad(d.getMonth()+1)}`;if(ym<=THIS_YM){S.ym=ym;render()}}
  if(a==='load'&&myId()){S.form.date=t.dataset.date;setTab('cargar');window.scrollTo(0,0)}
  if(a==='cancel')setTab('mes');
  if(a==='today'){S.form.date=TODAY;S.form.dirty=false;render()}
  if(a==='goto'){S.ym=t.dataset.ym;setTab('mes')}
  if(a==='togglePlay'){S.playOpen=!S.playOpen;render()}
  if(a==='claim'){const r=await act('liga_claim',{p_player:id},'Listo, ya podés cargar tus puntos');if(r?.ok){saveSession(r);render()}}
  if(a==='clearDay'){S.form.dirty=false;if(await act('liga_save_day',{p_player:session.id,p_token:session.token,p_day:S.form.date,p_scores:{}},'Día borrado'))setTab('mes')}
  if(a==='ask'){S.confirm=t.dataset.key;render()}
  if(a==='no'){S.confirm=null;render()}
  if(a==='yes'){const [kind,x]=t.dataset.key.split(':');S.confirm=null;
    if(kind==='g')await act('liga_admin_delete_game',{p_pass:S.adminPass,p_id:x},'Juego eliminado');
    else await act('liga_admin_delete_player',{p_pass:S.adminPass,p_player:x},'Jugador quitado')}
  if(a==='release')await act('liga_admin_release',{p_pass:S.adminPass,p_player:id},'Jugador liberado: puede volver a elegirlo desde su celu nuevo');
  if(a==='archive'){const g=S.games.get(id);await act('liga_admin_save_game',{p_pass:S.adminPass,p_id:g.id,p_name:g.name,p_emoji:g.emoji,p_color:g.color,p_url:g.url,p_archived:!g.archived},g.archived?'Juego reactivado':'Juego archivado')}
  if(a==='adminOut'){S.adminPass=null;ls.set('liga_admin',null);render()}
  if(a==='editLink'){const g=S.games.get(id);
    $('#renameBox').innerHTML=`<form class="panel" data-form="link" data-id="${id}"><h2>Link de ${glabel(g)}</h2><div class="row"><input id="linkInput" value="${esc(g.url||'')}" placeholder="https://…" required style="flex:1 1 200px"><button class="primary">Guardar</button></div></form>`;$('#linkInput').focus()}
  if(a==='renameP'){
    $('#renameBox').innerHTML=`<form class="panel" data-form="rename"><h2>Cambiar mi nombre</h2><div class="row"><input id="renameInput" value="${esc(S.players.get(session.id).name)}" maxlength="20" required style="flex:1 1 160px"><button class="primary">Guardar</button></div></form>`;$('#renameInput').focus()}
});

/* ---------- arranque y actualización automática ---------- */
render();
load().then(async()=>{ // si el admin liberó este jugador, la llave guardada deja de valer
  if(session&&CONFIGURED){try{if(!(await rpc('liga_check',{p_player:session.id,p_token:session.token}))){session=null;ls.set('liga_session',null);render()}}catch(e){}}
});
const refresh=()=>{TODAY=todayStr();THIS_YM=TODAY.slice(0,7);if(!S.busy&&!(S.tab==='cargar'&&S.form.dirty))load()};
setInterval(()=>{if(document.visibilityState==='visible')refresh()},60000);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refresh()});
