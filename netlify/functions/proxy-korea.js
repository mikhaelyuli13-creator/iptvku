// netlify/functions/proxy-korea.js
import https from 'https';
import http from 'http';
import { ProxyAgent } from 'proxy-agent';

// Global cache in serverless memory (warm starts reuse this)
let cachedProxy = null;
let lastScanTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 menit cache proxy

// Fetch proxy list gratis Korea dari Geonode & ProxyScrape
async function getKoreaProxies() {
  const list = [];
  
  // 1. Ambil dari ProxyScrape
  const scrapePromise = new Promise((resolve) => {
    https.get('https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=6000&country=KR&ssl=all&anonymity=all', (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        const parsed = data.split('\r\n').map(p => p.trim()).filter(Boolean);
        resolve(parsed);
      });
    }).on('error', () => resolve([]));
  });

  // 2. Ambil dari Geonode
  const geonodePromise = new Promise((resolve) => {
    https.get('https://proxylist.geonode.com/api/proxy-list?country=KR&protocols=http%2Chttps&limit=15&page=1&sort_by=lastChecked&sort_type=desc', (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const parsed = json.data.map(p => p.ip + ':' + p.port);
          resolve(parsed);
        } catch {
          resolve([]);
        }
      });
    }).on('error', () => resolve([]));
  });

  try {
    const [scrapeList, geonodeList] = await Promise.all([scrapePromise, geonodePromise]);
    // Gabungkan dan bersihkan duplikat
    const merged = Array.from(new Set([...scrapeList, ...geonodeList]));
    return merged;
  } catch {
    return [];
  }
}

// Tes apakah sebuah proxy aktif
function testProxy(proxyAddr) {
  return new Promise((resolve) => {
    const agent = new ProxyAgent({
      getProxyForUrl: () => 'http://' + proxyAddr
    });
    
    const start = Date.now();
    // Menggunakan IP checker target yang sangat stabil
    const req = https.request('https://api.ipify.org?format=json', {
      agent: agent,
      method: 'GET',
      timeout: 2500
    }, (res) => {
      if (res.statusCode === 200) {
        resolve({ proxy: proxyAddr, latency: Date.now() - start, ok: true });
      } else {
        resolve({ ok: false });
      }
    });

    req.on('error', () => resolve({ ok: false }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false });
    });
    req.end();
  });
}

// Cari proxy Korea aktif tercepat secara paralel (Promise.any)
async function findKoreaProxy() {
  // Cek cache dulu
  if (cachedProxy && (Date.now() - lastScanTime < CACHE_DURATION)) {
    // Verifikasi cepat apakah proxy cache masih hidup
    const check = await testProxy(cachedProxy);
    if (check.ok) {
      return cachedProxy;
    }
  }

  const list = await getKoreaProxies();
  if (list.length === 0) return null;

  // Batasi tes paralel maksimal 12 proxy teratas untuk efisiensi
  const candidates = list.slice(0, 12);
  const testPromises = candidates.map(async (addr) => {
    const check = await testProxy(addr);
    if (check.ok) return check.proxy;
    throw new Error('Offline');
  });

  try {
    // Promise.any akan mengambil proxy yang paling cepat membalas sukses
    const working = await Promise.any(testPromises);
    cachedProxy = working;
    lastScanTime = Date.now();
    return working;
  } catch {
    return null;
  }
}

