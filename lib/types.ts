export type ProductData = {
  title: string;
  price: string; // deja formate, ex "39,90 EUR"
  compareAtPrice?: string;
  currency: string;
  description: string;
  benefits: string[];
  images: string[]; // URLs source
  localImages?: string[]; // chemins relatifs a public/ apres telechargement
  brollClips?: Record<number, string>; // imageIndex -> clip anime (phase D)
  sourceUrl: string;
  vendor?: string;
};

export type Scene = {
  imageIndex: number;
  screenText: string;
  voiceText: string;
  emphasisWords?: string[]; // mots a mettre en avant dans les captions
  emoji?: string; // emoji accompagnant le texte ecran
};

export type VideoScript = {
  angle: string;
  hook: string;
  scenes: Scene[];
  cta: string;
};

export type WordTiming = {word: string; startMs: number; endMs: number};

export type JobStatus = 'pending' | 'running' | 'done' | 'failed';

export type RenderFormat = 'slideshow' | 'avatar';

export type AvatarRow = {
  id: number;
  name: string;
  imagePath: string; // relatif a public/
  createdAt: string;
};
