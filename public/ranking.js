import{setupNav,toast,avatar}from"./shared.js";
setupNav("ranking");
const body=document.querySelector("#ranking-body"),playoffBody=document.querySelector("#playoff-ranking-body");
function rankPlayoffs(rows){
  const ranking=[...rows].sort((a,b)=>b.playoffPoints-a.playoffPoints||b.playoffCorrect-a.playoffCorrect||(a.profile.name||"").localeCompare(b.profile.name||"","pt-BR"));
  let previous=null;
  return ranking.map((row,index)=>{
    const position=previous&&previous.playoffPoints===row.playoffPoints&&previous.playoffCorrect===row.playoffCorrect?previous.position:index+1;
    previous={...row,position};
    return{...row,position};
  });
}
fetch("/api/ranking").then(res=>res.json()).then(data=>{
  document.querySelector("#ranking-summary").textContent=`${data.finishedGames} jogos contabilizados`;
  body.innerHTML=data.ranking.length?data.ranking.map(row=>`<tr><td><b>${row.position}</b></td><td><div class="person">${avatar(row.profile)}<span><b>${row.profile.name||"Participante"}</b></span></div></td><td>${row.correct}</td><td><strong>${row.points}</strong></td></tr>`).join(""):'<tr><td colspan="4" class="empty">Nenhum participante salvou palpites ainda.</td></tr>';
  const playoffRanking=rankPlayoffs(data.ranking);
  playoffBody.innerHTML=playoffRanking.length?playoffRanking.map(row=>`<tr><td><b>${row.position}</b></td><td><div class="person">${avatar(row.profile)}<span><b>${row.profile.name||"Participante"}</b></span></div></td><td>${row.playoffCorrect}</td><td><strong>${row.playoffPoints}</strong></td></tr>`).join(""):'<tr><td colspan="4" class="empty">Nenhum participante salvou palpites ainda.</td></tr>';
}).catch(()=>toast("Nao foi possivel carregar o ranking."));
