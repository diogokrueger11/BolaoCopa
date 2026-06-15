import{games,label,setupNav,toast,avatar,responseJson}from"./shared.js";
setupNav("ranking");
const body=document.querySelector("#ranking-body"),dialog=document.querySelector("#ranking-dialog"),details=document.querySelector("#ranking-details"),gameById=Object.fromEntries(games.map(game=>[game.id,game]));
const pickLabel=(pick,game)=>pick==="draw"?"Empate":label(game?.[pick]||pick);
fetch("/api/ranking").then(res=>res.json()).then(data=>{
  document.querySelector("#ranking-summary").textContent=`${data.finishedGames} jogos contabilizados`;
  body.innerHTML=data.ranking.length?data.ranking.map(row=>`<tr class="ranking-row" data-participant="${row.participantId}" tabindex="0"><td><b>${row.position}</b></td><td><div class="person">${avatar(row.profile)}<span><b>${row.profile.name||"Participante"}</b><small>Ver palpites corretos</small></span></div></td><td>${row.correct}</td><td><strong>${row.points}</strong><small class="ranking-points-breakdown">${row.matchPoints} jogos + ${row.specialPoints} especiais</small></td></tr>`).join(""):'<tr><td colspan="4" class="empty">Nenhum participante salvou palpites ainda.</td></tr>';
}).catch(()=>toast("Nao foi possivel carregar o ranking."));
async function showDetails(id){
  details.innerHTML='<div class="empty">Carregando acertos...</div>';dialog.showModal();
  const response=await fetch(`/api/ranking-details?id=${encodeURIComponent(id)}`),data=await responseJson(response);
  if(!response.ok){details.innerHTML=`<div class="empty">${data.error}</div>`;return}
  const specialLabels={champion:"Campeao",runnerUp:"Vice-campeao",third:"Terceiro lugar",brazilStage:"Fase do Brasil"};
  details.innerHTML=`<p class="eyebrow">PALPITES CORRETOS</p><div class="ranking-person">${avatar(data.profile)}<div><h2>${data.profile.name||"Participante"}</h2><span>${data.correct} acertos &bull; ${data.points} pontos (${data.matchPoints} jogos + ${data.specialPoints} especiais)</span></div></div><div class="ranking-correct-list">${data.games.map(item=>{const game=gameById[item.gameId];return`<div class="ranking-correct-game"><b>${label(game?.home||item.gameId)} x ${label(game?.away||"")}</b><span>Acertou: ${pickLabel(item.pick,game)}</span></div>`}).join("")}${data.special.map(item=>`<div class="ranking-correct-game special-correct"><b>${specialLabels[item.field]}</b><span>Acertou: ${label(item.pick)} (+${item.points} pontos)</span></div>`).join("")}${!data.games.length&&!data.special.length?'<div class="empty">Este participante ainda nao possui acertos.</div>':""}</div>`;
}
body.addEventListener("click",event=>{const row=event.target.closest("[data-participant]");if(row)showDetails(row.dataset.participant).catch(error=>toast(error.message))});
body.addEventListener("keydown",event=>{const row=event.target.closest("[data-participant]");if(row&&(event.key==="Enter"||event.key===" ")){event.preventDefault();showDetails(row.dataset.participant).catch(error=>toast(error.message))}});
dialog.querySelector("[data-close]").onclick=()=>dialog.close();
dialog.addEventListener("click",event=>{if(event.target===dialog)dialog.close()});
