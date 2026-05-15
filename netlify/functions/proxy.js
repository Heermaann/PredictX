// PredictX — Proxy for The Odds API with cache + rate limiting
const cache = {};
const CACHE_TTL = 15 * 60 * 1000;

// Simple in-memory rate limiter (per function instance)
const rateLimiter = {};
const RATE_LIMIT = 30;      // max requests per window
const RATE_WINDOW = 60000;  // 1 minute

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode:204, headers:CORS, body:'' };

  // Rate limiting by IP
  const ip = event.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  const now = Date.now();
  if (!rateLimiter[ip]) rateLimiter[ip] = { count:0, reset: now + RATE_WINDOW };
  if (now > rateLimiter[ip].reset) { rateLimiter[ip] = { count:0, reset: now + RATE_WINDOW }; }
  rateLimiter[ip].count++;
  if (rateLimiter[ip].count > RATE_LIMIT) {
    return {
      statusCode: 429,
      headers: { ...CORS, 'Content-Type':'application/json', 'Retry-After':'60' },
      body: JSON.stringify({ message:'Demasiadas solicitudes. Intenta en 1 minuto.' })
    };
  }

  const API_KEY = process.env.ODDS_API_KEY;
  if (!API_KEY) {
    return { statusCode: 500, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'ODDS_API_KEY no configurada en Netlify.' }) };
  }
  const p = event.queryStringParameters || {};
  const sport = p.sport;
  if (!sport) return { statusCode:400, headers:{...CORS,'Content-Type':'application/json'}, body:JSON.stringify({message:'sport requerido'}) };

  // Validate sport key format (alphanumeric and underscores only)
  if (!/^[a-z0-9_]+$/.test(sport)) {
    return { statusCode:400, headers:{...CORS,'Content-Type':'application/json'}, body:JSON.stringify({message:'sport inválido'}) };
  }

  // ── Event odds endpoint (for extra markets on a specific event) ──
  const eventId = p.eventId;
  if (eventId) {
    if (!/^[a-f0-9]+$/.test(eventId)) {
      return { statusCode:400, headers:{...CORS,'Content-Type':'application/json'}, body:JSON.stringify({message:'eventId inválido'}) };
    }
    const eventMarkets = p.markets || 'player_points,player_assists,player_rebounds';
    const ck = `event_${sport}_${eventId}_${eventMarkets}`;
    const cached = cache[ck];
    const age = cached ? now - cached.ts : Infinity;
    if (cached && age < CACHE_TTL) {
      return {
        statusCode: 200,
        headers: { ...CORS, 'Content-Type':'application/json', 'x-cache':'HIT', 'x-cache-ttl':String(Math.round((CACHE_TTL-age)/60000))+'min' },
        body: cached.body
      };
    }
    const url = `https://api.the-odds-api.com/v4/sports/${encodeURIComponent(sport)}/events/${encodeURIComponent(eventId)}/odds/?apiKey=${API_KEY}&regions=${p.regions||'eu,uk,us'}&markets=${eventMarkets}&oddsFormat=decimal&dateFormat=iso`;
    try {
      const r = await fetch(url, { headers:{'Accept':'application/json'} });
      const body = await r.text();
      const rem  = r.headers.get('x-requests-remaining') || '';
      if (r.ok) cache[ck] = { ts:now, body, rem };
      return { statusCode:r.status, headers:{...CORS,'Content-Type':'application/json','x-cache':'MISS','x-requests-remaining':rem}, body };
    } catch(err) {
      if (cached) return { statusCode:200, headers:{...CORS,'Content-Type':'application/json','x-cache':'STALE'}, body:cached.body };
      return { statusCode:502, headers:{...CORS,'Content-Type':'application/json'}, body:JSON.stringify({message:'Error proxy: '+err.message}) };
    }
  }

  // ── Standard event list endpoint ──
  const regions    = p.regions    || 'eu,uk,us';
  const markets    = p.markets    || 'h2h';
  const oddsFormat = p.oddsFormat || 'decimal';
  const forceRefresh = p.force === '1';
  const ck = `${sport}_${regions}_${markets}_${oddsFormat}`;
  const cached = cache[ck];
  const age = cached ? now - cached.ts : Infinity;
  const ttl = forceRefresh ? 0 : CACHE_TTL;

  if (cached && age < ttl) {
    const remaining = Math.max(0, Math.round((CACHE_TTL - age) / 60000));
    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type':'application/json', 'x-cache':'HIT', 'x-cache-age':String(Math.floor(age/1000)), 'x-cache-ttl':remaining+'min', 'x-requests-remaining':cached.rem },
      body: cached.body
    };
  }

  const url = `https://api.the-odds-api.com/v4/sports/${encodeURIComponent(sport)}/odds/?apiKey=${API_KEY}&regions=${regions}&markets=${markets}&oddsFormat=${oddsFormat}&dateFormat=iso`;

  try {
    const r    = await fetch(url, { headers:{'Accept':'application/json'} });
    const body = await r.text();
    const rem  = r.headers.get('x-requests-remaining') || '';
    const used = r.headers.get('x-requests-used') || '';

    // If the API rejects because some markets aren't supported for this league,
    // retry with h2h only (always supported) so the event list still loads.
    if (!r.ok && markets !== 'h2h') {
      let parsed = {};
      try { parsed = JSON.parse(body); } catch(_) {}
      const msg = (parsed.message || '').toLowerCase();
      if (msg.includes('not supported') || msg.includes('invalid market') || r.status === 422) {
        const fallbackUrl = `https://api.the-odds-api.com/v4/sports/${encodeURIComponent(sport)}/odds/?apiKey=${API_KEY}&regions=${regions}&markets=h2h&oddsFormat=${oddsFormat}&dateFormat=iso`;
        const r2   = await fetch(fallbackUrl, { headers:{'Accept':'application/json'} });
        const body2 = await r2.text();
        const rem2  = r2.headers.get('x-requests-remaining') || '';
        if (r2.ok) cache[ck] = { ts:now, body:body2, rem:rem2 };
        return { statusCode:r2.status, headers:{...CORS,'Content-Type':'application/json','x-cache':'MISS','x-requests-remaining':rem2,'x-markets-fallback':'h2h'}, body:body2 };
      }
    }

    if (r.ok) cache[ck] = { ts:now, body, rem };
    // Stale fallback
    return { statusCode:r.status, headers:{...CORS,'Content-Type':'application/json','x-cache':'MISS','x-requests-remaining':rem,'x-requests-used':used}, body };
  } catch(err) {
    if (cached) return { statusCode:200, headers:{...CORS,'Content-Type':'application/json','x-cache':'STALE'}, body:cached.body };
    return { statusCode:502, headers:{...CORS,'Content-Type':'application/json'}, body:JSON.stringify({message:'Error proxy: '+err.message}) };
  }
};