export const handler = async (event) => {
  // Ambil URL target dari query parameter 'url' atau pathname
  let targetUrlString = event.queryStringParameters.url;

  if (!targetUrlString) {
    const prefix = '/.netlify/functions/proxy-korea/';
    if (event.path && event.path.startsWith(prefix)) {
      targetUrlString = event.path.slice(prefix.length);
    }
  }

  if (!targetUrlString) {
    return {
      statusCode: 400,
      body: 'Missing target URL. Format: /proxy-korea/https://... or ?url=https://...',
    };
  }

  // Perbaiki jika double slash tereduksi
  if (targetUrlString.startsWith('http:/') && !targetUrlString.startsWith('http://')) {
    targetUrlString = targetUrlString.replace('http:/', 'http://');
  } else if (targetUrlString.startsWith('https:/') && !targetUrlString.startsWith('https://')) {
    targetUrlString = targetUrlString.replace('https:/', 'https://');
  }

  if (!targetUrlString.startsWith('http')) {
    return {
      statusCode: 400,
      body: 'Invalid target URL.',
    };
  }

  try {
    const targetUrl = new URL(targetUrlString);
    const clientHeaders = {};

    // Filter headers hop-by-hop
    const skipHeaders = [
      'host', 'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
      'te', 'trailers', 'transfer-encoding', 'upgrade', 'content-length',
      'x-nf-client-connection-ip', 'x-nf-request-id'
    ];

    for (const [key, value] of Object.entries(event.headers)) {
      if (!skipHeaders.includes(key.toLowerCase())) {
        clientHeaders[key] = value;
      }
    }

    // Set Referer & User-Agent yang sesuai
    const proxyReferer = event.headers['x-proxy-referer'];
    const proxyUserAgent = event.headers['x-proxy-user-agent'];

    if (proxyReferer) {
      clientHeaders['Referer'] = proxyReferer;
    } else {
      clientHeaders['Referer'] = targetUrl.origin + '/';
    }

    if (proxyUserAgent) {
      clientHeaders['User-Agent'] = proxyUserAgent;
    } else if (targetUrlString.toLowerCase().includes('semar.my.id')) {
      clientHeaders['User-Agent'] = 'OTT Navigator/1.6.9.4';
    } else {
      clientHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
    }

    delete clientHeaders['x-proxy-referer'];
    delete clientHeaders['x-proxy-user-agent'];

    // Cari dan pasang proxy Korea gratis
    const proxyKR = await findKoreaProxy();
    const agent = proxyKR ? new ProxyAgent({ getProxyForUrl: () => 'http://' + proxyKR }) : null;

    if (proxyKR) {
      console.log('Routing request through Korea proxy:', proxyKR);
    } else {
      console.log('No working Korea proxy found, falling back to direct connection.');
    }

    // Lakukan request
    const responseData = await new Promise((resolve, reject) => {
      const isHttps = targetUrl.protocol === 'https:';
      const requestLib = isHttps ? https : http;

      const reqOptions = {
        method: event.httpMethod,
        headers: clientHeaders,
        timeout: 12000,
        rejectUnauthorized: false
      };

      if (agent) {
        reqOptions.agent = agent;
      }

      const req = requestLib.request(targetUrl.href, reqOptions, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks)
          });
        });
      });

      req.on('error', (err) => reject(err));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Gateway Timeout (12s)'));
      });

      if (event.body) {
        req.write(event.isBase64Encoded ? Buffer.from(event.body, 'base64') : event.body);
      }
      req.end();
    });

    const responseHeaders = {};
    for (const [key, value] of Object.entries(responseData.headers)) {
      const lowerKey = key.toLowerCase();
      if (!lowerKey.startsWith('access-control-') && lowerKey !== 'content-encoding') {
        responseHeaders[key] = value;
      }
    }

    responseHeaders['Access-Control-Allow-Origin'] = '*';
    responseHeaders['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS, PUT, DELETE';
    responseHeaders['Access-Control-Allow-Headers'] = '*';
    if (proxyKR) {
      responseHeaders['X-Proxied-By-KR-IP'] = proxyKR;
    }

    const contentType = responseHeaders['content-type'] || '';
    const isText = contentType.includes('text') || 
                   contentType.includes('json') || 
                   contentType.includes('xml') || 
                   contentType.includes('javascript') ||
                   contentType.includes('mpegurl');

    return {
      statusCode: responseData.statusCode,
      headers: responseHeaders,
      body: responseData.body.toString(isText ? 'utf8' : 'base64'),
      isBase64Encoded: !isText
    };

  } catch (error) {
    return {
      statusCode: 502,
      body: 'Proxy Korea Error: ' + error.message,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'text/plain'
      }
    };
  }
};
