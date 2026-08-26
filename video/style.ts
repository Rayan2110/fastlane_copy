// ============================================================
// STYLE CENTRAL DES VIDEOS — tout est modifiable ici.
// Change une valeur, relance un rendu, c'est pris en compte.
// ============================================================

export const STYLE = {
  // --- Rythme du montage ---
  maxShotFrames: 60, // duree max d'un plan (60 = 2 s a 30 fps)
  minShotFrames: 24, // duree min d'un plan
  flashFrames: 4, // duree du flash blanc aux coupes (0 = pas de flash)
  hookPunchFrames: 7, // punch-in d'ouverture (frame 0)

  // --- Mouvement des images ---
  zoomStrength: 0.16, // amplitude du zoom Ken Burns par plan
  shakeAmp: 3.5, // amplitude du micro-shake camera (px), 0 = fixe
  shakeSpeed: 0.06,

  // --- Captions karaoke ---
  wordsPerGroup: 3, // mots affiches a la fois
  captionFontSize: 68,
  emphasisFontSize: 84, // mots forts (prix, chiffres, promo…)
  captionColor: '#ffffff',
  emphasisColor: '#ffd234',
  captionStroke: 10, // epaisseur du contour (style CapCut)
  captionStrokeColor: '#000000',
  captionBottom: 430, // distance du bas de l'ecran (zone safe TikTok)

  // --- Texte ecran / hook ---
  screenTextFontSize: 88,
  hookFontSize: 96,

  // --- Prix & CTA ---
  accent: '#ffd234',
  accentDark: '#1a1400',
  priceBadgeRotation: -4,
  urgencyBanner: true, // bandeau pulsant sur la derniere scene
  ctaPulseSpeed: 0.25,

  // --- Habillage image ---
  grade: 'saturate(1.15) contrast(1.06)', // color grading CSS
  vignette: 0.35, // 0 = pas de vignette
  watermarkTop: 200, // sous la zone UI TikTok

  // --- Audio ---
  musicVolume: 0.09, // sous la voix
  musicVolumeOutro: 0.2, // montee sur le CTA final
  sfxWhooshVolume: 0.35, // aux coupes
  sfxPopVolume: 0.5, // apparition du prix
} as const;

export type StyleVariant = 'dark' | 'light';

export const THEMES: Record<StyleVariant, {bg: string; gradient: string; text: string; watermark: string}> = {
  dark: {
    bg: '#0b0b14',
    gradient:
      'linear-gradient(to top, rgba(5,5,15,0.85) 0%, rgba(5,5,15,0.25) 35%, rgba(5,5,15,0) 60%)',
    text: '#ffffff',
    watermark: 'rgba(255,255,255,0.85)',
  },
  light: {
    bg: '#f5f2ec',
    gradient:
      'linear-gradient(to top, rgba(30,25,15,0.75) 0%, rgba(30,25,15,0.2) 35%, rgba(30,25,15,0) 60%)',
    text: '#ffffff',
    watermark: 'rgba(255,255,255,0.9)',
  },
};

// Mots consideres "forts" meme si le script ne les liste pas :
// chiffres, prix, et vocabulaire d'urgence/promo.
export const EMPHASIS_PATTERN = /\d|€|%|gratuit|promo|offre|stock|aujourd|maintenant|vite|moitié|moins/i;
