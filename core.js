// Cercle core: the pure logic shared by the app (www/app.js), the MCP servers (mcp/) and the tests (test/).
// No DOM, no storage, no network. Every function takes the data it needs as arguments.

// ---------- vocabulary ----------
export const CIRCLES = { famille: "Famille", proches: "Amis proches", amis: "Amis", collegues: "Anciens collègues", autres: "Autres" };
export const FREQS = [[7, "Chaque semaine"], [14, "Toutes les 2 semaines"], [30, "Chaque mois"], [60, "Tous les 2 mois"], [90, "Chaque trimestre"], [180, "Tous les 6 mois"], [365, "Une fois par an"]];
export const TYPES = { appel: "Appel", message: "Message", vu: "Vu en vrai", visio: "Visio" };
export const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
export const STATE = {
  bloom: { label: "En pleine forme", cls: "s-bloom" }, ok: { label: "Ça va", cls: "s-ok" },
  thirsty: { label: "À arroser", cls: "s-thirsty" }, wilted: { label: "Ça s'éloigne", cls: "s-wilted" }
};
// synced sources, as shown to the user
export const SRC_LABEL = { gmail: "Gmail", agenda: "Agenda", whatsapp: "WhatsApp", phone: "appels/SMS" };
// suggested rhythm (days) when a person is added to a circle
export const DEFAULT_FREQ = { famille: 14, proches: 30, amis: 60, collegues: 180, autres: 90 };
// family and close friends get a small priority boost when several people are overdue
export const CIRCLE_WEIGHT = { famille: 1.15, proches: 1.1 };

// ---------- dates (local calendar days, "YYYY-MM-DD" strings in storage) ----------
export const today0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
export const parseD = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ""); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
export const iso = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
export const days = (a, b) => Math.round((a - b) / 864e5);
export const freqLabel = f => (FREQS.find(x => x[0] === +f) || [0, "tous les " + f + " j"])[1].toLowerCase();
export function ago(n) {
  if (n === 0) return "aujourd'hui"; if (n === 1) return "hier";
  if (n < 14) return "il y a " + n + " jours";
  if (n < 60) return "il y a " + Math.round(n / 7) + " semaines";
  if (n < 365) return "il y a " + Math.round(n / 30) + " mois";
  const y = Math.floor(n / 365); return "il y a plus de " + y + " an" + (y > 1 ? "s" : "");
}
export function inDays(n) { return n === 0 ? "aujourd'hui" : n === 1 ? "demain" : "dans " + n + " j"; }

// ---------- relationship model ----------
// Latest past exchange across manual notes and every synced source.
export function lastInfo(p) {
  const t = today0(); let best = null, src = null;
  const consider = (s, k) => { const d = parseD(s); if (d && d <= t && (!best || d > best)) { best = d; src = k; } };
  (p.log || []).forEach(l => consider(l.d, "log"));
  const sy = p.sync || {};
  Object.keys(SRC_LABEL).forEach(k => { if (sy[k] && sy[k].last) consider(sy[k].last, k); });
  if (!best && p.lastSeed) consider(p.lastSeed, "seed");
  return { d: best, src };
}
export function nextRdv(p) { const n = p.sync && p.sync.agenda && parseD(p.sync.agenda.next); return n && n >= today0() ? n : null; }
export function nextBirthday(p) {
  if (!p.bdMonth || !p.bdDay) return null;
  const t = today0();
  let d = new Date(t.getFullYear(), p.bdMonth - 1, p.bdDay);
  if (d < t) d = new Date(t.getFullYear() + 1, p.bdMonth - 1, p.bdDay);
  const age = p.bdYear ? d.getFullYear() - p.bdYear : null;
  return { date: d, in: days(d, t), age };
}
// ratio = days since last exchange / wanted rhythm. The plant blooms at <= 0.5, wilts past 1.5.
export function health(p) {
  const t = today0(); const freq = Math.max(1, +p.freq || 30);
  const li = lastInfo(p), last = li.d;
  const since = last ? days(t, last) : null;
  const ratio = since == null ? 1.3 : since / freq;
  const state = ratio <= 0.5 ? "bloom" : ratio <= 1 ? "ok" : ratio <= 1.5 ? "thirsty" : "wilted";
  const snoozed = !!(p.snoozeUntil && parseD(p.snoozeUntil) > t);
  return { last, src: li.src, since, ratio, state, freq, snoozed, bday: nextBirthday(p), rdv: nextRdv(p) };
}
// "This week" picks: overdue people (ratio >= 0.85) and birthdays within 7 days, at most 4.
export function pickWeek(all) {
  const t = today0();
  const scored = all.filter(x => !x.h.snoozed && !(x.h.rdv && days(x.h.rdv, t) <= 21)).map(x => {
    let score = x.h.ratio * (CIRCLE_WEIGHT[x.p.circle] || 1), reason = null;
    if (x.h.bday && x.h.bday.in <= 7) { score += 10 - x.h.bday.in; reason = "bday"; }
    return { ...x, score, reason };
  }).filter(x => x.reason || x.h.ratio >= 0.85);
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 4);
}
export const withHealth = people => people.map(p => ({ p, h: health(p) }));

