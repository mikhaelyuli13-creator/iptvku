import { useState } from 'react';
import {
  LayoutDashboard, Radio, Film, Plus, Pencil, Trash2,
  Save, X, Upload, Link2, ChevronDown, CheckCircle, AlertCircle, LogOut, List, Shield, RefreshCw
} from 'lucide-react';
import { fetchAndParseM3U } from '../utils/m3uParser';
import { supabase, hasSupabase } from '../lib/supabaseClient';

const TABS = [
  { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { id: 'channels', icon: Radio, label: 'Kelola Channel' },
  { id: 'movies', icon: Film, label: 'Kelola Film' },
  { id: 'playlist', icon: List, label: 'Import Playlist' },
];

const CHANNEL_CATEGORIES = ['Berita', 'Hiburan', 'Olahraga', 'Anak-anak', 'Dokumenter', 'Musik', 'Lainnya'];
const MOVIE_GENRES = ['Aksi', 'Drama', 'Sci-Fi', 'Horor', 'Komedi', 'Thriller', 'Petualangan', 'Animasi', 'Keluarga', 'Dokumenter'];

// --- Reusable Form Input ---
const FormInput = ({ label, id, type = 'text', value, onChange, placeholder, required, hint }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
    <label htmlFor={id} style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
      {label} {required && <span style={{ color: 'var(--accent-secondary)' }}>*</span>}
    </label>
    <input
      id={id}
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        background: 'var(--bg-glass)', border: '1px solid var(--bg-glass-border)', borderRadius: 'var(--radius-md)',
        padding: '10px 14px', color: 'var(--text-primary)', fontFamily: 'var(--font-family)',
        fontSize: '0.875rem', outline: 'none', transition: 'border-color var(--transition-fast)',
        width: '100%',
      }}
      onFocus={e => e.target.style.borderColor = 'var(--accent-primary)'}
      onBlur={e => e.target.style.borderColor = 'var(--bg-glass-border)'}
    />
    {hint && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{hint}</span>}
  </div>
);

const FormSelect = ({ label, id, value, onChange, options }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
    <label htmlFor={id} style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
      {label}
    </label>
    <div style={{ position: 'relative' }}>
      <select
        id={id}
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          appearance: 'none', width: '100%', background: 'var(--bg-glass)',
          border: '1px solid var(--bg-glass-border)', borderRadius: 'var(--radius-md)',
          padding: '10px 36px 10px 14px', color: 'var(--text-primary)',
          fontFamily: 'var(--font-family)', fontSize: '0.875rem', outline: 'none', cursor: 'pointer',
        }}
      >
        {options.map(o => <option key={o} value={o} style={{ background: '#12121f' }}>{o}</option>)}
      </select>
      <ChevronDown size={14} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
    </div>
  </div>
);

const FormTextarea = ({ label, id, value, onChange, placeholder, rows = 3 }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
    <label htmlFor={id} style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
      {label}
    </label>
    <textarea
      id={id}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      style={{
        background: 'var(--bg-glass)', border: '1px solid var(--bg-glass-border)', borderRadius: 'var(--radius-md)',
        padding: '10px 14px', color: 'var(--text-primary)', fontFamily: 'var(--font-family)',
        fontSize: '0.875rem', outline: 'none', resize: 'vertical', width: '100%',
      }}
      onFocus={e => e.target.style.borderColor = 'var(--accent-primary)'}
      onBlur={e => e.target.style.borderColor = 'var(--bg-glass-border)'}
    />
  </div>
);

// --- Toast Notification ---
const Toast = ({ message, type, onClose }) => (
  <div style={{
    position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
    background: type === 'success' ? 'rgba(0,229,160,0.15)' : 'rgba(255,100,100,0.15)',
    border: `1px solid ${type === 'success' ? 'rgba(0,229,160,0.4)' : 'rgba(255,100,100,0.4)'}`,
    borderRadius: 'var(--radius-md)', padding: '12px 20px',
    display: 'flex', alignItems: 'center', gap: 10,
    color: type === 'success' ? '#00e5a0' : '#ff7070',
    fontSize: '0.875rem', fontWeight: 600,
    boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
    animation: 'slideUp 0.3s ease',
  }}>
    {type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
    {message}
    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', marginLeft: 8, display: 'flex' }}>
      <X size={14} />
    </button>
  </div>
);

// --- Confirm Dialog ---
const ConfirmDialog = ({ message, onConfirm, onCancel }) => (
  <div className="modal-overlay" style={{ zIndex: 500 }}>
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--bg-glass-border)', borderRadius: 'var(--radius-xl)',
      padding: 'var(--space-2xl)', maxWidth: 380, width: '100%', textAlign: 'center',
      animation: 'slideUp 0.2s ease',
    }}>
      <AlertCircle size={40} style={{ color: 'var(--accent-secondary)', margin: '0 auto var(--space-md)' }} />
      <h3 style={{ marginBottom: 'var(--space-sm)' }}>Konfirmasi Hapus</h3>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: 'var(--space-xl)' }}>{message}</p>
      <div style={{ display: 'flex', gap: 'var(--space-md)', justifyContent: 'center' }}>
        <button className="btn-secondary" onClick={onCancel} id="btn-cancel-delete">Batal</button>
        <button id="btn-confirm-delete" onClick={onConfirm} style={{ background: 'rgba(255,80,80,0.2)', border: '1px solid rgba(255,80,80,0.4)', borderRadius: 'var(--radius-md)', padding: '8px 20px', color: '#ff7070', fontFamily: 'var(--font-family)', fontWeight: 700, cursor: 'pointer' }}>
          Hapus
        </button>
      </div>
    </div>
  </div>
);

// ===========================
//  CHANNEL FORM
// ===========================
const emptyChannel = { name: '', url: '', logo: '', category: 'Hiburan', type: 'hls', country: 'ID', drm: null };

