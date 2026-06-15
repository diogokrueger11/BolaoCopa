const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { cleanMatchBets, validEmail, validToken, createToken, participantPublicId, findByToken, SPECIAL_DEADLINE, setManualResult, calculateParticipant, calculateRanking, stringSimilarity, teamMatches, reconcileFinishedResults, extractFinishedResults, updateResults, updateGameResult, specialTransparency, adminSpecialBets, recalculateGame } = require("../server");

test("usa o endereço oficial da rede interna", () => {
  const { APP_BASE_URL } = require("../server");
  assert.equal(APP_BASE_URL, "http://10.10.0.25:8077");
});

test("valida e-mail", () => {
  assert.equal(validEmail("pessoa@exemplo.com"), true);
  assert.equal(validEmail("invalido"), false);
});
test("remove palpites iniciados e escolhas invalidas", () => {
  const result = cleanMatchBets({
    "D-USA-PAR":{pick:"home"},
    "B-Catar-Suica":{pick:"draw"},
    "C-Brasil-Marrocos":{pick:"score"}
  }, new Date("2026-06-13T12:00:00Z"));
  assert.deepEqual(Object.keys(result), ["B-Catar-Suica"]);
});
test("prazo especial termina no fim de 15 de junho em Brasilia", () => {
  assert.equal(SPECIAL_DEADLINE.toISOString(), "2026-06-16T02:59:59.999Z");
});
test("ranking contabiliza tres pontos por acerto", () => {
  const bets={"ana@exemplo.com":{matches:{j1:{pick:"home"},j2:{pick:"draw"}}},"bia@exemplo.com":{matches:{j1:{pick:"away"},j2:{pick:"draw"}}}};
  const result=calculateRanking(bets,{j1:"home",j2:"draw"});
  assert.equal(result.finishedGames,2);
  assert.deepEqual(result.ranking.map(row=>[row.email,row.correct,row.points]),[["ana@exemplo.com",2,6],["bia@exemplo.com",1,3]]);
});
test("ranking compartilha posicao em empate", () => {
  const bets={"ana@exemplo.com":{matches:{j1:{pick:"home"}}},"bia@exemplo.com":{matches:{j1:{pick:"home"}}}};
  assert.deepEqual(calculateRanking(bets,{j1:"home"}).ranking.map(row=>row.position),[1,1]);
});

test("recalcula e detalha pontuacao individual", () => {
  const record={matches:{j1:{pick:"home"},j2:{pick:"away"},j3:{pick:"draw"}}};
  const result=calculateParticipant(record,{j1:"home",j2:"away",j3:"home"});
  assert.equal(result.correct,2);
  assert.equal(result.points,6);
  assert.deepEqual(result.games.map(game=>game.correct),[true,true,false]);
});

test("ranking usa identificador publico sem expor token", () => {
  const record={accessToken:createToken(),matches:{}},id=participantPublicId(record);
  assert.equal(id.length,24);
  assert.equal(id.includes(record.accessToken),false);
  assert.equal(calculateRanking({"a@exemplo.com":record},{}).ranking[0].participantId,id);
});

test("converte somente placares finalizados em resultados do bolao", () => {
  const schedule = [
    { id:"j1", home:"Brasil", away:"Marrocos" },
    { id:"j2", home:"Estados Unidos", away:"Paraguai" }
  ];
  const payload = { events:[
    { status:{type:{completed:true}}, competitions:[{competitors:[
      {homeAway:"home",score:"2",team:{displayName:"Brazil"}},
      {homeAway:"away",score:"1",team:{displayName:"Morocco"}}
    ]}]},
    { status:{type:{completed:false}}, competitions:[{competitors:[
      {homeAway:"home",score:"0",team:{displayName:"United States"}},
      {homeAway:"away",score:"0",team:{displayName:"Paraguay"}}
    ]}]}
  ]};
  assert.deepEqual(extractFinishedResults(schedule,payload),{j1:"home"});
});

test("concilia Costa do Marfim x Equador", () => {
  const schedule=[{id:"j1",home:"Costa do Marfim",away:"Equador"}];
  const payload={events:[{status:{type:{completed:true}},competitions:[{competitors:[
    {homeAway:"home",score:"1",team:{displayName:"Ivory Coast"}},
    {homeAway:"away",score:"0",team:{displayName:"Ecuador"}}
  ]}]}]};
  assert.deepEqual(extractFinishedResults(schedule,payload),{j1:"home"});
});

test("prioriza IDs estaveis mesmo com nomes em outro idioma", () => {
  assert.equal(teamMatches("Alemanha",{team:{id:"481",displayName:"Deutschland"}}),true);
  assert.equal(teamMatches("Brasil",{team:{id:"205",displayName:"Brasil"}}),true);
  assert.equal(teamMatches("Brasil",{team:{id:"481",displayName:"Brazil"}}),false);
});

