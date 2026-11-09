import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
const AUTH_PERSISTENCE_KEY = 'kataru.auth.persistence.v1';

function authStorage() {
  const selectedStorage = () => {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(AUTH_PERSISTENCE_KEY) === 'session'
      ? window.sessionStorage
      : window.localStorage;
  };
  return {
    getItem(name) {
      return selectedStorage()?.getItem(name) ?? null;
    },
    setItem(name, value) {
      const current = selectedStorage();
      if (!current) return;
      const other = current === window.localStorage ? window.sessionStorage : window.localStorage;
      other.removeItem(name);
      current.setItem(name, value);
    },
    removeItem(name) {
      if (typeof window === 'undefined') return;
      window.localStorage.removeItem(name);
      window.sessionStorage.removeItem(name);
    }
  };
}

export function setAuthPersistence(remember) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(AUTH_PERSISTENCE_KEY, remember ? 'persistent' : 'session');
}

export const supabase = url && key ? createClient(url, key, {
  auth: {
    storage: authStorage(),
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
}) : null;

const LOCAL_KEY = 'animelog.collection.v1';
const LOCAL_LISTS_KEY = 'kataru.custom-lists.v1';

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
    return (data || []).map(fromRow);
  }
  try {
    const data = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
    return Array.isArray(data) ? data.map(normalizeLocalAnime) : [];
  } catch {
    return [];
  }
}

export async function saveAnime(anime) {
  if (supabase) {
    const user = await requireUser();
    const row = toRow(anime, user.id);
    const { data, error } = await supabase.from('anime_collection')
      .upsert(row, { onConflict: 'owner_id,mal_id' }).select().single();
    if (error) {
      if (error.code === 'PGRST204' || error.code === '42703' || /schema cache|column .* does not exist/i.test(error.message || '')) {
        throw new Error('O banco do Kataru está desatualizado. Faça backup e execute o arquivo supabase/redesign-migration.sql no SQL Editor do Supabase.');
      }
      throw error;
    }
    return fromRow(data);
  }
  const all = await getAnimeList();
  const index = all.findIndex(item => String(item.mal_id) === String(anime.mal_id) || item.id === anime.id);
  const saved = { ...anime, id: String(anime.id || anime.mal_id), updated_at: anime.updated_at || new Date().toISOString(), created_at: anime.created_at || new Date().toISOString() };
  if (index >= 0) all[index] = { ...all[index], ...saved }; else all.unshift(saved);
  localStorage.setItem(LOCAL_KEY, JSON.stringify(all));
  return saved;
}

export async function deleteAnime(id) {
  if (supabase) {
    const user = await requireUser();
    const { error } = await supabase.from('anime_collection').delete().eq('id', id).eq('owner_id', user.id);
    if (error) throw error;
    return;
  }
  const all = await getAnimeList();
  localStorage.setItem(LOCAL_KEY, JSON.stringify(all.filter(item => String(item.id) !== String(id))));
}

export async function searchKataruProfiles(query, limit = 20) {
  const user = await requireUser();
  const term = String(query || '').trim().replace(/[^\p{L}\p{N}_ -]/gu, ' ').replace(/\s+/g, ' ');
  if (term.length < 2) return [];
  const filter = 'username.ilike.%' + term + '%,display_name.ilike.%' + term + '%';
  const { data, error } = await supabase.from('kataru_profiles')
    .select('user_id, username, display_name, bio, avatar_url, created_at')
    .neq('user_id', user.id)
    .or(filter)
    .order('username', { ascending: true })
    .limit(Math.min(40, Math.max(1, Number(limit) || 20)));
  if (error) throw error;
  return data || [];
}

export async function updateKataruProfile(profile) {
  const user = await requireUser();
  const payload = {
    display_name: String(profile.display_name || '').trim().slice(0, 50),
    bio: String(profile.bio || '').trim().slice(0, 160),
    updated_at: new Date().toISOString()
  };
  const { data, error } = await supabase.from('kataru_profiles')
    .update(payload)
    .eq('user_id', user.id)
    .select('user_id, username, display_name, bio, avatar_url, created_at')
    .single();
  if (error) throw error;
  return data;
}

