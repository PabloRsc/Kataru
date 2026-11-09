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
    // Ask both catalog sources in parallel. This avoids chaining several Jikan
    // episode-page requests for long-running titles and reduces serverless timeouts.
    const [jikanResult, aniListResult] = await Promise.allSettled([
      requestJikan('/anime/' + numericId + '/full'),
      fetchAniListByMalId(numericId)
    ]);

    if (jikanResult.status !== 'fulfilled' && aniListResult.status !== 'fulfilled') {
      const unavailable = new Error('Não foi possível consultar os catálogos de animes agora.');
      unavailable.status = 502;
      throw unavailable;
    }

    const jikanAnime = jikanResult.status === 'fulfilled' ? jikanResult.value.data : null;
    const aniListAnime = aniListResult.status === 'fulfilled' ? toJikanShape(aniListResult.value) : null;
    const hasJikanRelations = (jikanAnime?.relations || []).some(group => (group.entry || []).length > 0);
    const anime = {
      ...(jikanAnime || aniListAnime),
      ...(aniListAnime ? {
        episodes: jikanAnime?.episodes ?? aniListAnime.episodes,
        episodes_available: aniListAnime.episodes_available ?? jikanAnime?.episodes_available ?? null,
        status: jikanAnime?.status || aniListAnime.status,
        year: jikanAnime?.year || aniListAnime.year || null,
        aired: {
          ...(jikanAnime?.aired || {}),
          from: {
            ...(jikanAnime?.aired?.from || {}),
            date: jikanAnime?.aired?.from?.date || aniListAnime?.aired?.from?.date || null
          },
          to: {
            ...(jikanAnime?.aired?.to || {}),
            date: jikanAnime?.aired?.to?.date || aniListAnime?.aired?.to?.date || null
          }
        },
        ...(!hasJikanRelations && Array.isArray(aniListAnime.related_anime)
          ? { related_anime: aniListAnime.related_anime }
          : {})
      } : {})
    };

    res.setHeader('X-Kataru-Catalog-Source', jikanAnime && aniListAnime ? 'jikan+anilist' : jikanAnime ? 'jikan' : 'anilist-fallback');
    res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600');
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
