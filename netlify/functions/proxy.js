// netlify/functions/proxy.js
import https from 'https';
import http from 'http';
import { ProxyAgent } from 'proxy-agent';

const FORWARD_PROXY = process.env.FORWARD_PROXY_URL;
const agent = FORWARD_PROXY ? new ProxyAgent({
  getProxyForUrl: () => FORWARD_PROXY
}) : null;

export const handler = async (event) => {
  // Ambil URL target dari query parameter 'url'
  let targetUrlString = event.queryStringParameters.url;

  if (!targetUrlString) {
    // Coba ambil dari path (path-based routing)
    // event.path biasanya bernilai "/.netlify/functions/proxy/https://domain.com/path"
    const prefix = '/.netlify/functions/proxy/';
    if (event.path && event.path.startsWith(prefix)) {
      targetUrlString = event.path.slice(prefix.length);
    }
  }

  if (!targetUrlString) {
    return {
      statusCode: 400,
      body: 'Missing target URL. Format: /proxy/https://... or ?url=https://...',
    };
  }

  // Perbaiki jika double slash (//) tereduksi menjadi single slash (/) oleh router Netlify
  if (targetUrlString.startsWith('http:/') && !targetUrlString.startsWith('http://')) {
    targetUrlString = targetUrlString.replace('http:/', 'http://');
  } else if (targetUrlString.startsWith('https:/') && !targetUrlString.startsWith('https://')) {
    targetUrlString = targetUrlString.replace('https:/', 'https://');
  }

  if (!targetUrlString.startsWith('http')) {
    return {
      statusCode: 400,
      body: 'Invalid target URL. Format: /proxy/https://...',
    };
  }

  try {
    const targetUrl = new URL(targetUrlString);
    const clientHeaders = {};

    // Daftar header hop-by-hop dan internal Netlify yang harus dibersihkan
    const skipHeaders = [
      'host',
      'connection',
      'keep-alive',
      'proxy-authenticate',
      'proxy-authorization',
      'te',
      'trailers',
      'transfer-encoding',
      'upgrade',
      'content-length',
      'x-nf-client-connection-ip',
      'x-nf-request-id'
    ];

    // Salin header dari client ke target headers
    for (const [key, value] of Object.entries(event.headers)) {
      const lowerKey = key.toLowerCase();
      if (!skipHeaders.includes(lowerKey)) {
        clientHeaders[key] = value;
      }
    }

    // --- INJEKSI REFERER & USER-AGENT ---
    const proxyReferer = event.headers['x-proxy-referer'];
    const proxyUserAgent = event.headers['x-proxy-user-agent'];

    if (proxyReferer) {
      clientHeaders['Referer'] = proxyReferer;
    } else {
      const lowerTarget = targetUrlString.toLowerCase();
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
    } else {
      clientHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
    }

    // Bersihkan custom header internal kita
    delete clientHeaders['x-proxy-referer'];
    delete clientHeaders['x-proxy-user-agent'];

    // Lakukan request menggunakan ProxyAgent dan native http/https request
    const responseData = await new Promise((resolve, reject) => {
      const isHttps = targetUrl.protocol === 'https:';
      const requestLib = isHttps ? https : http;

      const reqOptions = {
        method: event.httpMethod,
        headers: clientHeaders,
        timeout: 10000,
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
        reject(new Error('Gateway Timeout (10s)'));
      });

      if (event.body) {
        req.write(event.isBase64Encoded ? Buffer.from(event.body, 'base64') : event.body);
      }
      req.end();
    });

    const responseHeaders = {};
    for (const [key, value] of Object.entries(responseData.headers)) {
      const lowerKey = key.toLowerCase();
      // Hapus header CORS bawaan dan Content-Encoding (biarkan Netlify yang menangani kompresi)
      if (!lowerKey.startsWith('access-control-') && lowerKey !== 'content-encoding') {
        responseHeaders[key] = value;
      }
    }

    // Set CORS headers
    responseHeaders['Access-Control-Allow-Origin'] = '*';
    responseHeaders['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS, PUT, DELETE';
    responseHeaders['Access-Control-Allow-Headers'] = '*';

    const contentType = responseHeaders['content-type'] || '';
    const isText = contentType.includes('text') || 
                   contentType.includes('json') || 
                   contentType.includes('xml') || 
                   contentType.includes('javascript') ||
                   contentType.includes('mpegurl'); // m3u8 playlist

    return {
      statusCode: responseData.statusCode,
      headers: responseHeaders,
      body: responseData.body.toString(isText ? 'utf8' : 'base64'),
      isBase64Encoded: !isText
    };

  } catch (error) {
    return {
      statusCode: 502,
      body: 'Proxy Error: ' + error.message,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'text/plain'
      }
    };
  }
};
