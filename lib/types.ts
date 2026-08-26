export type ProductData = {
  title: string;
  price: string; // deja formate, ex "39,90 EUR"
  compareAtPrice?: string;
  currency: string;
  description: string;
  benefits: string[];
  images: string[]; // URLs source
  localImages?: string[]; // chemins relatifs a public/ apres telechargement
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
