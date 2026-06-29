import{playoffs,token,playoffFlag,label,setupNav,toast,loadBets,normalizeBets,avatar,responseJson}from"./shared.js";
setupNav("playoffs");

let state={playoffs:{}};
const el=document.querySelector("#playoffs"),dialog=document.querySelector("#playoff-transparency-dialog"),dialogContent=document.querySelector("#playoff-transparency-content");
const fmtDay=new Intl.DateTimeFormat("pt-BR",{weekday:"long",day:"2-digit",month:"long"}),fmtTime=new Intl.DateTimeFormat("pt-BR",{hour:"2-digit",minute:"2-digit",timeZone:"America/Sao_Paulo"});

function bet(game){return state.playoffs?.[game.id]||{homeScore:"",awayScore:"",advancing:""}}
function scoreWinner(current){const home=Number(current.homeScore),away=Number(current.awayScore);if(!Number.isInteger(home)||!Number.isInteger(away))return "";return home>away?"home":away>home?"away":""}
function normalizeAdvancing(current){const winner=scoreWinner(current);if(winner)return winner;if(current.homeScore!==""&&current.awayScore!==""&&Number(current.homeScore)===Number(current.awayScore))return current.advancing||"";return current.advancing||""}
function teamOption(game,side,current,locked){const winner=scoreWinner(current),selected=normalizeAdvancing(current)===side,disabled=locked||Boolean(winner);return`<label class="advance-choice ${selected?"selected":""} ${winner?"fixed":""}"><input type="radio" name="advancing-${game.id}" value="${side}" data-playoff-advance="${game.id}" ${selected?"checked":""} ${disabled?"disabled":""}>${playoffFlag(game[side])}<span>${label(game[side])}</span></label>`}
function scoreLabel(item){return item?`${item.homeScore} x ${item.awayScore}`:"Aguardando"}
function advancingLabel(game,side){return side?label(game?.[side]||side):"Aguardando"}
function playoffPoints(bet,result){if(!bet||!result||!Number.isInteger(bet.homeScore)||!Number.isInteger(bet.awayScore)||!["home","away"].includes(bet.advancing))return null;const exactScore=bet.homeScore===result.homeScore&&bet.awayScore===result.awayScore,advancingCorrect=bet.advancing===result.advancing,betWinner=bet.homeScore===bet.awayScore?"draw":bet.homeScore>bet.awayScore?"home":"away",resultWinner=result.homeScore===result.awayScore?"draw":result.homeScore>result.awayScore?"home":"away",outcomeCorrect=!exactScore&&betWinner===resultWinner,oneScoreCorrect=!exactScore&&(bet.homeScore===result.homeScore||bet.awayScore===result.awayScore);return{points:(exactScore?4:0)+(advancingCorrect?2:0)+(oneScoreCorrect?1:0)+(outcomeCorrect?1:0),exactScore,advancingCorrect,oneScoreCorrect,outcomeCorrect}}
function pointsText(score){if(!score)return"Sem palpite registrado";const details=[score.exactScore&&"placar exato",score.advancingCorrect&&"classificado",score.outcomeCorrect&&"resultado",score.oneScoreCorrect&&"placar parcial"].filter(Boolean);return`${score.points} ponto${score.points===1?"":"s"}${details.length?` - ${details.join(", ")}`:""}`}
function resultPanel(game,current){if(!game.result)return"";const score=playoffPoints(current,game.result);return`<div class="playoff-result-panel"><div><span>Resultado oficial</span><b>${scoreLabel(game.result)} - ${advancingLabel(game,game.result.advancing)}</b></div><div><span>Seus pontos</span><b>${pointsText(score)}</b></div></div>`}
function transparencyButton(game,locked){return`<button class="transparency-button" data-playoff-transparency="${game.id}" ${locked?"":"disabled"}>${locked?"Ver transparencia":"Disponivel apos o inicio"}</button>`}
function updateCount(){document.querySelector("#playoff-count").textContent=Object.values(state.playoffs).filter(item=>item.homeScore!==""&&item.awayScore!==""&&Number.isInteger(Number(item.homeScore))&&Number.isInteger(Number(item.awayScore))&&item.advancing).length}

