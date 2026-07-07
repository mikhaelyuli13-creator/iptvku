import { useState } from 'react';
import { Tv, Film, Home, Search, List, X, ChevronRight, Radio, Settings } from 'lucide-react';

const Sidebar = ({ currentView, onNavigate, playlistUrl, onPlaylistLoad }) => {
  const [inputUrl, setInputUrl] = useState('');

  const navItems = [
    { id: 'home', icon: Home, label: 'Beranda' },
    { id: 'live', icon: Radio, label: 'Live TV' },
    { id: 'movies', icon: Film, label: 'Film & VOD' },
    { id: 'search', icon: Search, label: 'Cari' },
    { id: 'admin', icon: Settings, label: 'Admin Panel' },
  ];

  const handleLoad = () => {
    if (inputUrl.trim()) {
      onPlaylistLoad(inputUrl.trim());
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleLoad();
  };

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">
          <Tv size={18} color="white" />
        </div>
        <span className="sidebar-logo-text">StreamVault</span>
      </div>

      {/* Navigation */}
      <span className="sidebar-section-label">Menu</span>
      <nav className="sidebar-nav">
        {navItems.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            id={`nav-${id}`}
            className={`nav-item ${currentView === id ? 'active' : ''}`}
            onClick={() => onNavigate(id)}
            title={label}
          >
            <Icon size={20} className="nav-icon" />
            <span>{label}</span>
            {currentView === id && (
              <ChevronRight size={14} style={{ marginLeft: 'auto', opacity: 0.5 }} />
            )}
          </button>
        ))}
      </nav>

      {/* Preset Playlist Shortcuts */}
      <span className="sidebar-section-label">Preset Playlist</span>
      <div style={{ padding: '0 var(--space-md) var(--space-sm) var(--space-md)', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <button
          className="btn-load"
          style={{ width: '100%', textAlign: 'left', background: 'linear-gradient(135deg, rgba(108, 99, 255, 0.25), rgba(184, 109, 255, 0.25))', border: '1px solid var(--accent-primary)', padding: '6px 10px', fontSize: '0.72rem', borderRadius: 'var(--radius-sm)', cursor: 'pointer', transition: 'all var(--transition-fast)', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 'bold' }}
          onClick={() => {
            const localUrl = window.location.origin + '/streamvault.m3u';
            setInputUrl(localUrl);
            onPlaylistLoad(localUrl);
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-secondary)'; e.currentTarget.style.boxShadow = '0 0 8px rgba(108, 99, 255, 0.3)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--accent-primary)'; e.currentTarget.style.boxShadow = 'none'; }}
        >
          <span>👑</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>StreamVault Unified (Lokal)</span>
        </button>
        <button
          className="btn-load"
          style={{ width: '100%', textAlign: 'left', background: 'var(--bg-glass)', border: '1px solid var(--bg-glass-border)', padding: '6px 10px', fontSize: '0.72rem', borderRadius: 'var(--radius-sm)', cursor: 'pointer', transition: 'all var(--transition-fast)', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}
          onClick={() => { setInputUrl('https://play.streamo.cfd/playlist.m3u?source=eth'); onPlaylistLoad('https://play.streamo.cfd/playlist.m3u?source=eth'); }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-primary)'; e.currentTarget.style.background = 'rgba(108, 99, 255, 0.1)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--bg-glass-border)'; e.currentTarget.style.background = 'var(--bg-glass)'; }}
        >
          <span>🚀</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Streamo Special (ETH)</span>
        </button>
        <button
          className="btn-load"
          style={{ width: '100%', textAlign: 'left', background: 'var(--bg-glass)', border: '1px solid var(--bg-glass-border)', padding: '6px 10px', fontSize: '0.72rem', borderRadius: 'var(--radius-sm)', cursor: 'pointer', transition: 'all var(--transition-fast)', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}
          onClick={() => { setInputUrl('https://getch.semar.my.id'); onPlaylistLoad('https://getch.semar.my.id'); }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-primary)'; e.currentTarget.style.background = 'rgba(108, 99, 255, 0.1)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--bg-glass-border)'; e.currentTarget.style.background = 'var(--bg-glass)'; }}
        >
          <span>🧙‍♂️</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Semar IPTV (JSON)</span>
        </button>
        <button
          className="btn-load"
          style={{ width: '100%', textAlign: 'left', background: 'var(--bg-glass)', border: '1px solid var(--bg-glass-border)', padding: '6px 10px', fontSize: '0.72rem', borderRadius: 'var(--radius-sm)', cursor: 'pointer', transition: 'all var(--transition-fast)', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}
          onClick={() => { setInputUrl('https://freeiptv2026.sepak7042.workers.dev'); onPlaylistLoad('https://freeiptv2026.sepak7042.workers.dev'); }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-primary)'; e.currentTarget.style.background = 'rgba(108, 99, 255, 0.1)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--bg-glass-border)'; e.currentTarget.style.background = 'var(--bg-glass)'; }}
        >
          <span>⚡</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Free IPTV (Workers)</span>
        </button>
      </div>

      {/* Playlist Loader */}
      <div className="sidebar-footer">
        <div className="playlist-input-section">
          <span className="playlist-input-label">
            <List size={10} style={{ display: 'inline', marginRight: 4 }} />
            Playlist M3U
          </span>
          <div className="playlist-input-wrapper">
            <input
              id="playlist-url-input"
              type="url"
              className="playlist-input"
              placeholder="https://...playlist.m3u"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button
              id="btn-load-playlist"
              className="btn-load"
              onClick={handleLoad}
              title="Muat playlist"
            >
              Load
            </button>
          </div>
          {playlistUrl && (
            <p style={{ fontSize: '0.65rem', color: 'var(--accent-green)', marginTop: 4 }}>
              ✓ Playlist dimuat
            </p>
          )}
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
