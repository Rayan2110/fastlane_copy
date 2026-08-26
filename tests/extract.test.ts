import {describe, it, expect} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {toShopifyJsonUrl, parseShopifyProduct} from '../lib/extract';

const fixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures', 'shopify-product.json'), 'utf8')
);
const sourceUrl = 'https://silene-3766.myshopify.com/products/bracelet-reveil-vibrant-silene';

describe('toShopifyJsonUrl', () => {
  it('transforme une URL produit en URL .json', () => {
    expect(toShopifyJsonUrl('https://x.com/products/mon-produit')).toBe(
      'https://x.com/products/mon-produit.json'
    );
  });
  it('ignore les query params et le trailing slash', () => {
    expect(toShopifyJsonUrl('https://x.com/products/mon-produit/?variant=42')).toBe(
      'https://x.com/products/mon-produit.json'
    );
  });
  it('gere les URLs avec collection', () => {
    expect(toShopifyJsonUrl('https://x.com/collections/all/products/p1')).toBe(
      'https://x.com/collections/all/products/p1.json'
    );
  });
  it('retourne null pour une URL non-produit', () => {
    expect(toShopifyJsonUrl('https://x.com/pages/contact')).toBeNull();
    expect(toShopifyJsonUrl('pas une url')).toBeNull();
  });
});

describe('parseShopifyProduct', () => {
  const p = parseShopifyProduct(fixture, sourceUrl);

  it('extrait titre, vendor, source', () => {
    expect(p.title).toBe('Bracelet réveil vibrant SILÈNE');
    expect(p.vendor).toBe('SILÈNE');
    expect(p.sourceUrl).toBe(sourceUrl);
  });

  it('formate le prix de la premiere variante avec compareAt', () => {
    expect(p.price).toBe('39,90 €');
    expect(p.compareAtPrice).toBe('59,90 €');
    expect(p.currency).toBe('EUR');
  });

  it('liste toutes les images', () => {
    expect(p.images).toHaveLength(7);
    expect(p.images[0]).toContain('cdn.shopify.com');
  });

  it('extrait des benefits en texte brut, sans les notes internes entre crochets', () => {
    expect(p.benefits.length).toBeGreaterThanOrEqual(3);
    expect(p.benefits.length).toBeLessThanOrEqual(6);
    for (const b of p.benefits) {
      expect(b).not.toContain('<');
      expect(b).not.toContain('À CONFIRMER');
      expect(b.length).toBeLessThanOrEqual(90);
    }
  });

  it('exclut les titres de section du body_html', () => {
    expect(p.benefits).not.toContain("Ce qu'il fait");
    expect(p.benefits).not.toContain("Ce qu'il ne fait pas");
  });

  it('description = texte brut sans HTML', () => {
    expect(p.description).not.toContain('<p>');
    expect(p.description).toContain('vibration au poignet');
  });
});
