import{token,withToken,setupNav,loadBets,toast,avatar}from"./shared.js";

setupNav("home");
document.querySelectorAll("[data-go]").forEach(link=>link.href=withToken(link.dataset.go));
fetch(token?`/api/profile?token=${encodeURIComponent(token)}`:"").then(response=>response.ok?response.json():null).then(profile=>{
  document.querySelector("#home-email").textContent=profile?.name?`Bem-vindo, ${profile.name}.`:"Bem-vindo ao Bolão DCASH.";
}).catch(()=>{document.querySelector("#home-email").textContent="Bem-vindo ao Bolão DCASH."});

let participantId=null;
loadBets().then(data=>{
  participantId=data.participantId||null;
  document.querySelector("#home-bets").textContent=Object.keys(data.matches||{}).length;
  document.querySelector("#home-playoffs").textContent=Object.keys(data.playoffs||{}).length;
  document.querySelector("#home-special").textContent=data.special?"Salvos":"Pendente";
  if(window.latestRanking)renderMyRanking(window.latestRanking);
}).catch(error=>toast(error.message));

function renderMyRanking(data){
  if(!participantId)return;
  const row=data.ranking.find(item=>item.participantId===participantId),card=document.querySelector("#my-ranking-card");
  if(!row)return;
  card.classList.remove("hidden");
  document.querySelector("#my-ranking-position").textContent=`${row.position}º`;
  document.querySelector("#my-ranking-summary").textContent=`${row.profile.name||"Participante"}: ${row.points} pontos (${row.matchPoints} jogos + ${row.playoffPoints} playoffs + ${row.specialPoints} especiais + ${row.extraPoints} extras).`;
}

fetch("/api/ranking").then(response=>response.json()).then(data=>{
  window.latestRanking=data;
  renderMyRanking(data);
  const topTen=data.ranking.slice(0,10);
  document.querySelector("#home-ranking-summary").textContent=`${data.finishedGames} jogos contabilizados`;
  document.querySelector("#home-ranking-body").innerHTML=topTen.length?topTen.map(row=>`
    <tr class="${row.position<=3?`podium podium-${row.position}`:""}">
      <td><span class="position">${row.position}</span></td>
      <td><div class="person">${avatar(row.profile)}<span><b>${row.profile.name||"Participante"}</b></span></div></td>
      <td>${row.correct}</td>
      <td><strong>${row.points}</strong></td>
    </tr>`).join(""):'<tr><td colspan="4" class="empty">Nenhum participante salvou palpites ainda.</td></tr>';
}).catch(()=>toast("Não foi possível carregar o ranking."));
