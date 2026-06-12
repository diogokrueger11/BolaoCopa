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
const BITRIX_CONFIG_FILE = path.join(DATA_DIR, "bitrix-config.json");
const SPECIAL_DEADLINE = new Date("2026-06-16T02:59:59.999Z");
const profileCache = new Map();
let bitrixSyncPromise = null;
const GAME_KICKOFFS = buildGameKickoffs();

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, "{}\n");
if (!fs.existsSync(RESULTS_FILE)) fs.writeFileSync(RESULTS_FILE, "{}\n");

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return {}; }
}
function writeDb(db) {
  const temp = `${DB_FILE}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(db, null, 2)}\n`);
  fs.renameSync(temp, DB_FILE);
}
function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store", "Referrer-Policy":"no-referrer" });
  res.end(type.startsWith("application/json") ? JSON.stringify(body) : body);
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
function buildGameKickoffs() {
  const groups={B:["Canada","Bosnia","Catar","Suica"],C:["Brasil","Marrocos","Haiti","Escocia"],D:["Estados Unidos","Paraguai","Australia","Turquia"],E:["Alemanha","Curacao","Costa do Marfim","Equador"],F:["Holanda","Japao","Suecia","Tunisia"],G:["Belgica","Egito","Ira","Nova Zelandia"],H:["Espanha","Cabo Verde","Arabia Saudita","Uruguai"],I:["Franca","Senegal","Iraque","Noruega"],J:["Argentina","Argelia","Austria","Jordania"],K:["Portugal","Congo RD","Uzbequistao","Colombia"],L:["Inglaterra","Croacia","Gana","Panama"]};
  const dates=[
    {B:"2026-06-13",C:"2026-06-13",D:"2026-06-13",E:"2026-06-14",F:"2026-06-14",G:"2026-06-15",H:"2026-06-15",I:"2026-06-16",J:"2026-06-16",K:"2026-06-17",L:"2026-06-17"},
    {B:"2026-06-18",C:"2026-06-19",D:"2026-06-19",E:"2026-06-20",F:"2026-06-20",G:"2026-06-21",H:"2026-06-21",I:"2026-06-22",J:"2026-06-22",K:"2026-06-23",L:"2026-06-23"},
    {B:"2026-06-24",C:"2026-06-24",D:"2026-06-25",E:"2026-06-25",F:"2026-06-25",G:"2026-06-26",H:"2026-06-26",I:"2026-06-26",J:"2026-06-27",K:"2026-06-27",L:"2026-06-27"}
  ];
  const games={"D-USA-PAR":"2026-06-13T01:00:00.000Z"};
  Object.entries(groups).forEach(([group,teams])=>[[[2,3],[0,1]],[[0,2],[3,1]],[[3,0],[1,2]]].forEach((pairs,round)=>pairs.forEach((pair,index)=>{
    const home=teams[pair[0]],away=teams[pair[1]],excluded=(group==="B"&&home==="Canada"&&away==="Bosnia")||(group==="D"&&home==="Estados Unidos"&&away==="Paraguai");
    if(!excluded)games[`${group}-${home}-${away}`.replaceAll(" ","-")]=`${dates[round][group]}T${index?"22":"16"}:00:00.000Z`;
  })));
  return games;
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
function gameTransparency(gameId, now = new Date()) {
  const kickoff = new Date(GAME_KICKOFFS[gameId]);
  if (Number.isNaN(kickoff.valueOf())) return { status:404, body:{ error:"Jogo não encontrado." } };
  if (kickoff > now) return { status:403, body:{ error:"Os palpites serão liberados quando o jogo começar.", kickoff:kickoff.toISOString() } };
  const picks = Object.values(readJson(DB_FILE)).flatMap(record => {
    const pick = record.matches?.[gameId]?.pick;
    if (!["home","draw","away"].includes(pick)) return [];
    return [{ name:record.profile?.name||"Participante", photo:record.profile?.photo||null, pick }];
  }).sort((a,b)=>a.name.localeCompare(b.name,"pt-BR"));
  const totals={home:0,draw:0,away:0};
  picks.forEach(item=>{totals[item.pick]+=1});
  return { status:200, body:{ gameId, kickoff:kickoff.toISOString(), total:picks.length, totals, picks } };
}
function allBetsTransparency() {
  const bets = readJson(DB_FILE);
  const rows = Object.entries(bets).flatMap(([email,record]) => Object.entries(record.matches||{}).flatMap(([gameId,bet]) => {
    if (!["home","draw","away"].includes(bet?.pick) || !GAME_KICKOFFS[gameId]) return [];
    return [{
      participant:record.profile?.name||"Participante",
      photo:record.profile?.photo||null,
      email,
      gameId,
      pick:bet.pick,
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
function calculateRanking(bets, results) {
  const validResults = Object.fromEntries(Object.entries(results).filter(([, pick]) => ["home", "draw", "away"].includes(pick)));
  const ranking = Object.entries(bets).map(([email, record]) => {
    const correct = Object.entries(validResults).filter(([id, result]) => record.matches?.[id]?.pick === result).length;
    return { email, correct, points: correct * 3, profile: record.profile || null };
  }).sort((a, b) => b.points - a.points || b.correct - a.correct || a.email.localeCompare(b.email));
  let previous = null;
  ranking.forEach((row, index) => {
    row.position = previous && previous.points === row.points && previous.correct === row.correct ? previous.position : index + 1;
    previous = row;
  });
  return { finishedGames: Object.keys(validResults).length, ranking };
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
        special: current.special || null,
        specialLocked: Boolean(current.specialLocked),
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
      special: record.special || null,
      specialLocked: Boolean(record.specialLocked),
      updatedAt: record.updatedAt || null,
      specialDeadline: SPECIAL_DEADLINE.toISOString()
    });
  }
  if (req.method !== "POST") return send(res, 405, { error: "Método não permitido." });

  let input;
  try { input = await receiveJson(req); } catch { return send(res, 400, { error: "Dados inválidos." }); }
  const now = new Date(), current = db[email];
  const matches = { ...(current.matches || {}), ...cleanMatchBets(input.matches, now) };
  let special = current.special || null, specialLocked = Boolean(current.specialLocked);
  if (input.special && !specialLocked) {
    if (now > SPECIAL_DEADLINE) return send(res, 409, { error: "O prazo dos palpites especiais terminou." });
    const { champion, runnerUp, third, brazilStage } = input.special;
    if (![champion, runnerUp, third, brazilStage].every(value => typeof value === "string" && value)) return send(res, 400, { error: "Preencha todos os palpites especiais." });
    if (new Set([champion, runnerUp, third]).size !== 3) return send(res, 400, { error: "Campeão, vice e terceiro devem ser diferentes." });
    special = { champion, runnerUp, third, brazilStage };
    specialLocked = true;
  }
  db[email] = { ...current, matches, special, specialLocked, updatedAt:now.toISOString(), profile:current.profile || await getBitrixProfile(email) };
  writeDb(db);
  send(res, 200, { ...db[email], accessToken:undefined, specialDeadline:SPECIAL_DEADLINE.toISOString() });
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
    return send(res,200,await enrichRanking(calculateRanking(readJson(DB_FILE),readJson(RESULTS_FILE))));
  }
  if(url.pathname==="/api/game-transparency"){
    const result=gameTransparency(url.searchParams.get("id")||"");
    return send(res,result.status,result.body);
  }
  if(url.pathname==="/api/sync-bitrix"&&req.method==="POST"){
    try{return send(res,200,await syncBitrixUsers())}catch(error){return send(res,502,{error:error.message})}
  }
  if(url.pathname==="/api/access-links"){
    const db=readJson(DB_FILE);
    const links=Object.values(db).map(record=>({
      name:record.profile?.name||"Participante",
      photo:record.profile?.photo||null,
      canMessage:Boolean(record.profile?.bitrixId),
      token:record.accessToken,
      sent:Boolean(record.inviteSentAt),
      sentAt:record.inviteSentAt||null
    })).sort((a,b)=>a.name.localeCompare(b.name,"pt-BR"));
    return send(res,200,{links});
  }
  if(url.pathname==="/api/admin-transparency"){
    return send(res,200,allBetsTransparency());
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
module.exports={cleanMatchBets,validEmail,validToken,createToken,findByToken,ensureAccessTokens,SPECIAL_DEADLINE,APP_BASE_URL,calculateRanking,getBitrixProfile,listBitrixUsers,syncBitrixUsers,sendBitrixInvite,server};
