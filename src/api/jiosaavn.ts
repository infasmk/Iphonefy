import { CatalogItem, CatalogResults, DetailBundle, SongTrack, TopSearchItem } from '../types';
import { decodeSaavnMedia, pickText, toHttpsImage } from '../lib/crypto';

const BASE_URL = 'https://www.jiosaavn.com/api.php';
const COMMON_QUERY = '_format=json&_marker=0&api_version=4&ctx=web6dot0';
const SEARCH_QUERY = '_format=json&_marker=0&api_version=4&ctx=wap6dot0';
const PROXY_PREFIX = import.meta.env.VITE_API_PROXY_PREFIX as string | undefined;

function buildUrl(query: string, prefix = COMMON_QUERY): string {
  return `${BASE_URL}?${prefix}&${query}`;
}

async function requestJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const finalUrl = PROXY_PREFIX ? `${PROXY_PREFIX}${encodeURIComponent(url)}` : url;
  const response = await fetch(finalUrl, { signal, headers: { Accept: 'application/json' } });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

function extractToken(item: Record<string, any>): string {
  const directToken = item.token ?? item.artistToken ?? item.playlistId;
  if (typeof directToken === 'string' && directToken.trim()) {
    return directToken.trim();
  }

  const url = item.perma_url ?? item.permaUrl ?? item.url ?? '';
  if (typeof url === 'string' && url.trim()) {
    try {
      const parsed = new URL(url);
      return parsed.pathname.split('/').filter(Boolean).pop() ?? url;
    } catch {
      return url.split('/').filter(Boolean).pop() ?? url;
    }
  }

  return '';
}

function extractTitle(item: Record<string, any>): string {
  return pickText(item.title ?? item.name ?? item.album ?? item.listname ?? item.song, 'Untitled');
}

function extractSubtitle(item: Record<string, any>): string {
  return pickText(item.subtitle ?? item.description ?? item.role ?? item.extra ?? item.music, '');
}

function extractArtist(item: Record<string, any>): string {
  const artists = item.more_info?.music ?? item.music ?? item.primary_artists ?? item.artist ?? item.subtitle;
  if (Array.isArray(artists)) {
    return artists.map((value) => pickText(value)).filter(Boolean).join(', ');
  }

  return pickText(artists, '');
}

function normalizeSong(item: Record<string, any>): SongTrack {
  const mediaUrl = decodeSaavnMedia(item.encrypted_media_url ?? item.more_info?.encrypted_media_url);
  const title = extractTitle(item);
  return {
    id: String(item.id ?? title),
    type: 'song',
    title,
    artist: extractArtist(item) || 'Unknown artist',
    album: pickText(item.album ?? item.more_info?.album, ''),
    image: toHttpsImage(item.image),
    duration: typeof item.duration === 'number' ? item.duration : Number(item.duration ?? item.more_info?.duration ?? 0),
    streamUrl: mediaUrl,
    permaUrl: pickText(item.perma_url ?? item.permaUrl ?? '', ''),
    language: pickText(item.language ?? item.more_info?.language, ''),
    year: item.year ?? item.more_info?.release_date ?? '',
  };
}

function normalizeCatalogItem(item: Record<string, any>, type: CatalogItem['type']): CatalogItem {
  return {
    id: String(item.id ?? item.albumid ?? item.artistId ?? item.listid ?? item.title ?? item.name),
    type,
    title: extractTitle(item),
    subtitle: extractSubtitle(item),
    artist: extractArtist(item),
    image: toHttpsImage(item.image),
    token: extractToken(item),
    permaUrl: pickText(item.perma_url ?? item.permaUrl ?? item.url ?? '', ''),
    count: Number(item.count ?? item.more_info?.song_pids?.length ?? 0),
  };
}

function normalizeTopSearches(items: any[]): TopSearchItem[] {
  return items.map((item) => ({
    title: extractTitle(item),
    subtitle: extractSubtitle(item),
    image: toHttpsImage(item.image),
    query: pickText(item.query ?? item.title ?? item.name ?? item.text, ''),
  }));
}

export async function fetchTopSearches(signal?: AbortSignal): Promise<TopSearchItem[]> {
  const url = buildUrl('__call=content.getTopSearches');
  const data = await requestJson<any[]>(url, signal);
  return Array.isArray(data) ? normalizeTopSearches(data) : [];
}

