import { requestJikan, sendApiError } from './jikan.js';
import { discoverAniList, getAnimeGenreId, getAnimeGenreName } from './anilist.js';

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

function hasCatalogEntries(payload) {
  return Array.isArray(payload?.data) && payload.data.length > 0;
}

async function sendAniListFallback(res, route, params) {
  try {
    const fallback = await discoverAniList(route, params);
    return sendCatalogResult(res, fallback, 'anilist-fallback');
  } catch (error) {
    error.status = 502;
    error.message = 'Não foi possível consultar Jikan nem AniList para esta categoria. Tente novamente em instantes.';
    return sendApiError(res, error);
  }
}

export default async function catalogHandler(req, res) {
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
  jikanParams.delete('ranking');

  if (route === 'anime' && genreName && !jikanParams.has('genres')) {
    const genreId = getAnimeGenreId(genreName);
    if (genreId) jikanParams.set('genres', String(genreId));
  }

  if (route === 'anime' && genreName && !jikanParams.has('genres')) {
    return sendAniListFallback(res, route, params);
  }

  const query = jikanParams.toString();
  let primaryPayload;
  try {
    const result = await requestJikan('/' + route + (query ? '?' + query : ''));
    primaryPayload = result.data;
  } catch {
    return sendAniListFallback(res, route, params);
  }

  if (hasCatalogEntries(primaryPayload)) {
    return sendCatalogResult(res, primaryPayload, 'jikan');
  }
  return sendAniListFallback(res, route, params);
}
