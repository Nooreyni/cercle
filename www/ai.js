// Cercle assistant: one small interface over several AI engines.
//  - "claude": Anthropic API with the viewer's own key (official SDK, bundled in vendor/anthropic.js)
//  - "local":  any OpenAI-compatible server (Ollama, LM Studio, llama.cpp…), on this machine or the local network
//  - "openai": any other OpenAI-compatible cloud endpoint (OpenRouter, Mistral…)
//  - "chrome": Chrome's built-in on-device model, when the browser offers it
// Settings stay on this device and are never synced.

const KEY = "cercle-ai";
export const CLAUDE_MODELS = [
  ["claude-opus-5-5", "Claude Opus 5.5 (recommandé)"],
  ["claude-sonnet-5-5", "Claude Sonnet 5.5"],
  ["claude-haiku-5-5", "Claude Haiku 5.5 (le moins cher)"]
];
export const LOCAL_PRESETS = [
  ["http://localhost:11434/v1", "Ollama sur cet ordinateur"],
  ["http://localhost:1234/v1", "LM Studio sur cet ordinateur"]
];

const SYSTEM = [
  "Tu es l'assistant de Cercle, une app personnelle qui aide une personne à garder le lien avec ses proches.",
  "Tu réponds en français, simplement et chaleureusement, sans flatterie ni formules toutes faites.",
  "Tu t'appuies uniquement sur les informations fournies : n'invente jamais de faits sur les proches.",
  "Si une information manque, dis-le ou propose une formulation qui n'en dépend pas."
].join(" ");

export class AIError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

function load() {
  try { return JSON.parse(localStorage.getItem(KEY) || "null") || { provider: "off" }; } catch (e) { return { provider: "off" }; }
}

const isNative = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

// JSON out of a model that was asked for JSON but may wrap it in prose or a code fence.
function parseJSON(text) {
  try { return JSON.parse(text); } catch (e) { /* fall through */ }
  const m = /\{[\s\S]*\}/.exec(String(text || ""));
  if (m) { try { return JSON.parse(m[0]); } catch (e) { /* fall through */ } }
  throw new AIError("format", "La réponse de l'IA n'était pas lisible. Réessaie, ou choisis un modèle plus capable.");
}