function render(){
  const active=document.activeElement?.closest?.("[data-playoff-score]"),focused=active&&{gameId:active.dataset.playoffScore,side:active.dataset.side},scrollX=window.scrollX,scrollY=window.scrollY;
  state=normalizeBets(state);state.playoffs=state.playoffs&&typeof state.playoffs==="object"?state.playoffs:{};
  el.innerHTML="";
  let stage="";
  for(const game of playoffs){
    if(game.stage!==stage){stage=game.stage;el.insertAdjacentHTML("beforeend",`<div class="day">${stage}</div><div class="playoff-grid"></div>`)}
    const grid=el.lastElementChild,current=bet(game),locked=new Date(game.kickoff)<=new Date(),defined=game.defined!==false;
    current.advancing=normalizeAdvancing(current);
    grid.insertAdjacentHTML("beforeend",`<article class="game playoff-game ${defined?"":"playoff-locked"}"><div class="game-top"><span>${game.id}</span><span>${fmtDay.format(new Date(game.kickoff))} &bull; ${fmtTime.format(new Date(game.kickoff))}</span></div>${defined?`<div class="playoff-score-row"><div class="playoff-team">${playoffFlag(game.home)}<b>${label(game.home)}</b></div><input type="number" min="0" max="30" step="1" value="${current.homeScore??""}" data-playoff-score="${game.id}" data-side="homeScore" ${locked?"disabled":""} aria-label="Placar de ${label(game.home)}"><span>x</span><input type="number" min="0" max="30" step="1" value="${current.awayScore??""}" data-playoff-score="${game.id}" data-side="awayScore" ${locked?"disabled":""} aria-label="Placar de ${label(game.away)}"><div class="playoff-team away">${playoffFlag(game.away)}<b>${label(game.away)}</b></div></div><div class="advance-title">${scoreWinner(current)?"Time que avanca definido pelo placar":"Empate: escolha quem avanca"}</div><div class="advance-options">${teamOption(game,"home",current,locked)}${teamOption(game,"away",current,locked)}</div>${resultPanel(game,current)}${transparencyButton(game,locked)}`:`<div class="playoff-pending"><b>Confronto ainda nao definido</b><span>As apostas serao liberadas quando os dois paises forem confirmados.</span></div>`}</article>`);
  }
  updateCount();
  if(focused){const input=[...el.querySelectorAll("[data-playoff-score]")].find(item=>item.dataset.playoffScore===focused.gameId&&item.dataset.side===focused.side);input?.focus({preventScroll:true});window.scrollTo(scrollX,scrollY)}
}

function ensure(id){state.playoffs[id]=state.playoffs[id]||{};return state.playoffs[id]}
async function showTransparency(game){
  dialogContent.innerHTML='<div class="empty">Carregando palpites...</div>';
  dialog.showModal();
  const response=await fetch(`/api/playoff-transparency?id=${encodeURIComponent(game.id)}`),data=await responseJson(response);
  if(!response.ok){dialogContent.innerHTML=`<div class="empty">${data.error}</div>`;return}
  dialogContent.innerHTML=`<p class="eyebrow">TRANSPARENCIA DO MATA-MATA</p><h2>${label(game.home)} x ${label(game.away)}</h2><div class="official-result ${data.result?"available":""}"><span>Resultado oficial</span><b>${data.result?`${scoreLabel(data.result)} - ${advancingLabel(game,data.result.advancing)}`:"Aguardando atualizacao"}</b></div><div class="transparency-totals"><div><b>${data.totals.home}</b><span>${label(game.home)} classifica</span></div><div><b>${data.totals.away}</b><span>${label(game.away)} classifica</span></div><div><b>${data.total}</b><span>palpites</span></div></div><div class="transparency-list">${data.picks.length?data.picks.map(item=>`<div class="transparency-person ${item.points>0?"correct":data.result?"wrong":""}">${avatar(item)}<b>${item.name}</b><span>${scoreLabel(item.bet)} - ${advancingLabel(game,item.bet.advancing)}${data.result?` - ${pointsText(item)}`:""}</span></div>`).join(""):'<div class="empty">Nenhum palpite foi registrado para este playoff.</div>'}</div><button class="show-non-bettors" data-show-non-bettors>Mostrar quem nao apostou (${data.nonBettors.length})</button><div class="non-bettors-list hidden" data-non-bettors>${data.nonBettors.length?data.nonBettors.map(item=>`<div class="transparency-person">${avatar(item)}<b>${item.name}</b><span>Nao apostou</span></div>`).join(""):'<div class="empty">Todos os convidados participantes apostaram neste playoff.</div>'}</div>`;
}

el.addEventListener("input",event=>{const input=event.target.closest("[data-playoff-score]");if(!input)return;const current=ensure(input.dataset.playoffScore);current[input.dataset.side]=input.value===""?"":Number(input.value);if(current.homeScore!==""&&current.awayScore!==""&&Number(current.homeScore)===Number(current.awayScore))current.advancing="";else current.advancing=normalizeAdvancing(current);render()});
el.addEventListener("change",event=>{const input=event.target.closest("[data-playoff-advance]");if(!input)return;ensure(input.dataset.playoffAdvance).advancing=input.value;render()});
el.addEventListener("click",event=>{const button=event.target.closest("[data-playoff-transparency]");if(!button)return;const game=playoffs.find(item=>item.id===button.dataset.playoffTransparency);showTransparency(game).catch(error=>toast(error.message))});
dialog.querySelector("[data-close]").onclick=()=>dialog.close();
dialog.addEventListener("click",event=>{if(event.target===dialog)dialog.close()});
dialogContent.addEventListener("click",event=>{const button=event.target.closest("[data-show-non-bettors]");if(!button)return;const list=dialogContent.querySelector("[data-non-bettors]");list.classList.toggle("hidden");button.textContent=list.classList.contains("hidden")?`Mostrar quem nao apostou (${list.querySelectorAll(".transparency-person").length})`:"Ocultar quem nao apostou"});
document.querySelector("#save-playoffs").onclick=async()=>{if(!token)return toast("Abra seu link personalizado.");const res=await fetch(`/api/bets?token=${encodeURIComponent(token)}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({playoffs:state.playoffs})});const data=await res.json();if(res.ok){state=normalizeBets(data);render();toast("Palpites dos playoffs salvos.")}else toast(data.error)};
render();loadBets().then(data=>{state=data;render()}).catch(error=>toast(error.message));
setInterval(render,30000);