// DRM Section inside channel form
const DrmSection = ({ drm, onChange }) => {
  const type = drm?.type || 'none';
  const setType = (t) => {
    if (t === 'none') onChange(null);
    else onChange({ type: t, ...(t === 'clearkey' ? { clearKeys: {} } : { licenseServer: '' }) });
  };
  const setClearKey = (val) => {
    // parse "kid:key" pairs
    const keys = {};
    val.split(',').forEach(pair => {
      const [k, v] = pair.trim().split(':');
      if (k && v) keys[k.trim().toLowerCase()] = v.trim().toLowerCase();
    });
    onChange({ type: 'clearkey', clearKeys: keys, _raw: val });
  };
  const setLicenseServer = (val) => onChange({ type: 'widevine', licenseServer: val });

  const clearKeyRaw = drm?._raw || (drm?.clearKeys ? Object.entries(drm.clearKeys).map(([k,v])=>`${k}:${v}`).join(', ') : '');

  return (
    <div style={{ background: 'rgba(255,140,66,0.05)', border: '1px solid rgba(255,140,66,0.2)', borderRadius: 'var(--radius-md)', padding: 'var(--space-md)', display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', fontWeight: 700, color: '#ff8c42', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
        <Shield size={13} />
        Konfigurasi DRM (opsional)
      </div>
      <FormSelect id="ch-drm-type" label="Tipe DRM" value={type} onChange={setType} options={['none', 'clearkey', 'widevine']} />
      {type === 'clearkey' && (
        <FormInput
          id="ch-drm-clearkey"
          label="ClearKey (KID:Key)"
          value={clearKeyRaw}
          onChange={setClearKey}
          placeholder="251c384e...:e45b06a3... (pisah koma jika lebih dari 1)"
          hint="Format: kid_hex:key_hex — dari KODIPROP:inputstream.adaptive.license_key"
        />
      )}
      {type === 'widevine' && (
        <FormInput
          id="ch-drm-widevine"
          label="License Server URL"
          value={drm?.licenseServer || ''}
          onChange={setLicenseServer}
          placeholder="https://license.example.com/widevine"
          hint="URL server Widevine DRM"
        />
      )}
    </div>
  );
};

const ChannelForm = ({ initial, onSave, onCancel }) => {
  const [form, setForm] = useState(initial || emptyChannel);

  const set = (k) => (v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name || !form.url) return;
    onSave({ ...form, id: form.id || Date.now() });
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
        <FormInput id="ch-name" label="Nama Channel" value={form.name} onChange={set('name')} placeholder="Metro TV" required />
        <FormSelect id="ch-category" label="Kategori" value={form.category} onChange={set('category')} options={CHANNEL_CATEGORIES} />
      </div>
      <FormInput id="ch-url" label="URL Stream" value={form.url} onChange={set('url')}
        placeholder="https://example.com/stream.m3u8  atau  stream.mpd" required
        hint="Mendukung format .m3u8 (HLS) dan .mpd (MPEG-DASH)" />
      <FormInput id="ch-logo" label="URL Logo (opsional)" value={form.logo} onChange={set('logo')} placeholder="https://example.com/logo.png" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
        <FormSelect id="ch-type" label="Tipe Stream" value={form.type} onChange={set('type')} options={['hls', 'dash']} />
        <FormInput id="ch-country" label="Kode Negara" value={form.country} onChange={set('country')} placeholder="ID" />
      </div>
      <DrmSection drm={form.drm} onChange={set('drm')} />
      <div style={{ display: 'flex', gap: 'var(--space-md)', justifyContent: 'flex-end', paddingTop: 'var(--space-sm)', borderTop: '1px solid var(--bg-glass-border)' }}>
        <button type="button" id="btn-cancel-channel-form" className="btn-secondary" onClick={onCancel}><X size={14} /> Batal</button>
        <button type="submit" id="btn-save-channel-form" className="btn-primary"><Save size={14} /> Simpan Channel</button>
      </div>
    </form>
  );
};

// ===========================
//  MOVIE FORM
// ===========================
const emptyMovie = { title: '', url: '', poster: '', backdrop: '', type: 'hls', genre: [], year: new Date().getFullYear(), duration: '', quality: 'HD', rating: '', description: '', featured: false };

const MovieForm = ({ initial, onSave, onCancel }) => {
  const [form, setForm] = useState(initial ? { ...initial, genre: Array.isArray(initial.genre) ? initial.genre : [] } : emptyMovie);
  const [genreInput, setGenreInput] = useState(Array.isArray(initial?.genre) ? initial.genre.join(', ') : '');

  const set = (k) => (v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.title || !form.url) return;
    const genres = genreInput.split(',').map(g => g.trim()).filter(Boolean);
    onSave({ ...form, genre: genres, id: form.id || Date.now(), rating: parseFloat(form.rating) || 0 });
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
        <FormInput id="mv-title" label="Judul Film" value={form.title} onChange={set('title')} placeholder="Nama Film" required />
        <FormSelect id="mv-type" label="Tipe Stream" value={form.type} onChange={set('type')} options={['hls', 'dash']} />
      </div>

      <FormInput id="mv-url" label="URL Stream" value={form.url} onChange={set('url')}
        placeholder="https://example.com/film.m3u8  atau  film.mpd" required
        hint="Mendukung .m3u8 (HLS) dan .mpd (MPEG-DASH)" />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
        <FormInput id="mv-poster" label="URL Poster" value={form.poster} onChange={set('poster')} placeholder="https://...poster.jpg" />
        <FormInput id="mv-backdrop" label="URL Backdrop (hero)" value={form.backdrop} onChange={set('backdrop')} placeholder="https://...backdrop.jpg" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 'var(--space-md)' }}>
        <FormInput id="mv-year" label="Tahun" type="number" value={form.year} onChange={set('year')} placeholder="2024" />
        <FormInput id="mv-duration" label="Durasi" value={form.duration} onChange={set('duration')} placeholder="120 min" />
        <FormInput id="mv-rating" label="Rating" type="number" value={form.rating} onChange={set('rating')} placeholder="8.5" />
        <FormSelect id="mv-quality" label="Kualitas" value={form.quality} onChange={set('quality')} options={['SD', 'HD', 'FHD', '4K']} />
      </div>

      <FormInput id="mv-genre" label="Genre (pisah dengan koma)" value={genreInput} onChange={setGenreInput}
        placeholder="Aksi, Drama, Sci-Fi" hint={`Pilihan: ${MOVIE_GENRES.join(', ')}`} />

      <FormTextarea id="mv-desc" label="Deskripsi" value={form.description} onChange={set('description')} placeholder="Sinopsis film..." rows={3} />

      <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', cursor: 'pointer', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
        <input
          id="mv-featured"
          type="checkbox"
          checked={form.featured || false}
          onChange={e => set('featured')(e.target.checked)}
          style={{ accentColor: 'var(--accent-primary)', width: 16, height: 16 }}
        />
        Tampilkan di Hero Banner (Featured)
      </label>

      <div style={{ display: 'flex', gap: 'var(--space-md)', justifyContent: 'flex-end', paddingTop: 'var(--space-sm)', borderTop: '1px solid var(--bg-glass-border)' }}>
        <button type="button" id="btn-cancel-movie-form" className="btn-secondary" onClick={onCancel}><X size={14} /> Batal</button>
        <button type="submit" id="btn-save-movie-form" className="btn-primary"><Save size={14} /> Simpan Film</button>
      </div>
    </form>
  );
};

