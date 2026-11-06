import { requestJikan, sendApiError } from '../../server/jikan.js';
import { fetchAniListByMalId, toJikanShape } from '../../server/anilist.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ message: 'Método não permitido.' });
  }

  const id = String(req.query.id || '');
  const numericId = Number(id);
  if (!Number.isSafeInteger(numericId) || numericId <= 0) {
    return res.status(400).json({ message: 'Identificador de anime inválido.' });
  }

  try {
    const result = await requestJikan('/anime/' + numericId + '/full');
    let anime = result.data;
    if (anime.episodes == null) {
      try {
        const alternate = await fetchAniListByMalId(numericId);
        const extra = toJikanShape(alternate);
        if (extra.episodes != null) anime = { ...anime, episodes: extra.episodes };
      } catch {
        // Preserve primary metadata when optional episode enrichment is unavailable.
      }
    }
    res.setHeader('X-Kataru-Catalog-Source', 'jikan');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json(anime);
  } catch (jikanError) {
    try {
      const media = await fetchAniListByMalId(numericId);
      res.setHeader('X-Kataru-Catalog-Source', 'anilist-fallback');
      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
      return res.status(200).json({ data: toJikanShape(media) });
    } catch (fallbackError) {
      fallbackError.status = 502;
      fallbackError.message = 'Não foi possível obter os detalhes deste anime nos catálogos disponíveis.';
      return sendApiError(res, fallbackError);
    }
  }
}
