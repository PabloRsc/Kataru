import { requestJikan, sendApiError } from '../../server/jikan.js';
import { discoverAniList, getAnimeGenreId, getAnimeGenreName } from '../../server/anilist.js';

const ALLOWED_ROUTES = new Set([
  'seasons/now',
  'seasons/upcoming',
  'top/anime',
  'genres/anime',
  'anime'
]);

function sendCatalogResult(res, payload, source) {
  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=1800');
  res.setHeader('X-Kataru-Catalog-Source', source);
  return res.status(200).json(payload);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ message: 'Método não permitido.' });
  }

  const segments = Array.isArray(req.query.path)
    ? req.query.path
    : String(req.query.path || '').split('/').filter(Boolean);
  const route = segments.join('/');

  if (!ALLOWED_ROUTES.has(route)) {
    return res.status(404).json({ message: 'Rota de catálogo não encontrada.' });
  }

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query)) {
    if (key === 'path' || value == null) continue;
    if (Array.isArray(value)) value.forEach(part => params.append(key, String(part)));
    else params.set(key, String(value));
  }

  const genreName = params.get('genre') || getAnimeGenreName(params.get('genres'));
  const jikanParams = new URLSearchParams(params);
  jikanParams.delete('genre');

  if (route === 'anime' && genreName && !jikanParams.has('genres')) {
    const genreId = getAnimeGenreId(genreName);
    if (genreId) jikanParams.set('genres', String(genreId));
  }

  // If the name is not supported by Jikan, do not return an unfiltered list.
  if (route === 'anime' && genreName && !jikanParams.has('genres')) {
    try {
      return sendCatalogResult(res, await discoverAniList(route, params), 'anilist-fallback');
    } catch (error) {
      return sendApiError(res, error);
    }
  }

  const query = jikanParams.toString();
  try {
    const result = await requestJikan('/' + route + (query ? '?' + query : ''));
    return sendCatalogResult(res, result.data, 'jikan');
  } catch (jikanError) {
    try {
      const fallback = await discoverAniList(route, params);
      return sendCatalogResult(res, fallback, 'anilist-fallback');
    } catch (fallbackError) {
      fallbackError.status = 502;
      fallbackError.message = 'Não foi possível consultar Jikan nem AniList para esta categoria. Tente novamente em instantes.';
      return sendApiError(res, fallbackError);
    }
  }
}
