import path from 'node:path';
import {FAL_MODELS, falRun, falUpload, downloadTo} from './fal';
import {getProduct, updateProductData} from './db';

type SeedanceOut = {video: {url: string}};

const DEFAULT_PROMPT =
  'Slow cinematic push-in on the product, soft natural lighting, subtle parallax and gentle camera drift, appetizing product showcase, vertical video';

// Anime une image produit en clip video de 5 s (~$0.11) et memorise le
// chemin dans product.data.brollClips[imageIndex].
export async function generateBrollClip(
  productId: number,
  imageIndex: number,
  prompt: string = DEFAULT_PROMPT
): Promise<string> {
  const product = getProduct(productId);
  if (!product) throw new Error(`Produit ${productId} introuvable`);
  const imageRel = product.data.localImages?.[imageIndex];
  if (!imageRel) throw new Error(`Image ${imageIndex} introuvable pour ce produit`);

  const imageUrl = await falUpload(path.join(process.cwd(), 'public', imageRel), 'image/jpeg');
  const out = await falRun<SeedanceOut>(FAL_MODELS.imageToVideo, {
    prompt,
    image_url: imageUrl,
    aspect_ratio: '9:16',
    resolution: '720p',
    duration: '5', // string obligatoire (enum "2".."12")
    camera_fixed: false,
    enable_safety_checker: true,
  });
  const url = out.video?.url;
  if (!url) throw new Error('Seedance n’a retourné aucune vidéo');

  const rel = `media/${productId}/broll-${imageIndex}.mp4`;
  await downloadTo(url, path.join(process.cwd(), 'public', rel));

  const fresh = getProduct(productId)!; // relire: eviter d'ecraser un broll concurrent
  const brollClips = {...(fresh.data.brollClips ?? {}), [imageIndex]: rel};
  updateProductData(productId, {...fresh.data, brollClips});
  return rel;
}
