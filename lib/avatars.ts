import path from 'node:path';
import fs from 'node:fs/promises';
import {FAL_MODELS, falRun, falUpload, downloadTo} from './fal';
import {insertAvatar} from './db';
import type {AvatarRow} from './types';

// Presets de portraits credibles "UGC" — l'anti-mannequin-studio.
const BASE_STYLE =
  'amateur smartphone front camera selfie, natural indoor window lighting, slightly grainy, realistic skin texture with visible pores, slight asymmetry, no beauty filter, no studio lighting, casual clothes, friendly relaxed expression, vertical framing';

export const AVATAR_PRESETS: Record<string, string> = {
  'femme-20s': `Amateur selfie of a french woman in her early 20s, ${BASE_STYLE}`,
  'femme-30s': `Amateur selfie of a french woman in her mid 30s, ${BASE_STYLE}`,
  'homme-20s': `Amateur selfie of a french man in his early 20s, short beard, ${BASE_STYLE}`,
  'homme-30s': `Amateur selfie of a french man in his mid 30s, ${BASE_STYLE}`,
};

type SeedreamOut = {images: {url: string}[]};
type NanoBananaOut = {images: {url: string}[]};

// Genere un portrait d'avatar (~$0.03) et l'enregistre en base.
export async function createAvatar(name: string, promptOrPreset: string): Promise<AvatarRow> {
  const prompt = AVATAR_PRESETS[promptOrPreset] ?? promptOrPreset;
  const out = await falRun<SeedreamOut>(FAL_MODELS.portrait, {
    prompt,
    image_size: {width: 1080, height: 1920},
    num_images: 1,
    enable_safety_checker: true,
  });
  const url = out.images?.[0]?.url;
  if (!url) throw new Error('Seedream n’a retourné aucune image');

  const dir = path.join(process.cwd(), 'public', 'avatars');
  await fs.mkdir(dir, {recursive: true});
  const fileName = `avatar-${Date.now()}.jpg`;
  await downloadTo(url, path.join(dir, fileName));
  const imagePath = `avatars/${fileName}`;
  const id = insertAvatar(name, imagePath);
  return {id, name, imagePath, createdAt: new Date().toISOString()};
}

// Compose "avatar tenant le produit" (~$0.039), avec cache disque par
// couple avatar/produit — genere une seule fois.
export async function ensureHoldImage(
  avatar: AvatarRow,
  productId: number,
  productImageRel: string
): Promise<string> {
  const rel = `media/${productId}/avatar-${avatar.id}-hold.png`;
  const abs = path.join(process.cwd(), 'public', rel);
  try {
    await fs.access(abs);
    return rel; // deja genere
  } catch {
    // a generer
  }
  const avatarUrl = await falUpload(
    path.join(process.cwd(), 'public', avatar.imagePath),
    'image/jpeg'
  );
  const productUrl = await falUpload(
    path.join(process.cwd(), 'public', productImageRel),
    'image/jpeg'
  );
  const out = await falRun<NanoBananaOut>(FAL_MODELS.productInHand, {
    prompt:
      'Make the person from the first image hold the product from the second image in their hands, natural grip at chest level, keep the face, pose and lighting of the first image unchanged, realistic amateur selfie look',
    image_urls: [avatarUrl, productUrl],
    num_images: 1,
    aspect_ratio: '9:16',
    output_format: 'png',
  });
  const url = out.images?.[0]?.url;
  if (!url) throw new Error('nano-banana n’a retourné aucune image');
  await downloadTo(url, abs);
  return rel;
}
