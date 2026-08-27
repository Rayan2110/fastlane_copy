import path from 'node:path';
import {BROLL_TIERS, type QualityTier, falRun, falUpload, downloadTo} from './fal';
import {getProduct, updateProductData} from './db';

type VideoOut = {video?: {url?: string}; videos?: {url?: string}[]};

const DEFAULT_PROMPT =
  'Slow cinematic push-in on the product, soft natural lighting, subtle parallax and gentle camera drift, appetizing product showcase, vertical video';

// Anime une image produit en clip video de ~5 s et memorise le chemin dans
// product.data.brollClips[imageIndex]. Le tier choisit le modele (et le prix).
export async function generateBrollClip(
  productId: number,
  imageIndex: number,
  tier: QualityTier = 'eco',
  prompt: string = DEFAULT_PROMPT
): Promise<string> {
  const product = getProduct(productId);
  if (!product) throw new Error(`Produit ${productId} introuvable`);
  const imageRel = product.data.localImages?.[imageIndex];
  if (!imageRel) throw new Error(`Image ${imageIndex} introuvable pour ce produit`);

  const config = BROLL_TIERS[tier] ?? BROLL_TIERS.eco;
  const imageUrl = await falUpload(path.join(process.cwd(), 'public', imageRel), 'image/jpeg');
  const out = await falRun<VideoOut>(config.model, config.buildInput(imageUrl, prompt));
  const url = out.video?.url ?? out.videos?.[0]?.url;
  if (!url) throw new Error(`${config.model} n’a retourné aucune vidéo`);

  const rel = `media/${productId}/broll-${imageIndex}.mp4`;
  await downloadTo(url, path.join(process.cwd(), 'public', rel));

  const fresh = getProduct(productId)!; // relire: eviter d'ecraser un broll concurrent
  const brollClips = {...(fresh.data.brollClips ?? {}), [imageIndex]: rel};
  updateProductData(productId, {...fresh.data, brollClips});
  return rel;
}