// ===========================
//  ADMIN PANEL MAIN
// ===========================
const AdminPanel = ({ channels, movies, onUpdateChannels, onUpdateMovies, onLogout }) => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [channelFormMode, setChannelFormMode] = useState(null); // 'add' | 'edit'
  const [editingChannel, setEditingChannel] = useState(null);
  const [movieFormMode, setMovieFormMode] = useState(null);
  const [editingMovie, setEditingMovie] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [toast, setToast] = useState(null);
  const [playlistInput, setPlaylistInput] = useState('');
  const [playlistLoading, setPlaylistLoading] = useState(false);
  const [playlistPreview, setPlaylistPreview] = useState(null);
  const [selectedChannels, setSelectedChannels] = useState([]);
  const [selectedMovies, setSelectedMovies] = useState([]);
  
  // --- Checker State ---
  const [channelStatus, setChannelStatus] = useState({});
  const [isChecking, setIsChecking] = useState(false);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // --- Channel Helper ---
  const sanitizeChannel = (ch) => ({
    id: ch.id.toString(),
    name: ch.name || 'Unknown Channel',
    category: ch.category || 'Lainnya',
    logo: ch.logo || null,
    url: ch.url || '',
    type: ch.type || 'hls',
    country: ch.country || 'ID',
    drm: ch.drm || null,
    headers: ch.headers || null,
    tvgId: ch.tvgId || null
  });

  // --- Channel Actions ---
  const handleSaveChannel = async (ch) => {
    try {
      const channelData = sanitizeChannel(ch);
      const { error } = await supabase.from('channels').upsert(channelData);
      if (error) throw error;

      if (channels.find(c => c.id === ch.id)) {
        onUpdateChannels(channels.map(c => c.id === ch.id ? channelData : c));
        showToast(`Channel "${ch.name}" berhasil diperbarui!`);
      } else {
        onUpdateChannels([...channels, channelData]);
        showToast(`Channel "${ch.name}" berhasil ditambahkan!`);
      }
    } catch (err) {
      showToast(`Gagal menyimpan: ${err.message}`, 'error');
    }
    setChannelFormMode(null);
    setEditingChannel(null);
  };

  const handleDeleteChannel = (id) => {
    const ch = channels.find(c => c.id === id);
    setConfirm({
      message: `Hapus channel "${ch?.name}"? Tindakan ini tidak bisa dibatalkan.`,
      onConfirm: async () => {
        try {
          const { error } = await supabase.from('channels').delete().eq('id', id.toString());
          if (error) throw error;
          onUpdateChannels(channels.filter(c => c.id !== id));
          showToast(`Channel "${ch?.name}" dihapus.`, 'error');
        } catch (err) {
          showToast(`Gagal menghapus: ${err.message}`, 'error');
        }
        setConfirm(null);
      }
    });
  };

  // --- Movie Actions ---
  const handleSaveMovie = async (mv) => {
    try {
      const movieData = { ...mv, id: mv.id.toString() };
      const { error } = await supabase.from('movies').upsert(movieData);
      if (error) throw error;

      if (movies.find(m => m.id === mv.id)) {
        onUpdateMovies(movies.map(m => m.id === mv.id ? movieData : m));
        showToast(`Film "${mv.title}" berhasil diperbarui!`);
      } else {
        onUpdateMovies([...movies, movieData]);
        showToast(`Film "${mv.title}" berhasil ditambahkan!`);
      }
    } catch (err) {
      showToast(`Gagal menyimpan: ${err.message}`, 'error');
    }
    setMovieFormMode(null);
    setEditingMovie(null);
  };

  const handleDeleteMovie = (id) => {
    const mv = movies.find(m => m.id === id);
    setConfirm({
      message: `Hapus film "${mv?.title}"? Tindakan ini tidak bisa dibatalkan.`,
      onConfirm: async () => {
        try {
          const { error } = await supabase.from('movies').delete().eq('id', id.toString());
          if (error) throw error;
          onUpdateMovies(movies.filter(m => m.id !== id));
          showToast(`Film "${mv?.title}" dihapus.`, 'error');
        } catch (err) {
          showToast(`Gagal menghapus: ${err.message}`, 'error');
        }
        setConfirm(null);
      }
    });
  };

  // --- Playlist Import ---
  const handleImportPlaylist = async () => {
    if (!playlistInput.trim()) return;
    setPlaylistLoading(true);
    setPlaylistPreview(null);
    try {
      const parsed = await fetchAndParseM3U(playlistInput.trim());
      if (parsed.length === 0) throw new Error('Tidak ada channel ditemukan');
      setPlaylistPreview(parsed);
    } catch (e) {
      showToast(`Gagal memuat playlist: ${e.message}`, 'error');
    }
    setPlaylistLoading(false);
  };

  const handleApplyPlaylist = async (mode) => {
    if (!playlistPreview) return;
    setPlaylistLoading(true);
    try {
      const dataToInsert = playlistPreview.map(p => sanitizeChannel({ 
        ...p, 
        id: p.id || Date.now() + Math.random() 
      }));

      if (mode === 'replace') {
        // Hapus semua channel secara total di database
        const { error: delError } = await supabase.from('channels').delete().neq('id', '');
        if (delError) throw delError;
        
        // Gunakan upsert agar tidak bentrok id
        const { error } = await supabase.from('channels').upsert(dataToInsert);
        if (error) throw error;
        
        onUpdateChannels(dataToInsert);
        showToast(`${dataToInsert.length} channel berhasil dimuat (mengganti semua)!`);
      } else {
        const newChannels = dataToInsert.filter(p => !channels.find(c => c.url === p.url));
        if (newChannels.length > 0) {
          const { error } = await supabase.from('channels').upsert(newChannels);
          if (error) throw error;
        }
        const merged = [...channels, ...newChannels];
        onUpdateChannels(merged);
        showToast(`${newChannels.length} channel baru ditambahkan ke daftar!`);
      }
    } catch (err) {
      showToast(`Gagal menyimpan playlist: ${err.message}`, 'error');
    }
    
    setPlaylistLoading(false);
    setPlaylistPreview(null);
    setPlaylistInput('');
  };

  // --- Channel Checker ---
  const handleCheckChannels = async () => {
    setIsChecking(true);
    setChannelStatus({});
    const statuses = {};
    
    // Proses batching (5 channel sekaligus) agar tidak terlalu berat
    for (let i = 0; i < channels.length; i += 5) {
      const batch = channels.slice(i, i + 5);
      await Promise.all(batch.map(async (ch) => {
        setChannelStatus(prev => ({ ...prev, [ch.id]: 'loading' }));
        try {
          let defaultProxy = '/proxy';
          if (typeof window !== 'undefined') {
            const hostname = window.location.hostname;
            if (hostname.includes('vercel.app') || hostname.includes('vercel') || hostname.includes('project-iptv')) {
              defaultProxy = '/api/proxy';
            } else if (hostname.includes('netlify.app')) {
              defaultProxy = '/.netlify/functions/proxy';
            }
          }

          const proxy = import.meta.env.VITE_PROXY_URL || (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1' ? defaultProxy : 'http://localhost:8080');
          const cleanProxy = proxy.replace(/\/$/, '');

          // Daftar domain yang bermasalah jika di-proxy lewat Cloudflare (karena SSL 525/526, rate limit 429, atau blokir IP Cloudflare)
          const netlifyOverrideDomains = [
            'workers.dev',
            'indihometv.com',
            'streamlock.net',
            'jejumbc.com',
            'tvchosun.com',
            'chmbc.co.kr',
            'tjmbc.co.kr',
            'akamaized.net',
            'nowcdn.co.kr',
            'webcast.go.kr',
            'iscs.co.kr',
            'ctnd.com',
            'ktv.go.kr',
            'obs.co.kr',
            'streamo.cfd',
            'streamized.net',
            'semar.my.id'
          ];

          const shouldOverrideToNetlify = netlifyOverrideDomains.some(domain => ch.url.includes(domain)) && !ch.url.includes(cleanProxy);

          let activeProxy = cleanProxy;
          if (shouldOverrideToNetlify) {
            if (cleanProxy.includes('localhost') || cleanProxy.includes('127.0.0.1')) {
              activeProxy = cleanProxy;
            } else {
              const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://iptvku.netlify.app';
              const isVercel = currentOrigin.includes('vercel') || (typeof window !== 'undefined' && window.location.hostname !== 'iptvku.netlify.app');
              activeProxy = isVercel ? `${currentOrigin}/api/proxy` : 'https://iptvku.netlify.app/.netlify/functions/proxy';
            }
          }

          let url = ch.url;
          if (url.startsWith('http') && !url.includes('localhost') && !url.includes(activeProxy)) {
            url = `${activeProxy}/${url}`;
          }
          const hdrs = {};
          if (ch.headers?.referer) hdrs['X-Proxy-Referer'] = ch.headers.referer;
          if (ch.headers?.userAgent) hdrs['X-Proxy-User-Agent'] = ch.headers.userAgent;
          
          // Timeout 8 detik agar tidak stuck jika server mati total
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8000);

          // Request parsial untuk menghemat kuota data
          const res = await fetch(url, { 
            method: 'GET', 
            headers: { ...hdrs, 'Range': 'bytes=0-100' },
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);
          const isOnline = res.ok || res.status === 206;
          statuses[ch.id] = isOnline ? 'online' : 'offline';

          // Update active status ke database Supabase
          const newHeaders = { ...ch.headers, active: isOnline };
          await supabase.from('channels').update({ headers: newHeaders }).eq('id', ch.id.toString());
        } catch {
          statuses[ch.id] = 'offline';
          const newHeaders = { ...ch.headers, active: false };
          await supabase.from('channels').update({ headers: newHeaders }).eq('id', ch.id.toString());
        }
        setChannelStatus(prev => ({ ...prev, [ch.id]: statuses[ch.id] }));
      }));
    }

    // Update local state di akhir
    const updatedChannels = channels.map(c => {
      if (statuses[c.id]) {
        const isOnline = statuses[c.id] === 'online';
        return { ...c, headers: { ...c.headers, active: isOnline } };
      }
      return c;
    });
    onUpdateChannels(updatedChannels);

    setIsChecking(false);
    showToast('Pengecekan status selesai. Status publish pelanggan otomatis disesuaikan!');
  };

  const handleToggleChannelActive = async (ch) => {
    const currentActive = ch.headers?.active === true;
    const newHeaders = { ...ch.headers, active: !currentActive };
    try {
      const { error } = await supabase.from('channels').update({ headers: newHeaders }).eq('id', ch.id.toString());
      if (error) throw error;
      onUpdateChannels(channels.map(c => c.id === ch.id ? { ...c, headers: newHeaders } : c));
      showToast(`Channel "${ch.name}" ${!currentActive ? 'diaktifkan (terbit ke pelanggan)' : 'dinonaktifkan (draft)'}.`);
    } catch (err) {
      showToast(`Gagal mengubah status: ${err.message}`, 'error');
    }
  };

  const handleDeleteSelectedChannels = () => {
    if (selectedChannels.length === 0) return;
    setConfirm({
      message: `Hapus ${selectedChannels.length} channel terpilih? Tindakan ini tidak bisa dibatalkan.`,
      onConfirm: async () => {
        try {
          const stringIds = selectedChannels.map(id => id.toString());
          for (let i = 0; i < stringIds.length; i += 500) {
            const chunk = stringIds.slice(i, i + 500);
            const { error } = await supabase.from('channels').delete().in('id', chunk);
            if (error) throw error;
          }
          onUpdateChannels(channels.filter(c => !selectedChannels.includes(c.id)));
          setSelectedChannels([]);
          showToast(`${selectedChannels.length} channel terpilih berhasil dihapus.`);
        } catch (err) {
          showToast(`Gagal menghapus: ${err.message}`, 'error');
        }
        setConfirm(null);
      }
    });
  };

  const handleDeleteSelectedMovies = () => {
    if (selectedMovies.length === 0) return;
    setConfirm({
      message: `Hapus ${selectedMovies.length} film terpilih? Tindakan ini tidak bisa dibatalkan.`,
      onConfirm: async () => {
        try {
          const stringIds = selectedMovies.map(id => id.toString());
          for (let i = 0; i < stringIds.length; i += 500) {
            const chunk = stringIds.slice(i, i + 500);
            const { error } = await supabase.from('movies').delete().in('id', chunk);
            if (error) throw error;
          }
          onUpdateMovies(movies.filter(m => !selectedMovies.includes(m.id)));
          setSelectedMovies([]);
          showToast(`${selectedMovies.length} film terpilih berhasil dihapus.`);
        } catch (err) {
          showToast(`Gagal menghapus: ${err.message}`, 'error');
        }
        setConfirm(null);
      }
    });
  };

  const handleCleanDeadChannels = () => {
    const deadIds = Object.keys(channelStatus).filter(id => channelStatus[id] === 'offline').map(String);
    if (deadIds.length === 0) {
      showToast('Tidak ada channel mati (offline).', 'error');
      return;
    }
    setConfirm({
      message: `Hapus ${deadIds.length} channel mati? Tindakan ini tidak bisa dibatalkan.`,
      onConfirm: async () => {
        try {
          for (let i = 0; i < deadIds.length; i += 500) {
            const chunk = deadIds.slice(i, i + 500);
            const { error } = await supabase.from('channels').delete().in('id', chunk);
            if (error) throw error;
          }

          onUpdateChannels(channels.filter(c => !deadIds.includes(c.id.toString())));
          showToast(`${deadIds.length} channel mati berhasil dihapus.`);
          const newStatus = { ...channelStatus };
          deadIds.forEach(id => delete newStatus[id]);
          setChannelStatus(newStatus);
        } catch (err) {
          showToast(`Gagal menghapus channel: ${err.message}`, 'error');
        }
        setConfirm(null);
      }
    });
  };

  // --- Card style helpers ---
  const card = (extra = {}) => ({
    background: 'var(--bg-card)', border: '1px solid var(--bg-glass-border)',
    borderRadius: 'var(--radius-lg)', padding: 'var(--space-xl)', ...extra,
  });

  const statCard = (val, label, color) => (
    <div style={{ ...card(), textAlign: 'center', flex: 1 }}>
      <div style={{ fontSize: '2rem', fontWeight: 900, background: color, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>{val}</div>
      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: 4 }}>{label}</div>
    </div>
  );

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Sidebar */}
      <aside style={{ width: 220, background: 'var(--bg-sidebar)', borderRight: '1px solid var(--bg-glass-border)', display: 'flex', flexDirection: 'column', padding: 'var(--space-lg) 0', flexShrink: 0 }}>
        <div style={{ padding: '0 var(--space-lg)', marginBottom: 'var(--space-xl)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, background: 'var(--accent-gradient)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-glow)' }}>
              <span style={{ color: 'white', fontWeight: 900, fontSize: '0.85rem' }}>SV</span>
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>StreamVault</div>
              <div style={{ fontSize: '0.65rem', color: 'var(--accent-primary)', fontWeight: 600 }}>ADMIN PANEL</div>
            </div>
          </div>
        </div>

        <div style={{ padding: '0 var(--space-sm)', display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
          {TABS.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              id={`admin-tab-${id}`}
              className={`nav-item ${activeTab === id ? 'active' : ''}`}
              onClick={() => { setActiveTab(id); setChannelFormMode(null); setMovieFormMode(null); }}
            >
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}
        </div>

        <div style={{ padding: 'var(--space-md) var(--space-sm)', borderTop: '1px solid var(--bg-glass-border)' }}>
          <button
            id="btn-admin-logout"
            className="nav-item"
            onClick={onLogout}
            style={{ color: 'var(--accent-secondary)', width: '100%' }}
          >
            <LogOut size={18} />
            <span>Keluar Admin</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-2xl)' }}>

        {!hasSupabase && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 16px',
            marginBottom: 'var(--space-xl)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            color: '#ff6b6b',
            fontSize: '0.8rem',
            lineHeight: 1.4
          }}>
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <div>
              <strong>Mode Demo Terbatas:</strong> Database Supabase belum dikonfigurasi (Variabel environment <code>VITE_SUPABASE_URL</code> dan <code>VITE_SUPABASE_ANON_KEY</code> belum diset). Perubahan data Anda tidak akan disimpan ke database secara permanen.
            </div>
          </div>
        )}

        {/* DASHBOARD */}
        {activeTab === 'dashboard' && (
          <div>
            <h1 style={{ fontSize: '1.8rem', fontWeight: 900, marginBottom: 8 }}>Dashboard</h1>
            <p style={{ color: 'var(--text-muted)', marginBottom: 'var(--space-2xl)', fontSize: '0.875rem' }}>Kelola semua konten StreamVault dari sini.</p>

            <div style={{ display: 'flex', gap: 'var(--space-md)', marginBottom: 'var(--space-2xl)' }}>
              {statCard(channels.length, 'Total Channel', 'var(--accent-gradient)')}
              {statCard(movies.length, 'Total Film', 'var(--accent-gradient-2)')}
              {statCard(movies.filter(m => m.featured).length, 'Film Featured', 'linear-gradient(135deg, #ff8c42, #ff6b9d)')}
              {statCard(channels.filter(c => c.type === 'dash').length + movies.filter(m => m.type === 'dash').length, 'Konten DASH', 'linear-gradient(135deg, #00e5a0, #00d4ff)')}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
              <div style={card()}>
                <h3 style={{ marginBottom: 'var(--space-md)', display: 'flex', alignItems: 'center', gap: 8, fontSize: '1rem' }}>
                  <Radio size={16} style={{ color: 'var(--accent-primary)' }} /> Channel Terbaru
                </h3>
                {channels.slice(-5).reverse().map(ch => (
                  <div key={ch.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--bg-glass-border)' }}>
                    <div style={{ width: 32, height: 32, background: 'var(--bg-glass)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700, color: 'var(--accent-primary)', flexShrink: 0 }}>
                      {ch.logo ? <img src={ch.logo} style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 4 }} alt="" onError={e => { e.target.style.display='none'; }} /> : ch.name?.substring(0,2)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.83rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ch.name}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{ch.category} · {ch.type?.toUpperCase()}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div style={card()}>
                <h3 style={{ marginBottom: 'var(--space-md)', display: 'flex', alignItems: 'center', gap: 8, fontSize: '1rem' }}>
                  <Film size={16} style={{ color: 'var(--accent-secondary)' }} /> Film Terbaru
                </h3>
                {movies.slice(-5).reverse().map(mv => (
                  <div key={mv.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--bg-glass-border)' }}>
                    <div style={{ width: 32, height: 48, background: 'var(--bg-glass)', borderRadius: 4, overflow: 'hidden', flexShrink: 0 }}>
                      {mv.poster && <img src={mv.poster} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.83rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mv.title}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{mv.year} · {mv.type?.toUpperCase()} · {mv.quality}</div>
                    </div>
                    {mv.featured && <span style={{ fontSize: '0.6rem', background: 'rgba(108,99,255,0.2)', border: '1px solid rgba(108,99,255,0.3)', borderRadius: 4, padding: '2px 6px', color: 'var(--accent-primary)', fontWeight: 700, flexShrink: 0 }}>HERO</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* CHANNELS TAB */}
        {activeTab === 'channels' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-xl)' }}>
              <div>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 900 }}>Kelola Channel</h1>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: 4 }}>{channels.length} channel tersedia ({selectedChannels.length} terpilih)</p>
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                {selectedChannels.length > 0 && (
                  <button className="btn-secondary" style={{ color: '#ff7070', borderColor: 'rgba(255,80,80,0.4)', background: 'rgba(255,80,80,0.15)' }} onClick={handleDeleteSelectedChannels}>
                    <Trash2 size={16} /> Hapus Terpilih ({selectedChannels.length})
                  </button>
                )}
                {Object.values(channelStatus).includes('offline') && (
                  <button className="btn-secondary" style={{ color: '#ff7070', borderColor: 'rgba(255,80,80,0.3)', background: 'rgba(255,80,80,0.1)' }} onClick={handleCleanDeadChannels}>
                    <Trash2 size={16} /> Hapus yang Mati
                  </button>
                )}
                <button className="btn-secondary" onClick={handleCheckChannels} disabled={isChecking}>
                  {isChecking ? <div className="spinner" style={{ width: 14, height: 14 }} /> : <RefreshCw size={16} />}
                  Cek Status & Auto-Publish
                </button>
                {!channelFormMode && (
                  <button id="btn-add-channel" className="btn-primary" onClick={() => { setChannelFormMode('add'); setEditingChannel(null); }}>
                    <Plus size={16} /> Tambah Channel
                  </button>
                )}
              </div>
            </div>

            {/* Channel Form */}
            {channelFormMode && (
              <div style={{ ...card(), marginBottom: 'var(--space-xl)', borderColor: 'var(--accent-primary)' }}>
                <h3 style={{ marginBottom: 'var(--space-lg)', fontSize: '1rem', fontWeight: 700 }}>
                  {channelFormMode === 'add' ? '➕ Tambah Channel Baru' : '✏️ Edit Channel'}
                </h3>
                <ChannelForm
                  initial={editingChannel}
                  onSave={handleSaveChannel}
                  onCancel={() => { setChannelFormMode(null); setEditingChannel(null); }}
                />
              </div>
            )}

            {/* Channel Table */}
            <div style={card({ padding: 0, overflow: 'hidden' })}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--bg-glass-border)', background: 'var(--bg-glass)' }}>
                    <th style={{ padding: '12px 16px', width: 40, textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={channels.length > 0 && selectedChannels.length === channels.length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedChannels(channels.map(c => c.id));
                          } else {
                            setSelectedChannels([]);
                          }
                        }}
                        style={{ accentColor: 'var(--accent-primary)', width: 15, height: 15, cursor: 'pointer' }}
                      />
                    </th>
                    {['Status', 'Pelanggan', 'Logo', 'Nama Channel', 'Kategori', 'Tipe', 'DRM', 'URL Stream', 'Aksi'].map(h => (
                      <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {channels.length === 0 ? (
                    <tr><td colSpan={9} style={{ padding: 'var(--space-2xl)', textAlign: 'center', color: 'var(--text-muted)' }}>Belum ada channel. Tambahkan channel atau import playlist M3U.</td></tr>
                  ) : (
                    channels.map((ch, i) => (
                      <tr key={ch.id} style={{ borderBottom: '1px solid var(--bg-glass-border)', transition: 'background var(--transition-fast)' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-glass)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={selectedChannels.includes(ch.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedChannels(prev => [...prev, ch.id]);
                              } else {
                                setSelectedChannels(prev => prev.filter(id => id !== ch.id));
                              }
                            }}
                            style={{ accentColor: 'var(--accent-primary)', width: 15, height: 15, cursor: 'pointer' }}
                          />
                        </td>
                        <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                          {channelStatus[ch.id] === 'loading' ? (
                            <div className="spinner" style={{ width: 12, height: 12, margin: '0 auto' }} />
                          ) : channelStatus[ch.id] === 'online' ? (
                            <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--accent-green)', margin: '0 auto', boxShadow: '0 0 8px var(--accent-green)' }} title="Online" />
                          ) : channelStatus[ch.id] === 'offline' ? (
                            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff7070', margin: '0 auto', boxShadow: '0 0 8px #ff7070' }} title="Offline / Error" />
                          ) : (
                            <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--text-muted)', margin: '0 auto', opacity: 0.3 }} title="Belum di-cek" />
                          )}
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          <button
                            onClick={() => handleToggleChannelActive(ch)}
                            style={{
                              background: ch.headers?.active === true ? 'rgba(0,229,160,0.12)' : 'rgba(255,255,255,0.05)',
                              border: `1px solid ${ch.headers?.active === true ? 'rgba(0,229,160,0.35)' : 'rgba(255,255,255,0.15)'}`,
                              color: ch.headers?.active === true ? 'var(--accent-green)' : 'var(--text-muted)',
                              borderRadius: 20,
                              padding: '4px 10px',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              transition: 'all var(--transition-fast)'
                            }}
                            title={ch.headers?.active === true ? "Terlihat oleh pelanggan. Klik untuk sembunyikan." : "Disembunyikan dari pelanggan. Klik untuk aktifkan."}
                          >
                            {ch.headers?.active === true ? 'Aktif' : 'Draft'}
                          </button>
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          <div style={{ width: 36, height: 36, background: 'var(--bg-glass)', borderRadius: 6, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 700, color: 'var(--accent-primary)' }}>
                            {ch.logo ? <img src={ch.logo} style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 3 }} alt="" onError={e => e.target.style.display='none'} /> : ch.name?.substring(0,2)}
                          </div>
                        </td>
                        <td style={{ padding: '10px 16px', fontWeight: 600, fontSize: '0.875rem' }}>{ch.name}</td>
                        <td style={{ padding: '10px 16px' }}>
                          <span style={{ fontSize: '0.75rem', background: 'var(--bg-glass)', border: '1px solid var(--bg-glass-border)', borderRadius: 4, padding: '3px 8px', color: 'var(--text-secondary)' }}>{ch.category}</span>
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          <span className={`stream-type-badge ${ch.type}`} style={{ position: 'static', display: 'inline-block' }}>{ch.type?.toUpperCase()}</span>
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          {ch.drm?.type ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.62rem', fontWeight: 700, padding: '3px 7px', borderRadius: 'var(--radius-sm)', background: 'rgba(255,140,66,0.15)', border: '1px solid rgba(255,140,66,0.35)', color: '#ff8c42', textTransform: 'uppercase' }}>
                              <Shield size={9} />{ch.drm.type}
                            </span>
                          ) : (
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '10px 16px', maxWidth: 200 }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }} title={ch.url}>{ch.url}</span>
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button id={`btn-edit-channel-${ch.id}`} title="Edit" onClick={() => { setEditingChannel(ch); setChannelFormMode('edit'); }}
                              style={{ background: 'rgba(108,99,255,0.1)', border: '1px solid rgba(108,99,255,0.3)', borderRadius: 6, padding: '6px 8px', cursor: 'pointer', color: 'var(--accent-primary)', display: 'flex' }}>
                                <Pencil size={13} />
                            </button>
                            <button id={`btn-delete-channel-${ch.id}`} title="Hapus" onClick={() => handleDeleteChannel(ch.id)}
                              style={{ background: 'rgba(255,80,80,0.1)', border: '1px solid rgba(255,80,80,0.3)', borderRadius: 6, padding: '6px 8px', cursor: 'pointer', color: '#ff7070', display: 'flex' }}>
                                <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* MOVIES TAB */}
        {activeTab === 'movies' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-xl)' }}>
              <div>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 900 }}>Kelola Film & VOD</h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{movies.length} film tersedia ({selectedMovies.length} terpilih)</span>
                  {movies.length > 0 && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={movies.length > 0 && selectedMovies.length === movies.length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedMovies(movies.map(m => m.id));
                          } else {
                            setSelectedMovies([]);
                          }
                        }}
                        style={{ accentColor: 'var(--accent-secondary)', width: 14, height: 14, cursor: 'pointer' }}
                      />
                      Pilih Semua
                    </label>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                {selectedMovies.length > 0 && (
                  <button className="btn-secondary" style={{ color: '#ff7070', borderColor: 'rgba(255,80,80,0.4)', background: 'rgba(255,80,80,0.15)' }} onClick={handleDeleteSelectedMovies}>
                    <Trash2 size={16} /> Hapus Terpilih ({selectedMovies.length})
                  </button>
                )}
                {!movieFormMode && (
                  <button id="btn-add-movie" className="btn-primary" onClick={() => { setMovieFormMode('add'); setEditingMovie(null); }}>
                    <Plus size={16} /> Tambah Film
                  </button>
                )}
              </div>
            </div>

            {/* Movie Form */}
            {movieFormMode && (
              <div style={{ ...card(), marginBottom: 'var(--space-xl)', borderColor: 'rgba(255,107,157,0.5)' }}>
                <h3 style={{ marginBottom: 'var(--space-lg)', fontSize: '1rem', fontWeight: 700 }}>
                  {movieFormMode === 'add' ? '🎬 Tambah Film Baru' : '✏️ Edit Film'}
                </h3>
                <MovieForm
                  initial={editingMovie}
                  onSave={handleSaveMovie}
                  onCancel={() => { setMovieFormMode(null); setEditingMovie(null); }}
                />
              </div>
            )}

            {/* Movie Grid Preview */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 'var(--space-md)' }}>
              {movies.length === 0 ? (
                <div style={{ gridColumn: '1/-1', ...card(), textAlign: 'center', color: 'var(--text-muted)', padding: 'var(--space-3xl)' }}>
                  Belum ada film. Tambahkan film pertama Anda!
                </div>
              ) : (
                movies.map(mv => (
                  <div key={mv.id} style={{ ...card({ padding: 'var(--space-md)' }), display: 'flex', gap: 'var(--space-md)', alignItems: 'flex-start', transition: 'all var(--transition-normal)', position: 'relative' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,107,157,0.4)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--bg-glass-border)'; e.currentTarget.style.transform = 'none'; }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedMovies.includes(mv.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedMovies(prev => [...prev, mv.id]);
                        } else {
                          setSelectedMovies(prev => prev.filter(id => id !== mv.id));
                        }
                      }}
                      style={{ accentColor: 'var(--accent-secondary)', width: 15, height: 15, cursor: 'pointer', marginTop: 4, marginRight: 2, flexShrink: 0 }}
                    />
                    <div style={{ width: 56, height: 80, borderRadius: 6, overflow: 'hidden', flexShrink: 0, background: 'var(--bg-glass)' }}>
                      {mv.poster && <img src={mv.poster} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
                        <span style={{ fontWeight: 700, fontSize: '0.9rem', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }} title={mv.title}>{mv.title}</span>
                        {mv.featured && <span style={{ fontSize: '0.58rem', background: 'rgba(108,99,255,0.2)', border: '1px solid rgba(108,99,255,0.3)', borderRadius: 3, padding: '2px 5px', color: 'var(--accent-primary)', fontWeight: 700, flexShrink: 0 }}>HERO</span>}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4, marginBottom: 8 }}>
                        {mv.year} · {mv.quality} · <span className={`stream-type-badge ${mv.type}`} style={{ position: 'static', fontSize: '0.6rem', display: 'inline' }}>{mv.type?.toUpperCase()}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button id={`btn-edit-movie-${mv.id}`} className="btn-secondary" style={{ padding: '4px 10px', fontSize: '0.75rem', gap: 4 }}
                          onClick={() => { setEditingMovie(mv); setMovieFormMode('edit'); }}>
                          <Pencil size={11} /> Edit
                        </button>
                        <button id={`btn-delete-movie-${mv.id}`} onClick={() => handleDeleteMovie(mv.id)}
                          style={{ background: 'rgba(255,80,80,0.1)', border: '1px solid rgba(255,80,80,0.3)', borderRadius: 'var(--radius-sm)', padding: '4px 10px', cursor: 'pointer', color: '#ff7070', fontFamily: 'var(--font-family)', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Trash2 size={11} /> Hapus
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* PLAYLIST IMPORT TAB */}
        {activeTab === 'playlist' && (
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 900, marginBottom: 8 }}>Import Playlist M3U</h1>
            <p style={{ color: 'var(--text-muted)', marginBottom: 'var(--space-2xl)', fontSize: '0.875rem' }}>Import ratusan channel sekaligus dari URL playlist M3U/M3U8.</p>

            <div style={{ ...card(), marginBottom: 'var(--space-xl)', maxWidth: 700 }}>
              <h3 style={{ marginBottom: 'var(--space-lg)', fontSize: '1rem', fontWeight: 700 }}>
                <Link2 size={16} style={{ display: 'inline', marginRight: 8, color: 'var(--accent-tertiary)' }} />
                URL Playlist M3U
              </h3>
              <div style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)' }}>
                <input
                  id="admin-playlist-url"
                  type="url"
                  value={playlistInput}
                  onChange={e => { setPlaylistInput(e.target.value); setPlaylistPreview(null); }}
                  placeholder="https://example.com/playlist.m3u"
                  style={{
                    flex: 1, background: 'var(--bg-glass)', border: '1px solid var(--bg-glass-border)',
                    borderRadius: 'var(--radius-md)', padding: '12px 16px',
                    color: 'var(--text-primary)', fontFamily: 'var(--font-family)', fontSize: '0.9rem', outline: 'none',
                  }}
                  onKeyDown={e => e.key === 'Enter' && handleImportPlaylist()}
                />
                <button
                  id="btn-fetch-playlist"
                  className="btn-primary"
                  onClick={handleImportPlaylist}
                  disabled={playlistLoading || !playlistInput}
                  style={{ whiteSpace: 'nowrap', opacity: (playlistLoading || !playlistInput) ? 0.6 : 1 }}
                >
                  {playlistLoading ? <><div className="spinner" style={{ width: 14, height: 14 }} />Memuat...</> : <><Upload size={14} />Ambil Playlist</>}
                </button>
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                💡 Tips: Pastikan server mendukung CORS. Playlist akan di-parsing otomatis termasuk DRM (ClearKey & Widevine) dan header.
              </p>
            </div>

            {/* Paste M3U Text */}
            <div style={{ ...card(), marginBottom: 'var(--space-xl)' }}>
              <h3 style={{ marginBottom: 'var(--space-md)', fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                <List size={16} style={{ color: 'var(--accent-green)' }} />
                Atau Paste Teks M3U Langsung
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 'var(--space-md)' }}>
                Tempel isi file .m3u / .m3u8 langsung di sini. DRM (KODIPROP) dan header (EXTVLCOPT) akan otomatis dikenali.
              </p>
              <textarea
                id="admin-playlist-paste"
                placeholder={"#EXTM3U\n#EXTINF:-1 tvg-name=\"Channel\" tvg-logo=\"...\" group-title=\"Indonesia\",Channel Name\n#KODIPROP:inputstream.adaptive.license_type=clearkey\n#KODIPROP:inputstream.adaptive.license_key=kid_hex:key_hex\nhttps://example.com/stream.mpd"}
                rows={8}
                style={{
                  width: '100%', background: 'var(--bg-glass)', border: '1px solid var(--bg-glass-border)',
                  borderRadius: 'var(--radius-md)', padding: '12px 14px',
                  color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: '0.78rem',
                  outline: 'none', resize: 'vertical', lineHeight: 1.6,
                }}
                onChange={e => {
                  // parse on the fly as text changes
                  const val = e.target.value.trim();
                  if (!val) { setPlaylistPreview(null); return; }
                  try {
                    const { parseM3UText } = require('../utils/m3uParser');
                    const parsed = parseM3UText(val);
                    if (parsed.length > 0) setPlaylistPreview(parsed);
                  } catch { /* ignore */ }
                }}
              />
              <button
                id="btn-parse-paste"
                className="btn-primary"
                style={{ marginTop: 'var(--space-md)', fontSize: '0.85rem' }}
                onClick={() => {
                  const el = document.getElementById('admin-playlist-paste');
                  if (!el?.value.trim()) return;
                  import('../utils/m3uParser').then(({ parseM3UText }) => {
                    const parsed = parseM3UText(el.value.trim());
                    if (parsed.length > 0) {
                      setPlaylistPreview(parsed);
                      showToast(`${parsed.length} channel berhasil di-parsing dari teks!`);
                    } else {
                      showToast('Tidak ada channel valid ditemukan.', 'error');
                    }
                  });
                }}
              >
                <CheckCircle size={14} /> Parse & Preview
              </button>
            </div>

            {/* Playlist Preview */}
            {playlistPreview && (
              <div style={card()}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-lg)' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>
                    <CheckCircle size={16} style={{ display: 'inline', marginRight: 8, color: 'var(--accent-green)' }} />
                    Preview — {playlistPreview.length} channel ditemukan
                  </h3>
                  <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                    <button id="btn-merge-playlist" className="btn-secondary" style={{ fontSize: '0.8rem' }} onClick={() => handleApplyPlaylist('merge')}>
                      <Plus size={14} /> Gabungkan
                    </button>
                    <button id="btn-replace-playlist" className="btn-primary" style={{ fontSize: '0.8rem' }} onClick={() => handleApplyPlaylist('replace')}>
                      <Upload size={14} /> Ganti Semua
                    </button>
                  </div>
                </div>

                <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--bg-glass-border)', position: 'sticky', top: 0, background: 'var(--bg-card)' }}>
                        {['#', 'Nama', 'Kategori', 'Tipe', 'URL'].map(h => (
                          <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {playlistPreview.slice(0, 100).map((ch, i) => (
                        <tr key={ch.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <td style={{ padding: '7px 12px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{i + 1}</td>
                          <td style={{ padding: '7px 12px', fontSize: '0.8rem', fontWeight: 600 }}>{ch.name}</td>
                          <td style={{ padding: '7px 12px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{ch.category}</td>
                          <td style={{ padding: '7px 12px' }}>
                            <span className={`stream-type-badge ${ch.type}`} style={{ position: 'static', fontSize: '0.6rem', display: 'inline-block' }}>{ch.type?.toUpperCase()}</span>
                          </td>
                          <td style={{ padding: '7px 12px', maxWidth: 220 }}>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{ch.url}</span>
                          </td>
                        </tr>
                      ))}
                      {playlistPreview.length > 100 && (
                        <tr><td colSpan={5} style={{ padding: 10, textAlign: 'center', fontSize: '0.78rem', color: 'var(--text-muted)' }}>...dan {playlistPreview.length - 100} channel lainnya</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Confirm Dialog */}
      {confirm && <ConfirmDialog message={confirm.message} onConfirm={confirm.onConfirm} onCancel={() => setConfirm(null)} />}

      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
};

export default AdminPanel;