// ---------- edits shared by the app and the MCP tools ----------
export function newPerson(fields) {
  const circle = CIRCLES[fields.circle] ? fields.circle : "amis";
  return {
    name: String(fields.name || "").trim(), circle, freq: +fields.freq || DEFAULT_FREQ[circle] || 60,
    phones: fields.phones || [], emails: (fields.emails || []).map(e => String(e).toLowerCase()),
    bdDay: fields.bdDay || null, bdMonth: fields.bdMonth || null, bdYear: fields.bdYear || null,
    notes: fields.notes || "", asks: fields.asks || [], log: [], createdAt: new Date().toISOString()
  };
}
// Records one exchange: adds it to the history, drops the questions that were covered, adds new ones.
export function applyLog(p, { d, t = "message", n = "", doneAsks = [], newAsks = [] }) {
  const c = JSON.parse(JSON.stringify(p));
  const done = new Set(doneAsks.map(x => typeof x === "number" ? (c.asks || [])[x] : x).map(normName));
  c.log = [{ d: d || iso(today0()), t: TYPES[t] ? t : "message", n: String(n || "").trim() }].concat(c.log || [])
    .sort((a, b) => (b.d || "").localeCompare(a.d || "")).slice(0, 80);
  c.asks = (c.asks || []).filter(a => !done.has(normName(a))).concat(newAsks.map(String).filter(Boolean));
  delete c.snoozeUntil;
  return c;
}
// Folds dates seen by one source (WhatsApp, calls, agenda…) into a person's sync block.
export function foldSync(prev, v, now = new Date()) {
  prev = prev || {};
  const t = new Date(now); t.setHours(0, 0, 0, 0);
  const set = new Set(prev.days || []);
  let last = prev.last ? parseD(prev.last) : null;
  (v.dates || []).forEach(d => {
    if (!(d instanceof Date) || isNaN(d) || d > now) return;
    const dd = new Date(d); dd.setHours(0, 0, 0, 0);
    if (days(t, dd) <= 180) set.add(iso(dd));
    if (!last || dd > last) last = dd;
  });
  const next = { last: last ? iso(last) : null, days: Array.from(set).sort().reverse().slice(0, 120), n: v.n || 0 };
  if ("next" in v) next.next = v.next; else if (prev.next) next.next = prev.next;
  return next;
}

// ---------- matching ----------
export const normName = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
export const normPhone = s => { const d = String(s || "").replace(/\D/g, ""); return d.length >= 9 ? d.slice(-9) : ""; };
export function splitList(s) { return String(s || "").split(/[,;\n]+/).map(x => x.trim()).filter(Boolean); }
export const uniq = a => Array.from(new Set(a));
// Exact name, else a unique first name of 3+ letters ("Karim" finds "Karim Benali").
export function findByName(people, name) {
  const n = normName(name); if (!n) return null;
  const exact = people.find(p => normName(p.name) === n); if (exact) return exact;
  const first = n.split(" ")[0];
  if (first.length < 3) return null;
  const c = people.filter(p => normName(p.name).split(" ")[0] === first);
  return c.length === 1 ? c[0] : null;
}
export function phoneIndex(people) { const m = new Map(); people.forEach(p => (p.phones || []).forEach(x => { const k = normPhone(x); if (k) m.set(k, p); })); return m; }
export function emailIndex(people) { const m = new Map(); people.forEach(p => (p.emails || []).forEach(x => m.set(String(x).toLowerCase().trim(), p))); return m; }

