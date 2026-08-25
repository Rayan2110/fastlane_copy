import type {ProductData} from './types';
import {runClaude, extractJson} from './claude';

const CURRENCY_SYMBOLS: Record<string, string> = {EUR: '€', USD: '$', GBP: '£'};

function formatPrice(raw: string, currency: string): string {
  const n = Number(raw);
  const formatted = n.toFixed(2).replace('.', ',');
  const symbol = CURRENCY_SYMBOLS[currency] ?? currency;
  return `${formatted} ${symbol}`;
}

export function toShopifyJsonUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const m = parsed.pathname.match(/^(.*\/products\/[^/]+?)\/?$/);
  if (!m) return null;
  return `${parsed.origin}${m[1]}.json`;
}

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

type ShopifyVariant = {price: string; compare_at_price: string | null; price_currency?: string};
type ShopifyImage = {src: string};
type ShopifyProductJson = {
  product: {
    title: string;
    body_html: string;
    vendor?: string;
    variants: ShopifyVariant[];
    images: ShopifyImage[];
  };
};

export function parseShopifyProduct(json: unknown, sourceUrl: string): ProductData {
  const {product} = json as ShopifyProductJson;
  const variant = product.variants[0];
  const currency = variant?.price_currency ?? 'EUR';
  const text = stripHtml(product.body_html ?? '');
  const lines = text.split('\n').map((l) => l.trim());

  const benefits = lines
    .filter(
      (l) =>
        l.length >= 10 &&
        l.length <= 90 &&
        !l.startsWith('[') &&
        !l.includes('À CONFIRMER') &&
        !l.endsWith(':')
    )
    .slice(0, 6);

  const compareAt =
    variant?.compare_at_price && Number(variant.compare_at_price) > Number(variant.price)
      ? formatPrice(variant.compare_at_price, currency)
      : undefined;

  return {
    title: product.title,
    price: variant ? formatPrice(variant.price, currency) : '',
    compareAtPrice: compareAt,
    currency,
    description: text.slice(0, 1000),
    benefits,
    images: product.images.map((i) => i.src),
    sourceUrl,
    vendor: product.vendor,
  };
}

const GENERIC_EXTRACT_PROMPT = (url: string, pageText: string) => `Tu extrais les informations produit d'une page e-commerce pour créer des vidéos marketing.

URL: ${url}

Contenu texte de la page:
"""
${pageText}
"""

Réponds UNIQUEMENT avec un objet JSON de cette forme exacte:
{
  "title": "nom du produit",
  "price": "prix affiché formaté, ex: 39,90 €",
  "compareAtPrice": "ancien prix barré s'il existe, sinon null",
  "currency": "code devise, ex: EUR",
  "description": "description courte du produit (2-3 phrases)",
  "benefits": ["bénéfice 1", "bénéfice 2", "... max 6, courts"],
  "vendor": "nom de la marque si visible, sinon null"
}`;

// Les URLs d'images sont extraites du HTML brut (pas par le LLM, qui hallucine des URLs).
export function extractImageUrls(html: string, baseUrl: string): string[] {
  const urls = new Set<string>();
  const re = /<img[^>]+src=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    let src = m[1];
    if (src.startsWith('//')) src = 'https:' + src;
    else if (src.startsWith('/')) src = new URL(baseUrl).origin + src;
    if (!src.startsWith('http')) continue;
    if (/\.(svg|gif|ico)(\?|$)/i.test(src)) continue;
    if (/logo|icon|sprite|badge|flag|payment/i.test(src)) continue;
    urls.add(src.split('&width=')[0]);
  }
  return [...urls].slice(0, 10);
}

export async function extractProduct(url: string): Promise<ProductData> {
  const shopifyUrl = toShopifyJsonUrl(url);
  if (shopifyUrl) {
    const res = await fetch(shopifyUrl, {
      headers: {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'},
    });
    if (res.ok) {
      const json = await res.json();
      if ((json as ShopifyProductJson).product) {
        return parseShopifyProduct(json, url);
      }
    }
    // Pas du Shopify finalement → on retombe sur le generique.
  }

  const res = await fetch(url, {
    headers: {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'},
  });
  if (!res.ok) {
    throw new Error(`Page inaccessible (HTTP ${res.status})`);
  }
  const html = await res.text();
  const pageText = stripHtml(html).slice(0, 15_000);
  const raw = await runClaude(GENERIC_EXTRACT_PROMPT(url, pageText));
  const data = extractJson<Omit<ProductData, 'images' | 'sourceUrl'> & {
    compareAtPrice: string | null;
    vendor: string | null;
  }>(raw);

  return {
    title: data.title,
    price: data.price,
    compareAtPrice: data.compareAtPrice ?? undefined,
    currency: data.currency ?? 'EUR',
    description: data.description ?? '',
    benefits: Array.isArray(data.benefits) ? data.benefits.slice(0, 6) : [],
    images: extractImageUrls(html, url),
    sourceUrl: url,
    vendor: data.vendor ?? undefined,
  };
}
