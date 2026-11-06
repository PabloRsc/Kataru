const BASE = '/api/anime';

async function request(path) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 22000);
  try {
    const response = await fetch(path.startsWith('/api/') ? path : BASE + path, {
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || (response.status === 504
        ? 'O catálogo demorou demais para responder. Tente novamente.'
        : 'Não foi possível consultar o catálogo de animes agora.'));
    }
    return payload;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('A pesquisa demorou demais. Tente novamente em instantes.');
    if (error instanceof TypeError) throw new Error('Não foi possível acessar o serviço de pesquisa. Verifique sua conexão e tente novamente.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function searchAnime(query) {
  const data = await request('/search?q=' + encodeURIComponent(query));
  return (data.data || []).map(normalizeAnime);
}

export async function fetchAnime(malId) {
  const data = await request('/' + encodeURIComponent(malId));
  return normalizeAnime(data.data);
}

export async function discoverAnime(kind = 'current') {
  let path;
  if (kind === 'current') path = '/seasons/now?limit=24&sfw=true';
  else if (kind === 'upcoming') path = '/seasons/upcoming?limit=24&sfw=true';
  else if (kind === 'popular') path = '/top?type=tv&filter=bypopularity&limit=24';
  else if (String(kind).startsWith('genre-')) {
    const id = Number(String(kind).slice(6));
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Gênero inválido.');
    path = '/?genres=' + id + '&order_by=popularity&sort=asc&limit=24&sfw=true';
  } else path = '/seasons/now?limit=24&sfw=true';

  const data = await request(path);
  return (data.data || []).map(normalizeAnime);
}

export async function fetchAnimeGenres() {
  const data = await request('/api/genres/anime?filter=genres');
  return (data.data || []).map(genre => ({ mal_id: genre.mal_id, name: genre.name }))
    .filter(genre => genre.mal_id && genre.name);
}

export function normalizeAnime(a = {}) {
  return {
    mal_id: a.mal_id,
    title: a.title || a.title_japanese || 'Sem título',
    title_english: a.title_english || '',
    image_url: a.images?.webp?.large_image_url || a.images?.webp?.image_url || a.images?.jpg?.large_image_url || a.images?.jpg?.image_url || '',
    synopsis: a.synopsis || '',
    episodes_total: a.episodes ?? null,
    airing_status: a.status || null,
    year: a.year || a.aired?.prop?.from?.year || a.year_season || null,
    season: a.season || null,
    genres: (a.genres || []).map(g => typeof g === 'string' ? g : g.name).filter(Boolean),
    score_external: a.score || null,
    format: a.type || '',
    api_synced_at: new Date().toISOString()
  };
}