export async function getKataruProfile(userId) {
  await requireUser();
  const { data, error } = await supabase.from('kataru_profiles')
    .select('user_id, username, display_name, bio, avatar_url, created_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function getCurrentKataruProfile() {
  const user = await requireUser();
  return getKataruProfile(user.id);
}

export async function getKataruSocialStats(userId) {
  await requireUser();
  const [followers, following] = await Promise.all([
    supabase.from('kataru_follows').select('follower_id', { count: 'exact', head: true }).eq('followed_id', userId),
    supabase.from('kataru_follows').select('followed_id', { count: 'exact', head: true }).eq('follower_id', userId)
  ]);
  if (followers.error) throw followers.error;
  if (following.error) throw following.error;
  return { followers: followers.count || 0, following: following.count || 0 };
}

export async function isFollowingKataruUser(userId) {
  const user = await requireUser();
  const { data, error } = await supabase.from('kataru_follows')
    .select('followed_id')
    .eq('follower_id', user.id)
    .eq('followed_id', userId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function followKataruUser(userId) {
  const user = await requireUser();
  if (user.id === userId) throw new Error('Você não pode seguir sua própria conta.');
  const { error } = await supabase.from('kataru_follows')
    .insert({ follower_id: user.id, followed_id: userId });
  if (error && error.code !== '23505') throw error;
  return true;
}

export async function unfollowKataruUser(userId) {
  const user = await requireUser();
  const { error } = await supabase.from('kataru_follows')
    .delete()
    .eq('follower_id', user.id)
    .eq('followed_id', userId);
  if (error) throw error;
  return true;
}

export async function getKataruRelationProfiles(userId, relation = 'followers') {
  await requireUser();
  const isFollowers = relation === 'followers';
  const { data: rows, error: relationError } = await supabase.from('kataru_follows')
    .select('follower_id, followed_id')
    .eq(isFollowers ? 'followed_id' : 'follower_id', userId)
    .order('created_at', { ascending: false });
  if (relationError) throw relationError;
  const ids = (rows || []).map(row => isFollowers ? row.follower_id : row.followed_id).filter(Boolean);
  if (!ids.length) return [];
  const { data: profiles, error } = await supabase.from('kataru_profiles')
    .select('user_id, username, display_name, bio, avatar_url, created_at')
    .in('user_id', ids);
  if (error) throw error;
  const byId = new Map((profiles || []).map(profile => [profile.user_id, profile]));
  return ids.map(id => byId.get(id)).filter(Boolean);
}

export async function getFollowingKataruProfiles() {
  const user = await requireUser();
  const { data: follows, error: followError } = await supabase.from('kataru_follows')
    .select('followed_id, created_at')
    .eq('follower_id', user.id)
    .order('created_at', { ascending: false });
  if (followError) throw followError;
  const ids = (follows || []).map(row => row.followed_id).filter(Boolean);
  if (!ids.length) return [];
  const { data: profiles, error } = await supabase.from('kataru_profiles')
    .select('user_id, username, display_name, bio, avatar_url, created_at')
    .in('user_id', ids);
  if (error) throw error;
  const byId = new Map((profiles || []).map(profile => [profile.user_id, profile]));
  return ids.map(id => byId.get(id)).filter(Boolean);
}

export async function getFollowedKataruAnime(userId) {
  await requireUser();
  const { data, error } = await supabase.from('kataru_shared_anime')
    .select('*')
    .eq('owner_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(fromRow);
}

export async function getFollowedKataruLists(userId) {
  await requireUser();
  const { data, error } = await supabase.from('kataru_shared_lists')
    .select('*')
    .eq('owner_id', userId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(fromListRow);
}

export async function getAnimeLists() {
  if (supabase) {
    const user = await requireUser();
    const { data, error } = await supabase.from('anime_lists').select('*')
      .eq('owner_id', user.id).order('updated_at', { ascending: false });
    if (error) {
      if (error.code === '42P01' || error.code === 'PGRST205') {
        throw new Error('As listas ainda não foram habilitadas no Supabase. Execute o arquivo supabase/redesign-migration.sql.');
      }
      throw error;
    }
    return (data || []).map(fromListRow);
  }
  try {
    const data = JSON.parse(localStorage.getItem(LOCAL_LISTS_KEY) || '[]');
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function saveAnimeList(list) {
  if (supabase) {
    const user = await requireUser();
    const payload = toListRow(list, user.id);
    const { data, error } = await supabase.from('anime_lists')
      .upsert(payload, { onConflict: 'owner_id,id' }).select().single();
    if (error) {
      if (error.code === '42P01' || error.code === 'PGRST205' || error.code === 'PGRST204' || error.code === '42703') {
        throw new Error('As listas ainda não estão configuradas no Supabase. Execute o arquivo supabase/redesign-migration.sql no SQL Editor.');
      }
      throw error;
    }
    return fromListRow(data);
  }
  const all = await getAnimeLists();
  const index = all.findIndex(item => String(item.id) === String(list.id));
  const saved = {
    ...list,
    id: String(list.id || 'local-' + Date.now()),
    anime_ids: Array.from(new Set((list.anime_ids || []).map(String))),
    updated_at: list.updated_at || new Date().toISOString(),
    created_at: list.created_at || new Date().toISOString()
  };
  if (index >= 0) all[index] = saved; else all.unshift(saved);
  localStorage.setItem(LOCAL_LISTS_KEY, JSON.stringify(all));
  return saved;
}

export async function createAnimeList(list) {
  return saveAnimeList({ ...list, id: list.id || 'local-' + Date.now() });
}

export async function deleteAnimeList(id) {
  if (supabase) {
    const user = await requireUser();
    const { error } = await supabase.from('anime_lists').delete().eq('id', id).eq('owner_id', user.id);
    if (error) throw error;
    return;
  }
  const all = await getAnimeLists();
  localStorage.setItem(LOCAL_LISTS_KEY, JSON.stringify(all.filter(item => String(item.id) !== String(id))));
}

function toRow(anime, ownerId) {
  return {
    id: String(ownerId) + ':' + String(anime.mal_id),
    owner_id: ownerId,
    mal_id: Number(anime.mal_id),
    title: anime.title || 'Sem título',
    title_english: anime.title_english || null,
    title_aliases: anime.title_aliases || [],
    display_title: anime.display_title || null,
    image_url: anime.image_url || null,
    synopsis: anime.synopsis || null,
    episodes_total: anime.episodes_total ?? null,
    episodes_available: anime.episodes_available ?? null,
    airing_status: anime.airing_status || null,
    release_date: anime.release_date || null,
    end_date: anime.end_date || null,
    related_anime: Array.isArray(anime.related_anime) ? anime.related_anime : [],
    episodes_total_manual: anime.episodes_total_manual ?? null,
    year: anime.year ?? null,
    season: anime.season || null,
    format: anime.format || null,
    genres: anime.genres || [],
    studios: anime.studios || [],
    score_external: anime.score_external ?? null,
    status: anime.status || 'planned',
    episode_current: Number(anime.episode_current || 0),
    rating_personal: anime.rating_personal ?? null,
    notes: anime.notes || null,
    rewatch_count: Number(anime.rewatch_count || 0),
    started_at: anime.started_at || null,
    completed_at: anime.completed_at || null,
    is_manual: Boolean(anime.is_manual),
    api_synced_at: anime.api_synced_at || null,
    updated_at: anime.updated_at || new Date().toISOString(),
    created_at: anime.created_at || new Date().toISOString()
  };
}

function fromRow(row) {
  return normalizeLocalAnime({ ...row, genres: row.genres || [], api_synced_at: row.api_synced_at });
}

function normalizeLocalAnime(anime) {
  return {
    ...anime,
    id: String(anime.id || anime.mal_id),
    mal_id: Number(anime.mal_id),
    genres: anime.genres || [],
    title_aliases: anime.title_aliases || [anime.title, anime.title_english, anime.title_japanese].filter(Boolean),
    studios: anime.studios || [],
    status: anime.status || 'planned',
    episode_current: Number(anime.episode_current || 0),
    rewatch_count: Number(anime.rewatch_count || 0),
    rating_personal: anime.rating_personal ?? null,
    episodes_total_manual: anime.episodes_total_manual ?? null,
    episodes_available: anime.episodes_available ?? null,
    release_date: anime.release_date || null,
    end_date: anime.end_date || null,
    related_anime: Array.isArray(anime.related_anime) ? anime.related_anime : [],
    format: anime.format || null,
    display_title: anime.display_title || null,
    started_at: anime.started_at || null,
    completed_at: anime.completed_at || null
  };
}

function toListRow(list, ownerId) {
  return {
    id: String(list.id || String(ownerId) + ':' + Date.now()),
    owner_id: ownerId,
    name: String(list.name || '').trim(),
    description: list.description || null,
    is_ranked: Boolean(list.is_ranked),
    anime_ids: Array.from(new Set((list.anime_ids || []).map(String))),
    created_at: list.created_at || new Date().toISOString(),
    updated_at: list.updated_at || new Date().toISOString()
  };
}

function fromListRow(row) {
  return { ...row, id: String(row.id), anime_ids: (row.anime_ids || []).map(String), is_ranked: Boolean(row.is_ranked) };
}