export async function searchSongs(query: string, page = 1, count = 20, signal?: AbortSignal): Promise<{ songs: SongTrack[]; hasMore: boolean }> {
  const encodedQuery = encodeURIComponent(query);
  const url = buildUrl(`p=${page}&q=${encodedQuery}&n=${count}&__call=search.getResults`, COMMON_QUERY);
  const data = await requestJson<{ results?: any[] }>(url, signal);
  const results = Array.isArray(data.results) ? data.results : [];
  return {
    songs: results.map(normalizeSong).filter((song) => song.title !== 'Untitled'),
    hasMore: results.length >= count,
  };
}

export async function searchCatalog(query: string, signal?: AbortSignal): Promise<CatalogResults> {
  const encodedQuery = encodeURIComponent(query);
  const url = buildUrl(`__call=autocomplete.get&cc=in&includeMetaTags=1&query=${encodedQuery}`, SEARCH_QUERY);
  const data = await requestJson<Record<string, any>>(url, signal);

  const parseSection = (section: unknown, fallbackType: CatalogItem['type']): CatalogItem[] => {
    if (!section || typeof section !== 'object') {
      return [];
    }

    const entries = Array.isArray((section as Record<string, any>).data) ? (section as Record<string, any>).data : [];
    return entries.map((entry: Record<string, any>) => {
      const entryType = entry.type;
      const resolvedType: CatalogItem['type'] =
        entryType === 'album' || entryType === 'artist' || entryType === 'playlist' || entryType === 'song'
          ? entryType
          : fallbackType;
      return normalizeCatalogItem(entry, resolvedType);
    });
  };

  return {
    songs: [],
    albums: parseSection(data.albums, 'album'),
    artists: parseSection(data.artists, 'artist'),
    playlists: parseSection(data.playlists, 'playlist'),
    topQuery: parseSection(data.topquery, 'song'),
  };
}

export async function fetchAlbumDetails(token: string, signal?: AbortSignal): Promise<DetailBundle> {
  const url = buildUrl(`__call=webapi.get&token=${encodeURIComponent(token)}&type=album`, COMMON_QUERY);
  const data = await requestJson<Record<string, any>>(url, signal);
  const songs = Array.isArray(data.list) ? data.list.map(normalizeSong) : [];

  return {
    type: 'album',
    title: pickText(data.title ?? data.album ?? 'Album', 'Album'),
    subtitle: pickText(data.subtitle ?? data.description ?? '', ''),
    image: toHttpsImage(data.image),
    songs,
  };
}

export async function fetchPlaylistDetails(token: string, signal?: AbortSignal): Promise<DetailBundle> {
  const url = buildUrl(`__call=webapi.get&token=${encodeURIComponent(token)}&type=playlist`, COMMON_QUERY);
  const data = await requestJson<Record<string, any>>(url, signal);
  const songs = Array.isArray(data.list) ? data.list.map(normalizeSong) : [];

  return {
    type: 'playlist',
    title: pickText(data.title ?? data.listname ?? 'Playlist', 'Playlist'),
    subtitle: pickText(data.subtitle ?? data.description ?? '', ''),
    image: toHttpsImage(data.image),
    songs,
  };
}

export async function fetchArtistDetails(token: string, signal?: AbortSignal): Promise<DetailBundle> {
  const url = buildUrl(`__call=webapi.get&token=${encodeURIComponent(token)}&type=artist&p=0&n_song=50&n_album=18&sub_type=&category=&sort_order=&includeMetaTags=0`, COMMON_QUERY);
  const data = await requestJson<Record<string, any>>(url, signal);
  const songs = Array.isArray(data.topSongs) ? data.topSongs.map(normalizeSong) : Array.isArray(data.list) ? data.list.map(normalizeSong) : [];
  const albums = Array.isArray(data.topAlbums) ? data.topAlbums.map((item: Record<string, any>) => normalizeCatalogItem(item, 'album')) : [];

  return {
    type: 'artist',
    title: pickText(data.title ?? data.name ?? 'Artist', 'Artist'),
    subtitle: pickText(data.subtitle ?? data.description ?? data.role ?? '', ''),
    image: toHttpsImage(data.image),
    songs,
    albums,
  };
}

export function asQueue(trackList: SongTrack[]): SongTrack[] {
  return trackList.filter((track) => Boolean(track.streamUrl));
}