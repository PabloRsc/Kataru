import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = url && key ? createClient(url, key) : null;
const LOCAL_KEY = 'animelog.collection.v1';

export const storageMode = supabase ? 'supabase' : 'local';

export async function getAnimeList() {
  if (supabase) {
    const { data, error } = await supabase.from('anime_collection').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data.map(fromRow);
  }
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]'); }
  catch { return []; }
}

export async function saveAnime(anime) {
  if (supabase) {
    const row = toRow(anime);
    const { data, error } = await supabase.from('anime_collection').upsert(row).select().single();
    if (error) throw error;
    return fromRow(data);
  }
  const all = await getAnimeList();
  const index = all.findIndex(item => item.id === anime.id);
  if (index >= 0) all[index] = anime; else all.unshift(anime);
  localStorage.setItem(LOCAL_KEY, JSON.stringify(all));
  return anime;
}

export async function deleteAnime(id) {
  if (supabase) {
    const { error } = await supabase.from('anime_collection').delete().eq('id', id);
    if (error) throw error;
    return;
  }
  const all = await getAnimeList();
  localStorage.setItem(LOCAL_KEY, JSON.stringify(all.filter(item => item.id !== id)));
}

function toRow(a) {
  return { id: a.id, mal_id: a.mal_id, title: a.title, title_english: a.title_english, image_url: a.image_url,
    synopsis: a.synopsis, episodes_total: a.episodes_total, year: a.year, season: a.season, genres: a.genres,
    score_external: a.score_external, status: a.status, episode_current: a.episode_current, rating_personal: a.rating_personal,
    notes: a.notes, updated_at: new Date().toISOString(), api_synced_at: a.api_synced_at || null };
}
function fromRow(r) { return { ...r, id: r.id, mal_id: r.mal_id, title: r.title, title_english: r.title_english,
  image_url: r.image_url, synopsis: r.synopsis, episodes_total: r.episodes_total, year: r.year, season: r.season,
  genres: r.genres || [], score_external: r.score_external, status: r.status, episode_current: r.episode_current,
  rating_personal: r.rating_personal, notes: r.notes, api_synced_at: r.api_synced_at }; }
