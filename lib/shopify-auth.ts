import {getStorePassword} from './db';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';

// Cookies de session par host (le storefront_digest survit ~1 an, mais on
// reste en memoire process : re-authentification silencieuse au besoin).
const g = globalThis as unknown as {__storefrontCookies?: Map<string, string>};
function cookieCache(): Map<string, string> {
  g.__storefrontCookies ??= new Map();
  return g.__storefrontCookies;
}

// Deverrouille une boutique Shopify protegee par mot de passe visiteur :
// POST /password. Succes = redirection 302 vers la boutique, avec un cookie
// de session (_shopify_essential depuis ~2025, storefront_digest avant).
// Echec = la page /password se re-affiche en 200.
async function authenticate(origin: string, password: string): Promise<string> {
  const res = await fetch(`${origin}/password`, {
    method: 'POST',
    redirect: 'manual',
    headers: {'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA},
    body: `form_type=storefront_password&utf8=%E2%9C%93&password=${encodeURIComponent(password)}`,
  });
  const setCookies: string[] = res.headers.getSetCookie?.() ?? [];
  const isRedirect = res.status >= 300 && res.status < 400;
  if (!isRedirect || setCookies.length === 0) {
    throw new Error('Mot de passe boutique refusé — vérifie le mot de passe visiteur');
  }
  // On renvoie tous les cookies poses (name=value; name2=value2).
  return setCookies.map((c) => c.split(';')[0]).join('; ');
}

// fetch avec deverrouillage automatique des boutiques protegees connues.
// Retourne la reponse ; si la boutique est protegee et qu'aucun mot de passe
// n'est enregistre, laisse la reponse 401/redirect telle quelle.
export async function fetchWithStoreAuth(url: string): Promise<Response> {
  const origin = new URL(url).origin;
  const host = new URL(url).hostname;
  const cache = cookieCache();

  const doFetch = (cookie?: string) =>
    fetch(url, {
      redirect: 'follow',
      headers: {'User-Agent': UA, ...(cookie ? {Cookie: cookie} : {})},
    });

  let res = await doFetch(cache.get(host));
  if (res.ok && !res.url.includes('/password')) return res;

  const isLocked =
    res.status === 401 || res.status === 403 || res.url.includes('/password');
  if (!isLocked) return res;

  const password = getStorePassword(host);
  if (!password) {
    throw new Error(
      'Cette boutique est protégée par un mot de passe — colle le mot de passe visiteur dans le champ prévu sous l’URL, puis relance.'
    );
  }
  const cookie = await authenticate(origin, password);
  cache.set(host, cookie);
  res = await doFetch(cookie);
  return res;
}
