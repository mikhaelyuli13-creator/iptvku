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
  let mimetype = null;
  let manifestType = null;
  let headers = {};

  const resetBlock = () => {
    current = null;
    drmType = null;
    drmLicenseKey = null;
    drmLicenseServer = null;
    mimetype = null;
    manifestType = null;
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

      // tvg-logo (otomatis upgrade ke https untuk menghindari mixed content)
      const logoMatch = line.match(/tvg-logo="([^"]+)"/);
      if (logoMatch) {
        let logoUrl = logoMatch[1];
        if (logoUrl.startsWith('http://')) {
          logoUrl = logoUrl.replace('http://', 'https://');
        }
        current.logo = logoUrl;
      }

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
      } else if (key === 'mimetype') {
        mimetype = value.toLowerCase();
      } else if (key === 'inputstream.adaptive.manifest_type') {
        manifestType = value.toLowerCase();
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

        // Cek tipe stream (dash/hls) secara cerdas
        let isDash = false;
        try {
          const urlObj = new URL(line);
          const pathname = urlObj.pathname.toLowerCase();
          isDash = pathname.endsWith('.mpd') || 
                   pathname.includes('.mpd') || 
                   mimetype === 'application/dash+xml' || 
                   manifestType === 'dash';
        } catch (e) {
          isDash = line.includes('.mpd');
        }
        current.type = isDash ? 'dash' : 'hls';

        // Apply DRM
        if (drmType) {
          if (drmType === 'clearkey') {
            if (drmLicenseServer) {
              current.drm = {
                type: 'clearkey',
                licenseServer: drmLicenseServer,
              };
            } else if (drmLicenseKey) {
              current.drm = {
                type: 'clearkey',
                clearKeys: parseClearKey(drmLicenseKey),
              };
            } else {
              current.drm = { type: 'clearkey', licenseServer: null };
            }
          } else if (drmType === 'widevine') {
            current.drm = {
              type: 'widevine',
              licenseServer: drmLicenseServer || null,
            };
          } else {
            current.drm = {
              type: drmType,
              licenseServer: drmLicenseServer || null,
            };
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
    'obs.co.kr',
    'streamo.cfd',
    'streamized.net',
    'semar.my.id'
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

  const isSameOrigin = typeof window !== 'undefined' && url.includes(window.location.origin);

  if (url.startsWith('http') && !url.includes('localhost') && !url.includes(activeProxy) && !isSameOrigin) {
    fetchUrl = `${activeProxy}/${url}`;
  }

  const resp = await fetch(fetchUrl);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
  const text = await resp.text();
  
  // Deteksi format playlist JSON (seperti Semar IPTV)
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsedJson = JSON.parse(text);
      if (parsedJson.channels || parsedJson.categories) {
        return parseJsonPlaylist(parsedJson);
      }
    } catch (e) {
      console.error('Gagal parse JSON playlist:', e);
    }
  }

  return parseM3UText(text);
}

function parseJsonPlaylist(json) {
  const channels = [];
  let id = Date.now();

  const decodeBase64 = (str) => {
    if (!str) return '';
    try {
      // Decode unicode/utf-8 base64 di browser
      return decodeURIComponent(escape(atob(str)));
    } catch {
      try {
        return atob(str);
      } catch {
        return str;
      }
    }
  };

  const isBase64Encoded = json.provider?.base64 === '*';
  const rawCategories = json.categories || {};
  const categories = {};

  // Decode categories
  for (const [key, cat] of Object.entries(rawCategories)) {
    const decodedName = isBase64Encoded ? decodeBase64(cat.name) : cat.name;
    categories[key] = decodedName;
  }

  const rawChannels = json.channels || [];
  for (const ch of rawChannels) {
    const name = isBase64Encoded ? decodeBase64(ch.name) : ch.name;
    const url = isBase64Encoded ? decodeBase64(ch.url) : ch.url;
    if (!name || !url) continue;

    const catKey = isBase64Encoded ? decodeBase64(ch.category) : ch.category;
    const category = categories[catKey] || 'Lainnya';
    let logo = isBase64Encoded ? decodeBase64(ch.icon) : ch.icon;
    if (logo && logo.startsWith('http://')) {
      logo = logo.replace('http://', 'https://');
    }

    const drmType = isBase64Encoded ? decodeBase64(ch.drm_type) : ch.drm_type;
    const drmKey = isBase64Encoded ? decodeBase64(ch.drm_key) : ch.drm_key;
    const drmUrl = isBase64Encoded ? decodeBase64(ch.drm_url) : ch.drm_url;

    const userAgent = isBase64Encoded ? decodeBase64(ch.user_agent) : ch.user_agent;
    const referrer = isBase64Encoded ? decodeBase64(ch.referrer) : ch.referrer;

    // Tentukan jenis stream (dash/hls)
    const urlLower = url.toLowerCase();
    const sourceFormat = ch.source_format ? (isBase64Encoded ? decodeBase64(ch.source_format) : ch.source_format) : '';
    const isDash = urlLower.includes('.mpd') || 
                   sourceFormat === 'dash' || 
                   sourceFormat === 'mpd' || 
                   (drmType && drmType !== 'none');

    const channel = {
      id: id++,
      name,
      url,
      logo: logo || null,
      category,
      type: isDash ? 'dash' : 'hls',
      headers: {}
    };

    // Pasang DRM
    if (drmType && drmType !== 'none') {
      const normalizedDrm = normalizeDrmType(drmType);
      if (normalizedDrm === 'clearkey') {
        if (drmUrl) {
          channel.drm = {
            type: 'clearkey',
            licenseServer: drmUrl,
          };
        } else if (drmKey) {
          channel.drm = {
            type: 'clearkey',
            clearKeys: parseClearKey(drmKey),
          };
        } else {
          channel.drm = { type: 'clearkey', licenseServer: null };
        }
      } else if (normalizedDrm === 'widevine') {
        channel.drm = {
          type: 'widevine',
          licenseServer: drmUrl || drmKey || null,
        };
      } else {
        channel.drm = {
          type: normalizedDrm,
          licenseServer: drmUrl || drmKey || null,
        };
      }
    }

    // Pasang headers
    if (referrer) channel.headers.referer = referrer;
    if (userAgent) channel.headers.userAgent = userAgent;

    // Tambahkan custom headers tambahan jika ada
    if (ch.headers) {
      let extraHeaders = ch.headers;
      if (typeof extraHeaders === 'string' && isBase64Encoded) {
        try {
          extraHeaders = JSON.parse(decodeBase64(extraHeaders));
        } catch {
          extraHeaders = {};
        }
      }
      if (typeof extraHeaders === 'object') {
        for (const [k, v] of Object.entries(extraHeaders)) {
          const val = isBase64Encoded ? decodeBase64(v) : v;
          channel.headers[k] = val;
        }
      }
    }

    if (Object.keys(channel.headers).length === 0) {
      delete channel.headers;
    }

    channels.push(channel);
  }

  return channels;
}
