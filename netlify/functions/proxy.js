// netlify/functions/proxy.js
export const handler = async (event) => {
  // Ambil URL target dari query parameter 'url'
  let targetUrlString = event.queryStringParameters.url;

  if (!targetUrlString) {
    return {
      statusCode: 400,
      body: 'Missing target URL. Format: /proxy/https://...',
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
    const headers = { ...event.headers };

    // Hapus header host bawaan agar tidak mengganggu server target
    delete headers.host;
    delete headers.connection;

    // --- INJEKSI CUSTOM HEADERS (Bypass Referer & User-Agent) ---
    const proxyReferer = event.headers['x-proxy-referer'];
    const proxyUserAgent = event.headers['x-proxy-user-agent'];

    if (proxyReferer) {
      headers['Referer'] = proxyReferer;
    } else if (targetUrlString.includes('visionplus.id')) {
      headers['Referer'] = 'https://www.visionplus.id/';
    } else if (targetUrlString.includes('transvision.co.id')) {
      headers['Referer'] = 'https://www.transvision.co.id/';
    } else if (targetUrlString.includes('indihometv.com')) {
      headers['Referer'] = 'https://www.indihometv.com/';
    } else {
      headers['Referer'] = targetUrl.origin + '/';
    }

    if (proxyUserAgent) {
      headers['User-Agent'] = proxyUserAgent;
    } else {
      headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36';
    }

    // Bersihkan custom headers kita agar tidak terkirim ke server tujuan
    delete headers['x-proxy-referer'];
    delete headers['x-proxy-user-agent'];

    const response = await fetch(targetUrl.href, {
      method: event.httpMethod,
      headers: headers,
      body: event.httpMethod !== 'GET' && event.httpMethod !== 'HEAD' ? event.body : undefined,
    });

    const responseHeaders = {};
    response.headers.forEach((value, key) => {
      // Hapus CORS header bawaan agar tidak bentrok
      if (!key.toLowerCase().startsWith('access-control-')) {
        responseHeaders[key] = value;
      }
    });

    // Pastikan CORS selalu diaktifkan
    responseHeaders['Access-Control-Allow-Origin'] = '*';
    responseHeaders['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS, PUT, DELETE';
    responseHeaders['Access-Control-Allow-Headers'] = '*';

    // Baca response data
    const buffer = await response.arrayBuffer();
    const isText = (responseHeaders['content-type'] || '').includes('text') || (responseHeaders['content-type'] || '').includes('json') || (responseHeaders['content-type'] || '').includes('xml') || (responseHeaders['content-type'] || '').includes('javascript');
    
    return {
      statusCode: response.status,
      headers: responseHeaders,
      body: Buffer.from(buffer).toString(isText ? 'utf8' : 'base64'),
      isBase64Encoded: !isText,
    };
  } catch (error) {
    return {
      statusCode: 502,
      body: 'Proxy Error: ' + error.message,
    };
  }
};
