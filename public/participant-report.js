import{label,avatar,responseJson,toast}from"./shared.js";

const params=new URLSearchParams(location.search),token=(params.get("token")||"").trim(),content=document.querySelector("#report-content"),title=document.querySelector("#report-title"),description=document.querySelector("#report-description");
const formatDate=value=>value?new Intl.DateTimeFormat("pt-BR",{dateStyle:"short",timeStyle:"short"}).format(new Date(value)):"";
const resultLabel=(pick,game)=>pick==="draw"?"Empate":pick?label(game?.[pick]||pick):"Nao apostou";
const scoreLabel=item=>item?`${item.homeScore} x ${item.awayScore}`:"Nao apostou";
const advancingLabel=(side,row)=>side?label(row?.[side]||side):"Nao apostou";
const statusLabel=status=>({correct:"Acertou",wrong:"Errou",missing:"Nao apostou",pending:"Pendente"}[status]||"Pendente");
const statusClass=status=>status==="correct"?"status-correct":status==="wrong"||status==="missing"?"status-wrong":"status-future";
const rowClass=status=>status==="correct"?"correct-bet":status==="wrong"||status==="missing"?"wrong-bet":"";
const specialFieldLabel=field=>({champion:"Campeao",runnerUp:"Vice-campeao",third:"Terceiro lugar",brazilStage:"Fase do Brasil"}[field]||field);
const playoffPoints=item=>item.result?`${item.points} ponto${item.points===1?"":"s"}${item.exactScore?" - placar exato":item.outcomeCorrect||item.oneScoreCorrect||item.advancingCorrect?` - ${[item.outcomeCorrect&&"resultado",item.oneScoreCorrect&&"placar parcial",item.advancingCorrect&&"classificado"].filter(Boolean).join(", ")}`:""}`:"Aguardando resultado";

function metric(labelText,value){return`<div><b>${value||0}</b><span>${labelText}</span></div>`}
function renderSummary(data){
  const profile=data.profile||{},summary=data.summary||{};
  return `<section class="participant-report-cover"><div class="person">${avatar(profile)}<span><b>${profile.name||"Participante"}</b><small>${data.email||""}</small></span></div><div class="participant-report-summary report-full-summary">${metric("Pontos",summary.points)}${metric("Acertos",summary.correct)}${metric("Fase de grupos",summary.matchPoints)}${metric("Playoffs",summary.playoffPoints)}${metric("Especiais",summary.specialPoints)}${metric("Extras",summary.extraPoints)}</div></section>`;
}
function renderGroups(data){
  const rows=data.groups?.games||[],info=data.groups||{};
  return `<section class="report-section"><h2>Fase de grupos</h2><p>${info.finished||0} jogos com resultado: ${info.correct||0} acertos, ${info.wrong||0} erros e ${info.missing||0} sem palpite.</p><div class="table-wrap report-table"><table><thead><tr><th>Jogo</th><th>Inicio</th><th>Palpite</th><th>Resultado</th><th>Pontos</th><th>Status</th></tr></thead><tbody>${rows.map(row=>`<tr class="${rowClass(row.status)}"><td><b>${label(row.home)} x ${label(row.away)}</b><small class="admin-game-group">${row.group||""}</small></td><td>${formatDate(row.kickoff)}</td><td>${resultLabel(row.pick,row)}</td><td><span class="official-pick ${row.result?"available":""}">${row.result?resultLabel(row.result,row):"Aguardando"}</span></td><td>${row.points}</td><td><span class="game-status ${statusClass(row.status)}">${statusLabel(row.status)}</span></td></tr>`).join("")}</tbody></table></div></section>`;
}
function renderPlayoffs(data){
  const rows=data.playoffs?.games||[],info=data.playoffs||{};
  return `<section class="report-section"><h2>Playoffs</h2><p>${info.finished||0} jogos com resultado: ${info.correct||0} acertos, ${info.wrong||0} erros e ${info.missing||0} sem palpite.</p><div class="table-wrap report-table"><table><thead><tr><th>Jogo</th><th>Inicio</th><th>Palpite</th><th>Classificado</th><th>Resultado</th><th>Pontos</th><th>Status</th></tr></thead><tbody>${rows.map(row=>`<tr class="${rowClass(row.status)}"><td><b>${label(row.home)} x ${label(row.away)}</b><small class="admin-game-group">${row.stage||""}</small></td><td>${formatDate(row.kickoff)}</td><td>${scoreLabel(row.bet)}</td><td>${advancingLabel(row.bet?.advancing,row)}</td><td><span class="official-pick ${row.result?"available":""}">${row.result?`${scoreLabel(row.result)} - ${advancingLabel(row.result.advancing,row)}`:"Aguardando"}</span></td><td>${playoffPoints(row)}</td><td><span class="game-status ${statusClass(row.status)}">${statusLabel(row.status)}</span></td></tr>`).join("")}</tbody></table></div></section>`;
}
function renderSpecial(data){
  const rows=data.special?.details||[],info=data.special||{};
  return `<section class="report-section"><h2>Especiais</h2><p>${info.correct||0} acertos e ${info.points||0} pontos nos palpites especiais.</p><div class="table-wrap report-table"><table><thead><tr><th>Item</th><th>Palpite</th><th>Resultado</th><th>Pontos</th><th>Status</th></tr></thead><tbody>${rows.map(row=>`<tr class="${row.correct?"correct-bet":row.result?"wrong-bet":""}"><td><b>${specialFieldLabel(row.field)}</b></td><td>${row.field==="brazilStage"?row.pick||"Nao apostou":label(row.pick||"Nao apostou")}</td><td><span class="official-pick ${row.result?"available":""}">${row.field==="brazilStage"?row.result||"Aguardando":label(row.result||"Aguardando")}</span></td><td>${row.correct?row.points:0}</td><td><span class="game-status ${row.correct?"status-correct":row.result?"status-wrong":"status-future"}">${row.correct?"Acertou":row.result?"Errou":"Pendente"}</span></td></tr>`).join("")}</tbody></table></div></section>`;
}

async function loadReport(){
  if(!token)throw new Error("Participante nao informado.");
  const response=await fetch(`/api/admin-participant-report?token=${encodeURIComponent(token)}`),data=await responseJson(response);
  if(!response.ok)throw new Error(data.error||"Nao foi possivel carregar o relatorio.");
  title.textContent=data.profile?.name||"Relatorio individual";
  description.textContent=`${data.summary.points} pontos, ${data.summary.correct} acertos, ${data.summary.matchPoints} pontos na fase de grupos, ${data.summary.playoffPoints} nos playoffs e ${data.summary.specialPoints} especiais.`;
  content.innerHTML=renderSummary(data)+renderGroups(data)+renderPlayoffs(data)+renderSpecial(data);
}

document.querySelector("#print-report").addEventListener("click",()=>window.print());
loadReport().catch(error=>{content.innerHTML=`<div class="empty">${error.message}</div>`;toast(error.message)});
