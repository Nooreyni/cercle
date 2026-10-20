// Cercle MCP server logic, shared by the local stdio server (mcp/server.mjs)
// and the hosted one (supabase/functions/cercle-mcp). Transport-agnostic: hand it
// JSON-RPC messages, get JSON-RPC responses back.
//
// Data lives in the user's sync space and is reached only through the cercle_sync
// function with their pairing key (see supabase/schema.sql).

export const SUPABASE = {
  url: "https://pxayslaqnuhcbakuaimg.supabase.co",
  key: "sb_publishable_SEOEX91r98Fnjo1XDT3MXw_HP0oV5tn"
};
const PROTOCOLS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const INSTRUCTIONS = [
  "Cercle aide l'utilisateur à garder le lien avec ses proches : chaque personne a un rythme de contact souhaité,",
  "et Cercle repère qui s'éloigne, les anniversaires et les questions à poser.",
  "Commence par get_overview pour toute question générale. Quand l'utilisateur raconte un échange, enregistre-le avec log_contact.",
  "Dates au format AAAA-MM-JJ. Ne cite pas de numéro de téléphone ni d'e-mail sauf demande explicite."
].join(" ");

// ---------- storage through the pairing key ----------
export function rpcStore({ url, apiKey, key, fetchImpl = fetch }) {
  async function call(since, changes) {
    const r = await fetchImpl(url.replace(/\/+$/, "") + "/rest/v1/rpc/cercle_sync", {
      method: "POST",
      headers: { apikey: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ p_key: key, p_since: since, p_changes: changes })
    });
    if (!r.ok) throw new Error("Accès à Cercle refusé (" + r.status + "). Vérifie ton code de synchronisation.");
    return r.json();
  }
  return {
    async load() {
      const res = await call(null, []);
      return (res.rows || []).filter(r => !r.deleted)
        .map(r => Object.assign({}, r.data, { id: r.id, updatedAt: new Date(r.updated_at).toISOString() }));
    },
    async save(p) {
      // strictly newer than the version we read, or the server's last-writer-wins rule would drop it
      const now = new Date(Math.max(Date.now(), Date.parse(p.updatedAt || 0) + 1)).toISOString();
      const data = Object.assign({}, p, { updatedAt: now });
      await call(now, [{ id: data.id, data, updated_at: now, deleted: false }]);
      return data;
    }
  };
}

// ---------- tools ----------
const str = description => ({ type: "string", description });
const RO = { readOnlyHint: true, openWorldHint: false };
const RW = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };

