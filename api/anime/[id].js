import { requestJikan, sendApiError } from '../../server/jikan.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ message: 'Método não permitido.' });
  }

  const id = String(req.query.id || '');
  if (!/^\\d+$/.test(id)) return res.status(400).json({ message: 'Identificador de anime inválido.' });

  try {
    const result = await requestJikan(`/anime/${id}/full`);
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json(result.data);
  } catch (error) {
    return sendApiError(res, error);
  }
}
