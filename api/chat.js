// Vercel Serverless Function — proxies Anthropic API to avoid browser CORS
// Hardened with: input validation, body size limit, timeout, basic in-memory rate limiting

// Simple in-memory rate limiter (resets per cold start; replace with Upstash/Redis for prod scale)
const RATE_LIMIT = { windowMs: 60_000, max: 30 };
const _hits = new Map();

function rateLimitOk(ip) {
  const now = Date.now();
  const arr = (_hits.get(ip) || []).filter(t => now - t < RATE_LIMIT.windowMs);
  if (arr.length >= RATE_LIMIT.max) return false;
  arr.push(now);
  _hits.set(ip, arr);
  /* Clean old entries every ~100 calls to avoid leak */
  if (_hits.size > 500) {
    for (const [k, v] of _hits) {
      if (!v.length || now - v[v.length-1] > RATE_LIMIT.windowMs) _hits.delete(k);
    }
  }
  return true;
}

export default async function handler(req, res) {
  // CORS — restrict to known origin in prod
  const allowedOrigins = ['https://e-tracker-expense.vercel.app', 'http://localhost:3000'];
  const origin = req.headers.origin || '';
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigins[0]);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Rate limit by IP
  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  if (!rateLimitOk(ip)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a moment.' });
  }

  // Validate API key configured
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Server misconfigured' });

  // Validate body
  const body = req.body;
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'Invalid request body' });
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return res.status(400).json({ error: 'messages array required' });
  }
  if (body.messages.length > 50) {
    return res.status(400).json({ error: 'Too many messages (max 50)' });
  }
  // Cap message length to prevent abuse
  const totalLen = body.messages.reduce((s, m) => s + (typeof m.content === 'string' ? m.content.length : 0), 0);
  if (totalLen > 100_000) {
    return res.status(400).json({ error: 'Request too large' });
  }

  // Cap max_tokens
  if (body.max_tokens && body.max_tokens > 4096) body.max_tokens = 4096;

  try {
    // Add timeout to upstream call (25s — under Vercel's 30s limit)
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25_000);

    let response;
    try {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(body),
        signal: ctrl.signal
      });
    } finally {
      clearTimeout(timer);
    }

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'Upstream timeout' });
    }
    return res.status(500).json({ error: 'Proxy error' });
  }
}
