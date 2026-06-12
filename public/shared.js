export const teams = [
  ["Mexico","mx"],["Africa do Sul","za"],["Coreia do Sul","kr"],["Tchequia","cz"],["Canada","ca"],["Bosnia","ba"],["Catar","qa"],["Suica","ch"],
  ["Brasil","br"],["Marrocos","ma"],["Haiti","ht"],["Escocia","gb-sct"],["Estados Unidos","us"],["Paraguai","py"],["Australia","au"],["Turquia","tr"],
  ["Alemanha","de"],["Curacao","cw"],["Costa do Marfim","ci"],["Equador","ec"],["Holanda","nl"],["Japao","jp"],["Suecia","se"],["Tunisia","tn"],
  ["Belgica","be"],["Egito","eg"],["Ira","ir"],["Nova Zelandia","nz"],["Espanha","es"],["Cabo Verde","cv"],["Arabia Saudita","sa"],["Uruguai","uy"],
  ["Franca","fr"],["Senegal","sn"],["Iraque","iq"],["Noruega","no"],["Argentina","ar"],["Argelia","dz"],["Austria","at"],["Jordania","jo"],
  ["Portugal","pt"],["Congo RD","cd"],["Uzbequistao","uz"],["Colombia","co"],["Inglaterra","gb-eng"],["Croacia","hr"],["Gana","gh"],["Panama","pa"]
];
export const flagCode=Object.fromEntries(teams);
export const displayNames={Mexico:"México",Tchequia:"Tchéquia",Canada:"Canadá",Bosnia:"Bósnia",Suica:"Suíça",Escocia:"Escócia",Australia:"Austrália",Curacao:"Curaçao",Japao:"Japão",Suecia:"Suécia",Tunisia:"Tunísia",Belgica:"Bélgica",Ira:"Irã","Nova Zelandia":"Nova Zelândia","Arabia Saudita":"Arábia Saudita",Franca:"França",Argelia:"Argélia",Austria:"Áustria",Jordania:"Jordânia",Uzbequistao:"Uzbequistão",Colombia:"Colômbia",Croacia:"Croácia",Panama:"Panamá"};
export const label=name=>displayNames[name]||name;
const groups={B:["Canada","Bosnia","Catar","Suica"],C:["Brasil","Marrocos","Haiti","Escocia"],D:["Estados Unidos","Paraguai","Australia","Turquia"],E:["Alemanha","Curacao","Costa do Marfim","Equador"],F:["Holanda","Japao","Suecia","Tunisia"],G:["Belgica","Egito","Ira","Nova Zelandia"],H:["Espanha","Cabo Verde","Arabia Saudita","Uruguai"],I:["Franca","Senegal","Iraque","Noruega"],J:["Argentina","Argelia","Austria","Jordania"],K:["Portugal","Congo RD","Uzbequistao","Colombia"],L:["Inglaterra","Croacia","Gana","Panama"]};
const dates=[
  {B:"2026-06-13",C:"2026-06-13",D:"2026-06-13",E:"2026-06-14",F:"2026-06-14",G:"2026-06-15",H:"2026-06-15",I:"2026-06-16",J:"2026-06-16",K:"2026-06-17",L:"2026-06-17"},
  {B:"2026-06-18",C:"2026-06-19",D:"2026-06-19",E:"2026-06-20",F:"2026-06-20",G:"2026-06-21",H:"2026-06-21",I:"2026-06-22",J:"2026-06-22",K:"2026-06-23",L:"2026-06-23"},
  {B:"2026-06-24",C:"2026-06-24",D:"2026-06-25",E:"2026-06-25",F:"2026-06-25",G:"2026-06-26",H:"2026-06-26",I:"2026-06-26",J:"2026-06-27",K:"2026-06-27",L:"2026-06-27"}
];
export const games=[{id:"D-USA-PAR",group:"D",home:"Estados Unidos",away:"Paraguai",kickoff:"2026-06-13T01:00:00.000Z"}];
Object.entries(groups).forEach(([group,t])=>[[[2,3],[0,1]],[[0,2],[3,1]],[[3,0],[1,2]]].forEach((pairs,round)=>pairs.forEach((p,index)=>{
  const home=t[p[0]],away=t[p[1]],excluded=(group==="B"&&home==="Canada"&&away==="Bosnia")||(group==="D"&&home==="Estados Unidos"&&away==="Paraguai");
  if(!excluded)games.push({id:`${group}-${home}-${away}`.replaceAll(" ","-"),group,home,away,kickoff:`${dates[round][group]}T${index?"22":"16"}:00:00.000Z`});
})));
games.sort((a,b)=>new Date(a.kickoff)-new Date(b.kickoff));
export const token=(new URLSearchParams(location.search).get("token")||"").trim().toLowerCase();
export const withToken=path=>`${path}${token?`?token=${encodeURIComponent(token)}`:""}`;
export const flag=name=>`<img class="flag" src="https://flagcdn.com/w80/${flagCode[name]}.png" alt="Bandeira de ${label(name)}">`;
export function setupNav(active){document.querySelectorAll("[data-page]").forEach(link=>{link.href=withToken(link.getAttribute("href"));link.classList.toggle("active",link.dataset.page===active)});if(active==="access"){const user=document.querySelector("#user-pill");if(user)user.innerHTML=`${avatar({name:"DCASH"})}<span>Administração</span>`;renderAdminControls()}else renderUserPill()}
export function renderAdminControls(){const adminUrl="/admin",menu=document.querySelector(".menu");if(menu&&!menu.querySelector("[data-admin]"))menu.insertAdjacentHTML("beforeend",`<a href="${adminUrl}" data-admin>Administração</a>`);if(document.querySelector(".admin-controls"))return;const wrap=document.createElement("div");wrap.className="admin-controls";wrap.innerHTML=`<button id="admin-sync">Sincronizar Bitrix</button><a href="${adminUrl}">Links de acesso</a>`;document.body.appendChild(wrap);wrap.querySelector("#admin-sync").onclick=async event=>{const button=event.currentTarget;button.disabled=true;button.textContent="Sincronizando...";try{const sync=await fetch("/api/sync-bitrix",{method:"POST"});const data=await sync.json();if(!sync.ok)throw new Error(data.error);toast(`${data.employees} funcionários sincronizados.`);setTimeout(()=>location.reload(),900)}catch(error){toast(error.message||"Falha ao sincronizar.");button.disabled=false;button.textContent="Sincronizar Bitrix"}}}
export async function renderUserPill(){const user=document.querySelector("#user-pill");if(!user)return;if(!token){user.innerHTML=`${avatar({name:"Acesso inválido"})}<span>Acesso inválido</span>`;return}user.innerHTML=`${avatar({name:"Participante"})}<span>Carregando perfil...</span>`;try{const res=await fetch(`/api/profile?token=${encodeURIComponent(token)}`);if(!res.ok)throw new Error();const profile=await res.json();user.innerHTML=`${avatar(profile)}<span>${profile.name||"Participante"}</span>`}catch{user.innerHTML=`${avatar({name:"Acesso inválido"})}<span>Acesso inválido</span>`}}
export function avatar(profile){const name=profile?.name||"Participante",initial=name.trim().charAt(0).toUpperCase();return profile?.photo?`<img class="avatar" src="${profile.photo}" alt="${name}">`:`<span class="avatar avatar-fallback">${initial}</span>`}
export function toast(message){const el=document.querySelector("#toast");el.textContent=message;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),2600)}
export async function responseJson(response){const text=await response.text();try{return JSON.parse(text)}catch{throw new Error(response.ok?"Resposta inválida do servidor.":"Servidor desatualizado. Reinicie o serviço.")}}
export function normalizeBets(data={}){return{...data,matches:data.matches&&typeof data.matches==="object"?data.matches:{},special:data.special||null,specialLocked:Boolean(data.specialLocked)}}
export async function loadBets(){if(!token)return normalizeBets();const res=await fetch(`/api/bets?token=${encodeURIComponent(token)}`);if(!res.ok)throw new Error("Link de acesso inválido.");return normalizeBets(await res.json())}
