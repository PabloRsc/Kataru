import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BookOpen, CalendarDays, Check, ChevronDown, ChevronLeft,
  ChevronRight, Clapperboard, Clock3, Compass, Filter, Grid2X2, Heart, Home,
  Library, List, ListPlus, LoaderCircle, LogOut, MoreHorizontal, Pencil, Plus,
  Search, Settings2, SlidersHorizontal, Sparkles, Star, Trash2, Trophy, Tv,
  X, Zap
} from 'lucide-react';
import { discoverAnime, fetchAnime, fetchAnimeGenres, searchAnime } from './api';
import {
  createAnimeList, deleteAnime, deleteAnimeList, getAnimeList, getAnimeLists,
  saveAnime, saveAnimeList, storageMode, supabase
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
  { id: 'updated', label: 'Atualizado recentemente' },
  { id: 'added', label: 'Adicionado recentemente' },
  { id: 'title', label: 'Título (A–Z)' },
  { id: 'rating', label: 'Maior nota pessoal' },
  { id: 'progress', label: 'Maior progresso' }
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
const getInitials = value => String(value || 'K').trim().slice(0, 1).toUpperCase();

export default function App() {
  const [items, setItems] = useState([]);
  const [lists, setLists] = useState([]);
  const [page, setPage] = useState('home');
  const [selected, setSelected] = useState(null);
  const [activeList, setActiveList] = useState(null);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('updated');
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
  const [discoverTab, setDiscoverTab] = useState('season');
  const [discoverResults, setDiscoverResults] = useState([]);
  const [discoverRecommendations, setDiscoverRecommendations] = useState([]);
  const [discoverGenres, setDiscoverGenres] = useState([]);
  const [discoverGenre, setDiscoverGenre] = useState(null);
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [discoverReload, setDiscoverReload] = useState(0);
  const [discoverError, setDiscoverError] = useState('');
  const [listEditorOpen, setListEditorOpen] = useState(false);
  const [listEditing, setListEditing] = useState(null);
  const [listForm, setListForm] = useState({ name: '', description: '', is_ranked: false });
  const [listSaving, setListSaving] = useState(false);
  const [pendingListId, setPendingListId] = useState(null);
  const [authUser, setAuthUser] = useState(null);
  const [profileOpen, setProfileOpen] = useState(false);
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
    setDiscoverError('');

    if (discoverTab === 'genres') {
      Promise.all([fetchAnimeGenres(), discoverAnime('popular').catch(() => [])])
        .then(([genres, recommendations]) => {
          if (!active) return;
          setDiscoverGenres(genres || []);
          setDiscoverRecommendations(recommendations || []);
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
      const recommendationRequest = discoverTab === 'popular'
        ? discoverAnime('top-rated').catch(() => [])
        : discoverAnime('popular').catch(() => []);

      Promise.all([discoverAnime(kind), recommendationRequest])
        .then(([data, recommendations]) => {
          if (!active) return;
          setDiscoverResults(data || []);
          setDiscoverRecommendations(recommendations || []);
        })
        .catch(error => {
          if (active) setDiscoverError(error.message || 'Não foi possível carregar o catálogo.');
        })
        .finally(() => { if (active) setDiscoverLoading(false); });
    }
    return () => { active = false; };
  }, [page, discoverTab, discoverGenre, discoverReload]);

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
    let data = items.filter(anime => {
      const text = (displayTitle(anime) + ' ' + (anime.title_english || '')).toLowerCase();
      const matchesStatus = filter === 'all' || anime.status === filter;
      const matchesQuery = text.includes(query.trim().toLowerCase());
      const matchesGenre = !genreFilter || (anime.genres || []).includes(genreFilter);
      const matchesYear = !yearFilter || String(anime.year || '') === yearFilter;
      const matchesFormat = !formatFilter || String(anime.format || '').toLowerCase() === formatFilter.toLowerCase();
      const matchesRating = !ratingFilter || (Number(anime.rating_personal || 0) >= Number(ratingFilter));
      return matchesStatus && matchesQuery && matchesGenre && matchesYear && matchesFormat && matchesRating;
    });
    if (sort === 'title') data.sort((a, b) => displayTitle(a).localeCompare(displayTitle(b), 'pt-BR'));
    else if (sort === 'rating') data.sort((a, b) => Number(b.rating_personal || 0) - Number(a.rating_personal || 0));
    else if (sort === 'progress') data.sort((a, b) => (Number(b.episode_current || 0) / (totalEpisodes(b) || 999999)) - (Number(a.episode_current || 0) / (totalEpisodes(a) || 999999)));
    else if (sort === 'added') data.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    else data.sort(sortByRecent);
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

  function startAdd(result) {
    const anime = {
      ...result,
      id: String(result.mal_id),
      is_manual: Boolean(result.is_manual)
    };
    setEditor(anime);
    setForm({
      ...EMPTY_FORM,
      status: 'planned',
      episode_current: 0,
      title: result.title || ''
    });
    setSearchOpen(false);
    setSelected(null);
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
      const catalogTotal = isCurrentlyAiring(editor) ? null : totalEpisodes(editor);
      const available = episodeProgressLimit(editor);
      const completedCount = catalogTotal || available || Number(editor.episode_current || 0);
      const anime = {
        ...editor,
        ...form,
        id: String(editor.id || editor.mal_id),
        mal_id: Number(editor.mal_id),
        title: form.is_manual ? form.title.trim() : (editor.title || form.title),
        episode_current: form.status === 'planned' ? 0
          : form.status === 'completed' ? completedCount
          : Math.max(0, Number(form.episode_current || 0)),
        rating_personal: form.rating_personal === '' ? null : Number(form.rating_personal),
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
    let updated = { ...anime, episode_current: next };
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
    const updated = { ...anime, status };
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

  const isInCollection = anime => items.some(item => String(item.mal_id) === String(anime.mal_id));
  const watching = items.filter(item => item.status === 'watching').sort(sortByRecent);
  const completed = items.filter(item => item.status === 'completed').sort(sortByRecent);
  const planned = items.filter(item => item.status === 'planned').sort(sortByRecent);
  const recentlyUpdated = [...items].sort(sortByRecent).slice(0, 8);

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => navigate('home')} aria-label="Kataru — início">
          <span className="brand-name">kataru<span>.</span></span>
        </button>
        <nav className="main-nav" aria-label="Navegação principal">
          <button className={page === 'home' ? 'nav-link active' : 'nav-link'} onClick={() => navigate('home')}>Início</button>
          <button className={page === 'library' ? 'nav-link active' : 'nav-link'} onClick={() => navigate('library')}>Biblioteca</button>
          <button className={page === 'discover' ? 'nav-link active' : 'nav-link'} onClick={() => navigate('discover')}>Descobrir</button>
          <button className={page === 'lists' ? 'nav-link active' : 'nav-link'} onClick={() => navigate('lists')}>Listas</button>
        </nav>
        <div className="topbar-actions">
          <button className="global-search" aria-label="Buscar animes e estúdios" onClick={() => {
            setSearchMode('global'); setSearchOpen(true); setSearchQuery(''); setResults([]);
          }}><Search size={16} /><span>Buscar animes, estúdios...</span></button>
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
                <strong>{authUser?.user_metadata?.full_name || authUser?.user_metadata?.name || authUser?.email?.split('@')[0] || 'Biblioteca local'}</strong>
                <small>{authUser?.email || 'Dados salvos neste navegador'}</small>
              </span>
              <ChevronDown className="profile-chevron" size={14} />
            </button>
            {profileOpen && <div className="profile-dropdown" role="menu">
              <div className="profile-dropdown-user">
                <strong>{authUser?.user_metadata?.full_name || authUser?.user_metadata?.name || authUser?.email?.split('@')[0] || 'Biblioteca local'}</strong>
                <span>{authUser?.email || 'Seus dados ficam salvos neste navegador.'}</span>
              </div>
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
          />
        ) : page === 'discover' ? (
          <DiscoverPage
            tab={discoverTab}
            setTab={value => { setDiscoverTab(value); setDiscoverGenre(null); }}
            results={discoverResults}
            recommendations={discoverRecommendations}
            genres={discoverGenres}
            loading={discoverLoading}
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
            onAdd={anime => startAdd(anime)}
            isInCollection={isInCollection}
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
        <span className="footer-brand">KATARU<span>.</span></span>
        <span>Seu universo de animes, em um só lugar.</span>
        <span className="storage-label">{storageMode === 'supabase' ? 'Sincronizado na nuvem' : 'Salvo neste navegador'}</span>
      </footer>

      <nav className="mobile-nav" aria-label="Navegação mobile">
        <button className={page === 'home' ? 'mobile-nav-item active' : 'mobile-nav-item'} onClick={() => navigate('home')}><Home size={19} /><span>Início</span></button>
        <button className={page === 'library' ? 'mobile-nav-item active' : 'mobile-nav-item'} onClick={() => navigate('library')}><Library size={19} /><span>Biblioteca</span></button>
        <button className="mobile-nav-add" onClick={() => setSearchOpen(true)}><Plus size={21} /></button>
        <button className={page === 'discover' ? 'mobile-nav-item active' : 'mobile-nav-item'} onClick={() => navigate('discover')}><Compass size={19} /><span>Descobrir</span></button>
        <button className={page === 'lists' ? 'mobile-nav-item active' : 'mobile-nav-item'} onClick={() => navigate('lists')}><List size={19} /><span>Listas</span></button>
      </nav>

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
          </div>
          <button className="continue-poster" onClick={() => onOpenAnime(featured)} aria-label={'Abrir ' + displayTitle(featured)}>
            {featured.image_url
              ? <img src={featured.image_url} alt={'Capa de ' + displayTitle(featured)} />
              : <span><Clapperboard size={34} /></span>}
          </button>
          {watching.length > 1 && (
            <div className="continue-controls" aria-label="Navegar entre animes em andamento">
              <button onClick={() => setFeaturedIndex(current => (current - 1 + watching.length) % watching.length)} aria-label="Anime anterior"><ChevronLeft size={17} /></button>
              <span>{(featuredIndex % watching.length) + 1} / {watching.length}</span>
              <button onClick={() => setFeaturedIndex(current => (current + 1) % watching.length)} aria-label="Próximo anime"><ChevronRight size={17} /></button>
            </div>
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

function PosterCard({ anime, onClick, compact = false }) {
  const total = episodeProgressLimit(anime);
  const progress = total ? Math.min(100, (Number(anime.episode_current || 0) / total) * 100) : 0;
  return (
    <button className={compact ? 'poster-card compact' : 'poster-card'} onClick={onClick} title={displayTitle(anime)}>
      <div className="poster-art">
        {anime.image_url ? <img src={anime.image_url} alt={'Pôster de ' + displayTitle(anime)} loading="lazy" /> : <div className="poster-fallback"><Clapperboard size={25} /></div>}
        <span className={'status-pill tone-' + statusTone(anime.status)}>{statusLabel(anime.status)}</span>
        {anime.rating_personal !== null && anime.rating_personal !== '' && <span className="poster-rating"><Star size={10} fill="currentColor" />{(Number(anime.rating_personal) / 2).toFixed(1)}</span>}
        {anime.status === 'watching' && <span className="poster-progress"><i style={{ width: progress + '%' }} /></span>}
      </div>
      <span className="poster-name">{displayTitle(anime)}</span>
      <span className="poster-meta">{anime.year || 'Ano não informado'}{anime.format ? ' · ' + anime.format : ''}</span>
    </button>
  );
}

function LibraryPage({
  items, allItems, loading, counts, filter, setFilter, query, setQuery, sort, setSort,
  gridMode, setGridMode, genreFilter, setGenreFilter, yearFilter, setYearFilter,
  formatFilter, setFormatFilter, ratingFilter, setRatingFilter, onOpenAnime, onAdd
}) {
  const genres = Array.from(new Set(allItems.flatMap(anime => anime.genres || []))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const years = Array.from(new Set(allItems.map(anime => anime.year).filter(Boolean))).sort((a, b) => b - a);
  const filtersActive = Boolean(genreFilter || yearFilter || formatFilter || ratingFilter);
  function clearFilters() { setGenreFilter(''); setYearFilter(''); setFormatFilter(''); setRatingFilter(''); }

  return (
    <div className="library-page">
      <PageIntro
        eyebrow="SUA COLEÇÃO PESSOAL"
        title="Biblioteca"
        subtitle="Tudo o que você acompanha, em um só lugar."
        action={<div className="view-toggle"><button className={gridMode === 'grid' ? 'selected' : ''} onClick={() => setGridMode('grid')} aria-label="Visualização em grade"><Grid2X2 size={16} />Grade</button><button className={gridMode === 'list' ? 'selected' : ''} onClick={() => setGridMode('list')} aria-label="Visualização em lista"><List size={16} />Lista</button></div>}
      />
      <div className="status-tabs">
        <button className={filter === 'all' ? 'status-tab active' : 'status-tab'} onClick={() => setFilter('all')}>Todos <span>{counts.all}</span></button>
        {STATUSES.map(status => <button key={status.id} className={filter === status.id ? 'status-tab active' : 'status-tab'} onClick={() => setFilter(status.id)}>{status.label} <span>{counts[status.id] || 0}</span></button>)}
      </div>
      <div className="library-toolbar">
        <label className="search-field"><Search size={16} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar na biblioteca" /><kbd>/</kbd>{query && <button onClick={() => setQuery('')} aria-label="Limpar busca"><X size={14} /></button>}</label>
        <div className="filter-controls">
          <label className="select-filter"><SlidersHorizontal size={14} /><select value={sort} onChange={event => setSort(event.target.value)}>{SORT_OPTIONS.map(option => <option key={option.id} value={option.id}>Ordenar: {option.label}</option>)}</select><ChevronDown size={13} /></label>
          <label className="select-filter"><select value={genreFilter} onChange={event => setGenreFilter(event.target.value)}><option value="">Gênero</option>{genres.map(genre => <option key={genre}>{genre}</option>)}</select><ChevronDown size={13} /></label>
          <label className="select-filter"><select value={yearFilter} onChange={event => setYearFilter(event.target.value)}><option value="">Ano</option>{years.map(year => <option key={year} value={year}>{year}</option>)}</select><ChevronDown size={13} /></label>
          <label className="select-filter"><select value={formatFilter} onChange={event => setFormatFilter(event.target.value)}><option value="">Formato</option>{['TV', 'Movie', 'OVA', 'ONA', 'Special', 'Music'].map(value => <option key={value} value={value}>{value === 'Movie' ? 'Filme' : value}</option>)}</select><ChevronDown size={13} /></label>
          <label className="select-filter"><select value={ratingFilter} onChange={event => setRatingFilter(event.target.value)}><option value="">Nota</option><option value="8">4 estrelas ou mais</option><option value="6">3 estrelas ou mais</option><option value="4">2 estrelas ou mais</option></select><ChevronDown size={13} /></label>
        </div>
      </div>
      {filtersActive && <div className="active-filters"><span>Filtros ativos:</span>{genreFilter && <button className="filter-chip" onClick={() => setGenreFilter('')}>{genreFilter}<X size={12} /></button>}{yearFilter && <button className="filter-chip" onClick={() => setYearFilter('')}>{yearFilter}<X size={12} /></button>}{formatFilter && <button className="filter-chip" onClick={() => setFormatFilter('')}>{formatFilter}<X size={12} /></button>}{ratingFilter && <button className="filter-chip" onClick={() => setRatingFilter('')}>{ratingFilter}+<X size={12} /></button>}<button className="clear-filters" onClick={clearFilters}>Limpar tudo</button></div>}
      <div className="results-summary"><span>{items.length} {items.length === 1 ? 'resultado' : 'resultados'}</span><span>{filter === 'all' ? 'Todos os status' : statusLabel(filter)}</span></div>
      {loading ? <div className="loading-block"><LoaderCircle className="spin" />Carregando sua biblioteca...</div> : items.length ? (
        gridMode === 'grid' ? <div className="library-grid">{items.map(anime => <PosterCard key={anime.id} anime={anime} onClick={() => onOpenAnime(anime)} />)}</div> :
          <div className="library-list">{items.map(anime => <AnimeRow key={anime.id} anime={anime} onClick={() => onOpenAnime(anime)} />)}</div>
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
  const pct = total ? Math.round((Number(anime.episode_current || 0) / total) * 100) : 0;
  return (
    <button className="anime-row" onClick={onClick}>
      {anime.image_url ? <img src={anime.image_url} alt="" loading="lazy" /> : <div className="row-fallback"><Clapperboard size={20} /></div>}
      <span className="row-title"><strong>{displayTitle(anime)}</strong><small>{anime.year || '—'} · {anime.format || 'Anime'}</small></span>
      <span className={'row-status tone-' + statusTone(anime.status)}>{statusLabel(anime.status)}</span>
      <span className="row-progress">{total ? (anime.episode_current || 0) + ' / ' + total + ' eps.' : (anime.episode_current || 0) + ' eps.'}<i><b style={{ width: pct + '%' }} /></i></span>
      <span className="row-rating">{anime.rating_personal ? <><Star size={12} fill="currentColor" />{(anime.rating_personal / 2).toFixed(1)}</> : '—'}</span>
      <ChevronRight size={16} className="row-chevron" />
    </button>
  );
}

function DiscoverPage({ tab, setTab, results, recommendations: recommendationSource, genres, loading, error, selectedGenre, collection, onRetry, onSelectGenre, onOpenAnime, onAdd, isInCollection }) {
  const [genreQuery, setGenreQuery] = useState('');
  const shownGenres = genres.filter(genre => String(genre.name || '').toLowerCase().includes(genreQuery.toLowerCase()));
  const genreAffinity = {};
  (collection || []).forEach(anime => (anime.genres || []).forEach(genre => {
    genreAffinity[genre] = (genreAffinity[genre] || 0) + (anime.status === 'completed' || anime.status === 'watching' ? 2 : 1);
  }));
  const preferredGenres = Object.entries(genreAffinity).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([name]) => name);
  const feature = results[0] || null;
  const recommendations = (recommendationSource || [])
    .filter(anime => !isInCollection(anime) && !(results || []).some(result => String(result.mal_id) === String(anime.mal_id)))
    .map(anime => ({
      ...anime,
      _matchedGenres: (anime.genres || []).filter(genre => preferredGenres.includes(genre)),
      _matchScore: (anime.genres || []).filter(genre => preferredGenres.includes(genre)).length
    }))
    .filter(anime => preferredGenres.length ? anime._matchScore > 0 : true)
    .sort((a, b) => b._matchScore - a._matchScore || Number(b.score_external || 0) - Number(a.score_external || 0))
    .slice(0, 6);

  const isGenreResult = tab === 'genre';
  const activeTab = isGenreResult ? 'genres' : tab;
  const feedTitle = tab === 'season' ? 'Em alta nesta temporada'
    : tab === 'popular' ? 'Mais populares'
      : tab === 'upcoming' ? 'Próximos lançamentos'
        : isGenreResult ? 'Animes de ' + (selectedGenre?.name || 'gênero')
          : 'Descubra por gênero';
  const featureLabel = tab === 'season' ? 'TEMPORADA ATUAL'
    : tab === 'popular' ? 'MAIS POPULARES'
      : tab === 'upcoming' ? 'EM BREVE'
        : 'GÊNERO EM DESTAQUE';

  return (
    <div className="discover-page">
      <PageIntro eyebrow="EXPLORE NOVAS HISTÓRIAS" title="Descobrir" subtitle="Encontre seu próximo anime favorito." />
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
            <div className="genre-grid">{shownGenres.map(genre => (
              <button key={genre.name || genre.mal_id} className="genre-card" onClick={() => onSelectGenre(genre)}>
                <span>{genre.name}</span><ArrowUpRightIcon />
              </button>
            ))}</div>
          )}
          {!loading && !error && recommendations.length > 0 && (
            <DiscoverShelf
              title="Recomendados para você"
              subtitle={preferredGenres.length ? 'Sugestões relacionadas aos gêneros da sua biblioteca.' : 'Títulos populares para começar a explorar.'}
              items={recommendations}
              collectionCheck={isInCollection}
              onOpenAnime={onOpenAnime}
              onAdd={onAdd}
              reasonFor={anime => anime._matchedGenres?.length ? 'Combina com ' + anime._matchedGenres.slice(0, 2).join(' e ') : 'Popular no catálogo'}
            />
          )}
        </>
      ) : (
        <>
          {isGenreResult && (
            <div className="genre-context">
              <span>GÊNERO SELECIONADO</span><strong>{selectedGenre?.name}</strong>
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
                    <p>{feature.synopsis || 'Uma nova história para adicionar à sua lista.'}</p>
                    <div className="feature-meta">
                      <span>{feature.year || 'Ano não informado'}</span>
                      {feature.format && <><i>·</i><span>{feature.format}</span></>}
                      {feature.score_external && <><i>·</i><span><Star size={12} fill="currentColor" />{Number(feature.score_external).toFixed(1)}</span></>}
                    </div>
                    <div className="hero-actions">
                      <button className="primary-button" onClick={() => onAdd(feature)} disabled={isInCollection(feature)}>
                        <Plus size={15} />{isInCollection(feature) ? 'Na biblioteca' : 'Quero assistir'}
                      </button>
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
                items={results.filter(anime => String(anime.mal_id) !== String(feature?.mal_id))}
                collectionCheck={isInCollection}
                onOpenAnime={onOpenAnime}
                onAdd={onAdd}
              />
              <DiscoverShelf
                title="Recomendados para você"
                subtitle={preferredGenres.length ? 'Sugestões relacionadas aos gêneros presentes na sua biblioteca.' : 'Títulos populares selecionados para você começar a explorar.'}
                items={recommendations}
                collectionCheck={isInCollection}
                onOpenAnime={onOpenAnime}
                onAdd={onAdd}
                reasonFor={anime => anime._matchedGenres?.length ? 'Combina com ' + anime._matchedGenres.slice(0, 2).join(' e ') : 'Popular no catálogo'}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}

function DiscoverShelf({ title, subtitle, items, collectionCheck, onOpenAnime, onAdd, reasonFor }) {
  if (!items?.length) return null;
  return (
    <section className="shelf-section discover-shelf">
      <div className="section-heading">
        <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
        <span className="catalog-count">{items.length} títulos</span>
      </div>
      <div className="poster-rail discover-poster-rail">
        {items.map(anime => {
          const exists = collectionCheck(anime);
          return (
            <article className="discover-poster-item" key={anime.mal_id}>
              <button className="poster-card discover-poster-card" onClick={() => onOpenAnime(anime)} title={displayTitle(anime)}>
                <div className="poster-art">
                  {anime.image_url ? <img src={anime.image_url} alt={'Pôster de ' + displayTitle(anime)} loading="lazy" /> : <div className="poster-fallback"><Clapperboard size={25} /></div>}
                  {anime.score_external && <span className="poster-rating"><Star size={10} fill="currentColor" />{Number(anime.score_external).toFixed(1)}</span>}
                </div>
                <span className="poster-name">{displayTitle(anime)}</span>
                <span className="poster-meta">{anime.year || 'Ano não informado'}{anime.format ? ' · ' + anime.format : ''}</span>
              </button>
              {reasonFor && <span className="discover-reason">{reasonFor(anime)}</span>}
              <button className={exists ? 'discover-add added' : 'discover-add'} onClick={() => onAdd(anime)} disabled={exists}>
                {exists ? <><Check size={13} />Na biblioteca</> : <><Plus size={13} />Adicionar</>}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ArrowUpRightIcon() { return <ArrowRight size={17} />; }

function CatalogError({ message, onRetry }) {
  return <div className="catalog-error"><div><Compass size={22} /><strong>Catálogo indisponível no momento</strong><p>{message}</p><button className="outline-button" onClick={onRetry}>Tentar novamente</button></div></div>;
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
  const canAdvance = Boolean(progressTotal && current < progressTotal);
  const ratingStars = anime.rating_personal ? Math.round(Number(anime.rating_personal) / 2) : 0;

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
          <div className="detail-meta"><span>{anime.year || 'Ano não informado'}</span>{anime.season && <><i>·</i><span>{anime.season}</span></>}</div>
          {anime.studios?.length > 0 && <p className="detail-studio">Estúdio: {anime.studios.join(', ')}</p>}
          <div className="detail-tags">{(anime.genres || []).map(genre => <span key={genre}>{genre}</span>)}</div>

          <div className="detail-status-block">
            <div className="detail-block-heading"><span>STATUS NA SUA BIBLIOTECA</span><span className={'status-dot tone-' + statusTone(anime.status)} /></div>
            <div className="status-segment">{STATUSES.map(status => <button key={status.id} className={anime.status === status.id ? 'selected tone-' + status.tone : ''} onClick={() => onStatusChange(status.id)}>{status.label}</button>)}</div>
          </div>

          <div className="detail-progress-card">
            <div className="progress-card-top">
              <div><span className="eyebrow">SEU PROGRESSO</span><strong>{current}<small>{total ? ' / ' + total : available ? ' / ' + available + ' lançados' : ' episódios registrados'}</small></strong><span>episódios assistidos</span></div>
              <div className="progress-ring" style={{ '--progress': progress + '%' }}><strong>{progressTotal ? progress : '—'}<small>{progressTotal ? '%' : ''}</small></strong></div>
            </div>
            <div className="progress-track"><span style={{ width: progress + '%' }} /></div>
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

          <div className="detail-rating-notes">
            <section className="rating-panel"><div className="detail-block-heading"><span>SUA NOTA</span><strong>{anime.rating_personal ? (Number(anime.rating_personal) / 2).toFixed(1) + ' / 5' : 'Ainda sem nota'}</strong></div><StarRating value={ratingStars} onChange={onRatingChange} /></section>
          </div>

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
  return <div className="star-rating" role="group" aria-label="Sua nota de zero a cinco estrelas">{[1, 2, 3, 4, 5].map(star => <button type="button" key={star} className={star <= value ? 'filled' : ''} onClick={() => onChange(star === value ? 0 : star)} aria-label={star + ' estrelas'}><Star size={23} fill={star <= value ? 'currentColor' : 'none'} /></button>)}</div>;
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
  const showRating = form.status !== 'planned';
  const dateShortcuts = key => <div className="date-shortcuts">
    <button type="button" onClick={() => update(key, today)}>Hoje</button>
    <button type="button" onClick={() => update(key, '')}>Não lembro</button>
  </div>;
  const setStatus = status => setForm(current => ({
    ...current,
    status,
    episode_current: status === 'planned' ? 0
      : status === 'completed' ? (total || available || Number(current.episode_current || 0))
      : current.episode_current,
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
          {form.status === 'paused' && <p className="status-guidance">Informe o episódio em que você pausou.</p>}
          {form.status === 'dropped' && <p className="status-guidance">Informe o episódio em que você parou de assistir.</p>}
        </div>
        {needsEpisode && (
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
        {showRating && <div className="editor-section rating-editor"><div><span className="field-label">Sua nota (opcional)</span><small>Avalie de 1 a 5 estrelas.</small></div><StarRating value={form.rating_personal ? Math.round(Number(form.rating_personal) / 2) : 0} onChange={stars => update('rating_personal', stars ? stars * 2 : '')} /></div>}
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
