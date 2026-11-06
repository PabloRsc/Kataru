import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase = url && key ? createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
}) : null;
const LOCAL_KEY = 'animelog.collection.v1';

export const storageMode = supabase ? 'supabase' : 'local';
export const isSupabaseConfigured = Boolean(supabase);

async function requireUser() {
  if (!supabase) throw new Error('Configure o Supabase para usar sua conta e sincronizar sua coleção.');
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!user) throw new Error('Sua sessão expirou. Entre novamente.');
  return user;
}

export async function getAnimeList() {
  if (supabase) {
    const user = await requireUser();
    const { data, error } = await supabase.from('anime_collection').select('*')
      .eq('owner_id', user.id).order('created_at', { ascending: false });
    if (error) throw error;
    return data.map(fromRow);
  }
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]'); }
  catch { return []; }
}

export async function saveAnime(anime) {
  if (supabase) {
    const user = await requireUser();
    const row = toRow(anime, user.id);
    const { data, error } = await supabase.from('anime_collection').upsert(row, { onConflict: 'owner_id,mal_id' }).select().single();
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
    const user = await requireUser();
    const { error } = await supabase.from('anime_collection').delete().eq('id', id).eq('owner_id', user.id);
    if (error) throw error;
    return;
  }
  const all = await getAnimeList();
  localStorage.setItem(LOCAL_KEY, JSON.stringify(all.filter(item => item.id !== id)));
}

function toRow(a, ownerId) {
  return { id: `${ownerId}:${a.mal_id}`, owner_id: ownerId, mal_id: a.mal_id, title: a.title,
    title_english: a.title_english, image_url: a.image_url, synopsis: a.synopsis, episodes_total: a.episodes_total,
    year: a.year, season: a.season, genres: a.genres, score_external: a.score_external, status: a.status,
    episode_current: a.episode_current, rating_personal: a.rating_personal, notes: a.notes,
    updated_at: new Date().toISOString(), api_synced_at: a.api_synced_at || null };
}
function fromRow(r) {
  return { ...r, genres: r.genres || [], api_synced_at: r.api_synced_at };
}
