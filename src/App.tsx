import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { asQueue, fetchTopSearches, searchSongs } from './api/jiosaavn';
import { formatDuration, storageGet, storageSet } from './lib/crypto';
import type { SongTrack, TopSearchItem } from './types';

const recentSearchKey = 'bloomee.recent-searches';
const favoriteKey = 'bloomee.favorites';

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
  const [songs, setSongs] = useState<SongTrack[]>([]);
  const [topSearches, setTopSearches] = useState<TopSearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [recentSearches, setRecentSearches] = useState<string[]>(() => storageGet<string[]>(recentSearchKey, []));
  const [favorites, setFavorites] = useState<SongTrack[]>(() => storageGet<SongTrack[]>(favoriteKey, []));
  const [queue, setQueue] = useState<SongTrack[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMoreSongs, setHasMoreSongs] = useState(false);

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

    searchSongs(term, 1, 24, controller.signal)
      .then((songResult) => {
        setSongs(songResult.songs);
        setHasMoreSongs(songResult.hasMore);
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
    if (currentIndex >= queue.length) {
      setCurrentIndex(queue.length - 1);
    }
  }, [queue.length, currentIndex]);

  function playQueue(trackList: SongTrack[], index = 0) {
    const playable = asQueue(trackList);
    if (!playable.length) {
      return;
    }

    const initialIndex = Math.min(Math.max(index, 0), playable.length - 1);
    setQueue(playable);
    setCurrentIndex(initialIndex);
    setPlaying(true);
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

  return (
    <div className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <header className="hero">
        <div className="hero-copy">
          <span className="eyebrow">React PWA music browser</span>
          <h1>Search YouTube Music and play tracks in one iPhone-friendly web app.</h1>
          <p>
            This build uses the YouTube Music search API, shows suggested queries, and plays tracks through an embedded YouTube player.
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
            <div className="status-pill">{loading ? 'Loading' : searchError ? 'Search unavailable' : 'Ready'}</div>
          </div>

          {searchError ? <div className="error-banner">{searchError}</div> : null}

          {loading && songs.length === 0 ? (
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
                <div className="chip-row">
                  {topSearches.slice(0, 4).map((item) => (
                    <button key={item.title} className="chip chip-muted" onClick={() => setQuery(item.query || item.title)}>
                      {item.title}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
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
          )}
        </section>

        <aside className="sidebar">
          <section className="card player-card">
            <div className="card-head compact">
              <div>
                <span className="eyebrow">Player</span>
                <h2>{currentTrack ? currentTrack.title : 'Nothing playing'}</h2>
              </div>
              <div className="status-pill">{playing ? 'Playing' : 'Paused'}</div>
            </div>

            {currentTrack ? (
              <>
                <div className="now-playing">
                  <img src={currentTrack.image} alt={currentTrack.title} />
                  <div>
                    <strong>{currentTrack.title}</strong>
                    <p>{currentTrack.artist}</p>
                    <span>{currentTrack.album || 'Streaming from YouTube Music'}</span>
                  </div>
                </div>

                {playing && currentTrack.embedUrl ? (
                  <iframe
                    key={currentTrack.videoId}
                    className="player-frame"
                    src={currentTrack.embedUrl}
                    title={currentTrack.title}
                    allow="autoplay; encrypted-media; picture-in-picture"
                    allowFullScreen
                  />
                ) : (
                  <div className="empty-state compact">Press play to load the YouTube player.</div>
                )}

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
                  {currentTrack.watchUrl ? (
                    <button className="ghost-button" onClick={() => window.open(currentTrack.watchUrl, '_blank', 'noopener,noreferrer')}>
                      Open in Music
                    </button>
                  ) : null}
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
    </div>
  );
}