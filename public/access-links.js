import{games,label,setupNav,toast,avatar,responseJson}from"./shared.js";
setupNav("access");
const grid=document.querySelector("#users-grid"),betsBody=document.querySelector("#admin-bets-body"),gameById=Object.fromEntries(games.map(game=>[game.id,game]));
const formatDate=value=>value?new Intl.DateTimeFormat("pt-BR",{dateStyle:"short",timeStyle:"short"}).format(new Date(value)):"";
const resultLabel=(pick,game)=>pick==="draw"?"Empate":pick?label(game?.[pick]||pick):"Aguardando";
function card(item){
  return`<article class="user-invite-card ${item.sent?"sent":"pending"}" data-card="${item.token}" data-sent="${item.sent}">
    <div class="invite-user">${avatar(item)}<div><b>${item.name}</b><span class="user-score"><strong data-score>${item.points}</strong> pontos &bull; <span data-correct>${item.correct}</span> acertos em <span data-finished>${item.finishedGames}</span> jogos</span></div></div>
    <div class="user-recalculate-status" data-recalculate-status>Calculo baseado nos resultados oficiais atuais.</div>
    <div class="user-actions"><button class="recalculate-user" data-recalculate="${item.token}" data-name="${item.name}">Recalcular pontos</button><button class="bitrix-send" data-recipient="${item.token}" data-name="${item.name}" ${!item.canMessage?"disabled":""}>${item.sent?"Reenviar mensagem":"Enviar mensagem"}</button></div>
  </article>`;
}
function metrics(items){document.querySelector("#links-count").textContent=items.length;document.querySelector("#sent-count").textContent=items.filter(x=>x.sent).length;document.querySelector("#pending-count").textContent=items.filter(x=>!x.sent).length}
let allBets=[];
function renderBets(){const search=document.querySelector("#bet-search").value.trim().toLocaleLowerCase("pt-BR"),status=document.querySelector("#bet-status").value,rows=allBets.filter(row=>{const game=gameById[row.gameId],text=`${row.participant} ${label(game?.home||"")} ${label(game?.away||"")}`.toLocaleLowerCase("pt-BR");return(!search||text.includes(search))&&(status==="all"||(status==="started"&&row.started)||(status==="future"&&!row.started))});betsBody.innerHTML=rows.length?rows.map(row=>{const game=gameById[row.gameId];return`<tr class="${row.correct?"correct-bet":""}"><td><div class="person">${avatar({name:row.participant,photo:row.photo})}<span><b>${row.participant}</b><small>${row.email}</small></span></div></td><td><b>${label(game?.home||row.gameId)} x ${label(game?.away||"")}</b></td><td><span class="admin-pick">${resultLabel(row.pick,game)}</span></td><td><span class="official-pick ${row.result?"available":""}">${resultLabel(row.result,game)}</span></td><td>${formatDate(row.kickoff)}</td><td><span class="game-status ${row.correct?"status-correct":row.started?"status-started":"status-future"}">${row.correct?"Acertou":row.result?"Nao acertou":row.started?"Iniciado":"Futuro"}</span></td><td><button class="table-recalculate" data-recalculate="${row.participantToken}" data-name="${row.participant}">Recalcular pontos</button></td></tr>`}).join(""):'<tr><td colspan="7" class="empty">Nenhum palpite encontrado.</td></tr>'}
async function loadTransparency(){const response=await fetch("/api/admin-transparency"),data=await responseJson(response);if(!response.ok)throw new Error(data.error);allBets=data.rows;document.querySelector("#total-bets").textContent=data.totalBets;document.querySelector("#bettors-count").textContent=data.participantsWithBets;renderBets()}
loadTransparency().catch(error=>betsBody.innerHTML=`<tr><td colspan="7" class="empty">${error.message}</td></tr>`);
document.querySelector("#bet-search").addEventListener("input",renderBets);
document.querySelector("#bet-status").addEventListener("change",renderBets);
document.querySelector("#update-results").addEventListener("click",async event=>{
  const button=event.currentTarget,status=document.querySelector("#results-update-status");
  if(!confirm("Buscar agora os resultados finalizados e atualizar o ranking?"))return;
  button.disabled=true;button.textContent="Buscando resultados...";status.textContent="Consultando a fonte de resultados...";
  try{const response=await fetch("/api/update-results",{method:"POST"}),data=await responseJson(response);if(!response.ok)throw new Error(data.error);status.textContent=`${data.fetched} jogos finalizados encontrados, ${data.changed} resultados alterados e ${data.total} contabilizados no ranking.`;await loadTransparency();toast("Resultados atualizados.")}
  catch(error){status.textContent=error.message;toast("Nao foi possivel atualizar os resultados.")}
  finally{button.disabled=false;button.textContent="Recalcular todos os resultados"}
});
fetch("/api/access-links").then(async response=>{const data=await responseJson(response);if(!response.ok)throw new Error(data.error);metrics(data.links);grid.innerHTML=data.links.map(card).join("")}).catch(error=>grid.innerHTML=`<div class="empty">${error.message}</div>`);
async function recalculateUser(button){
  button.disabled=true;button.textContent="Recalculando...";
  const response=await fetch("/api/recalculate-user",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({recipientToken:button.dataset.recalculate})}),data=await responseJson(response);
  if(!response.ok){button.disabled=false;button.textContent="Recalcular pontos";return toast(data.error)}
  const cardEl=grid.querySelector(`[data-card="${button.dataset.recalculate}"]`);
  if(cardEl){cardEl.querySelector("[data-score]").textContent=data.points;cardEl.querySelector("[data-correct]").textContent=data.correct;cardEl.querySelector("[data-finished]").textContent=data.finishedGames;cardEl.querySelector("[data-recalculate-status]").textContent=`Recalculado: ${data.correct} acertos, ${data.points} pontos em ${data.finishedGames} jogos finalizados.`}
  await loadTransparency();toast(`Pontuacao de ${data.name} recalculada.`);
}
betsBody.addEventListener("click",event=>{const button=event.target.closest("[data-recalculate]");if(button)recalculateUser(button)});
grid.addEventListener("click",async event=>{
  const recalculate=event.target.closest("[data-recalculate]");
  if(recalculate)return recalculateUser(recalculate);
  const send=event.target.closest("[data-recipient]");if(!send)return;
  if(!confirm(`Enviar a mensagem individual para ${send.dataset.name} pelo chat do Bitrix?`))return;
  send.disabled=true;send.textContent="Enviando...";
  const response=await fetch("/api/send-bitrix-invite",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({recipientToken:send.dataset.recipient})}),data=await responseJson(response);
  if(!response.ok){send.disabled=false;send.textContent="Enviar mensagem";return toast(data.error)}
  const cardEl=send.closest("[data-card]"),wasSent=cardEl.dataset.sent==="true";cardEl.dataset.sent="true";cardEl.classList.remove("pending");cardEl.classList.add("sent");send.disabled=false;send.textContent="Reenviar mensagem";
  if(!wasSent){document.querySelector("#sent-count").textContent=Number(document.querySelector("#sent-count").textContent)+1;document.querySelector("#pending-count").textContent=Math.max(0,Number(document.querySelector("#pending-count").textContent)-1)}toast(`Mensagem enviada para ${data.name}.`);
});
