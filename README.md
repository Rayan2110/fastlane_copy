# Fastlane Local

Ton usine à vidéos marketing pour le dropshipping, en local sur ton PC.
Colle un lien produit → Claude écrit des scripts avec des angles marketing
variés → l'app génère des vidéos verticales (voix off française + sous-titres
karaoké) prêtes à poster sur TikTok, Reels et Shorts.

## Démarrer

Double-clique sur **`start-fastlane.bat`** — le navigateur s'ouvre sur
http://localhost:3210.

1. Colle l'URL d'un produit (ta boutique Shopify ou n'importe quelle fiche produit) et clique **Analyser**
2. Ouvre le produit, choisis un nombre de vidéos, clique **Générer les vidéos**
3. Les rendus tournent en fond (~3 min par vidéo, 2 en parallèle) — la page se met à jour toute seule
4. Prévisualise, télécharge, marque « publiée » ce que tu as posté

## Prérequis (déjà en place sur ce PC)

- Node.js 24+, Python 3.12 avec `edge-tts` (`pip install --user edge-tts`)
- Claude Code connecté : lance `claude /login` une fois si la génération de scripts échoue avec « Not logged in »
- FFmpeg (utilisé par Remotion)

## Musique de fond (optionnel)

Dépose des `.mp3` libres de droits dans `public/music/` : une piste au hasard
sera mixée doucement sous la voix de chaque vidéo. Dossier vide = pas de musique.

## Comment ça marche

```
URL produit
  → extraction (JSON Shopify natif, sinon scraping + Claude)
  → scripts variés écrits par Claude (claude -p, ton abonnement)
  → voix off edge-tts avec timing de chaque mot
  → rendu Remotion (template React dans video/Slideshow.tsx)
  → galerie (SQLite data/fastlane.db + fichiers public/media/)
```

Le template vidéo est du code React : ouvre `video/Slideshow.tsx` pour changer
couleurs, polices, animations — ou lance `npm run remotion:preview` pour le
studio de prévisualisation Remotion.

## Limites v1 / suite prévue

- **v2** : avatars IA qui parlent (UGC) via API fal.ai, nouveaux templates, B-roll
- **v3** : calendrier + publication auto YouTube Shorts (API officielle)
- Pas d'automatisation TikTok/Instagram non officielle (risque de ban) — export manuel
- Test : `npm test` (33 tests) ; pipeline complet : `scripts/e2e-pipeline.manual.ts`
