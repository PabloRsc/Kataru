import { KATARU_MARK, KATARU_WORDMARK } from './brand-assets';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BookOpen, CalendarDays, Check, ChevronDown, ChevronLeft,
  ChevronRight, Clapperboard, Clock3, Compass, Filter, Grid2X2, Heart, Home,
  Library, List, ListPlus, LoaderCircle, LogOut, MoreHorizontal, Pencil, Plus,
  Search, Settings2, SlidersHorizontal, Sparkles, Star, Trash2, Trophy, Tv,
  UserRound, UserPlus, UserCheck, Users, X, Zap
} from 'lucide-react';
import { discoverAnime, fetchAnime, fetchAnimeGenres, searchAnime } from './api';
import {
  createAnimeList, deleteAnime, deleteAnimeList, getAnimeList, getAnimeLists,
  getCurrentKataruProfile, getFollowedKataruAnime, getFollowedKataruLists,
  getKataruProfile, getKataruRelationProfiles,
  getKataruSocialStats, isFollowingKataruUser, isKataruUsernameAvailable, searchKataruProfiles,
  followKataruUser, unfollowKataruUser, updateKataruProfile, uploadKataruAvatar, removeKataruAvatar,
  getKataruAvatarPath, saveAnime, saveAnimeList, storageMode, supabase
} from './storage';

const STATUSES = [
  { id: 'watching', label: 'Assistindo', short: 'Assistindo', tone: 'purple' },
  { id: 'completed', label: 'Assistido', short: 'Assistido', tone: 'green' },
  { id: 'planned', label: 'Quero assistir', short: 'Quero', tone: 'yellow' },
  { id: 'paused', label: 'Pausado', short: 'Pausado', tone: 'blue' },
  { id: 'dropped', label: 'Abandonado', short: 'Abandonado', tone: 'red' }
];

const EMPTY_FORM = {
  status: 'planned',
  episode_current: 0,
  episode_unknown: false,
  rating_personal: '',
  rewatch_count: 0,
  started_at: '',
  completed_at: '',
  title: '',
  is_manual: false
};

const DISCOVER_TABS = [
  { id: 'season', label: 'Temporada atual' },
  { id: 'popular', label: 'Em alta' },
  { id: 'upcoming', label: 'Próximos lançamentos' },
  { id: 'genres', label: 'Gêneros' }
];

const SORT_OPTIONS = [
  { id: 'franchise', label: 'Franquia (A–Z)' },
  { id: 'release', label: 'Lançamento (mais antigo)' },
  { id: 'release-desc', label: 'Lançamento (mais recente)' },
  { id: 'updated', label: 'Atualizado recentemente' },
  { id: 'added', label: 'Adicionado recentemente' },
  { id: 'title', label: 'Título (A–Z)' },
  { id: 'rating', label: 'Maior nota pessoal' },
  { id: 'progress', label: 'Maior progresso' }
];

const FORMAT_FILTERS = [
  { id: '', label: 'Todos' },
  { id: 'TV', label: 'Séries TV' },
  { id: 'Movie', label: 'Filmes' },
  { id: 'OVA', label: 'OVAs' },
  { id: 'ONA', label: 'ONAs' },
  { id: 'Special', label: 'Especiais' },
  { id: 'Music', label: 'Música' }
];

const formatDate = value => {
  if (!value) return '—';
  const date = new Date(value + (String(value).length === 10 ? 'T12:00:00' : ''));
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
};

const shortDate = value => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
};

const getAnimeAliases = anime => [...new Set([
  anime?.title,
  anime?.title_english,
  anime?.title_japanese,
  anime?.display_title,
  ...(Array.isArray(anime?.title_aliases) ? anime.title_aliases : []),
  ...(Array.isArray(anime?.title_synonyms) ? anime.title_synonyms : [])
].map(value => String(value || '').trim()).filter(Boolean))];

const normalizeAnimeTitle = value => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()
  .replace(/\s+/g, ' ');

function sameAnimeEntry(left, right) {
  if (!left || !right) return false;
  if (left.mal_id != null && right.mal_id != null && String(left.mal_id) === String(right.mal_id)) return true;

  const leftFormat = String(left.format || '').toLowerCase().trim();
  const rightFormat = String(right.format || '').toLowerCase().trim();
  if (leftFormat && rightFormat && leftFormat !== rightFormat) return false;

  const leftYear = Number(left.year) || null;
  const rightYear = Number(right.year) || null;
  if (leftYear && rightYear && leftYear !== rightYear) return false;

  const leftSeason = String(left.season || '').toLowerCase().trim();
  const rightSeason = String(right.season || '').toLowerCase().trim();
  if (leftSeason && rightSeason && leftSeason !== rightSeason) return false;

  const leftAliases = new Set(getAnimeAliases(left).map(normalizeAnimeTitle).filter(Boolean));
  const rightAliases = getAnimeAliases(right).map(normalizeAnimeTitle).filter(Boolean);
  if (!rightAliases.some(alias => leftAliases.has(alias))) return false;

  // Matching year/season and at least one official alias identify the same release.
  if (leftYear && rightYear && leftYear === rightYear) return true;
  if (leftSeason && rightSeason && leftSeason === rightSeason) return true;

  // If release metadata is incomplete, only accept an exact primary-title match.
  const leftPrimary = normalizeAnimeTitle(left.title || left.display_title);
  const rightPrimary = normalizeAnimeTitle(right.title || right.display_title);
  return Boolean(leftPrimary && leftPrimary === rightPrimary);
}

function uniqueAnimeEntries(entries) {
  const unique = [];
  (entries || []).forEach(anime => {
    if (!unique.some(existing => sameAnimeEntry(existing, anime))) unique.push(anime);
  });
  return unique;
}

const displayTitle = anime => anime?.display_title?.trim() || anime?.title || 'Sem título';
const totalEpisodes = anime => Number(anime?.episodes_total_manual || anime?.episodes_total || 0) || null;
const isCurrentlyAiring = anime => ['currently airing', 'currently_airing', 'releasing', 'airing', 'ongoing', 'em exibição']
  .includes(String(anime?.airing_status || '').trim().toLowerCase());
const latestAiredEpisode = anime => Number(anime?.episodes_available || 0) || null;
const episodeProgressLimit = anime => isCurrentlyAiring(anime)
  ? latestAiredEpisode(anime)
  : totalEpisodes(anime) || latestAiredEpisode(anime);
