import{token,withToken,setupNav,loadBets,toast,avatar}from"./shared.js";

setupNav("home");
document.querySelectorAll("[data-go]").forEach(link=>link.href=withToken(link.dataset.go));
fetch(token?`/api/profile?token=${encodeURIComponent(token)}`:"").then(response=>response.ok?response.json():null).then(profile=>{
  document.querySelector("#home-email").textContent=profile?.name?`Bem-vindo, ${profile.name}.`:"Bem-vindo ao Bolão DCASH.";
}).catch(()=>{document.querySelector("#home-email").textContent="Bem-vindo ao Bolão DCASH."});

loadBets().then(data=>{
  document.querySelector("#home-bets").textContent=Object.keys(data.matches||{}).length;
  document.querySelector("#home-special").textContent=data.special?"Salvos":"Pendente";
}).catch(error=>toast(error.message));

fetch("/api/ranking").then(response=>response.json()).then(data=>{
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
