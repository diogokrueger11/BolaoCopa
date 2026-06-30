import{setupNav,toast,avatar}from"./shared.js";
setupNav("ranking");

const body=document.querySelector("#ranking-body"),summary=document.querySelector("#ranking-summary"),description=document.querySelector("#ranking-description"),pointsHead=document.querySelector("#ranking-points-head"),modeButtons=[...document.querySelectorAll("[data-ranking-mode]")];
let rankingRows=[],currentMode="general";
const modes={
  general:{label:"Pontos",summary:"Ranking geral",description:"Acompanhe a classificacao geral do bolao.",points:"points",correct:"correct"},
  groups:{label:"Pontos fase de grupos",summary:"Ranking da fase de grupos",description:"Pontuacao considerando somente os palpites dos jogos da fase de grupos.",points:"matchPoints",correct:"matchCorrect"},
  playoffs:{label:"Pontos playoffs",summary:"Ranking dos playoffs",description:"Pontuacao considerando somente os palpites do mata-mata.",points:"playoffPoints",correct:"playoffCorrect"}
};

function rankedRows(mode){
  const config=modes[mode];
  const rows=[...rankingRows].sort((a,b)=>b[config.points]-a[config.points]||b[config.correct]-a[config.correct]||(a.profile.name||"").localeCompare(b.profile.name||"","pt-BR"));
  let previous=null;
  return rows.map((row,index)=>{
    const position=previous&&previous.points===row[config.points]&&previous.correct===row[config.correct]?previous.position:index+1;
    previous={points:row[config.points],correct:row[config.correct],position};
    return{...row,position};
  });
}

function renderRanking(){
  const config=modes[currentMode],rows=rankedRows(currentMode);
  description.textContent=config.description;
  pointsHead.textContent=config.label;
  modeButtons.forEach(button=>button.classList.toggle("active",button.dataset.rankingMode===currentMode));
  body.innerHTML=rows.length?rows.map(row=>`<tr><td><b>${row.position}</b></td><td><div class="person">${avatar(row.profile)}<span><b>${row.profile.name||"Participante"}</b></span></div></td><td>${row[config.correct]}</td><td><strong>${row[config.points]}</strong></td></tr>`).join(""):'<tr><td colspan="4" class="empty">Nenhum participante salvou palpites ainda.</td></tr>';
}

modeButtons.forEach(button=>button.addEventListener("click",()=>{currentMode=button.dataset.rankingMode;renderRanking()}));

fetch("/api/ranking").then(res=>res.json()).then(data=>{
  rankingRows=data.ranking||[];
  summary.textContent=`${data.finishedGames} jogos contabilizados`;
  renderRanking();
}).catch(()=>toast("Nao foi possivel carregar o ranking."));
