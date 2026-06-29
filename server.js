const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const PORT = process.env.PORT || 8077;
const APP_BASE_URL = process.env.APP_BASE_URL || "http://10.10.0.25:8077";
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "bets.json");
const RESULTS_FILE = path.join(DATA_DIR, "results.json");
const SPECIAL_RESULTS_FILE = path.join(DATA_DIR, "special-results.json");
const PLAYOFF_RESULTS_FILE = path.join(DATA_DIR, "playoff-results.json");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");
const BITRIX_CONFIG_FILE = path.join(DATA_DIR, "bitrix-config.json");
const RESULTS_API_URL = process.env.RESULTS_API_URL || "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=20260612-20260627&limit=100";
const PLAYOFFS_API_URL = process.env.PLAYOFFS_API_URL || "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=20260628-20260719&limit=100";
const SPECIAL_DEADLINE = new Date("2026-06-20T02:59:59.999Z");
const profileCache = new Map();
let bitrixSyncPromise = null;
const GAME_KICKOFFS = buildGameKickoffs();

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, "{}\n");
if (!fs.existsSync(RESULTS_FILE)) fs.writeFileSync(RESULTS_FILE, "{}\n");
if (!fs.existsSync(SPECIAL_RESULTS_FILE)) fs.writeFileSync(SPECIAL_RESULTS_FILE, "{}\n");
if (!fs.existsSync(PLAYOFF_RESULTS_FILE)) fs.writeFileSync(PLAYOFF_RESULTS_FILE, "{}\n");

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return {}; }
}
function writeDb(db) {
  const temp = `${DB_FILE}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(db, null, 2)}\n`);
  fs.renameSync(temp, DB_FILE);
}
function writeResults(results, file = RESULTS_FILE) {
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(results, null, 2)}\n`);
  fs.renameSync(temp, file);
}
function specialBetsEnabled(now = new Date(), settingsFile = SETTINGS_FILE) {
  const settings = readJson(settingsFile);
  return typeof settings.specialBetsEnabled === "boolean" ? settings.specialBetsEnabled : now <= SPECIAL_DEADLINE;
}
function setSpecialBetsEnabled(enabled, settingsFile = SETTINGS_FILE) {
  if (typeof enabled !== "boolean") throw new Error("Informe se as apostas especiais devem ser habilitadas.");
  const settings = { ...readJson(settingsFile), specialBetsEnabled:enabled };
  writeResults(settings, settingsFile);
  return { specialBetsEnabled:enabled };
}
function setManualResult(gameId, result, resultsFile = RESULTS_FILE, kickoffs = GAME_KICKOFFS) {
  if (!kickoffs[gameId]) throw new Error("Jogo nao encontrado.");
  if (!["home", "draw", "away"].includes(result)) throw new Error("Resultado invalido.");
  const results = readJson(resultsFile);
  results[gameId] = result;
  writeResults(results, resultsFile);
  return { gameId, result, total:Object.keys(results).length };
}
function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store", "Referrer-Policy":"no-referrer" });
  res.end(type.startsWith("application/json") && !Buffer.isBuffer(body) ? JSON.stringify(body) : body);
}
function receiveJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => { body += chunk; if (body.length > 1_000_000) req.destroy(); });
    req.on("end", () => { try { resolve(JSON.parse(body || "{}")); } catch (error) { reject(error); } });
  });
}
function validEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function validToken(token) {
  return typeof token === "string" && /^[a-f0-9]{48}$/.test(token);
}
function createToken() {
  return crypto.randomBytes(24).toString("hex");
}
function participantPublicId(record) {
  return crypto.createHash("sha256").update(record?.accessToken || "").digest("hex").slice(0, 24);
}
function buildGameKickoffs() {
  const schedule = readJson(path.join(PUBLIC_DIR, "schedule.json"));
  return Object.fromEntries(schedule.map(game => [game.id, game.kickoff]));
}
function findByToken(db, token) {
  if (!validToken(token)) return null;
  const entry = Object.entries(db).find(([, record]) => record.accessToken === token);
  return entry ? { email:entry[0], record:entry[1] } : null;
}
function ensureAccessTokens(db) {
  const used = new Set(Object.values(db).map(record => record.accessToken).filter(Boolean));
  let changed = false;
  for (const record of Object.values(db)) {
    if (!validToken(record.accessToken)) {
      let token;
      do { token = createToken(); } while (used.has(token));
      record.accessToken = token;
      used.add(token);
      changed = true;
    }
  }
  return changed;
}
function cleanMatchBets(matches, now) {
  const result = {};
  if (!matches || typeof matches !== "object") return result;
  for (const [id, bet] of Object.entries(matches)) {
    if (!["home", "draw", "away"].includes(bet?.pick)) continue;
    const kickoff = new Date(GAME_KICKOFFS[id]);
    if (Number.isNaN(kickoff.valueOf()) || kickoff <= now) continue;
    result[id] = { pick: bet.pick, kickoff: kickoff.toISOString() };
  }
  return result;
}
function playoffGames() {
  return readJson(path.join(PUBLIC_DIR, "playoffs.json"));
}
function playoffStageByKickoff(kickoff) {
  const time = new Date(kickoff).valueOf();
  if (time >= new Date("2026-07-19T00:00:00-03:00").valueOf()) return "Final";
  if (time >= new Date("2026-07-18T00:00:00-03:00").valueOf()) return "Terceiro lugar";
  if (time >= new Date("2026-07-14T00:00:00-03:00").valueOf()) return "Semifinal";
  if (time >= new Date("2026-07-09T00:00:00-03:00").valueOf()) return "Quartas de final";
  if (time >= new Date("2026-07-04T00:00:00-03:00").valueOf()) return "Oitavas de final";
  return "16 avos de final";
}
function playoffTeamDefined(name) {
  const value = String(name || "").toLowerCase();
  return Boolean(value) && !/(mandante|visitante|vencedor|perdedor|a definir|tbd|to be determined|\b[123][a-l]\b)/i.test(value);
}
function playoffGameDefined(game) {
  return playoffTeamDefined(game?.home) && playoffTeamDefined(game?.away);
}
function localTeamNameFromCompetitor(competitor) {
  const id = String(competitor?.team?.id || "");
  const sourceName = competitorName(competitor);
  const schedule = readJson(path.join(PUBLIC_DIR, "schedule.json"));
  const byId = schedule.flatMap(game => [game.home, game.away]).find(name => TEAM_SOURCE_IDS[normalizeTeamName(name)] === id);
  if (byId) return byId;
  const normalized = normalizeTeamName(sourceName);
  return schedule.flatMap(game => [game.home, game.away]).find(name => normalizeTeamName(name) === normalized) || sourceName || "A definir";
}
async function fetchPlayoffGames(fetchImpl = fetch, fallback = playoffGames()) {
  try {
    const response = await fetchImpl(PLAYOFFS_API_URL, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error("Fonte indisponivel.");
    const events = (await response.json()).events || [];
    const games = events.flatMap((event, index) => {
      const competition = event.competitions?.[0];
      const home = competition?.competitors?.find(item => item.homeAway === "home");
      const away = competition?.competitors?.find(item => item.homeAway === "away");
      const kickoff = event.date || competition?.date;
      if (!home || !away || !kickoff) return [];
      return [{
        id:`P-${event.id || index + 1}`,
        sourceId:String(event.id || ""),
        stage:playoffStageByKickoff(kickoff),
        home:localTeamNameFromCompetitor(home),
        away:localTeamNameFromCompetitor(away),
        kickoff,
        defined:playoffGameDefined({ home:localTeamNameFromCompetitor(home), away:localTeamNameFromCompetitor(away) }),
        source:"espn"
      }];
    }).sort((a,b)=>new Date(a.kickoff)-new Date(b.kickoff));
    const rows = games.length ? games : fallback.map(game => ({ ...game, defined:playoffGameDefined(game) }));
    return { source:games.length ? "espn" : "fallback", rows };
  } catch {
    return { source:"fallback", rows:fallback.map(game => ({ ...game, defined:playoffGameDefined(game) })) };
  }
}
function buildPlayoffKickoffs(games = playoffGames()) {
  return Object.fromEntries(games.filter(playoffGameDefined).map(game => [game.id, game.kickoff]));
}
function cleanPlayoffBets(playoffs, now, kickoffs = buildPlayoffKickoffs()) {
  const result = {};
  if (!playoffs || typeof playoffs !== "object") return result;
  for (const [id, bet] of Object.entries(playoffs)) {
    if (bet?.homeScore === "" || bet?.awayScore === "") continue;
    const homeScore = Number(bet?.homeScore), awayScore = Number(bet?.awayScore);
    if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore) || homeScore < 0 || awayScore < 0) continue;
    const advancing = inferPlayoffAdvancing(homeScore, awayScore, bet?.advancing);
    if (!advancing) continue;
    const kickoff = new Date(kickoffs[id]);
    if (Number.isNaN(kickoff.valueOf()) || kickoff <= now) continue;
    result[id] = { homeScore, awayScore, advancing, kickoff: kickoff.toISOString() };
  }
  return result;
}
function inferPlayoffAdvancing(homeScore, awayScore, advancing) {
  if (homeScore > awayScore) return "home";
  if (awayScore > homeScore) return "away";
  return ["home", "away"].includes(advancing) ? advancing : null;
}
function cleanExtraPoints(value) {
  const points = Number(value);
  if (!Number.isInteger(points) || points < 0 || points > 999) throw new Error("Informe pontos extras entre 0 e 999.");
  return points;
}
function setExtraPoints(token, points) {
  const db = readJson(DB_FILE);
  const participant = findByToken(db, token || "");
  if (!participant) throw new Error("Participante nao encontrado.");
  participant.record.extraPoints = cleanExtraPoints(points);
  participant.record.extraPointsUpdatedAt = new Date().toISOString();
  writeDb(db);
  return { token, extraPoints: participant.record.extraPoints };
}
function setManualPlayoffResult(gameId, input, resultsFile = PLAYOFF_RESULTS_FILE, games = playoffGames()) {
  if (!games.some(game => game.id === gameId)) throw new Error("Jogo de playoff nao encontrado.");
  const homeScore = Number(input?.homeScore), awayScore = Number(input?.awayScore);
  if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore) || homeScore < 0 || awayScore < 0) throw new Error("Informe placares validos.");
  const advancing = inferPlayoffAdvancing(homeScore, awayScore, input?.advancing);
  if (!advancing) throw new Error("Informe o time que avancou.");
  const results = readJson(resultsFile);
  results[gameId] = { homeScore, awayScore, advancing };
  writeResults(results, resultsFile);
  return { gameId, result: results[gameId], total:Object.keys(results).length };
}
function playoffResultFromEvent(event) {
  const competition = event.competitions?.[0];
  if (!competition?.status?.type?.completed && !event.status?.type?.completed) return null;
  const home = competition?.competitors?.find(item => item.homeAway === "home");
  const away = competition?.competitors?.find(item => item.homeAway === "away");
  const homeScore = Number(home?.score), awayScore = Number(away?.score);
  if (!home || !away || !Number.isInteger(homeScore) || !Number.isInteger(awayScore) || homeScore < 0 || awayScore < 0) return null;
  const advancing = inferPlayoffAdvancing(homeScore, awayScore, home.winner ? "home" : away.winner ? "away" : null);
  if (!advancing) return null;
  return { homeScore, awayScore, advancing, home, away };
}
function reconcileFinishedPlayoffResults(games, payload) {
  const results = {}, unmatched = [];
  for (const event of payload?.events || []) {
    const eventResult = playoffResultFromEvent(event);
    if (!eventResult) continue;
    const sourceId = String(event.id || "");
    const matches = games.filter(game =>
      (sourceId && (game.sourceId === sourceId || game.id === `P-${sourceId}`)) ||
      (teamMatches(game.home, eventResult.home) && teamMatches(game.away, eventResult.away))
    );
    const game = matches.length === 1 ? matches[0] : null;
    if (game) results[game.id] = {
      homeScore:eventResult.homeScore,
      awayScore:eventResult.awayScore,
      advancing:eventResult.advancing
    };
    else unmatched.push({
      event:event.name || `${competitorName(eventResult.home)} x ${competitorName(eventResult.away)}`,
      home:competitorName(eventResult.home),
      away:competitorName(eventResult.away),
      homeId:String(eventResult.home.team?.id || ""),
      awayId:String(eventResult.away.team?.id || ""),
      reason:matches.length > 1 ? "ambiguous" : "not_found"
    });
  }
  return { results, unmatched };
}
function calculatePlayoffs(record, playoffResults = {}) {
  const details = Object.entries(playoffResults).flatMap(([gameId, result]) => {
    const bet = record?.playoffs?.[gameId];
    if (!bet || !Number.isInteger(result?.homeScore) || !Number.isInteger(result?.awayScore) || !["home","away"].includes(result?.advancing)) return [];
    const exactScore = bet.homeScore === result.homeScore && bet.awayScore === result.awayScore;
    const advancingCorrect = bet.advancing === result.advancing;
    const betWinner = bet.homeScore === bet.awayScore ? "draw" : bet.homeScore > bet.awayScore ? "home" : "away";
    const resultWinner = result.homeScore === result.awayScore ? "draw" : result.homeScore > result.awayScore ? "home" : "away";
    const outcomeCorrect = !exactScore && betWinner === resultWinner;
    const oneScoreCorrect = !exactScore && (bet.homeScore === result.homeScore || bet.awayScore === result.awayScore);
    return [{
      gameId,
      pick:bet,
      result,
      exactScore,
      advancingCorrect,
      oneScoreCorrect,
      outcomeCorrect,
      points:(exactScore ? 4 : 0) + (advancingCorrect ? 2 : 0) + (oneScoreCorrect ? 1 : 0) + (outcomeCorrect ? 1 : 0)
    }];
  });
  return {
    correct:details.filter(item => item.exactScore || item.advancingCorrect || item.oneScoreCorrect || item.outcomeCorrect).length,
    points:details.reduce((total,item)=>total+item.points,0),
    details
  };
}
function gameTransparency(gameId, now = new Date()) {
  const kickoff = new Date(GAME_KICKOFFS[gameId]);
  if (Number.isNaN(kickoff.valueOf())) return { status:404, body:{ error:"Jogo não encontrado." } };
  if (kickoff > now) return { status:403, body:{ error:"Os palpites serão liberados quando o jogo começar.", kickoff:kickoff.toISOString() } };
  const result = readJson(RESULTS_FILE)[gameId] || null;
  const picks = Object.values(readJson(DB_FILE)).flatMap(record => {
    const pick = record.matches?.[gameId]?.pick;
    if (!["home","draw","away"].includes(pick)) return [];
    return [{ name:record.profile?.name||"Participante", photo:record.profile?.photo||null, pick, correct:Boolean(result && pick === result) }];
  }).sort((a,b)=>a.name.localeCompare(b.name,"pt-BR"));
  const totals={home:0,draw:0,away:0};
  picks.forEach(item=>{totals[item.pick]+=1});
  const nonBettors = Object.values(readJson(DB_FILE)).filter(record =>
    record.inviteSentAt &&
    Object.keys(record.matches || {}).length > 0 &&
    !["home","draw","away"].includes(record.matches?.[gameId]?.pick)
  ).map(record => ({
    name:record.profile?.name||"Participante",
    photo:record.profile?.photo||null
  })).sort((a,b)=>a.name.localeCompare(b.name,"pt-BR"));
  return { status:200, body:{ gameId, kickoff:kickoff.toISOString(), result, total:picks.length, totals, picks, nonBettors } };
}
function specialTransparency(now = new Date()) {
  if (now <= SPECIAL_DEADLINE) return { status:403, body:{ error:"Os palpites especiais serao liberados apos o encerramento do prazo.", deadline:SPECIAL_DEADLINE.toISOString() } };
  const rows = adminSpecialBets().rows;
  return { status:200, body:{ total:rows.length, rows } };
}
function adminSpecialBets() {
  const rows = Object.values(readJson(DB_FILE)).filter(record => record.special).map(record => ({
    name:record.profile?.name||"Participante",
    photo:record.profile?.photo||null,
    special:record.special
  })).sort((a,b)=>a.name.localeCompare(b.name,"pt-BR"));
  return { total:rows.length, rows };
}
function setSpecialResults(input, resultsFile = SPECIAL_RESULTS_FILE) {
  const current = readJson(resultsFile);
  const allowedStages = ["Fase de grupos","16 avos de final","Oitavas de final","Quartas de final","Semifinal","Terceiro lugar","Vice-campeao","Campeao"];
  const next = {};
  for (const field of ["champion","runnerUp","third"]) {
    if (typeof input?.[field] === "string" && input[field]) next[field] = input[field];
    else if (current[field]) next[field] = current[field];
  }
  if (typeof input?.brazilStage === "string" && allowedStages.includes(input.brazilStage)) next.brazilStage = input.brazilStage;
  else if (current.brazilStage) next.brazilStage = current.brazilStage;
  const podium = [next.champion,next.runnerUp,next.third].filter(Boolean);
  if (podium.length !== new Set(podium).size) throw new Error("Campeao, vice e terceiro devem ser diferentes.");
  fs.writeFileSync(resultsFile, `${JSON.stringify(next, null, 2)}\n`);
  return next;
}
function calculateSpecial(record, specialResults = {}) {
  const rules = { champion:10, runnerUp:8, third:5, brazilStage:5 };
  const details = Object.entries(rules).map(([field, points]) => ({
    field,
    pick:record?.special?.[field]||null,
    result:specialResults[field]||null,
    correct:Boolean(record?.special?.[field] && specialResults[field] && record.special[field] === specialResults[field]),
    points
  }));
  return {
    correct:details.filter(item => item.correct).length,
    points:details.filter(item => item.correct).reduce((total,item)=>total+item.points,0),
    details
  };
}
function allBetsTransparency() {
  const bets = readJson(DB_FILE);
  const results = readJson(RESULTS_FILE);
  const rows = Object.entries(bets).flatMap(([email,record]) => Object.entries(record.matches||{}).flatMap(([gameId,bet]) => {
    if (!["home","draw","away"].includes(bet?.pick) || !GAME_KICKOFFS[gameId]) return [];
    const result = results[gameId] || null;
    return [{
      participant:record.profile?.name||"Participante",
      photo:record.profile?.photo||null,
      email,
      gameId,
      pick:bet.pick,
      result,
      correct:Boolean(result && bet.pick === result),
      kickoff:GAME_KICKOFFS[gameId],
      started:new Date(GAME_KICKOFFS[gameId])<=new Date()
    }];
  }));
  rows.sort((a,b)=>new Date(a.kickoff)-new Date(b.kickoff)||a.participant.localeCompare(b.participant,"pt-BR"));
  return {
    rows,
    participants:Object.keys(bets).length,
    participantsWithBets:new Set(rows.map(row=>row.email)).size,
    totalBets:rows.length
  };
}
function adminGames() {
  const schedule = readJson(path.join(PUBLIC_DIR, "schedule.json"));
  const bets = readJson(DB_FILE);
  const results = readJson(RESULTS_FILE);
  return {
    rows:schedule.map(game => {
      const result = results[game.id] || null;
      const picks = Object.values(bets).flatMap(record => {
        const pick = record.matches?.[game.id]?.pick;
        return ["home","draw","away"].includes(pick) ? [pick] : [];
      });
      return {
        ...game,
        result,
        totalBets:picks.length,
        correctBets:result ? picks.filter(pick => pick === result).length : 0,
        started:new Date(game.kickoff) <= new Date()
      };
    })
  };
}
async function adminPlayoffs() {
  const games = (await fetchPlayoffGames()).rows;
  const bets = readJson(DB_FILE);
  const results = readJson(PLAYOFF_RESULTS_FILE);
  const playoffBets = [];
  return {
    rows:games.map(game => {
      const result = results[game.id] || null;
      const picks = Object.entries(bets).flatMap(([email, record]) => {
        const bet = record.playoffs?.[game.id];
        if (!Number.isInteger(bet?.homeScore) || !Number.isInteger(bet?.awayScore) || !["home","away"].includes(bet?.advancing)) return [];
        const score = result ? calculatePlayoffs({ playoffs:{ [game.id]:bet } }, { [game.id]:result }).details[0] : null;
        const row = {
          participant:record.profile?.name||"Participante",
          photo:record.profile?.photo||null,
          email,
          gameId:game.id,
          stage:game.stage,
          home:game.home,
          away:game.away,
          kickoff:game.kickoff,
          bet,
          result,
          points:score?.points||0,
          exactScore:Boolean(score?.exactScore),
          advancingCorrect:Boolean(score?.advancingCorrect),
          oneScoreCorrect:Boolean(score?.oneScoreCorrect),
          outcomeCorrect:Boolean(score?.outcomeCorrect),
          started:new Date(game.kickoff) <= new Date()
        };
        playoffBets.push(row);
        return [bet];
      });
      const scored = picks.map(bet => calculatePlayoffs({ playoffs:{ [game.id]:bet } }, result ? { [game.id]:result } : {})).map(score => score.points);
      return {
        ...game,
        result,
        totalBets:picks.length,
        pointsAwarded:scored.reduce((total,points)=>total+points,0),
        started:new Date(game.kickoff) <= new Date()
      };
    }),
    bets:playoffBets.sort((a,b)=>new Date(a.kickoff)-new Date(b.kickoff)||a.participant.localeCompare(b.participant,"pt-BR")),
    totalBets:playoffBets.length
  };
}
function recalculateGame(gameId) {
  const game = readJson(path.join(PUBLIC_DIR, "schedule.json")).find(item => item.id === gameId);
  if (!game) throw new Error("Jogo nao encontrado.");
  const result = readJson(RESULTS_FILE)[gameId] || null;
  if (!result) throw new Error("Defina ou busque o resultado antes de recalcular.");
  const participants = Object.values(readJson(DB_FILE)).flatMap(record => {
    const pick = record.matches?.[gameId]?.pick;
    return ["home","draw","away"].includes(pick) ? [{ pick, correct:pick === result }] : [];
  });
  return {
    gameId,
    result,
    totalBets:participants.length,
    correctBets:participants.filter(item => item.correct).length
  };
}
function calculateParticipant(record, results, specialResults = {}) {
  const validResults = Object.fromEntries(Object.entries(results).filter(([, pick]) => ["home", "draw", "away"].includes(pick)));
  const games = Object.entries(validResults).map(([gameId, result]) => {
    const pick = record?.matches?.[gameId]?.pick || null;
    return { gameId, pick, result, correct:pick === result };
  });
  const correct = games.filter(game => game.correct).length;
  const special = calculateSpecial(record, specialResults);
  const playoffs = calculatePlayoffs(record, readJson(PLAYOFF_RESULTS_FILE));
  const extraPoints = Number.isInteger(record?.extraPoints) ? record.extraPoints : 0;
  return { correct:correct + special.correct + playoffs.correct, matchCorrect:correct, specialCorrect:special.correct, playoffCorrect:playoffs.correct, points:correct * 3 + special.points + playoffs.points + extraPoints, matchPoints:correct * 3, specialPoints:special.points, playoffPoints:playoffs.points, extraPoints, finishedGames:games.length, games, special:special.details, playoffs:playoffs.details };
}
function calculateRanking(bets, results, specialResults = {}) {
  const validResults = Object.fromEntries(Object.entries(results).filter(([, pick]) => ["home", "draw", "away"].includes(pick)));
  const ranking = Object.entries(bets).map(([email, record]) => {
    const score = calculateParticipant(record, validResults, specialResults);
    return { email, participantId:participantPublicId(record), correct:score.correct, matchCorrect:score.matchCorrect, specialCorrect:score.specialCorrect, playoffCorrect:score.playoffCorrect, matchPoints:score.matchPoints, specialPoints:score.specialPoints, playoffPoints:score.playoffPoints, extraPoints:score.extraPoints, points:score.points, profile: record.profile || null };
  }).sort((a, b) => b.points - a.points || b.correct - a.correct || a.email.localeCompare(b.email));
  let previous = null;
  ranking.forEach((row, index) => {
    row.position = previous && previous.points === row.points && previous.correct === row.correct ? previous.position : index + 1;
    previous = row;
  });
  return { finishedGames: Object.keys(validResults).length, ranking };
}
const TEAM_ALIASES = {
  "estados unidos":"united states", "suica":"switzerland", "brasil":"brazil",
  "marrocos":"morocco", "escocia":"scotland", "turquia":"turkiye",
  "alemanha":"germany", "curacao":"curacao", "costa do marfim":"ivory coast", "equador":"ecuador",
  "holanda":"netherlands", "japao":"japan", "suecia":"sweden", "tunisia":"tunisia",
  "belgica":"belgium", "egito":"egypt", "ira":"iran", "nova zelandia":"new zealand",
  "espanha":"spain", "cabo verde":"cape verde islands", "arabia saudita":"saudi arabia",
  "uruguai":"uruguay", "franca":"france", "senegal":"senegal", "iraque":"iraq",
  "noruega":"norway", "argentina":"argentina", "argelia":"algeria", "austria":"austria",
  "jordania":"jordan", "portugal":"portugal", "congo rd":"congo dr",
  "uzbequistao":"uzbekistan", "colombia":"colombia", "inglaterra":"england",
  "croacia":"croatia", "gana":"ghana", "panama":"panama", "mexico":"mexico",
  "africa do sul":"south africa", "coreia do sul":"south korea", "tchequia":"czechia",
  "canada":"canada", "bosnia":"bosnia and herzegovina", "catar":"qatar",
  "paraguai":"paraguay", "australia":"australia", "haiti":"haiti"
};
const TEAM_SOURCE_IDS = {
  "canada":"206","bosnia and herzegovina":"452","united states":"660","paraguay":"210","qatar":"4398",
  "switzerland":"475","brazil":"205","morocco":"2869","haiti":"2654","scotland":"580","australia":"628",
  "turkiye":"465","germany":"481","curacao":"11678","netherlands":"449","japan":"627","ivory coast":"4789",
  "ecuador":"209","sweden":"466","tunisia":"659","spain":"164","cape verde islands":"2597","belgium":"459",
  "egypt":"2620","saudi arabia":"655","uruguay":"212","iran":"469","new zealand":"2666","france":"478",
  "senegal":"654","iraq":"4375","norway":"464","argentina":"202","algeria":"624","austria":"474","jordan":"2917",
  "portugal":"482","congo dr":"2850","england":"448","croatia":"477","ghana":"4469","panama":"2659",
  "uzbekistan":"2570","colombia":"208","czechia":"450","south africa":"467","mexico":"203","south korea":"451"
};
function normalizeTeamName(value) {
  const normalized = String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").trim();
  return TEAM_ALIASES[normalized] || normalized;
}
function competitorName(competitor) {
  return competitor?.team?.displayName || competitor?.team?.shortDisplayName || competitor?.team?.name || "";
}
function stringSimilarity(left, right) {
  if (left === right) return 1;
  if (!left || !right) return 0;
  const previous = Array.from({ length:right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const above = previous[j], cost = left[i - 1] === right[j - 1] ? 0 : 1;
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + cost);
      diagonal = above;
    }
  }
  return 1 - previous[right.length] / Math.max(left.length, right.length);
}
function teamMatches(scheduleName, competitor) {
  const expected = normalizeTeamName(scheduleName), actual = normalizeTeamName(competitorName(competitor));
  const expectedId = TEAM_SOURCE_IDS[expected], actualId = String(competitor?.team?.id || "");
  if (expectedId && actualId) return expectedId === actualId;
  return expected === actual || stringSimilarity(expected, actual) >= 0.88;
}
function reconcileFinishedResults(schedule, payload) {
  const results = {}, unmatched = [];
  const scheduledTeamIds = new Set(schedule.flatMap(game => [TEAM_SOURCE_IDS[normalizeTeamName(game.home)], TEAM_SOURCE_IDS[normalizeTeamName(game.away)]]).filter(Boolean));
  for (const event of payload?.events || []) {
    const competition = event.competitions?.[0];
    if (!competition?.status?.type?.completed && !event.status?.type?.completed) continue;
    const home = competition.competitors?.find(item => item.homeAway === "home");
    const away = competition.competitors?.find(item => item.homeAway === "away");
    const homeScore = Number(home?.score), awayScore = Number(away?.score);
    if (!home || !away || !Number.isFinite(homeScore) || !Number.isFinite(awayScore)) continue;
    const matches = schedule.filter(item => teamMatches(item.home, home) && teamMatches(item.away, away));
    const game = matches.length === 1 ? matches[0] : null;
    if (game) results[game.id] = homeScore === awayScore ? "draw" : homeScore > awayScore ? "home" : "away";
    else {
      const homeId=String(home.team?.id || ""),awayId=String(away.team?.id || "");
      const knownOutOfScope = homeId && awayId && scheduledTeamIds.has(homeId) && scheduledTeamIds.has(awayId);
      if (!knownOutOfScope) unmatched.push({
        event:event.name || `${competitorName(home)} x ${competitorName(away)}`,
        home:competitorName(home),
        away:competitorName(away),
        homeId,
        awayId,
        reason:matches.length > 1 ? "ambiguous" : "not_found"
      });
    }
  }
  return { results, unmatched };
}
function extractFinishedResults(schedule, payload) {
  return reconcileFinishedResults(schedule, payload).results;
}
async function updateResults(fetchImpl = fetch, resultsFile = RESULTS_FILE, schedule = readJson(path.join(PUBLIC_DIR, "schedule.json"))) {
  const response = await fetchImpl(RESULTS_API_URL, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Fonte de resultados indisponivel (${response.status}).`);
  const reconciliation = reconcileFinishedResults(schedule, await response.json()), fetched = reconciliation.results;
  const current = readJson(resultsFile);
  const merged = { ...current, ...fetched };
  const changed = Object.keys(fetched).filter(id => current[id] !== fetched[id]).length;
  writeResults(merged, resultsFile);
  return { fetched: Object.keys(fetched).length, changed, total: Object.keys(merged).length, unmatched:reconciliation.unmatched };
}
async function updateGameResult(gameId, fetchImpl = fetch, resultsFile = RESULTS_FILE, schedule = readJson(path.join(PUBLIC_DIR, "schedule.json"))) {
  if (!schedule.some(game => game.id === gameId)) throw new Error("Jogo nao encontrado.");
  const response = await fetchImpl(RESULTS_API_URL, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Fonte de resultados indisponivel (${response.status}).`);
  const reconciliation = reconcileFinishedResults(schedule, await response.json());
  const result = reconciliation.results[gameId];
  if (!result) throw new Error("A fonte ainda nao retornou um resultado final para este jogo.");
  const kickoffs = Object.fromEntries(
    schedule.map((game) => [game.id, game.kickoff || "scheduled"])
  );

  return setManualResult(gameId, result, resultsFile, kickoffs);
}
async function updatePlayoffResult(gameId, fetchImpl = fetch, resultsFile = PLAYOFF_RESULTS_FILE, games = null) {
  const playoffRows = games || (await fetchPlayoffGames(fetchImpl)).rows;
  if (!playoffRows.some(game => game.id === gameId)) throw new Error("Jogo de playoff nao encontrado.");
  const response = await fetchImpl(PLAYOFFS_API_URL, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Fonte de resultados indisponivel (${response.status}).`);
  const reconciliation = reconcileFinishedPlayoffResults(playoffRows, await response.json());
  const result = reconciliation.results[gameId];
  if (!result) throw new Error("A fonte ainda nao retornou placar final e classificado para este playoff.");
  return setManualPlayoffResult(gameId, result, resultsFile, playoffRows);
}
function bitrixWebhookUrl() {
  return process.env.BITRIX_WEBHOOK_URL || readJson(BITRIX_CONFIG_FILE).webhookUrl || "";
}
async function sendBitrixInvite(record, baseUrl = APP_BASE_URL) {
  if (!record?.profile?.bitrixId || !validToken(record.accessToken)) throw new Error("Participante sem usuário Bitrix.");
  let origin;
  try { origin = new URL(APP_BASE_URL || baseUrl).origin; } catch { throw new Error("Endereço do bolão inválido."); }
  const webhook = bitrixWebhookUrl();
  if (!webhook) throw new Error("Configure BITRIX_WEBHOOK_URL ou data/bitrix-config.json no servidor.");
  const name = record.profile.name || "Participante";
  const link = `${origin}/?token=${record.accessToken}`;
  const message = `Olá, ${name}! O Bolão DCASH Copa 2026 começou. Acesse seu link individual para registrar seus palpites:\n\n${link}\n\nEste link é pessoal e não deve ser compartilhado.`;
  const endpoint = new URL(`${webhook.replace(/\/$/, "")}/im.message.add.json`);
  const response = await fetch(endpoint, { method:"POST", body:new URLSearchParams({ DIALOG_ID:String(record.profile.bitrixId), MESSAGE:message }), signal:AbortSignal.timeout(10000) });
  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data.error_description || "Não foi possível enviar a mensagem.");
  return { sent:true, name, messageId:data.result };
}
function fallbackProfile(email) {
  return { name: "Participante", photo: null, found: false };
}
async function getBitrixProfile(email) {
  if (!validEmail(email)) return fallbackProfile(email || "");
  const cached = profileCache.get(email);
  if (cached && cached.expiresAt > Date.now()) return cached.profile;
  const storedProfile = readJson(DB_FILE)[email]?.profile;
  if (storedProfile?.name) {
    profileCache.set(email, { profile:storedProfile, expiresAt:Date.now() + 15 * 60 * 1000 });
    return storedProfile;
  }
  const webhook = bitrixWebhookUrl();
  if (!webhook) return fallbackProfile(email);
  try {
    const endpoint = new URL(`${webhook.replace(/\/$/, "")}/user.get.json`);
    endpoint.searchParams.set("FILTER[EMAIL]", email);
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error("Bitrix indisponivel");
    let user = (await response.json()).result?.[0];
    if (!user) {
      const localPart = email.split("@")[0].toLowerCase();
      let start = 0;
      for (let page = 0; page < 5 && !user; page += 1) {
        const listEndpoint = new URL(`${webhook.replace(/\/$/, "")}/user.get.json`);
        listEndpoint.searchParams.set("start", String(start));
        const listResponse = await fetch(listEndpoint, { signal: AbortSignal.timeout(5000) });
        if (!listResponse.ok) break;
        const listData = await listResponse.json();
        user = listData.result?.find(item => item.ACTIVE && item.EMAIL?.split("@")[0].toLowerCase() === localPart);
        if (!listData.next) break;
        start = listData.next;
      }
    }
    const profile = user ? {
      name: [user.NAME, user.LAST_NAME].filter(Boolean).join(" ") || email.split("@")[0],
      photo: user.PERSONAL_PHOTO || null,
      found: true
    } : fallbackProfile(email);
    profileCache.set(email, { profile, expiresAt: Date.now() + (profile.found ? 15 * 60 * 1000 : 60 * 1000) });
    return profile;
  } catch {
    return fallbackProfile(email);
  }
}
function profileFromBitrixUser(user) {
  return {
    bitrixId: String(user.ID),
    name: [user.NAME, user.LAST_NAME].filter(Boolean).join(" ") || "Participante",
    photo: user.PERSONAL_PHOTO || null,
    phone: user.PERSONAL_MOBILE || user.WORK_PHONE || null,
    found: true
  };
}
async function listBitrixUsers() {
  const webhook = bitrixWebhookUrl();
  if (!webhook) throw new Error("Configure BITRIX_WEBHOOK_URL ou data/bitrix-config.json no servidor.");
  const users = [];
  let start = 0;
  for (let page = 0; page < 100; page += 1) {
    const endpoint = new URL(`${webhook.replace(/\/$/, "")}/user.get.json`);
    endpoint.searchParams.set("start", String(start));
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error("Bitrix indisponivel.");
    const data = await response.json();
    users.push(...(data.result || []).filter(user => user.ACTIVE && user.USER_TYPE === "employee" && validEmail(user.EMAIL)));
    if (data.next === undefined) break;
    start = data.next;
  }
  return users;
}
async function syncBitrixUsers() {
  if (bitrixSyncPromise) return bitrixSyncPromise;
  bitrixSyncPromise = (async () => {
    const users = await listBitrixUsers();
    const db = readJson(DB_FILE);
    for (const user of users) {
      const email = user.EMAIL.trim().toLowerCase();
      const current = db[email] || {};
      const profile = profileFromBitrixUser(user);
      db[email] = {
        matches: current.matches && typeof current.matches === "object" ? current.matches : {},
        playoffs: current.playoffs && typeof current.playoffs === "object" ? current.playoffs : {},
        special: current.special || null,
        specialLocked: Boolean(current.specialLocked),
        extraPoints: Number.isInteger(current.extraPoints) ? current.extraPoints : 0,
        extraPointsUpdatedAt: current.extraPointsUpdatedAt || null,
        updatedAt: current.updatedAt || null,
        profile,
        accessToken: validToken(current.accessToken) ? current.accessToken : createToken()
      };
      profileCache.set(email, { profile, expiresAt: Date.now() + 15 * 60 * 1000 });
    }
    writeDb(db);
    return { synced:true, employees:users.length, total:Object.keys(db).length };
  })().finally(() => { bitrixSyncPromise = null; });
  return bitrixSyncPromise;
}
async function enrichRanking(rankingData) {
  const ranking = await Promise.all(rankingData.ranking.map(async row => ({ ...row, profile: row.profile || await getBitrixProfile(row.email) })));
  ranking.sort((a, b) => b.points - a.points || b.correct - a.correct || a.profile.name.localeCompare(b.profile.name, "pt-BR"));
  return { ...rankingData, ranking:ranking.map(({ email, ...row }) => row) };
}

