# Brancher une IA sur Cercle

Il y a deux façons d'utiliser l'IA avec Cercle. Les deux peuvent tourner **entièrement en local**.

## 1. L'assistant dans l'app

Cercle › **Assistant IA › Réglages**, puis choisis un moteur :

| Moteur | Où tournent les calculs | Ce qu'il faut |
|---|---|---|
| **IA locale** (Ollama, LM Studio) | ton ordinateur | Ollama : `ollama pull qwen3`, puis `OLLAMA_ORIGINS=*` et redémarrer. LM Studio : Developer › Start server + « Enable CORS ». |
| **IA de Chrome** | ton appareil | Chrome récent avec l'IA intégrée disponible (l'option n'apparaît que dans ce cas). |
| **Claude** | API Anthropic | Une clé de console.anthropic.com. Modèle par défaut : Claude Opus 5.5. |
| **Autre service** | le service choisi | Toute API compatible OpenAI (OpenRouter, Mistral…). |

Depuis l'**app Android**, tu peux viser l'IA locale de ton ordinateur sur le Wi-Fi de la maison :
lance Ollama avec `OLLAMA_HOST=0.0.0.0` (ou « Serve on local network » dans LM Studio), puis mets
`http://<adresse-de-l-ordinateur>:11434/v1` comme adresse. La PWA sur iPhone ne peut pas le faire :
un site https n'a pas le droit d'appeler un autre appareil en http.

Ce que fait l'assistant : idées de messages, préparation d'un appel, mise en forme d'une note dictée
(résumé, questions pour la prochaine fois, faits à retenir, anniversaire), questions libres sur ton cercle.
Les numéros de téléphone et les e-mails ne sont jamais envoyés.

## 2. Une IA qui pilote Cercle (MCP)

Prérequis : activer **Synchronisation** dans Cercle et copier ton code.

### En ligne : Claude, ChatGPT

Dans Cercle › Synchronisation › « Brancher une IA », copie l'adresse :

```
https://pxayslaqnuhcbakuaimg.supabase.co/functions/v1/cercle-mcp?key=TON_CODE
```

- **Claude** (web, bureau, mobile) : Paramètres › Connecteurs › Ajouter un connecteur personnalisé.
- **ChatGPT** : mode développeur des connecteurs › nouveau serveur MCP, sans authentification.

### En local : Claude Desktop, Claude Code, LM Studio, Cursor

Clone le dépôt, puis `npm ci`. Configuration type (Claude Desktop `claude_desktop_config.json`,
LM Studio `mcp.json`, Cursor `mcp.json`) :

```json
{
  "mcpServers": {
    "cercle": {
      "command": "node",
      "args": ["/chemin/vers/cercle/mcp/server.mjs"],
      "env": { "CERCLE_KEY": "TON_CODE" }
    }
  }
}
```

Claude Code : `claude mcp add cercle --env CERCLE_KEY=TON_CODE -- node /chemin/vers/cercle/mcp/server.mjs`

Avec **LM Studio + un modèle local + ce serveur**, tout reste chez toi, sauf la synchronisation chiffrée en transit avec la base.

### Ce que l'IA peut faire

| Outil | Exemple de demande |
|---|---|
| `get_overview` | « Qui dois-je appeler cette semaine ? » |
| `get_person` | « Rappelle-moi ce que je sais de Karim avant mon appel. » |
| `search` | « Qui dans mon cercle travaille dans la santé ? » |
| `log_contact` | « J'ai déjeuné avec Maman, elle part en Espagne en mai, demande-lui ses photos la prochaine fois. » |
| `add_person` | « Ajoute Nadia, une amie, je veux lui parler tous les mois, anniversaire le 3 juin. » |
| `update_person` | « Note que Julien se marie le 15 mai. » |
| `add_question` | « Pense à demander à Sofia comment dort Nour. » |
| `snooze_person` | « Ne me propose pas Thomas avant 2 semaines, je le vois au salon. » |

L'adresse et le code donnent accès à ton cercle : ne les partage qu'avec tes propres outils.
Pour couper l'accès, désactive la synchronisation sur tous tes appareils puis réactive-la : un nouveau code sera créé.