function buildTools(core) {
  const { CIRCLES, TYPES, normName, findByName, personBrief, circleDigest, applyLog, newPerson, iso, today0, parseBday, splitList, uniq } = core;
  const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

  function resolve(people, name) {
    const p = findByName(people, name);
    if (p) return p;
    const n = normName(name);
    const close = people.filter(x => normName(x.name).includes(n) || n.includes(normName(x.name).split(" ")[0])).map(x => x.name);
    throw new Error(close.length
      ? `Plusieurs ou aucune personne ne correspond exactement à « ${name} ». Candidats : ${close.join(", ")}. Réessaie avec le nom complet.`
      : `Personne nommée « ${name} » dans le cercle. Utilise get_overview pour voir les noms, ou add_person pour l'ajouter.`);
  }
  function birthdayFields(text) {
    if (!text) return {};
    const b = parseBday(String(text).trim()) || (/^(\d{1,2})[\/.](\d{1,2})$/.test(String(text).trim())
      ? (([, d, m]) => ({ d: +d, m: +m, y: null }))(/^(\d{1,2})[\/.](\d{1,2})$/.exec(String(text).trim())) : null);
    if (!b || b.m < 1 || b.m > 12 || b.d < 1 || b.d > 31) throw new Error("Anniversaire illisible. Formats acceptés : JJ/MM, JJ/MM/AAAA ou AAAA-MM-JJ.");
    return { bdDay: b.d, bdMonth: b.m, bdYear: b.y || null };
  }
  const circleArg = { type: "string", enum: Object.keys(CIRCLES), description: "Cercle : " + Object.entries(CIRCLES).map(([k, v]) => k + " = " + v).join(", ") };

  return [
    {
      name: "get_overview",
      title: "Vue d'ensemble du cercle",
      description: "État de toutes les relations : qui recontacter cette semaine et pourquoi, anniversaires des 30 prochains jours, et pour chaque personne le statut, les jours depuis le dernier échange, le rythme souhaité et les questions en attente. À appeler en premier.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: RO,
      async handler(args, store) { return circleDigest(await store.load()); }
    },
    {
      name: "get_person",
      title: "Fiche d'une personne",
      description: "Fiche détaillée d'une personne : notes, questions à lui poser, derniers échanges, anniversaire, prochain rendez-vous, statut de la relation.",
      inputSchema: { type: "object", properties: { name: str("Prénom ou nom tel qu'enregistré. Un prénom unique suffit.") }, required: ["name"], additionalProperties: false },
      annotations: RO,
      async handler({ name }, store) { return personBrief(resolve(await store.load(), name), { history: 12 }); }
    },
    {
      name: "search",
      title: "Chercher dans le cercle",
      description: "Cherche un mot ou une expression dans les noms, notes, questions et historique des échanges. Utile pour « qui travaille chez… », « qui a des enfants », etc.",
      inputSchema: { type: "object", properties: { query: str("Texte à chercher") }, required: ["query"], additionalProperties: false },
      annotations: RO,
      async handler({ query }, store) {
        const q = normName(query); if (!q) throw new Error("Recherche vide.");
        const hits = [];
        for (const p of await store.load()) {
          const where = [];
          if (normName(p.name).includes(q)) where.push("nom");
          if (normName(p.notes).includes(q)) where.push("notes : " + p.notes);
          (p.asks || []).forEach(a => { if (normName(a).includes(q)) where.push("question : " + a); });
          (p.log || []).forEach(l => { if (normName(l.n).includes(q)) where.push("échange du " + l.d + " : " + l.n); });
          if (where.length) hits.push({ name: p.name, matches: where.slice(0, 5) });
        }
        return { query, results: hits };
      }
    },
    {
      name: "log_contact",
      title: "Noter un échange",
      description: "Enregistre un échange avec une personne (appel, message, rencontre, visio). La relation repart « en forme », les questions abordées sont retirées et celles à poser la prochaine fois sont ajoutées. Utilise-le dès que l'utilisateur raconte avoir parlé à quelqu'un.",
      inputSchema: {
        type: "object",
        properties: {
          name: str("Personne concernée"),
          type: { type: "string", enum: Object.keys(TYPES), description: "appel, message, vu (en vrai) ou visio" },
          note: str("Ce dont vous avez parlé, en une à trois phrases"),
          date: str("Date de l'échange, AAAA-MM-JJ. Par défaut aujourd'hui."),
          questions_covered: { type: "array", items: { type: "string" }, description: "Questions en attente qui ont été abordées (texte exact ou début)" },
          questions_next: { type: "array", items: { type: "string" }, description: "Questions à lui poser la prochaine fois" }
        },
        required: ["name", "type"], additionalProperties: false
      },
      annotations: RW,
      async handler(a, store) {
        const p = resolve(await store.load(), a.name);
        if (a.date && !ISO_RE.test(a.date)) throw new Error("Date attendue au format AAAA-MM-JJ.");
        const covered = (a.questions_covered || []).map(normName).filter(Boolean);
        const done = (p.asks || []).filter(q => covered.some(c => normName(q).includes(c) || c.includes(normName(q))));
        const saved = await store.save(applyLog(p, { d: a.date || iso(today0()), t: a.type, n: a.note || "", doneAsks: done, newAsks: a.questions_next || [] }));
        return { ok: true, person: personBrief(saved, { history: 3 }), removedQuestions: done };
      }
    },
    {
      name: "add_person",
      title: "Ajouter une personne",
      description: "Ajoute une personne au cercle avec un rythme de contact souhaité.",
      inputSchema: {
        type: "object",
        properties: {
          name: str("Prénom ou surnom"), circle: circleArg,
          rhythm_days: { type: "integer", minimum: 1, maximum: 730, description: "Tous les combien de jours prendre des nouvelles. Par défaut selon le cercle (famille 14, proches 30, amis 60, collègues 180)." },
          birthday: str("JJ/MM ou JJ/MM/AAAA"), notes: str("À retenir sur elle ou lui"), phone: str("Téléphone"), email: str("E-mail")
        },
        required: ["name"], additionalProperties: false
      },
      annotations: RW,
      async handler(a, store) {
        const people = await store.load();
        if (!String(a.name || "").trim()) throw new Error("Nom manquant.");
        if (people.some(p => normName(p.name) === normName(a.name))) throw new Error(`« ${a.name} » est déjà dans le cercle.`);
        const p = Object.assign(newPerson({ name: a.name, circle: a.circle, freq: a.rhythm_days, notes: a.notes,
          phones: a.phone ? [a.phone] : [], emails: a.email ? [a.email] : [] }), birthdayFields(a.birthday));
        p.id = "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
        return { ok: true, person: personBrief(await store.save(p)) };
      }
    },
    {
      name: "update_person",
      title: "Modifier une fiche",
      description: "Modifie la fiche d'une personne : ajouter une note, changer le rythme, le cercle, l'anniversaire, le nom, ajouter un téléphone ou un e-mail. Seuls les champs fournis changent.",
      inputSchema: {
        type: "object",
        properties: {
          name: str("Personne concernée"), new_name: str("Nouveau nom"), circle: circleArg,
          rhythm_days: { type: "integer", minimum: 1, maximum: 730 }, birthday: str("JJ/MM ou JJ/MM/AAAA"),
          add_note: str("Texte ajouté à la fin des notes"), phone: str("Téléphone à ajouter"), email: str("E-mail à ajouter")
        },
        required: ["name"], additionalProperties: false
      },
      annotations: RW,
      async handler(a, store) {
        const p = JSON.parse(JSON.stringify(resolve(await store.load(), a.name)));
        if (a.new_name) p.name = a.new_name.trim();
        if (a.circle && CIRCLES[a.circle]) p.circle = a.circle;
        if (a.rhythm_days) p.freq = a.rhythm_days;
        if (a.birthday) Object.assign(p, birthdayFields(a.birthday));
        if (a.add_note) p.notes = (p.notes ? p.notes.trim() + "\n" : "") + a.add_note.trim();
        if (a.phone) p.phones = uniq((p.phones || []).concat(splitList(a.phone)));
        if (a.email) p.emails = uniq((p.emails || []).concat(splitList(a.email).map(e => e.toLowerCase())));
        return { ok: true, person: personBrief(await store.save(p)) };
      }
    },
    {
      name: "add_question",
      title: "Ajouter une question à poser",
      description: "Ajoute une question à poser à quelqu'un la prochaine fois (elle s'affichera dans Cercle au bon moment).",
      inputSchema: { type: "object", properties: { name: str("Personne concernée"), question: str("La question") }, required: ["name", "question"], additionalProperties: false },
      annotations: RW,
      async handler({ name, question }, store) {
        const p = JSON.parse(JSON.stringify(resolve(await store.load(), name)));
        p.asks = (p.asks || []).concat(String(question).trim()).filter(Boolean);
        const saved = await store.save(p);
        return { ok: true, name: saved.name, toAsk: saved.asks };
      }
    },
    {
      name: "snooze_person",
      title: "Reporter une suggestion",
      description: "Retire temporairement une personne des suggestions de la semaine (par exemple si l'utilisateur la voit bientôt).",
      inputSchema: { type: "object", properties: { name: str("Personne concernée"), days: { type: "integer", minimum: 1, maximum: 90, description: "Nombre de jours, 7 par défaut" } }, required: ["name"], additionalProperties: false },
      annotations: RW,
      async handler({ name, days = 7 }, store) {
        const p = JSON.parse(JSON.stringify(resolve(await store.load(), name)));
        const d = today0(); d.setDate(d.getDate() + days); p.snoozeUntil = iso(d);
        await store.save(p);
        return { ok: true, name: p.name, hiddenUntil: p.snoozeUntil };
      }
    }
  ];
}

