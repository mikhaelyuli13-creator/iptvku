const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { ProxyAgent } = require('proxy-agent');

// Muat variabel env secara manual di Node
function loadEnv() {
    const envs = ['.env.local', '.env'];
    for (const file of envs) {
        const p = path.join(__dirname, file);
        if (fs.existsSync(p)) {
            const content = fs.readFileSync(p, 'utf8');
            content.split('\n').forEach(line => {
                const parts = line.split('=');
                if (parts.length >= 2) {
                    const key = parts[0].trim();
                    const val = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
                    process.env[key] = val;
                }
            });
            break;
        }
    }
}
loadEnv();

if (process.env.VITE_UPSTREAM_PROXY) {
    process.env.HTTP_PROXY = process.env.VITE_UPSTREAM_PROXY;
    process.env.HTTPS_PROXY = process.env.VITE_UPSTREAM_PROXY;
}
const agent = process.env.HTTP_PROXY ? new ProxyAgent() : undefined;

const app = express();
app.use(cors()); // Buka semua CORS untuk frontend

app.use('/', (req, res, next) => {
    // Abaikan favicon
    if (req.url === '/favicon.ico') return res.sendStatus(404);

    // Target URL dikirim via path, cth: http://localhost:8080/https://example.com/stream.mpd
    const targetUrlString = req.url.slice(1);
    
    if (!targetUrlString.startsWith('http')) {
        return res.status(400).send('Invalid URL. Format: http://localhost:8080/https://...');
    }

    try {
        const targetUrl = new URL(targetUrlString);
        
        createProxyMiddleware({
            target: targetUrl.origin,
            changeOrigin: true,
            secure: false, // Abaikan SSL error jika ada
            agent: agent,
            pathRewrite: () => {
                return targetUrl.pathname + targetUrl.search;
            },
            onProxyReq: (proxyReq, req, res) => {
                // Hapus origin localhost agar server tidak curiga
                proxyReq.removeHeader('origin');
                
                // --- INJEKSI CUSTOM HEADERS DARI SHAKA PLAYER ---
                
                // 1. Referer
                if (req.headers['x-proxy-referer']) {
                    proxyReq.setHeader('Referer', req.headers['x-proxy-referer']);
                } else if (targetUrlString.includes('visionplus.id')) {
                    // Fallback khusus untuk Vision+
                    proxyReq.setHeader('Referer', 'https://www.visionplus.id/');
                } else if (targetUrlString.includes('transvision.co.id')) {
                    proxyReq.setHeader('Referer', 'https://www.transvision.co.id/');
                } else if (targetUrlString.includes('indihometv.com')) {
                    proxyReq.setHeader('Referer', 'https://www.indihometv.com/');
                } else {
                    proxyReq.setHeader('Referer', targetUrl.origin + '/');
                }

                // 2. User-Agent
                if (req.headers['x-proxy-user-agent']) {
                    proxyReq.setHeader('User-Agent', req.headers['x-proxy-user-agent']);
                } else if (targetUrlString.toLowerCase().includes('semar.my.id')) {
                    // Autodeteksi untuk Semar IPTV
                    proxyReq.setHeader('User-Agent', 'OTT Navigator/1.6.9.4');
                } else {
                    // Fallback generic User-Agent agar tidak pakai curl/node
                    proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36');
                }

                // Hapus custom header agar tidak dikirim ke server target
                proxyReq.removeHeader('x-proxy-referer');
                proxyReq.removeHeader('x-proxy-user-agent');
            },
            onProxyRes: (proxyRes) => {
                // Hapus CORS header bawaan dari server asli agar tidak bentrok
                delete proxyRes.headers['access-control-allow-origin'];
                delete proxyRes.headers['access-control-allow-methods'];
                delete proxyRes.headers['access-control-allow-headers'];
                delete proxyRes.headers['access-control-expose-headers'];
                delete proxyRes.headers['access-control-allow-credentials'];

                // Pastikan CORS selalu diizinkan di response kita
                proxyRes.headers['Access-Control-Allow-Origin'] = '*';
                proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS, HEAD';
                proxyRes.headers['Access-Control-Allow-Headers'] = '*';
            },
            onError: (err, req, res) => {
                console.error('Proxy Error:', err.message);
                res.status(502).send('Proxy Error: ' + err.message);
            }
        })(req, res, next);
    } catch (err) {
        return res.status(400).send('Malformed URL');
    }
});

const port = 8080;
app.listen(port, '0.0.0.0', () => {
    console.log('==============================================');
    console.log('🛡️  Advanced CORS Proxy (Bypass 403 Forbidden)');
    console.log(`🟢 Berjalan di http://0.0.0.0:${port}`);
    console.log('==============================================');
});
