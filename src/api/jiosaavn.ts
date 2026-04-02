import { SongTrack, TopSearchItem } from '../types';

const MUSIC_SEARCH_URL = '/music-api/search?alt=json&key=AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30';
const MUSIC_CONTEXT = {
  context: {
    client: {
      clientName: 'WEB_REMIX',
      clientVersion: '1.20250401.00.00',
    },
  },
};

type MusicText = {
  runs?: Array<{ text?: string; navigationEndpoint?: { watchEndpoint?: { videoId?: string } } }>;
  simpleText?: string;
};

type MusicThumbnail = {
  thumbnails?: Array<{ url?: string; width?: number; height?: number }>;
};

type MusicRenderer = {
  videoId?: string;
  thumbnail?: { musicThumbnailRenderer?: { thumbnail?: MusicThumbnail } };
  overlay?: { musicItemThumbnailOverlayRenderer?: { content?: { musicPlayButtonRenderer?: { playNavigationEndpoint?: { watchEndpoint?: { videoId?: string } } } } } };
  flexColumns?: Array<{ musicResponsiveListItemFlexColumnRenderer?: { text?: MusicText } }>;
  subtitle?: MusicText;
  title?: MusicText;
};

type MusicSearchResponse = {
  contents?: unknown;
};

function textFromRuns(text?: MusicText): string {
  if (!text) {
    return '';
  }

  if (typeof text.simpleText === 'string' && text.simpleText.trim()) {
    return text.simpleText.trim();
  }

  return (text.runs || [])
    .map((run) => run.text ?? '')
    .join('')
    .trim();
}

function pickVideoId(node: MusicRenderer): string {
  return (
    node.videoId ||
    node.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId ||
    node.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.find((run) => run.text)?.navigationEndpoint?.watchEndpoint?.videoId ||
    ''
  );
}

function pickImage(node: MusicRenderer): string {
  const thumbnails = node.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
  const best = thumbnails[thumbnails.length - 1] || thumbnails[0];
  return best?.url ? best.url.replace(/^http:/i, 'https:') : '';
}

function durationToSeconds(durationText: string): number | undefined {
  if (!durationText || !/^\d{1,2}:\d{2}(?::\d{2})?$/.test(durationText)) {
    return undefined;
  }

  const parts = durationText.split(':').map((value) => Number(value));
  if (parts.some((value) => Number.isNaN(value))) {
    return undefined;
  }

  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }

  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

function normalizeRenderer(node: MusicRenderer): SongTrack | null {
  const videoId = pickVideoId(node);
  const title = textFromRuns(node.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text || node.title);
  const metadataRuns = node.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
  const metadataTexts = metadataRuns.map((run) => run.text ?? '').filter(Boolean);
  const durationText = metadataTexts.find((value) => /^\d{1,2}:\d{2}(?::\d{2})?$/.test(value)) || '';
  const artistText = metadataTexts.find((value) => value !== durationText && value !== '•' && !/^[0-9,.]+\s*(views?|plays?)$/i.test(value)) || '';

  if (!videoId || !title) {
    return null;
  }

  return {
    id: videoId,
    type: 'song',
    title,
    artist: artistText || 'YouTube Music',
    album: '',
    image: pickImage(node),
    duration: durationToSeconds(durationText),
    streamUrl: `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&playsinline=1&rel=0`,
    videoId,
    watchUrl: `https://music.youtube.com/watch?v=${videoId}`,
    embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&playsinline=1&rel=0`,
    language: '',
    year: '',
  };
}

function collectRenderers(node: unknown, items: MusicRenderer[] = []): MusicRenderer[] {
  if (!node) {
    return items;
  }

  if (Array.isArray(node)) {
    node.forEach((entry) => collectRenderers(entry, items));
    return items;
  }

  if (typeof node !== 'object') {
    return items;
  }

  const current = node as Record<string, unknown>;
  if (current.musicResponsiveListItemRenderer) {
    items.push(current.musicResponsiveListItemRenderer as MusicRenderer);
  }

  Object.values(current).forEach((value) => collectRenderers(value, items));
  return items;
}

async function requestJson<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    signal,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function fetchTopSearches(signal?: AbortSignal): Promise<TopSearchItem[]> {
  try {
    const response = await fetch('https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=', { signal });
    if (!response.ok) {
      return [];
    }

    const data = (await response.json()) as [string, string[]];
    return (data?.[1] || []).slice(0, 8).map((item) => ({
      title: item,
      subtitle: 'YouTube Music suggestion',
      query: item,
    }));
  } catch {
    return [];
  }
}

export async function searchSongs(query: string, page = 1, count = 20, signal?: AbortSignal): Promise<{ songs: SongTrack[]; hasMore: boolean }> {
  const data = await requestJson<MusicSearchResponse>(
    MUSIC_SEARCH_URL,
    {
      ...MUSIC_CONTEXT,
      query,
    },
    signal
  );

  const renderers = collectRenderers(data.contents);
  const songs = renderers.map(normalizeRenderer).filter((song): song is SongTrack => Boolean(song));
  const start = Math.max(0, (page - 1) * count);
  const pageItems = songs.slice(start, start + count);

  return {
    songs: pageItems,
    hasMore: start + count < songs.length,
  };
}

export function asQueue(trackList: SongTrack[]): SongTrack[] {
  return trackList.filter((track) => Boolean(track.videoId || track.watchUrl || track.embedUrl));
}
