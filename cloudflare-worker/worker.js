/**
 * Cloudflare Worker - CORS Proxy untuk IPTV
 * Dengan fitur M3U8 URL rewriting agar segmen video ikut terproxy
 * Gratis hingga 100.000 request/hari
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Handle preflight CORS (OPTIONS)
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }

    // Ambil URL target dari query parameter ?url=
    let targetUrlString = url.searchParams.get('url');

    if (!targetUrlString) {
      // Coba ambil dari pathname (path-based routing fallback)
      let path = url.pathname.slice(1); // hilangkan leading slash
      
      // Netlify atau browser mungkin memotong double slash menjadi single slash
      if (path.startsWith('http:/') && !path.startsWith('http://')) {
        path = path.replace('http:/', 'http://');
      } else if (path.startsWith('https:/') && !path.startsWith('https://')) {
        path = path.replace('https:/', 'https://');
      }
      
      if (path.startsWith('http://') || path.startsWith('https://')) {
        // Gabungkan kembali query parameter asli jika ada
        targetUrlString = path + url.search;
      }
    }

    if (!targetUrlString) {
      return new Response('Missing target URL. Usage: /?url=https://... or /https://...', {
        status: 400,
        headers: corsHeaders(),
      });
    }

    // Validasi URL
    let targetUrl;
    try {
      targetUrl = new URL(targetUrlString);
    } catch {
      return new Response('Invalid target URL.', { status: 400, headers: corsHeaders() });
    }

    // Bangun URL dasar proxy (tanpa path, hanya origin)
    const proxyBase = `${url.origin}`;

    // Bangun headers untuk request ke server target
    const outHeaders = new Headers();

    // Salin hampir semua header asli dari client (agar token, auth, DRM headers tetap utuh)
    for (const [key, value] of request.headers.entries()) {
      const lowerKey = key.toLowerCase();
      // Lewati header yang akan ditulis ulang atau spesifik Cloudflare
      if (
        lowerKey !== 'host' &&
        lowerKey !== 'origin' &&
        lowerKey !== 'referer' &&
        !lowerKey.startsWith('cf-') &&
        !lowerKey.startsWith('x-forwarded-')
      ) {
        outHeaders.set(key, value);
      }
    }

    // Baca body untuk POST/PUT (DRM license request menggunakan POST binary body)
    let reqBody = undefined;
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      try {
        reqBody = await request.arrayBuffer();
      } catch (_) {
        reqBody = undefined;
      }
    }

    // Custom headers dari aplikasi kita
    const proxyReferer = request.headers.get('x-proxy-referer');
    const proxyUserAgent = request.headers.get('x-proxy-user-agent');

    // Set Referer yang sesuai
    if (proxyReferer) {
      outHeaders.set('Referer', proxyReferer);
    } else {
      const lowerTarget = targetUrlString.toLowerCase();
      if (
        lowerTarget.includes('visionplus.id') ||
        lowerTarget.includes('rctiplus.com') ||
        lowerTarget.includes('cloudfront.net') ||
        lowerTarget.includes('/out/v1/')
      ) {
        outHeaders.set('Referer', 'https://www.visionplus.id/');
      } else if (lowerTarget.includes('transvision.co.id') || lowerTarget.includes('transvision')) {
        outHeaders.set('Referer', 'https://www.transvision.co.id/');
      } else if (lowerTarget.includes('indihometv.com') || lowerTarget.includes('indihometv')) {
        outHeaders.set('Referer', 'https://www.indihometv.com/');
      } else if (lowerTarget.includes('cnnindonesia.com')) {
        outHeaders.set('Referer', 'https://www.cnnindonesia.com/');
      } else if (lowerTarget.includes('cnbcindonesia.com')) {
        outHeaders.set('Referer', 'https://www.cnbcindonesia.com/');
      } else if (lowerTarget.includes('detik.com')) {
        outHeaders.set('Referer', 'https://www.detik.com/');
      } else if (lowerTarget.includes('dens.tv')) {
        outHeaders.set('Referer', 'http://www.dens.tv/');
      } else if (lowerTarget.includes('vidio.com')) {
        outHeaders.set('Referer', 'https://www.vidio.com/');
      } else {
        outHeaders.set('Referer', targetUrl.origin + '/');
      }
    }


    // Set User-Agent
    if (proxyUserAgent) {
      outHeaders.set('User-Agent', proxyUserAgent);
    } else {
      outHeaders.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
    }

    // Jangan kirim header origin ke server target
    outHeaders.delete('origin');

    try {
      const response = await fetch(targetUrl.href, {
        method: request.method,
        headers: outHeaders,
        body: reqBody,
        redirect: 'follow',
      });

      // Bangun response headers baru
      const resHeaders = new Headers();
      for (const [key, value] of response.headers.entries()) {
        if (!key.toLowerCase().startsWith('access-control-')) {
          resHeaders.set(key, value);
        }
      }

      // Tambahkan CORS headers
      const cors = corsHeaders();
      for (const [key, value] of Object.entries(cors)) {
        resHeaders.set(key, value);
      }

      const contentType = (resHeaders.get('content-type') || '').toLowerCase();
      const isM3U8 = contentType.includes('mpegurl') ||
                     targetUrl.pathname.endsWith('.m3u8') ||
                     targetUrl.pathname.endsWith('.m3u');
      const isMPD = contentType.includes('dash+xml') ||
                    targetUrl.pathname.endsWith('.mpd');

      // ---- Rewrite M3U8 agar semua segment URL ikut terproxy ----
      if (isM3U8 && response.ok) {
        const text = await response.text();
        const rewritten = rewriteM3U8(text, targetUrl.href, proxyBase);
        resHeaders.set('content-type', 'application/vnd.apple.mpegurl');
        resHeaders.delete('content-length'); // panjang berubah setelah rewriting
        return new Response(rewritten, {
          status: response.status,
          headers: resHeaders,
        });
      }

      // ---- Rewrite MPD (MPEG-DASH) ----
      if (isMPD && response.ok) {
        const text = await response.text();
        const rewritten = rewriteMPD(text, targetUrl.href, proxyBase);
        resHeaders.set('content-type', 'application/dash+xml');
        resHeaders.delete('content-length');
        return new Response(rewritten, {
          status: response.status,
          headers: resHeaders,
        });
      }

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: resHeaders,
      });

    } catch (err) {
      return new Response('Proxy Error: ' + err.message, {
        status: 502,
        headers: corsHeaders(),
      });
    }
  },
};

// ============================================================
// M3U8 Rewriter: tulis ulang semua URL segmen/sub-playlist
// ============================================================
function rewriteM3U8(content, baseUrl, proxyBase) {
  const base = new URL(baseUrl);
  const lines = content.split('\n');

  return lines.map(line => {
    const trimmed = line.trim();
    if (!trimmed) return line;

    // Proses baris direktif yang punya atribut URI="..."
    if (trimmed.startsWith('#')) {
      return line.replace(/URI="([^"]+)"/g, (match, uri) => {
        const abs = resolveUrl(uri, base);
        return `URI="${proxyBase}/?url=${encodeURIComponent(abs)}"`;
      });
    }

    // Baris URL (segmen .ts, sub-playlist .m3u8, dll)
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || !trimmed.startsWith('#')) {
      const abs = resolveUrl(trimmed, base);
      return `${proxyBase}/?url=${encodeURIComponent(abs)}`;
    }

    return line;
  }).join('\n');
}

// ============================================================
// MPD Rewriter: tulis ulang BaseURL dan SegmentURL
// ============================================================
function rewriteMPD(content, baseUrl, proxyBase) {
  const base = new URL(baseUrl);

  // Rewrite tag <BaseURL>...</BaseURL>
  content = content.replace(/<BaseURL>([^<]+)<\/BaseURL>/g, (match, url) => {
    const abs = resolveUrl(url.trim(), base);
    return `<BaseURL>${proxyBase}/?url=${encodeURIComponent(abs)}</BaseURL>`;
  });

  // Rewrite atribut media="..." dan initialization="..."
  content = content.replace(/\b(media|initialization)="([^"]+)"/g, (match, attr, url) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return `${attr}="${proxyBase}/?url=${encodeURIComponent(url)}"`;
    }
    return match;
  });

  return content;
}

// ============================================================
// URL resolver: jadikan URL relatif menjadi absolut
// ============================================================
function resolveUrl(url, base) {
  if (!url) return url;
  url = url.trim();
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('//')) return base.protocol + url;
  if (url.startsWith('/')) return base.origin + url;
  // Relative path
  const basePath = base.href.substring(0, base.href.lastIndexOf('/') + 1);
  return basePath + url;
}

// ============================================================
// CORS Headers
// ============================================================
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE, HEAD',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Expose-Headers': '*',
  };
}
