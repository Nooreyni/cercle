# Cercle

Garder le lien avec ses proches : qui appeler cette semaine, quoi leur demander, les anniversaires à venir.
Chaque personne est une plante qui fleurit quand tu prends des nouvelles et fane quand le contact s'espace.

## Installer

| Appareil | Comment |
|---|---|
| **Android** (recommandé) | Télécharge `cercle.apk` dans la dernière [release](../../releases/latest), ouvre-le, autorise l'installation. |
| **iPhone** | Ouvre https://nooreyni.github.io/cercle/ dans Safari › Partager › « Sur l'écran d'accueil ». |
| **Ordinateur** | Ouvre https://nooreyni.github.io/cercle/ dans Chrome ou Edge › icône « Installer » dans la barre d'adresse. |

## Ce que fait chaque version

| | App Android | PWA (iPhone, ordinateur) |
|---|---|---|
| Suggestions de la semaine, jardin, anniversaires, fiches | ✅ | ✅ |
| Contacts | lecture directe du téléphone | fichier .vcf / CSV (ou sélecteur natif sur Chrome Android) |
| Appels et SMS | **automatique** | import d'une sauvegarde *SMS Backup & Restore* |
| WhatsApp | **automatique** (messages reçus, via les notifications) | import des discussions exportées |
| Agenda | **automatique** (agenda du téléphone) | – |
| Rappels | notification tous les 3 jours + anniversaires | – |
| Hors ligne | ✅ | ✅ |
| Synchronisation entre appareils | ✅ code secret | ✅ code secret |

Seules les **dates** des échanges sont gardées, jamais le contenu des messages.

## IA

| | Ce que ça fait | Où ça tourne |
|---|---|---|
| **Assistant dans l'app** | idées de messages, préparation d'appel, mise en forme d'une note dictée, questions libres sur ton cercle | au choix : Ollama / LM Studio (local), IA intégrée de Chrome (sur l'appareil), Claude (ta clé API), tout service compatible OpenAI |
| **Serveur MCP** | Claude, ChatGPT ou une IA locale lit ton cercle et y note tes échanges (« note que j'ai vu Karim ») | en ligne (`supabase/functions/cercle-mcp`) ou en local (`mcp/server.mjs`) |
| **Code lisible par les agents** | `AGENTS.md`, `docs/ARCHITECTURE.md`, logique isolée et testée dans `www/core.js` | – |

Mode d'emploi détaillé : [docs/IA.md](docs/IA.md).

## Android : premiers réglages

1. Dans « Suivi automatique », touche **Activer** sur chaque ligne et accepte les autorisations.
2. Pour WhatsApp, Android ouvre « Accès aux notifications » : active **Cercle**.
   Si le bouton est grisé (Android 13 et plus, app installée hors Play Store) :
   Réglages › Applis › Cercle › ⋮ › **Autoriser les paramètres restreints**, puis recommence.
3. Synchronisation › **Activer** pour retrouver ton cercle sur tes autres appareils.

## Synchronisation

Pas de compte : un code secret aléatoire relie tes appareils (QR code ou lien).
Les données transitent en HTTPS vers une base Supabase (Paris). La base ne connaît qu'une empreinte SHA-256 du code ;
la table n'est pas lisible directement, tout passe par la fonction `cercle_sync` (voir `supabase/schema.sql`).

## Développement

```bash
npm ci
npm test                   # logique, analyseurs, serveur MCP
npm run vendor             # copie polices et librairies dans www/, empaquette le SDK Claude
npx cap sync android       # copie www/ dans le projet Android
cd android && ./gradlew assembleRelease
```

Chaque push sur `main` publie la PWA (branche `gh-pages`) et l'APK (release GitHub) via `.github/workflows/build.yml`.

**Signature :** `android/app/cercle-release.jks` est versionné pour que chaque APK s'installe par-dessus le précédent.
Pour un usage perso c'est acceptable ; pour plus de sécurité, déplace-le dans un secret GitHub et change le mot de passe
(variable `CERCLE_KEYSTORE_PASSWORD`).