async function claude(cfg, prompt, schema) {
  if (!cfg.key) throw new AIError("config", "Ajoute ta clé API Anthropic dans les réglages de l'assistant.");
  const { default: Anthropic } = await import("./vendor/anthropic.js");
  const client = new Anthropic({ apiKey: cfg.key, dangerouslyAllowBrowser: true, maxRetries: 1 });
  let res;
  try {
    res = await client.beta.messages.create({
      model: cfg.model || "claude-opus-5-5",
      max_tokens: 16000,
      system: SYSTEM,
      messages: [{ role: "user", content: prompt }],
      output_config: schema ? { effort: "low", format: { type: "json_schema", schema } } : { effort: "low" },
      // if the model declines for policy reasons, let the API retry on its default fallback model
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default"
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new AIError("auth", "Clé API refusée. Vérifie-la dans les réglages de l'assistant.");
    if (e instanceof Anthropic.PermissionDeniedError) throw new AIError("auth", "Cette clé n'a pas accès à ce modèle.");
    if (e instanceof Anthropic.NotFoundError) throw new AIError("config", "Modèle introuvable. Choisis-en un autre dans les réglages.");
    if (e instanceof Anthropic.RateLimitError) throw new AIError("busy", "Trop de demandes pour le moment. Réessaie dans une minute.");
    if (e instanceof Anthropic.APIConnectionError) throw new AIError("network", "Pas de connexion à l'API Claude.");
    if (e instanceof Anthropic.APIError) throw new AIError("api", "L'API Claude a renvoyé une erreur (" + (e.status || "?") + ").");
    throw e;
  }
  if (res.stop_reason === "refusal") throw new AIError("refusal", "L'IA a refusé cette demande.");
  const text = res.content.filter(b => b.type === "text").map(b => b.text).join("");
  return schema ? parseJSON(text) : text.trim();
}

// OpenAI-compatible chat endpoint (Ollama, LM Studio, OpenRouter, Mistral…).
async function compatible(cfg, prompt, schema) {
  const base = String(cfg.base || "").replace(/\/+$/, "");
  if (!base) throw new AIError("config", "Indique l'adresse du serveur dans les réglages de l'assistant.");
  if (!cfg.model) throw new AIError("config", "Indique le nom du modèle dans les réglages de l'assistant.");
  const body = {
    model: cfg.model, temperature: 0.5, stream: false,
    messages: [
      { role: "system", content: SYSTEM + (schema ? " Réponds uniquement avec un objet JSON valide qui respecte ce schéma : " + JSON.stringify(schema) : "") },
      { role: "user", content: prompt }
    ]
  };
  const headers = { "Content-Type": "application/json" };
  if (cfg.key) headers.Authorization = "Bearer " + cfg.key;
  let status, data;
  try {
    const Http = isNative() && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorHttp;
    if (Http) {
      // native HTTP: no CORS, and reaches a computer on the local network over plain http
      const r = await Http.request({ url: base + "/chat/completions", method: "POST", headers, data: body, connectTimeout: 15000, readTimeout: 180000 });
      status = r.status; data = typeof r.data === "string" ? JSON.parse(r.data) : r.data;
    } else {
      const r = await fetch(base + "/chat/completions", { method: "POST", headers, body: JSON.stringify(body) });
      status = r.status; data = await r.json().catch(() => null);
    }
  } catch (e) {
    throw new AIError("network", cfg.provider === "local"
      ? "Serveur local injoignable. Vérifie qu'Ollama ou LM Studio tourne, et qu'il accepte les requêtes de cette app (voir l'aide)."
      : "Serveur injoignable.");
  }
  if (status === 401 || status === 403) throw new AIError("auth", "Clé refusée par le serveur.");
  if (status === 404) throw new AIError("config", "Modèle ou adresse introuvable (404). Vérifie les réglages.");
  if (!status || status >= 400 || !data) throw new AIError("api", "Le serveur a renvoyé une erreur (" + (status || "?") + ").");
  const text = data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : "";
  return schema ? parseJSON(text) : String(text || "").trim();
}

async function chromeAI(cfg, prompt, schema) {
  const LM = window.LanguageModel;
  if (!LM) throw new AIError("config", "Ce navigateur n'a pas d'IA intégrée. Choisis un autre moteur.");
  const avail = await LM.availability();
  if (avail === "unavailable") throw new AIError("config", "L'IA intégrée de Chrome n'est pas disponible sur cet appareil.");
  const session = await LM.create({ initialPrompts: [{ role: "system", content: SYSTEM }] });
  try {
    const out = await session.prompt(prompt, schema ? { responseConstraint: schema } : undefined);
    return schema ? parseJSON(out) : String(out || "").trim();
  } finally { try { session.destroy(); } catch (e) { /* already closed */ } }
}

export const Assistant = {
  settings: load,
  save(cfg) { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) { /* storage full or blocked */ } },
  ready() { const c = load(); return c.provider && c.provider !== "off"; },
  hasChromeAI: () => typeof window !== "undefined" && "LanguageModel" in window,
  label() {
    const c = load();
    if (c.provider === "claude") return (CLAUDE_MODELS.find(m => m[0] === c.model) || [0, c.model || "Claude"])[1].replace(/ \(.*\)$/, "") + " · ta clé API";
    if (c.provider === "local") return (c.model || "modèle local") + " · sur ta machine";
    if (c.provider === "openai") return (c.model || "modèle") + " · " + String(c.base || "").replace(/^https?:\/\//, "").split("/")[0];
    if (c.provider === "chrome") return "IA intégrée de Chrome · sur cet appareil";
    return "Désactivé";
  },
  async run(prompt, schema) {
    const cfg = load();
    if (cfg.provider === "claude") return claude(cfg, prompt, schema);
    if (cfg.provider === "local" || cfg.provider === "openai") return compatible(cfg, prompt, schema);
    if (cfg.provider === "chrome") return chromeAI(cfg, prompt, schema);
    throw new AIError("off", "Active l'assistant IA dans ses réglages.");
  },

  // ---------- tasks ----------
  messageIdeas(brief) {
    return this.run(
      "Propose 3 messages courts (1 à 3 phrases) que je pourrais envoyer à cette personne pour reprendre contact, " +
      "sur WhatsApp ou par SMS. Varie le ton (léger, attentionné, concret avec une proposition de se voir ou s'appeler). " +
      "Appuie-toi sur ce qu'on sait d'elle et sur les questions que je voulais lui poser. Tutoie-la sauf si les notes indiquent le contraire.\n\n" +
      "Personne :\n" + JSON.stringify(brief, null, 1),
      { type: "object", properties: { ideas: { type: "array", items: { type: "object", properties: { tone: { type: "string" }, text: { type: "string" } }, required: ["tone", "text"], additionalProperties: false } } }, required: ["ideas"], additionalProperties: false }
    );
  },
  callPrep(brief) {
    return this.run(
      "Je vais appeler ou voir cette personne. Donne-moi 3 à 5 sujets ou questions précis pour la conversation, " +
      "tirés de ses notes, de nos derniers échanges et de ce que je voulais lui demander, puis un rappel éventuel de ce qu'il vaut mieux éviter. " +
      "Chaque sujet tient en une phrase.\n\nPersonne :\n" + JSON.stringify(brief, null, 1),
      { type: "object", properties: { topics: { type: "array", items: { type: "string" } }, careful: { type: "string" } }, required: ["topics", "careful"], additionalProperties: false }
    );
  },
  tidyNote(raw, brief) {
    return this.run(
      "Voici mes notes brutes (souvent dictées) après un échange avec cette personne. " +
      "Rends : un résumé clair en 1 à 3 phrases ; les questions à lui poser la prochaine fois ; " +
      "les faits durables à retenir sur elle (prénoms, projets, santé, travail…) qui ne figurent pas déjà dans ses notes ; " +
      "et sa date d'anniversaire seulement si elle est mentionnée explicitement (sinon 0).\n\n" +
      "Notes brutes :\n" + raw + "\n\nPersonne :\n" + JSON.stringify(brief, null, 1),
      {
        type: "object",
        properties: {
          summary: { type: "string" }, toAsk: { type: "array", items: { type: "string" } }, facts: { type: "array", items: { type: "string" } },
          birthday: { type: "object", properties: { day: { type: "integer" }, month: { type: "integer" }, year: { type: "integer" } }, required: ["day", "month", "year"], additionalProperties: false }
        },
        required: ["summary", "toAsk", "facts", "birthday"], additionalProperties: false
      }
    );
  },
  ask(question, digest) {
    return this.run(
      "Voici l'état de mon cercle de proches (aujourd'hui, statut de chaque relation, anniversaires). " +
      "Réponds à ma question en t'appuyant dessus, en 120 mots maximum, avec des noms concrets.\n\n" +
      "Mon cercle :\n" + JSON.stringify(digest) + "\n\nMa question : " + question
    );
  }
};
