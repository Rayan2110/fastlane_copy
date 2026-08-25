# Fastlane Local v1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** App web locale : coller un lien produit → extraction → N scripts Claude → vidéos slideshow verticales (voix FR + captions karaoké) → galerie.

**Architecture:** Monorepo Next.js 14 (App Router) avec projet Remotion embarqué dans `video/`. Pipeline séquentiel piloté par une file de jobs en SQLite ; les rendus tournent en processus enfants (`remotion render`, `python -m edge_tts`, `claude -p`). UI = 2 pages avec polling.

**Tech Stack:** Next.js 14.2 / React 18.3.1 / TypeScript, better-sqlite3, Remotion 4.0.257, edge-tts (Python), claude CLI headless, Vitest, zod.

**Spec:** `docs/superpowers/specs/2026-08-25-fastlane-local-design.md`

## Global Constraints

- Windows 11, PowerShell ; tous les spawn d'enfants doivent marcher sous Windows (`shell: true` ou chemins .cmd).
- React **18.3.1** épinglé (compat Remotion 4.0.257) — pas de React 19, pas de Next 15.
- Vidéos : 1080×1920, 30 fps, H.264.
- Génération IA via `claude -p --output-format json` (abonnement existant) ; fallback `ANTHROPIC_API_KEY` hors périmètre v1 (juste une erreur claire si CLI absent).
- Texte utilisateur et vidéos en **français**.
- Données : `data/fastlane.db` (gitignoré) ; médias : `public/media/<productId>/` (gitignoré).
- Aucune automatisation TikTok/IG non officielle.

## File Structure

```
usefastlaneAI/
  package.json, tsconfig.json, next.config.mjs, vitest.config.ts
  start-fastlane.bat            # lanceur double-clic (préférence Rayan)
  app/
    layout.tsx, globals.css
    page.tsx                    # dashboard : input URL + liste produits
    product/[id]/page.tsx       # scripts + galerie vidéos + statut jobs
    api/products/route.ts       # POST ingest, GET liste
    api/products/[id]/route.ts  # GET détail (scripts+videos+jobs)
    api/products/[id]/generate/route.ts  # POST : scripts + enqueue renders
  lib/
    types.ts                    # ProductData, VideoScript, WordTiming, statuts
    db.ts                       # SQLite + CRUD
    extract.ts                  # Shopify JSON + générique→Claude
    claude.ts                   # spawn claude -p, extractJson
    scripts-gen.ts              # prompt + parse/validation zod des scripts
    tts.ts                      # edge-tts spawn + parseSrt → WordTiming[]
    timeline.ts                 # calage scènes sur timings voix
    render.ts                   # file de jobs (max 2), spawn remotion render
    media.ts                    # téléchargement images produit
  video/
    index.ts, Root.tsx
    Slideshow.tsx               # template (Ken Burns + karaoké + badge prix)
  tests/                        # *.test.ts par module + fixtures/
  music/                        # mp3 optionnels fournis par l'utilisateur
```

---

### Task 1: Scaffold Next.js + Vitest

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `vitest.config.ts`, `app/layout.tsx`, `app/globals.css`, `app/page.tsx`, `lib/types.ts`, `start-fastlane.bat`

**Interfaces:**
- Produces: types partagés `ProductData`, `VideoScript`, `Scene`, `WordTiming`, `JobStatus` consommés par toutes les tâches suivantes.

- [ ] **Step 1: package.json et configs**

```json
{
  "name": "fastlane-local",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3210",
    "build": "next build",
    "test": "vitest run",
    "remotion:preview": "remotion studio video/index.ts"
  },
  "dependencies": {
    "@remotion/cli": "4.0.257",
    "better-sqlite3": "^11.3.0",
    "next": "14.2.5",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "remotion": "4.0.257",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.11",
    "@types/node": "^20",
    "@types/react": "^18",
    "typescript": "^5",
    "vitest": "^2.0.0"
  }
}
```

`lib/types.ts` :

```ts
export type ProductData = {
  title: string;
  price: string;          // "39,90 €" déjà formaté
  compareAtPrice?: string;
  currency: string;
  description: string;
  benefits: string[];
  images: string[];       // URLs source
  sourceUrl: string;
  vendor?: string;
};

export type Scene = {
  imageIndex: number;
  screenText: string;
  voiceText: string;
};

export type VideoScript = {
  angle: string;
  hook: string;
  scenes: Scene[];
  cta: string;
};

export type WordTiming = { word: string; startMs: number; endMs: number };

export type JobStatus = 'pending' | 'running' | 'done' | 'failed';
```

