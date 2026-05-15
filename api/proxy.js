// api/proxy.js — Vercel serverless function
const cache = {};
const CACHE_TTL = 15 * 60 * 1000;
const rateLimiter = {};
const RATE_LIMIT = 30;
const RATE_WINDOW = 60000;

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  // Rate limiting
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const now = Date.now();
  if (!rateLimiter[ip]) rateLimiter[ip] = { count: 0, reset: now + RATE_WINDOW };
  if (now > rateLimiter[ip].reset) rateLimiter[ip] = { count: 0, reset: now + RATE_WINDOW };
  rateLimiter[ip].count++;
  if (rateLimiter[ip].count > RATE_LIMIT) {
    return res.status(429).json({ message: 'Demasiadas solicitudes. Intenta en 1 minuto.' });
  }

  const API_KEY = process.env.ODDS_API_KEY;
  if (!API_KEY) return res.status(500).json({ message: 'ODDS_API_KEY no configurada.' });

  const p = req.query;
  const sport = p.sport;
  if (!sport) return res.status(400).json({ message: 'sport requerido' });
  if (!/^[a-z0-9_]+$/.test(sport)) return res.status(400).json({ message: 'sport inválido' });

  // Event odds endpoint
  const eventId = p.eventId;
  if (eventId) {
    if (!/^[a-f0-9]+$/.test(eventId)) return res.status(400).json({ message: 'eventId inválido' });
    const eventMarkets = p.markets || 'player_points,player_assists,player_rebounds';
    const ck = `event_${sport}_${eventId}_${eventMarkets}`;
    const cached = cache[ck];
    const age = cached ? now - cached.ts : Infinity;
    if (cached && age < CACHE_TTL) {
      res.setHeader('x-cache', 'HIT');
      return res.status(200).json(JSON.parse(cached.body));
    }
    const url = `https://api.the-odds-api.com/v4/sports/${encodeURIComponent(sport)}/events/${encodeURIComponent(eventId)}/odds/?apiKey=${API_KEY}&regions=${p.regions||'eu,uk,us'}&markets=${eventMarkets}&oddsFormat=decimal&dateFormat=iso`;
    try {
      const r = await fetch(url);
      const body = await r.text();
      if (r.ok) cache[ck] = { ts: now, body };
      res.setHeader('x-cache', 'MISS');
      res.status(r.status);
      return res.send(body);
    } catch(err) {
      if (cached) return res.status(200).json(JSON.parse(cached.body));
      return res.status(502).json({ message: 'Error proxy: ' + err.message });
    }
  }

  // Standard event list
  const regions = p.regions || 'eu,uk,us';
  const markets = p.markets || 'h2h';
  const oddsFormat = p.oddsFormat || 'decimal';
  const forceRefresh = p.force === '1';
  const ck = `${sport}_${regions}_${markets}_${oddsFormat}`;
  const cached = cache[ck];
  const age = cached ? now - cached.ts : Infinity;
  const ttl = forceRefresh ? 0 : CACHE_TTL;

  if (cached && age < ttl) {
    res.setHeader('x-cache', 'HIT');
    res.setHeader('x-requests-remaining', cached.rem || '');
    return res.status(200).json(JSON.parse(cached.body));
  }

  const url = `https://api.the-odds-api.com/v4/sports/${encodeURIComponent(sport)}/odds/?apiKey=${API_KEY}&regions=${regions}&markets=${markets}&oddsFormat=${oddsFormat}&dateFormat=iso`;

  try {
    const r = await fetch(url);
    const body = await r.text();
    const rem = r.headers.get('x-requests-remaining') || '';
    const used = r.headers.get('x-requests-used') || '';

    if (!r.ok && markets !== 'h2h') {
      let parsed = {};
      try { parsed = JSON.parse(body); } catch(_) {}
      const msg = (parsed.message || '').toLowerCase();
      if (msg.includes('not supported') || msg.includes('invalid market') || r.status === 422) {
        const fallbackUrl = `https://api.the-odds-api.com/v4/sports/${encodeURIComponent(sport)}/odds/?apiKey=${API_KEY}&regions=${regions}&markets=h2h&oddsFormat=${oddsFormat}&dateFormat=iso`;
        const r2 = await fetch(fallbackUrl);
        const body2 = await r2.text();
        const rem2 = r2.headers.get('x-requests-remaining') || '';
        if (r2.ok) cache[ck] = { ts: now, body: body2, rem: rem2 };
        res.setHeader('x-cache', 'MISS');
        res.setHeader('x-markets-fallback', 'h2h');
        res.status(r2.status);
        return res.send(body2);
      }
    }

    if (r.ok) cache[ck] = { ts: now, body, rem };
    res.setHeader('x-cache', 'MISS');
    res.setHeader('x-requests-remaining', rem);
    res.setHeader('x-requests-used', used);
    res.status(r.status);
    return res.send(body);
  } catch(err) {
    if (cached) return res.status(200).json(JSON.parse(cached.body));
    return res.status(502).json({ message: 'Error proxy: ' + err.message });
  }
}
