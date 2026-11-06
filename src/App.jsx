import React, { useEffect, useMemo, useState } from 'react';
import { Search, Plus, Clapperboard, X, ChevronLeft, Star, Pencil, Trash2, LoaderCircle, Library, SlidersHorizontal, Check, ExternalLink, LogOut } from 'lucide-react';
import { searchAnime, fetchAnime } from './api';
import { getAnimeList, saveAnime, deleteAnime, storageMode, supabase } from './storage';

const STATUSES = [
  { id: 'watching', label: 'Assistindo' },
  { id: 'completed', label: 'Concluídos' },
  { id: 'planned', label: 'Planejados' },
  { id: 'paused', label: 'Pausados' }
];
const emptyForm = { status: 'planned', episode_current: 0, rating_personal: '', notes: '' };

export default function App() {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => { getAnimeList().then(setItems).catch(() => notify('Não foi possível carregar sua coleção.')).finally(() => setLoading(false)); }, []);
  function notify(message) { setToast(message); window.setTimeout(() => setToast(''), 2800); }

  const visible = useMemo(() => items.filter(a => {
    const matchesFilter = filter === 'all' || a.status === filter;
    const matchesQuery = `${a.title} ${a.title_english || ''}`.toLowerCase().includes(query.toLowerCase());
    return matchesFilter && matchesQuery;
  }), [items, filter, query]);

  async function doSearch(e) {
    e?.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true); setSearchError(''); setResults([]);
    try { setResults(await searchAnime(searchQuery.trim())); }
    catch (err) { setSearchError(err.message || 'Erro ao pesquisar.'); }
    finally { setSearching(false); }
  }

  function startAdd(result) {
    setEditing({ ...result, id: String(result.mal_id) });
    setForm({ ...emptyForm, episode_current: 0 });
    setSearchOpen(false); setSelected(null);
  }
  function startEdit(anime) {
    setEditing(anime);
    setForm({ status: anime.status, episode_current: anime.episode_current ?? 0, rating_personal: anime.rating_personal ?? '', notes: anime.notes || '' });
    setSelected(null);
  }
  async function submitAnime(e) {
    e.preventDefault(); setSaving(true);
    try {
      const anime = { ...editing, ...form, id: String(editing.id), episode_current: Number(form.episode_current || 0), rating_personal: form.rating_personal === '' ? null : Number(form.rating_personal), api_synced_at: editing.api_synced_at || null };
      await saveAnime(anime);
      setItems(await getAnimeList()); setEditing(null); notify('Anime salvo na sua coleção.');
    } catch (err) { notify(err.message || 'Não foi possível salvar.'); }
    finally { setSaving(false); }
  }
  async function syncOne(anime) {
    try {
      const fresh = await fetchAnime(anime.mal_id);
      const merged = { ...anime, ...fresh, id: anime.id, status: anime.status, episode_current: anime.episode_current, rating_personal: anime.rating_personal, notes: anime.notes };
      await saveAnime(merged); setItems(await getAnimeList()); setSelected(merged); notify('Informações atualizadas.');
    } catch (err) { notify(err.message || 'Falha ao atualizar informações.'); }
  }
  async function changeEpisode(anime, delta) {
    const nextEpisode = Math.max(0, Number(anime.episode_current || 0) + delta);
    if (anime.episodes_total && nextEpisode > anime.episodes_total) return;
    const updated = { ...anime, episode_current: nextEpisode };
    try {
      await saveAnime(updated);
      setItems(await getAnimeList());
      setSelected(updated);
      notify('Progresso atualizado.');
    } catch (err) { notify(err.message || 'Não foi possível atualizar o progresso.'); }
  }
  async function changeStatus(anime, status) {
    const updated = { ...anime, status };
    try {
      await saveAnime(updated);
      setItems(await getAnimeList());
      setSelected(updated);
      notify('Status atualizado.');
    } catch (err) { notify(err.message || 'Não foi possível atualizar o status.'); }
  }
  async function removeAnime(anime) {
    if (!window.confirm(`Remover “${anime.title}” da sua coleção?`)) return;
    await deleteAnime(anime.id); setItems(await getAnimeList()); setSelected(null); notify('Anime removido.');
  }
  const counts = { all: items.length, ...Object.fromEntries(STATUSES.map(s => [s.id, items.filter(a => a.status === s.id).length])) };

  return <div className="app-shell">
    <header className="topbar"><a className="brand" href="#top" onClick={() => { setSelected(null); setFilter('all'); }}><span className="brand-mark"><Clapperboard size={19}/></span><span>Kataru</span></a>
      <nav className="top-nav"><button className="nav-link active" onClick={() => { setSelected(null); setFilter('all'); }}>Minha coleção</button><button className="nav-link" onClick={() => setSearchOpen(true)}>Adicionar anime</button></nav>
      <div className="topbar-actions"><button className="add-button" onClick={() => setSearchOpen(true)}><Plus size={17}/><span>Adicionar</span></button>{storageMode === "supabase" && <button className="signout-button" title="Sair da conta" aria-label="Sair da conta" onClick={async () => { await supabase.auth.signOut(); }}><LogOut size={16}/></button>}</div>
    </header>

    <main className="main-content" id="top">
      {selected ? <Detail anime={selected} onBack={() => setSelected(null)} onEdit={() => startEdit(selected)} onDelete={() => removeAnime(selected)} onSync={() => syncOne(selected)} onEpisodeChange={delta => changeEpisode(selected, delta)} onStatusChange={status => changeStatus(selected, status)} /> : <>
        <section className="page-heading"><div><p className="eyebrow">SUA BIBLIOTECA PESSOAL</p><h1>Minha coleção<span className="heading-dot">.</span></h1><p className="subheading">Todos os seus animes, organizados do seu jeito.</p></div><div className="collection-count"><strong>{items.length}</strong><span>{items.length === 1 ? 'título' : 'títulos'}</span></div></section>
        <section className="toolbar"><div className="filters"><button className={`filter-tab ${filter === 'all' ? 'selected' : ''}`} onClick={() => setFilter('all')}>Todos <span>{counts.all}</span></button>{STATUSES.map(s => <button key={s.id} className={`filter-tab ${filter === s.id ? 'selected' : ''}`} onClick={() => setFilter(s.id)}>{s.label} <span>{counts[s.id]}</span></button>)}</div><label className="collection-search"><Search size={16}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar na coleção"/><kbd>/</kbd></label></section>
        {loading ? <div className="empty-state"><LoaderCircle className="spin"/><p>Carregando sua coleção...</p></div> : visible.length ? <section className="poster-grid">{visible.map(anime => <Poster key={anime.id} anime={anime} onClick={() => setSelected(anime)}/>)}</section> : <div className="empty-state"><div className="empty-icon"><Library size={25}/></div><h2>{query ? 'Nenhum resultado encontrado' : filter === 'all' ? 'Sua coleção começa aqui' : 'Nada por aqui ainda'}</h2><p>{query ? 'Tente outro título ou limpe a busca.' : 'Pesquise um anime e adicione-o à sua biblioteca.'}</p>{!query && <button className="primary-button" onClick={() => setSearchOpen(true)}><Plus size={16}/> Adicionar primeiro anime</button>}</div>}
      </>}
    </main>
    <footer className="footer"><span>KATARU</span><span>Feito para organizar o que você assiste.</span><span className="storage-label">{storageMode === 'supabase' ? 'Sincronizado na nuvem' : 'Salvo neste navegador'}</span></footer>

    {searchOpen && <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) setSearchOpen(false); }}><section className="modal search-modal"><div className="modal-header"><div><p className="eyebrow">SUA COLEÇÃO</p><h2>Adicionar anime</h2></div><button className="icon-button" onClick={() => setSearchOpen(false)} aria-label="Fechar"><X/></button></div><form className="api-search" onSubmit={doSearch}><Search size={19}/><input autoFocus value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Digite o nome de um anime..."/><button className="primary-button" disabled={searching || !searchQuery.trim()}>{searching ? <LoaderCircle className="spin" size={16}/> : 'Pesquisar'}</button></form><p className="helper-text">Busca em dois catálogos (Jikan e AniList), com alternativa automática.</p>
      {searchError && <p className="error-message">{searchError}</p>}{searching && <div className="search-loading"><LoaderCircle className="spin"/> Buscando títulos...</div>}
      {results.length > 0 && <div className="results-list">{results.map(result => { const exists = items.some(a => a.mal_id === result.mal_id); return <article className="result-row" key={result.mal_id}><img src={result.image_url} alt=""/><div className="result-info"><strong>{result.title}</strong>{result.title_english && result.title_english !== result.title && <span>{result.title_english}</span>}<small>{result.year || 'Ano desconhecido'} · {result.episodes_total ?? '?'} episódios</small></div><button className="outline-button" disabled={exists} onClick={() => startAdd(result)}>{exists ? <><Check size={14}/> Na coleção</> : <><Plus size={14}/> Adicionar</>}</button></article>; })}</div>}
      {!results.length && !searching && !searchError && <div className="search-hint"><Search size={24}/><p>Pesquise pelo título em português, inglês ou japonês romanizado.</p></div>}
    </section></div>}

    {editing && <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) setEditing(null); }}><form className="modal edit-modal" onSubmit={submitAnime}><div className="modal-header"><div><p className="eyebrow">DETALHES DA COLEÇÃO</p><h2>{items.some(a => a.id === editing.id) ? 'Editar anime' : 'Adicionar à coleção'}</h2></div><button type="button" className="icon-button" onClick={() => setEditing(null)}><X/></button></div><div className="edit-preview"><img src={editing.image_url} alt=""/><div><strong>{editing.title}</strong><span>{editing.year || 'Ano desconhecido'} · {editing.episodes_total ?? '?'} episódios</span><small>{editing.genres?.slice(0, 3).join(' · ')}</small></div></div>
      <div className="form-grid"><label className="field full"><span>Status</span><select value={form.status} onChange={e => setForm({...form, status:e.target.value})}>{STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label><label className="field"><span>Episódio atual</span><input type="number" min="0" max={editing.episodes_total || undefined} value={form.episode_current} onChange={e => setForm({...form, episode_current:e.target.value})}/></label><label className="field"><span>Minha nota (0–10)</span><input type="number" min="0" max="10" step="0.5" placeholder="Sem nota" value={form.rating_personal} onChange={e => setForm({...form, rating_personal:e.target.value})}/></label><label className="field full"><span>Observações pessoais</span><textarea rows="3" placeholder="O que achou? Onde parou?" value={form.notes} onChange={e => setForm({...form, notes:e.target.value})}/></label></div><div className="modal-actions"><button type="button" className="text-button" onClick={() => setEditing(null)}>Cancelar</button><button className="primary-button" disabled={saving}>{saving ? <LoaderCircle className="spin" size={16}/> : <Check size={16}/>} Salvar na coleção</button></div>
    </form></div>}
    {toast && <div className="toast"><Check size={16}/>{toast}</div>}
  </div>;
}

