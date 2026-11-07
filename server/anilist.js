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
  format
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
    type: ({ MOVIE: 'Movie', TV_SHORT: 'TV' }[item.format] || item.format || ''),
    year: item.seasonYear ?? null,
    season: item.season?.toLowerCase() || null,
    genres: (item.genres || []).map(name => ({ name })),
    score: item.averageScore == null ? null : item.averageScore / 10
  };
}


const MAL_GENRE_NAME_BY_ID = {
  1: 'Action', 2: 'Adventure', 4: 'Comedy', 5: 'Avant Garde', 7: 'Mystery',
  8: 'Drama', 9: 'Ecchi', 10: 'Fantasy', 14: 'Horror', 22: 'Romance',
  24: 'Sci-Fi', 26: "Girls' Love", 28: "Boys' Love", 30: 'Sports',
  36: 'Slice of Life', 37: 'Supernatural', 41: 'Suspense',
  46: 'Award Winning', 47: 'Gourmet'
};

const normalizeGenreName = value => String(value || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

const MAL_GENRE_ID_BY_NAME = Object.fromEntries(
  Object.entries(MAL_GENRE_NAME_BY_ID).map(([id, name]) => [normalizeGenreName(name), Number(id)])
);

export function getAnimeGenreName(id) {
  return MAL_GENRE_NAME_BY_ID[Number(id)] || null;
}

export function getAnimeGenreId(name) {
  return MAL_GENRE_ID_BY_NAME[normalizeGenreName(name)] || null;
}

function currentAnimeSeason(date = new Date()) {
  const month = date.getUTCMonth();
  const seasons = ['WINTER', 'SPRING', 'SUMMER', 'FALL'];
  return { season: seasons[Math.floor(month / 3)], year: date.getUTCFullYear() };
}

function upcomingAnimeSeason(date = new Date()) {
  const currentSeasonIndex = Math.floor(date.getUTCMonth() / 3);
  const nextSeasonIndex = currentSeasonIndex + 1;
  const seasons = ['WINTER', 'SPRING', 'SUMMER', 'FALL'];
  return nextSeasonIndex >= 4
    ? { season: seasons[0], year: date.getUTCFullYear() + 1 }
    : { season: seasons[nextSeasonIndex], year: date.getUTCFullYear() };
}

export async function fetchAniListGenres() {
  const data = await queryAniList('query { GenreCollection }', {});
  return (data.GenreCollection || [])
    .filter(name => name && normalizeGenreName(name) !== 'hentai')
    .map(name => ({ mal_id: name, name }));
}

export async function discoverAniList(route, params = new URLSearchParams()) {
  if (route === 'genres/anime') return { data: await fetchAniListGenres() };

  const page = Math.max(1, Number(params.get('page') || 1));
  const perPage = Math.min(24, Math.max(1, Number(params.get('limit') || 24)));
  const filters = ['type: ANIME', 'isAdult: false'];
  const variableDefinitions = ['$page: Int!', '$perPage: Int!'];
  const variables = { page, perPage };

  if (route === 'seasons/now' || route === 'seasons/upcoming') {
    const seasonInfo = route === 'seasons/now' ? currentAnimeSeason() : upcomingAnimeSeason();
    filters.push('season: $season', 'seasonYear: $seasonYear');
    variableDefinitions.push('$season: MediaSeason', '$seasonYear: Int');
    variables.season = seasonInfo.season;
    variables.seasonYear = seasonInfo.year;
    if (route === 'seasons/upcoming') filters.push('status: NOT_YET_RELEASED');
  } else if (route === 'anime') {
    const genreName = params.get('genre') || getAnimeGenreName(params.get('genres'));
    if (!genreName) throw new Error('Não foi possível identificar o gênero solicitado.');
    filters.push('genre: $genre');
    variableDefinitions.push('$genre: String');
    variables.genre = genreName;
  } else if (route !== 'top/anime') {
    throw new Error('Categoria de catálogo não suportada pela fonte alternativa.');
  }

  filters.push('sort: [POPULARITY_DESC]');
  const query = 'query (' + variableDefinitions.join(', ') + ') { Page(page: $page, perPage: $perPage) {' +
    ' pageInfo { hasNextPage currentPage total } media(' + filters.join(', ') + ') {' + MEDIA_FIELDS + ' } } }';
  const data = await queryAniList(query, variables);
  const pageData = data.Page || {};
  const media = (pageData.media || []).filter(item => Number.isSafeInteger(item.idMal) && item.idMal > 0);

  return {
    data: media.map(toJikanShape),
    pagination: {
      current_page: pageData.pageInfo?.currentPage || page,
      has_next_page: Boolean(pageData.pageInfo?.hasNextPage),
      items: { total: pageData.pageInfo?.total || media.length }
    },
    fallback: true
  };
}