test("aceita pequenas diferencas de grafia sem confundir selecoes", () => {
  assert.equal(stringSimilarity("bosnia herzegovina","bosnia hercegovina")>=0.88,true);
  assert.equal(teamMatches("Bosnia",{team:{displayName:"Bosnia and Herzegovina"}}),true);
  assert.equal(teamMatches("Austria",{team:{displayName:"Australia"}}),false);
});

test("reporta jogo finalizado nao conciliado", () => {
  const payload={events:[{name:"Unknown at Atlantis",status:{type:{completed:true}},competitions:[{competitors:[
    {homeAway:"home",score:"1",team:{id:"x",displayName:"Atlantis"}},
    {homeAway:"away",score:"0",team:{id:"y",displayName:"Unknown"}}
  ]}]}]};
  const result=reconcileFinishedResults([{id:"j1",home:"Brasil",away:"Marrocos"}],payload);
  assert.deepEqual(result.results,{});
  assert.equal(result.unmatched.length,1);
  assert.equal(result.unmatched[0].reason,"not_found");
});

test("resultado manual grava somente arquivo de resultados", () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"bolao-manual-")),resultsFile=path.join(dir,"results.json"),betsFile=path.join(dir,"bets.json");
  fs.writeFileSync(resultsFile,"{}\n");fs.writeFileSync(betsFile,'{"usuario":{"matches":{"j1":{"pick":"away"}}}}\n');
  const betsBefore=fs.readFileSync(betsFile,"utf8");
  assert.deepEqual(setManualResult("j1","home",resultsFile,{j1:"2026-06-14T20:00:00Z"}),{gameId:"j1",result:"home",total:1});
  assert.deepEqual(JSON.parse(fs.readFileSync(resultsFile,"utf8")),{j1:"home"});
  assert.equal(fs.readFileSync(betsFile,"utf8"),betsBefore);
});

test("busca e salva resultado de um jogo especifico", async () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"bolao-game-result-")),resultsFile=path.join(dir,"results.json");
  fs.writeFileSync(resultsFile,"{}\n");
  const schedule=[{id:"j1",home:"Brasil",away:"Marrocos"}],fetchImpl=async()=>({ok:true,json:async()=>({events:[{status:{type:{completed:true}},competitions:[{competitors:[
    {homeAway:"home",score:"2",team:{id:"205",displayName:"Brazil"}},
    {homeAway:"away",score:"0",team:{id:"2869",displayName:"Morocco"}}
  ]}]}]})});
  assert.deepEqual(await updateGameResult("j1",fetchImpl,resultsFile,schedule),{gameId:"j1",result:"home",total:1});
});

test("libera especiais somente depois do prazo", () => {
  assert.equal(specialTransparency(new Date("2026-06-16T02:59:59.999Z")).status,403);
  assert.equal(specialTransparency(new Date("2026-06-16T03:00:00.000Z")).status,200);
  assert.ok(Array.isArray(adminSpecialBets().rows));
});

test("recalculo por jogo exige resultado definido", () => {
  assert.throws(()=>recalculateGame("jogo-inexistente"),/Jogo nao encontrado/);
});

test("atualizacao manual grava resultados sem alterar apostas", async () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"bolao-results-"));
  const resultsFile=path.join(dir,"results.json"),betsFile=path.join(dir,"bets.json");
  fs.writeFileSync(resultsFile,'{"anterior":"draw"}\n');
  fs.writeFileSync(betsFile,'{"pessoa@exemplo.com":{"matches":{"j1":{"pick":"away"}}}}\n');
  const betsBefore=fs.readFileSync(betsFile,"utf8");
  const schedule=[{id:"j1",home:"Brasil",away:"Marrocos"}];
  const fetchImpl=async()=>({ok:true,json:async()=>({events:[{
    status:{type:{completed:true}},competitions:[{competitors:[
      {homeAway:"home",score:"1",team:{displayName:"Brazil"}},
      {homeAway:"away",score:"1",team:{displayName:"Morocco"}}
    ]}]
  }]})});
  const result=await updateResults(fetchImpl,resultsFile,schedule);
  assert.deepEqual(result,{fetched:1,changed:1,total:2,unmatched:[]});
  assert.deepEqual(JSON.parse(fs.readFileSync(resultsFile,"utf8")),{anterior:"draw",j1:"draw"});
  assert.equal(fs.readFileSync(betsFile,"utf8"),betsBefore);
});

test("gera e resolve token individual", () => {
  const token=createToken(),db={"pessoa@exemplo.com":{accessToken:token}};
  assert.equal(validToken(token),true);
  assert.equal(findByToken(db,token).email,"pessoa@exemplo.com");
});

test("perfil de fallback nao expoe e-mail", async () => {
  const { getBitrixProfile } = require("../server");
  const profile = await getBitrixProfile("invalido");
  assert.deepEqual(profile, { name:"Participante", photo:null, found:false });
});