const statusLabel = id => STATUSES.find(status => status.id === id)?.label || 'Quero assistir';
const statusTone = id => STATUSES.find(status => status.id === id)?.tone || 'yellow';
const sortByRecent = (a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0);
const releaseDateOnly = value => {
  const match = String(value || '').match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : null;
};
const releaseTimestamp = anime => {
  const dateOnly = releaseDateOnly(anime?.release_date);
  const exact = dateOnly ? Date.parse(dateOnly + 'T12:00:00') : NaN;
  if (Number.isFinite(exact)) return exact;
  const year = Number(anime?.year) || null;
  return year ? Date.UTC(year, 0, 1) : null;
};
const compareReleaseDate = (a, b) => {
  const left = releaseTimestamp(a);
  const right = releaseTimestamp(b);
  if (left == null && right == null) return displayTitle(a).localeCompare(displayTitle(b), 'pt-BR');
  if (left == null) return 1;
  if (right == null) return -1;
  return left - right || displayTitle(a).localeCompare(displayTitle(b), 'pt-BR');
};
const formatReleaseLabel = anime => {
  const dateOnly = releaseDateOnly(anime?.release_date);
  if (dateOnly) {
    const date = new Date(dateOnly + 'T12:00:00');
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
    }
  }
  return anime?.year ? String(anime.year) : 'Data não informada';
};
const normalizeFranchiseTitle = value => normalizeAnimeTitle(value)
  .replace(/\b(?:\d+(?:st|nd|rd|th)|second|third|fourth|fifth|final) season\b/g, ' ')
  .replace(/\bseason\s+(?:\d+|[ivx]+)\b/g, ' ')
  .replace(/\b(?:part|cour)\s+(?:\d+|one|two|three|four|[ivx]+)\b/g, ' ')
  .replace(/\b(?:the )?(?:final season|movie|film|ova|ona|special)\b/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

// Um título-base antes de ":", travessões ou "/" ajuda a reconhecer franquias
// cujos arcos têm subtítulos diferentes, como "Bleach: ...".
const franchiseKeys = anime => {
  const keys = new Set();
  getAnimeAliases(anime).forEach(alias => {
    const normalized = normalizeFranchiseTitle(alias);
    if (normalized.length >= 4) keys.add(normalized);

    const prefix = String(alias || '').split(/\s*(?::|[–—]|\s-\s|\/|\|)\s*/)[0];
    const prefixKey = normalizeFranchiseTitle(prefix);
    if (prefixKey.length >= 4) keys.add(prefixKey);
  });
  return [...keys];
};

const compareLibraryOrder = (a, b, sortMode = 'release') => {
  if (sortMode === 'title') return displayTitle(a).localeCompare(displayTitle(b), 'pt-BR');
  if (sortMode === 'rating') return Number(b.rating_personal || 0) - Number(a.rating_personal || 0);
  if (sortMode === 'progress') {
    const left = Number(a.episode_current || 0) / (totalEpisodes(a) || 999999);
    const right = Number(b.episode_current || 0) / (totalEpisodes(b) || 999999);
    return right - left;
  }
  if (sortMode === 'added') return new Date(b.created_at || 0) - new Date(a.created_at || 0);
  if (sortMode === 'updated') return sortByRecent(a, b);
  if (sortMode === 'release-desc') return compareReleaseDate(b, a);
  return compareReleaseDate(a, b);
};

function groupAnimeByFranchise(entries, sortMode = 'release', relationEntries = entries) {
  const visibleEntries = entries || [];
  const catalogEntries = relationEntries || visibleEntries;
  const parent = new Map(catalogEntries.map(anime => [String(anime.mal_id), String(anime.mal_id)]));
  const find = id => {
    const current = parent.get(id);
    if (!current) return null;
    if (current === id) return id;
    const root = find(current);
    parent.set(id, root);
    return root;
  };
  const unite = (left, right) => {
    const a = find(left);
    const b = find(right);
    if (a && b && a !== b) parent.set(b, a);
  };

  const byFranchiseKey = new Map();
  catalogEntries.forEach(anime => {
    const id = String(anime.mal_id);
    (anime.related_anime || []).forEach(relation => {
      const relatedId = String(relation.mal_id || '');
      if (parent.has(relatedId)) unite(id, relatedId);
    });
    franchiseKeys(anime).forEach(key => {
      if (byFranchiseKey.has(key)) unite(id, byFranchiseKey.get(key));
      else byFranchiseKey.set(key, id);
    });
  });

  const fullGroups = new Map();
  catalogEntries.forEach(anime => {
    const key = find(String(anime.mal_id)) || String(anime.mal_id);
    if (!fullGroups.has(key)) fullGroups.set(key, []);
    fullGroups.get(key).push(anime);
  });

  const visibleGroups = new Map();
  visibleEntries.forEach(anime => {
    const key = find(String(anime.mal_id)) || String(anime.mal_id);
    if (!visibleGroups.has(key)) visibleGroups.set(key, []);
    visibleGroups.get(key).push(anime);
  });

  return [...visibleGroups.entries()]
    .map(([key, group]) => {
      const ordered = [...group].sort(compareReleaseDate);
      const franchiseItems = fullGroups.get(key) || group;
      const chronologicalCatalog = [...franchiseItems].sort(compareReleaseDate);
      const tvEntry = chronologicalCatalog.find(anime => String(anime.format || '').toUpperCase() === 'TV');
      return {
        key: String(ordered[0]?.mal_id || key),
        title: displayTitle(tvEntry || chronologicalCatalog[0] || ordered[0]),
        items: ordered,
        isFranchise: franchiseItems.length > 1
      };
    })
    .sort((a, b) => {
      if (sortMode === 'franchise' || sortMode === 'title') {
        return a.title.localeCompare(b.title, 'pt-BR', { sensitivity: 'base' });
      }
      const left = sortMode === 'release-desc' ? a.items[a.items.length - 1] : a.items[0];
      const right = sortMode === 'release-desc' ? b.items[b.items.length - 1] : b.items[0];
      return compareLibraryOrder(left, right, sortMode);
    });
};
const getInitials = value => String(value || 'K').trim().slice(0, 1).toUpperCase();
const KATARU_USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

export default function App() {
  const [items, setItems] = useState([]);
  const [lists, setLists] = useState([]);
  const [page, setPage] = useState('home');
  const [selected, setSelected] = useState(null);
  const [activeList, setActiveList] = useState(null);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('franchise');
  const [genreFilter, setGenreFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [formatFilter, setFormatFilter] = useState('');
  const [ratingFilter, setRatingFilter] = useState('');
  const [gridMode, setGridMode] = useState('grid');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchMode, setSearchMode] = useState('add');
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const searchRequestRef = useRef(0);
  const availabilityRequestsRef = useRef(new Set());
  const [editor, setEditor] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [toastAction, setToastAction] = useState(null);
  const [toastActionBusy, setToastActionBusy] = useState(false);
  const toastTimerRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [librarySyncBusy, setLibrarySyncBusy] = useState(false);
  const [librarySyncProgress, setLibrarySyncProgress] = useState(null);
  const [discoverTab, setDiscoverTab] = useState('season');
  const [discoverResults, setDiscoverResults] = useState([]);
  const [discoverRecommendations, setDiscoverRecommendations] = useState([]);
  const [discoverGenres, setDiscoverGenres] = useState([]);
  const [discoverGenre, setDiscoverGenre] = useState(null);
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [discoverMoreLoading, setDiscoverMoreLoading] = useState(false);
  const [discoverMoreError, setDiscoverMoreError] = useState('');
  const [discoverPage, setDiscoverPage] = useState(1);
  const [discoverHasMore, setDiscoverHasMore] = useState(false);
  const [discoverReload, setDiscoverReload] = useState(0);
  const [discoverError, setDiscoverError] = useState('');
  const [listEditorOpen, setListEditorOpen] = useState(false);
  const [listEditing, setListEditing] = useState(null);
  const [listForm, setListForm] = useState({ name: '', description: '', is_ranked: false });
  const [listSaving, setListSaving] = useState(false);
  const [pendingListId, setPendingListId] = useState(null);
  const [authUser, setAuthUser] = useState(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [communityOpen, setCommunityOpen] = useState(false);
  const [communityProfileRequest, setCommunityProfileRequest] = useState(0);
  const [communitySearchRequest, setCommunitySearchRequest] = useState(0);
  const [communityTargetProfile, setCommunityTargetProfile] = useState(null);
  const [communitySearchInitialQuery, setCommunitySearchInitialQuery] = useState('');
  const [communityReturnPage, setCommunityReturnPage] = useState('home');
  const [communityReturnProfile, setCommunityReturnProfile] = useState(null);
  const profileRef = useRef(null);

  useEffect(() => {
    if (!supabase) return undefined;
    let mounted = true;
    supabase.auth.getUser()
      .then(({ data }) => { if (mounted) setAuthUser(data?.user || null); })
      .catch(() => {});
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUser(session?.user || null);
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!profileOpen) return undefined;
    const closeOnPointer = event => {
      if (!profileRef.current?.contains(event.target)) setProfileOpen(false);
    };
    const closeOnEscape = event => { if (event.key === 'Escape') setProfileOpen(false); };
    document.addEventListener('pointerdown', closeOnPointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnPointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [profileOpen]);

  useEffect(() => {
    if (!searchOpen) setSearchMode('add');
  }, [searchOpen]);

  useEffect(() => {
    let mounted = true;
    getAnimeList()
      .then(data => { if (mounted) setItems(data || []); })
      .catch(error => notify(error.message || 'Não foi possível carregar sua coleção.'))
      .finally(() => { if (mounted) setLoading(false); });
    getAnimeLists()
      .then(data => { if (mounted) setLists(data || []); })
      .catch(error => { if (mounted) { setLists([]); notify(error.message || 'Não foi possível carregar suas listas.'); } });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const requestId = ++searchRequestRef.current;
    if (!searchOpen) return undefined;
    const q = searchQuery.trim();
    if (q.length < 2) {
      setResults([]);
      setSearchError('');
      setSearching(false);
      return undefined;
    }
    setResults([]);
    setSearchError('');
    setSearching(true);
    const timer = window.setTimeout(() => {
      searchAnime(q)
        .then(data => {
          if (requestId === searchRequestRef.current) setResults(data || []);
        })
        .catch(error => {
          if (requestId === searchRequestRef.current) setSearchError(error.message || 'Erro ao pesquisar o catálogo.');
        })
        .finally(() => {
          if (requestId === searchRequestRef.current) setSearching(false);
        });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [searchOpen, searchQuery]);

  useEffect(() => {
    if (page !== 'discover') return undefined;
    let active = true;
    setDiscoverLoading(true);
    setDiscoverMoreLoading(false);
    setDiscoverMoreError('');
    setDiscoverError('');
    setDiscoverResults([]);
    setDiscoverPage(1);
    setDiscoverHasMore(false);

    if (discoverTab === 'genres') {
      Promise.all([
        fetchAnimeGenres(),
        discoverAnime('popular', 1).catch(() => ({ items: [] }))
      ])
        .then(([genres, recommendations]) => {
          if (!active) return;
          setDiscoverGenres(genres || []);
          setDiscoverRecommendations(recommendations.items || []);
          setDiscoverResults([]);
        })
        .catch(error => {
          if (active) setDiscoverError(error.message || 'Não foi possível carregar os gêneros.');
        })
        .finally(() => { if (active) setDiscoverLoading(false); });
    } else {
      const kind = discoverTab === 'genre' && discoverGenre
        ? 'genre-' + encodeURIComponent(discoverGenre.name || discoverGenre.mal_id || '')
        : discoverTab;
      const recommendationKind = discoverTab === 'popular' ? 'top-rated' : 'popular';

      Promise.all([
        discoverAnime(kind, 1),
        discoverAnime(recommendationKind, 1).catch(() => ({ items: [] }))
      ])
        .then(([data, recommendations]) => {
          if (!active) return;
          setDiscoverResults(uniqueAnimeEntries(data.items || []));
          setDiscoverPage(data.page || 1);
          setDiscoverHasMore(Boolean(data.hasMore));
          setDiscoverRecommendations(recommendations.items || []);
        })
        .catch(error => {
          if (active) setDiscoverError(error.message || 'Não foi possível carregar o catálogo.');
        })
        .finally(() => { if (active) setDiscoverLoading(false); });
    }
    return () => { active = false; };
  }, [page, discoverTab, discoverGenre, discoverReload]);

  async function loadMoreDiscover() {
    if (discoverLoading || discoverMoreLoading || !discoverHasMore || discoverTab === 'genres') return;
    const kind = discoverTab === 'genre' && discoverGenre
      ? 'genre-' + encodeURIComponent(discoverGenre.name || discoverGenre.mal_id || '')
      : discoverTab;
    const nextPage = discoverPage + 1;
    setDiscoverMoreLoading(true);
    setDiscoverMoreError('');
    try {
      const response = await discoverAnime(kind, nextPage);
      setDiscoverResults(current => {
        const next = uniqueAnimeEntries(response.items || [])
          .filter(anime => !current.some(existing => sameAnimeEntry(existing, anime)));
        return [...current, ...next];
      });
      setDiscoverPage(response.page || nextPage);
      setDiscoverHasMore(Boolean(response.hasMore));
    } catch (error) {
      setDiscoverMoreError(error.message || 'Não foi possível carregar mais animes.');
    } finally {
      setDiscoverMoreLoading(false);
    }
  }

  useEffect(() => {
    items.filter(anime =>
      anime.status === 'watching' &&
      !anime.is_manual &&
      !anime.episodes_available &&
      (isCurrentlyAiring(anime) || !totalEpisodes(anime))
    ).forEach(anime => {
      const id = String(anime.mal_id);
      if (availabilityRequestsRef.current.has(id)) return;
      availabilityRequestsRef.current.add(id);
      fetchAnime(anime.mal_id).then(async fresh => {
        if (!fresh.episodes_available && !fresh.airing_status && !fresh.episodes_total) return;
        const merged = {
          ...anime,
          ...fresh,
          id: anime.id,
          status: anime.status,
          episode_current: anime.episode_current,
            episode_unknown: Boolean(anime.episode_unknown),
            rating_personal: anime.rating_personal,
          rewatch_count: anime.rewatch_count,
          started_at: anime.started_at,
          completed_at: anime.completed_at,
          episodes_available: fresh.episodes_available
        };
        await saveAnime(merged);
        setItems(current => current.map(item => String(item.mal_id) === id ? merged : item));
        setSelected(current => current && String(current.mal_id) === id ? merged : current);
      }).catch(() => {});
    });
  }, [items]);

  function notify(message, action = null) {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    setToast(message);
    setToastAction(action);
    setToastActionBusy(false);
    toastTimerRef.current = window.setTimeout(() => {
      setToast('');
      setToastAction(null);
      toastTimerRef.current = null;
    }, 3600);
  }

  useEffect(() => () => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
  }, []);

  const counts = useMemo(() => {
    const values = { all: items.length };
    STATUSES.forEach(status => { values[status.id] = items.filter(item => item.status === status.id).length; });
    return values;
  }, [items]);

  const visibleItems = useMemo(() => {
    const normalizedQuery = normalizeAnimeTitle(query);
    let data = items.filter(anime => {
      const matchesStatus = filter === 'all' || anime.status === filter;
      const matchesQuery = !normalizedQuery || getAnimeAliases(anime).some(alias => normalizeAnimeTitle(alias).includes(normalizedQuery));
      const matchesGenre = !genreFilter || (anime.genres || []).includes(genreFilter);
      const matchesYear = !yearFilter || String(anime.year || '') === yearFilter;
      const matchesFormat = !formatFilter || String(anime.format || '').toLowerCase() === formatFilter.toLowerCase();
      const matchesRating = !ratingFilter || (Number(anime.rating_personal || 0) >= Number(ratingFilter));
      return matchesStatus && matchesQuery && matchesGenre && matchesYear && matchesFormat && matchesRating;
    });
    if (sort === 'title') data.sort((a, b) => displayTitle(a).localeCompare(displayTitle(b), 'pt-BR'));
    else if (sort === 'rating') data.sort((a, b) => Number(b.rating_personal || 0) - Number(a.rating_personal || 0));
    else if (sort === 'progress') data.sort((a, b) => {
      const progressOf = anime => {
        const limit = episodeProgressLimit(anime);
        return limit ? Math.min(1, Math.max(0, Number(anime.episode_current || 0) / limit)) : 0;
      };
      return progressOf(b) - progressOf(a);
    });
    else if (sort === 'added') data.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    else if (sort === 'updated') data.sort(sortByRecent);
    else if (sort === 'release-desc') data.sort((a, b) => compareReleaseDate(b, a));
    else data.sort(compareReleaseDate);
    return data;
  }, [items, filter, query, sort, genreFilter, yearFilter, formatFilter, ratingFilter]);

  function navigate(nextPage) {
    setSelected(null);
    setActiveList(null);
    setPage(nextPage);
    if (nextPage === 'library') {
      setFilter('all');
      setQuery('');
    }
  }

  function openLibrary(status) {
    setPage('library');
    setSelected(null);
    setActiveList(null);
    setFilter(status || 'all');
  }

  function startAdd(result, initialStatus = 'planned') {
    const alreadySaved = items.find(item => sameAnimeEntry(item, result));
    if (alreadySaved) {
      setSearchOpen(false);
      setSelected(alreadySaved);
      setPendingListId(null);
      notify('Este anime já está na sua biblioteca.');
      return;
    }
    const anime = {
      ...result,
      id: String(result.mal_id),
      is_manual: Boolean(result.is_manual)
    };
    const completedCount = episodeProgressLimit(anime) || totalEpisodes(anime) || 0;
    setEditor(anime);
    setForm({
      ...EMPTY_FORM,
      status: initialStatus,
      episode_current: initialStatus === 'completed' ? completedCount : 0,
      title: result.title || ''
    });
    setSearchOpen(false);
    setSelected(null);
  }

  function startAddFromSharedAnime(sharedAnime) {
    const catalogEntry = {
      id: String(sharedAnime.mal_id),
      mal_id: Number(sharedAnime.mal_id),
      title: sharedAnime.title,
      title_english: sharedAnime.title_english,
      title_aliases: sharedAnime.title_aliases || [],
      display_title: sharedAnime.display_title || null,
      image_url: sharedAnime.image_url,
      synopsis: sharedAnime.synopsis,
      episodes_total: sharedAnime.episodes_total,
      episodes_total_manual: sharedAnime.episodes_total_manual,
      episodes_available: sharedAnime.episodes_available,
      airing_status: sharedAnime.airing_status,
      release_date: sharedAnime.release_date,
      end_date: sharedAnime.end_date,
      related_anime: sharedAnime.related_anime || [],
      year: sharedAnime.year,
      season: sharedAnime.season,
      format: sharedAnime.format,
      genres: sharedAnime.genres || [],
      studios: sharedAnime.studios || [],
      score_external: sharedAnime.score_external,
      is_manual: Boolean(sharedAnime.is_manual)
    };
    startAdd(catalogEntry);
  }

  function startAddToList(result, listId) {
    setPendingListId(listId);
    startAdd(result, 'planned');
  }

  function startManualAdd() {
    const id = Date.now();
    setEditor({ id: String(id), mal_id: id, title: '', image_url: '', synopsis: '', is_manual: true });
    setForm({ ...EMPTY_FORM, is_manual: true, status: 'planned' });
    setSearchOpen(false);
  }

  function startEdit(anime) {
    setEditor(anime);
    setForm({
      status: anime.status || 'planned',
      episode_current: anime.episode_current ?? 0,
      episode_unknown: Boolean(anime.episode_unknown),
            rating_personal: anime.rating_personal ?? '',
      rewatch_count: anime.rewatch_count ?? 0,
      started_at: anime.started_at || '',
      completed_at: anime.completed_at || '',
      title: anime.title || '',
      is_manual: Boolean(anime.is_manual)
    });
  }

  function doSearch(event) {
    event?.preventDefault();
  }

  async function submitAnime(event) {
    event.preventDefault();
    if (!editor) return;
    if (form.is_manual && !form.title.trim()) {
      notify('Informe o título do anime.');
      return;
    }
    setSaving(true);
    try {
      let catalogEditor = editor;
      if (!editor.is_manual && (!editor.release_date || !editor.related_anime?.length)) {
        try {
          const fresh = await fetchAnime(editor.mal_id);
          catalogEditor = {
            ...editor,
            ...fresh,
            id: editor.id,
            mal_id: editor.mal_id,
            status: editor.status,
            episode_current: editor.episode_current,
            episode_unknown: Boolean(editor.episode_unknown),
            rating_personal: editor.rating_personal,
            rewatch_count: editor.rewatch_count,
            started_at: editor.started_at,
            completed_at: editor.completed_at,
            display_title: editor.display_title,
            episodes_total_manual: editor.episodes_total_manual
          };
        } catch {
          // Save the selected search result even when the detail provider is temporarily unavailable.
        }
      }
      const catalogTotal = isCurrentlyAiring(catalogEditor) ? null : totalEpisodes(catalogEditor);
      const available = episodeProgressLimit(catalogEditor);
      const completedCount = catalogTotal || available || Number(catalogEditor.episode_current || 0);
      const anime = {
        ...catalogEditor,
        ...form,
        id: String(catalogEditor.id || catalogEditor.mal_id),
        mal_id: Number(catalogEditor.mal_id),
        title: form.is_manual ? form.title.trim() : (catalogEditor.title || form.title),
        episode_current: form.status === 'planned' ? 0
          : form.episode_unknown && ['paused', 'dropped'].includes(form.status) ? 0
          : form.status === 'completed' ? completedCount
          : Math.max(0, Number(form.episode_current || 0)),
        episode_unknown: ['paused', 'dropped'].includes(form.status) && Boolean(form.episode_unknown),
        rating_personal: form.status === 'paused' || form.rating_personal === '' ? null : Number(form.rating_personal),
        rewatch_count: form.status === 'completed' ? Math.max(0, Number(form.rewatch_count || 0)) : Number(editor.rewatch_count || 0),
        started_at: form.status === 'watching' ? (form.started_at || new Date().toISOString().slice(0, 10)) : editor.started_at || null,
        completed_at: form.status === 'completed' ? (form.completed_at || new Date().toISOString().slice(0, 10)) : null,
        updated_at: new Date().toISOString(),
        created_at: editor.created_at || new Date().toISOString()
      };
      const saved = await saveAnime(anime);
      const latest = await getAnimeList();
      setItems(latest);
      setEditor(null);
      if (pendingListId) {
        const targetListId = pendingListId;
        setPendingListId(null);
        setSelected(null);
        await addAnimeToList(saved || anime, targetListId);
        notify('Anime salvo e adicionado à lista.');
      } else {
        setSelected(saved || anime);
        notify('Anime salvo na sua biblioteca.');
      }
    } catch (error) {
      notify(error.message || 'Não foi possível salvar o anime.');
    } finally {
      setSaving(false);
    }
  }

  async function persistAnime(anime, message, undoAction = null) {
    try {
      await saveAnime({ ...anime, updated_at: new Date().toISOString() });
      const latest = await getAnimeList();
      setItems(latest);
      const current = latest.find(item => String(item.mal_id) === String(anime.mal_id)) || anime;
      if (selected && String(selected.mal_id) === String(anime.mal_id)) setSelected(current);
      notify(message || 'Alterações salvas.', undoAction);
      return current;
    } catch (error) {
      notify(error.message || 'Não foi possível salvar as alterações.');
      return null;
    }
  }

  async function changeEpisode(anime, delta) {
    const next = Math.max(0, Number(anime.episode_current || 0) + delta);
    const total = isCurrentlyAiring(anime) ? null : totalEpisodes(anime);
    const limit = episodeProgressLimit(anime);
    if (limit && next > limit) {
      notify('Você já chegou ao último episódio disponível informado pelo catálogo.');
      return;
    }
    let updated = { ...anime, episode_current: next, episode_unknown: false };
    if (total && next >= total) {
      updated.status = 'completed';
      updated.completed_at = updated.completed_at || new Date().toISOString().slice(0, 10);
    } else if (updated.status === 'completed') {
      updated.status = 'watching';
      updated.completed_at = null;
    }
    return persistAnime(updated, 'Progresso atualizado.', () => persistAnime(anime, 'Progresso restaurado.'));
  }

  async function restoreCatalogInEditor() {
    if (!editor || editor.is_manual) return false;
    try {
      const fresh = await fetchAnime(editor.mal_id);
      setEditor(current => current ? {
        ...current,
        ...fresh,
        id: current.id,
        mal_id: current.mal_id,
        created_at: current.created_at,
        status: current.status,
        episode_current: current.episode_current,
            episode_unknown: Boolean(current.episode_unknown),
            rating_personal: current.rating_personal,
        notes: current.notes,
        rewatch_count: current.rewatch_count,
        started_at: current.started_at,
        completed_at: current.completed_at,
        is_manual: false
      } : current);
      setForm(current => ({
        ...current,
        title: fresh.title || current.title
      }));
      notify('Dados do catálogo recarregados. Salve as alterações para aplicar.');
      return true;
    } catch (error) {
      notify(error.message || 'Não foi possível restaurar os dados do catálogo.');
      return false;
    }
  }

  async function changeStatus(anime, status) {
    const keepsUnknownEpisode = ['paused', 'dropped'].includes(status)
      && ['paused', 'dropped'].includes(anime.status)
      && Boolean(anime.episode_unknown);
    const updated = {
      ...anime,
      status,
      episode_unknown: keepsUnknownEpisode,
      rating_personal: status === 'paused' ? null : anime.rating_personal
    };
    if (keepsUnknownEpisode) updated.episode_current = 0;
    if (status === 'planned') {
      updated.episode_current = 0;
      updated.completed_at = null;
    }
    if (status === 'completed') {
      updated.episode_current = episodeProgressLimit(anime) || Number(anime.episode_current || 0);
      if (!updated.completed_at) updated.completed_at = new Date().toISOString().slice(0, 10);
    } else {
      updated.completed_at = null;
    }
    if (status === 'watching' && !updated.started_at) updated.started_at = new Date().toISOString().slice(0, 10);
    return persistAnime(updated, 'Status atualizado.');
  }

  async function changeRating(anime, stars) {
    if (anime.status === 'paused') return null;
    return persistAnime({ ...anime, rating_personal: stars ? stars * 2 : null }, 'Nota atualizada.');
  }

  async function removeAnime(anime) {
    if (!window.confirm('Remover "' + displayTitle(anime) + '" da sua biblioteca?')) return;
    try {
      await deleteAnime(anime.id);
      setItems(await getAnimeList());
      setSelected(null);
      notify('Anime removido da biblioteca.');
    } catch (error) {
      notify(error.message || 'Não foi possível remover o anime.');
    }
  }

  async function syncOne(anime) {
    if (anime.is_manual) {
      notify('Títulos adicionados manualmente não possuem sincronização de catálogo.');
      return;
    }
    try {
      const fresh = await fetchAnime(anime.mal_id);
      const merged = {
        ...anime,
        ...fresh,
        id: anime.id,
        status: anime.status,
        episode_current: anime.episode_current,
            episode_unknown: Boolean(anime.episode_unknown),
            rating_personal: anime.rating_personal,
        notes: anime.notes,
        display_title: anime.display_title,
        episodes_total_manual: anime.episodes_total_manual,
        episodes_available: fresh.episodes_available ?? anime.episodes_available ?? null,
        rewatch_count: anime.rewatch_count,
        started_at: anime.started_at,
        completed_at: anime.completed_at,
        updated_at: new Date().toISOString()
      };
      await saveAnime(merged);
      setItems(await getAnimeList());
      setSelected(merged);
      notify('Dados do catálogo atualizados.');
    } catch (error) {
      notify(error.message || 'Falha ao atualizar os dados.');
    }
  }

  async function syncLibraryMetadata() {
    const targets = items.filter(anime => !anime.is_manual);
    if (!targets.length || librarySyncBusy) return;
    setLibrarySyncBusy(true);
    setLibrarySyncProgress({ current: 0, total: targets.length, title: '' });
    let updated = 0;
    let failed = 0;

    try {
      for (let index = 0; index < targets.length; index += 1) {
        const anime = targets[index];
        setLibrarySyncProgress({ current: index, total: targets.length, title: displayTitle(anime) });
        try {
          const fresh = await fetchAnime(anime.mal_id);
          const merged = {
            ...anime,
            ...fresh,
            id: anime.id,
            status: anime.status,
            episode_current: anime.episode_current,
            episode_unknown: Boolean(anime.episode_unknown),
            rating_personal: anime.rating_personal,
            notes: anime.notes,
            display_title: anime.display_title,
            episodes_total_manual: anime.episodes_total_manual,
            episodes_available: fresh.episodes_available ?? anime.episodes_available ?? null,
            rewatch_count: anime.rewatch_count,
            started_at: anime.started_at,
            completed_at: anime.completed_at,
            api_synced_at: fresh.api_synced_at || new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          await saveAnime(merged);
          updated += 1;
          setItems(current => current.map(item => String(item.mal_id) === String(anime.mal_id) ? merged : item));
          setSelected(current => current && String(current.mal_id) === String(anime.mal_id) ? merged : current);
        } catch {
          failed += 1;
        }
        setLibrarySyncProgress({ current: index + 1, total: targets.length, title: displayTitle(anime) });
        if (index < targets.length - 1) {
          await new Promise(resolve => window.setTimeout(resolve, 380));
        }
      }
      try {
        setItems(await getAnimeList());
      } catch {
        // Keep the records already saved individually.
      }
      notify(failed
        ? `Atualização concluída: ${updated} títulos atualizados e ${failed} sem resposta do catálogo.`
        : `Datas e relações atualizadas em ${updated} títulos.`);
    } finally {
      setLibrarySyncBusy(false);
      setLibrarySyncProgress(null);
    }
  }

  async function saveCustomList(event) {
    event.preventDefault();
    if (!listForm.name.trim()) return;
    setListSaving(true);
    try {
      const payload = {
        ...(listEditing || {}),
        name: listForm.name.trim(),
        description: listForm.description.trim(),
        is_public: false,
        is_ranked: Boolean(listForm.is_ranked),
        anime_ids: listEditing?.anime_ids || [],
        updated_at: new Date().toISOString()
      };
      await saveAnimeList(payload);
      const refreshed = await getAnimeLists();
      setLists(refreshed);
      if (activeList && String(activeList.id) === String(payload.id)) {
        setActiveList(refreshed.find(item => String(item.id) === String(payload.id)) || payload);
      }
      setListEditorOpen(false);
      setListEditing(null);
      notify(listEditing ? 'Lista atualizada.' : 'Lista criada.');
    } catch (error) {
      notify(error.message || 'Não foi possível salvar a lista. Confira a configuração do banco.');
    } finally {
      setListSaving(false);
    }
  }

  function openListEditor(list) {
    setListEditing(list || null);
    setListForm({
      name: list?.name || '',
      description: list?.description || '',
      is_ranked: Boolean(list?.is_ranked)
    });
    setListEditorOpen(true);
  }

  async function removeList(list) {
    if (!window.confirm('Excluir a lista "' + list.name + '"? Os animes continuam na sua biblioteca.')) return;
    try {
      await deleteAnimeList(list.id);
      setLists(await getAnimeLists());
      setActiveList(null);
      notify('Lista excluída.');
    } catch (error) {
      notify(error.message || 'Não foi possível excluir a lista.');
    }
  }

  async function addAnimeToList(anime, listId) {
    const list = lists.find(item => String(item.id) === String(listId));
    if (!list) return;
    const ids = Array.from(new Set([...(list.anime_ids || []).map(String), String(anime.mal_id)]));
    try {
      await saveAnimeList({ ...list, anime_ids: ids, updated_at: new Date().toISOString() });
      const refreshed = await getAnimeLists();
      setLists(refreshed);
      if (activeList && String(activeList.id) === String(list.id)) {
        setActiveList(refreshed.find(item => String(item.id) === String(list.id)) || { ...list, anime_ids: ids });
      }
      notify('Anime adicionado à lista "' + list.name + '".');
    } catch (error) {
      notify(error.message || 'Não foi possível atualizar a lista.');
    }
  }

  async function removeAnimeFromList(list, anime) {
    const updated = { ...list, anime_ids: (list.anime_ids || []).filter(id => String(id) !== String(anime.mal_id)) };
    try {
      await saveAnimeList(updated);
      const refreshed = await getAnimeLists();
      setLists(refreshed);
      setActiveList(refreshed.find(item => String(item.id) === String(list.id)) || updated);
      notify('Anime removido da lista.');
    } catch (error) {
      notify(error.message || 'Não foi possível atualizar a lista.');
    }
  }

  async function moveAnimeInList(list, anime, direction) {
    const ids = (list.anime_ids || []).map(String);
    const currentIndex = ids.indexOf(String(anime.mal_id));
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= ids.length) return;
    [ids[currentIndex], ids[nextIndex]] = [ids[nextIndex], ids[currentIndex]];
    const updated = { ...list, anime_ids: ids, updated_at: new Date().toISOString() };
    try {
      await saveAnimeList(updated);
      const refreshed = await getAnimeLists();
      setLists(refreshed);
      setActiveList(refreshed.find(item => String(item.id) === String(list.id)) || updated);
      notify('Ordem da lista atualizada.');
    } catch (error) {
      notify(error.message || 'Não foi possível reordenar a lista.');
    }
  }

  const isInCollection = anime => items.some(item => sameAnimeEntry(item, anime));
  const watching = items.filter(item => item.status === 'watching').sort(sortByRecent);
  const completed = items.filter(item => item.status === 'completed').sort(sortByRecent);
  const planned = items.filter(item => item.status === 'planned').sort(sortByRecent);
  const recentlyUpdated = [...items].sort(sortByRecent).slice(0, 8);

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => navigate('home')} aria-label="Kataru — início">
          <img className="brand-mark" src={KATARU_MARK} alt="" />
          <img className="brand-wordmark" src={KATARU_WORDMARK} alt="Kataru" />
        </button>
        <nav className="main-nav" aria-label="Navegação principal">
          <button className={page === 'home' ? 'nav-link active' : 'nav-link'} onClick={() => navigate('home')}>Início</button>
          <button className={page === 'library' ? 'nav-link active' : 'nav-link'} onClick={() => navigate('library')}>Biblioteca</button>
          <button className={page === 'discover' ? 'nav-link active' : 'nav-link'} onClick={() => navigate('discover')}>Descobrir</button>
          <button className={page === 'lists' ? 'nav-link active' : 'nav-link'} onClick={() => navigate('lists')}>Listas</button>
                  </nav>
        <div className="topbar-actions">
          <button className="global-search" aria-label="Buscar usuários" onClick={() => {
            setCommunityReturnPage(page);
            setCommunityReturnProfile(page === 'community' ? communityTargetProfile : null);
            setCommunitySearchInitialQuery('');
            setCommunityOpen(true);
            setCommunitySearchRequest(value => value + 1);
          }}><Search size={16} /><span>Buscar usuários...</span></button>
          <button className="primary-button top-add" onClick={() => {
            setSearchMode('add'); setSearchOpen(true); setSearchQuery(''); setResults([]);
          }}><Plus size={16} />Adicionar anime</button>
          <div className="profile-menu" ref={profileRef}>
            <button className="profile-trigger" aria-label="Abrir perfil e conta" aria-expanded={profileOpen} onClick={() => setProfileOpen(open => !open)}>
              <span className="profile-avatar">
                {(authUser?.user_metadata?.avatar_url || authUser?.user_metadata?.picture)
                  ? <img src={authUser.user_metadata.avatar_url || authUser.user_metadata.picture} alt="" />
                  : getInitials(authUser?.user_metadata?.full_name || authUser?.user_metadata?.name || authUser?.email || 'K')}
              </span>
              <span className="profile-copy">
                <strong>{authUser?.user_metadata?.username || authUser?.user_metadata?.username || authUser?.user_metadata?.full_name || authUser?.user_metadata?.name || authUser?.email?.split('@')[0] || 'Biblioteca local'}</strong>
                <small>{authUser?.email || 'Dados salvos neste navegador'}</small>
              </span>
              <ChevronDown className="profile-chevron" size={14} />
            </button>
            {profileOpen && <div className="profile-dropdown" role="menu">
              <div className="profile-dropdown-user">
                <strong>{authUser?.user_metadata?.username || authUser?.user_metadata?.username || authUser?.user_metadata?.full_name || authUser?.user_metadata?.name || authUser?.email?.split('@')[0] || 'Biblioteca local'}</strong>
                <span>{authUser?.email || 'Seus dados ficam salvos neste navegador.'}</span>
              </div>
              {storageMode === 'supabase' && <button className="profile-signout" role="menuitem" onClick={() => {
                setProfileOpen(false);
                setCommunityReturnPage(page);
                setCommunityReturnProfile(page === 'community' ? communityTargetProfile : null);
                setCommunityTargetProfile(null);
                navigate('community');
                setCommunityProfileRequest(value => value + 1);
              }}><UserRound size={15} />Meu perfil</button>}
              {storageMode === 'supabase' && <button className="profile-signout" role="menuitem" onClick={async () => {
                setProfileOpen(false);
                const { error } = await supabase.auth.signOut();
                if (error) notify(error.message || 'Não foi possível sair da conta.');
              }}><LogOut size={15} />Sair da conta</button>}
            </div>}
          </div>
        </div>
      </header>

      <main className="main-content">
        {selected ? (
          <Detail
            anime={selected}
            lists={lists}
            onBack={() => setSelected(null)}
            onEdit={() => startEdit(selected)}
            onDelete={() => removeAnime(selected)}
            onSync={() => syncOne(selected)}
            onEpisodeChange={delta => changeEpisode(selected, delta)}
            onStatusChange={status => changeStatus(selected, status)}
            onRatingChange={stars => changeRating(selected, stars)}
            onAddToList={listId => addAnimeToList(selected, listId)}
          />
        ) : activeList ? (
          <CustomListDetail
            list={activeList}
            items={items}
            onBack={() => setActiveList(null)}
            onEdit={() => openListEditor(activeList)}
            onDelete={() => removeList(activeList)}
            onOpenAnime={setSelected}
            onRemoveAnime={anime => removeAnimeFromList(activeList, anime)}
            onMoveAnime={(anime, direction) => moveAnimeInList(activeList, anime, direction)}
            onAdd={() => { setPendingListId(activeList.id); setSearchMode('add'); setSearchOpen(true); setSearchQuery(''); setResults([]); }}
          />
        ) : page === 'home' ? (
          <HomePage
            items={items}
            watching={watching}
            completed={completed}
            planned={planned}
            recentlyUpdated={recentlyUpdated}
            loading={loading}
            counts={counts}
            onNavigate={navigate}
            onOpenLibrary={openLibrary}
            onOpenAnime={setSelected}
            onQuickEpisode={anime => changeEpisode(anime, 1)}
            onAdd={() => setSearchOpen(true)}
          />
        ) : page === 'library' ? (
          <LibraryPage
            items={visibleItems}
            allItems={items}
            loading={loading}
            counts={counts}
            filter={filter}
            setFilter={setFilter}
            query={query}
            setQuery={setQuery}
            sort={sort}
            setSort={setSort}
            gridMode={gridMode}
            setGridMode={setGridMode}
            genreFilter={genreFilter}
            setGenreFilter={setGenreFilter}
            yearFilter={yearFilter}
            setYearFilter={setYearFilter}
            formatFilter={formatFilter}
            setFormatFilter={setFormatFilter}
            ratingFilter={ratingFilter}
            setRatingFilter={setRatingFilter}
            onOpenAnime={setSelected}
            onAdd={() => setSearchOpen(true)}
            onSyncMetadata={syncLibraryMetadata}
            syncBusy={librarySyncBusy}
            syncProgress={librarySyncProgress}
          />
        ) : page === 'discover' ? (
          <DiscoverPage
            tab={discoverTab}
            setTab={value => { setDiscoverTab(value); setDiscoverGenre(null); }}
            results={discoverResults}
            recommendations={discoverRecommendations}
            genres={discoverGenres}
            lists={lists}
            loading={discoverLoading}
            hasMore={discoverHasMore}
            moreLoading={discoverMoreLoading}
            moreError={discoverMoreError}
            onLoadMore={loadMoreDiscover}
            error={discoverError}
            selectedGenre={discoverGenre}
            collection={items}
            onRetry={() => setDiscoverReload(value => value + 1)}
            onSelectGenre={genre => { setDiscoverGenre(genre); setDiscoverTab('genre'); }}
            onOpenAnime={anime => {
              const existing = items.find(item => String(item.mal_id) === String(anime.mal_id));
              if (existing) setSelected(existing);
              else startAdd(anime);
            }}
            onAdd={(anime, status = 'planned') => startAdd(anime, status)}
            onAddToList={(anime, listId) => startAddToList(anime, listId)}
            findInCollection={anime => items.find(item => String(item.mal_id) === String(anime.mal_id)) || null}
            isInCollection={isInCollection}
          />
        ) : page === 'community' ? (
          <CommunityPage
            open
            pageMode
            currentUserId={authUser?.id}
            initialProfile={communityTargetProfile}
            openMyProfileSignal={communityProfileRequest}
            acknowledgeMyProfileRequest={setCommunityProfileRequest}
            onBackToSearch={query => {
              setCommunityTargetProfile(communityReturnProfile);
              setPage(communityReturnPage || 'home');
              setCommunitySearchInitialQuery(query || '');
              setCommunityOpen(true);
              setCommunitySearchRequest(value => value + 1);
            }}
            onOpenProfile={profile => setCommunityTargetProfile(profile)}
            onActiveProfileChange={setCommunityTargetProfile}
            onAddSharedAnime={startAddFromSharedAnime}
            onOpenOwnAnime={setSelected}
          />
        ) : (
          <ListsPage
            items={items}
            lists={lists}
            counts={counts}
            onOpenStatus={status => openLibrary(status)}
            onOpenList={setActiveList}
            onNewList={() => openListEditor(null)}
            onEditList={openListEditor}
          />
        )}
      </main>

      <footer className="footer">
        <img className="footer-wordmark" src={KATARU_WORDMARK} alt="Kataru" />
        <span>Seu universo de animes, em um só lugar.</span>
        <nav className="footer-legal" aria-label="Informações legais">
          <a href="/termos.html" target="_blank" rel="noopener noreferrer">Termos</a>
          <a href="/privacidade.html" target="_blank" rel="noopener noreferrer">Privacidade</a>
        </nav>
        <span className="storage-label">{storageMode === 'supabase' ? 'Sincronizado na nuvem' : 'Salvo neste navegador'}</span>
      </footer>

      <nav className="mobile-nav" aria-label="Navegação mobile">
        <button className={page === 'home' ? 'mobile-nav-item active' : 'mobile-nav-item'} onClick={() => navigate('home')}><Home size={19} /><span>Início</span></button>
        <button className={page === 'library' ? 'mobile-nav-item active' : 'mobile-nav-item'} onClick={() => navigate('library')}><Library size={19} /><span>Biblioteca</span></button>
        <button className="mobile-nav-add" onClick={() => setSearchOpen(true)}><Plus size={21} /></button>
        <button className={page === 'discover' ? 'mobile-nav-item active' : 'mobile-nav-item'} onClick={() => navigate('discover')}><Compass size={19} /><span>Descobrir</span></button>
        <button className={page === 'lists' ? 'mobile-nav-item active' : 'mobile-nav-item'} onClick={() => navigate('lists')}><List size={19} /><span>Listas</span></button>
      </nav>

      {communityOpen && (
        <CommunityPage
          open
          currentUserId={authUser?.id}
          initialQuery={communitySearchInitialQuery}
          onClose={() => setCommunityOpen(false)}
          onOpenProfile={(profile, query) => {
            setCommunityTargetProfile(profile);
            setCommunitySearchInitialQuery(query || '');
            setCommunityOpen(false);
            navigate('community');
          }}
          focusSearchSignal={communitySearchRequest}
          acknowledgeSearchRequest={setCommunitySearchRequest}
        />
      )}

      {searchOpen && (
        <SearchModal
          query={searchQuery}
          setQuery={setSearchQuery}
          searchMode={searchMode}
          results={results}
          searching={searching}
          error={searchError}
          onSearch={doSearch}
          onClose={() => { setSearchOpen(false); setPendingListId(null); setSearchQuery(''); setResults([]); }}
          onAdd={result => {
            const existing = items.find(item => String(item.mal_id) === String(result.mal_id));
            if (pendingListId && existing) {
              addAnimeToList(existing, pendingListId);
              setPendingListId(null);
              setSearchOpen(false);
            } else startAdd(result);
          }}
          onOpenExisting={anime => { setSelected(anime); setSearchOpen(false); }}
          onManual={startManualAdd}
          isInCollection={isInCollection}
          allowExisting={Boolean(pendingListId)}
          libraryItems={items}
          alreadyInListIds={lists.find(list => String(list.id) === String(pendingListId))?.anime_ids || []}
          targetListName={lists.find(list => String(list.id) === String(pendingListId))?.name || ''}
        />
      )}

      {editor && (
        <EditorModal
          anime={editor}
          form={form}
          setForm={setForm}
          saving={saving}
          onSubmit={submitAnime}
          onClose={() => { setEditor(null); setPendingListId(null); }}
          onRestoreCatalog={restoreCatalogInEditor}
        />
      )}

      {listEditorOpen && (
        <ListEditorModal
          list={listEditing}
          form={listForm}
          setForm={setListForm}
          saving={listSaving}
          onSubmit={saveCustomList}
          onClose={() => { setListEditorOpen(false); setListEditing(null); }}
        />
      )}

      {toast && <div className={'toast' + (/could not find|schema cache|não foi possível|erro|falha|ainda não foram habilitadas|ainda não estão configuradas|banco .*desatualizado/i.test(toast) ? ' toast-error' : '')}>{/could not find|schema cache|não foi possível|erro|falha|ainda não foram habilitadas|ainda não estão configuradas|banco .*desatualizado/i.test(toast) ? <AlertCircle size={16} /> : <Check size={16} />}<span>{toast}</span>{toastAction && <button type="button" disabled={toastActionBusy} onClick={async () => {
        if (!toastAction || toastActionBusy) return;
        setToastActionBusy(true);
        await toastAction();
        setToastAction(null);
        setToastActionBusy(false);
      }}>{toastActionBusy ? 'Desfazendo…' : 'Desfazer'}</button>}</div>}
    </div>
  );
}

function KataruMark({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <defs><linearGradient id="kataru-mark-gradient" x1="5" y1="5" x2="43" y2="43" gradientUnits="userSpaceOnUse"><stop stopColor="#B7A9FF"/><stop offset="1" stopColor="#7866F5"/></linearGradient></defs>
      <rect x="4" y="4" width="40" height="40" rx="12" fill="url(#kataru-mark-gradient)"/>
      <path d="M15 12V36M15 24L31 12M15 24L32 36" stroke="#171522" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M34 7.5V14.5M30.5 11H37.5" stroke="#FFD36A" strokeWidth="2.4" strokeLinecap="round"/>
    </svg>
  );
}

function PageIntro({ eyebrow, title, subtitle, action }) {
  return (
    <div className="page-intro">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}<span className="heading-dot">.</span></h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

function HomePage({ items, watching, completed, planned, recentlyUpdated, loading, counts, onNavigate, onOpenLibrary, onOpenAnime, onQuickEpisode, onAdd }) {
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const featured = watching[featuredIndex] || watching[0] || null;
  const currentEpisode = Math.max(0, Number(featured?.episode_current || 0) || 0);
  const expectedTotal = featured && !isCurrentlyAiring(featured) ? totalEpisodes(featured) : null;
  const available = featured ? episodeProgressLimit(featured) : null;
  const nextEpisode = currentEpisode + 1;
  const progressTotal = expectedTotal || available;
  const canMarkNext = Boolean(featured && (!progressTotal || currentEpisode < progressTotal));
  const progress = progressTotal ? Math.min(100, Math.max(0, Math.round((currentEpisode / progressTotal) * 100))) : 0;

  useEffect(() => {
    if (watching.length < 2) {
      setFeaturedIndex(0);
      return undefined;
    }
    const timer = window.setInterval(() => {
      setFeaturedIndex(current => (current + 1) % watching.length);
    }, 60000);
    return () => window.clearInterval(timer);
  }, [watching.length]);

  useEffect(() => {
    if (featuredIndex >= watching.length) setFeaturedIndex(0);
  }, [featuredIndex, watching.length]);

  return (
    <div className="home-page">
      {featured ? (
        <section className="continue-hero">
          <div
            className="continue-backdrop"
            aria-hidden="true"
            style={featured.image_url ? { backgroundImage: 'url("' + featured.image_url + '")' } : undefined}
          />
          <div className="continue-copy">
            <span className="hero-kicker"><Zap size={13} fill="currentColor" /> CONTINUE DE ONDE PAROU</span>
            <button className="continue-title" onClick={() => onOpenAnime(featured)}>{displayTitle(featured)}</button>
            <p className="continue-episode-count">
              {expectedTotal ? expectedTotal + ' episódios' : available ? available + (isCurrentlyAiring(featured) ? ' episódios lançados até agora' : ' episódios') : 'Série em andamento'}
            </p>
            <div className={progressTotal ? 'hero-progress' : 'hero-progress is-indeterminate'}>
              <div><span style={{ width: (progressTotal ? progress : 34) + '%' }} /></div>
              <small>{expectedTotal ? 'EP. ' + currentEpisode + ' / ' + expectedTotal : available ? 'EP. ' + currentEpisode + ' / ' + available + (isCurrentlyAiring(featured) ? ' lançados' : '') : 'EP. ' + currentEpisode}</small>
            </div>
            <div className="hero-actions">
              {canMarkNext
                ? <button className="primary-button" onClick={() => onQuickEpisode(featured)}><Check size={15} />Marcar ep. {nextEpisode} como visto</button>
                : <span className="hero-up-to-date">{available && currentEpisode >= available ? 'Você está em dia com os episódios lançados.' : 'O catálogo ainda não confirmou o próximo episódio.'}</span>}
              <button className="hero-secondary" onClick={() => onOpenAnime(featured)}>Ver detalhes <ArrowRight size={15} /></button>
            </div>
          </div>
          <button className="continue-poster" onClick={() => onOpenAnime(featured)} aria-label={'Abrir ' + displayTitle(featured)}>
            {featured.image_url
              ? <img src={featured.image_url} alt={'Capa de ' + displayTitle(featured)} />
              : <span><Clapperboard size={34} /></span>}
          </button>
          {watching.length > 1 && (
            <>
              <button className="continue-side-control continue-side-prev" onClick={() => setFeaturedIndex(current => (current - 1 + watching.length) % watching.length)} aria-label="Anime anterior"><ChevronLeft size={21} /></button>
              <button className="continue-side-control continue-side-next" onClick={() => setFeaturedIndex(current => (current + 1) % watching.length)} aria-label="Próximo anime"><ChevronRight size={21} /></button>
            </>
          )}
        </section>
      ) : (
        <section className="welcome-hero">
          <div className="welcome-orb orb-one" /><div className="welcome-orb orb-two" />
          <div className="welcome-copy">
            <span className="hero-kicker"><Sparkles size={13} /> SUA PRÓXIMA HISTÓRIA COMEÇA AQUI</span>
            <h2>Sua biblioteca começa com uma boa história.</h2>
            <p>Adicione animes que você acompanha ou explore o catálogo para encontrar seu próximo favorito.</p>
            <div className="hero-actions"><button className="primary-button" onClick={onAdd}><Plus size={16} />Adicionar anime</button><button className="hero-secondary" onClick={() => onNavigate('discover')}>Explorar catálogo <ArrowRight size={15} /></button></div>
          </div>
          <div className="welcome-symbol"><Clapperboard size={58} strokeWidth={1.1} /></div>
        </section>
      )}

      <div className="home-summary" aria-label="Resumo da biblioteca">
        <div><strong>{counts.completed || 0}</strong><span>assistidos</span></div>
        <div><strong>{counts.watching || 0}</strong><span>assistindo</span></div>
        <div><strong>{counts.planned || 0}</strong><span>quero assistir</span></div>
        <div><strong>{counts.dropped || 0}</strong><span>abandonados</span></div>
      </div>

      {loading ? <div className="loading-block"><LoaderCircle className="spin" />Preparando sua biblioteca...</div> : (
        <>
          <AnimeShelf title="Atualizados recentemente" subtitle="Os animes com atividade mais recente na sua biblioteca" items={recentlyUpdated} onViewAll={() => onOpenLibrary('all')} onOpenAnime={onOpenAnime} />
          <AnimeShelf title="Assistindo" subtitle="Continue acompanhando suas histórias" items={watching.slice(0, 8)} onViewAll={() => onOpenLibrary('watching')} onOpenAnime={onOpenAnime} />
          <AnimeShelf title="Assistidos recentemente" subtitle="Histórias que já chegaram ao fim" items={completed.slice(0, 8)} onViewAll={() => onOpenLibrary('completed')} onOpenAnime={onOpenAnime} />
          <AnimeShelf title="Quero assistir" subtitle="Sua próxima maratona pode estar aqui" items={planned.slice(0, 8)} onViewAll={() => onOpenLibrary('planned')} onOpenAnime={onOpenAnime} />
          {!items.length && <div className="empty-home-note"><BookOpen size={18} /><span>Quando adicionar animes, sua atividade aparecerá aqui.</span></div>}
        </>
      )}
    </div>
  );
}

function AnimeShelf({ title, subtitle, items, onViewAll, onOpenAnime }) {
  if (!items.length) return null;
  return (
    <section className="shelf-section">
      <div className="section-heading">
        <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
        <button className="text-link" onClick={onViewAll}>Ver tudo <ArrowRight size={14} /></button>
      </div>
      <div className="poster-rail">{items.map(anime => <PosterCard key={anime.id} anime={anime} onClick={() => onOpenAnime(anime)} />)}</div>
    </section>
  );
}

function PosterCard({ anime, onClick, compact = false, showProgress = true }) {
  const total = episodeProgressLimit(anime);
  const currentEpisode = Math.max(0, Number(anime.episode_current || 0) || 0);
  const progress = total ? Math.min(100, Math.max(0, (currentEpisode / total) * 100)) : 0;
  return (
    <button className={compact ? 'poster-card compact' : 'poster-card'} onClick={onClick} title={displayTitle(anime)}>
      <div className="poster-art">
        {anime.image_url ? <img src={anime.image_url} alt={'Pôster de ' + displayTitle(anime)} loading="lazy" /> : <div className="poster-fallback"><Clapperboard size={25} /></div>}
        <span className={'status-pill tone-' + statusTone(anime.status)}>{statusLabel(anime.status)}</span>
        {anime.format && <span className="poster-format-pill">{localizedFormat(anime.format)}</span>}
        {!['watching', 'paused'].includes(anime.status) && anime.rating_personal !== null && anime.rating_personal !== '' && <span className="poster-rating"><Star size={10} fill="currentColor" />{(Number(anime.rating_personal) / 2).toFixed(1)}</span>}
        {showProgress && anime.status === 'watching' && <>
          <span className={total ? 'poster-progress' : 'poster-progress is-indeterminate'}><i style={{ width: (total ? progress : 34) + '%' }} /></span>
          <span className="poster-episode-count">EP. {currentEpisode}{total ? ' / ' + total : ''}</span>
        </>}
      </div>
      <span className="poster-name">{displayTitle(anime)}</span>
      <span className="poster-meta">{formatReleaseLabel(anime)}</span>
    </button>
  );
}

function LibraryPage({
  items, allItems, loading, counts, filter, setFilter, query, setQuery, sort, setSort,
  gridMode, setGridMode, genreFilter, setGenreFilter, yearFilter, setYearFilter,
  formatFilter, setFormatFilter, ratingFilter, setRatingFilter, onOpenAnime, onAdd,
  onSyncMetadata, syncBusy, syncProgress
}) {
  const genres = Array.from(new Set(allItems.flatMap(anime => anime.genres || []))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const years = Array.from(new Set(allItems.map(anime => anime.year).filter(Boolean))).sort((a, b) => b - a);
  const normalizedQuery = normalizeAnimeTitle(query);
  const formatCountScopeItems = allItems.filter(anime => {
    const matchesStatus = filter === 'all' || anime.status === filter;
    const matchesQuery = !normalizedQuery || getAnimeAliases(anime).some(alias => normalizeAnimeTitle(alias).includes(normalizedQuery));
    const matchesGenre = !genreFilter || (anime.genres || []).includes(genreFilter);
    const matchesYear = !yearFilter || String(anime.year || '') === yearFilter;
    const matchesRating = !ratingFilter || Number(anime.rating_personal || 0) >= Number(ratingFilter);
    return matchesStatus && matchesQuery && matchesGenre && matchesYear && matchesRating;
  });
  const filtersActive = Boolean(query || genreFilter || yearFilter || formatFilter || ratingFilter);
  const orderedItems = groupAnimeByFranchise(items, sort, allItems)
    .flatMap(group => group.items);
  const searchInputRef = useRef(null);
  useEffect(() => {
    const focusLibrarySearch = event => {
      const target = event.target;
      const isTyping = target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey || isTyping) return;
      event.preventDefault();
      searchInputRef.current?.focus();
    };
    window.addEventListener('keydown', focusLibrarySearch);
    return () => window.removeEventListener('keydown', focusLibrarySearch);
  }, []);
  function clearFilters() { setQuery(''); setGenreFilter(''); setYearFilter(''); setFormatFilter(''); setRatingFilter(''); }

  return (
    <div className="library-page">
      <PageIntro
        eyebrow="SUA COLEÇÃO PESSOAL"
        title="Biblioteca"
        subtitle="Uma única biblioteca, organizada por franquia em ordem alfabética e por lançamento dentro de cada franquia."
        action={<div className="library-view-actions">
          <button className="outline-button library-sync-button" onClick={onSyncMetadata} disabled={syncBusy || !allItems.some(anime => !anime.is_manual)}>
            {syncBusy ? `Atualizando ${syncProgress?.current || 0}/${syncProgress?.total || 0}...` : 'Atualizar datas e temporadas'}
          </button>
          <div className="view-toggle"><button className={gridMode === 'grid' ? 'selected' : ''} onClick={() => setGridMode('grid')} aria-label="Visualização em grade"><Grid2X2 size={16} />Grade</button><button className={gridMode === 'list' ? 'selected' : ''} onClick={() => setGridMode('list')} aria-label="Visualização em lista"><List size={16} />Lista</button></div>
        </div>}
      />
      <div className="status-tabs">
        <button className={filter === 'all' ? 'status-tab active' : 'status-tab'} onClick={() => setFilter('all')}>Todos <span>{counts.all}</span></button>
        {STATUSES.map(status => <button key={status.id} className={filter === status.id ? 'status-tab active' : 'status-tab'} onClick={() => setFilter(status.id)}>{status.label} <span>{counts[status.id] || 0}</span></button>)}
      </div>
      <div className="library-format-tabs" aria-label="Categorias de anime">
        {FORMAT_FILTERS.map(category => {
          const count = category.id
            ? formatCountScopeItems.filter(anime => String(anime.format || '').toUpperCase() === category.id.toUpperCase()).length
            : formatCountScopeItems.length;
          return <button key={category.id || 'all'} className={formatFilter === category.id ? 'active' : ''} onClick={() => setFormatFilter(category.id)}>{category.label}<span>{count}</span></button>;
        })}
      </div>
      <div className="library-toolbar">
        <label className="search-field"><Search size={16} /><input ref={searchInputRef} value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar na biblioteca" aria-label="Buscar na biblioteca" /><kbd>/</kbd>{query && <button onClick={() => setQuery('')} aria-label="Limpar busca"><X size={14} /></button>}</label>
        <div className="filter-controls">
          <label className="select-filter"><SlidersHorizontal size={14} /><select value={sort} onChange={event => setSort(event.target.value)}>{SORT_OPTIONS.map(option => <option key={option.id} value={option.id}>Ordenar: {option.label}</option>)}</select><ChevronDown size={13} /></label>
          <label className="select-filter"><select value={genreFilter} onChange={event => setGenreFilter(event.target.value)}><option value="">Gênero</option>{genres.map(genre => <option key={genre}>{genre}</option>)}</select><ChevronDown size={13} /></label>
          <label className="select-filter"><select value={yearFilter} onChange={event => setYearFilter(event.target.value)}><option value="">Ano</option>{years.map(year => <option key={year} value={year}>{year}</option>)}</select><ChevronDown size={13} /></label>
          <label className="select-filter"><select value={ratingFilter} onChange={event => setRatingFilter(event.target.value)}><option value="">Nota</option><option value="8">4 estrelas ou mais</option><option value="6">3 estrelas ou mais</option><option value="4">2 estrelas ou mais</option></select><ChevronDown size={13} /></label>
        </div>
      </div>
      {filtersActive && <div className="active-filters"><span>Filtros ativos:</span>{query && <button className="filter-chip" onClick={() => setQuery('')}>Busca: {query}<X size={12} /></button>}{genreFilter && <button className="filter-chip" onClick={() => setGenreFilter('')}>{genreFilter}<X size={12} /></button>}{yearFilter && <button className="filter-chip" onClick={() => setYearFilter('')}>{yearFilter}<X size={12} /></button>}{formatFilter && <button className="filter-chip" onClick={() => setFormatFilter('')}>{FORMAT_FILTERS.find(category => category.id === formatFilter)?.label || localizedFormat(formatFilter)}<X size={12} /></button>}{ratingFilter && <button className="filter-chip" onClick={() => setRatingFilter('')}>{ratingFilter === '8' ? 'Nota: 4 estrelas ou mais' : ratingFilter === '6' ? 'Nota: 3 estrelas ou mais' : 'Nota: 2 estrelas ou mais'}<X size={12} /></button>}<button className="clear-filters" onClick={clearFilters}>Limpar tudo</button></div>}
      {syncBusy && syncProgress && <div className="library-sync-status" role="status">
        <span>Consultando catálogo: {syncProgress.current} de {syncProgress.total}{syncProgress.title ? ' · ' + syncProgress.title : ''}</span>
        <i><b style={{ width: (syncProgress.total ? syncProgress.current / syncProgress.total * 100 : 0) + '%' }} /></i>
      </div>}
      <div className="results-summary"><span>{items.length} {items.length === 1 ? 'resultado' : 'resultados'}</span><span>{filter === 'all' ? 'Todos os status' : statusLabel(filter)}</span></div>
      {loading ? <div className="loading-block"><LoaderCircle className="spin" />Carregando sua biblioteca...</div> : items.length ? (
        gridMode === 'grid' ? (
          <div className="library-grid">
            {orderedItems.map(anime => <PosterCard key={anime.id} anime={anime} onClick={() => onOpenAnime(anime)} />)}
          </div>
        ) : (
          <div className="library-list">
            {orderedItems.map(anime => <AnimeRow key={anime.id} anime={anime} onClick={() => onOpenAnime(anime)} />)}
          </div>
        )
      ) : (
        <div className="empty-state">
          <div className="empty-state-icon"><Library size={25} /></div>
          <h2>{query || filtersActive ? 'Nenhum anime encontrado' : filter === 'all' ? 'Sua biblioteca está vazia' : 'Nenhum título nesta lista'}</h2>
          <p>{query || filtersActive ? 'Experimente remover alguns filtros ou buscar outro título.' : 'Busque um anime e escolha em qual lista ele entra.'}</p>
          <div className="empty-actions"><button className="primary-button" onClick={onAdd}><Plus size={15} />Adicionar anime</button>{filtersActive && <button className="outline-button" onClick={clearFilters}>Limpar filtros</button>}</div>
        </div>
      )}
    </div>
  );
}

function AnimeRow({ anime, onClick }) {
  const total = episodeProgressLimit(anime);
  const currentEpisode = Math.max(0, Number(anime.episode_current || 0) || 0);
  const pct = total ? Math.min(100, Math.max(0, Math.round((currentEpisode / total) * 100))) : 0;
  return (
    <button className="anime-row" onClick={onClick}>
      {anime.image_url ? <img src={anime.image_url} alt="" loading="lazy" /> : <div className="row-fallback"><Clapperboard size={20} /></div>}
      <span className="row-title"><strong>{displayTitle(anime)}</strong><small>{formatReleaseLabel(anime)} · {localizedFormat(anime.format)}</small></span>
      <span className={'row-status tone-' + statusTone(anime.status)}>{statusLabel(anime.status)}</span>
      <span className={anime.episode_unknown && ['paused', 'dropped'].includes(anime.status) ? 'row-progress is-unknown' : !total && anime.status === 'watching' ? 'row-progress is-indeterminate' : 'row-progress'}>{anime.episode_unknown && ['paused', 'dropped'].includes(anime.status) ? 'Episódio não lembrado' : total ? currentEpisode + ' / ' + total + ' eps.' : currentEpisode + ' eps.'}{!(anime.episode_unknown && ['paused', 'dropped'].includes(anime.status)) && <i><b style={{ width: (total ? pct : 34) + '%' }} /></i>}</span>
      <span className="row-rating">{!['watching', 'paused'].includes(anime.status) && anime.rating_personal ? <><Star size={12} fill="currentColor" />{(anime.rating_personal / 2).toFixed(1)}</> : '—'}</span>
      <ChevronRight size={16} className="row-chevron" />
    </button>
  );
}

const GENRE_LOCALIZATION = {
  'action': { label: 'Ação', accent: '#E8454F' },
  'adventure': { label: 'Aventura', accent: '#FF9A3C' },
  'comedy': { label: 'Comédia', accent: '#FFC857' },
  'avant garde': { label: 'Vanguarda', accent: '#A78BFA' },
  'mystery': { label: 'Mistério', accent: '#8B7CFF' },
  'drama': { label: 'Drama', accent: '#8F7CFF' },
  'ecchi': { label: 'Ecchi', accent: '#FF7A8B' },
  'fantasy': { label: 'Fantasia', accent: '#5CC8FF' },
  'horror': { label: 'Terror', accent: '#8D9B78' },
  'romance': { label: 'Romance', accent: '#FF8FB1' },
  'sci-fi': { label: 'Ficção científica', accent: '#4FB3D9' },
  "girls' love": { label: 'Amor entre garotas', accent: '#F28BBE' },
  "boys' love": { label: 'Amor entre garotos', accent: '#74A8E8' },
  'sports': { label: 'Esportes', accent: '#6ED0B0' },
  'slice of life': { label: 'Cotidiano', accent: '#7BE0A0' },
  'supernatural': { label: 'Sobrenatural', accent: '#A58CFF' },
  'suspense': { label: 'Suspense', accent: '#6C8EBF' },
  'award winning': { label: 'Premiados', accent: '#D6B66B' },
  'gourmet': { label: 'Gastronomia', accent: '#F4A261' },
  'hentai': { label: 'Hentai', accent: '#C45D87' },
  'kids': { label: 'Infantil', accent: '#F2C26B' },
  'workplace': { label: 'Ambiente de trabalho', accent: '#6B9C91' },
  'mythology': { label: 'Mitologia', accent: '#D6B66B' },
  'psychological': { label: 'Psicológico', accent: '#8C82C8' },
  'racing': { label: 'Corrida', accent: '#C76D4E' },
  'samurai': { label: 'Samurai', accent: '#9C5B58' },
  'space': { label: 'Espaço', accent: '#4C6B9B' },
  'vampire': { label: 'Vampiros', accent: '#9A3C58' },
  'visual arts': { label: 'Artes visuais', accent: '#C07DAD' },
  'performing arts': { label: 'Artes cênicas', accent: '#C07E61' },
  'pets': { label: 'Animais de estimação', accent: '#8EAF77' },
  'strategy game': { label: 'Jogos de estratégia', accent: '#A18A58' },
  'reincarnation': { label: 'Reencarnação', accent: '#8776C9' },
  'love polygon': { label: 'Triângulo amoroso', accent: '#D77C9C' },
  'crossdressing': { label: 'Crossdressing', accent: '#9D83C6' },
  'genderswap': { label: 'Troca de gênero', accent: '#C68FAE' },
  'delinquents': { label: 'Delinquentes', accent: '#9D6A52' },
  'educational': { label: 'Educativo', accent: '#6EA4B8' },
  'mahou shoujo': { label: 'Garotas mágicas', accent: '#E59BC8' },
  'historical': { label: 'Histórico', accent: '#B69A6B' },
  'military': { label: 'Militar', accent: '#82916E' },
  'parody': { label: 'Paródia', accent: '#D9A64E' },
  'police': { label: 'Policial', accent: '#5C86B8' },
  'post-apocalyptic': { label: 'Pós-apocalíptico', accent: '#8C735A' }
};
const genreKey = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const localizedGenre = genre => GENRE_LOCALIZATION[genreKey(genre?.name)] || { label: genre?.name || 'Gênero', accent: '#8B7CFF' };
const localizedFormat = value => ({ Movie: 'Filme', TV: 'TV', ONA: 'ONA', OVA: 'OVA', Special: 'Especial', Music: 'Música' }[value] || value || 'Anime');

function DiscoverPage({ tab, setTab, results, recommendations: recommendationSource, genres, lists, loading, hasMore, moreLoading, moreError, onLoadMore, error, selectedGenre, collection, onRetry, onSelectGenre, onOpenAnime, onAdd, onAddToList, findInCollection, isInCollection }) {
  const [genreQuery, setGenreQuery] = useState('');
  const [synopsisExpanded, setSynopsisExpanded] = useState(false);
  const shownGenres = genres.filter(genre => {
    const label = localizedGenre(genre).label;
    return (String(genre.name || '') + ' ' + label).toLowerCase().includes(genreQuery.toLowerCase());
  });
  const genreAffinity = {};
  (collection || []).forEach(anime => (anime.genres || []).forEach(genre => {
    genreAffinity[genre] = (genreAffinity[genre] || 0) + (anime.status === 'completed' || anime.status === 'watching' ? 2 : 1);
  }));
  // Discovery is for new titles only: remove anything already saved, regardless of status or rating.
  const catalogResults = uniqueAnimeEntries(results || []).filter(anime => !isInCollection(anime));
  const catalogRecommendations = uniqueAnimeEntries(recommendationSource || []).filter(anime => !isInCollection(anime));
  const preferredGenres = Object.entries(genreAffinity).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([name]) => name);
  const feature = catalogResults[0] || null;
  const catalogIds = new Set(catalogResults.map(anime => String(anime.mal_id)));
  const recommendations = catalogRecommendations
    .filter(anime => !catalogResults.some(result => sameAnimeEntry(result, anime)))
    .map(anime => ({
      ...anime,
      _matchedGenres: (anime.genres || []).filter(genre => preferredGenres.includes(genre)),
      _matchScore: (anime.genres || []).filter(genre => preferredGenres.includes(genre)).length
    }))
    .filter(anime => preferredGenres.length ? anime._matchScore > 0 : true)
    .sort((a, b) => b._matchScore - a._matchScore || Number(b.score_external || 0) - Number(a.score_external || 0))
    .slice(0, 6);
  const genreArtworkPool = [...catalogRecommendations, ...catalogResults];
  const isGenreResult = tab === 'genre';
  const activeTab = isGenreResult ? 'genres' : tab;
  const feedTitle = tab === 'season' ? 'Em alta nesta temporada'
    : tab === 'popular' ? 'Mais populares'
      : tab === 'upcoming' ? 'Próximos lançamentos'
        : isGenreResult ? 'Animes de ' + localizedGenre(selectedGenre).label
          : 'Descubra por gênero';
  const featureLabel = tab === 'season' ? 'TEMPORADA ATUAL'
    : tab === 'popular' ? 'EM ALTA'
      : tab === 'upcoming' ? 'PRÓXIMOS LANÇAMENTOS'
        : 'GÊNERO EM DESTAQUE';
  const featureSynopsis = feature?.synopsis_pt || feature?.synopsis || '';
  const featureInCollection = feature ? findInCollection(feature) : null;

  useEffect(() => {
    setSynopsisExpanded(false);
  }, [feature?.mal_id]);

  return (
    <div className="discover-page">
      <div className="discover-tabs" role="tablist" aria-label="Categorias de descoberta">
        {DISCOVER_TABS.map(item => (
          <button
            key={item.id}
            role="tab"
            aria-selected={activeTab === item.id}
            className={activeTab === item.id ? 'discover-tab active' : 'discover-tab'}
            onClick={() => setTab(item.id)}
          >{item.label}</button>
        ))}
      </div>

      {tab === 'genres' ? (
        <>
          <div className="discover-section-heading"><div><h2>Explore por gênero</h2><p>Escolha um estilo para ver os títulos do catálogo.</p></div></div>
          <label className="search-field genre-search"><Search size={16} /><input value={genreQuery} onChange={event => setGenreQuery(event.target.value)} placeholder="Buscar gênero" /></label>
          {loading ? <div className="loading-block"><LoaderCircle className="spin" />Carregando gêneros...</div> : error ? <CatalogError message={error} onRetry={onRetry} /> : (
            <div className="genre-grid">
              {shownGenres.map(genre => {
                const localized = localizedGenre(genre);
                const covers = genreArtworkPool.filter(anime => (anime.genres || []).some(name => genreKey(name) === genreKey(genre.name)) && anime.image_url)
                  .filter((anime, index, array) => array.findIndex(item => String(item.mal_id) === String(anime.mal_id)) === index)
                  .slice(0, 3);
                return (
                  <button
                    key={genre.name || genre.mal_id}
                    className="genre-card"
                    style={{ '--genre-accent': localized.accent }}
                    onClick={() => onSelectGenre(genre)}
                  >
                    <span className="genre-card-copy">
                      <strong>{localized.label}</strong>
                      <small>{Number.isFinite(Number(genre.count)) && Number(genre.count) > 0 ? Number(genre.count).toLocaleString('pt-BR') + ' títulos' : 'Explorar títulos'}</small>
                    </span>
                    {covers.length > 0 && (
                      <span className="genre-card-covers" aria-hidden="true">
                        {covers.map(anime => <img key={anime.mal_id} src={anime.image_url} alt="" loading="lazy" />)}
                      </span>
                    )}
                    <span className="genre-card-arrow"><ArrowUpRightIcon /></span>
                  </button>
                );
              })}
            </div>
          )}
          {!loading && !error && recommendations.length > 0 && (
            <DiscoverShelf
              title="Recomendados para você"
              subtitle={preferredGenres.length ? 'Sugestões relacionadas aos gêneros da sua biblioteca.' : 'Títulos populares para começar a explorar.'}
              items={recommendations}
              findInCollection={findInCollection}
              lists={lists}
              onOpenAnime={onOpenAnime}
              onAdd={onAdd}
              onAddToList={onAddToList}
              reasonFor={anime => anime._matchedGenres?.length ? 'Combina com ' + anime._matchedGenres.slice(0, 2).map(name => localizedGenre({ name }).label).join(' e ') : 'Popular no catálogo'}
            />
          )}
        </>
      ) : (
        <>
          {isGenreResult && (
            <div className="genre-context">
              <span>GÊNERO SELECIONADO</span><strong>{localizedGenre(selectedGenre).label}</strong>
              <button onClick={() => setTab('genres')}>Trocar gênero <ChevronRight size={13} /></button>
            </div>
          )}
          {loading ? <div className="loading-block"><LoaderCircle className="spin" />Explorando o catálogo...</div> : error ? <CatalogError message={error} onRetry={onRetry} /> : (
            <>
              {feature && (
                <section className="discover-feature">
                  <div
                    className="discover-feature-backdrop"
                    aria-hidden="true"
                    style={feature.image_url ? { backgroundImage: 'url("' + feature.image_url + '")' } : undefined}
                  />
                  <div className="feature-copy">
                    <span className="feature-tag"><Sparkles size={12} /> {featureLabel}</span>
                    <h2>{displayTitle(feature)}</h2>
                    <div className="feature-meta">
                      <span>{formatReleaseLabel(feature)}</span>
                      {feature.format && <><i>·</i><span>{localizedFormat(feature.format)}</span></>}
                      {feature.score_external && <><i>·</i><span><Star size={12} fill="currentColor" />{Number(feature.score_external).toFixed(1).replace('.', ',')}</span></>}
                    </div>
                    {(feature.genres || []).length > 0 && (
                      <div className="feature-genre-chips">
                        {feature.genres.slice(0, 3).map(genre => (
                          <span key={genre}>{localizedGenre({ name: genre }).label}</span>
                        ))}
                      </div>
                    )}
                    <div className={synopsisExpanded ? 'feature-synopsis expanded' : 'feature-synopsis'}>
                      {featureSynopsis || 'Sinopse não disponível.'}
                    </div>
                    {featureSynopsis.length > 165 && (
                      <button className="feature-read-more" onClick={() => setSynopsisExpanded(open => !open)}>
                        {synopsisExpanded ? 'Ler menos' : 'Ler mais'}
                      </button>
                    )}
                    <div className="hero-actions">
                      {featureInCollection
                        ? <span className={'feature-current-status tone-' + statusTone(featureInCollection.status)}>{statusLabel(featureInCollection.status)} <Check size={13} /></span>
                        : <button className="primary-button" onClick={() => onAdd(feature, 'planned')}><Plus size={15} />Quero assistir</button>}
                      <button className="hero-secondary" onClick={() => onOpenAnime(feature)}>Ver detalhes <ArrowRight size={15} /></button>
                    </div>
                  </div>
                  <button className="discover-feature-poster" onClick={() => onOpenAnime(feature)} aria-label={'Ver ' + displayTitle(feature)}>
                    {feature.image_url ? <img src={feature.image_url} alt={'Capa de ' + displayTitle(feature)} /> : <Clapperboard size={35} />}
                  </button>
                </section>
              )}

              <DiscoverShelf
                title={feedTitle}
                subtitle={tab === 'season' ? 'Títulos que fazem parte da temporada de animes atual.' : tab === 'popular' ? 'Ranking geral de popularidade do catálogo.' : tab === 'upcoming' ? 'Obras anunciadas para temporadas futuras.' : 'Títulos classificados neste gênero.'}
                items={catalogResults.filter(anime => String(anime.mal_id) !== String(feature?.mal_id))}
                findInCollection={findInCollection}
                lists={lists}
                hasMore={hasMore}
                moreLoading={moreLoading}
                moreError={moreError}
                onLoadMore={onLoadMore}
                onOpenAnime={onOpenAnime}
                onAdd={onAdd}
                onAddToList={onAddToList}
              />
              <DiscoverShelf
                title="Recomendados para você"
                subtitle={preferredGenres.length ? 'Sugestões relacionadas aos gêneros presentes na sua biblioteca.' : 'Títulos populares selecionados para você começar a explorar.'}
                items={recommendations}
                findInCollection={findInCollection}
                lists={lists}
                onOpenAnime={onOpenAnime}
                onAdd={onAdd}
                onAddToList={onAddToList}
                reasonFor={anime => anime._matchedGenres?.length ? 'Combina com ' + anime._matchedGenres.slice(0, 2).map(name => localizedGenre({ name }).label).join(' e ') : 'Popular no catálogo'}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}

function DiscoverShelf({ title, subtitle, items, findInCollection, lists, hasMore = false, moreLoading = false, moreError = '', onLoadMore, onOpenAnime, onAdd, onAddToList, reasonFor }) {
  const [openMenu, setOpenMenu] = useState(null);
  if (!items?.length && !hasMore) return null;
  return (
    <section className="shelf-section discover-shelf">
      <div className="section-heading">
        <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
        <span className="catalog-count">{items?.length || 0} títulos{hasMore ? ' · mais disponíveis' : ''}</span>
      </div>
      {items?.length ? (
        <div className="poster-rail discover-poster-rail">
          {items.map(anime => {
            const existing = findInCollection(anime);
            const statusText = existing ? statusLabel(existing.status) : '';
            return (
              <article className="discover-poster-item" key={anime.mal_id}>
                <button className="poster-card discover-poster-card" onClick={() => onOpenAnime(anime)} title={displayTitle(anime)}>
                  <div className="poster-art">
                    {anime.image_url ? <img src={anime.image_url} alt={'Pôster de ' + displayTitle(anime)} loading="lazy" /> : <div className="poster-fallback"><Clapperboard size={25} /></div>}
                    {anime.score_external && <span className="poster-rating"><Star size={10} fill="currentColor" />{Number(anime.score_external).toFixed(1).replace('.', ',')}</span>}
                  </div>
                  <span className="poster-name">{displayTitle(anime)}</span>
                  <span className="poster-meta">{formatReleaseLabel(anime)}{anime.format ? ' · ' + localizedFormat(anime.format) : ''}</span>
                </button>
                {reasonFor && <span className="discover-reason">{reasonFor(anime)}</span>}
                {existing ? (
                  <span className={'discover-added-status tone-' + statusTone(existing.status)}>{statusText} <Check size={12} /></span>
                ) : (
                  <div className="discover-add-wrap">
                    <button className="discover-add" onClick={() => setOpenMenu(current => current === String(anime.mal_id) ? null : String(anime.mal_id))} aria-expanded={openMenu === String(anime.mal_id)}>
                      <Plus size={13} />Adicionar
                    </button>
                    {openMenu === String(anime.mal_id) && (
                      <div className="discover-add-menu">
                        <span className="discover-menu-heading">Adicionar com status</span>
                        {[
                          ['planned', 'Quero assistir'],
                          ['watching', 'Assistindo'],
                          ['completed', 'Assistido']
                        ].map(([status, label]) => (
                          <button key={status} onClick={() => { setOpenMenu(null); onAdd(anime, status); }}>{label}</button>
                        ))}
                        {lists?.length > 0 && (
                          <>
                            <span className="discover-menu-heading discover-menu-divider">Adicionar a uma lista</span>
                            {lists.map(list => (
                              <button key={list.id} onClick={() => { setOpenMenu(null); onAddToList(anime, list.id); }}>{list.name}</button>
                            ))}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <p className="discover-feed-empty">Todos os títulos desta página já estão na sua biblioteca. Carregue mais para encontrar novos animes.</p>
      )}
      {hasMore && (
        <div className="discover-load-more">
          {moreError && <p className="discover-more-error">{moreError}</p>}
          <button className="outline-button" type="button" onClick={onLoadMore} disabled={moreLoading}>
            {moreLoading ? <><LoaderCircle size={15} className="spin" />Carregando...</> : <>{moreError ? 'Tentar novamente' : 'Ver mais animes'} <ChevronDown size={15} /></>}
          </button>
        </div>
      )}
    </section>
  );
}

function ArrowUpRightIcon() { return <ArrowRight size={17} />; }

function CatalogError({ message, onRetry }) {
  return <div className="catalog-error"><div><Compass size={22} /><strong>Catálogo indisponível no momento</strong><p>{message}</p><button className="outline-button" onClick={onRetry}>Tentar novamente</button></div></div>;
}


function SocialAvatar({ profile, size = 'medium' }) {
  return (
    <span className={'social-avatar social-avatar-' + size}>
      {profile?.avatar_url
        ? <img src={profile.avatar_url} alt="" loading="lazy" />
        : getInitials(profile?.display_name || profile?.username || 'K')}
    </span>
  );
}

function AvatarCropModal({ file, onCancel, onConfirm }) {
  const [sourceUrl, setSourceUrl] = useState('');
  const [dimensions, setDimensions] = useState(null);
  const [viewportSize, setViewportSize] = useState(320);
  const MIN_CROP_ZOOM = 1.25;
  const [zoom, setZoom] = useState(MIN_CROP_ZOOM);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const imageRef = useRef(null);
  const viewportRef = useRef(null);
  const dragRef = useRef(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSourceUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    const measure = () => {
      if (viewportRef.current) {
        setViewportSize(viewportRef.current.getBoundingClientRect().width || 320);
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [sourceUrl]);

  useEffect(() => {
    const onKeyDown = event => {
      if (event.key === 'Escape' && !processing) onCancel?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel, processing]);

  const baseScale = dimensions
    ? Math.max(viewportSize / dimensions.width, viewportSize / dimensions.height)
    : 1;
  const scale = baseScale * zoom;
  const displayWidth = dimensions ? dimensions.width * scale : viewportSize;
  const displayHeight = dimensions ? dimensions.height * scale : viewportSize;
  const maxOffsetX = Math.max(0, (displayWidth - viewportSize) / 2);
  const maxOffsetY = Math.max(0, (displayHeight - viewportSize) / 2);

  function clampOffset(nextOffset) {
    return {
      x: Math.max(-maxOffsetX, Math.min(maxOffsetX, nextOffset.x)),
      y: Math.max(-maxOffsetY, Math.min(maxOffsetY, nextOffset.y))
    };
  }

  function updateZoom(nextZoom) {
    const safeZoom = Math.max(MIN_CROP_ZOOM, Math.min(4, Number(nextZoom) || MIN_CROP_ZOOM));
    setZoom(safeZoom);
    const nextScale = baseScale * safeZoom;
    const nextMaxX = Math.max(0, (dimensions.width * nextScale - viewportSize) / 2);
    const nextMaxY = Math.max(0, (dimensions.height * nextScale - viewportSize) / 2);
    setOffset(current => ({
      x: Math.max(-nextMaxX, Math.min(nextMaxX, current.x)),
      y: Math.max(-nextMaxY, Math.min(nextMaxY, current.y))
    }));
  }

  function onPointerDown(event) {
    if (!dimensions || processing) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startOffset: offset
    };
    setDragging(true);
  }

  function onPointerMove(event) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    setOffset(clampOffset({
      x: drag.startOffset.x + event.clientX - drag.startX,
      y: drag.startOffset.y + event.clientY - drag.startY
    }));
  }

  function onPointerUp(event) {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
  }

  function confirmCrop() {
    const image = imageRef.current;
    if (!image || !dimensions || !scale) return;
    setProcessing(true);
    try {
      const imageLeft = viewportSize / 2 - displayWidth / 2 + offset.x;
      const imageTop = viewportSize / 2 - displayHeight / 2 + offset.y;
      const sourceX = Math.max(0, Math.min(dimensions.width, (0 - imageLeft) / scale));
      const sourceY = Math.max(0, Math.min(dimensions.height, (0 - imageTop) / scale));
      const sourceSize = Math.min(
        viewportSize / scale,
        dimensions.width - sourceX,
        dimensions.height - sourceY
      );
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Não foi possível preparar a imagem.');
      context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, 512, 512);
      canvas.toBlob(blob => {
        if (!blob) {
          setProcessing(false);
          return;
        }
        const croppedFile = new File([blob], 'kataru-avatar.jpg', {
          type: 'image/jpeg',
          lastModified: Date.now()
        });
        onConfirm?.(croppedFile);
      }, 'image/jpeg', 0.92);
    } catch {
      setProcessing(false);
    }
  }

  return (
    <div className="avatar-crop-overlay" onMouseDown={event => {
      if (event.target === event.currentTarget && !processing) onCancel?.();
    }}>
      <section className="avatar-crop-dialog" role="dialog" aria-modal="true" aria-label="Ajustar foto de perfil">
        <header className="avatar-crop-header">
          <button type="button" className="avatar-crop-close" onClick={onCancel} disabled={processing} aria-label="Cancelar recorte">
            <X size={20} />
          </button>
          <strong>Arraste a imagem para ajustar</strong>
          <button type="button" className="avatar-crop-load" onClick={confirmCrop} disabled={!dimensions || processing}>
            {processing ? <LoaderCircle size={16} className="spin" /> : <Check size={17} />}
            {processing ? 'Preparando...' : 'Carregar'}
          </button>
        </header>
        <div className="avatar-crop-body">
          <div
            ref={viewportRef}
            className={'avatar-crop-viewport' + (dragging ? ' is-dragging' : '')}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onLostPointerCapture={onPointerUp}
            tabIndex={0}
            onKeyDown={event => {
              if (!dimensions || processing) return;
              const step = event.shiftKey ? 12 : 4;
              if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)) event.preventDefault();
              if (event.key === 'ArrowUp') setOffset(current => clampOffset({ ...current, y: current.y - step }));
              if (event.key === 'ArrowDown') setOffset(current => clampOffset({ ...current, y: current.y + step }));
              if (event.key === 'ArrowLeft') setOffset(current => clampOffset({ ...current, x: current.x - step }));
              if (event.key === 'ArrowRight') setOffset(current => clampOffset({ ...current, x: current.x + step }));
            }}
          >
            {sourceUrl && (
              <img
                ref={imageRef}
                src={sourceUrl}
                alt="Prévia para recorte"
                draggable="false"
                onLoad={event => {
                  const image = event.currentTarget;
                  setDimensions({ width: image.naturalWidth, height: image.naturalHeight });
                  setOffset({ x: 0, y: 0 });
                  setZoom(MIN_CROP_ZOOM);
                  if (viewportRef.current) {
                    setViewportSize(viewportRef.current.getBoundingClientRect().width || 320);
                  }
                }}
                style={{
                  width: displayWidth,
                  height: displayHeight,
                  transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`
                }}
              />
            )}
          </div>
          <div className="avatar-crop-controls">
            <button type="button" onClick={() => updateZoom(zoom - 0.15)} disabled={zoom <= 1 || processing} aria-label="Diminuir zoom">−</button>
            <input
              type="range"
              min={MIN_CROP_ZOOM}
              max="4"
              step="0.01"
              value={zoom}
              onChange={event => updateZoom(event.target.value)}
              disabled={!dimensions || processing}
              aria-label="Zoom da foto"
            />
            <button type="button" onClick={() => updateZoom(zoom + 0.15)} disabled={zoom >= 4 || processing} aria-label="Aumentar zoom">+</button>
          </div>
          <p className="avatar-crop-hint">Mova a imagem para encaixar seu rosto no círculo</p>
        </div>
      </section>
    </div>
  );
}

function SocialUserCard({ profile, onOpen, action, hint }) {
  return (
    <article className="social-user-card">
      <button className="social-user-main" onClick={onOpen}>
        <SocialAvatar profile={profile} />
        <span className="social-user-copy">
          <strong>{profile.display_name || profile.username}</strong>
          <small>@{profile.username}</small>
          {profile.bio && <span>{profile.bio}</span>}
          {hint && <small className="social-user-hint">{hint}</small>}
        </span>
      </button>
      {action && <div className="social-user-action">{action}</div>}
    </article>
  );
}

function CommunityPage({ open, pageMode = false, onClose, onOpenProfile, onBackToSearch, onActiveProfileChange, onAddSharedAnime, onOpenOwnAnime, currentUserId, initialProfile = null, initialQuery = '', openMyProfileSignal = 0, acknowledgeMyProfileRequest, focusSearchSignal = 0, acknowledgeSearchRequest }) {
  const [query, setQuery] = useState(initialQuery || '');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedProfile, setSelectedProfile] = useState(() => (pageMode ? initialProfile : null));
  const [profileStats, setProfileStats] = useState({ followers: 0, following: 0 });
  const [isFollowing, setIsFollowing] = useState(false);
  const [profileAnime, setProfileAnime] = useState([]);
  const [profileLists, setProfileLists] = useState([]);
  const [profileTab, setProfileTab] = useState('library');
  const [selectedList, setSelectedList] = useState(null);
  const [connections, setConnections] = useState([]);
  const [connectionsType, setConnectionsType] = useState(null);
  const [loading, setLoading] = useState(false);
  const [contentLoading, setContentLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({ username: '', display_name: '', bio: '' });
  const [usernameAvailability, setUsernameAvailability] = useState('current');
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState('');
  const [avatarCropFile, setAvatarCropFile] = useState(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const avatarInputRef = useRef(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [notice, setNotice] = useState('');
  const searchInputRef = useRef(null);
  const activeRouteProfileIdRef = useRef(null);

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreviewUrl('');
      return undefined;
    }
    const previewUrl = URL.createObjectURL(avatarFile);
    setAvatarPreviewUrl(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [avatarFile]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = event => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [open, onClose]);

  useEffect(() => {
    if (focusSearchSignal > 0) {
      acknowledgeSearchRequest?.(0);
      setSelectedProfile(null);
      setSelectedList(null);
      setConnectionsType(null);
      setConnections([]);
      setError('');
      setNotice('');
      searchInputRef.current?.focus();
    }
  }, [focusSearchSignal, acknowledgeSearchRequest]);

  useEffect(() => {
    let active = true;
    const term = query.trim();
    if (term.length < 2) {
      setSearchResults([]);
      return undefined;
    }
    setLoading(true);
    setError('');
    const timer = window.setTimeout(() => {
      searchKataruProfiles(term)
        .then(profiles => { if (active) setSearchResults(profiles); })
        .catch(loadError => { if (active) setError(loadError.message || 'Não foi possível pesquisar usuários.'); })
        .finally(() => { if (active) setLoading(false); });
    }, 260);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query]);

  async function loadProfileContent(userId) {
    setContentLoading(true);
    try {
      const [anime, lists] = await Promise.all([
        getFollowedKataruAnime(userId),
        getFollowedKataruLists(userId)
      ]);
      setProfileAnime(anime);
      setProfileLists(lists);
    } catch (loadError) {
      setProfileAnime([]);
      setProfileLists([]);
      setError(loadError.message || 'Não foi possível abrir o conteúdo deste perfil.');
    } finally {
      setContentLoading(false);
    }
  }

  async function openProfile(profile) {
    if (pageMode) {
      activeRouteProfileIdRef.current = profile.user_id;
      onActiveProfileChange?.(profile);
    }
    setSelectedList(null);
    setConnectionsType(null);
    setConnections([]);
    setSelectedProfile(profile);
    setIsFollowing(false);
    setProfileStats({ followers: 0, following: 0 });
    setProfileAnime([]);
    setProfileLists([]);
    setProfileTab('library');
    setEditingProfile(false);
    setNotice('');
    setError('');
    setBusy(false);
    setContentLoading(true);
    const ownProfile = profile.user_id === currentUserId;
    try {
      const [stats, followed] = await Promise.all([
        getKataruSocialStats(profile.user_id),
        ownProfile ? Promise.resolve(false) : isFollowingKataruUser(profile.user_id)
      ]);
      setProfileStats(stats);
      setIsFollowing(followed);
      if (ownProfile || followed) {
        await loadProfileContent(profile.user_id);
      } else {
        setProfileAnime([]);
        setProfileLists([]);
        setContentLoading(false);
      }
      setProfileForm({
        username: profile.username || '',
        display_name: profile.display_name || profile.username || '',
        bio: profile.bio || ''
      });
      setUsernameAvailability('current');
    } catch (loadError) {
      setContentLoading(false);
      setError(loadError.message || 'Não foi possível carregar o perfil.');
    }
  }

  useEffect(() => {
    if (!pageMode) return;
    if (!initialProfile) {
      activeRouteProfileIdRef.current = null;
      return;
    }
    if (activeRouteProfileIdRef.current !== initialProfile.user_id) {
      activeRouteProfileIdRef.current = initialProfile.user_id;
      openProfile(initialProfile);
    }
  }, [pageMode, initialProfile?.user_id]);

  async function openMyProfile() {
    setLoading(true);
    setError('');
    try {
      const profile = await getCurrentKataruProfile();
      if (!profile) throw new Error('Seu perfil ainda não está disponível. Saia e entre novamente na conta.');
      await openProfile(profile);
    } catch (loadError) {
      setError(loadError.message || 'Não foi possível abrir seu perfil.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (openMyProfileSignal > 0) {
      acknowledgeMyProfileRequest?.(0);
      openMyProfile();
    }
  }, [openMyProfileSignal, acknowledgeMyProfileRequest]);

  async function toggleFollow() {
    if (!selectedProfile || selectedProfile.user_id === currentUserId || busy) return;
    setBusy(true);
    setError('');
    try {
      if (isFollowing) {
        await unfollowKataruUser(selectedProfile.user_id);
        setIsFollowing(false);
        setProfileAnime([]);
        setProfileLists([]);
        setProfileStats(current => ({ ...current, followers: Math.max(0, current.followers - 1) }));
        setNotice('Você deixou de seguir @' + selectedProfile.username + '.');
      } else {
        await followKataruUser(selectedProfile.user_id);
        setIsFollowing(true);
        setProfileStats(current => ({ ...current, followers: current.followers + 1 }));
        setNotice('Agora você está seguindo @' + selectedProfile.username + '.');
        await loadProfileContent(selectedProfile.user_id);
      }
    } catch (followError) {
      setError(followError.message || 'Não foi possível atualizar o relacionamento.');
    } finally {
      setBusy(false);
    }
  }

  async function showConnections(type) {
    if (!selectedProfile) return;
    setConnectionsType(type);
    setConnections([]);
    setLoading(true);
    setError('');
    try {
      const profiles = await getKataruRelationProfiles(selectedProfile.user_id, type);
      setConnections(profiles);
    } catch (connectionError) {
      setError(connectionError.message || 'Não foi possível carregar esta lista.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!editingProfile || selectedProfile?.user_id !== currentUserId) {
      setUsernameAvailability('current');
      return undefined;
    }
    const candidate = String(profileForm.username || '').trim().toLowerCase();
    const current = String(selectedProfile?.username || '').toLowerCase();
    if (candidate === current) {
      setUsernameAvailability('current');
      return undefined;
    }
    if (!KATARU_USERNAME_PATTERN.test(candidate)) {
      setUsernameAvailability('invalid');
      return undefined;
    }
    let active = true;
    setUsernameAvailability('checking');
    const timer = window.setTimeout(async () => {
      try {
        const available = await isKataruUsernameAvailable(candidate);
        if (active) setUsernameAvailability(available ? 'available' : 'taken');
      } catch {
        if (active) setUsernameAvailability('error');
      }
    }, 350);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [editingProfile, profileForm.username, selectedProfile?.username, selectedProfile?.user_id, currentUserId]);

  async function saveProfile(event) {
    event.preventDefault();
    const nextUsername = String(profileForm.username || '').trim().toLowerCase();
    const currentUsername = String(selectedProfile?.username || '').toLowerCase();
    if (!KATARU_USERNAME_PATTERN.test(nextUsername)) {
      setError('Use de 3 a 20 caracteres: letras, números ou _.');
      return;
    }
    setSavingProfile(true);
    setError('');
    let uploadedAvatar = null;
    try {
      if (nextUsername !== currentUsername) {
        const available = await isKataruUsernameAvailable(nextUsername);
        if (!available) throw new Error('Esse nome de usuário já está em uso ou reservado. Escolha outro.');
      }

      const previousAvatarPath = getKataruAvatarPath(selectedProfile.avatar_url);
      let nextAvatarUrl = removeAvatar ? null : (selectedProfile.avatar_url || null);
      if (avatarFile) {
        uploadedAvatar = await uploadKataruAvatar(avatarFile);
        nextAvatarUrl = uploadedAvatar.publicUrl;
      }

      const nextDisplayName = String(profileForm.display_name || '').trim();
      const updated = await updateKataruProfile({
        ...profileForm,
        username: nextUsername,
        avatar_url: nextAvatarUrl,
        // If the display name was only mirroring the old @, keep it in sync.
        display_name: nextDisplayName === currentUsername ? nextUsername : nextDisplayName
      });
      setSelectedProfile(updated);
      setProfileForm({
        username: updated.username || '',
        display_name: updated.display_name || updated.username || '',
        bio: updated.bio || ''
      });
      setAvatarFile(null);
      setRemoveAvatar(false);
      setUsernameAvailability('current');
      setEditingProfile(false);
      setNotice('Seu perfil foi atualizado.');

      const avatarChanged = Boolean(uploadedAvatar || removeAvatar);
      if (avatarChanged && previousAvatarPath && previousAvatarPath !== (uploadedAvatar?.path || null)) {
        removeKataruAvatar(previousAvatarPath).catch(() => {});
      }
    } catch (saveError) {
      if (uploadedAvatar?.path) removeKataruAvatar(uploadedAvatar.path).catch(() => {});
      setError(saveError.code === '23505'
        ? 'Esse nome de usuário acabou de ser escolhido. Tente outro.'
        : saveError.message || 'Não foi possível atualizar seu perfil.');
    } finally {
      setSavingProfile(false);
    }
  }

  function cancelProfileEditing() {
    setProfileForm({
      username: selectedProfile?.username || '',
      display_name: selectedProfile?.display_name || selectedProfile?.username || '',
      bio: selectedProfile?.bio || ''
    });
    setAvatarFile(null);
    setAvatarCropFile(null);
    setRemoveAvatar(false);
    setError('');
    setEditingProfile(false);
  }

  function returnToUserSearch() {
    const previousQuery = query;
    setSelectedProfile(null);
    setSelectedList(null);
    setConnectionsType(null);
    setConnections([]);
    setNotice('');
    setError('');
    if (pageMode) onBackToSearch?.(previousQuery);
  }

  function renderAnimeGrid(entries) {
    const ordered = groupAnimeByFranchise(entries, 'franchise').flatMap(group => group.items);
    if (!ordered.length) {
      return <div className="social-empty"><Library size={23} /><strong>Biblioteca vazia</strong><span>Este perfil ainda não adicionou animes.</span></div>;
    }
    return (
      <div className="library-grid social-shared-library-grid">
        {ordered.map(anime => (
          <PosterCard
            key={anime.id}
            anime={anime}
            showProgress={false}
            onClick={() => {
              if (selectedProfile?.user_id === currentUserId) onOpenOwnAnime?.(anime);
              else onAddSharedAnime?.(anime);
            }}
          />
        ))}
      </div>
    );
  }

  if (!open) return null;
  if (pageMode && !selectedProfile) {
    return (
      <div className="community-page community-profile-page">
        {loading || openMyProfileSignal > 0 ? (
          <div className="loading-block"><LoaderCircle className="spin" />Carregando perfil...</div>
        ) : (
          <div className="social-profile-load-error">
            <div className="empty-state-icon"><UserRound size={23} /></div>
            <h2>Não foi possível abrir este perfil</h2>
            <p>{error || 'O perfil não foi encontrado ou não está disponível no momento.'}</p>
            <div className="empty-actions">
              <button className="outline-button" onClick={returnToUserSearch}><Search size={14} />Voltar à busca</button>
              <button className="primary-button" onClick={() => openMyProfile()}><UserRound size={14} />Tentar novamente</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const modalTitle = selectedProfile
    ? (selectedProfile.display_name || selectedProfile.username)
    : 'Buscar usuários';

  if (selectedProfile) {
    const ownProfile = selectedProfile.user_id === currentUserId;
    const visible = ownProfile || isFollowing;
    const listEntries = selectedList
      ? (selectedList.anime_ids || []).map(id => profileAnime.find(anime => String(anime.mal_id) === String(id))).filter(Boolean)
      : [];
    const profileContent = (
      <>
                <button className="back-link" onClick={selectedList ? () => setSelectedList(null) : connectionsType ? () => setConnectionsType(null) : returnToUserSearch}>
                  <ChevronLeft size={16} />{selectedList ? 'Voltar às listas' : connectionsType ? 'Voltar ao perfil' : 'Voltar à busca de usuários'}
                </button>
                {selectedList ? (
                  <section className="social-list-detail">
                    <div className="social-list-detail-head">
                      <span className="social-list-icon"><List size={23} /></span>
                      <div><p className="eyebrow">LISTA DE @{selectedProfile.username}</p><h1>{selectedList.name}</h1><p>{selectedList.description || 'Uma seleção de animes.'}</p><small>{listEntries.length} {listEntries.length === 1 ? 'anime' : 'animes'}{selectedList.is_ranked ? ' · ranqueada' : ''}</small></div>
                    </div>
                    {renderAnimeGrid(listEntries)}
                  </section>
                ) : connectionsType ? (
                  <section className="social-connections-panel">
                    <div className="page-intro"><div><p className="eyebrow">COMUNIDADE KATARU</p><h1>{connectionsType === 'followers' ? 'Seguidores' : 'Seguindo'}</h1><p className="page-subtitle">Pessoas relacionadas a @{selectedProfile.username}.</p></div></div>
                    {loading ? <div className="loading-block"><LoaderCircle className="spin" />Carregando pessoas...</div> : connections.length ? (
                      <div className="social-user-grid">
                        {connections.map(profile => <SocialUserCard key={profile.user_id} profile={profile} onOpen={() => openProfile(profile)} />)}
                      </div>
                    ) : <div className="social-empty"><Users size={23} /><strong>Ninguém por aqui ainda</strong></div>}
                  </section>
                ) : (
                  <>
                    <section className="social-profile-hero">
                      <div className="social-profile-main">
                        <SocialAvatar profile={selectedProfile} size="large" />
                        <div className="social-profile-copy">
                          <p className="eyebrow">{ownProfile ? 'MEU PERFIL' : 'PERFIL KATARU'}</p>
                          <h1>{selectedProfile.display_name || selectedProfile.username}</h1>
                          <span>@{selectedProfile.username}</span>
                          {selectedProfile.bio && <p>{selectedProfile.bio}</p>}
                          <small>Na comunidade desde {formatDate(selectedProfile.created_at)}</small>
                        </div>
                      </div>
                      <div className="social-profile-actions">
                        {ownProfile
                          ? <button className="outline-button" onClick={() => editingProfile ? cancelProfileEditing() : setEditingProfile(true)}><Pencil size={14} />{editingProfile ? 'Cancelar edição' : 'Editar perfil'}</button>
                          : <button className={isFollowing ? 'outline-button social-following-button' : 'primary-button'} onClick={toggleFollow} disabled={busy}>
                              {busy ? <LoaderCircle size={15} className="spin" /> : isFollowing ? <UserCheck size={15} /> : <UserPlus size={15} />}
                              {busy ? 'Aguarde...' : isFollowing ? 'Seguindo' : 'Seguir'}
                            </button>}
                      </div>
                      <div className="social-profile-stats">
                        <button onClick={() => showConnections('followers')}><strong>{profileStats.followers}</strong><span>Seguidores</span></button>
                        <button onClick={() => showConnections('following')}><strong>{profileStats.following}</strong><span>Seguindo</span></button>
                        <div><strong>{ownProfile || isFollowing ? profileAnime.length : '—'}</strong><span>Animes</span></div>
                      </div>
                    </section>
                    {editingProfile && ownProfile && (
                      <form className="social-profile-edit" onSubmit={saveProfile}>
                        <div className="social-avatar-picker-row">
                          <button
                            type="button"
                            className="social-avatar-picker"
                            onClick={() => avatarInputRef.current?.click()}
                            disabled={savingProfile}
                            aria-label="Escolher foto de perfil"
                            title="Escolher foto de perfil"
                          >
                            <SocialAvatar
                              profile={{
                                ...selectedProfile,
                                avatar_url: avatarFile ? avatarPreviewUrl : removeAvatar ? null : selectedProfile.avatar_url
                              }}
                              size="large"
                            />
                            <span className="social-avatar-picker-plus"><Plus size={17} strokeWidth={2.5} /></span>
                          </button>
                          <input
                            ref={avatarInputRef}
                            className="social-avatar-file-input"
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={event => {
                              const file = event.target.files?.[0];
                              event.target.value = '';
                              if (!file) return;
                              if (!['image/jpeg','image/png','image/webp'].includes(file.type)) {
                                setError('Use uma imagem JPG, PNG ou WEBP.');
                                return;
                              }
                              if (file.size > 2 * 1024 * 1024) {
                                setError('A imagem precisa ter no máximo 2 MB.');
                                return;
                              }
                              setError('');
                              setAvatarCropFile(file);
                            }}
                          />
                        </div>
                        <label>Nome de usuário
                          <span className="social-username-edit-field"><span>@</span><input autoCapitalize="none" autoCorrect="off" spellCheck="false" maxLength={20} value={profileForm.username} onChange={event => setProfileForm(value => ({ ...value, username: event.target.value.toLowerCase() }))} placeholder="seu_usuario" /></span>
                          <small>Seu @ público. Use de 3 a 20 caracteres: letras, números ou _.</small>
                        </label>
                        {usernameAvailability === 'checking' && <p className="social-username-feedback"><LoaderCircle size={12} className="spin" /> Verificando disponibilidade...</p>}
                        {usernameAvailability === 'available' && <p className="social-username-feedback is-good"><Check size={12} /> @ disponível</p>}
                        {usernameAvailability === 'taken' && <p className="social-username-feedback is-bad"><AlertCircle size={12} /> Esse @ já está em uso ou reservado.</p>}
                        {usernameAvailability === 'invalid' && <p className="social-username-feedback is-bad"><AlertCircle size={12} /> Use de 3 a 20 caracteres: letras, números ou _.</p>}
                        {usernameAvailability === 'error' && <p className="social-username-feedback is-bad"><AlertCircle size={12} /> Não foi possível verificar agora. Tente novamente.</p>}
                        <label>Nome de exibição<input maxLength={50} value={profileForm.display_name} onChange={event => setProfileForm(value => ({ ...value, display_name: event.target.value }))} placeholder="Como as pessoas verão você" /></label>
                        <label>Bio<textarea maxLength={160} rows={3} value={profileForm.bio} onChange={event => setProfileForm(value => ({ ...value, bio: event.target.value }))} placeholder="Conte um pouco sobre seus gostos de anime" /></label>
                        <div><small>{profileForm.bio.length}/160 caracteres</small><button className="primary-button" type="submit" disabled={savingProfile || !KATARU_USERNAME_PATTERN.test(String(profileForm.username || '').trim().toLowerCase()) || (String(profileForm.username || '').trim().toLowerCase() !== String(selectedProfile.username || '').toLowerCase() && usernameAvailability !== 'available')}>{savingProfile ? 'Salvando...' : 'Salvar perfil'}</button></div>
                      </form>
                    )}
                    {notice && <div className="social-notice">{notice}</div>}
                    {error && <div className="social-error">{error}</div>}
                    <div className="social-profile-tabs">
                      <button className={profileTab === 'library' ? 'active' : ''} onClick={() => { setProfileTab('library'); setSelectedList(null); }}><Library size={15} />Biblioteca</button>
                      <button className={profileTab === 'lists' ? 'active' : ''} onClick={() => { setProfileTab('lists'); setSelectedList(null); }}><List size={15} />Listas <span>{visible ? profileLists.length : '🔒'}</span></button>
                    </div>
                    {contentLoading ? <div className="loading-block"><LoaderCircle className="spin" />Carregando biblioteca e listas...</div> : visible ? (
                      profileTab === 'library' ? renderAnimeGrid(profileAnime) : profileLists.length ? (
                        <div className="social-lists-grid">
                          {profileLists.map(list => (
                            <button className="social-list-card" key={list.id} onClick={() => setSelectedList(list)}>
                              <span className="social-list-icon"><List size={22} /></span>
                              <span><strong>{list.name}</strong><small>{list.description || 'Lista de animes'}</small><em>{list.anime_ids?.length || 0} títulos{list.is_ranked ? ' · ranqueada' : ''}</em></span>
                              <ChevronRight size={17} />
                            </button>
                          ))}
                        </div>
                      ) : <div className="social-empty"><List size={23} /><strong>Nenhuma lista criada</strong><span>Este perfil ainda não criou listas.</span></div>
                    ) : (
                      <div className="social-private-state"><Users size={25} /><strong>Biblioteca e listas para seguidores</strong><p>Siga @{selectedProfile.username} para acompanhar seus animes e listas.</p><button className="primary-button" onClick={toggleFollow} disabled={busy}><UserPlus size={15} />Seguir para ver o perfil</button></div>
                    )}
                  </>
                )}
                {avatarCropFile && (
                  <AvatarCropModal
                    file={avatarCropFile}
                    onCancel={() => setAvatarCropFile(null)}
                    onConfirm={croppedFile => {
                      setAvatarFile(croppedFile);
                      setAvatarCropFile(null);
                      setRemoveAvatar(false);
                      setError('');
                    }}
                  />
                )}
      </>
    );

    if (pageMode) {
      return <div className="community-page community-profile-page">{profileContent}</div>;
    }

    return (
      <div className="overlay social-community-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose?.(); }}>
        <section className="modal social-community-modal" role="dialog" aria-modal="true" aria-label={modalTitle}>
          <div className="modal-header social-community-modal-header">
            <div><p className="eyebrow">COMUNIDADE KATARU</p><h2>{modalTitle}</h2></div>
            <button className="icon-button" onClick={onClose} aria-label="Fechar busca"><X size={17} /></button>
          </div>
          <div className="community-page">{profileContent}</div>
        </section>
      </div>
    );
  }
  return (
    <div className="overlay social-community-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose?.(); }}>
      <section className="modal social-community-modal" role="dialog" aria-modal="true" aria-label="Buscar usuários">
        <div className="modal-header social-community-modal-header">
          <div><p className="eyebrow">COMUNIDADE KATARU</p><h2>Buscar usuários</h2><p>Encontre pessoas para acompanhar suas bibliotecas e listas.</p></div>
          <button className="icon-button" onClick={onClose} aria-label="Fechar busca"><X size={17} /></button>
        </div>
        <div className="community-page">
      <label className="social-search-field"><Search size={17} /><input ref={searchInputRef} autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar por usuário ou nome de exibição..." /><kbd>⌕</kbd></label>
      <p className="social-search-note">Pesquise pelo @usuário ou nome de exibição. Digite pelo menos 2 caracteres.</p>
      {error && <div className="social-error">{error}</div>}
      {loading ? <div className="loading-block"><LoaderCircle className="spin" />Buscando usuários...</div> : query.trim().length >= 2 ? searchResults.length ? (
        <div className="social-user-grid">
          {searchResults.map(profile => <SocialUserCard key={profile.user_id} profile={profile} onOpen={() => onOpenProfile ? onOpenProfile(profile, query) : openProfile(profile)} hint="Abrir perfil" />)}
        </div>
      ) : <div className="social-empty"><Users size={23} /><strong>Nenhum usuário encontrado</strong><span>Confira o nome ou @usuário e tente novamente.</span></div> : (
        <div className="social-discover-empty"><Users size={25} /><strong>Encontre pessoas no Kataru</strong><p>Digite um nome ou @usuário para abrir o perfil, seguir e acompanhar bibliotecas e listas.</p></div>
        )}
        </div>
      </section>
    </div>
  );
}

function ListsPage({ items, lists, counts, onOpenStatus, onOpenList, onNewList, onEditList }) {
  const automatic = [
    { id: 'watching', title: 'Assistindo', description: 'Animes que você está acompanhando', icon: <Zap size={20} />, count: counts.watching || 0 },
    { id: 'completed', title: 'Assistido', description: 'Histórias que você já concluiu', icon: <Trophy size={20} />, count: counts.completed || 0 },
    { id: 'planned', title: 'Quero assistir', description: 'Sua fila de próximas histórias', icon: <BookmarkIcon />, count: counts.planned || 0 },
    { id: 'paused', title: 'Pausado', description: 'Títulos que você deixou em espera', icon: <Clock3 size={20} />, count: counts.paused || 0 },
    { id: 'dropped', title: 'Abandonado', description: 'Títulos que você decidiu não continuar', icon: <X size={20} />, count: counts.dropped || 0 }
  ];

  return (
    <div className="lists-page">
      <PageIntro eyebrow="ORGANIZE DO SEU JEITO" title="Listas" subtitle="Coleções automáticas e listas criadas por você." action={<button className="primary-button" onClick={onNewList}><Plus size={16} />Nova lista</button>} />
      <section className="list-section">
        <div className="section-heading"><div><h2>Automáticas por status</h2><p>Geradas a partir da sua biblioteca.</p></div><span className="automatic-label"><Zap size={12} /> AUTOMÁTICAS</span></div>
        <div className="automatic-grid">{automatic.map(entry => {
          const covers = items.filter(anime => anime.status === entry.id).sort(sortByRecent).slice(0, 3);
          return <button key={entry.id} className={'automatic-card tone-' + statusTone(entry.id)} onClick={() => onOpenStatus(entry.id)}>
            <div className="list-cover-stack" aria-hidden="true">
              {Array.from({ length: 3 }, (_, index) => {
                const anime = covers[index];
                return <div className={anime?.image_url ? 'list-cover-card' : 'list-cover-card is-empty'} key={index}>
                  {anime?.image_url ? <img src={anime.image_url} alt="" loading="lazy" /> : <span><ListPlus size={20} /></span>}
                </div>;
              })}
            </div>
            <div className="custom-list-info"><strong>{entry.title}</strong><span>{entry.count} {entry.count === 1 ? 'anime' : 'animes'} · Automática</span></div>
          </button>;
        })}</div>
      </section>
      <section className="list-section custom-lists-section">
        <div className="section-heading"><div><h2>Minhas listas</h2><p>Crie coleções temáticas e reúna seus favoritos.</p></div><span className="catalog-count">{lists.length} listas</span></div>
        {lists.length ? <div className="custom-list-grid">{lists.map(list => {
          const count = (list.anime_ids || []).length;
          const covers = (list.anime_ids || []).slice(0, 3).map(id => items.find(anime => String(anime.mal_id) === String(id))).filter(Boolean);
          return <article className="custom-list-card" key={list.id}>
            <button className="custom-list-open" onClick={() => onOpenList(list)}>
              <div className="list-cover-stack" aria-hidden="true">
                {Array.from({ length: 3 }, (_, index) => {
                  const anime = covers[index];
                  return <div className={anime?.image_url ? 'list-cover-card' : 'list-cover-card is-empty'} key={index}>
                    {anime?.image_url ? <img src={anime.image_url} alt="" loading="lazy" /> : <span><ListPlus size={20} /></span>}
                  </div>;
                })}
              </div>
              <div className="custom-list-info"><strong>{list.name}</strong><span>{count} {count === 1 ? 'anime' : 'animes'}{list.is_ranked ? ' · Ordem de preferência' : ''}</span></div>
            </button>
            <button className="list-more" onClick={() => onEditList(list)} aria-label="Editar lista"><MoreHorizontal size={18} /></button>
          </article>;
        })}</div> : <div className="empty-list-state"><div><ListPlus size={23} /></div><strong>Suas listas começam aqui</strong><p>Crie listas para separar favoritos, recomendações e tudo o que quiser.</p><button className="outline-button" onClick={onNewList}><Plus size={14} />Criar primeira lista</button></div>}
      </section>
    </div>
  );
}

function BookmarkIcon() { return <BookOpen size={20} />; }

function CustomListDetail({ list, items, onBack, onEdit, onDelete, onOpenAnime, onRemoveAnime, onMoveAnime, onAdd }) {
  const entries = (list.anime_ids || []).map(id => items.find(anime => String(anime.mal_id) === String(id))).filter(Boolean);
  return (
    <div className="custom-list-detail">
      <button className="back-link" onClick={onBack}><ChevronLeft size={16} />Voltar para listas</button>
      <div className="custom-list-heading">
        <div className="list-heading-icon"><ListPlus size={28} /></div>
        <div className="list-heading-copy"><p className="eyebrow">MINHA LISTA{list.is_ranked ? ' · RANQUEADA' : ''}</p><h1>{list.name}<span className="heading-dot">.</span></h1><p>{list.description || 'Uma coleção organizada do seu jeito.'}</p><span className="list-visibility">{entries.length} {entries.length === 1 ? 'anime' : 'animes'}{list.is_ranked ? ' · ordem de preferência' : ''}</span></div>
        <div className="list-heading-actions"><button className="outline-button" onClick={onEdit}><Pencil size={14} />Editar</button><button className="icon-button danger" onClick={onDelete} aria-label="Excluir lista"><Trash2 size={16} /></button></div>
      </div>
      <div className="section-heading list-detail-subhead"><div><h2>Animes desta lista</h2><p>Os títulos continuam salvos na sua biblioteca.</p></div><button className="primary-button" onClick={onAdd}><Plus size={15} />Adicionar anime</button></div>
      {entries.length ? <div className="library-grid">{entries.map((anime, index) => <div className={'list-anime-wrap' + (list.is_ranked ? ' ranked-list-item' : '')} key={anime.id}>
        {list.is_ranked && <span className="rank-number">#{index + 1}</span>}
        <PosterCard anime={anime} onClick={() => onOpenAnime(anime)} />
        <div className="list-item-actions">
          {list.is_ranked && <div className="ranked-order-controls">
            <button type="button" onClick={() => onMoveAnime(anime, -1)} disabled={index === 0} aria-label="Mover para cima"><ArrowUp size={13} /></button>
            <button type="button" onClick={() => onMoveAnime(anime, 1)} disabled={index === entries.length - 1} aria-label="Mover para baixo"><ArrowDown size={13} /></button>
          </div>}
          <button className="remove-from-list" onClick={() => onRemoveAnime(anime)}><X size={13} />Remover da lista</button>
        </div>
      </div>)}</div> : <div className="empty-state"><div className="empty-state-icon"><ListPlus size={24} /></div><h2>Esta lista ainda está vazia</h2><p>Adicione títulos que já estão na sua biblioteca ou descubra novos animes.</p><button className="primary-button" onClick={onAdd}><Plus size={15} />Buscar anime</button></div>}
    </div>
  );
}

function Detail({ anime, lists, onBack, onEdit, onDelete, onSync, onEpisodeChange, onStatusChange, onRatingChange, onAddToList }) {
  const total = isCurrentlyAiring(anime) ? null : totalEpisodes(anime);
  const available = episodeProgressLimit(anime);
  const progressTotal = total || available;
  const current = Number(anime.episode_current || 0);
  const progress = progressTotal ? Math.min(100, Math.round((current / progressTotal) * 100)) : 0;
  const canAdvance = ['watching', 'paused', 'dropped'].includes(anime.status) && (!progressTotal || current < progressTotal);
  const ratingStars = anime.rating_personal ? Number(anime.rating_personal) / 2 : 0;

  return (
    <section className="detail-page">
      <button className="back-link" onClick={onBack}><ChevronLeft size={16} />Voltar</button>
      <div className="detail-layout">
        <aside className="detail-side">
          <div className="detail-poster">{anime.image_url ? <img src={anime.image_url} alt={'Pôster de ' + displayTitle(anime)} /> : <div className="detail-poster-fallback"><Clapperboard size={40} /></div>}</div>
          <div className="detail-side-actions"><button className="primary-button" onClick={onEdit}><Pencil size={14} />Editar anime</button><button className="icon-button danger" onClick={onDelete} title="Remover da biblioteca"><Trash2 size={16} /></button></div>
          {!anime.is_manual && <button className="sync-link" onClick={onSync}><ArrowRight size={13} />Atualizar dados do catálogo</button>}
        </aside>
        <div className="detail-main">
          <p className="eyebrow">DETALHES DO ANIME</p>
          <h1>{displayTitle(anime)}<span className="heading-dot">.</span></h1>
          {anime.title_english && anime.title_english !== anime.title && <p className="detail-original-title">{anime.title_english}</p>}
          <div className="detail-meta"><span>{formatReleaseLabel(anime)}</span>{anime.format && <><i>·</i><span>{localizedFormat(anime.format)}</span></>}{anime.season && <><i>·</i><span>{anime.season}</span></>}</div>
          {anime.studios?.length > 0 && <p className="detail-studio">Estúdio: {anime.studios.join(', ')}</p>}
          <div className="detail-tags">{(anime.genres || []).map(genre => <span key={genre}>{genre}</span>)}</div>

          <div className="detail-status-block">
            <div className="detail-block-heading"><span>STATUS NA SUA BIBLIOTECA</span><span className={'status-dot tone-' + statusTone(anime.status)} /></div>
            <div className="status-segment">{STATUSES.map(status => <button key={status.id} className={anime.status === status.id ? 'selected tone-' + status.tone : ''} onClick={() => onStatusChange(status.id)}>{status.label}</button>)}</div>
          </div>

          {anime.episode_unknown && ['paused', 'dropped'].includes(anime.status) ? (
            <div className="detail-progress-card episode-unknown-detail">
              <div className="episode-unknown-icon"><Clock3 size={22} /></div>
              <div>
                <strong>{anime.status === 'paused' ? 'Você não lembra onde pausou' : 'Você não lembra onde parou'}</strong>
                <p>O episódio não foi registrado para este anime.</p>
                <button className="text-button" onClick={onEdit}>Informar episódio</button>
              </div>
            </div>
          ) : (
            <div className="detail-progress-card">
              <div className="progress-card-top">
              <div><span className="eyebrow">SEU PROGRESSO</span><strong>{current}<small>{total ? ' / ' + total : available ? ' / ' + available + ' lançados' : ' episódios registrados'}</small></strong><span>episódios assistidos</span></div>
              <div className="progress-ring" style={{ '--progress': progress + '%' }}><strong>{progressTotal ? progress : '—'}<small>{progressTotal ? '%' : ''}</small></strong></div>
            </div>
            <div className={progressTotal ? 'progress-track' : 'progress-track is-indeterminate'}><span style={{ width: (progressTotal ? progress : 34) + '%' }} /></div>
            {total && current >= total && <p className="progress-complete-hint"><Check size={13} />Você chegou ao total de episódios.</p>}
            {available && !total && current >= available && <p className="progress-complete-hint"><Check size={13} />Você está em dia com os episódios lançados.</p>}
            <div className="episode-controls">
              <span>Atualizar episódio</span>
              <div>
                <button className="episode-step" onClick={() => onEpisodeChange(-1)} disabled={!current}>− 1</button>
                <strong>{current}</strong>
                <button className="episode-step positive" onClick={() => onEpisodeChange(1)} disabled={!canAdvance}>+ 1 episódio</button>
              </div>
            </div>
            {!progressTotal && <p className="episode-availability-note">O catálogo ainda não informou quantos episódios estão disponíveis. Atualize os dados do anime para consultar o catálogo.</p>}
          </div>
          )}

          {anime.status !== 'paused' && (
            <div className="detail-rating-notes">
              {anime.status === 'watching'
                ? <section className="rating-panel rating-panel-locked"><div className="detail-block-heading"><span>SUA NOTA</span><strong>Avaliação após concluir</strong></div><p>Finalize o anime para registrar sua avaliação. Uma nota salva anteriormente será mantida.</p></section>
                : <section className="rating-panel"><div className="detail-block-heading"><span>SUA NOTA</span><strong>{anime.rating_personal ? (Number(anime.rating_personal) / 2).toFixed(1) + ' / 5' : 'Ainda sem nota'}</strong></div><StarRating value={ratingStars} onChange={onRatingChange} /></section>}
            </div>
          )}

          <div className="detail-info-grid">
            <div><span>TEMPORADA</span><strong>{anime.season || '—'}{anime.year ? ' ' + anime.year : ''}</strong></div>
            <div><span>CONCLUSÃO</span><strong>{formatDate(anime.completed_at)}</strong></div>
            {anime.status === 'completed' && <div><span>REASSISTIDAS</span><strong>{anime.rewatch_count || 0} vezes</strong></div>}
          </div>
          <div className="detail-list-action">
            <label><ListPlus size={15} />Adicionar a uma lista</label>
            {lists.length ? <select defaultValue="" onChange={event => { if (event.target.value) onAddToList(event.target.value); event.target.value = ''; }}><option value="">Escolher lista...</option>{lists.map(list => <option key={list.id} value={list.id}>{list.name}</option>)}</select> : <span>Crie uma lista na seção Listas.</span>}
          </div>
          {anime.synopsis && <section className="synopsis-panel"><h3>Sinopse</h3><p>{anime.synopsis}</p></section>}
          <p className="source-note">Informações do catálogo fornecidas por Jikan e AniList.</p>
        </div>
      </div>
    </section>
  );
}

function StarRating({ value, onChange }) {
  const currentValue = Math.max(0, Math.min(5, Number(value) || 0));
  const [hoverValue, setHoverValue] = useState(null);
  const previewValue = hoverValue ?? currentValue;

  function valueAtPointer(star, event) {
    const rect = event.currentTarget.getBoundingClientRect();
    return star - (event.clientX - rect.left < rect.width / 2 ? 0.5 : 0);
  }

  return (
    <div
      className="star-rating"
      role="group"
      aria-label="Sua nota de zero a cinco estrelas, com intervalos de meia estrela"
      onPointerLeave={() => setHoverValue(null)}
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setHoverValue(null);
      }}
    >
      {[1, 2, 3, 4, 5].map(star => {
        const fill = Math.max(0, Math.min(1, previewValue - (star - 1)));
        return (
          <button
            type="button"
            key={star}
            className={fill > 0 ? 'filled' : ''}
            onPointerEnter={event => {
              if (event.pointerType !== 'touch') setHoverValue(valueAtPointer(star, event));
            }}
            onPointerMove={event => {
              if (event.pointerType !== 'touch') setHoverValue(valueAtPointer(star, event));
            }}
            onFocus={() => setHoverValue(star)}
            onClick={event => {
              const nextValue = event.detail === 0
                ? star
                : valueAtPointer(star, event);
              onChange(Math.abs(nextValue - currentValue) < 0.001 ? 0 : nextValue);
              setHoverValue(null);
            }}
            aria-label={star + ' estrelas; metade esquerda para ' + (star - 0.5)}
            aria-pressed={Math.abs(currentValue - star) < 0.001}
            title={'Passe o mouse para pré-visualizar; clique na metade esquerda para ' + (star - 0.5) + ' ou na direita para ' + star}
          >
            <span className="star-rating-symbol">
              <Star className="star-rating-empty" size={23} />
              {fill > 0 && (
                <span className="star-rating-fill" style={{ width: (fill * 100) + '%' }}>
                  <Star size={23} fill="currentColor" />
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function SearchModal({ query, setQuery, searchMode = 'add', results, searching, error, onSearch, onClose, onAdd, onOpenExisting, onManual, isInCollection, allowExisting, libraryItems = [], alreadyInListIds = [], targetListName = '' }) {
  const [formatFilter, setFormatFilter] = useState('all');
  const formatOptions = [
    { id: 'all', label: 'Todos' }, { id: 'TV', label: 'Série (TV)' },
    { id: 'Movie', label: 'Filme' }, { id: 'OVA', label: 'OVA' }
  ];
  const normalizedQuery = query.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const alreadyInList = new Set(alreadyInListIds.map(String));
  const showLibrary = allowExisting || searchMode === 'global';
  const filteredLibrary = showLibrary ? libraryItems
    .filter(anime => !allowExisting || !alreadyInList.has(String(anime.mal_id)))
    .filter(anime => {
      const searchable = (displayTitle(anime) + ' ' + (anime.title_english || '')).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      return !normalizedQuery || searchable.includes(normalizedQuery);
    })
    .sort((a, b) => sortByRecent(a, b)) : [];
  const visibleLibrary = filteredLibrary.slice(0, 24);
  const filteredResults = results
    .filter(result => !(searchMode === 'global' && isInCollection(result)))
    .filter(result => formatFilter === 'all' || result.format === formatFilter)
    .sort((a, b) => {
      const aTitle = displayTitle(a).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const bTitle = displayTitle(b).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      return Number(bTitle.startsWith(normalizedQuery)) - Number(aTitle.startsWith(normalizedQuery));
    });

  return (
    <div className="overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal search-modal">
        <div className="modal-header"><div><p className="eyebrow">{allowExisting ? 'SUA COLEÇÃO E CATÁLOGO' : searchMode === 'global' ? 'PESQUISA GLOBAL' : 'ENCONTRE SEU PRÓXIMO ANIME'}</p><h2>{allowExisting ? 'Adicionar à lista' : searchMode === 'global' ? 'Buscar animes' : 'Adicionar à biblioteca'}</h2>{allowExisting && targetListName && <small className="target-list-name">{targetListName}</small>}</div><button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={18} /></button></div>
        <form className="catalog-search" onSubmit={onSearch}>
          <Search size={19} />
          <input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder={allowExisting ? 'Filtrar sua biblioteca ou buscar no catálogo...' : searchMode === 'global' ? 'Buscar na biblioteca ou no catálogo...' : 'Digite pelo menos 2 letras do anime...'} />
          {searching && <LoaderCircle className="spin" size={17} />}
        </form>
        <p className="helper-text">{allowExisting ? 'Escolha um anime já cadastrado ou pesquise um título externo para adicionar à lista.' : searchMode === 'global' ? 'A busca encontra primeiro os títulos da sua biblioteca e também consulta o catálogo externo.' : 'Os resultados aparecem automaticamente enquanto você digita. Os títulos só entram na biblioteca quando você os adiciona.'}</p>
        {showLibrary && <section className="library-picker-section">
          <div className="library-picker-heading"><div><strong>Da sua biblioteca</strong><span>{filteredLibrary.length} {filteredLibrary.length === 1 ? 'anime encontrado' : 'animes encontrados'}</span></div><span>{allowExisting ? 'SEM NOVO CADASTRO' : 'SEUS TÍTULOS'}</span></div>
          {visibleLibrary.length ? <div className="results-list library-picker-list">{visibleLibrary.map(anime => (
            <article className="result-row" key={'library-' + anime.mal_id}>
              {anime.image_url ? <img src={anime.image_url} alt="" /> : <div className="result-cover-fallback"><Clapperboard size={18} /></div>}
              <div className="result-info"><strong>{displayTitle(anime)}</strong><small>{statusLabel(anime.status)} · {Number(anime.episode_current || 0)} episódios assistidos</small></div>
              {allowExisting
                ? <button type="button" className="outline-button" onClick={() => onAdd(anime)}><Plus size={14} />Adicionar à lista</button>
                : <button type="button" className="outline-button" onClick={() => onOpenExisting(anime)}>Abrir anime</button>}
            </article>
          ))}</div> : <div className="library-picker-empty">{normalizedQuery ? 'Nenhum título da sua biblioteca corresponde à pesquisa.' : allowExisting ? 'Todos os animes da sua biblioteca já estão nesta lista.' : 'Sua biblioteca ainda não tem títulos.'}</div>}
          {filteredLibrary.length > visibleLibrary.length && <p className="library-picker-more">Mostrando os 24 mais recentes. Digite para filtrar os demais.</p>}
        </section>}
        {error && <div className="error-panel"><span>{error}</span><button type="button" className="outline-button" onClick={onManual}>Adicionar manualmente</button></div>}
        {results.length > 0 && <div className="search-format-tabs" role="group" aria-label="Filtrar formato">{formatOptions.map(option => <button type="button" key={option.id} className={formatFilter === option.id ? 'active' : ''} onClick={() => setFormatFilter(option.id)}>{option.label}</button>)}</div>}
        {searching && !results.length && <div className="loading-block compact-loading"><LoaderCircle className="spin" />Buscando “{query.trim()}” no catálogo...</div>}
        {filteredResults.length > 0 && <div className="results-list">{filteredResults.map(result => {
          const exists = isInCollection(result);
          const inThisList = alreadyInList.has(String(result.mal_id));
          const canAddToList = exists && allowExisting && !inThisList;
          return <article className="result-row" key={'catalog-' + result.mal_id}>
            {result.image_url ? <img src={result.image_url} alt="" /> : <div className="result-cover-fallback"><Clapperboard size={18} /></div>}
            <div className="result-info"><strong>{displayTitle(result)}</strong>{result.title_english && result.title_english !== result.title && <span>{result.title_english}</span>}<small>{result.year || 'Ano não informado'} · {result.episodes_total ?? '?'} episódios · {result.format || 'Anime'}</small></div>
            <button type="button" className={inThisList || (exists && !canAddToList) ? 'outline-button result-added' : 'outline-button'} disabled={inThisList || (exists && !canAddToList)} onClick={() => onAdd(result)}>{inThisList ? <><Check size={14} />Já está na lista</> : canAddToList ? <><Plus size={14} />Adicionar à lista</> : exists ? <><Check size={14} />Na biblioteca</> : <><Plus size={14} />Adicionar</>}</button>
          </article>;
        })}</div>}
        {!searching && !error && !results.length && !visibleLibrary.length && <div className="search-empty"><Search size={25} /><p>{query.trim().length >= 2 ? 'Nenhum anime encontrado para esta pesquisa.' : allowExisting ? 'Pesquise no catálogo para encontrar novos títulos.' : 'Comece digitando o nome de um anime.'}</p><button className="text-link" type="button" onClick={onManual}>{query.trim().length >= 2 ? 'Não encontrou no catálogo? Adicionar manualmente' : 'Adicionar manualmente'} <ArrowRight size={13} /></button></div>}
        {!searching && results.length > 0 && !filteredResults.length && <div className="search-filter-empty"><p>Nenhum título neste formato. Escolha outra categoria.</p></div>}
        {results.length > 0 && <button className="manual-add-link" type="button" onClick={onManual}><Plus size={14} />Adicionar manualmente</button>}
      </section>
    </div>
  );
}

function EditorModal({ anime, form, setForm, saving, onSubmit, onClose, onRestoreCatalog }) {
  const [catalogRestored, setCatalogRestored] = useState(false);
  const update = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const today = new Date().toISOString().slice(0, 10);
  const isNew = !anime.created_at;
  const isDirty = catalogRestored || (!isNew && (
    form.status !== (anime.status || 'planned') ||
    String(form.episode_current ?? 0) !== String(anime.episode_current ?? 0) ||
    Boolean(form.episode_unknown) !== Boolean(anime.episode_unknown) ||
    String(form.rating_personal ?? '') !== String(anime.rating_personal ?? '') ||
    String(form.rewatch_count ?? 0) !== String(anime.rewatch_count ?? 0) ||
    String(form.started_at || '') !== String(anime.started_at || '') ||
    String(form.completed_at || '') !== String(anime.completed_at || '') ||
    String(form.title || '') !== String(anime.title || '') ||
    Boolean(form.is_manual) !== Boolean(anime.is_manual)
  ));
  const total = isCurrentlyAiring(anime) ? null : totalEpisodes(anime);
  const available = episodeProgressLimit(anime);
  const maxEpisode = total || available || undefined;
  const episode = Number(form.episode_current || 0);
  const needsEpisode = ['watching', 'paused', 'dropped'].includes(form.status);
  const allowsUnknownEpisode = ['paused', 'dropped'].includes(form.status);
  const showRating = !['planned', 'watching', 'paused'].includes(form.status);
  const dateShortcuts = key => <div className="date-shortcuts">
    <button type="button" onClick={() => update(key, today)}>Hoje</button>
    <button type="button" onClick={() => update(key, '')}>Não lembro</button>
  </div>;
  const setStatus = status => setForm(current => ({
    ...current,
    status,
    episode_current: status === 'planned' ? 0
      : status === 'completed' ? (total || available || Number(current.episode_current || 0))
      : current.episode_unknown && ['paused', 'dropped'].includes(status) ? 0
      : current.episode_current,
    episode_unknown: ['paused', 'dropped'].includes(status) ? Boolean(current.episode_unknown) : false,
    rating_personal: status === 'paused' ? '' : current.rating_personal,
    started_at: status === 'watching' && !current.started_at ? today : current.started_at,
    completed_at: status === 'completed' && !current.completed_at ? today : current.completed_at
  }));

  return (
    <div className="overlay editor-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <form className="modal editor-modal" onSubmit={onSubmit}>
        <div className="modal-header"><div><p className="eyebrow">{isNew ? 'PASSO 2 DE 2 · DEFINA O STATUS' : 'DETALHES DA SUA BIBLIOTECA'}</p><h2>{isNew ? 'Adicionar à biblioteca' : 'Editar anime'}</h2></div><button type="button" className="icon-button" onClick={onClose}><X size={18} /></button></div>
        {isDirty && <div className="editor-unsaved-banner"><span>Você tem alterações não salvas.</span><button type="button" onClick={onClose}>Descartar alterações</button></div>}
        <div className="editor-anime-preview">
          {anime.image_url ? <img src={anime.image_url} alt="" /> : <div className="editor-cover-fallback"><Clapperboard size={24} /></div>}
          <div><strong>{anime.title || 'Novo anime'}</strong><span>{anime.year || 'Ano não informado'} · {total ? total + ' episódios' : available ? available + ' lançados até agora' : 'Total ainda não informado'}</span><small>{(anime.genres || []).slice(0, 3).join(' · ')}</small></div>
          <span className="editor-step">2/2</span>
        </div>
        {form.is_manual && <label className="field full"><span>Título do anime</span><input required value={form.title} onChange={event => update('title', event.target.value)} placeholder="Nome do anime" /></label>}
        <div className="editor-section">
          <span className="field-label">Status</span>
          <div className="status-segment editor-status">{STATUSES.map(status => <button type="button" key={status.id} className={form.status === status.id ? 'selected tone-' + status.tone : ''} onClick={() => setStatus(status.id)}>{status.label}</button>)}</div>
          {form.status === 'planned' && <p className="status-guidance">O anime será salvo em “Quero assistir”. Não é necessário preencher progresso ou datas.</p>}
          {form.status === 'watching' && <p className="status-guidance">Informe o episódio em que você está. A data de início é opcional.</p>}
          {form.status === 'completed' && <p className="status-guidance">Ao salvar como Assistido, o Kataru considera a obra concluída. Não precisa informar o número de episódios.</p>}
          {form.status === 'paused' && <p className="status-guidance">Informe onde você pausou ou marque que não lembra o episódio.</p>}
          {form.status === 'dropped' && <p className="status-guidance">Informe onde parou de assistir ou marque que não lembra o episódio.</p>}
        </div>
        {allowsUnknownEpisode && (
          <label className="episode-unknown-toggle">
            <input
              type="checkbox"
              checked={Boolean(form.episode_unknown)}
              onChange={event => setForm(current => ({
                ...current,
                episode_unknown: event.target.checked,
                episode_current: event.target.checked ? 0 : Number(current.episode_current || 0)
              }))}
            />
            <span>
              <strong>{form.status === 'paused' ? 'Não lembro onde pausei' : 'Não lembro onde parei'}</strong>
              <small>O episódio ficará sem informação de progresso.</small>
            </span>
          </label>
        )}
        {needsEpisode && !form.episode_unknown && (
          <label className="field episode-current-field">
            <span>{form.status === 'dropped' ? 'Episódio em que parou' : form.status === 'paused' ? 'Episódio em que pausou' : 'Episódio atual'}</span>
            <div className="number-stepper">
              <button type="button" onClick={() => update('episode_current', Math.max(0, episode - 1))} disabled={!episode}>−</button>
              <input type="number" min="0" max={maxEpisode} value={form.episode_current} onChange={event => update('episode_current', Math.max(0, Math.min(maxEpisode || 999999, Number(event.target.value || 0))))} />
              <button type="button" onClick={() => update('episode_current', Math.min(maxEpisode || 999999, episode + 1))} disabled={Boolean(maxEpisode && episode >= maxEpisode)}>+</button>
            </div>
            <small>{total ? 'de ' + total + ' episódios' : available ? 'Até o episódio ' + available + ' lançado' : 'Informe o episódio assistido'}</small>
          </label>
        )}
        {form.status === 'watching' && <label className="field date-field"><span>Data de início (opcional)</span><input type="date" value={form.started_at} onChange={event => update('started_at', event.target.value)} />{dateShortcuts('started_at')}</label>}
        {form.status === 'completed' && (
          <>
            <label className="field date-field"><span>Data de término</span><input type="date" value={form.completed_at} onChange={event => update('completed_at', event.target.value)} />{dateShortcuts('completed_at')}</label>
            <label className="field rewatch-field"><span>Quantas vezes reassistiu?</span><input type="number" min="0" value={form.rewatch_count} onChange={event => update('rewatch_count', Math.max(0, Number(event.target.value || 0)))} /></label>
          </>
        )}
        {showRating && <div className="editor-section rating-editor"><div><span className="field-label">Sua nota (opcional)</span><small>Avalie de 1 a 5 estrelas, em intervalos de 0,5.</small></div><StarRating value={form.rating_personal ? Number(form.rating_personal) / 2 : 0} onChange={stars => update('rating_personal', stars ? stars * 2 : '')} /></div>}
        {!form.is_manual && <div className="editor-catalog-actions"><p className="editor-catalog-note">Os dados básicos são obtidos automaticamente do catálogo.</p><button type="button" className="text-button" onClick={async () => { const restored = await onRestoreCatalog(); if (restored) setCatalogRestored(true); }}>Atualizar dados do catálogo</button></div>}
        <div className="modal-actions"><button type="button" className="text-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={saving}>{saving ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}{isNew ? 'Adicionar à biblioteca' : 'Salvar alterações'}</button></div>
      </form>
    </div>
  );
}

function ListEditorModal({ list, form, setForm, saving, onSubmit, onClose }) {
  return (
    <div className="overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <form className="modal list-editor-modal" onSubmit={onSubmit}>
        <div className="modal-header"><div><p className="eyebrow">ORGANIZE DO SEU JEITO</p><h2>{list ? 'Editar lista' : 'Nova lista'}</h2></div><button type="button" className="icon-button" onClick={onClose}><X size={18} /></button></div>
        <label className="field"><span>Nome</span><input autoFocus required maxLength="60" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="Ex.: Favoritos de todos os tempos" /></label>
        <label className="field list-description-field"><span>Descrição (opcional)</span><textarea rows="3" maxLength="220" value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} placeholder="Sobre o que é esta lista?" /></label>
        <label className="visibility-toggle ranked-toggle"><input type="checkbox" checked={Boolean(form.is_ranked)} onChange={event => setForm({ ...form, is_ranked: event.target.checked })} /><span><strong>Ordenar por preferência</strong><small>Cria um ranking: 1º lugar, 2º lugar, 3º lugar. Depois você pode mover os animes para cima ou para baixo.</small></span><i>{form.is_ranked ? 'Ativado' : 'Livre'}</i></label>
        <div className="modal-actions"><button type="button" className="text-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={saving || !form.name.trim()}>{saving ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}{list ? 'Salvar alterações' : 'Criar lista'}</button></div>
      </form>
    </div>
  );
}
