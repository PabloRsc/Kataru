const BASE = '/api/anime';

const catalogEntries = payload => Array.isArray(payload?.data)
  ? payload.data
  : Array.isArray(payload) ? payload : [];

async function request(path) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 22000);
  try {
    const url = path.startsWith('/api/') ? path : BASE + path;
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || (response.status === 504
        ? 'O catálogo demorou demais para responder. Tente novamente.'
        : `O serviço de catálogo respondeu com HTTP ${response.status}.`));
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

async function requestCatalog(path, requestedPage = 1) {
  const data = await request(path);
  const pagination = data?.pagination || {};
  return {
    items: catalogEntries(data).map(normalizeAnime),
    page: Number(pagination.current_page) || requestedPage,
    hasMore: Boolean(pagination.has_next_page),
    totalItems: Number(pagination.items?.total) || null
  };
}

export async function searchAnime(query) {
  const data = await request('/search?q=' + encodeURIComponent(query));
  return catalogEntries(data).map(normalizeAnime);
}

export async function fetchAnime(malId) {
  const data = await request('/' + encodeURIComponent(malId));
  return normalizeAnime(data.data || data);
}

export async function discoverAnime(kind = 'season', page = 1) {
  let path;
  if (kind === 'season') {
    path = '/api/catalog/seasons/now?filter=tv&limit=24&sfw=true&page=' + Math.max(1, Number(page) || 1);
  } else if (kind === 'upcoming') {
    path = '/api/catalog/seasons/upcoming?filter=tv&limit=24&sfw=true&page=' + Math.max(1, Number(page) || 1);
  } else if (kind === 'popular') {
    path = '/api/catalog/top/anime?type=tv&filter=bypopularity&limit=24&sfw=true&page=' + Math.max(1, Number(page) || 1);
  } else if (kind === 'top-rated') {
    path = '/api/catalog/top/anime?type=tv&limit=24&sfw=true&ranking=score&page=' + Math.max(1, Number(page) || 1);
  } else if (String(kind).startsWith('genre-')) {
    const genre = decodeURIComponent(String(kind).slice(6)).trim();
    if (!genre) throw new Error('Escolha um gênero para continuar.');
    path = '/api/catalog/anime?genre=' + encodeURIComponent(genre) + '&order_by=popularity&sort=asc&limit=24&sfw=true&page=' + Math.max(1, Number(page) || 1);
  } else {
    path = '/api/catalog/seasons/now?filter=tv&limit=24&sfw=true&page=' + Math.max(1, Number(page) || 1);
  }

  return requestCatalog(path, Math.max(1, Number(page) || 1));
}

export async function fetchAnimeGenres() {
  const entries = await request('/api/catalog/genres/anime?filter=genres');
  return catalogEntries(entries).map(genre => ({
    mal_id: Number.isSafeInteger(Number(genre.mal_id)) ? Number(genre.mal_id) : null,
    name: genre.name,
    count: Number.isFinite(Number(genre.count)) && Number(genre.count) > 0 ? Number(genre.count) : null
  })).filter(genre => genre.name);
}

// The catalogue is fetched on demand; it only enters the collection after an explicit add action.
export function normalizeAnime(a = {}) {
  const title = a.title || a.title_japanese || 'Sem título';
  const titleEnglish = a.title_english || '';
  const titleJapanese = a.title_japanese || '';
  const titleSynonyms = Array.isArray(a.title_synonyms) ? a.title_synonyms : [];
  const titleAliases = [...new Set([
    title,
    titleEnglish,
    titleJapanese,
    ...titleSynonyms
  ].map(value => String(value || '').trim()).filter(Boolean))];
  return {
    mal_id: a.mal_id,
    title,
    title_english: titleEnglish,
    title_japanese: titleJapanese,
    title_aliases: titleAliases,
    image_url: a.images?.webp?.large_image_url || a.images?.webp?.image_url || a.images?.jpg?.large_image_url || a.images?.jpg?.image_url || '',
    synopsis: a.synopsis || '',
    episodes_total: a.episodes ?? null,
    episodes_available: a.episodes_available ?? null,
    airing_status: a.status || null,
    year: a.year || a.aired?.prop?.from?.year || a.year_season || null,
    season: a.season || null,
    genres: (a.genres || []).map(g => typeof g === 'string' ? g : g.name).filter(Boolean),
    studios: (a.studios || []).map(studio => typeof studio === 'string' ? studio : studio.name).filter(Boolean),
    score_external: a.score || null,
    format: a.type || '',
    api_synced_at: new Date().toISOString()
  };
}
