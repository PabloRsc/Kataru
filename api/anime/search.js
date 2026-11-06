import { requestJikan, sendApiError } from '../../server/jikan.js';
import { searchAniList, toJikanShape } from '../../server/anilist.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ message: 'Método não permitido.' });
  }

  const query = String(req.query.q || '').trim();
  if (!query) return res.status(400).json({ message: 'Informe o nome de um anime para pesquisar.' });
  if (query.length > 100) return res.status(400).json({ message: 'A pesquisa deve ter até 100 caracteres.' });

  const params = new URLSearchParams({
    q: query,
    limit: '8',
    sfw: 'true',
    order_by: 'popularity',
    sort: 'asc'
  });

  try {
    const result = await requestJikan('/anime?' + params.toString());
    let catalog = result.data;
    // Jikan reports the total as null for many currently-airing long runners.
    // Enrich those entries with AniList's current airing schedule when available.
    if (catalog.data?.some(item => item.episodes == null)) {
      try {
        const alternate = await searchAniList(query);
        const byMalId = new Map(alternate.map(item => [item.idMal, toJikanShape(item)]));
        catalog = {
          ...catalog,
          data: catalog.data.map(item => {
            const extra = byMalId.get(item.mal_id);
            return item.episodes == null && extra?.episodes != null
              ? { ...item, episodes: extra.episodes }
              : item;
          })
        };
      } catch {
        // Keep the primary catalog results even if optional enrichment is unavailable.
      }
    }
    res.setHeader('X-Kataru-Catalog-Source', 'jikan');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.status(200).json(catalog);
  } catch (jikanError) {
    try {
      const media = await searchAniList(query);
      res.setHeader('X-Kataru-Catalog-Source', 'anilist-fallback');
      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
      return res.status(200).json({
        data: media.map(toJikanShape),
        pagination: { has_next_page: false },
        fallback: true
      });
    } catch (fallbackError) {
      fallbackError.status = 502;
      fallbackError.message = 'Os catálogos principal e alternativo estão temporariamente indisponíveis. Tente novamente em instantes.';
      return sendApiError(res, fallbackError);
    }
  }
}