function Poster({ anime, onClick }) {
  return <button className="poster-card" onClick={onClick} title={anime.title}><div className="poster-image-wrap">{anime.image_url ? <img className="poster-image" src={anime.image_url} alt={`Pôster de ${anime.title}`} loading="lazy"/> : <div className="poster-fallback"><Clapperboard/></div>}<span className={`status-dot ${anime.status}`} title={STATUSES.find(s => s.id === anime.status)?.label || 'Pausado'}/>{anime.rating_personal !== null && anime.rating_personal !== '' && <span className="poster-rating"><Star size={11} fill="currentColor"/>{anime.rating_personal}</span>}</div><span className="poster-title">{anime.title}</span></button>;
}

function Detail({ anime, onBack, onEdit, onDelete, onSync, onEpisodeChange, onStatusChange }) {
  const progress = anime.episodes_total ? Math.min(100, Math.round((anime.episode_current / anime.episodes_total) * 100)) : 0;
  const totalLabel = anime.episodes_total ? ` / ${anime.episodes_total}` : ' / em exibição';
  return <section className="detail-view"><button className="back-link" onClick={onBack}><ChevronLeft size={17}/> Voltar à coleção</button><div className="detail-layout"><div className="detail-poster">{anime.image_url && <img src={anime.image_url} alt={`Pôster de ${anime.title}`}/>}</div><div className="detail-content"><p className="eyebrow">DETALHES DO ANIME</p><h1>{anime.title}<span className="heading-dot">.</span></h1>{anime.title_english && anime.title_english !== anime.title && <p className="alt-title">{anime.title_english}</p>}<div className="detail-meta"><span>{anime.year || 'Ano desconhecido'}</span><i>·</i><span>{anime.episodes_total ?? '?'} episódios</span>{anime.season && <><i>·</i><span>{anime.season}</span></>}</div><div className="detail-tags">{anime.genres?.map(g => <span key={g}>{g}</span>)}</div><div className="detail-stats"><div><small>STATUS</small><select className="detail-status-select" value={anime.status} onChange={e => onStatusChange(e.target.value)}>{STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div><div><small>MINHA NOTA</small><strong>{anime.rating_personal ?? '—'}<span className="muted"> / 10</span></strong></div><div><small>PROGRESSO</small><strong>{anime.episode_current ?? 0}<span className="muted">{totalLabel}</span></strong></div></div><div className="episode-controls"><span>Atualizar episódio</span><div><button className="episode-step" onClick={() => onEpisodeChange(-1)} disabled={!anime.episode_current}>−</button><strong>{anime.episode_current ?? 0}</strong><button className="episode-step" onClick={() => onEpisodeChange(1)} disabled={Boolean(anime.episodes_total && anime.episode_current >= anime.episodes_total)}>+</button></div></div>{anime.episodes_total > 0 && <div className="progress-area"><div className="progress-track"><span style={{width:`${progress}%`}}/></div><small>{progress}% assistido</small></div>}<div className="detail-actions"><button className="primary-button" onClick={onEdit}><Pencil size={15}/> Editar coleção</button><button className="outline-button" onClick={onSync}><ExternalLink size={15}/> Atualizar dados</button><button className="icon-button danger" onClick={onDelete} title="Excluir"><Trash2 size={17}/></button></div>{anime.synopsis && <div className="synopsis"><h3>Sinopse</h3><p>{anime.synopsis}</p></div>}{anime.notes && <div className="synopsis"><h3>Minhas observações</h3><p>{anime.notes}</p></div>}<p className="source-note">Dados do catálogo: Jikan / AniList</p></div></div></section>;
}