async function betsApi(req, res, url) {
  const db = readJson(DB_FILE);
  const participant = findByToken(db, url.searchParams.get("token") || "");
  if (!participant) return send(res, 401, { error: "Token de acesso inválido." });
  const { email } = participant;
  if (req.method === "GET") {
    const record = participant.record;
    return send(res, 200, {
      matches: record.matches && typeof record.matches === "object" ? record.matches : {},
      playoffs: record.playoffs && typeof record.playoffs === "object" ? record.playoffs : {},
      participantId:participantPublicId(record),
      special: record.special || null,
      specialLocked: Boolean(record.specialLocked),
      updatedAt: record.updatedAt || null,
      specialDeadline: SPECIAL_DEADLINE.toISOString(),
      specialBetsEnabled: specialBetsEnabled()
    });
  }
  if (req.method !== "POST") return send(res, 405, { error: "Método não permitido." });

  let input;
  try { input = await receiveJson(req); } catch { return send(res, 400, { error: "Dados inválidos." }); }
  const now = new Date(), current = db[email];
  const matches = { ...(current.matches || {}), ...cleanMatchBets(input.matches, now) };
  const playoffRows = (await fetchPlayoffGames()).rows;
  const playoffs = { ...(current.playoffs || {}), ...cleanPlayoffBets(input.playoffs, now, buildPlayoffKickoffs(playoffRows)) };
  let special = current.special || null, specialLocked = Boolean(current.specialLocked);
  if (input.special) {
    if (!specialBetsEnabled(now)) return send(res, 409, { error: "As apostas especiais estao desabilitadas pelo administrador." });
    const { champion, runnerUp, third, brazilStage } = input.special;
    if (![champion, runnerUp, third, brazilStage].every(value => typeof value === "string" && value)) return send(res, 400, { error: "Preencha todos os palpites especiais." });
    if (new Set([champion, runnerUp, third]).size !== 3) return send(res, 400, { error: "Campeão, vice e terceiro devem ser diferentes." });
    special = { champion, runnerUp, third, brazilStage };
    specialLocked = false;
  }
  db[email] = { ...current, matches, playoffs, special, specialLocked, updatedAt:now.toISOString(), profile:current.profile || await getBitrixProfile(email) };
  writeDb(db);
  send(res, 200, { ...db[email], accessToken:undefined, specialDeadline:SPECIAL_DEADLINE.toISOString(), specialBetsEnabled:specialBetsEnabled(now) });
}

