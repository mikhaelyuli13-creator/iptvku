// api/proxy-korea.js
import https from 'https';
import http from 'http';
import { ProxyAgent } from 'proxy-agent';

// Global cache in serverless memory (warm starts reuse this)
let cachedProxy = null;
let lastScanTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 menit cache proxy

// Fetch proxy list gratis Korea dari Geonode & ProxyScrape
async function getKoreaProxies() {
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
  if (cachedProxy && (Date.now() - lastScanTime < CACHE_DURATION)) {
    const check = await testProxy(cachedProxy);
    if (check.ok) {
      return cachedProxy;
    }
  }

  const list = await getKoreaProxies();
  if (list.length === 0) return null;

  const candidates = list.slice(0, 12);
  const testPromises = candidates.map(async (addr) => {
    const check = await testProxy(addr);
    if (check.ok) return check.proxy;
    throw new Error('Offline');
  });

  try {
    const working = await Promise.any(testPromises);
    cachedProxy = working;
    lastScanTime = Date.now();
    return working;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  let targetUrlString = req.query.url;

  if (!targetUrlString) {
    const prefix = '/api/proxy-korea/';
    const decodedUrl = decodeURIComponent(req.url || '');
    if (decodedUrl.startsWith(prefix)) {
      targetUrlString = decodedUrl.slice(prefix.length);
    }
  }

  if (!targetUrlString) {
    return res.status(400).send('Missing target URL.');
  }

  if (targetUrlString.startsWith('http:/') && !targetUrlString.startsWith('http://')) {
    targetUrlString = targetUrlString.replace('http:/', 'http://');
  } else if (targetUrlString.startsWith('https:/') && !targetUrlString.startsWith('https://')) {
    targetUrlString = targetUrlString.replace('https:/', 'https://');
  }

  if (!targetUrlString.startsWith('http')) {
    return res.status(400).send('Invalid target URL.');
  }

  try {
    const targetUrl = new URL(targetUrlString);
    const clientHeaders = {};

    const skipHeaders = [
      'host', 'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
      'te', 'trailers', 'transfer-encoding', 'upgrade', 'content-length'
    ];

    for (const [key, value] of Object.entries(req.headers)) {
      if (!skipHeaders.includes(key.toLowerCase())) {
        clientHeaders[key] = value;
      }
    }

    const proxyReferer = req.headers['x-proxy-referer'];
    const proxyUserAgent = req.headers['x-proxy-user-agent'];

    if (proxyReferer) {
      clientHeaders['Referer'] = proxyReferer;
    } else {
      clientHeaders['Referer'] = targetUrl.origin + '/';
    }

    if (proxyUserAgent) {
      clientHeaders['User-Agent'] = proxyUserAgent;
    } else {
      clientHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
    }

    delete clientHeaders['x-proxy-referer'];
    delete clientHeaders['x-proxy-user-agent'];

    const proxyKR = await findKoreaProxy();
    const agent = proxyKR ? new ProxyAgent({ getProxyForUrl: () => 'http://' + proxyKR }) : null;

    if (proxyKR) {
      res.setHeader('X-Proxied-By-KR-IP', proxyKR);
    }

    // Baca request body jika ada
    let bodyData = null;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      bodyData = await new Promise((resolve) => {
        const chunks = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', () => resolve(Buffer.concat(chunks)));
      });
    }

    const responseData = await new Promise((resolve, reject) => {
      const isHttps = targetUrl.protocol === 'https:';
      const requestLib = isHttps ? https : http;

      const reqOptions = {
        method: req.method,
        headers: clientHeaders,
        timeout: 12000,
        rejectUnauthorized: false
      };

      if (agent) {
        reqOptions.agent = agent;
      }

      const outReq = requestLib.request(targetUrl.href, reqOptions, (res) => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks)
        }));
      });

      outReq.on('error', err => reject(err));
      outReq.on('timeout', () => {
        outReq.destroy();
        reject(new Error('Gateway Timeout (12s)'));
      });

      if (bodyData) {
        outReq.write(bodyData);
      }
      outReq.end();
    });

    for (const [key, value] of Object.entries(responseData.headers)) {
      const lowerKey = key.toLowerCase();
      if (!lowerKey.startsWith('access-control-') && lowerKey !== 'content-encoding') {
        res.setHeader(key, value);
      }
    }

    res.status(responseData.statusCode).send(responseData.body);

  } catch (error) {
    res.status(502).send('Proxy Korea Error: ' + error.message);
  }
}
