// Cercle : garder le lien avec ses proches. Runs as a PWA and inside the Android app (Capacitor).
// UI, storage, sync and device integrations live here; the pure relationship logic is in core.js.
import * as Core from "./core.js";
import { Assistant, CLAUDE_MODELS, LOCAL_PRESETS } from "./ai.js";

(function () {
  "use strict";
  const {
    CIRCLES, FREQS, TYPES, MONTHS, STATE, SRC_LABEL, DEFAULT_FREQ,
    today0, parseD, iso, days, freqLabel, ago, inDays, health, pickWeek, applyLog, foldSync,
    normName, normPhone, splitList, uniq, parseBday, parseVCF, parseGoogleCSV, eventDate, eventPeople, nameKeys
  } = Core;
  // people-aware helpers bound to this device's list
  const findByName = name => Core.findByName(people, name);
  const phoneIndex = () => Core.phoneIndex(people);
  const emailIndex = () => Core.emailIndex(people);
  const parseWA = (text, filename) => Core.parseWA(text, filename, people);
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }

  // ---------- dates ----------
  const fmtShort = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
  // ---------- plant ----------
  function plant(state, size) {
    size = size || 64;
    const cls = state === "thirsty" ? "dry" : state === "wilted" ? "dead" : state;
    const pot = `<path class="pot" d="M17 55 h26 l-3 13 h-20 z"/><rect class="rim" x="15" y="52" width="30" height="5" rx="1.5"/>`;
    let body = "";
    if (state === "bloom") body = `<g class="sway"><path class="stem" d="M30 52 C30 40 30 28 30 16"/>
      <ellipse class="lf" cx="22" cy="40" rx="8" ry="3.6" transform="rotate(-28 22 40)"/><ellipse class="lf2" cx="38" cy="33" rx="8" ry="3.6" transform="rotate(28 38 33)"/>
      <ellipse class="lf2" cx="23" cy="27" rx="6.5" ry="3" transform="rotate(-32 23 27)"/>
      <circle class="pet" cx="30" cy="8.5" r="4"/><circle class="pet" cx="36" cy="13" r="4"/><circle class="pet" cx="24" cy="13" r="4"/><circle class="pet" cx="33.5" cy="19" r="4"/><circle class="pet" cx="26.5" cy="19" r="4"/><circle class="ctr" cx="30" cy="14" r="3.4"/></g>`;
    else if (state === "ok") body = `<path class="stem" d="M30 52 C30 42 30 32 30 20"/>
      <ellipse class="lf" cx="22" cy="41" rx="8" ry="3.6" transform="rotate(-25 22 41)"/><ellipse class="lf2" cx="38" cy="35" rx="8" ry="3.6" transform="rotate(25 38 35)"/>
      <ellipse class="lf2" cx="24" cy="28" rx="6" ry="3" transform="rotate(-35 24 28)"/><ellipse class="lf" cx="30" cy="18" rx="3" ry="5"/>`;
    else if (state === "thirsty") body = `<path class="stem" d="M30 52 C30 42 31 34 36 26"/>
      <ellipse class="lf" cx="23" cy="45" rx="7.5" ry="3.2" transform="rotate(28 23 45)"/><ellipse class="lf2" cx="36" cy="40" rx="7" ry="3" transform="rotate(-30 36 40)"/>
      <ellipse class="lf" cx="38" cy="27" rx="3" ry="4.5" transform="rotate(35 38 27)"/>`;
    else body = `<path class="stem" d="M30 52 C30 45 34 38 41 40"/>
      <ellipse class="lf" cx="24" cy="48" rx="7" ry="2.8" transform="rotate(40 24 48)"/><ellipse class="lf2" cx="42" cy="43" rx="3" ry="4" transform="rotate(20 42 43)"/>`;
    return `<svg class="plant ${cls}" width="${size}" height="${Math.round(size * 70 / 60)}" viewBox="0 0 60 70" aria-hidden="true">${body}${pot}</svg>`;
  }

  // ---------- store (this device) ----------
  let people = [], mode = "loading";
  const LS = "cercle-people";
  const newId = () => "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  let rq = 0;
  function scheduleRender() { if (rq) return; rq = requestAnimationFrame(() => { rq = 0; render(); }); }
  function persist() { if (ls(LS, JSON.stringify(people)) === null && !lsOk()) toast("Mémoire de l'appareil pleine : pense à « Sauvegarder »."); }
  function lsOk() { try { localStorage.setItem("cercle-probe", "1"); return true; } catch (e) { return false; } }
  async function save(p) {
    const full = JSON.parse(JSON.stringify(p)); if (!full.id) full.id = newId();
    // strictly newer than the previous version, so two quick edits never tie on the server
    full.updatedAt = new Date(Math.max(Date.now(), Date.parse(full.updatedAt || 0) + 1)).toISOString();
    const i = people.findIndex(x => x.id === full.id);
    if (i >= 0) people[i] = full; else people.push(full);
    persist(); Sync.dirty(full); scheduleRender();
    return full.id;
  }
  async function remove(id) {
    people = people.filter(x => x.id !== id);
    persist(); Sync.tomb(id); scheduleRender();
  }
  function failed(e) { toast("Pas pu enregistrer" + (e && e.message ? " : " + e.message : "") + "."); }

  // Examples shown on a fresh install, dated relative to today so they always look plausible.
  function seedDemo() {
    const t = today0(), ago = n => iso(new Date(t.getFullYear(), t.getMonth(), t.getDate() - n));
    const soon = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 6);
    const old = "2000-01-01T00:00:00.000Z";
    people = [
      { id: "demo-maman", name: "Maman", circle: "famille", freq: 7, bdDay: 3, bdMonth: 3, bdYear: 1958, notes: "Aime qu'on l'appelle le dimanche matin.", asks: ["Réponse pour Noël : on vient le 24 ?"], log: [{ d: ago(9), t: "appel", n: "Elle prépare déjà Noël et veut savoir si on vient le 24." }] },
      { id: "demo-mamie", name: "Mamie", circle: "famille", freq: 14, bdDay: 12, bdMonth: 12, bdYear: 1937, notes: "Ne lit pas les SMS : appeler sur le fixe.", asks: ["Comment s'est passée la séance de kiné ?"], log: [{ d: ago(5), t: "vu", n: "Mal au genou, rendez-vous chez le kiné jeudi." }] },
      { id: "demo-karim", name: "Karim", circle: "proches", freq: 30, bdDay: 14, bdMonth: 2, notes: "Fan de trail. Ses enfants : Inès et Sami.", asks: ["Comment s'est passé le déménagement à Lyon ?"], log: [{ d: ago(42), t: "appel", n: "Déménagement à Lyon prévu bientôt, un peu stressé." }] },
      { id: "demo-julien", name: "Julien", circle: "proches", freq: 30, bdDay: 7, bdMonth: 7, bdYear: 1987, notes: "", asks: ["Date exacte du mariage ?"], log: [{ d: ago(3), t: "visio", n: "Il prépare son mariage pour le printemps." }] },
      { id: "demo-lea", name: "Léa", circle: "amis", freq: 60, bdDay: soon.getDate(), bdMonth: soon.getMonth() + 1, bdYear: soon.getFullYear() - 36, notes: "", asks: [], log: [{ d: ago(45), t: "message", n: "Elle a commencé l'escalade en salle, ça lui plaît beaucoup." }] },
      { id: "demo-sofia", name: "Sofia", circle: "amis", freq: 60, lastSeed: ago(132), notes: "Rencontrée au semi-marathon de Paris. A eu un bébé cet été.", asks: ["Prénom du bébé ?"], log: [] },
      { id: "demo-thomas", name: "Thomas", circle: "collegues", freq: 180, lastSeed: ago(232), notes: "Ancien collègue du projet de migration. Parti chez un éditeur SaaS.", asks: [], log: [] }
    ].map(p => Object.assign({ demo: true, updatedAt: old, createdAt: old }, p));
    persist();
  }
  function loadLocal() {
    const raw = ls(LS);
    if (raw === null) { if (!ls("cercle-sync")) seedDemo(); return; }
    try { people = JSON.parse(raw) || []; } catch (e) { people = []; }
  }
  async function boot() {
    loadLocal(); mode = "local";
    const h0 = location.hash.slice(1);
    showTab(TABS.includes(h0) ? h0 : (ls("cercle-tab") || "today"), true);
    render(); paintAI();
    renderSources(); Sync.start(); nativeStart(); installStart(); joinFromLink();
  }

  // ---------- render ----------
  let filter = ls("cercle-filter") || "all";
  function render() {
    const all = people.map(p => ({ p, h: health(p) }));
    renderCards(all); renderSide(all); renderGarden(all);
    const demo = people.filter(p => p.demo).length;
    $("#demoBanner").hidden = !demo; $("#demoCount").textContent = demo;
    renderSummary(all);
  }
  // One line under the title that answers "what should I do today?"
  const fmtDay = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  function renderSummary(all) {
    $("#todayLabel").textContent = fmtDay.format(new Date());
    if (mode === "loading") return;
    if (!all.length) { $("#summary").textContent = "Ajoute les personnes qui comptent pour toi : Cercle te dira quand reprendre contact."; return; }
    const week = pickWeek(all), parts = [];
    parts.push(week.length ? week.length + " personne" + (week.length > 1 ? "s" : "") + " à recontacter cette semaine" : "Tout le monde va bien cette semaine");
    const bd = all.filter(x => x.h.bday && x.h.bday.in <= 7).sort((a, b) => a.h.bday.in - b.h.bday.in)[0];
    if (bd) parts.push("anniversaire de " + bd.p.name + " " + inDays(bd.h.bday.in));
    $("#summary").textContent = parts.join(" · ") + ".";
  }

  // ---------- tabs (Aujourd'hui, Jardin, Réglages) ----------
  const TABS = ["today", "jardin", "reglages"];
  let tab = "today";
  function showTab(t, keepScroll) {
    tab = TABS.includes(t) ? t : "today"; ls("cercle-tab", tab);
    document.documentElement.dataset.tab = tab;
    $$(".view").forEach(v => { v.hidden = v.dataset.view !== tab; });
    $$("#tabs [data-tab]").forEach(b => b.setAttribute("aria-current", b.dataset.tab === tab ? "page" : "false"));
    try { if (!/^#k=/.test(location.hash)) history.replaceState(null, "", location.pathname + location.search + (tab === "today" ? "" : "#" + tab)); } catch (e) { /* sandboxed */ }
    if (!keepScroll) window.scrollTo(0, 0);
  }
  $("#tabs").addEventListener("click", e => { const b = e.target.closest("[data-tab]"); if (b) showTab(b.dataset.tab); });

  function renderCards(all) {
    const el = $("#cards");
    if (mode === "loading") { el.innerHTML = `<div class="calm"><p class="muted">Chargement de ton cercle…</p></div>`; return; }
    if (!all.length) {
      el.innerHTML = `<div class="calm"><h3>Commence par trois personnes</h3><p class="muted">Pense à quelqu'un de ta famille, un ami proche et une personne que tu as un peu perdue de vue. Cercle te dira ensuite quand reprendre contact.</p><div class="actions"><button class="primary" type="button" data-act="add">+ Ajouter quelqu'un</button><button type="button" data-act="contacts">Importer mes contacts</button></div></div>`;
      $("#weekCount").textContent = ""; return;
    }
    const list = pickWeek(all);
    $("#weekCount").textContent = list.length ? list.length + " personne" + (list.length > 1 ? "s" : "") : "";
    if (!list.length) {
      el.innerHTML = `<div class="calm"><h3>Tout le monde va bien</h3><p class="muted">Aucun lien ne s'essouffle cette semaine. Rien à faire, profite.</p></div>`; return;
    }
    el.innerHTML = list.map(({ p, h, reason }) => {
      let why;
      if (reason === "bday") why = `Anniversaire ${inDays(h.bday.in)}${h.bday.age ? " (" + h.bday.age + " ans)" : ""}`;
      else if (h.since == null) why = `Aucun échange noté · rythme : ${freqLabel(h.freq)}`;
      else why = `Dernier contact ${ago(h.since)}${SRC_LABEL[h.src] ? " (" + SRC_LABEL[h.src] + ")" : ""} · rythme : ${freqLabel(h.freq)}`;
      const lastLog = (p.log || []).slice().sort((a, b) => (b.d || "").localeCompare(a.d || ""))[0];
      const ask = (p.asks || [])[0];
      let hint = "";
      if (ask) hint = `<div class="hint"><b>À lui demander</b>${esc(ask)}${p.asks.length > 1 ? ` <span class="muted">+${p.asks.length - 1}</span>` : ""}</div>`;
      else if (lastLog && lastLog.n) hint = `<div class="hint"><b>La dernière fois</b>${esc(lastLog.n)}</div>`;
      else if (p.notes) hint = `<div class="hint"><b>À retenir</b>${esc(p.notes.length > 120 ? p.notes.slice(0, 118) + "…" : p.notes)}</div>`;
      return `<article class="card ${reason === "bday" ? "bday" : ""}">
        <div class="who">${plant(h.state, 48)}<div><h3>${esc(p.name)}</h3><span class="pill ${STATE[h.state].cls}">${STATE[h.state].label}</span></div></div>
        <p class="why muted">${esc(why)}</p>${hint}
        <div class="row"><button class="primary" type="button" data-act="log" data-id="${esc(p.id)}">C'est fait</button>
        <button type="button" data-act="snooze" data-id="${esc(p.id)}">Plus tard</button>
        <button class="ghost" type="button" data-act="open" data-id="${esc(p.id)}">Fiche</button></div></article>`;
    }).join("");
  }

  function renderSide(all) {
    const bd = all.filter(x => x.h.bday && x.h.bday.in <= 60).sort((a, b) => a.h.bday.in - b.h.bday.in).slice(0, 6);
    $("#bdays").innerHTML = mode === "loading" ? `<li class="muted">…</li>` : bd.length ? bd.map(({ p, h }) => `<li><button type="button" data-act="open" data-id="${esc(p.id)}">${esc(p.name)}</button>
      <span class="muted small num">${esc(fmtShort.format(h.bday.date))} · ${inDays(h.bday.in)}${h.bday.age ? " · " + h.bday.age + " ans" : ""}</span></li>`).join("")
      : `<li class="muted small">Aucun dans les 60 prochains jours. Renseigne les dates dans les fiches pour ne plus en rater.</li>`;
    if (mode === "loading" || !all.length) { ["#sHealthy", "#s30", "#sStreak"].forEach(s => $(s).textContent = "–"); $("#meter").innerHTML = ""; return; }
    const n = all.length, count = st => all.filter(x => x.h.state === st).length;
    $("#sHealthy").textContent = Math.round((count("bloom") + count("ok")) / n * 100) + " %";
    const t = today0();
    // one entry per person per active day, manual notes and synced sources together
    const logs = people.flatMap(p => {
      const s = new Set((p.log || []).map(l => l.d));
      Object.values(p.sync || {}).forEach(v => (v.days || []).forEach(d => s.add(d)));
      return Array.from(s).map(parseD).filter(Boolean);
    });
    $("#s30").textContent = logs.filter(d => days(t, d) <= 30 && days(t, d) >= 0).length;
    // consecutive weeks (Monday-based) with at least one logged contact, counting back from this week (or last if this one is empty so far)
    const monday = d => { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); x.setHours(0, 0, 0, 0); return x.getTime(); };
    const weeks = new Set(logs.map(monday));
    let w = monday(t); if (!weeks.has(w)) w -= 7 * 864e5;
    let streak = 0; while (weeks.has(w)) { streak++; w = monday(new Date(w - 3 * 864e5)); }
    $("#sStreak").textContent = streak;
    const seg = (st, v) => { const c = count(st); return c ? `<i style="width:${c / n * 100}%;background:${v}" title="${STATE[st].label} : ${c}"></i>` : ""; };
    $("#meter").innerHTML = seg("bloom", "var(--leaf-2)") + seg("ok", "var(--leaf)") + seg("thirsty", "var(--leaf-dry)") + seg("wilted", "var(--dead)");
  }

  function renderFilters() {
    const opts = [["all", "Tout le monde"]].concat(Object.entries(CIRCLES));
    $("#filters").innerHTML = opts.map(([k, v]) => `<button class="chipbtn" type="button" data-f="${k}" aria-pressed="${filter === k}">${esc(v)}</button>`).join("");
  }
  $("#filters").addEventListener("click", e => { const b = e.target.closest("[data-f]"); if (!b) return; filter = b.dataset.f; ls("cercle-filter", filter); renderFilters(); render(); });

  function renderGarden(all) {
    const el = $("#garden");
    if (mode === "loading") { el.innerHTML = ""; return; }
    const groups = Object.keys(CIRCLES).filter(k => filter === "all" || filter === k);
    let html = "";
    groups.forEach(k => {
      const list = all.filter(x => (x.p.circle || "autres") === k).sort((a, b) => b.h.ratio - a.h.ratio);
      if (!list.length && filter === "all") return;
      html += `<div class="circle-group"><span class="label">${esc(CIRCLES[k])} · ${list.length}</span><div class="garden">` +
        list.map(({ p, h }) => `<button class="person" type="button" data-act="open" data-id="${esc(p.id)}" aria-label="${esc(p.name)}, ${STATE[h.state].label}">
          ${plant(h.state, 60)}<span class="nm">${esc(p.name)}</span><span class="st">${h.rdv ? "RDV le " + esc(fmtShort.format(h.rdv)) : h.since == null ? "jamais noté" : esc(ago(h.since))}</span></button>`).join("") +
        (filter !== "all" ? `<button class="person add" type="button" data-act="add" data-circle="${k}"><span>+</span>Ajouter</button>` : "") + `</div></div>`;
    });
    if (!html) html = `<div class="garden"><button class="person add" type="button" data-act="add" data-circle="${filter === "all" ? "amis" : filter}"><span>+</span>Ajouter quelqu'un</button></div>`;
    el.innerHTML = html;
  }

  // ---------- overlays ----------
  let lastFocus = null, tH;
  // Focus the sheet itself: focusing a field would pop the keyboard or a date picker on phones.
  function open(id) { lastFocus = document.activeElement; $(id).hidden = false; const sh = $(id + " .sheet"); if (sh) { sh.scrollTop = 0; setTimeout(() => sh.focus({ preventScroll: true }), 40); } }
  function close(o) { o.hidden = true; if (lastFocus && lastFocus.focus) lastFocus.focus(); }
  $$(".ov").forEach(o => o.addEventListener("click", e => { if (e.target === o || e.target.closest("[data-close]")) close(o); }));
  document.addEventListener("keydown", e => { if (e.key === "Escape") $$(".ov").forEach(o => { if (!o.hidden) close(o); }); });
  function toast(m) { const t = $("#toast"); t.textContent = m; t.hidden = false; clearTimeout(tH); tH = setTimeout(() => t.hidden = true, 2800); }

  // ---------- log contact ----------
  let logExtra = null;
  let logP = null, logT = "appel", newAsks = [];
  $("#logType").innerHTML = Object.entries(TYPES).map(([k, v]) => `<button type="button" data-t="${k}">${v}</button>`).join("");
  $("#logType").addEventListener("click", e => { const b = e.target.closest("[data-t]"); if (!b) return; logT = b.dataset.t; paintType(); });
  function paintType() { $$("#logType button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.t === logT))); }
  function openLog(id) {
    logP = people.find(p => p.id === id); if (!logP) return;
    const h = health(logP);
    $("#logWho").innerHTML = `${plant(h.state, 44)}<div><span class="label">Prendre des nouvelles</span><h2 id="logTitle">${esc(logP.name)}</h2></div>`;
    logT = ((logP.log || [])[0] || {}).t || "appel"; paintType();
    $("#logDate").value = iso(today0()); $("#logNote").value = ""; $("#logNewAsk").value = ""; newAsks = []; paintNewAsks();
    logExtra = null; $("#aiTidyInfo").hidden = true;
    const asks = logP.asks || [];
    $("#logAsksWrap").hidden = !asks.length;
    $("#logAsks").innerHTML = asks.map((a, i) => `<li><label><input type="checkbox" data-i="${i}"> <span>${esc(a)}</span></label></li>`).join("");
    open("#ovLog");
  }
  function paintNewAsks() { $("#logNewAsks").innerHTML = newAsks.map((a, i) => `<li><span>${esc(a)}</span><button class="ghost" type="button" data-rm="${i}" aria-label="Retirer">×</button></li>`).join(""); }
  function addNewAsk() { const v = $("#logNewAsk").value.trim(); if (!v) return; newAsks.push(v); $("#logNewAsk").value = ""; paintNewAsks(); }
  $("#logAddAsk").addEventListener("click", addNewAsk);
  $("#logNewAsk").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); addNewAsk(); } });
  $("#logNewAsks").addEventListener("click", e => { const b = e.target.closest("[data-rm]"); if (b) { newAsks.splice(+b.dataset.rm, 1); paintNewAsks(); } });
  $("#btnLogSave").addEventListener("click", async () => {
    if (!logP) return;
    const d = $("#logDate").value || iso(today0());
    const done = new Set($$("#logAsks input:checked").map(i => +i.dataset.i));
    const p = applyLog(logP, { d, t: logT, n: $("#logNote").value.trim(), doneAsks: Array.from(done), newAsks });
    if (logExtra) {
      // facts and birthday the assistant found in the dictated note
      const known = normName(p.notes || "");
      const facts = (logExtra.facts || []).filter(f => f && !known.includes(normName(f)));
      if (facts.length) p.notes = (p.notes ? p.notes.trim() + "\n" : "") + facts.join("\n");
      const bd = logExtra.birthday;
      if (bd && bd.day >= 1 && bd.day <= 31 && bd.month >= 1 && bd.month <= 12 && !p.bdMonth) { p.bdDay = bd.day; p.bdMonth = bd.month; if (bd.year > 1900) p.bdYear = bd.year; }
    }
    const b = $("#btnLogSave"); b.disabled = true;
    try { await save(p); close($("#ovLog")); toast(p.name + " : c'est noté"); } catch (e) { failed(e); } finally { b.disabled = false; }
  });

  async function snooze(id) {
    const p = people.find(x => x.id === id); if (!p) return;
    const c = JSON.parse(JSON.stringify(p));
    const d = today0(); d.setDate(d.getDate() + 7); c.snoozeUntil = iso(d);
    try { await save(c); toast(p.name + " revient dans une semaine"); } catch (e) { failed(e); }
  }

  // ---------- person sheet ----------
  let curP = null, pAsks = [], delArmed = false;
  $("#p_circle").innerHTML = Object.entries(CIRCLES).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("");
  $("#p_freq").innerHTML = FREQS.map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("");
  $("#p_bd_d").innerHTML = `<option value="">Jour</option>` + Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join("");
  $("#p_bd_m").innerHTML = `<option value="">Mois</option>` + MONTHS.map((m, i) => `<option value="${i + 1}">${m}</option>`).join("");

  function openPerson(id, circle) {
    curP = id ? people.find(p => p.id === id) : null;
    const p = curP || { name: "", circle: circle || "amis", freq: DEFAULT_FREQ[circle || "amis"], asks: [], log: [] };
    const h = health(p);
    $("#pWho").innerHTML = curP ? `${plant(h.state, 52)}<div><span class="label">${esc(CIRCLES[p.circle] || "")}${p.demo ? " · exemple" : ""}</span><h2 id="pTitle">${esc(p.name)}</h2>
      <span class="pill ${STATE[h.state].cls}">${STATE[h.state].label}</span> <span class="muted small">${h.since == null ? "aucun échange noté" : "dernier contact " + esc(ago(h.since))}</span></div>`
      : `${plant("ok", 52)}<div><span class="label">Nouvelle personne</span><h2 id="pTitle">Ajouter quelqu'un</h2></div>`;
    $("#pQuick").innerHTML = curP ? `<button class="primary" type="button" data-act="log" data-id="${esc(p.id)}">J'ai pris des nouvelles</button>
      <button class="ai-btn" type="button" data-act="aiMsg" data-id="${esc(p.id)}">Idée de message</button>
      <button class="ai-btn" type="button" data-act="aiPrep" data-id="${esc(p.id)}">Préparer l'appel</button>` : "";
    $("#pQuick").hidden = !curP;
    $("#ovPerson .sheet").classList.toggle("new", !curP);
    $("#pEdit").open = !curP;
    $("#pSrcWrap").hidden = !curP;
    const f = $("#pForm").elements;
    f.name.value = p.name || ""; f.circle.value = p.circle || "amis"; f.freq.value = String(p.freq || 30);
    f.bdDay.value = p.bdDay || ""; f.bdMonth.value = p.bdMonth || ""; f.bdYear.value = p.bdYear || "";
    f.lastSeed.value = p.lastSeed || ""; f.notes.value = p.notes || "";
    f.phones.value = (p.phones || []).join(", "); f.emails.value = (p.emails || []).join(", ");
    renderPersonSources(p);
    pAsks = (p.asks || []).slice(); paintPAsks(); $("#pNewAsk").value = "";
    const log = (p.log || []).slice().sort((a, b) => (b.d || "").localeCompare(a.d || ""));
    $("#pHistWrap").hidden = !log.length;
    $("#pHist").innerHTML = log.slice(0, 30).map(l => { const d = parseD(l.d); return `<li><span class="meta">${d ? d.getDate() + " " + MONTHS[d.getMonth()] + " " + d.getFullYear() : ""} · ${esc(TYPES[l.t] || l.t || "")}</span>${l.n ? `<span>${esc(l.n)}</span>` : ""}</li>`; }).join("");
    delArmed = false; $("#btnPDelete").textContent = "Retirer"; $("#btnPDelete").hidden = !curP;
    $("#pErr").hidden = true;
    open("#ovPerson");
  }
  $("#p_circle").addEventListener("change", e => { if (!curP) $("#p_freq").value = String(DEFAULT_FREQ[e.target.value] || 30); });
  function paintPAsks() { $("#pAsks").innerHTML = pAsks.map((a, i) => `<li><span>${esc(a)}</span><button class="ghost" type="button" data-rm="${i}" aria-label="Retirer">×</button></li>`).join(""); }
  function addPAsk() { const v = $("#pNewAsk").value.trim(); if (!v) return; pAsks.push(v); $("#pNewAsk").value = ""; paintPAsks(); }
  $("#pAddAsk").addEventListener("click", addPAsk);
  $("#pNewAsk").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); addPAsk(); } });
  $("#pAsks").addEventListener("click", e => { const b = e.target.closest("[data-rm]"); if (b) { pAsks.splice(+b.dataset.rm, 1); paintPAsks(); } });
  $("#pForm").addEventListener("submit", e => { e.preventDefault(); $("#btnPSave").click(); });
  $("#btnPSave").addEventListener("click", async () => {
    const f = $("#pForm").elements, err = $("#pErr");
    const name = f.name.value.trim();
    if (!name) { err.textContent = "Il faut au moins un prénom."; err.hidden = false; return; }
    const bdDay = +f.bdDay.value || null, bdMonth = +f.bdMonth.value || null;
    if ((bdDay && !bdMonth) || (!bdDay && bdMonth)) { err.textContent = "Pour l'anniversaire, choisis le jour et le mois."; err.hidden = false; return; }
    if (bdDay && bdMonth && bdDay > new Date(2024, bdMonth, 0).getDate()) { err.textContent = "Cette date n'existe pas."; err.hidden = false; return; }
    const p = curP ? JSON.parse(JSON.stringify(curP)) : { createdAt: new Date().toISOString(), log: [] };
    Object.assign(p, { name, circle: f.circle.value, freq: +f.freq.value, bdDay, bdMonth, bdYear: +f.bdYear.value || null,
      lastSeed: f.lastSeed.value || null, notes: f.notes.value.trim(), asks: pAsks,
      phones: splitList(f.phones.value), emails: splitList(f.emails.value).map(e => e.toLowerCase()) });
    const b = $("#btnPSave"); b.disabled = true;
    try { await save(p); close($("#ovPerson")); toast(curP ? "Fiche mise à jour" : name + " rejoint ton cercle"); } catch (e) { failed(e); } finally { b.disabled = false; }
  });
  $("#btnPDelete").addEventListener("click", async () => {
    if (!curP) return;
    if (!delArmed) { delArmed = true; $("#btnPDelete").textContent = "Vraiment retirer ?"; return; }
    try { await remove(curP.id); close($("#ovPerson")); toast(curP.name + " retiré(e)"); } catch (e) { failed(e); }
  });

  // ---------- global clicks ----------
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const a = b.dataset.act, id = b.dataset.id;
    if (a === "add") openPerson(null, b.dataset.circle);
    else if (a === "open") openPerson(id);
    else if (a === "log") { if (!$("#ovPerson").hidden) $("#ovPerson").hidden = true; openLog(id); }
    else if (a === "snooze") snooze(id);
    else if (a === "contacts") $("#btnContacts").click();
    else if (a === "aiMsg") aiMessages(id);
    else if (a === "aiPrep") aiPrep(id);
  });
  $("#btnAdd").addEventListener("click", () => openPerson(null));

  // ---------- demo cleanup ----------
  let demoArmed = false;
  $("#btnClearDemo").addEventListener("click", async () => {
    const b = $("#btnClearDemo"), demo = people.filter(p => p.demo);
    if (!demoArmed) { demoArmed = true; b.textContent = "Confirmer : effacer " + demo.length + " exemples"; b.classList.add("danger"); return; }
    b.disabled = true;
    for (const p of demo) { try { await remove(p.id); } catch (e) { failed(e); break; } }
    b.disabled = false; demoArmed = false; b.textContent = "Effacer les exemples"; b.classList.remove("danger");
    toast("Exemples effacés. À toi de jouer.");
  });

  // ---------- backup ----------
  $("#btnExport").addEventListener("click", async () => {
    const data = JSON.stringify({ app: "cercle", version: 1, exportedAt: new Date().toISOString(), people }, null, 2);
    if (!isNative) {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([data], { type: "application/json" }));
      a.download = "cercle-sauvegarde-" + iso(today0()) + ".json";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast("Sauvegarde téléchargée"); return;
    }
    $("#expText").value = data; open("#ovExport");
  });
  $("#btnExpCopy").addEventListener("click", async () => {
    const ta = $("#expText");
    try { await navigator.clipboard.writeText(ta.value); toast("Copié"); } catch (e) { ta.focus(); ta.select(); toast("Texte sélectionné : Ctrl+C / Cmd+C"); }
  });
  let impList = [];
  function parseImport() {
    impList = [];
    const txt = $("#impText").value.trim(); const info = $("#impInfo");
    if (!txt) { info.textContent = ""; $("#btnImpGo").disabled = true; return; }
    try {
      const j = JSON.parse(txt); const arr = Array.isArray(j) ? j : j.people;
      impList = (arr || []).filter(p => p && typeof p.name === "string" && p.name.trim());
      info.textContent = impList.length ? impList.length + " personne(s) trouvée(s)." : "Aucune personne trouvée dans ce fichier.";
    } catch (e) { info.textContent = "Ce contenu n'est pas une sauvegarde Cercle valide."; }
    $("#btnImpGo").disabled = !impList.length;
  }
  $("#btnImport").addEventListener("click", () => { $("#impText").value = ""; $("#impFile").value = ""; parseImport(); open("#ovImport"); });
  $("#impText").addEventListener("input", parseImport);
  $("#impFile").addEventListener("change", e => { const f = e.target.files && e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { $("#impText").value = String(r.result || ""); parseImport(); }; r.readAsText(f); });
  $("#btnImpGo").addEventListener("click", async () => {
    const b = $("#btnImpGo"); b.disabled = true; let n = 0;
    for (const p of impList) {
      const c = Object.assign({}, p); if (!c.id || !/^[A-Za-z0-9_\-.~:@+]{1,200}$/.test(c.id)) c.id = newId();
      try { await save(c); n++; } catch (e) { failed(e); break; }
    }
    close($("#ovImport")); toast(n + " personne(s) restaurée(s)");
  });

  // ---------- matching helpers ----------
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const fmtShortD = d => fmtShort.format(d);

  // changes: Map personId -> { p, src: { key: { dates:[Date], n, next? } } }
  function addChange(ch, p, key, dates, n, extra) {
    const c = ch.get(p.id) || { p, src: {} };
    const cur = c.src[key] || { dates: [], n: 0 };
    dates.forEach(d => cur.dates.push(d)); cur.n += n;
    if (extra) Object.assign(cur, extra);
    c.src[key] = cur; ch.set(p.id, c);
  }
  // Fold new dates into each person's sync block; write only people whose block actually changed.
  async function commit(ch, progress) {
    const now = new Date(); let written = 0, i = 0;
    for (const { p, src } of ch.values()) {
      i++; if (progress) progress(i, ch.size);
      const fresh = people.find(x => x.id === p.id) || p;
      const c = JSON.parse(JSON.stringify(fresh)); c.sync = c.sync || {};
      const before = JSON.stringify(c.sync);
      for (const [k, v] of Object.entries(src)) c.sync[k] = foldSync(c.sync[k], v, now);
      if (JSON.stringify(c.sync) === before) continue;
      await save(c); written++;
    }
    return written;
  }
  function renderPersonSources(p) {
    const sy = p.sync || {}, rows = [];
    Object.entries(SRC_LABEL).forEach(([k, lab]) => {
      const v = sy[k]; if (!v) return;
      const d = parseD(v.last), unit = k === "whatsapp" ? "messages" : k === "gmail" ? "e-mails" : k === "agenda" ? "rendez-vous" : "échanges";
      let txt = d ? "dernier échange " + ago(days(today0(), d)) : "aucun échange récent";
      if (v.n) txt += " · " + v.n + " " + unit;
      if (k === "agenda" && v.next && parseD(v.next) >= today0()) txt += " · prochain le " + fmtShortD(parseD(v.next));
      rows.push(`<div class="srcline"><b>${esc(lab.charAt(0).toUpperCase() + lab.slice(1))}</b><span class="muted">${esc(txt)}</span></div>`);
    });
    const hasIds = (p.emails || []).length || (p.phones || []).length;
    $("#pSrc").innerHTML = rows.join("") || `<p class="muted small">${hasIds ? "Rien de synchronisé pour l'instant." : "Ajoute son téléphone ou son e-mail dans « Modifier la fiche » pour que Cercle reconnaisse vos échanges automatiquement."}</p>`;
  }

  // ---------- contacts import (.vcf / Google CSV) ----------
  let ctItems = [];
  function ctDup(o) {
    const pi = phoneIndex(), ei = emailIndex();
    for (const x of o.phones) { const p = pi.get(normPhone(x)); if (p) return p; }
    for (const x of o.emails) { const p = ei.get(x); if (p) return p; }
    return findByName(o.name);
  }
  function circleOptions(sel) { return Object.entries(CIRCLES).map(([k, v]) => `<option value="${k}"${k === sel ? " selected" : ""}>${esc(v)}</option>`).join(""); }
  function renderCt() {
    const q = normName($("#ctSearch").value);
    const list = ctItems.filter(o => !q || normName(o.name).includes(q));
    const shown = list.slice(0, 250);
    $("#ctList").innerHTML = shown.length ? shown.map(o => {
      const bd = o.bday ? "anniv. " + o.bday.d + " " + MONTHS[o.bday.m - 1] : "";
      const meta = [o.phones[0], o.emails[0], bd].filter(Boolean).join(" · ");
      return `<li><input type="checkbox" data-k="${o.k}" ${o.on ? "checked" : ""} aria-label="Choisir ${esc(o.name)}">
        <div style="min-width:0"><div class="nm2">${esc(o.name)}</div><div class="meta">${esc(meta || "sans numéro ni e-mail")}</div>${o.dup ? `<div class="dup">Déjà dans ton cercle : sa fiche sera complétée</div>` : ""}</div>
        ${o.dup ? "<span></span>" : `<select data-k="${o.k}" aria-label="Cercle de ${esc(o.name)}">${circleOptions(o.circle)}</select>`}</li>`;
    }).join("") : `<li class="empty">Aucun contact ne correspond.</li>`;
    const sel = ctItems.filter(o => o.on).length;
    $("#ctCount").textContent = sel + " choisi(s) sur " + ctItems.length + (list.length > shown.length ? " · affine la recherche pour voir les autres" : "");
    $("#btnCtGo").disabled = !sel; $("#btnCtGo").textContent = sel ? "Ajouter la sélection (" + sel + ")" : "Ajouter la sélection";
  }
  $("#btnContacts").addEventListener("click", () => {
    ctItems = []; $("#ctFile").value = ""; $("#ctSearch").value = ""; $("#ctList").hidden = true; $("#ctTools").hidden = true;
    $("#ctInfo").textContent = ""; $("#ctHow").open = true; renderCt(); open("#ovContacts");
  });
  $("#ctFile").addEventListener("change", async e => {
    const files = Array.from(e.target.files || []); if (!files.length) return;
    let all = [];
    for (const f of files) {
      const txt = await f.text();
      all = all.concat(/BEGIN:VCARD/i.test(txt) ? parseVCF(txt) : parseGoogleCSV(txt));
    }
    showContactItems(all);
  });
  function showContactItems(all) {
    const seen = new Set();
    ctItems = all.filter(o => { const k = normName(o.name) + "|" + (o.phones[0] || o.emails[0] || ""); if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((a, b) => a.name.localeCompare(b.name, "fr"))
      .map((o, i) => Object.assign(o, { k: i, on: false, circle: "amis", dup: ctDup(o) }));
    $("#ctInfo").textContent = ctItems.length ? "Coche les personnes qui comptent. Les autres ne sont pas importées." : "Aucun contact lisible dans ce fichier. Vérifie qu'il s'agit d'un .vcf ou d'un CSV Google.";
    $("#ctHow").open = !ctItems.length; $("#ctList").hidden = !ctItems.length; $("#ctTools").hidden = !ctItems.length;
    renderCt();
  }
  $("#ctSearch").addEventListener("input", renderCt);
  $("#ctAll").addEventListener("click", () => { const q = normName($("#ctSearch").value); ctItems.forEach(o => { if (!q || normName(o.name).includes(q)) o.on = true; }); renderCt(); });
  $("#ctNone").addEventListener("click", () => { ctItems.forEach(o => o.on = false); renderCt(); });
  $("#ctList").addEventListener("change", e => {
    const k = e.target.dataset.k; if (k == null) return; const o = ctItems[+k]; if (!o) return;
    if (e.target.type === "checkbox") { o.on = e.target.checked; renderCt(); } else o.circle = e.target.value;
  });
  $("#btnCtGo").addEventListener("click", async () => {
    const sel = ctItems.filter(o => o.on), b = $("#btnCtGo"); b.disabled = true; let n = 0;
    for (const o of sel) {
      b.textContent = "Ajout… " + (n + 1) + "/" + sel.length;
      let p;
      if (o.dup) {
        p = JSON.parse(JSON.stringify(people.find(x => x.id === o.dup.id) || o.dup));
        p.phones = uniq((p.phones || []).concat(o.phones)); p.emails = uniq((p.emails || []).concat(o.emails));
        if (o.bday && !p.bdMonth) { p.bdDay = o.bday.d; p.bdMonth = o.bday.m; p.bdYear = o.bday.y; }
      } else {
        p = { name: o.name, circle: o.circle, freq: DEFAULT_FREQ[o.circle] || 60, phones: o.phones, emails: o.emails, asks: [], log: [], notes: "",
          bdDay: o.bday ? o.bday.d : null, bdMonth: o.bday ? o.bday.m : null, bdYear: o.bday ? o.bday.y : null, createdAt: new Date().toISOString() };
      }
      try { await save(p); n++; } catch (err) { failed(err); break; }
    }
    close($("#ovContacts")); toast(n + " personne(s) ajoutée(s) ou complétée(s)");
    if (n && isNative) nativeSync(false);
  });

  // ---------- WhatsApp import ----------
  let waChats = [];
  function renderWA() {
    const opts = p => `<option value="">Ignorer</option><option value="__new"${p === "__new" ? " selected" : ""}>+ Nouvelle personne</option>` +
      people.slice().sort((a, b) => a.name.localeCompare(b.name, "fr")).map(x => `<option value="${esc(x.id)}"${x.id === p ? " selected" : ""}>${esc(x.name)}</option>`).join("");
    $("#waList").innerHTML = waChats.map((c, i) => `<li><span class="src-ic">W</span><div style="min-width:0"><div class="nm2">${esc(c.label)}</div>
      <div class="meta">${c.count} messages · dernier le ${esc(fmtShortD(c.last))} ${c.last.getFullYear()}${c.group ? " · groupe" : ""}</div></div>
      <select data-i="${i}" aria-label="Associer à">${opts(c.target)}</select></li>`).join("");
    $("#btnWaGo").disabled = !waChats.some(c => c.target);
  }
  $("#btnWA").addEventListener("click", () => { waChats = []; $("#waFile").value = ""; $("#waList").hidden = true; $("#waInfo").textContent = ""; $("#btnWaGo").disabled = true; open("#ovWA"); });
  $("#waFile").addEventListener("change", async e => {
    const files = Array.from(e.target.files || []); if (!files.length) return;
    $("#waInfo").textContent = "Lecture…"; const out = []; let bad = 0;
    for (const f of files) {
      try {
        let text = null;
        if (/\.zip$/i.test(f.name)) {
          if (!window.JSZip) { bad++; continue; }
          const zip = await window.JSZip.loadAsync(f);
          const entry = Object.values(zip.files).find(z => /\.txt$/i.test(z.name) && !z.dir);
          text = entry ? await entry.async("string") : null;
        } else text = await f.text();
        const r = text ? parseWA(text, f.name) : null;
        if (r) out.push(r); else bad++;
      } catch (err) { bad++; }
    }
    waChats = out.map(c => Object.assign(c, { target: c.match ? c.match.id : (!c.group && c.chatName ? "__new" : "") }));
    $("#waList").hidden = !waChats.length;
    $("#waInfo").textContent = (waChats.length ? "Vérifie les associations, puis valide." : "Aucune discussion lisible.") + (bad ? " " + bad + " fichier(s) ignoré(s) (format non reconnu)." : "");
    renderWA();
  });
  $("#waList").addEventListener("change", e => { const i = e.target.dataset.i; if (i == null) return; waChats[+i].target = e.target.value; renderWA(); });
  $("#btnWaGo").addEventListener("click", async () => {
    const b = $("#btnWaGo"); b.disabled = true;
    const ch = new Map(), cutoff = Date.now() - 90 * 864e5;
    try {
      for (const c of waChats) {
        if (!c.target) continue;
        let p = c.target === "__new" ? null : people.find(x => x.id === c.target);
        if (!p && c.target === "__new") {
          const np = { name: c.chatName || c.label, circle: "amis", freq: 30, asks: [], log: [], notes: "", createdAt: new Date().toISOString() };
          const id = await save(np); p = Object.assign({ id }, np);
          if (!people.find(x => x.id === id)) people.push(p);
        }
        if (!p) continue;
        addChange(ch, p, "whatsapp", c.dates, c.dates.filter(d => d.getTime() >= cutoff).length);
      }
      const n = await commit(ch, (i, t) => b.textContent = "Mise à jour… " + i + "/" + t);
      ls("cercle-wa-at", new Date().toISOString()); renderSources();
      close($("#ovWA")); toast(n ? n + " personne(s) mise(s) à jour depuis WhatsApp" : "Déjà à jour");
    } catch (err) { failed(err); }
    finally { b.disabled = false; b.textContent = "Mettre à jour"; }
  });

  // ---------- Calls & SMS import (SMS Backup & Restore XML) ----------
  let phResult = null;
  function scanXML(text, agg) {
    const re = /<(call|sms)\s([^>]*?)\/?>/g, at = /(\w+)="([^"]*)"/g; let m;
    while ((m = re.exec(text))) {
      const a = {}; let x; at.lastIndex = 0;
      while ((x = at.exec(m[2]))) a[x[1]] = x[2];
      const kind = m[1];
      if (kind === "call" && !((a.type === "1" || a.type === "2") && +a.duration > 0)) continue;
      const num = normPhone(kind === "call" ? a.number : a.address);
      const ts = +a.date; if (!num || !ts) continue;
      const rec = agg.get(num) || { num, raw: kind === "call" ? a.number : a.address, name: "", dates: [], calls: 0, sms: 0 };
      if (a.contact_name && a.contact_name !== "(Unknown)" && a.contact_name !== "null") rec.name = a.contact_name.replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'");
      rec.dates.push(new Date(ts)); kind === "call" ? rec.calls++ : rec.sms++;
      agg.set(num, rec);
    }
  }
  $("#btnPhone").addEventListener("click", () => { phResult = null; $("#phFile").value = ""; $("#phList").hidden = true; $("#phInfo").textContent = ""; $("#btnPhGo").disabled = true; open("#ovPhone"); });
  $("#phFile").addEventListener("change", async e => {
    const files = Array.from(e.target.files || []); if (!files.length) return;
    $("#phInfo").textContent = "Lecture…";
    const agg = new Map();
    for (const f of files) { try { scanXML(await f.text(), agg); } catch (err) {} }
    const pi = phoneIndex(), cutoff = Date.now() - 90 * 864e5;
    const matched = [], unknown = [];
    agg.forEach(r => {
      const p = pi.get(r.num) || (r.name ? findByName(r.name) : null);
      r.recent = r.dates.filter(d => d.getTime() >= cutoff).length;
      r.last = r.dates.reduce((a, b) => b > a ? b : a, r.dates[0]);
      if (p) matched.push(Object.assign(r, { p })); else if (r.recent >= 3) unknown.push(Object.assign(r, { on: false }));
    });
    unknown.sort((a, b) => b.recent - a.recent);
    phResult = { matched, unknown: unknown.slice(0, 40) };
    const lines = matched.map(r => `<li><span class="src-ic">T</span><div style="min-width:0"><div class="nm2">${esc(r.p.name)}</div><div class="meta">${r.calls} appel(s), ${r.sms} SMS · dernier le ${esc(fmtShortD(r.last))}</div></div><span class="pill s-ok">reconnu</span></li>`)
      .concat(phResult.unknown.map((r, i) => `<li><input type="checkbox" data-u="${i}" aria-label="Ajouter ${esc(r.name || r.raw)}"><div style="min-width:0"><div class="nm2">${esc(r.name || r.raw)}</div><div class="meta">${r.recent} échanges sur 90 jours · pas encore dans ton cercle</div></div><span></span></li>`));
    $("#phList").innerHTML = lines.join("") || `<li class="empty">Aucun échange trouvé dans ces fichiers.</li>`;
    $("#phList").hidden = false;
    $("#phInfo").textContent = agg.size ? `${matched.length} personne(s) reconnue(s). ${phResult.unknown.length ? "Coche les numéros fréquents à ajouter à ton cercle." : ""}` : "Format non reconnu. Choisis un fichier calls-….xml ou sms-….xml.";
    $("#btnPhGo").disabled = !matched.length && !phResult.unknown.length;
  });
  $("#phList").addEventListener("change", e => { const i = e.target.dataset.u; if (i != null && phResult) phResult.unknown[+i].on = e.target.checked; });
  $("#btnPhGo").addEventListener("click", async () => {
    if (!phResult) return; const b = $("#btnPhGo"); b.disabled = true; const ch = new Map();
    try {
      for (const r of phResult.unknown.filter(u => u.on)) {
        const np = { name: r.name || r.raw, circle: "amis", freq: 30, phones: [r.raw], asks: [], log: [], notes: "", createdAt: new Date().toISOString() };
        const id = await save(np); const p = Object.assign({ id }, np);
        if (!people.find(x => x.id === id)) people.push(p);
        phResult.matched.push(Object.assign(r, { p }));
      }
      phResult.matched.forEach(r => addChange(ch, r.p, "phone", r.dates, r.recent));
      const n = await commit(ch, (i, t) => b.textContent = "Mise à jour… " + i + "/" + t);
      ls("cercle-ph-at", new Date().toISOString()); renderSources();
      close($("#ovPhone")); toast(n ? n + " personne(s) mise(s) à jour" : "Déjà à jour");
    } catch (err) { failed(err); }
    finally { b.disabled = false; b.textContent = "Mettre à jour"; }
  });

  // ---------- calendar matching (Android agenda) ----------
  function applyCalendar(ch, events) {
    const ei = emailIndex();
    const nameRes = nameKeys(people);
    const now = new Date(), nextBy = new Map();
    events.forEach(ev => {
      const d = eventDate(ev); if (!d) return;
      const ps = eventPeople(ev, ei, nameRes);
      if (d <= now) ps.forEach(p => addChange(ch, p, "agenda", [d], 1));
      else ps.forEach(p => { const cur = nextBy.get(p.id); if (!cur || d < cur.d) nextBy.set(p.id, { p, d }); });
    });
    people.forEach(p => {
      const nx = nextBy.get(p.id), had = p.sync && p.sync.agenda;
      if (nx) addChange(ch, p, "agenda", [], 0, { next: iso(nx.d) });
      else if (had && had.next) addChange(ch, p, "agenda", [], 0, { next: null });
    });
    ch.forEach(c => { const a = c.src.agenda; if (a) a.n = a.dates.filter(d => Date.now() - d.getTime() <= 90 * 864e5).length; });
  }

  // ---------- sync between devices (Supabase, pairing key) ----------
  const SB_URL = "https://pxayslaqnuhcbakuaimg.supabase.co";
  const SB_KEY = "sb_publishable_SEOEX91r98Fnjo1XDT3MXw_HP0oV5tn";
  const PWA_URL = "https://nooreyni.github.io/cercle/";
  const Sync = (() => {
    const K = "cercle-sync";
    const blank = () => ({ key: null, since: null, dirty: [], tomb: [], at: null, err: null });
    let st = (() => { try { return Object.assign(blank(), JSON.parse(ls(K) || "null") || {}); } catch (e) { return blank(); } })();
    let timer = null, running = false, again = false;
    const keep = () => ls(K, JSON.stringify(st));
    function newKey() { const b = new Uint8Array(24); crypto.getRandomValues(b); return btoa(String.fromCharCode.apply(null, b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
    function dirty(p) { if (!st.key || p.demo) return; if (!st.dirty.includes(p.id)) st.dirty.push(p.id); keep(); schedule(); }
    function tomb(id) { if (!st.key || /^demo-/.test(id)) return; st.dirty = st.dirty.filter(x => x !== id); if (!st.tomb.includes(id)) st.tomb.push(id); keep(); schedule(); }
    function schedule(ms) { clearTimeout(timer); timer = setTimeout(run, ms == null ? 1500 : ms); }
    async function rpc(changes) {
      const r = await fetch(SB_URL + "/rest/v1/rpc/cercle_sync", {
        method: "POST", headers: { apikey: SB_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ p_key: st.key, p_since: st.since, p_changes: changes })
      });
      if (!r.ok) throw new Error(r.status >= 500 ? "serveur indisponible" : "requête refusée (" + r.status + ")");
      return r.json();
    }
    async function run() {
      if (!st.key) return;
      if (running) { again = true; return; }
      if (navigator.onLine === false) { st.err = "hors ligne"; keep(); paint(); return; }
      running = true; paint("Synchronisation…");
      try {
        const sentD = st.dirty.slice(), sentT = st.tomb.slice();
        const stamp = new Map(sentD.map(id => [id, (people.find(p => p.id === id) || {}).updatedAt]));
        const changes = sentD.map(id => people.find(p => p.id === id)).filter(Boolean)
          .map(p => ({ id: p.id, data: p, updated_at: p.updatedAt || new Date().toISOString(), deleted: false }))
          .concat(sentT.map(id => ({ id, data: {}, updated_at: new Date().toISOString(), deleted: true })));
        let res = null;
        for (let i = 0; i < Math.max(1, changes.length); i += 200) res = await rpc(changes.slice(i, i + 200));
        let changed = false;
        (res.rows || []).forEach(r => {
          const i = people.findIndex(x => x.id === r.id);
          if (r.deleted) { if (i >= 0 && !st.dirty.includes(r.id)) { people.splice(i, 1); changed = true; } return; }
          const local = i >= 0 ? people[i] : null;
          if (!local || Date.parse(local.updatedAt || 0) < Date.parse(r.updated_at)) {
            const d = Object.assign({}, r.data, { id: r.id, updatedAt: new Date(r.updated_at).toISOString() });
            if (i >= 0) people[i] = d; else people.push(d);
            changed = true;
          }
        });
        // keep ids edited again while the request was in flight
        st.dirty = st.dirty.filter(id => !stamp.has(id) || (people.find(p => p.id === id) || {}).updatedAt !== stamp.get(id));
        st.tomb = st.tomb.filter(id => !sentT.includes(id));
        st.since = new Date(Date.parse(res.now) - 5000).toISOString();
        st.at = new Date().toISOString(); st.err = null; keep();
        if (changed) { persist(); render(); }
      } catch (e) {
        st.err = e instanceof TypeError ? "pas de connexion" : (e && e.message) || "erreur réseau"; keep();
      } finally {
        running = false; paint();
        if (again) { again = false; schedule(300); }
      }
    }
    function paint(busy) {
      const el = $("#syncState"); if (!el) return;
      el.className = "src-st";
      if (!st.key) { el.textContent = "Désactivée : tes données restent sur cet appareil."; return; }
      if (busy) { el.textContent = busy; return; }
      if (st.err) { el.textContent = "Pas synchronisé (" + st.err + "). Nouvel essai automatique."; el.className = "src-st bad"; return; }
      const pending = st.dirty.length + st.tomb.length;
      el.textContent = st.at ? "Synchronisé " + agoTime(st.at) + (pending ? " · " + pending + " en attente" : "") : "Activée";
      el.className = "src-st good";
    }
    function purgeDemo() { const had = people.some(p => p.demo); people = people.filter(p => !p.demo); if (had) persist(); }
    function enable() { purgeDemo(); st = blank(); st.key = newKey(); st.dirty = people.map(p => p.id); keep(); render(); run(); return st.key; }
    function join(key) {
      key = String(key || "").trim().replace(/^.*#k=/, "");
      if (!/^[A-Za-z0-9_-]{24,128}$/.test(key)) return false;
      purgeDemo(); st = blank(); st.key = key; st.dirty = people.map(p => p.id); keep(); render(); run(); return true;
    }
    function disable() { st = blank(); keep(); paint(); }
    function start() {
      paint();
      if (st.key) run();
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") schedule(200); });
      window.addEventListener("online", () => schedule(200));
      setInterval(() => { if (document.visibilityState === "visible") run(); }, 5 * 60 * 1000);
    }
    return { dirty, tomb, run, start, enable, join, disable, paint, key: () => st.key, schedule };
  })();
  function agoTime(isoStr) {
    const s = Math.round((Date.now() - Date.parse(isoStr)) / 1000);
    if (s < 60) return "à l'instant"; if (s < 3600) return "il y a " + Math.round(s / 60) + " min";
    if (s < 86400) return "il y a " + Math.round(s / 3600) + " h"; return ago(Math.round(s / 86400));
  }
  function pairLink(key) { return PWA_URL + "#k=" + key; }
  function paintSyncSheet() {
    const key = Sync.key();
    $("#syOff").hidden = !!key; $("#syOn").hidden = !key;
    if (!key) return;
    $("#syKey").value = key;
    try {
      const q = qrcode(0, "M"); q.addData(pairLink(key)); q.make();
      $("#syQr").innerHTML = q.createSvgTag({ cellSize: 5, margin: 2, scalable: true });
    } catch (e) { $("#syQr").textContent = ""; }
    $("#syLink").textContent = pairLink(key);
    $("#syMcpUrl").value = SB_URL + "/functions/v1/cercle-mcp?key=" + key;
  }
  $("#btnSync").addEventListener("click", () => { paintSyncSheet(); $("#syErr").hidden = true; $("#syJoinKey").value = ""; open("#ovSync"); });
  $("#btnSyCreate").addEventListener("click", () => { Sync.enable(); paintSyncSheet(); toast("Synchronisation activée"); });
  $("#btnSyJoin").addEventListener("click", () => {
    if (Sync.join($("#syJoinKey").value)) { paintSyncSheet(); toast("Appareil relié. Récupération de ton cercle…"); }
    else { $("#syErr").textContent = "Ce code n'est pas valide. Copie-le en entier depuis ton autre appareil."; $("#syErr").hidden = false; }
  });
  $("#btnSyCopy").addEventListener("click", async () => {
    const ta = $("#syKey");
    try { await navigator.clipboard.writeText(ta.value); toast("Code copié"); } catch (e) { ta.focus(); ta.select(); toast("Code sélectionné : copie-le"); }
  });
  $("#btnSyNow").addEventListener("click", () => { Sync.run(); });
  $("#btnSyMcpCopy").addEventListener("click", async () => {
    const ta = $("#syMcpUrl");
    try { await navigator.clipboard.writeText(ta.value); toast("Adresse copiée"); } catch (e) { ta.focus(); ta.select(); toast("Adresse sélectionnée : copie-la"); }
  });
  let syOffArmed = false;
  $("#btnSyOff").addEventListener("click", () => {
    if (!syOffArmed) { syOffArmed = true; $("#btnSyOff").textContent = "Confirmer la désactivation"; return; }
    syOffArmed = false; $("#btnSyOff").textContent = "Désactiver sur cet appareil";
    Sync.disable(); paintSyncSheet(); toast("Synchronisation désactivée sur cet appareil");
  });
  function joinFromLink() {
    const m = /^#k=([A-Za-z0-9_-]{24,128})$/.exec(location.hash || "");
    if (!m) return;
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
    if (Sync.key() === m[1]) return;
    $("#jnKey").value = m[1]; open("#ovJoin");
  }
  $("#btnJoinGo").addEventListener("click", () => { Sync.join($("#jnKey").value); close($("#ovJoin")); toast("Appareil relié. Récupération de ton cercle…"); });

  // ---------- install (PWA) ----------
  let installEvt = null;
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  function installStart() {
    if (isNative) return;
    if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
    window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installEvt = e; $("#btnInstall").hidden = false; });
    window.addEventListener("appinstalled", () => { $("#btnInstall").hidden = true; toast("Cercle est installé"); });
    if (isIOS && !standalone() && ls("cercle-ios-hint") !== "off") $("#iosBanner").hidden = false;
  }
  $("#btnInstall").addEventListener("click", async () => { if (!installEvt) return; installEvt.prompt(); try { await installEvt.userChoice; } catch (e) {} installEvt = null; $("#btnInstall").hidden = true; });
  $("#btnIosHide").addEventListener("click", () => { ls("cercle-ios-hint", "off"); $("#iosBanner").hidden = true; });

  // ---------- Android app: automatic tracking ----------
  const CAP = window.Capacitor;
  const isNative = !!(CAP && CAP.isNativePlatform && CAP.isNativePlatform());
  const plug = n => (isNative && CAP.Plugins && CAP.Plugins[n]) || null;
  const CN = plug("CercleNative"), LN = plug("LocalNotifications"), APP = plug("App");
  const APK_URL = "https://github.com/Nooreyni/cercle/releases/latest";
  const NKEY = "cercle-native";
  let nat = (() => { try { return JSON.parse(ls(NKEY) || "null") || {}; } catch (e) { return {}; } })();
  const saveNat = () => ls(NKEY, JSON.stringify(nat));
  let natBusy = false;
  const hasPicker = !isNative && "contacts" in navigator && "ContactsManager" in window;

  async function enableNative(kind) {
    if (!CN) return;
    try {
      if (kind === "calls") {
        const r = await CN.requestPermissions({ permissions: ["calls", "sms"] });
        nat.calls = r.calls === "granted"; nat.sms = r.sms === "granted";
        if (!nat.calls && !nat.sms) toast("Accès refusé. Tu peux l'autoriser dans Réglages Android › Applis › Cercle › Autorisations.");
      } else if (kind === "calendar") {
        const r = await CN.requestPermissions({ permissions: ["calendar"] });
        nat.cal = r.calendar === "granted";
        if (!nat.cal) toast("Accès à l'agenda refusé.");
      } else if (kind === "wa") {
        const s = await CN.isNotificationAccessEnabled();
        if (s.enabled) nat.wa = true;
        else { nat.waAsked = true; saveNat(); toast("Active « Cercle » dans la liste, puis reviens dans l'app."); await CN.openNotificationAccessSettings(); return; }
      } else if (kind === "notif") {
        const r = await LN.requestPermissions();
        nat.notif = r.display === "granted";
        if (!nat.notif) toast("Notifications refusées.");
      }
      saveNat(); renderSources(); nativeSync(true);
    } catch (e) { toast("Action impossible : " + ((e && e.message) || e)); }
  }

  async function nativeSync(manual) {
    if (!CN || natBusy) return;
    natBusy = true;
    const ch = new Map(), since = Date.now() - 180 * 864e5, cutoff = Date.now() - 90 * 864e5;
    try {
      try { const s = await CN.isNotificationAccessEnabled(); if (s.enabled || nat.wa) { nat.wa = !!s.enabled; } if (s.enabled) nat.waAsked = false; } catch (e) {}
      if (nat.calls || nat.sms) {
        const agg = new Map();
        const add = (num, name, ts, kind) => {
          const k = normPhone(num); if (!k || !ts) return;
          const r = agg.get(k) || { raw: num, name: "", dates: [], calls: 0, sms: 0 };
          if (name) r.name = name; r.dates.push(new Date(ts)); kind === "call" ? r.calls++ : r.sms++; agg.set(k, r);
        };
        if (nat.calls) { try { const r = await CN.getCallLog({ since }); (r.items || []).forEach(c => { if ((c.type === 1 || c.type === 2) && c.duration > 0) add(c.number, c.name, c.date, "call"); }); } catch (e) { nat.calls = false; } }
        if (nat.sms) { try { const r = await CN.getSms({ since }); (r.items || []).forEach(s => add(s.address, "", s.date, "sms")); } catch (e) { nat.sms = false; } }
        const pi = phoneIndex(), unknown = [];
        agg.forEach((r, k) => {
          const p = pi.get(k) || (r.name ? findByName(r.name) : null);
          const recent = r.dates.filter(d => d.getTime() >= cutoff).length;
          if (p) addChange(ch, p, "phone", r.dates, recent);
          else if (recent >= 3) unknown.push({ kind: "phone", raw: r.raw, name: r.name, recent, dates: r.dates.map(d => d.getTime()) });
        });
        nat.unknownPhone = unknown.sort((a, b) => b.recent - a.recent).slice(0, 30);
      }
      if (nat.cal) {
        try {
          const r = await CN.getCalendarEvents({ from: Date.now() - 365 * 864e5, to: Date.now() + 90 * 864e5 });
          applyCalendar(ch, (r.items || []).map(e => ({ summary: e.title || "", start: { dateTime: new Date(e.begin).toISOString() }, attendees: (e.attendees || []).map(a => ({ email: a })) })));
        } catch (e) { nat.cal = false; }
      }
      if (nat.wa) {
        const r = await CN.getWhatsApp({ since });
        const by = new Map();
        (r.items || []).forEach(x => { const a = by.get(x.name) || []; a.push(new Date(x.ts)); by.set(x.name, a); });
        const un = [];
        by.forEach((dates, name) => {
          const p = findByName(name), recent = dates.filter(d => d.getTime() >= cutoff).length;
          if (p) addChange(ch, p, "whatsapp", dates, recent);
          else if (dates.length >= 2) un.push({ kind: "wa", name, recent, dates: dates.map(d => d.getTime()) });
        });
        nat.unknownWa = un.sort((a, b) => b.recent - a.recent).slice(0, 30);
      }
      nat.at = new Date().toISOString(); saveNat();
      const n = await commit(ch);
      if (manual) toast(n ? n + " personne(s) mise(s) à jour" : "Tout est à jour");
    } catch (e) { if (manual) toast("Suivi automatique : " + ((e && e.message) || e)); }
    finally { natBusy = false; saveNat(); renderSources(); scheduleReminders(); }
  }

  async function scheduleReminders() {
    if (!LN || !nat.notif) return;
    try {
      const pend = await LN.getPending();
      if (pend && pend.notifications && pend.notifications.length) await LN.cancel({ notifications: pend.notifications.map(n => ({ id: n.id })) });
      const all = people.filter(p => !p.demo).map(p => ({ p, h: health(p) }));
      const list = pickWeek(all), notes = [], now = new Date();
      if (list.length) {
        const body = "Prends des nouvelles de " + list.slice(0, 3).map(x => x.p.name).join(", ") + (list.length > 3 ? "…" : ".");
        [0, 3, 6].forEach((plus, i) => {
          const at = new Date(); at.setHours(18, 30, 0, 0); at.setDate(at.getDate() + plus); if (at <= now) at.setDate(at.getDate() + 1);
          notes.push({ id: 1 + i, title: "Cercle", body, schedule: { at, allowWhileIdle: true } });
        });
      }
      all.forEach(({ p, h }, i) => {
        if (!h.bday || h.bday.in > 30) return;
        const d = new Date(h.bday.date); d.setHours(9, 0, 0, 0);
        if (d > now) notes.push({ id: 100 + i, title: "Anniversaire de " + p.name, body: h.bday.age ? p.name + " a " + h.bday.age + " ans aujourd'hui." : "C'est aujourd'hui. Un petit message ?", schedule: { at: d, allowWhileIdle: true } });
      });
      if (notes.length) await LN.schedule({ notifications: notes });
    } catch (e) {}
  }

  async function readNativeContacts() {
    $("#ctInfo").textContent = "Lecture des contacts…";
    try {
      let raw = [];
      if (CN) { const r = await CN.getContacts(); raw = (r.items || []).map(c => ({ name: c.name, phones: c.phones || [], emails: (c.emails || []).map(e => e.toLowerCase()), bday: c.bday ? parseBday(c.bday) : null })); }
      else if (hasPicker) {
        const sel = await navigator.contacts.select(["name", "tel", "email"], { multiple: true });
        raw = sel.map(c => ({ name: (c.name && c.name[0]) || (c.tel && c.tel[0]) || "", phones: c.tel || [], emails: (c.email || []).map(e => e.toLowerCase()), bday: null })).filter(c => c.name);
      }
      showContactItems(raw);
      if (hasPicker) ctItems.forEach(o => { if (!o.dup) o.on = true; });
      renderCt();
    } catch (e) { $("#ctInfo").textContent = "Accès aux contacts refusé ou annulé. Tu peux aussi importer un fichier."; }
  }
  $("#btnContacts").addEventListener("click", () => {
    $("#ctNativeRow").hidden = !(CN || hasPicker);
    $("#btnCtNative").textContent = CN ? "Lire les contacts du téléphone" : "Choisir dans mes contacts";
    if (CN) { $("#ctHow").open = false; readNativeContacts(); }
  });
  $("#btnCtNative").addEventListener("click", readNativeContacts);

  // suggestions: people you often exchange with who are not in the circle yet
  let sgItems = [];
  function openSuggest() {
    sgItems = (nat.unknownPhone || []).concat(nat.unknownWa || []).map((x, i) => Object.assign({ k: i, on: false, circle: "amis" }, x));
    $("#sgList").innerHTML = sgItems.map(o => `<li><input type="checkbox" data-k="${o.k}" aria-label="Ajouter ${esc(o.name || o.raw)}">
      <div style="min-width:0"><div class="nm2">${esc(o.name || o.raw)}</div><div class="meta">${o.kind === "wa" ? o.recent + " échange(s) WhatsApp" : o.recent + " appel(s) ou SMS"} sur 90 jours</div></div>
      <select data-k="${o.k}" aria-label="Cercle">${circleOptions("amis")}</select></li>`).join("") || `<li class="empty">Aucune suggestion pour l'instant.</li>`;
    $("#btnSgGo").disabled = true; open("#ovSuggest");
  }
  $("#sgList").addEventListener("change", e => {
    const o = sgItems[+e.target.dataset.k]; if (!o) return;
    if (e.target.type === "checkbox") o.on = e.target.checked; else o.circle = e.target.value;
    $("#btnSgGo").disabled = !sgItems.some(x => x.on);
  });
  $("#btnSgGo").addEventListener("click", async () => {
    const ch = new Map(), cutoff = Date.now() - 90 * 864e5; let n = 0;
    for (const o of sgItems.filter(x => x.on)) {
      const np = { name: o.name || o.raw, circle: o.circle, freq: DEFAULT_FREQ[o.circle] || 60, phones: o.kind === "phone" ? [o.raw] : [], emails: [], asks: [], log: [], notes: "", createdAt: new Date().toISOString() };
      const id = await save(np); const p = people.find(x => x.id === id);
      const dates = o.dates.map(t => new Date(t));
      addChange(ch, p, o.kind === "wa" ? "whatsapp" : "phone", dates, dates.filter(d => d.getTime() >= cutoff).length);
      n++;
    }
    await commit(ch);
    const added = new Set(sgItems.filter(x => x.on).map(x => x.kind + "|" + (x.name || x.raw)));
    nat.unknownPhone = (nat.unknownPhone || []).filter(x => !added.has("phone|" + (x.name || x.raw)));
    nat.unknownWa = (nat.unknownWa || []).filter(x => !added.has("wa|" + x.name));
    saveNat(); renderSources(); close($("#ovSuggest")); toast(n + " personne(s) ajoutée(s)");
  });

  function renderSources() {
    const el = $("#srcList"); if (!el) return;
    const row = (ic, title, st, cls, btn) => `<li><span class="src-ic">${ic}</span><div><b>${title}</b><div class="src-st ${cls || ""}">${esc(st)}</div></div>${btn || "<span></span>"}</li>`;
    const b = (act, label) => `<button type="button" data-src="${act}">${label}</button>`;
    const rows = [];
    if (CN) {
      const on = x => x ? "good" : "";
      rows.push(row("C", "Contacts du téléphone", "Choisis qui ajouter à ton cercle", "", b("contacts", "Importer")));
      rows.push(row("T", "Appels et SMS", nat.calls || nat.sms ? "Suivi automatique actif" : "Désactivé", on(nat.calls || nat.sms), nat.calls || nat.sms ? "" : b("calls", "Activer")));
      rows.push(row("A", "Agenda du téléphone", nat.cal ? "Rendez-vous reconnus automatiquement" : "Désactivé", on(nat.cal), nat.cal ? "" : b("calendar", "Activer")));
      rows.push(row("W", "WhatsApp", nat.wa ? "Messages reçus détectés automatiquement" : "Désactivé", on(nat.wa), nat.wa ? "" : b("wa", "Activer")));
      rows.push(row("R", "Rappels", nat.notif ? "Tous les 3 jours à 18 h 30, et les anniversaires" : "Désactivés", on(nat.notif), nat.notif ? "" : b("notif", "Activer")));
      const sug = (nat.unknownPhone || []).length + (nat.unknownWa || []).length;
      if (sug) rows.push(row("+", sug + " personne" + (sug > 1 ? "s" : "") + " à qui tu parles souvent", "Pas encore dans ton cercle", "", b("suggest", "Voir")));
    } else {
      rows.push(row("W", "WhatsApp", ls("cercle-wa-at") ? "Dernier import " + agoTime(ls("cercle-wa-at")) : "Import des discussions exportées", "", b("waFile", "Importer")));
      rows.push(row("T", "Appels et SMS", ls("cercle-ph-at") ? "Dernier import " + agoTime(ls("cercle-ph-at")) : "Android, via une sauvegarde", "", b("phoneFile", "Importer")));
      if (!isIOS) rows.push(row("A", "Appli Android", "Suivi automatique des appels, SMS, WhatsApp et de l'agenda", "", `<a class="btn" href="${APK_URL}" target="_blank" rel="noopener">Télécharger</a>`));
    }
    el.innerHTML = rows.join("");
    $("#srcNote").textContent = (CN && nat.at ? "Dernière analyse " + agoTime(nat.at) + ". " : "") + "Seules les dates des échanges sont gardées, jamais le contenu des messages.";
  }
  $("#srcList").addEventListener("click", e => {
    const b = e.target.closest("[data-src]"); if (!b) return;
    const a = b.dataset.src;
    if (a === "contacts") $("#btnContacts").click();
    else if (a === "waFile") $("#btnWA").click();
    else if (a === "phoneFile") $("#btnPhone").click();
    else if (a === "suggest") openSuggest();
    else enableNative(a);
  });

  // ---------- assistant IA (engines in ai.js, context from core.js) ----------
  const AI_HELP = {
    off: "",
    claude: "<ol><li>Crée une clé sur <b>console.anthropic.com</b> › API Keys (paiement à l'usage).</li><li>Colle-la ici. Elle reste sur cet appareil et n'est jamais synchronisée.</li><li>Ordre de grandeur, d'après les tarifs publics : 1 à 2 centimes par demande avec Opus, nettement moins avec Haiku.</li></ol>",
    local: "<ol><li><b>Ollama</b> : installe-le depuis ollama.com, puis lance <code>ollama pull qwen3</code> (ou un autre modèle).</li><li>Autorise Cercle : définis la variable <code>OLLAMA_ORIGINS=*</code> puis redémarre Ollama.</li><li><b>LM Studio</b> : onglet Developer › Start server, coche « Enable CORS ».</li><li>Depuis ton téléphone (app Android) : lance le serveur avec <code>OLLAMA_HOST=0.0.0.0</code> (ou « Serve on local network » dans LM Studio) et mets l'adresse de l'ordinateur, par exemple <code>http://192.168.1.20:11434/v1</code>. La version web sur iPhone ne peut pas joindre un autre appareil en http.</li></ol>",
    openai: "<ol><li>Tout service compatible avec l'API OpenAI fonctionne : OpenRouter (<code>https://openrouter.ai/api/v1</code>), Mistral (<code>https://api.mistral.ai/v1</code>)…</li><li>Colle l'adresse, ta clé et le nom exact du modèle.</li></ol>",
    chrome: "<ol><li>Chrome sait faire tourner un petit modèle directement sur l'appareil (selon la version et le matériel).</li><li>La première utilisation peut télécharger le modèle. Ensuite, tout reste hors ligne.</li></ol>"
  };
  const AI_PRIVACY = {
    off: "",
    claude: "Pour chaque demande, la fiche de la personne concernée (sans téléphone ni e-mail) est envoyée à Anthropic.",
    local: "Tout reste chez toi : la demande ne quitte pas ton ordinateur ou ton réseau local.",
    openai: "Pour chaque demande, la fiche de la personne concernée (sans téléphone ni e-mail) est envoyée au service choisi.",
    chrome: "Tout reste sur cet appareil."
  };
  let aiCfg = { provider: "off" };
  function paintAI() {
    const el = $("#aiState"); if (!el) return;
    el.textContent = Assistant.label(); el.className = "src-st" + (Assistant.ready() ? " good" : "");
  }
  $("#aiModelClaude").innerHTML = CLAUDE_MODELS.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join("");
  $("#aiPresets").innerHTML = LOCAL_PRESETS.map(([v, l]) => `<button type="button" data-base="${esc(v)}">${esc(l)}</button>`).join("");
  function readAiForm() {
    const c = { provider: aiCfg.provider };
    if (c.provider === "claude") { c.key = $("#aiKey").value.trim(); c.model = $("#aiModelClaude").value; }
    if (c.provider === "local" || c.provider === "openai") { c.key = $("#aiKey").value.trim(); c.base = $("#aiBase").value.trim(); c.model = $("#aiModel").value.trim(); }
    return c;
  }
  function paintAiCfg() {
    const p = aiCfg.provider || "off";
    $$("#aiProv button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.p === p)));
    $$("#ovAiCfg [data-for]").forEach(f => { f.hidden = !f.dataset.for.split(" ").includes(p); });
    $("#aiKeyLabel").textContent = p === "local" ? "Clé API (facultative)" : "Clé API";
    $("#aiKeyHint").textContent = p === "claude" ? "Commence par sk-ant-…" : p === "local" ? "Laisse vide pour Ollama et LM Studio." : "";
    $("#aiBase").placeholder = p === "local" ? "http://localhost:11434/v1" : "https://openrouter.ai/api/v1";
    $("#aiPresets").hidden = p !== "local";
    $("#aiHelpBody").innerHTML = AI_HELP[p] || "";
    $("#aiHelp").hidden = !AI_HELP[p];
    $("#aiPrivacy").textContent = AI_PRIVACY[p] || "";
    $("#aiPrivacy").hidden = !AI_PRIVACY[p];
  }
  function openAiCfg() {
    aiCfg = Object.assign({ provider: "off" }, Assistant.settings());
    $("#aiProvChrome").hidden = !Assistant.hasChromeAI();
    $("#aiKey").value = aiCfg.key || "";
    $("#aiModelClaude").value = aiCfg.provider === "claude" && aiCfg.model ? aiCfg.model : CLAUDE_MODELS[0][0];
    $("#aiBase").value = aiCfg.base || ""; $("#aiModel").value = aiCfg.provider !== "claude" ? (aiCfg.model || "") : "";
    $("#aiTestOut").textContent = "";
    paintAiCfg(); open("#ovAiCfg");
  }
  $("#btnAiCfg").addEventListener("click", openAiCfg);
  $("#aiProv").addEventListener("click", e => {
    const b = e.target.closest("[data-p]"); if (!b) return;
    const prev = aiCfg.provider; aiCfg = readAiForm(); aiCfg.provider = b.dataset.p;
    if (prev !== aiCfg.provider) { $("#aiKey").value = ""; if (aiCfg.provider === "local" && !$("#aiBase").value) $("#aiBase").value = LOCAL_PRESETS[0][0]; if (aiCfg.provider === "openai") $("#aiBase").value = ""; }
    $("#aiTestOut").textContent = ""; paintAiCfg();
  });
  $("#aiPresets").addEventListener("click", e => { const b = e.target.closest("[data-base]"); if (b) $("#aiBase").value = b.dataset.base; });
  $("#btnAiSave").addEventListener("click", () => { Assistant.save(readAiForm()); paintAI(); close($("#ovAiCfg")); toast(Assistant.ready() ? "Assistant prêt" : "Assistant désactivé"); });
  $("#btnAiTest").addEventListener("click", async () => {
    const prev = Assistant.settings(); Assistant.save(readAiForm());
    const out = $("#aiTestOut"); out.className = "busy small"; out.textContent = "Test en cours…";
    try { const r = await Assistant.run("Réponds seulement par le mot : OK"); out.className = "small src-st good"; out.textContent = "Ça marche. Réponse : " + String(r).slice(0, 60); }
    catch (e) { out.className = "small err"; out.textContent = (e && e.message) || "Échec du test."; Assistant.save(prev); }
  });

  function needAI() {
    if (Assistant.ready()) return false;
    openAiCfg(); toast("Choisis d'abord un moteur d'IA."); return true;
  }
  const aiErr = e => (e && e.message) || "L'assistant n'a pas pu répondre.";
  const brief = p => Core.personBrief(p);
  // Phone number in international form for wa.me, guessing the country from the device language.
  function intlPhone(raw) {
    let d = String(raw || "").replace(/[^\d+]/g, "");
    if (d.startsWith("+")) return d.slice(1);
    if (d.startsWith("00")) return d.slice(2);
    const cc = { BE: "32", FR: "33", CH: "41", LU: "352", CA: "1", SN: "221", MA: "212", CI: "225" }[(navigator.language.split("-")[1] || "").toUpperCase()];
    return cc && d.startsWith("0") ? cc + d.slice(1) : d;
  }
  let aoRerun = null;
  function aiOut(label, title) {
    $("#aoLabel").textContent = label; $("#aoTitle").textContent = title;
    $("#aoBody").innerHTML = `<p class="busy">L'IA réfléchit…</p>`; $("#aoEngine").textContent = Assistant.label();
    if ($("#ovAiOut").hidden) open("#ovAiOut");
  }
  async function aiMessages(id) {
    const p = people.find(x => x.id === id); if (!p || needAI()) return;
    aoRerun = () => aiMessages(id); $("#btnAoAgain").textContent = "Autres idées";
    aiOut("Idée de message", "Pour " + p.name);
    try {
      const r = await Assistant.messageIdeas(brief(p));
      const phone = (p.phones || [])[0];
      $("#aoBody").innerHTML = (r.ideas || []).slice(0, 4).map((x, i) => {
        const t = encodeURIComponent(x.text);
        return `<div class="idea"><span class="tone">${esc(x.tone)}</span><div>${esc(x.text)}</div><div class="row">
          <button type="button" data-copy="${i}">Copier</button>
          <a class="btn" target="_blank" rel="noopener" href="https://wa.me/${phone ? intlPhone(phone) : ""}?text=${t}">WhatsApp</a>
          ${phone ? `<a class="btn" href="sms:${esc(phone.replace(/\s/g, ""))}?&body=${t}">SMS</a>` : ""}</div></div>`;
      }).join("") || `<p class="muted">Aucune idée cette fois. Réessaie.</p>`;
      $("#aoBody").dataset.ideas = JSON.stringify((r.ideas || []).map(x => x.text));
    } catch (e) { $("#aoBody").innerHTML = `<p class="err">${esc(aiErr(e))}</p>`; }
  }
  async function aiPrep(id) {
    const p = people.find(x => x.id === id); if (!p || needAI()) return;
    aoRerun = () => aiPrep(id); $("#btnAoAgain").textContent = "Autres sujets";
    aiOut("Préparer l'appel", "Avec " + p.name);
    try {
      const r = await Assistant.callPrep(brief(p));
      $("#aoBody").innerHTML = `<ol class="topics">${(r.topics || []).map(x => `<li>${esc(x)}</li>`).join("")}</ol>` +
        (r.careful ? `<p class="tip"><b>À garder en tête</b>${esc(r.careful)}</p>` : "");
    } catch (e) { $("#aoBody").innerHTML = `<p class="err">${esc(aiErr(e))}</p>`; }
  }
  $("#btnAoAgain").addEventListener("click", () => { if (aoRerun) aoRerun(); });
  $("#aoBody").addEventListener("click", async e => {
    const b = e.target.closest("[data-copy]"); if (!b) return;
    const list = JSON.parse($("#aoBody").dataset.ideas || "[]"); const text = list[+b.dataset.copy] || "";
    try { await navigator.clipboard.writeText(text); toast("Message copié"); } catch (err) { toast("Copie impossible : sélectionne le texte à la main."); }
  });

  $("#btnAiTidy").addEventListener("click", async () => {
    if (!logP || needAI()) return;
    const raw = $("#logNote").value.trim();
    const info = $("#aiTidyInfo");
    if (!raw) { info.hidden = false; info.className = "muted small"; info.textContent = "Écris ou dicte d'abord tes notes en vrac, puis touche ce bouton."; return; }
    const b = $("#btnAiTidy"); b.disabled = true; info.hidden = false; info.className = "busy small"; info.textContent = "Mise en forme…";
    try {
      const r = await Assistant.tidyNote(raw, brief(logP));
      if (r.summary) $("#logNote").value = r.summary;
      (r.toAsk || []).forEach(q => { if (q && !newAsks.includes(q)) newAsks.push(q); }); paintNewAsks();
      logExtra = { facts: r.facts || [], birthday: r.birthday };
      const bits = [];
      if ((r.toAsk || []).length) bits.push((r.toAsk.length) + " question(s) ajoutée(s)");
      if ((r.facts || []).length) bits.push((r.facts.length) + " fait(s) à retenir seront ajoutés à sa fiche : " + r.facts.join(" ; "));
      if (r.birthday && r.birthday.day && r.birthday.month && !logP.bdMonth) bits.push("anniversaire repéré : " + r.birthday.day + " " + MONTHS[r.birthday.month - 1]);
      info.className = "muted small"; info.textContent = bits.length ? bits.join(". ") + ". Vérifie, puis enregistre." : "Notes mises en forme. Vérifie, puis enregistre.";
    } catch (e) { info.className = "err"; info.textContent = aiErr(e); }
    finally { b.disabled = false; }
  });

  $("#btnAiAsk").addEventListener("click", () => {
    if (needAI()) return;
    $("#askOut").hidden = true; $("#askInfo").textContent = Assistant.label(); open("#ovAsk");
  });
  $("#askChips").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; $("#askQ").value = b.textContent; $("#btnAskGo").click(); });
  $("#btnAskGo").addEventListener("click", async () => {
    const q = $("#askQ").value.trim(); if (!q) { $("#askQ").focus(); return; }
    const out = $("#askOut"), b = $("#btnAskGo");
    out.hidden = false; out.className = "ai-out busy"; out.textContent = "L'IA réfléchit…"; b.disabled = true;
    try { out.textContent = await Assistant.ask(q, Core.circleDigest(people)); out.className = "ai-out"; }
    catch (e) { out.className = "ai-out err"; out.textContent = aiErr(e); }
    finally { b.disabled = false; }
  });


  function nativeStart() {
    if (!isNative) return;
    document.documentElement.classList.add("native");
    if (APP) {
      APP.addListener("backButton", () => {
        const openOv = $$(".ov").filter(o => !o.hidden);
        if (openOv.length) close(openOv[openOv.length - 1]); else if (tab !== "today") showTab("today"); else APP.minimizeApp();
      });
      APP.addListener("resume", () => { render(); nativeSync(false); Sync.schedule(100); });
    }
    nativeSync(false);
  }


  renderFilters();
  setInterval(() => { if (mode !== "loading") render(); }, 3 * 3600 * 1000);
  boot();
})();
