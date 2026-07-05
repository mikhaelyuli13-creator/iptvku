import { useState, useMemo, useEffect } from 'react';
import { Radio, Film, Home, Search, Star, Play, Settings } from 'lucide-react';
import './index.css';

import Sidebar from './components/Sidebar';
import Player from './components/Player';
import ChannelList from './components/ChannelList';
import MediaGrid from './components/MediaGrid';
import SearchBar from './components/SearchBar';
import MovieModal from './components/MovieModal';
import AdminLogin from './components/AdminLogin';
import { fetchAndParseM3U, parseM3UText } from './utils/m3uParser';
import AdminPanel from './components/AdminPanel';
import { supabase } from './lib/supabaseClient';

import defaultChannels from './data/channels';
import defaultMovies from './data/movies';

// Hero Banner Component
function HeroBanner({ movie, onPlay }) {
  if (!movie) return null;
  return (
    <div className="hero-banner" onClick={() => onPlay(movie)}>
      <div className="hero-bg">
        {movie.backdrop && <img src={movie.backdrop} alt={movie.title} />}
      </div>
      <div className="hero-gradient" />
      <div className="hero-content">
        <div className="hero-badge">
          <Star size={10} fill="currentColor" />
          Featured
        </div>
        <h1 className="hero-title">{movie.title}</h1>
        <p className="hero-desc">{movie.description?.substring(0, 140)}...</p>
        <div className="hero-actions">
          <button className="btn-primary" id="btn-hero-play">
            <Play size={16} fill="currentColor" />
            Putar Sekarang
          </button>
          <button className="btn-secondary" id="btn-hero-info">
            <Star size={16} />
            {movie.rating} Rating
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [currentView, setCurrentView] = useState('home');
  const [activeChannel, setActiveChannel] = useState(null);
  const [selectedMovie, setSelectedMovie] = useState(null);

  const [channels, setChannels] = useState([]);
  const [movies, setMovies] = useState([]);
  const [isDataLoading, setIsDataLoading] = useState(true);

  const [playlistUrl, setPlaylistUrl] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [playlistLoading, setPlaylistLoading] = useState(false);
  const [playlistError, setPlaylistError] = useState('');

  // Admin state
  const [adminView, setAdminView] = useState(false);   // show admin panel
  const [adminLoggedIn, setAdminLoggedIn] = useState(false);

  // Fetch data from Supabase
  useEffect(() => {
    const fetchData = async () => {
      setIsDataLoading(true);
      try {
        const [chRes, mvRes] = await Promise.all([
          supabase.from('channels').select('*'),
          supabase.from('movies').select('*')
        ]);
        
        setChannels(chRes.data && chRes.data.length > 0 ? chRes.data : defaultChannels);
        setMovies(mvRes.data && mvRes.data.length > 0 ? mvRes.data : defaultMovies);
      } catch (err) {
        console.error("Gagal mengambil data dari Supabase:", err);
        setChannels(defaultChannels);
        setMovies(defaultMovies);
      }
      setIsDataLoading(false);
    };
    fetchData();
  }, []);

  const featuredMovies = movies.filter(m => m.featured);
  const hero = featuredMovies[0] || movies[0];

  // Load M3U playlist from sidebar
  const handlePlaylistLoad = async (url) => {
    setPlaylistLoading(true);
    setPlaylistError('');
    try {
      const parsed = await fetchAndParseM3U(url);
      if (parsed.length === 0) {
        setPlaylistError('Playlist tidak berisi channel yang valid.');
      } else {
        setChannels(parsed);
        setPlaylistUrl(url);
        setCurrentView('live');
      }
    } catch (e) {
      setPlaylistError(`Gagal memuat playlist: ${e.message}`);
    }
    setPlaylistLoading(false);
  };

  // Filtered data
  const activeChannels = useMemo(() => {
    return channels.filter(ch => {
      if (typeof ch.id === 'number' && ch.id <= 10) return true;
      return ch.headers?.active === true;
    });
  }, [channels]);

  const filteredChannels = useMemo(() => {
    if (!searchQuery) return activeChannels;
    const q = searchQuery.toLowerCase();
    return activeChannels.filter(ch =>
      ch.name?.toLowerCase().includes(q) ||
      ch.category?.toLowerCase().includes(q)
    );
  }, [activeChannels, searchQuery]);

  const filteredMovies = useMemo(() => {
    if (!searchQuery) return movies;
    const q = searchQuery.toLowerCase();
    return movies.filter(m =>
      m.title?.toLowerCase().includes(q) ||
      m.genre?.some(g => g.toLowerCase().includes(q))
    );
  }, [movies, searchQuery]);

  // Handle admin button in sidebar
  const handleNavigate = (view) => {
    if (view === 'admin') {
      setAdminView(true);
    } else {
      setAdminView(false);
      setCurrentView(view);
    }
  };

  const handleAdminLogout = () => {
    setAdminLoggedIn(false);
    setAdminView(false);
  };

  // ---- Admin Panel View ----
  if (adminView) {
    if (!adminLoggedIn) {
      return <AdminLogin onLogin={setAdminLoggedIn} />;
    }
    return (
      <AdminPanel
        channels={channels}
        movies={movies}
        onUpdateChannels={setChannels}
        onUpdateMovies={setMovies}
        onLogout={handleAdminLogout}
      />
    );
  }

  const renderTopbar = (title, highlighted) => (
    <div className="topbar">
      <h2 className="topbar-title">
        {title} {highlighted && <span>{highlighted}</span>}
      </h2>
      <SearchBar
        value={searchQuery}
        onChange={(v) => { setSearchQuery(v); if (v) setCurrentView('search'); }}
      />
      {/* Admin shortcut button */}
      <button
        id="btn-open-admin"
        onClick={() => setAdminView(true)}
        title="Admin Panel"
        style={{
          background: 'var(--bg-glass)', border: '1px solid var(--bg-glass-border)', borderRadius: 'var(--radius-md)',
          padding: '8px 10px', cursor: 'pointer', color: 'var(--text-muted)',
          display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', fontWeight: 600,
          transition: 'all var(--transition-fast)', flexShrink: 0,
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-primary)'; e.currentTarget.style.color = 'var(--accent-primary)'; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--bg-glass-border)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
      >
        <Settings size={15} />
        <span>Admin</span>
      </button>
    </div>
  );

  const renderStats = () => (
    <div className="stats-bar">
      <div className="stat-item">
        <span className="stat-value">{channels.length}</span>
        <span className="stat-label">Live Channel</span>
      </div>
      <div className="stat-item">
        <span className="stat-value">{movies.length}</span>
        <span className="stat-label">Film & VOD</span>
      </div>
      <div className="stat-item">
        <span className="stat-value">HLS + MPD</span>
        <span className="stat-label">Format</span>
      </div>
      <div className="stat-item">
        <span className="stat-value">HD / 4K</span>
        <span className="stat-label">Kualitas</span>
      </div>
    </div>
  );

  // ---- VIEWS ----

  const renderHome = () => (
    <>
      {renderTopbar('Selamat Datang di', 'StreamVault')}
      {renderStats()}
      <div className="page-container">
        {isDataLoading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <div className="spinner" style={{ margin: '0 auto 10px auto' }} />
            <p>Memuat data dari database...</p>
          </div>
        ) : (
          <>
            {hero && <HeroBanner movie={hero} onPlay={setSelectedMovie} />}

            {/* Live TV */}
            <div className="section-header">
              <h3 className="section-title">
                <Radio size={18} style={{ color: 'var(--accent-primary)' }} />
                Live TV
                <span className="live-badge"><span className="live-dot" />LIVE</span>
              </h3>
              <button id="btn-see-all-live" className="see-all-btn" onClick={() => setCurrentView('live')}>Lihat Semua →</button>
            </div>
            <div className="channel-grid" style={{ marginBottom: 'var(--space-3xl)' }}>
              {activeChannels.slice(0, 6).map(channel => (
                <div
                  key={channel.id}
                  id={`home-channel-${channel.id}`}
                  className={`channel-card ${activeChannel?.id === channel.id ? 'active' : ''}`}
                  onClick={() => { setActiveChannel(channel); setCurrentView('live'); }}
                  role="button" tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && (() => { setActiveChannel(channel); setCurrentView('live'); })()}
                >
                  <div className="channel-logo-wrapper">
                    {channel.logo ? (
                      <img src={channel.logo} alt={channel.name} className="channel-logo"
                        onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }} />
                    ) : null}
                    <div className="channel-logo-placeholder" style={{ display: channel.logo ? 'none' : 'flex' }}>
                      {channel.name?.substring(0, 2).toUpperCase()}
                    </div>
                  </div>
                  <span className="channel-name">{channel.name}</span>
                  <span className="channel-category">{channel.category}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div className="live-dot" />
                    <span style={{ fontSize: '0.65rem', color: '#ff5555', fontWeight: 700 }}>LIVE</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Movies */}
            <div className="section-header">
              <h3 className="section-title">
                <Film size={18} style={{ color: 'var(--accent-secondary)' }} />
                Film & VOD
              </h3>
              <button id="btn-see-all-movies" className="see-all-btn" onClick={() => setCurrentView('movies')}>Lihat Semua →</button>
            </div>
            <div className="movie-grid">
              {movies.slice(0, 8).map(movie => (
                <div
                  key={movie.id}
                  id={`home-movie-${movie.id}`}
                  className="movie-card"
                  onClick={() => setSelectedMovie(movie)}
                  role="button" tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && setSelectedMovie(movie)}
                >
                  <div className="movie-poster-wrapper">
                    <span className="movie-badge">{movie.type === 'dash' ? 'DASH' : 'HLS'}</span>
                    <span className="movie-quality-badge">{movie.quality || 'HD'}</span>
                    {movie.poster ? (
                      <img src={movie.poster} alt={movie.title} className="movie-poster"
                        onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }} />
                    ) : null}
                    <div className="movie-poster-placeholder" style={{ display: movie.poster ? 'none' : 'flex' }}>
                      <Film size={28} />
                    </div>
                    <div className="movie-overlay" />
                    <div className="play-button-overlay">
                      <Play size={16} fill="currentColor" />
                    </div>
                  </div>
                  <div className="movie-info">
                    <p className="movie-title">{movie.title}</p>
                    <div className="movie-meta">
                      <span className="movie-rating"><Star size={10} fill="currentColor" />{movie.rating}</span>
                      <span>{movie.year}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );

  const renderLive = () => (
    <>
      {renderTopbar('Live', 'Television')}
      <div className="page-container">
        <Player source={activeChannel} title={activeChannel?.name} />
        {playlistError && (
          <div style={{ background: 'rgba(255,50,50,0.1)', border: '1px solid rgba(255,50,50,0.3)', borderRadius: 'var(--radius-md)', padding: 'var(--space-md)', marginBottom: 'var(--space-xl)', color: '#ff7070', fontSize: '0.875rem' }}>
            ⚠️ {playlistError}
          </div>
        )}
        {playlistLoading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', marginBottom: 'var(--space-xl)', fontSize: '0.875rem' }}>
            <div className="spinner" style={{ width: 16, height: 16 }} />
            Memuat playlist...
          </div>
        )}
        <div className="section-header">
          <h3 className="section-title">
            <Radio size={18} style={{ color: 'var(--accent-primary)' }} />
            Semua Channel
            <span className="live-badge"><span className="live-dot" />LIVE</span>
          </h3>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{filteredChannels.length} channel</span>
        </div>
        <ChannelList channels={filteredChannels} activeChannel={activeChannel} onChannelSelect={setActiveChannel} />
      </div>
    </>
  );

  const renderMovies = () => {
    const featuredForPage = featuredMovies[1] || featuredMovies[0] || movies[0];
    return (
      <>
        {renderTopbar('Film &', 'VOD')}
        <div className="page-container">
          {featuredForPage && <HeroBanner movie={featuredForPage} onPlay={setSelectedMovie} />}
          <div className="section-header">
            <h3 className="section-title">
              <Film size={18} style={{ color: 'var(--accent-secondary)' }} />
              Semua Film
            </h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{filteredMovies.length} film</span>
          </div>
          <MediaGrid movies={filteredMovies} onMovieSelect={setSelectedMovie} />
        </div>
      </>
    );
  };

  const renderSearch = () => (
    <>
      {renderTopbar('Hasil', 'Pencarian')}
      <div className="page-container">
        {searchQuery ? (
          <>
            {filteredChannels.length > 0 && (
              <>
                <div className="section-header">
                  <h3 className="section-title"><Radio size={18} style={{ color: 'var(--accent-primary)' }} />Channel ({filteredChannels.length})</h3>
                </div>
                <ChannelList channels={filteredChannels} activeChannel={activeChannel} onChannelSelect={(ch) => { setActiveChannel(ch); setCurrentView('live'); }} />
                <div style={{ height: 'var(--space-2xl)' }} />
              </>
            )}
            {filteredMovies.length > 0 && (
              <>
                <div className="section-header">
                  <h3 className="section-title"><Film size={18} style={{ color: 'var(--accent-secondary)' }} />Film ({filteredMovies.length})</h3>
                </div>
                <MediaGrid movies={filteredMovies} onMovieSelect={setSelectedMovie} />
              </>
            )}
            {filteredChannels.length === 0 && filteredMovies.length === 0 && (
              <div className="empty-state">
                <Search size={48} />
                <p>Tidak ada hasil untuk "{searchQuery}"</p>
                <p style={{ fontSize: '0.8rem' }}>Coba kata kunci lain</p>
              </div>
            )}
          </>
        ) : (
          <div className="empty-state">
            <Search size={48} />
            <p>Ketik sesuatu untuk mencari</p>
          </div>
        )}
      </div>
    </>
  );

  return (
    <div className="app-layout">
      <Sidebar
        currentView={currentView}
        onNavigate={handleNavigate}
        playlistUrl={playlistUrl}
        onPlaylistLoad={handlePlaylistLoad}
      />
      <main className="main-content" id="main-content">
        {currentView === 'home' && renderHome()}
        {currentView === 'live' && renderLive()}
        {currentView === 'movies' && renderMovies()}
        {currentView === 'search' && renderSearch()}
      </main>
      {selectedMovie && (
        <MovieModal movie={selectedMovie} onClose={() => setSelectedMovie(null)} />
      )}
    </div>
  );
}
