const BASE = '/api/anime';
const JIKAN_BASE = 'https://api.jikan.moe/v4';

const catalogEntries = payload => Array.isArray(payload?.data)
  ? payload.data
  : Array.isArray(payload) ? payload : [];

const normalizeGenre = value => String(value || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

const JIKAN_GENRE_IDS = {
  action: 1, adventure: 2, comedy: 4, 'avant garde': 5, mystery: 7,
  drama: 8, ecchi: 9, fantasy: 10, horror: 14, romance: 22,
  'sci-fi': 24, "girls' love": 26, "boys' love": 28, sports: 30,
  'slice of life': 36, supernatural: 37, suspense: 41,
  'award winning': 46, gourmet: 47
};

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

// Secondary browser-side path: Descobrir can still load when the Vercel
// serverless route is unavailable. The server route remains the primary path
// so its AniList fallback and normalization continue to be used whenever possible.
async function requestJikanCatalog(path) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(JIKAN_BASE + path, {
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = response.status === 429
        ? 'A Jikan está limitando as consultas. Aguarde alguns segundos e tente novamente.'
        : payload.message || `A Jikan respondeu com HTTP ${response.status}.`;
      throw new Error(message);
    }
    return payload;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('A consulta direta à Jikan demorou demais.');
    if (error instanceof TypeError) throw new Error('Não foi possível acessar a Jikan diretamente (conexão ou CORS).');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function requestCatalogWithFallback(apiPath, jikanPath) {
  let serverError;
  try {
    const payload = await request(apiPath);
    if (catalogEntries(payload).length) return payload;
    serverError = new Error('A rota interna retornou uma lista vazia.');
  } catch (error) {
    serverError = error;
  }

  if (!jikanPath) throw serverError;

  try {
    const payload = await requestJikanCatalog(jikanPath);
    if (catalogEntries(payload).length) return payload;
    throw new Error('A Jikan não retornou títulos para esta categoria.');
  } catch (jikanError) {
    throw new Error(`Serviço interno: ${serverError.message} Tentativa direta: ${jikanError.message}`);
  }
}

export async function searchAnime(query) {
  const data = await request('/search?q=' + encodeURIComponent(query));
  return catalogEntries(data).map(normalizeAnime);
}

export async function fetchAnime(malId) {
  const data = await request('/' + encodeURIComponent(malId));
  return normalizeAnime(data.data || data);
}

export async function discoverAnime(kind = 'popular') {
  let apiPath;
  let jikanPath;

  if (kind === 'popular') {
    apiPath = '/api/catalog/top/anime?type=tv&filter=bypopularity&limit=24&sfw=true';
    jikanPath = '/top/anime?type=tv&filter=bypopularity&limit=24&sfw=true';
  } else if (kind === 'top-rated') {
    apiPath = '/api/catalog/top/anime?type=tv&limit=24&sfw=true&ranking=score';
    // Jikan's top/anime endpoint is already ordered by score by default.
    jikanPath = '/top/anime?type=tv&limit=24&sfw=true';
  } else if (String(kind).startsWith('genre-')) {
    const genre = decodeURIComponent(String(kind).slice(6)).trim();
    if (!genre) throw new Error('Escolha um gênero para continuar.');
    const genreId = /^\d+$/.test(genre) ? Number(genre) : JIKAN_GENRE_IDS[normalizeGenre(genre)];
    const query = genreId
      ? 'genres=' + encodeURIComponent(genreId)
      : 'genre=' + encodeURIComponent(genre);
    apiPath = '/api/catalog/anime?' + query + '&order_by=popularity&sort=asc&limit=24&sfw=true';
    jikanPath = genreId
      ? '/anime?genres=' + encodeURIComponent(genreId) + '&order_by=popularity&sort=asc&limit=24&sfw=true'
      : null;
  } else {
    apiPath = '/api/catalog/top/anime?type=tv&filter=bypopularity&limit=24&sfw=true';
    jikanPath = '/top/anime?type=tv&filter=bypopularity&limit=24&sfw=true';
  }

  const data = await requestCatalogWithFallback(apiPath, jikanPath);
  return catalogEntries(data).map(normalizeAnime);
}

export async function fetchAnimeGenres() {
  const data = await requestCatalogWithFallback(
    '/api/catalog/genres/anime?filter=genres',
    '/genres/anime?filter=genres'
  );
  return catalogEntries(data).map(genre => ({
    mal_id: Number.isSafeInteger(Number(genre.mal_id)) ? Number(genre.mal_id) : null,
    name: genre.name
  })).filter(genre => genre.name);
}
// The catalogue is fetched on demand; it only enters the collection after an explicit add action.

export function normalizeAnime(a = {}) {
  return {
    mal_id: a.mal_id,
    title: a.title || a.title_japanese || 'Sem título',
    title_english: a.title_english || '',
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
