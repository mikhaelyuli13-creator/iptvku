/**
 * Advanced M3U Parser
 * Supports:
 *  - EXTINF metadata (name, logo, group, tvg-id)
 *  - KODIPROP DRM (clearkey, widevine) with license_key and license_type
 *  - EXTVLCOPT headers (http-referrer, http-user-agent)
 *  - Multiple URL entries per block (picks first non-commented URL)
 *  - Commented-out fallback URLs (#https://...) are skipped
 */

function parseClearKey(licenseKey) {
  // Format: "kid_hex:key_hex" or "kid_hex:key_hex,kid2:key2"
  const keys = {};
  const pairs = licenseKey.split(',');
  for (const pair of pairs) {
    const [kid, key] = pair.trim().split(':');
    if (kid && key) {
      keys[kid.trim().toLowerCase()] = key.trim().toLowerCase();
    }
  }
  return Object.keys(keys).length > 0 ? keys : null;
}

function normalizeDrmType(raw) {
  if (!raw) return null;
  const r = raw.toLowerCase();
  if (r === 'clearkey' || r === 'org.w3.clearkey') return 'clearkey';
  if (r === 'com.widevine.alpha') return 'widevine';
  if (r === 'com.microsoft.playready') return 'playready';
  return r;
}

export function parseM3UText(text) {
  const lines = text.split('\n');
  const channels = [];
  let id = Date.now();

  // State for current block
  let current = null;
  let drmType = null;
  let drmLicenseKey = null;
  let drmLicenseServer = null;
  let headers = {};

  const resetBlock = () => {
    current = null;
    drmType = null;
    drmLicenseKey = null;
    drmLicenseServer = null;
    headers = {};
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip empty lines and the #EXTM3U header
    if (!line || line === '#EXTM3U') continue;

    // ---- EXTINF — start of a new channel block ----
    if (line.startsWith('#EXTINF')) {
      resetBlock();
      current = { id: id++, type: 'hls', drm: null, headers: {} };

      // tvg-name
      const nameTagMatch = line.match(/tvg-name="([^"]+)"/);
      const nameCommaMatch = line.match(/,(.+)$/);
      current.name = (nameTagMatch?.[1] || nameCommaMatch?.[1] || 'Unknown Channel').trim();

      // tvg-logo
      const logoMatch = line.match(/tvg-logo="([^"]+)"/);
      if (logoMatch) current.logo = logoMatch[1];

      // group-title (category)
      const groupMatch = line.match(/group-title="([^"]+)"/);
      current.category = groupMatch ? groupMatch[1] : 'Lainnya';

      // tvg-id
      const tvgIdMatch = line.match(/tvg-id="([^"]+)"/);
      if (tvgIdMatch) current.tvgId = tvgIdMatch[1];

      continue;
    }

    // ---- KODIPROP — DRM configuration ----
    if (line.startsWith('#KODIPROP:')) {
      const prop = line.replace('#KODIPROP:', '');
      const eqIdx = prop.indexOf('=');
      if (eqIdx === -1) continue;
      const key = prop.substring(0, eqIdx).trim();
      const value = prop.substring(eqIdx + 1).trim();

      if (key === 'inputstream.adaptive.license_type') {
        drmType = normalizeDrmType(value);
      } else if (key === 'inputstream.adaptive.license_key') {
        if (value.startsWith('http://') || value.startsWith('https://')) {
          drmLicenseServer = value;
        } else {
          drmLicenseKey = value;
        }
      }
      continue;
    }

    // ---- EXTVLCOPT — HTTP headers ----
    // Kadang format playlist dari user typo dan kehilangan `#` di depannya
    if (line.startsWith('#EXTVLCOPT:') || line.startsWith('EXTVLCOPT:')) {
      const opt = line.replace(/^#?EXTVLCOPT:/, '');
      const refMatch = opt.match(/http-referrer=(.+)/);
      if (refMatch) headers.referer = refMatch[1].trim();
      const uaMatch = opt.match(/http-user-agent=(.+)/);
      if (uaMatch) headers.userAgent = uaMatch[1].trim();
      continue;
    }

    // ---- EXTHTTP — Custom HTTP Headers (khususnya untuk DRM) ----
    if (line.startsWith('#EXTHTTP:')) {
      try {
        const jsonStr = line.substring(9).trim();
        const customHeaders = JSON.parse(jsonStr);
        // Gabungkan semua custom header (seperti dt-custom-data) ke objek headers
        headers = { ...headers, ...customHeaders };
      } catch (e) {
        console.error('Gagal parse #EXTHTTP:', e);
      }
      continue;
    }

    // ---- Skip other directive lines (#EXTVLCOPT--, dll) ----
    if (line.startsWith('#')) continue;

    // ---- URL line ----
    if ((line.startsWith('http://') || line.startsWith('https://')) && current) {
      // Only take the FIRST valid URL per block
      if (!current.url) {
        current.url = line;
        current.type = line.endsWith('.mpd') ? 'dash' : 'hls';

        // Apply DRM
        if (drmType) {
          if (drmType === 'clearkey' && drmLicenseKey) {
            current.drm = {
              type: 'clearkey',
              clearKeys: parseClearKey(drmLicenseKey),
            };
          } else if (drmType === 'widevine' && drmLicenseServer) {
            current.drm = {
              type: 'widevine',
              licenseServer: drmLicenseServer,
            };
          } else if (drmType === 'widevine') {
            current.drm = { type: 'widevine', licenseServer: null };
          }
        }

        // Apply headers
        if (Object.keys(headers).length > 0) {
          current.headers = { ...headers };
        }

        // Finalize and push
        channels.push({ ...current });
        // Don't resetBlock() yet — additional URL lines for same entry should be skipped
        // but we set current.url so subsequent URLs are ignored
      }
      // If current.url already set — extra URLs for same entry, skip
      continue;
    }

    // If we encounter a non-directive, non-URL line and have a pending current with no URL,
    // Just ignore it instead of resetting the block, because sometimes playlists have
    // garbage lines or typos (like empty lines with spaces) before the URL.
    if (current && !current.url && !line.startsWith('#') && !line.startsWith('http')) {
      // Do nothing, just skip the garbage line
      continue;
    }
  }

  return channels;
}

export async function fetchAndParseM3U(url) {
  let fetchUrl = url;
  
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
    'obs.co.kr'
  ];

  const shouldOverrideToNetlify = netlifyOverrideDomains.some(domain => url.includes(domain)) && !url.includes(cleanProxy);

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

  if (url.startsWith('http') && !url.includes('localhost') && !url.includes(activeProxy)) {
    fetchUrl = `${activeProxy}/${url}`;
  }

  const resp = await fetch(fetchUrl);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
  const text = await resp.text();
  return parseM3UText(text);
}
