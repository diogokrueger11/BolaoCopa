import{games,label,setupNav,toast,avatar,responseJson}from"./shared.js";
setupNav("access");
const grid=document.querySelector("#users-grid"),betsBody=document.querySelector("#admin-bets-body"),gameById=Object.fromEntries(games.map(game=>[game.id,game]));
const formatDate=value=>value?new Intl.DateTimeFormat("pt-BR",{dateStyle:"short",timeStyle:"short"}).format(new Date(value)):"";
const pickLabel=(row,game)=>row.pick==="draw"?"Empate":label(game?.[row.pick]||row.pick);
function card(item){
  return`<article class="user-invite-card ${item.sent?"sent":"pending"}" data-card="${item.token}" data-sent="${item.sent}">
    <div class="invite-user">${avatar(item)}<div><b>${item.name}</b><span class="invite-status ${item.sent?"status-sent":"status-pending"}">${item.sent?"Mensagem enviada":"Mensagem não enviada"}</span></div></div>
    <div class="invite-card-footer"><small>${item.sent?`Enviada em ${formatDate(item.sentAt)}`:"Aguardando envio"}</small><button class="bitrix-send" data-recipient="${item.token}" data-name="${item.name}" ${!item.canMessage?"disabled":""}>${item.sent?"Reenviar mensagem":"Enviar mensagem"}</button></div>
  </article>`;
}
function metrics(items){document.querySelector("#links-count").textContent=items.length;document.querySelector("#sent-count").textContent=items.filter(x=>x.sent).length;document.querySelector("#pending-count").textContent=items.filter(x=>!x.sent).length}
let allBets=[];
function renderBets(){const search=document.querySelector("#bet-search").value.trim().toLocaleLowerCase("pt-BR"),status=document.querySelector("#bet-status").value,rows=allBets.filter(row=>{const game=gameById[row.gameId],text=`${row.participant} ${label(game?.home||"")} ${label(game?.away||"")}`.toLocaleLowerCase("pt-BR");return(!search||text.includes(search))&&(status==="all"||(status==="started"&&row.started)||(status==="future"&&!row.started))});betsBody.innerHTML=rows.length?rows.map(row=>{const game=gameById[row.gameId];return`<tr><td><div class="person">${avatar({name:row.participant,photo:row.photo})}<span><b>${row.participant}</b><small>${row.email}</small></span></div></td><td><b>${label(game?.home||row.gameId)} x ${label(game?.away||"")}</b></td><td><span class="admin-pick">${pickLabel(row,game)}</span></td><td>${formatDate(row.kickoff)}</td><td><span class="game-status ${row.started?"status-started":"status-future"}">${row.started?"Iniciado":"Futuro"}</span></td></tr>`}).join(""):'<tr><td colspan="5" class="empty">Nenhum palpite encontrado.</td></tr>'}
fetch("/api/admin-transparency").then(async response=>{const data=await responseJson(response);if(!response.ok)throw new Error(data.error);allBets=data.rows;document.querySelector("#total-bets").textContent=data.totalBets;document.querySelector("#bettors-count").textContent=data.participantsWithBets;renderBets()}).catch(error=>betsBody.innerHTML=`<tr><td colspan="5" class="empty">${error.message}</td></tr>`);
document.querySelector("#bet-search").addEventListener("input",renderBets);
document.querySelector("#bet-status").addEventListener("change",renderBets);
document.querySelector("#update-results").addEventListener("click",async event=>{
  const button=event.currentTarget,status=document.querySelector("#results-update-status");
  if(!confirm("Buscar agora os resultados finalizados e atualizar o ranking?"))return;
  button.disabled=true;button.textContent="Buscando resultados...";status.textContent="Consultando a fonte de resultados...";
  try{
    const response=await fetch("/api/update-results",{method:"POST"}),data=await responseJson(response);
    if(!response.ok)throw new Error(data.error);
    status.textContent=`${data.fetched} jogos finalizados encontrados, ${data.changed} resultados alterados e ${data.total} contabilizados no ranking.`;
    toast("Resultados atualizados.");
  }catch(error){status.textContent=error.message;toast("Não foi possível atualizar os resultados.")}
  finally{button.disabled=false;button.textContent="Buscar resultados dos jogos"}
});
fetch("/api/access-links").then(async response=>{
  const data=await responseJson(response);if(!response.ok)throw new Error(data.error);metrics(data.links);grid.innerHTML=data.links.map(card).join("");
}).catch(error=>grid.innerHTML=`<div class="empty">${error.message}</div>`);
grid.addEventListener("click",async event=>{
  const send=event.target.closest("[data-recipient]");if(!send)return;
  if(!confirm(`Enviar a mensagem individual para ${send.dataset.name} pelo chat do Bitrix?`))return;
  send.disabled=true;send.textContent="Enviando...";
  const response=await fetch("/api/send-bitrix-invite",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({recipientToken:send.dataset.recipient})});
  const data=await responseJson(response);
  if(!response.ok){send.disabled=false;send.textContent="Enviar mensagem";return toast(data.error)}
  const cardEl=send.closest("[data-card]"),wasSent=cardEl.dataset.sent==="true";cardEl.dataset.sent="true";cardEl.classList.remove("pending");cardEl.classList.add("sent");cardEl.querySelector(".invite-status").className="invite-status status-sent";cardEl.querySelector(".invite-status").textContent="Mensagem enviada";cardEl.querySelector("small").textContent=`Enviada em ${formatDate(data.sentAt)}`;send.disabled=false;send.textContent="Reenviar mensagem";
  if(!wasSent){document.querySelector("#sent-count").textContent=Number(document.querySelector("#sent-count").textContent)+1;document.querySelector("#pending-count").textContent=Math.max(0,Number(document.querySelector("#pending-count").textContent)-1)}toast(`Mensagem enviada para ${data.name}.`);
});
