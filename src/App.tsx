import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  asQueue,
  fetchAlbumDetails,
  fetchArtistDetails,
  fetchPlaylistDetails,
  fetchTopSearches,
  searchCatalog,
  searchSongs,
} from './api/jiosaavn';
import { storageGet, storageSet, formatDuration } from './lib/crypto';
import type { CatalogItem, DetailBundle, SearchTab, SongTrack, TopSearchItem } from './types';

const recentSearchKey = 'bloomee.recent-searches';
const favoriteKey = 'bloomee.favorites';

function sectionLabel(tab: SearchTab): string {
  switch (tab) {
    case 'albums':
      return 'Albums';
    case 'artists':
      return 'Artists';
    case 'playlists':
      return 'Playlists';
    default:
      return 'Songs';
  }
}

function buildDetailSubtitle(bundle: DetailBundle): string {
  if (bundle.subtitle) {
    return bundle.subtitle;
  }

  return `${bundle.songs.length} items`;
}

function CatalogCard({ item, onOpen }: { item: CatalogItem; onOpen: (item: CatalogItem) => void }) {
  return (
    <button type="button" className="catalog-card" onClick={() => onOpen(item)}>
      <div className="cover">
        {item.image ? <img src={item.image} alt={item.title} /> : <span>{item.type.slice(0, 1).toUpperCase()}</span>}
      </div>
      <div className="catalog-copy">
        <span className="eyebrow">{item.type}</span>
        <h3>{item.title}</h3>
        <p>{item.subtitle || item.artist || 'Open details'}</p>
      </div>
    </button>
  );
}

function SongRow({
  song,
  active,
  onPlay,
  onFavorite,
  isFavorite,
}: {
  song: SongTrack;
  active: boolean;
  onPlay: (song: SongTrack) => void;
  onFavorite: (song: SongTrack) => void;
  isFavorite: boolean;
}) {
  return (
    <div className={`song-row ${active ? 'is-active' : ''}`}>
      <button className="song-main" onClick={() => onPlay(song)}>
        <img className="song-art" src={song.image} alt={song.title} />
        <div>
          <strong>{song.title}</strong>
          <p>
            {song.artist}
            {song.album ? ` • ${song.album}` : ''}
          </p>
        </div>
      </button>
      <div className="song-meta">
        <span>{formatDuration(song.duration)}</span>
        <button className={`ghost-button ${isFavorite ? 'is-on' : ''}`} onClick={() => onFavorite(song)}>
          {isFavorite ? 'Saved' : 'Save'}
        </button>
      </div>
    </div>
  );
}

function LoadingGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid placeholders">
      {Array.from({ length: count }).map((_, index) => (
        <div className="placeholder-card" key={index}>
          <div className="placeholder-cover shimmer" />
          <div className="placeholder-line shimmer wide" />
          <div className="placeholder-line shimmer" />
        </div>
      ))}
    </div>
  );
}

function InstallHint() {
  return (
    <div className="install-hint">
      <strong>iPhone tip</strong>
      <p>Open this site in Safari and use Share → Add to Home Screen for a full-screen PWA feel.</p>
    </div>
  );
}