`start-fastlane.bat` :

```bat
@echo off
cd /d "%~dp0"
start "" http://localhost:3210
npm run dev
```

- [ ] **Step 2: `npm install`, `npm run dev` répond sur :3210, page placeholder s'affiche**
- [ ] **Step 3: `npm test` passe (0 test), commit** `feat: scaffold Next.js + Vitest + types`

### Task 2: lib/db.ts (SQLite)

**Files:**
- Create: `lib/db.ts`, Test: `tests/db.test.ts`

**Interfaces:**
- Produces:
  - `insertProduct(data: ProductData): number` / `getProduct(id): ProductRow | undefined` / `listProducts(): ProductRow[]`
  - `insertScript(productId: number, script: VideoScript): number` / `listScripts(productId): ScriptRow[]`
  - `insertVideo(scriptId: number, filePath: string): number` / `listVideos(productId): VideoRow[]` / `setVideoPosted(id, posted: boolean)`
  - `createJob(scriptId: number): number` / `setJobStatus(id, status: JobStatus, error?: string)` / `getJob(id)` / `listJobs(productId)`
  - `ProductRow = { id: number; data: ProductData; createdAt: string }` (data stocké JSON), idem Script/Video rows.
  - Chemin DB overridable : `openDb(path?: string)` pour les tests (`:memory:`).

- [ ] **Step 1: test qui échoue**

```ts
import {describe, it, expect, beforeEach} from 'vitest';
import {openDb} from '../lib/db';

describe('db', () => {
  beforeEach(() => openDb(':memory:'));
  it('stocke et relit un produit', () => {
    const id = insertProduct(sampleProduct);        // sampleProduct: fixture ProductData
    expect(getProduct(id)!.data.title).toBe(sampleProduct.title);
  });
  it('cycle de vie job', () => {
    const pid = insertProduct(sampleProduct);
    const sid = insertScript(pid, sampleScript);
    const jid = createJob(sid);
    expect(getJob(jid)!.status).toBe('pending');
    setJobStatus(jid, 'failed', 'boom');
    expect(getJob(jid)!.error).toBe('boom');
  });
});
```

- [ ] **Step 2: run → FAIL (module absent)**
- [ ] **Step 3: implémenter (CREATE TABLE IF NOT EXISTS products/scripts/videos/jobs, colonnes JSON `data`, FK par id, singleton db réassignable via openDb)**
- [ ] **Step 4: run → PASS ; commit** `feat: sqlite layer`

### Task 3: lib/extract.ts (Shopify + générique)

**Files:**
- Create: `lib/extract.ts`, `lib/claude.ts`, Test: `tests/extract.test.ts`, `tests/claude.test.ts`, fixture `tests/fixtures/shopify-product.json`