// ---------- contacts files (.vcf / Google CSV) ----------
export function decodeQP(v) {
  const bin = v.replace(/=([0-9A-F]{2})/gi, (_, x) => String.fromCharCode(parseInt(x, 16)));
  try { return decodeURIComponent(escape(bin)); } catch (e) { return bin; }
}
const unV = s => s.replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\n/gi, " ").trim();
export function parseBday(v) {
  v = String(v || "").trim().replace(/T.*$/, "");
  let m = /^(\d{4}|--)-?(\d{2})-?(\d{2})$/.exec(v);
  if (m) { const y = m[1] === "--" ? null : +m[1]; return { y: y && y > 1700 ? y : null, m: +m[2], d: +m[3] }; }
  m = /^(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})$/.exec(v);
  if (m) return { y: +m[3] > 1700 ? +m[3] : null, m: +m[2], d: +m[1] };
  return null;
}
export function parseVCF(text) {
  text = text.replace(/=\r?\n/g, "").replace(/\r?\n[ \t]/g, "");
  return text.split(/BEGIN:VCARD/i).slice(1).map(card => {
    const o = { name: "", phones: [], emails: [], bday: null }; let n = null;
    card.split(/\r?\n/).forEach(line => {
      const i = line.indexOf(":"); if (i < 0) return;
      const params = line.slice(0, i).toUpperCase(); let val = line.slice(i + 1).trim();
      const prop = params.split(";")[0].replace(/^ITEM\d+\./, "");
      if (/ENCODING=QUOTED-PRINTABLE/.test(params)) val = decodeQP(val);
      if (prop === "FN") o.name = unV(val);
      else if (prop === "N") n = val.split(";").map(unV);
      else if (prop === "TEL" && val) o.phones.push(val);
      else if (prop === "EMAIL" && val) o.emails.push(val.toLowerCase());
      else if (prop === "BDAY") o.bday = parseBday(val);
    });
    if (!o.name && n) o.name = [n[1], n[0]].filter(Boolean).join(" ");
    return o;
  }).filter(o => o.name);
}
export function parseCSVRows(text) {
  text = text.replace(/^﻿/, "");
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim()));
}
export function parseGoogleCSV(text) {
  const rows = parseCSVRows(text); if (rows.length < 2) return [];
  const H = rows[0].map(normName);
  const idx = f => H.findIndex(f);
  const iName = idx(h => h === "name" || h === "nom"), iFirst = idx(h => h === "first name" || h === "given name" || h === "prenom"),
    iLast = idx(h => h === "last name" || h === "family name" || h === "nom de famille"), iBd = idx(h => h === "birthday" || h === "anniversaire");
  const iPh = H.map((h, i) => /phone|telephone/.test(h) && /value|valeur/.test(h) ? i : -1).filter(i => i >= 0);
  const iEm = H.map((h, i) => /e mail|email/.test(h) && /value|valeur/.test(h) ? i : -1).filter(i => i >= 0);
  return rows.slice(1).map(r => {
    const name = (iName >= 0 && r[iName]) || [r[iFirst], r[iLast]].filter(Boolean).join(" ");
    const multi = i => (r[i] || "").split(":::").map(s => s.trim()).filter(Boolean);
    return { name: (name || "").trim(), phones: iPh.flatMap(multi), emails: iEm.flatMap(multi).map(e => e.toLowerCase()), bday: iBd >= 0 ? parseBday(r[iBd]) : null };
  }).filter(o => o.name);
}

// ---------- WhatsApp chat exports (Android and iPhone formats, any date order) ----------
const WA_RE = /^‎?\[?(\d{1,4})[\/.\-](\d{1,2})[\/.\-](\d{1,4}),?\s+(\d{1,2})[:.h](\d{2})(?:[:.]\d{2})?\s*(?:[AaPp]\.?\s?[Mm]\.?)?\]?\s*(?:[-–]\s*)?([^:\n]{1,60}?):\s/;
export function parseWA(text, filename, people = []) {
  const lines = text.split(/\r?\n/), raw = [];
  lines.forEach(l => { const m = WA_RE.exec(l); if (m) raw.push(m); });
  if (!raw.length) return null;
  let order = "dmy";
  if (raw.some(m => m[1].length === 4)) order = "ymd";
  else if (raw.some(m => +m[1] > 12)) order = "dmy";
  else if (raw.some(m => +m[2] > 12)) order = "mdy";
  const senders = new Map(), dates = [];
  raw.forEach(m => {
    let y, mo, d;
    if (order === "ymd") { y = +m[1]; mo = +m[2]; d = +m[3]; }
    else if (order === "mdy") { mo = +m[1]; d = +m[2]; y = +m[3]; }
    else { d = +m[1]; mo = +m[2]; y = +m[3]; }
    if (y < 100) y += 2000;
    const dt = new Date(y, mo - 1, d, +m[4], +m[5]);
    if (isNaN(dt)) return;
    const who = m[6].replace(/‎/g, "").trim();
    senders.set(who, (senders.get(who) || 0) + 1);
    dates.push(dt);
  });
  const fn = String(filename || "").replace(/\.(txt|zip)$/i, "");
  const fm = /(?:WhatsApp Chat (?:with|-)|Discussion WhatsApp avec|Chat WhatsApp con|WhatsApp-Chat mit)\s*(.+)$/i.exec(fn);
  const chatName = fm ? fm[1].trim() : "";
  const names = Array.from(senders.keys());
  const group = names.length > 2;
  let match = chatName ? findByName(people, chatName) : null;
  if (!match && !group) for (const nm of names) { const p = findByName(people, nm); if (p) { match = p; break; } }
  const label = chatName || (group ? names.slice(0, 3).join(", ") + "…" : names.find(n => !match || normName(n) !== normName(match.name)) || names[0] || "Discussion");
  return { label, chatName, group, dates, count: dates.length, last: dates.reduce((a, b) => b > a ? b : a, dates[0]), match };
}

