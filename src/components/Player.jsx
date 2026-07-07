import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, RefreshCw, Shield, ShieldOff } from 'lucide-react';

/**
 * Player component using Shaka Player.
 * Supports:
 *   - HLS (.m3u8)
 *   - MPEG-DASH (.mpd)
 *   - ClearKey DRM  (source.drm.type === 'clearkey')
 *   - Widevine DRM  (source.drm.type === 'widevine')
 *   - Custom HTTP headers (source.headers.referer / userAgent)
 */
const Player = ({ source, title }) => {
  const videoRef = useRef(null);
  const playerRef = useRef(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const getUrl = (src) => (typeof src === 'string' ? src : src?.url);
  const getType = (src) => {
    const url = getUrl(src);
    if (!url) return 'hls';
    if (src?.type === 'dash') return 'dash';
    
    // Cek ekstensi dari URL asli (meskipun sudah diproxy) secara cerdas
    try {
      const decodedUrl = decodeURIComponent(url);
      const urlObj = new URL(decodedUrl);
      const pathname = urlObj.pathname.toLowerCase();
      if (pathname.endsWith('.mpd') || pathname.includes('.mpd') || decodedUrl.includes('.mpd')) {
        return 'dash';
      }
    } catch (e) {
      if (url.includes('.mpd')) return 'dash';
    }
    return 'hls';
  };
  const getDrm = (src) => (typeof src === 'object' ? src?.drm : null);
  const getHeaders = (src) => (typeof src === 'object' ? src?.headers : null);

  const streamType = getType(source);
  const drm = getDrm(source);

  const destroyPlayer = async () => {
    if (playerRef.current) {
      try { await playerRef.current.destroy(); } catch { /* ignore */ }
      playerRef.current = null;
    }
  };

  const initPlayer = async (src) => {
    const url = getUrl(src);
    if (!url || !videoRef.current) return;

    await destroyPlayer();
    setError(null);
    setIsLoading(true);

    try {
      const shaka = await import('shaka-player');
      shaka.polyfill.installAll();

      if (!shaka.Player.isBrowserSupported()) {
        setError('Browser tidak mendukung streaming. Gunakan Chrome atau Firefox terbaru.');
        setIsLoading(false);
        return;
      }

      const player = new shaka.Player();
      await player.attach(videoRef.current);
      playerRef.current = player;

      // ---- Build DRM config ----
      const drmInfo = getDrm(src);
      const hdrs = getHeaders(src);
      const drmConfig = {};

      if (drmInfo?.type === 'clearkey') {
        if (drmInfo.clearKeys) {
          drmConfig.clearKeys = drmInfo.clearKeys;
        } else if (drmInfo.licenseServer) {
          drmConfig.servers = {
            'org.w3.clearkey': drmInfo.licenseServer,
          };
        }
      } else if (drmInfo?.type === 'widevine' && drmInfo.licenseServer) {
        // License URL akan diproxy otomatis oleh request filter di bawah
        drmConfig.servers = {
          'com.widevine.alpha': drmInfo.licenseServer,
        };
      } else if (drmInfo?.type && drmInfo.type !== 'none' && drmInfo.licenseServer) {
        // Fallback untuk tipe DRM lainnya yang memiliki licenseServer
        drmConfig.servers = {
          [drmInfo.type]: drmInfo.licenseServer,
        };
      }

      player.configure({
        streaming: {
          bufferingGoal: 30,
          rebufferingGoal: 2,
          retryParameters: {
            maxAttempts: 4,
            baseDelay: 1000,
            backoffFactor: 2,
            fuzzFactor: 0.5,
          },
        },
        drm: drmConfig,
      });

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
      // Hilangkan trailing slash dari proxy jika ada
      const cleanProxy = proxy.replace(/\/$/, '');

      // Deteksi jika channel adalah konten Korea
      const isKorea = source?.category?.toLowerCase().includes('korea') || 
                      source?.name?.toLowerCase().includes('korea') || 
                      source?.country === 'KR';

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

      const shouldOverrideToNetlify = netlifyOverrideDomains.some(domain => url.includes(domain)) && !url.includes(cleanProxy);

      let activeProxy = cleanProxy;
      if (isKorea) {
        if (cleanProxy.includes('/functions/proxy')) {
          activeProxy = cleanProxy.replace('/functions/proxy', '/functions/proxy-korea');
        } else if (cleanProxy.includes('/api/proxy')) {
          activeProxy = cleanProxy.replace('/api/proxy', '/api/proxy-korea');
        } else if (!cleanProxy.includes('localhost') && !cleanProxy.includes('127.0.0.1')) {
          // Fallback dinamis berdasarkan host saat ini
          const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://iptvku.netlify.app';
          const isVercel = currentOrigin.includes('vercel') || (typeof window !== 'undefined' && window.location.hostname !== 'iptvku.netlify.app');
          activeProxy = isVercel ? `${currentOrigin}/api/proxy-korea` : 'https://iptvku.netlify.app/.netlify/functions/proxy-korea';
        }
      } else if (shouldOverrideToNetlify) {
        // Alihkan target bermasalah ke Vercel/Netlify Proxy agar sertifikat SSL diabaikan
        if (cleanProxy.includes('localhost') || cleanProxy.includes('127.0.0.1')) {
          activeProxy = cleanProxy;
        } else {
          const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://iptvku.netlify.app';
          const isVercel = currentOrigin.includes('vercel') || (typeof window !== 'undefined' && window.location.hostname !== 'iptvku.netlify.app');
          activeProxy = isVercel ? `${currentOrigin}/api/proxy` : 'https://iptvku.netlify.app/.netlify/functions/proxy';
        }
      }

      // Simpan manifest URL asli sebagai basis untuk resolusi file segmen relatif
      const targetBaseUrl = url;

      // ---- Request filter: Proxy SEMUA request Shaka (manifest + segmen + DRM) ----
      player.getNetworkingEngine().registerRequestFilter((type, request) => {
        const originalUrl = request.uris[0];
        if (!originalUrl) return;

        // 1. Tangani Request Lisensi DRM (Widevine/ClearKey)
        // Jika request type adalah LICENSE (nilai konstan = 2), pasang custom DRM headers
        // Dan proxy melalui SAME-ORIGIN proxy (defaultProxy) untuk menghindari CORS!
        if (type === shaka.net.NetworkingEngine.RequestType.LICENSE) {
          if (hdrs) {
            for (const [key, value] of Object.entries(hdrs)) {
              // Abaikan referer dan userAgent asli karena diatur sebagai X-Proxy headers
              if (key !== 'referer' && key !== 'userAgent') {
                request.headers[key] = value;
              }
            }
            // Kirim custom proxy headers untuk bypass restriksi server lisensi DRM
            if (hdrs.referer) request.headers['X-Proxy-Referer'] = hdrs.referer;
            if (hdrs.userAgent) request.headers['X-Proxy-User-Agent'] = hdrs.userAgent;
          }

          // Selalu proxy request lisensi DRM melalui proxy lokal/same-origin untuk membypass CORS
          if (originalUrl.startsWith('http') && !originalUrl.includes('localhost') && !originalUrl.includes('127.0.0.1')) {
            let drmProxy = defaultProxy;
            if (defaultProxy.startsWith('/')) {
              drmProxy = window.location.origin + defaultProxy;
            }
            
            // HANYA proxy jika belum pernah di-proxy
            const isAlreadyProxied = originalUrl.includes('/api/proxy') || 
                                     originalUrl.includes('/.netlify/functions') || 
                                     originalUrl.includes('/proxy') || 
                                     originalUrl.includes(':8080');
                                     
            if (!isAlreadyProxied) {
              request.uris = [`${drmProxy}/${originalUrl}`];
            }
          }
          return;
        }

        // Tambahkan custom proxy headers jika ada (Hanya untuk manifest/segmen)
        if (hdrs?.referer) request.headers['X-Proxy-Referer'] = hdrs.referer;
        if (hdrs?.userAgent) request.headers['X-Proxy-User-Agent'] = hdrs.userAgent;

        const proxyUrlObj = new URL(activeProxy);
        const proxyOrigin = proxyUrlObj.origin;

        // Jika request mengarah ke root proxy karena resolusi browser (kehilangan konteks target)
        if (originalUrl.startsWith(proxyOrigin)) {
          const relativePath = originalUrl.slice(proxyOrigin.length);
          // Cek apakah relativePath tidak mengandung protokol target sama sekali (artinya ini file segmen pecah/relatif)
          if (!relativePath.includes('http:/') && !relativePath.includes('https:/') && !relativePath.includes('http://') && !relativePath.includes('https://')) {
            try {
              // Hilangkan leading slash agar teresolusi secara relatif terhadap targetBaseUrl
              const cleanRelPath = relativePath.replace(/^\//, '');
              const resolvedUrl = new URL(cleanRelPath, targetBaseUrl).href;
              request.uris = [`${activeProxy}/${resolvedUrl}`];
            } catch (e) {
              console.error('Failed to resolve relative url:', e);
            }
            return;
          }
        }

        // Proxy semua request yang belum melalui proxy
        if (originalUrl.startsWith('http') &&
            !originalUrl.includes('localhost') &&
            !originalUrl.includes('127.0.0.1') &&
            !originalUrl.includes(activeProxy)) {
          request.uris = [`${activeProxy}/${originalUrl}`];
        }
      });

      let playUrl = url;
      if (playUrl.startsWith('http') && !playUrl.includes('localhost') && !playUrl.includes(activeProxy)) {
        playUrl = `${activeProxy}/${playUrl}`;
      }

      player.addEventListener('error', (event) => {
        const code = event.detail?.code;
        if (code === 7000) {
          // Abaikan LOAD_INTERRUPTED karena itu adalah interupsi normal saat perpindahan channel cepat
          return;
        }
        console.error('Shaka error:', event.detail);
        let msg = `Error memutar stream (kode: ${code})`;
        if (code === 6007) msg = '🔒 Konten terenkripsi DRM — kunci tidak valid atau kedaluwarsa.';
        else if (code === 4015) msg = '⚠️ Format stream tidak didukung browser ini. Coba gunakan Google Chrome terbaru dan pastikan stream tidak memerlukan codec H.265/HEVC.';
        else if (code === 3016) msg = '⚠️ Format stream tidak didukung browser ini.';
        else if (code === 4012) msg = '🚫 Stream memerlukan autentikasi (401/403). URL mungkin sudah kedaluwarsa.';
        else if (code === 4014) msg = '🔒 Konten memerlukan DRM (Widevine/PlayReady). Gunakan Google Chrome untuk menontonnya.';
        else if (code === 1001) msg = '🌐 Tidak bisa mengambil stream. Domain tidak ditemukan — pastikan URL benar.';
        else if (code === 1002) msg = '🌐 Gagal mengambil stream. Periksa koneksi atau CORS server.';
        else if (code === 1003) msg = '⏱️ Request timeout — server terlalu lama merespons.';
        setError(msg);
        setIsLoading(false);
      });

      player.addEventListener('buffering', (e) => setIsLoading(e.buffering));

      await player.load(playUrl);
      setIsLoading(false);
      videoRef.current?.play().catch(() => {});

    } catch (err) {
      const code = err?.code;
      if (code === 7000) {
        // Abaikan LOAD_INTERRUPTED di block catch
        return;
      }
      console.error('Player init failed:', err);
      const msg = err?.message || '';
      let userMsg = 'Gagal memuat stream.';
      if (msg.includes('NAME_NOT_RESOLVED') || msg.includes('network') || msg.includes('fetch')) {
        userMsg = '🌐 Domain tidak ditemukan. Pastikan URL stream valid dan dapat diakses.';
      } else if (msg.includes('CORS') || msg.includes('cross-origin')) {
        userMsg = '🚫 CORS error — server tidak mengizinkan akses dari browser.';
      } else if (msg.toLowerCase().includes('drm') || msg.toLowerCase().includes('key')) {
        userMsg = '🔒 Error DRM — kunci tidak valid atau kedaluwarsa.';
      } else if (msg) {
        userMsg = `Gagal memuat stream: ${msg}`;
      }
      setError(userMsg);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const url = getUrl(source);
    if (url) {
      initPlayer(source);
    } else {
      destroyPlayer();
    }
    return () => { destroyPlayer(); };
  }, [getUrl(source)]);

  const handleRetry = () => initPlayer(source);

  const currentUrl = getUrl(source);

  // DRM badge info
  const drmLabel = drm?.type === 'clearkey' ? 'ClearKey' : drm?.type === 'widevine' ? 'Widevine' : null;

  return (
    <div className="player-section">
      <video
        ref={videoRef}
        controls
        playsInline
        autoPlay
        style={{ display: currentUrl ? 'block' : 'none' }}
      />

      {/* No stream selected */}
      {!currentUrl && (
        <div className="player-placeholder">
          <div className="player-placeholder-icon">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--accent-primary)' }}>
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          </div>
          <p className="player-placeholder-text">Pilih Channel atau Film</p>
          <p className="player-placeholder-sub">untuk mulai streaming</p>
        </div>
      )}

      {/* Loading */}
      {isLoading && currentUrl && (
        <div className="player-loading">
          <div className="spinner" />
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            {drm ? `Memuat stream (${drmLabel} DRM)...` : 'Memuat stream...'}
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="player-error">
          <AlertTriangle size={36} />
          <p style={{ textAlign: 'center', maxWidth: 380, fontSize: '0.875rem', lineHeight: 1.6 }}>{error}</p>
          <button className="btn-retry" onClick={handleRetry}>
            <RefreshCw size={14} style={{ display: 'inline', marginRight: 6 }} />
            Coba Lagi
          </button>
        </div>
      )}

      {/* Info Bar */}
      {currentUrl && !error && (
        <div className="player-info-bar">
          <span className="now-playing-label">Now Playing</span>
          <span style={{ color: 'rgba(255,255,255,0.3)' }}>•</span>
          <span className="now-playing-name">{title || 'Unknown'}</span>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            {drmLabel && (
              <span style={{
                display: 'flex', alignItems: 'center', gap: 4,
                fontSize: '0.6rem', fontWeight: 700, padding: '3px 8px',
                borderRadius: 'var(--radius-sm)', textTransform: 'uppercase',
                background: 'rgba(255,140,66,0.2)', border: '1px solid rgba(255,140,66,0.4)', color: '#ff8c42',
              }}>
                <Shield size={9} />
                {drmLabel}
              </span>
            )}
            <span className={`stream-type-badge ${streamType}`}>
              {streamType === 'dash' ? 'MPEG-DASH' : 'HLS'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default Player;
