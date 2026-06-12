const test = require("node:test");
const assert = require("node:assert/strict");
const { cleanMatchBets, validEmail, validToken, createToken, findByToken, SPECIAL_DEADLINE, calculateRanking } = require("../server");

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
    old:{pick:"home",kickoff:"2026-06-12T19:00:00Z"},
    future:{pick:"draw",kickoff:"2026-06-13T01:00:00Z"},
    invalid:{pick:"score",kickoff:"2026-06-13T01:00:00Z"}
  }, new Date("2026-06-12T20:00:00Z"));
  assert.deepEqual(Object.keys(result), ["future"]);
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