// ---------- JSON-RPC ----------
export function createServer({ core, getStore, name = "cercle", version = "1.0.0" }) {
  const tools = buildTools(core);
  const ok = (id, result) => ({ jsonrpc: "2.0", id, result });
  const fail = (id, code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });
  async function handle(msg, ctx = {}) {
    if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return msg && msg.id != null ? fail(msg.id, -32600, "Invalid Request") : null;
    const { id, method, params = {} } = msg;
    if (id === undefined || id === null) return null; // notification: nothing to answer
    switch (method) {
      case "initialize":
        return ok(id, {
          protocolVersion: PROTOCOLS.includes(params.protocolVersion) ? params.protocolVersion : PROTOCOLS[1],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name, title: "Cercle", version },
          instructions: INSTRUCTIONS
        });
      case "ping": return ok(id, {});
      case "tools/list": return ok(id, { tools: tools.map(({ handler, ...t }) => t) });
      case "tools/call": {
        const t = tools.find(x => x.name === params.name);
        if (!t) return fail(id, -32602, "Outil inconnu : " + params.name);
        try {
          const out = await t.handler(params.arguments || {}, await getStore(ctx));
          return ok(id, { content: [{ type: "text", text: JSON.stringify(out, null, 2) }], structuredContent: out });
        } catch (e) {
          return ok(id, { content: [{ type: "text", text: (e && e.message) || String(e) }], isError: true });
        }
      }
      default: return fail(id, -32601, "Méthode inconnue : " + method);
    }
  }
  return { handle, tools };
}
