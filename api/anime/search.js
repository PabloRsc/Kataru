import { requestJikan, sendApiError } from '../../server/jikan.js';

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
    const result = await requestJikan(`/anime?${params.toString()}`);
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.status(200).json(result.data);
  } catch (error) {
    return sendApiError(res, error);
  }
}