const MIME={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8",".json":"application/json; charset=utf-8"};
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,`http://${req.headers.host}`);
  if(url.pathname.toLowerCase()==="/admin"||url.pathname.toLowerCase()==="/admin/"){
    return send(res,200,fs.readFileSync(path.join(PUBLIC_DIR,"acessos.html")),"text/html; charset=utf-8");
  }
  if(url.pathname==="/acessos.html")return send(res,404,"Não encontrado","text/plain; charset=utf-8");
  if(url.pathname==="/api/bets")return betsApi(req,res,url);
  if(url.pathname==="/api/profile"){
    const token=url.searchParams.get("token")||"";
    const participant=findByToken(readJson(DB_FILE),token);
    if(!participant)return send(res,401,{error:"Token de acesso inválido."});
    return send(res,200,participant.record.profile||await getBitrixProfile(participant.email));
  }
  if(url.pathname==="/api/ranking"){
    return send(res,200,await enrichRanking(calculateRanking(readJson(DB_FILE),readJson(RESULTS_FILE),readJson(SPECIAL_RESULTS_FILE))));
  }
  if(url.pathname==="/api/update-results"&&req.method==="POST"){
    try{return send(res,200,await updateResults())}catch(error){return send(res,502,{error:error.message})}
  }
  if(url.pathname==="/api/update-game-result"&&req.method==="POST"){
    let input;try{input=await receiveJson(req)}catch{return send(res,400,{error:"Dados invalidos."})}
    try{return send(res,200,await updateGameResult(input.gameId))}catch(error){return send(res,502,{error:error.message})}
  }
  if(url.pathname==="/api/manual-result"&&req.method==="POST"){
    let input;try{input=await receiveJson(req)}catch{return send(res,400,{error:"Dados invalidos."})}
    try{return send(res,200,setManualResult(input.gameId,input.result))}catch(error){return send(res,400,{error:error.message})}
  }
  if(url.pathname==="/api/recalculate-game"&&req.method==="POST"){
    let input;try{input=await receiveJson(req)}catch{return send(res,400,{error:"Dados invalidos."})}
    try{return send(res,200,recalculateGame(input.gameId))}catch(error){return send(res,400,{error:error.message})}
  }
  if(url.pathname==="/api/game-transparency"){
    const result=gameTransparency(url.searchParams.get("id")||"");
    return send(res,result.status,result.body);
  }
  if(url.pathname==="/api/special-transparency"){
    const result=specialTransparency();
    return send(res,result.status,result.body);
  }
  if(url.pathname==="/api/sync-bitrix"&&req.method==="POST"){
    try{return send(res,200,await syncBitrixUsers())}catch(error){return send(res,502,{error:error.message})}
  }
  if(url.pathname==="/api/access-links"){
    const db=readJson(DB_FILE);
    const results=readJson(RESULTS_FILE);
    const links=Object.values(db).map(record=>({
      name:record.profile?.name||"Participante",
      photo:record.profile?.photo||null,
      canMessage:Boolean(record.profile?.bitrixId),
      token:record.accessToken,
      sent:Boolean(record.inviteSentAt),
      sentAt:record.inviteSentAt||null,
      ...calculateParticipant(record,results,readJson(SPECIAL_RESULTS_FILE))
    })).sort((a,b)=>a.name.localeCompare(b.name,"pt-BR"));
    return send(res,200,{links});
  }
  if(url.pathname==="/api/admin-transparency"){
    return send(res,200,allBetsTransparency());
  }
  if(url.pathname==="/api/admin-games"){
    return send(res,200,adminGames());
  }
  if(url.pathname==="/api/playoffs"){
    return send(res,200,await fetchPlayoffGames());
  }
  if(url.pathname==="/api/admin-playoffs"){
    return send(res,200,await adminPlayoffs());
  }
  if(url.pathname==="/api/update-playoff-result"&&req.method==="POST"){
    let input;try{input=await receiveJson(req)}catch{return send(res,400,{error:"Dados invalidos."})}
    try{return send(res,200,await updatePlayoffResult(input.gameId,fetch,PLAYOFF_RESULTS_FILE,(await fetchPlayoffGames()).rows))}catch(error){return send(res,502,{error:error.message})}
  }
  if(url.pathname==="/api/manual-playoff-result"&&req.method==="POST"){
    let input;try{input=await receiveJson(req)}catch{return send(res,400,{error:"Dados invalidos."})}
    try{return send(res,200,setManualPlayoffResult(input.gameId,input,PLAYOFF_RESULTS_FILE,(await fetchPlayoffGames()).rows))}catch(error){return send(res,400,{error:error.message})}
  }
  if(url.pathname==="/api/extra-points"&&req.method==="POST"){
    let input;try{input=await receiveJson(req)}catch{return send(res,400,{error:"Dados invalidos."})}
    try{return send(res,200,setExtraPoints(input.recipientToken,input.points))}catch(error){return send(res,400,{error:error.message})}
  }
  if(url.pathname==="/api/admin-special-bets"){
    return send(res,200,{...adminSpecialBets(),results:readJson(SPECIAL_RESULTS_FILE),specialBetsEnabled:specialBetsEnabled()});
  }
  if(url.pathname==="/api/admin-special-bets-status"&&req.method==="POST"){
    let input;try{input=await receiveJson(req)}catch{return send(res,400,{error:"Dados invalidos."})}
    try{return send(res,200,setSpecialBetsEnabled(input.enabled))}catch(error){return send(res,400,{error:error.message})}
  }
  if(url.pathname==="/api/admin-special-results"&&req.method==="POST"){
    let input;try{input=await receiveJson(req)}catch{return send(res,400,{error:"Dados invalidos."})}
    try{return send(res,200,setSpecialResults(input))}catch(error){return send(res,400,{error:error.message})}
  }
  if(url.pathname==="/api/send-bitrix-invite"&&req.method==="POST"){
    const db=readJson(DB_FILE);
    let input;try{input=await receiveJson(req)}catch{return send(res,400,{error:"Dados inválidos."})}
    const recipient=findByToken(db,input.recipientToken||"");
    if(!recipient)return send(res,404,{error:"Participante não encontrado."});
    try{
      const result=await sendBitrixInvite(recipient.record,input.baseUrl);
      recipient.record.inviteSentAt=new Date().toISOString();
      recipient.record.inviteMessageId=result.messageId;
      writeDb(db);
      return send(res,200,{...result,sentAt:recipient.record.inviteSentAt});
    }catch(error){return send(res,502,{error:error.message})}
  }
  if(url.pathname.startsWith("/api/"))return send(res,404,{error:"Rota da API nao encontrada. Reinicie o servidor."});
  const requested=url.pathname==="/"?"index.html":url.pathname.slice(1),file=path.resolve(PUBLIC_DIR,requested);
  if(!file.startsWith(PUBLIC_DIR)||!fs.existsSync(file)||fs.statSync(file).isDirectory())return send(res,404,"Não encontrado","text/plain; charset=utf-8");
  send(res,200,fs.readFileSync(file),MIME[path.extname(file)]||"application/octet-stream");
});
if(require.main===module)server.listen(PORT,()=>console.log(`Bolão disponível na porta ${PORT}`));
module.exports={cleanMatchBets,cleanPlayoffBets,fetchPlayoffGames,validEmail,validToken,createToken,participantPublicId,findByToken,ensureAccessTokens,SPECIAL_DEADLINE,APP_BASE_URL,RESULTS_API_URL,PLAYOFFS_API_URL,setManualResult,setManualPlayoffResult,setExtraPoints,setSpecialResults,specialBetsEnabled,setSpecialBetsEnabled,calculateSpecial,calculatePlayoffs,calculateParticipant,calculateRanking,normalizeTeamName,stringSimilarity,teamMatches,reconcileFinishedResults,reconcileFinishedPlayoffResults,extractFinishedResults,updateResults,updateGameResult,updatePlayoffResult,specialTransparency,adminSpecialBets,adminGames,adminPlayoffs,recalculateGame,getBitrixProfile,listBitrixUsers,syncBitrixUsers,sendBitrixInvite,server};
