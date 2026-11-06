const BASE = '/api/anime';

async function request(path) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 22000);

  try {
    const response = await fetch(`${BASE}${path}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        payload.message ||
        (response.status === 504
          ? 'O catálogo demorou demais para responder. Tente novamente.'
          : 'Não foi possível consultar o catálogo de animes agora.')
      );
    }

    return payload;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('A pesquisa demorou demais. Tente novamente em instantes.');
    }
    if (error instanceof TypeError) {
      throw new Error('Não foi possível acessar o serviço de pesquisa. Verifique sua conexão e tente novamente.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function searchAnime(query) {
  const data = await request(`/search?q=${encodeURIComponent(query)}`);
  return (data.data || []).map(normalizeAnime);
}

export async function fetchAnime(malId) {
  const data = await request(`/${encodeURIComponent(malId)}`);
  return normalizeAnime(data.data);
}

export function normalizeAnime(a) {
  return {
    mal_id: a.mal_id,
    title: a.title || 'Sem título',
    title_english: a.title_english || '',
    image_url: a.images?.webp?.large_image_url || a.images?.jpg?.large_image_url || '',
    synopsis: a.synopsis || '',
    episodes_total: a.episodes ?? null,
    year: a.year || a.aired?.prop?.from?.year || null,
    season: a.season || null,
    genres: (a.genres || []).map(g => g.name),
    score_external: a.score || null,
    api_synced_at: new Date().toISOString()
  };
}
