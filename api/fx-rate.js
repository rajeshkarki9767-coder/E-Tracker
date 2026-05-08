// Vercel Serverless Function — proxies ExchangeRate-API to keep the API key secret
// Returns conversion rates from a base currency (e.g., NPR) to all supported currencies

// In-memory cache (per cold start) so we don't hit upstream on every page load
// Vercel cold-starts every ~10 min; 24h cache resets aren't critical since
// the upstream itself only updates once a day.
const _cache = new Map();
const CACHE_MS = 6 * 60 * 60 * 1000; // 6 hours

// Simple per-IP rate limit (resets per cold start)
const RATE_LIMIT = { windowMs: 60_000, max: 30 };
const _hits = new Map();

function rateLimitOk(ip) {
  const now = Date.now();
  const arr = (_hits.get(ip) || []).filter(t => now - t < RATE_LIMIT.windowMs);
  if (arr.length >= RATE_LIMIT.max) return false;
  arr.push(now);
  _hits.set(ip, arr);
  if (_hits.size > 500) {
    for (const [k, v] of _hits) {
      if (!v.length || now - v[v.length - 1] > RATE_LIMIT.windowMs) _hits.delete(k);
    }
  }
  return true;
}

export default async function handler(req, res) {
  // CORS — restrict to known origins
  const allowedOrigins = ['https://e-tracker-expense.vercel.app', 'http://localhost:3000'];
  const origin = req.headers.origin || '';
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigins[0]);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Rate limit
  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  if (!rateLimitOk(ip)) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  // Validate API key configured
  const apiKey = process.env.EXCHANGE_RATE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server misconfigured: missing EXCHANGE_RATE_API_KEY env var' });
  }

  // Validate base currency from query string
  const base = (req.query.base || 'USD').toUpperCase();
  if (!/^[A-Z]{3}$/.test(base)) {
    return res.status(400).json({ error: 'Invalid base currency code' });
  }

  // Check cache
  const cacheKey = base;
  const cached = _cache.get(cacheKey);
  if (cached && (Date.now() - cached.cachedAt) < CACHE_MS) {
    res.setHeader('Cache-Control', 'public, max-age=21600'); // 6h browser cache too
    return res.status(200).json({ ...cached.data, fromCache: true });
  }

  // Fetch from upstream
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);

    let response;
    try {
      response = await fetch(
        `https://v6.exchangerate-api.com/v6/${apiKey}/latest/${base}`,
        { signal: ctrl.signal }
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      // If upstream errored but we have a stale cache, return it
      if (cached) {
        return res.status(200).json({ ...cached.data, stale: true });
      }
      return res.status(502).json({ error: 'Upstream error' });
    }

    const data = await response.json();

    if (data.result !== 'success') {
      if (cached) return res.status(200).json({ ...cached.data, stale: true });
      return res.status(502).json({ error: 'Upstream returned failure' });
    }

    const result = {
      base: data.base_code,
      rates: data.conversion_rates,
      lastUpdate: data.time_last_update_utc
    };

    _cache.set(cacheKey, { data: result, cachedAt: Date.now() });
    res.setHeader('Cache-Control', 'public, max-age=21600');
    return res.status(200).json(result);

  } catch (err) {
    if (cached) {
      return res.status(200).json({ ..._cache.get(cacheKey).data, stale: true });
    }
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'Upstream timeout' });
    }
    return res.status(500).json({ error: 'Proxy error' });
  }
}
