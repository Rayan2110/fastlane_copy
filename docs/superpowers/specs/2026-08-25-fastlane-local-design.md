# Fastlane Local — Spec de conception (v1)

**Date :** 2026-08-25
**Statut :** Design validé par Rayan (démo de rendu approuvée le 2026-08-25)
**Objectif :** reproduire localement le cœur de usefastlane.ai pour le dropshipping : lien produit → vidéos marketing verticales en volume, à coût quasi nul.

## 1. Contexte et périmètre

Fastlane (49–149 $/mois) génère des vidéos TikTok/Reels/Shorts à partir d'un lien produit. Rayan veut l'équivalent sur son PC (i9-14900HX, RTX 4070 8 Go, 32 Go RAM, Windows 11).

**Décisions validées :**
- Formats : slideshows/démos produit (local, gratuit) **et** avatars UGC (API fal.ai à l'usage) — avatars livrés en v2.
- Interface : app web locale (Next.js), mais pipeline fonctionnel dès la semaine 1.
- Sources produit : boutiques Shopify de Rayan (extraction JSON native) + n'importe quelle URL produit (scraper générique + extraction Claude).
- Exclusions définitives : comptes « warmés », automatisation TikTok non officielle (risque de ban).
- Auto-posting : v3, YouTube Shorts d'abord (API officielle).

**Preuve de concept validée :** demo/ contient le prototype (extraction Shopify SILÈNE → voix edge-tts → rendu Remotion 1080×1920). Retour de Rayan : « ça me convainc, mais je veux plus qualitatif ensuite ».

## 2. Architecture

Monorepo Next.js (App Router) + projet Remotion embarqué. Tout tourne en local.

```
lien produit
   │
   ▼
[Extraction]  Shopify: /products/<handle>.json (fiable)
   │          Générique: fetch HTML → Claude extrait titre/prix/images/bénéfices
   ▼
[Scripts IA]  Claude (CLI headless `claude -p`, abonnement existant)
   │          → 10-30 variantes JSON : hook, scènes, texte écran, voix off, CTA
   ▼
[Assets]      Téléchargement images produit → public/media/<productId>/
   ▼
[Rendu]       Par script : edge-tts (voix FR + timings mots)
   │          → Remotion render (template Slideshow, props = script + timings)
   ▼
[Galerie]     SQLite : products / scripts / videos / jobs
              UI : liste produits, vidéos par produit, préview, téléchargement,
              statut « publié »
```

### Composants

| Module | Rôle | Dépend de |
|---|---|---|
| `lib/db.ts` | SQLite (better-sqlite3), tables products/scripts/videos/jobs | — |
| `lib/extract.ts` | URL → ProductData (stratégie Shopify JSON, fallback générique+Claude) | claude CLI |
| `lib/claude.ts` | wrapper `claude -p --output-format json` (génération scripts + extraction) | claude CLI |
| `lib/tts.ts` | texte → mp3 + timings mots (edge-tts `--write-subtitles`) | Python edge-tts |
| `lib/render.ts` | file de rendu (max 2 parallèles), spawn `remotion render` avec props | Remotion |
| `video/` | projet Remotion : template Slideshow (Ken Burns, captions karaoké, badge prix) | — |
| `app/` | UI : dashboard (input URL + produits), page produit (scripts + vidéos + jobs) | tout |

### Formats de données clés

**ProductData** : `{ title, price, compareAtPrice, currency, description, benefits[], images[], sourceUrl, vendor }`

**VideoScript** : `{ id, angle, hook, scenes: [{ imageIndex, screenText, voiceText }], cta }` — l'angle marketing (curiosité, problème/solution, preuve sociale, urgence…) varie entre les scripts.

**WordTiming** : `{ word, startMs, endMs }[]` — issu des subtitles edge-tts, passé à Remotion pour les captions karaoké et le calage des scènes sur la voix réelle.

## 3. Choix techniques et justifications

- **Claude via CLI headless** (`claude -p`) plutôt qu'une clé API : utilise l'abonnement Claude existant de Rayan, zéro coût marginal. Fallback prévu : variable `ANTHROPIC_API_KEY` si le CLI n'est pas dispo.
- **edge-tts** : gratuit, voix neuronales FR de qualité, fournit les word boundaries (indispensable pour les sous-titres karaoké). Déjà installé (`python -m edge_tts`).
- **Remotion** : templates = composants React, réutilisables sur tout produit, extensibles (nouveaux templates = nouveaux fichiers). Version épinglée 4.0.257 (licence gratuite pour usage individuel).
- **SQLite fichier** (`data/fastlane.db`) : zéro serveur, sauvegardable, suffisant mono-utilisateur.
- **Rendu** : `--concurrency` réglé sur ~moitié des 24 threads du i9 ; objectif ≤ 2 min par vidéo de 20 s. Les rendus tournent en arrière-plan via la file de jobs, l'UI se met à jour par polling.

## 4. Qualité vidéo v1 (retour démo intégré)

Au-delà de la démo : sous-titres karaoké mot-à-mot synchronisés sur la voix, scènes calées sur la durée réelle des phrases, musique de fond optionnelle (dossier `music/` fourni par l'utilisateur, mixée à -18 dB sous la voix), 2 variantes de style de template (clair/sombre) pour éviter l'uniformité.

## 5. Gestion des erreurs

- Extraction générique échouée → statut produit `extract_failed`, message clair dans l'UI, possibilité de coller les infos à la main.
- Sortie Claude non-JSON → 1 retry avec rappel du format, sinon job `failed` avec log.
- Rendu Remotion échoué → job `failed`, stderr conservé en base, bouton « relancer ».
- edge-tts hors ligne (service Microsoft) → erreur explicite ; pas de fallback voix v1.

## 6. Tests

- Unitaires (Vitest) : parsing Shopify JSON → ProductData ; parsing subtitles edge-tts → WordTiming[] ; validation/normalisation des VideoScript retournés par Claude ; découpage scènes/durées.
- Intégration manuelle de bout en bout : produit SILÈNE → ≥ 3 vidéos rendues visionnables.
- Les appels réseau (Shopify, edge-tts, claude) sont derrière des interfaces mockables.

## 7. Phasage

- **v1 (ce projet)** : pipeline complet slideshows + UI dashboard/galerie + jobs.
- **v2** : avatars UGC via fal.ai, templates supplémentaires, sous-titres stylés avancés, B-roll.
- **v3** : calendrier, publication YouTube Shorts (API officielle), export organisé pour posting manuel TikTok/IG.

## 8. Hors périmètre v1

Auth (app locale), multi-utilisateurs, avatars, auto-posting, musique générée, analytics.
