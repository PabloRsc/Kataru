const BASE = 'https://api.jikan.moe/v4';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
let lastRequest = 0;

async function request(path) {
  const elapsed = Date.now() - lastRequest;
  if (elapsed < 900) await wait(900 - elapsed);
  lastRequest = Date.now();
  const response = await fetch(`${BASE}${path}`);
  if (!response.ok) throw new Error(response.status === 429 ? 'Muitas pesquisas em sequência. Aguarde alguns segundos e tente novamente.' : `Não foi possível consultar a Jikan (${response.status}).`);
  return response.json();
}

export async function searchAnime(query) {
  const data = await request(`/anime?q=${encodeURIComponent(query)}&limit=8&sfw=true&order_by=popularity&sort=asc`);
  return (data.data || []).map(normalizeAnime);
}

export async function fetchAnime(malId) {
  const data = await request(`/anime/${malId}/full`);
  return normalizeAnime(data.data);
}

export function normalizeAnime(a) {
  return {
    mal_id: a.mal_id,
    title: a.title || 'Sem título',
    title_english: a.title_english || '',
    image_url: a.images?.webp?.large_image_url || a.images?.jpg?.large_image_url || '',
    synopsis: a.synopsis || '',
    episodes_total: a.episodes ?? null,
    year: a.year || a.aired?.prop?.from?.year || null,
    season: a.season || null,
    genres: (a.genres || []).map(g => g.name),
    score_external: a.score || null,
    api_synced_at: new Date().toISOString()
  };
}