**Interfaces:**
- Consumes: `ProductData` (Task 1)
- Produces:
  - `toShopifyJsonUrl(url: string): string | null` — `https://x.com/products/handle?y` → `https://x.com/products/handle.json`, null si pas une URL produit Shopify-like
  - `parseShopifyProduct(json: unknown, sourceUrl: string): ProductData` — prix formaté `"39,90 €"` depuis variants[0].price, compareAt si supérieur, benefits extraits des lignes du body_html (strip tags, split, filtre lignes 10–90 chars, max 6)
  - `extractProduct(url: string): Promise<ProductData>` — essaie Shopify (fetch .json), sinon fetch HTML → `runClaude` avec prompt d'extraction → parse
  - `runClaude(prompt: string, opts?: {timeoutMs?: number}): Promise<string>` (claude.ts) — spawn `claude -p <prompt> --output-format json`, retourne le champ `result` ; erreur explicite « claude CLI introuvable » sinon
  - `extractJson<T>(raw: string): T` (claude.ts) — tolère les fences ```json et le texte autour, prend le premier bloc {...} ou [...]

- [ ] **Step 1: tests qui échouent** (toShopifyJsonUrl variantes ; parseShopifyProduct sur fixture réelle SILÈNE ; extractJson avec fences/bruit)
- [ ] **Step 2: run → FAIL**
- [ ] **Step 3: implémenter** (fetch global Node 24 ; User-Agent navigateur sur le fetch générique ; HTML → texte brut tronqué à ~15000 chars avant envoi à Claude)
- [ ] **Step 4: run → PASS ; commit** `feat: product extraction (shopify + generic via claude)`

### Task 4: lib/scripts-gen.ts

**Files:**
- Create: `lib/scripts-gen.ts`, Test: `tests/scripts-gen.test.ts`

**Interfaces:**
- Consumes: `runClaude`, `extractJson` (Task 3), `ProductData`, `VideoScript`
- Produces:
  - `buildScriptsPrompt(product: ProductData, count: number): string` — exige un tableau JSON de `count` scripts, angles variés (liste fournie : curiosité, problème/solution, preuve sociale, urgence, démonstration, comparaison), 3–5 scènes, voiceText total 35–60 mots, screenText ≤ 6 mots/scène, imageIndex < product.images.length, français, CTA « lien en bio »
  - `ScriptSchema` zod + `parseScripts(raw: string, imageCount: number): VideoScript[]` — filtre les scripts invalides, clamp imageIndex, throw si 0 valide
  - `generateScripts(product: ProductData, count: number): Promise<VideoScript[]>` — runClaude → parseScripts, 1 retry avec message d'erreur de format inclus

- [ ] **Step 1: tests qui échouent** (parseScripts: tableau valide → n scripts ; imageIndex hors borne → clampé ; entrée non-JSON → throw ; script sans scenes → filtré)
- [ ] **Step 2: run → FAIL**
- [ ] **Step 3: implémenter**
- [ ] **Step 4: run → PASS ; commit** `feat: script generation via claude`

### Task 5: lib/tts.ts + lib/timeline.ts

**Files:**
- Create: `lib/tts.ts`, `lib/timeline.ts`, Test: `tests/tts.test.ts`, `tests/timeline.test.ts`, fixture `tests/fixtures/voice.srt`

**Interfaces:**
- Consumes: `Scene`, `WordTiming`
- Produces:
  - `parseSrt(srt: string): WordTiming[]` — cues 1 mot (edge-tts `--words-in-cue 1`), `00:00:01,320` → ms
  - `synthesize(text: string, outBase: string): Promise<{audioPath, timings: WordTiming[]}>` — spawn `python -m edge_tts --voice fr-FR-VivienneMultilingualNeural --words-in-cue 1 --write-media <outBase>.mp3 --write-subtitles <outBase>.srt --text <text>`
  - `computeTimeline(scenes: Scene[], timings: WordTiming[], fps: number): {sceneFrames: {from, duration}[], totalFrames: number}` — répartit les timings mots sur les scènes proportionnellement au nombre de mots de chaque voiceText, +1 s de padding final, minimum 45 frames/scène
  - `assignWordsToScenes(scenes, timings): WordTiming[][]` (exporté pour le template karaoké)

- [ ] **Step 1: tests qui échouent** (parseSrt fixture ; computeTimeline : 2 scènes 5+5 mots sur 10 timings → frontière à la fin du 5e mot ; scène courte → min 45 frames ; total = dernier mot + 30 frames)
- [ ] **Step 2: run → FAIL**
- [ ] **Step 3: implémenter**
- [ ] **Step 4: run → PASS ; commit** `feat: tts + timeline sync`

### Task 6: Template Remotion Slideshow

**Files:**
- Create: `video/index.ts`, `video/Root.tsx`, `video/Slideshow.tsx`

**Interfaces:**
- Consumes: `computeTimeline`, `assignWordsToScenes` (Task 5)
- Produces: composition `Slideshow` avec `defaultProps`/inputProps :
  ```ts
  type SlideshowProps = {
    images: string[];          // chemins relatifs public/ (staticFile)
    scenes: Scene[];
    timings: WordTiming[];
    price: string; compareAtPrice?: string;
    brand: string;
    audioFile: string;         // relatif public/
    musicFile?: string;        // relatif public/
    styleVariant: 'dark' | 'light';
  };
  ```
  Durée via `calculateMetadata` (computeTimeline). Rendu : Ken Burns alterné zoom in/out, captions karaoké (mot courant surligné ambre, groupe de 3-4 mots affiché), badge prix sur la dernière scène, watermark marque en haut, musique optionnelle `volume 0.12` en boucle.

- [ ] **Step 1: implémenter le template** (reprendre demo/src/Video.tsx comme base, paramétrer tout via props, ajouter karaoké : à chaque frame, trouver le mot courant par timings et afficher son groupe, mot actif en `#ffc447` scale 1.08)
- [ ] **Step 2: vérifier par un still** : `npx remotion still video/index.ts Slideshow out/test-still.png --props=<fichier props de test>` → image lisible
- [ ] **Step 3: commit** `feat: remotion slideshow template (karaoke captions)`

