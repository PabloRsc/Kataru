import { requestJikan, sendApiError } from '../../server/jikan.js';

const ALLOWED_ROUTES = new Set([
  'seasons/now',
  'seasons/upcoming',
  'top/anime',
  'genres/anime',
  'anime'
]);

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

  const query = params.toString();
  try {
    const result = await requestJikan('/' + route + (query ? '?' + query : ''));
    res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=1800');
    res.setHeader('X-Kataru-Catalog-Source', 'jikan');
    return res.status(200).json(result.data);
  } catch (error) {
    return sendApiError(res, error);
  }
}