export default function App() {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [activeTab, setActiveTab] = useState<SearchTab>('songs');
  const [songs, setSongs] = useState<SongTrack[]>([]);
  const [albums, setAlbums] = useState<CatalogItem[]>([]);
  const [artists, setArtists] = useState<CatalogItem[]>([]);
  const [playlists, setPlaylists] = useState<CatalogItem[]>([]);
  const [topQuery, setTopQuery] = useState<CatalogItem[]>([]);
  const [topSearches, setTopSearches] = useState<TopSearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [recentSearches, setRecentSearches] = useState<string[]>(() => storageGet<string[]>(recentSearchKey, []));
  const [favorites, setFavorites] = useState<SongTrack[]>(() => storageGet<SongTrack[]>(favoriteKey, []));
  const [queue, setQueue] = useState<SongTrack[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [playerBusy, setPlayerBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [detail, setDetail] = useState<DetailBundle | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [page, setPage] = useState(1);
  const [hasMoreSongs, setHasMoreSongs] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const currentTrack = currentIndex >= 0 ? queue[currentIndex] : null;
  const favoriteIds = useMemo(() => new Set(favorites.map((song) => song.id)), [favorites]);

  useEffect(() => {
    storageSet(recentSearchKey, recentSearches);
  }, [recentSearches]);

  useEffect(() => {
    storageSet(favoriteKey, favorites);
  }, [favorites]);

  useEffect(() => {
    const controller = new AbortController();
    fetchTopSearches(controller.signal)
      .then(setTopSearches)
      .catch(() => setTopSearches([]));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const term = deferredQuery.trim();
    if (term.length < 2) {
      setSongs([]);
      setAlbums([]);
      setArtists([]);
      setPlaylists([]);
      setTopQuery([]);
      setSearchError('');
      setLoading(false);
      setHasMoreSongs(false);
      setPage(1);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setSearchError('');
    setPage(1);

    Promise.all([searchSongs(term, 1, 24, controller.signal), searchCatalog(term, controller.signal)])
      .then(([songResult, catalogResult]) => {
        setSongs(songResult.songs);
        setHasMoreSongs(songResult.hasMore);
        setAlbums(catalogResult.albums);
        setArtists(catalogResult.artists);
        setPlaylists(catalogResult.playlists);
        setTopQuery(catalogResult.topQuery);
        setRecentSearches((current) => [term, ...current.filter((item) => item !== term)].slice(0, 10));
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Search failed';
        setSearchError(message);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [deferredQuery]);

  useEffect(() => {
    if (!audioRef.current) {
      return;
    }

    const audio = audioRef.current;

    const handleTime = () => {
      if (audio.duration > 0) {
        setProgress(audio.currentTime / audio.duration);
      }
    };

    const handleEnded = () => {
      if (currentIndex < queue.length - 1) {
        setCurrentIndex((value) => value + 1);
      } else {
        setPlaying(false);
      }
    };

    const handleCanPlay = () => {
      setPlayerBusy(false);
    };

    audio.addEventListener('timeupdate', handleTime);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('canplay', handleCanPlay);

    return () => {
      audio.removeEventListener('timeupdate', handleTime);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('canplay', handleCanPlay);
    };
  }, [queue.length, currentIndex]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack?.streamUrl) {
      return;
    }

    audio.src = currentTrack.streamUrl;
    audio.load();

    if (playing) {
      setPlayerBusy(true);
      audio
        .play()
        .then(() => setPlayerBusy(false))
        .catch(() => {
          setPlaying(false);
          setPlayerBusy(false);
        });
    }
  }, [currentTrack?.streamUrl]);

  useEffect(() => {
    if (!audioRef.current) {
      return;
    }

    if (playing) {
      setPlayerBusy(true);
      audioRef.current
        .play()
        .then(() => setPlayerBusy(false))
        .catch(() => {
          setPlaying(false);
          setPlayerBusy(false);
        });
    } else {
      audioRef.current.pause();
    }
  }, [playing]);

  async function openItem(item: CatalogItem) {
    if (item.type === 'song') {
      setQuery(item.title);
      setActiveTab('songs');
      return;
    }

    setDetailLoading(true);
    setDetailError('');
    try {
      const controller = new AbortController();
      const bundle =
        item.type === 'album'
          ? await fetchAlbumDetails(item.token, controller.signal)
          : item.type === 'artist'
          ? await fetchArtistDetails(item.token, controller.signal)
          : await fetchPlaylistDetails(item.token, controller.signal);
      setDetail(bundle);
    } catch (error: unknown) {
      setDetailError(error instanceof Error ? error.message : 'Unable to open item');
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }

  function playQueue(trackList: SongTrack[], index = 0) {
    const playable = asQueue(trackList);
    if (!playable.length) {
      return;
    }

    const initialIndex = Math.min(Math.max(index, 0), playable.length - 1);
    setQueue(playable);
    setCurrentIndex(initialIndex);
    setPlaying(true);
    setPlayerBusy(true);
  }

  function playSong(song: SongTrack) {
    const existing = queue.findIndex((item) => item.id === song.id);
    if (existing >= 0) {
      setCurrentIndex(existing);
      setPlaying(true);
      return;
    }

    setQueue((current) => {
      const withoutDuplicates = [song, ...current.filter((item) => item.id !== song.id)];
      setCurrentIndex(0);
      return withoutDuplicates;
    });
    setPlaying(true);
    setPlayerBusy(true);
  }

  function toggleFavorite(song: SongTrack) {
    setFavorites((current) => {
      const exists = current.some((item) => item.id === song.id);
      if (exists) {
        return current.filter((item) => item.id !== song.id);
      }

      return [song, ...current].slice(0, 50);
    });
  }

  async function loadMore() {
    const term = query.trim();
    if (term.length < 2) {
      return;
    }

    const nextPage = page + 1;
    setLoading(true);
    try {
      const next = await searchSongs(term, nextPage, 24);
      setSongs((current) => [...current, ...next.songs]);
      setHasMoreSongs(next.hasMore);
      setPage(nextPage);
    } catch (error: unknown) {
      setSearchError(error instanceof Error ? error.message : 'Unable to load more results');
    } finally {
      setLoading(false);
    }
  }

  const visibleCatalog = activeTab === 'albums' ? albums : activeTab === 'artists' ? artists : activeTab === 'playlists' ? playlists : [];

  return (
    <div className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <audio ref={audioRef} preload="auto" />

      <header className="hero">
        <div className="hero-copy">
          <span className="eyebrow">React PWA music browser</span>
          <h1>Search JioSaavn, open albums and playlists, and play tracks in one iPhone-friendly web app.</h1>
          <p>
            This build mirrors the Flutter search flow, adds top-search discovery, and keeps the full player UI ready for a home-screen PWA.
          </p>
        </div>

        <div className="search-panel">
          <label className="search-box">
            <span>Search</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Try a song, album, artist, or playlist"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
            />
          </label>

          <div className="hint-row">
            {recentSearches.slice(0, 4).map((item) => (
              <button key={item} className="chip chip-muted" onClick={() => setQuery(item)}>
                {item}
              </button>
            ))}
          </div>

          <InstallHint />
        </div>
      </header>

      <main className="content-grid">
        <section className="card results-card">
          <div className="card-head">
            <div>
              <span className="eyebrow">Results</span>
              <h2>{query.trim().length >= 2 ? `Search for ${query.trim()}` : 'Top search suggestions'}</h2>
            </div>
            <div className="status-pill">{loading ? 'Loading' : searchError ? 'Needs proxy or retry' : 'Ready'}</div>
          </div>

          <div className="tab-row">
            {(['songs', 'albums', 'artists', 'playlists'] as SearchTab[]).map((tab) => (
              <button key={tab} className={`tab ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
                {sectionLabel(tab)}
              </button>
            ))}
          </div>

          {searchError ? <div className="error-banner">{searchError}</div> : null}

          {loading && songs.length === 0 && visibleCatalog.length === 0 ? (
            <LoadingGrid />
          ) : query.trim().length < 2 ? (
            <div className="discover-stack">
              <div className="subsection">
                <h3>Top searches</h3>
                <div className="chip-row">
                  {topSearches.map((item) => (
                    <button key={item.title} className="chip" onClick={() => setQuery(item.query || item.title)}>
                      {item.title}
                    </button>
                  ))}
                </div>
              </div>

              <div className="subsection">
                <h3>Recent discoveries</h3>
                <div className="grid compact-grid">
                  {topQuery.slice(0, 4).map((item) => (
                    <CatalogCard key={item.id} item={item} onOpen={openItem} />
                  ))}
                </div>
              </div>
            </div>
          ) : activeTab === 'songs' ? (
            <div className="song-list">
              {songs.map((song) => (
                <SongRow
                  key={song.id}
                  song={song}
                  active={currentTrack?.id === song.id}
                  onPlay={playSong}
                  onFavorite={toggleFavorite}
                  isFavorite={favoriteIds.has(song.id)}
                />
              ))}

              {!songs.length && !loading ? <div className="empty-state">No songs found for this search.</div> : null}

              <div className="actions-row">
                <button className="primary-button" disabled={!hasMoreSongs || loading} onClick={loadMore}>
                  {loading ? 'Loading more' : hasMoreSongs ? 'Load more songs' : 'No more songs'}
                </button>
              </div>
            </div>
          ) : (
            <div className="grid catalog-grid">
              {visibleCatalog.map((item) => (
                <CatalogCard key={item.id} item={item} onOpen={openItem} />
              ))}
              {!visibleCatalog.length && !loading ? <div className="empty-state">No {sectionLabel(activeTab).toLowerCase()} found for this search.</div> : null}
            </div>
          )}
        </section>

        <aside className="sidebar">
          <section className="card player-card">
            <div className="card-head compact">
              <div>
                <span className="eyebrow">Player</span>
                <h2>{currentTrack ? currentTrack.title : 'Nothing playing'}</h2>
              </div>
              <div className="status-pill">{playerBusy ? 'Buffering' : playing ? 'Playing' : 'Paused'}</div>
            </div>

            {currentTrack ? (
              <>
                <div className="now-playing">
                  <img src={currentTrack.image} alt={currentTrack.title} />
                  <div>
                    <strong>{currentTrack.title}</strong>
                    <p>{currentTrack.artist}</p>
                    <span>{currentTrack.album || 'Streaming from JioSaavn'}</span>
                  </div>
                </div>

                <div className="progress-bar">
                  <div className="progress-track">
                    <span style={{ width: `${Math.max(0, Math.min(100, progress * 100))}%` }} />
                  </div>
                </div>

                <div className="player-actions">
                  <button className="ghost-button" onClick={() => setCurrentIndex((value) => Math.max(0, value - 1))} disabled={currentIndex <= 0}>
                    Previous
                  </button>
                  <button className="primary-button" onClick={() => setPlaying((value) => !value)}>
                    {playing ? 'Pause' : 'Play'}
                  </button>
                  <button className="ghost-button" onClick={() => setCurrentIndex((value) => Math.min(queue.length - 1, value + 1))} disabled={currentIndex >= queue.length - 1}>
                    Next
                  </button>
                </div>

                <div className="queue-block">
                  <div className="queue-title">
                    <span>Queue</span>
                    <span>{queue.length} tracks</span>
                  </div>
                  <div className="queue-list">
                    {queue.slice(0, 8).map((song, index) => (
                      <button key={song.id} className={`queue-item ${index === currentIndex ? 'active' : ''}`} onClick={() => setCurrentIndex(index)}>
                        <span>{index + 1}</span>
                        <div>
                          <strong>{song.title}</strong>
                          <p>{song.artist}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="empty-state compact">Tap a track to start playback.</div>
            )}
          </section>

          <section className="card favorites-card">
            <div className="card-head compact">
              <div>
                <span className="eyebrow">Library</span>
                <h2>Saved tracks</h2>
              </div>
              <div className="status-pill">{favorites.length}</div>
            </div>

            <div className="favorites-list">
              {favorites.slice(0, 6).map((song) => (
                <button key={song.id} className="favorite-item" onClick={() => playSong(song)}>
                  <img src={song.image} alt={song.title} />
                  <div>
                    <strong>{song.title}</strong>
                    <p>{song.artist}</p>
                  </div>
                </button>
              ))}
              {!favorites.length ? <div className="empty-state compact">Save a song to keep it here.</div> : null}
            </div>
          </section>
        </aside>
      </main>

      {detail || detailLoading || detailError ? (
        <section className="detail-panel card">
          <div className="card-head">
            <div>
              <span className="eyebrow">Details</span>
              <h2>{detail ? detail.title : 'Loading item'}</h2>
              <p>{detail ? buildDetailSubtitle(detail) : 'Fetching selected item'}</p>
            </div>
            <div className="actions-row inline-actions">
              <button
                className="ghost-button"
                onClick={() => {
                  setDetail(null);
                  setDetailLoading(false);
                  setDetailError('');
                }}
              >
                Close
              </button>
              {detail ? (
                <button className="primary-button" onClick={() => playQueue(detail.songs, 0)}>
                  Play all
                </button>
              ) : null}
            </div>
          </div>

          {detailError ? <div className="error-banner">{detailError}</div> : null}
          {detailLoading ? <LoadingGrid count={4} /> : null}

          {detail ? (
            <div className="detail-body">
              <div className="detail-hero">
                <img src={detail.image} alt={detail.title} />
                <div>
                  <span className="eyebrow">{detail.type}</span>
                  <h3>{detail.title}</h3>
                  <p>{detail.subtitle || `${detail.songs.length} songs`}</p>
                </div>
              </div>

              <div className="song-list slim">
                {detail.songs.slice(0, 18).map((song, index) => (
                  <SongRow
                    key={`${song.id}-${index}`}
                    song={song}
                    active={currentTrack?.id === song.id}
                    onPlay={playSong}
                    onFavorite={toggleFavorite}
                    isFavorite={favoriteIds.has(song.id)}
                  />
                ))}
              </div>

              {detail.albums?.length ? (
                <div className="subsection">
                  <h3>Top albums</h3>
                  <div className="grid compact-grid">
                    {detail.albums.slice(0, 4).map((item) => (
                      <CatalogCard key={item.id} item={item} onOpen={openItem} />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}