### Task 7: lib/media.ts + lib/render.ts (file de jobs)

**Files:**
- Create: `lib/media.ts`, `lib/render.ts`, Test: `tests/render-queue.test.ts`

**Interfaces:**
- Consumes: db (Task 2), synthesize (Task 5), composition Slideshow (Task 6)
- Produces:
  - `downloadImages(urls: string[], productId: number): Promise<string[]>` — vers `public/media/<productId>/img-<i>.jpg`, retourne chemins relatifs à public/
  - `enqueueRender(scriptId: number): number` (jobId) — file interne `maxConcurrent = 2`, exécute : TTS → props JSON temp → spawn `npx remotion render video/index.ts Slideshow public/media/<productId>/video-<scriptId>.mp4 --props=<file> --concurrency=12 --log=error` → insertVideo + setJobStatus('done') ; stderr en base si échec
  - `setExecutor(fn)` — injection pour tester la file sans vrais rendus

- [ ] **Step 1: test de file qui échoue** (executor factice à résolution contrôlée : 5 jobs enfilés → jamais plus de 2 running ; échec executor → status failed avec message ; succès → done)
- [ ] **Step 2: run → FAIL**
- [ ] **Step 3: implémenter**
- [ ] **Step 4: run → PASS ; commit** `feat: media download + render queue`

### Task 8: Routes API

**Files:**
- Create: `app/api/products/route.ts`, `app/api/products/[id]/route.ts`, `app/api/products/[id]/generate/route.ts`

**Interfaces:**
- Consumes: extractProduct, downloadImages, generateScripts, enqueueRender, db
- Produces:
  - `POST /api/products` body `{url}` → extractProduct + downloadImages + insertProduct → `{id}` ; 422 `{error}` si extraction échoue
  - `GET /api/products` → `{products: ProductRow[]}`
  - `GET /api/products/[id]` → `{product, scripts, videos, jobs}`
  - `POST /api/products/[id]/generate` body `{count}` (défaut 5, max 30) → generateScripts + insertScript× + enqueueRender× → `{scriptIds, jobIds}`

- [ ] **Step 1: implémenter les 3 routes (`export const runtime = 'nodejs'`, `dynamic = 'force-dynamic'`)**
- [ ] **Step 2: vérifier au curl : POST url SILÈNE → 200 {id} ; GET liste le produit**
- [ ] **Step 3: commit** `feat: api routes`

### Task 9: UI (dashboard + page produit)

**Files:**
- Create: `app/page.tsx` (remplace placeholder), `app/product/[id]/page.tsx`, composants client `app/ui.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: routes API (Task 8)
- Produces: dashboard = input URL + bouton « Analyser » + cartes produits (image, titre, prix, nb vidéos) ; page produit = bouton « Générer N vidéos » (select 5/10/20), liste jobs avec statuts (polling `GET /api/products/[id]` toutes les 4 s tant qu'un job est pending/running), galerie `<video controls>` + bouton téléchargement + toggle « publié ». Style sombre simple (fond #0b0b14, accent #ffc447, cartes arrondies) en CSS global, pas de framework.

- [ ] **Step 1: implémenter les 2 pages (client components, fetch + useState/useEffect polling)**
- [ ] **Step 2: parcours manuel complet dans le navigateur**
- [ ] **Step 3: commit** `feat: dashboard + product gallery UI`

### Task 10: E2E réel + README

**Files:**
- Create: `README.md`

- [ ] **Step 1: flux complet sur le produit SILÈNE : ingest → 3 scripts → 3 vidéos rendues, visionnées**
- [ ] **Step 2: `npm test` global vert, `npm run build` passe**
- [ ] **Step 3: README (prérequis, start-fastlane.bat, usage, dossier music/, limites v1, roadmap v2/v3)**
- [ ] **Step 4: commit final** `docs: readme + v1 complete`

## Self-Review

- Spec coverage : extraction Shopify+générique (T3), scripts variés (T4), TTS+karaoké+calage (T5/T6), musique optionnelle (T6), file de rendu 2 max (T7), UI galerie+statuts (T9), erreurs extract/claude/render en base et à l'écran (T3/T4/T7/T9), tests unitaires listés dans la spec §6 tous couverts. Auto-posting/avatars : hors périmètre confirmé.
- Placeholders : aucun TBD ; les étapes UI/template sont descriptives mais avec contrats de props et comportements exacts.
- Cohérence des types : signatures reprises dans chaque bloc Interfaces.
