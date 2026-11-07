const ANILIST_URL = 'https://graphql.anilist.co';

const MEDIA_FIELDS = `
  id
  idMal
  title { romaji english native }
  coverImage { large extraLarge }
  description(asHtml: false)
  episodes
  seasonYear
  season
  genres
  averageScore
  status
  nextAiringEpisode { episode airingAt }
`;

async function queryAniList(query, variables) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);

  try {
    const response = await fetch(ANILIST_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({ query, variables })
    });

    if (!response.ok) throw new Error('AniList HTTP ' + response.status);
    const payload = await response.json();
    if (payload.errors?.length) throw new Error('AniList GraphQL error');
    return payload.data;
  } finally {
    clearTimeout(timeout);
  }
}

export async function searchAniList(query) {
  const gql = `query ($search: String) {
    Page(page: 1, perPage: 8) {
      media(search: $search, type: ANIME, isAdult: false, sort: POPULARITY_DESC) {
        ${MEDIA_FIELDS}
      }
    }
  }`;
  const data = await queryAniList(gql, { search: query });
  return (data.Page?.media || []).filter(item => Number.isSafeInteger(item.idMal) && item.idMal > 0);
}

export async function fetchAniListByMalId(malId) {
  const gql = `query ($malId: Int) {
    Media(idMal: $malId, type: ANIME) { ${MEDIA_FIELDS} }
  }`;
  const data = await queryAniList(gql, { malId: Number(malId) });
  if (!data.Media) throw new Error('Anime não encontrado na fonte alternativa.');
  return data.Media;
}

export function toJikanShape(item) {
  const status = String(item.status || '').toUpperCase();
  const nextAiringNumber = Number(item.nextAiringEpisode?.episode || 0);
  const episodesAvailable = status === 'RELEASING' && nextAiringNumber > 0
    ? Math.max(0, nextAiringNumber - 1)
    : status === 'FINISHED' ? Number(item.episodes || 0) || null : null;

  return {
    mal_id: item.idMal,
    title: item.title?.romaji || item.title?.native || item.title?.english || 'Sem título',
    title_english: item.title?.english || '',
    images: {
      webp: { large_image_url: item.coverImage?.extraLarge || item.coverImage?.large || '' },
      jpg: { large_image_url: item.coverImage?.large || '' }
    },
    synopsis: (item.description || '').replace(/<[^>]*>/g, ''),
    episodes: item.episodes ?? null,
    episodes_available: episodesAvailable,
    status: item.status || null,
    year: item.seasonYear ?? null,
    season: item.season?.toLowerCase() || null,
    genres: (item.genres || []).map(name => ({ name })),
    score: item.averageScore == null ? null : item.averageScore / 10
  };
}
