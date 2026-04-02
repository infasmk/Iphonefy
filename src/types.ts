export type SearchTab = 'songs' | 'albums' | 'artists' | 'playlists';

export interface SongTrack {
  id: string;
  type: 'song';
  title: string;
  artist: string;
  album?: string;
  image: string;
  duration?: number;
  streamUrl?: string;
  videoId?: string;
  watchUrl?: string;
  embedUrl?: string;
  permaUrl?: string;
  language?: string;
  year?: string | number;
}

export interface CatalogItem {
  id: string;
  type: 'album' | 'artist' | 'playlist' | 'song';
  title: string;
  subtitle: string;
  artist?: string;
  image: string;
  token: string;
  permaUrl?: string;
  count?: number;
}

export interface CatalogResults {
  songs: SongTrack[];
  albums: CatalogItem[];
  artists: CatalogItem[];
  playlists: CatalogItem[];
  topQuery: CatalogItem[];
}

export interface DetailBundle {
  type: 'album' | 'artist' | 'playlist';
  title: string;
  subtitle: string;
  image: string;
  songs: SongTrack[];
  albums?: CatalogItem[];
}

export interface TopSearchItem {
  title: string;
  subtitle?: string;
  image?: string;
  query?: string;
}