// ---------- calendar events ----------
export function eventDate(ev) { const s = ev.start && (ev.start.dateTime || ev.start.date); if (!s) return null; const d = /T/.test(s) ? new Date(s) : parseD(s); return d && !isNaN(d) ? d : null; }
export function eventPeople(ev, ei, nameRes) {
  const hits = new Set();
  const att = Array.isArray(ev.attendees) ? ev.attendees : [];
  if (att.length && att.length <= 8) att.forEach(a => { const p = a && a.email && ei.get(String(a.email).toLowerCase()); if (p) hits.add(p); });
  const title = " " + normName(ev.summary) + " ";
  if (!/anniversaire|birthday/.test(title)) nameRes.forEach(([p, keys]) => { if (keys.some(k => title.includes(" " + k + " "))) hits.add(p); });
  return Array.from(hits);
}
// Name keys used to spot someone in an event title: full name, plus a first name only if nobody else shares it.
export function nameKeys(people) {
  const firsts = new Map(); people.forEach(p => { const f = normName(p.name).split(" ")[0]; firsts.set(f, (firsts.get(f) || 0) + 1); });
  return people.map(p => { const n = normName(p.name), f = n.split(" ")[0]; const keys = [n]; if (f !== n && f.length >= 3 && firsts.get(f) === 1) keys.push(f); return [p, keys.filter(k => k.length >= 3)]; });
}

// ---------- context for AI (app assistant and MCP tools) ----------
// A compact, readable picture of one person. Phones and e-mails are left out on purpose.
export function personBrief(p, { history = 5 } = {}) {
  const h = health(p);
  const log = (p.log || []).slice().sort((a, b) => (b.d || "").localeCompare(a.d || "")).slice(0, history);
  return {
    id: p.id, name: p.name, circle: CIRCLES[p.circle] || p.circle, rhythm: freqLabel(h.freq),
    status: STATE[h.state].label, lastContact: h.last ? iso(h.last) : null, daysSince: h.since,
    lastSource: h.src && SRC_LABEL[h.src] ? SRC_LABEL[h.src] : h.src === "log" ? "noté à la main" : null,
    nextBirthday: h.bday ? { date: iso(h.bday.date), inDays: h.bday.in, age: h.bday.age } : null,
    nextAppointment: h.rdv ? iso(h.rdv) : null,
    notes: p.notes || "", toAsk: p.asks || [],
    recent: log.map(l => ({ date: l.d, how: TYPES[l.t] || l.t, about: l.n || "" }))
  };
}
export function circleDigest(people) {
  const all = withHealth(people.filter(p => !p.demo));
  const week = pickWeek(all);
  return {
    today: iso(today0()), total: all.length,
    thisWeek: week.map(x => ({ name: x.p.name, reason: x.reason === "bday" ? "anniversaire " + inDays(x.h.bday.in) : x.h.since == null ? "aucun échange noté" : "dernier contact " + ago(x.h.since) })),
    birthdays: all.filter(x => x.h.bday && x.h.bday.in <= 30).sort((a, b) => a.h.bday.in - b.h.bday.in)
      .map(x => ({ name: x.p.name, date: iso(x.h.bday.date), inDays: x.h.bday.in, age: x.h.bday.age })),
    people: all.sort((a, b) => b.h.ratio - a.h.ratio).map(x => ({
      name: x.p.name, circle: CIRCLES[x.p.circle] || x.p.circle, status: STATE[x.h.state].label,
      daysSince: x.h.since, rhythmDays: x.h.freq, toAsk: (x.p.asks || []).length ? x.p.asks : undefined
    }))
  };
}
