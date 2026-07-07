// api/proxy.js
import https from 'https';
import http from 'http';
import { ProxyAgent } from 'proxy-agent';

const FORWARD_PROXY = process.env.FORWARD_PROXY_URL;
const agent = FORWARD_PROXY ? new ProxyAgent({
  getProxyForUrl: () => FORWARD_PROXY
}) : null;

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Get target URL from query parameter or path rewrite
  let targetUrlString = req.query.url;

  if (!targetUrlString) {
    const prefix = '/api/proxy/';
    const decodedUrl = decodeURIComponent(req.url || '');
    if (decodedUrl.startsWith(prefix)) {
      targetUrlString = decodedUrl.slice(prefix.length);
    }
  }

  if (!targetUrlString) {
    return res.status(400).send('Missing target URL.');
  }

  // Perbaiki double slash jika tereduksi
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

    // --- INJEKSI REFERER & USER-AGENT ---
    const proxyReferer = req.headers['x-proxy-referer'];
    const proxyUserAgent = req.headers['x-proxy-user-agent'];

    const lowerTarget = targetUrlString.toLowerCase();
    if (lowerTarget.includes('streamized.net')) {
      // OVERRIDE MUTLAK: Jika targetnya adalah streamized.net (termasuk DRM), selalu gunakan watch.streamized.net
      // Ini mencegah error 403 jika X-Proxy-Referer mengirim referer lain (misal: visionplus.id dari playlist)
      clientHeaders['Referer'] = 'https://watch.streamized.net/';
    } else if (proxyReferer) {
      clientHeaders['Referer'] = proxyReferer;
    } else {
      if (
        lowerTarget.includes('visionplus.id') ||
        lowerTarget.includes('rctiplus.com') ||
        lowerTarget.includes('cloudfront.net') ||
        lowerTarget.includes('/out/v1/') ||
        lowerTarget.includes('workers.dev') ||
        lowerTarget.includes('sedotcw3')
      ) {
        clientHeaders['Referer'] = 'https://www.visionplus.id/';
      } else if (lowerTarget.includes('transvision.co.id') || lowerTarget.includes('transvision')) {
        clientHeaders['Referer'] = 'https://www.transvision.co.id/';
      } else if (lowerTarget.includes('indihometv.com') || lowerTarget.includes('indihometv')) {
        clientHeaders['Referer'] = 'https://www.indihometv.com/';
      } else if (lowerTarget.includes('cnnindonesia.com')) {
        clientHeaders['Referer'] = 'https://www.cnnindonesia.com/';
      } else if (lowerTarget.includes('cnbcindonesia.com')) {
        clientHeaders['Referer'] = 'https://www.cnbcindonesia.com/';
      } else if (lowerTarget.includes('detik.com')) {
        clientHeaders['Referer'] = 'https://www.detik.com/';
      } else if (lowerTarget.includes('dens.tv')) {
        clientHeaders['Referer'] = 'http://www.dens.tv/';
      } else if (lowerTarget.includes('vidio.com')) {
        clientHeaders['Referer'] = 'https://www.vidio.com/';
      } else {
        clientHeaders['Referer'] = targetUrl.origin + '/';
      }
    }

    if (proxyUserAgent) {
      clientHeaders['User-Agent'] = proxyUserAgent;
    } else if (targetUrlString.toLowerCase().includes('semar.my.id') || targetUrlString.toLowerCase().includes('sepak7042.workers.dev')) {
      clientHeaders['User-Agent'] = 'OTT Navigator/1.6.9.4';
    } else {
      clientHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
    }

    delete clientHeaders['x-proxy-referer'];
    delete clientHeaders['x-proxy-user-agent'];

    // Baca request body (untuk DRM Widevine licensing POST)
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
        timeout: 10000,
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
        reject(new Error('Gateway Timeout (10s)'));
      });

      if (bodyData) {
        outReq.write(bodyData);
      }
      outReq.end();
    });

    // Salin response headers
    for (const [key, value] of Object.entries(responseData.headers)) {
      const lowerKey = key.toLowerCase();
      if (!lowerKey.startsWith('access-control-') && lowerKey !== 'content-encoding') {
        res.setHeader(key, value);
      }
    }

    res.status(responseData.statusCode).send(responseData.body);

  } catch (error) {
    res.status(502).send('Proxy Error: ' + error.message);
  }
}

// Menonaktifkan bodyParser agar request stream biner POST (lisensi DRM) dapat dibaca secara utuh oleh req.on('data')
export const config = {
  api: {
    bodyParser: false,
  },
};
