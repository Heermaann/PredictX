// api/sync-events.js — Lee config desde Supabase, escribe logs
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).end();

  const ODDS_KEY = process.env.ODDS_API_KEY;
  const SB_URL   = 'https://ghgkvtdhuqfpigbtzefz.supabase.co';
  const SB_KEY   = process.env.SUPABASE_SERVICE_KEY;

  if (!SB_KEY) return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY not configured' });

  const sbHeaders = {
    'apikey': SB_KEY,
    'Authorization': `Bearer ${SB_KEY}`,
    'Content-Type': 'application/json',
  };

  const startTime = Date.now();

  // ── Load config from Supabase ──
  let config = null;
  try {
    const cfgRes = await fetch(`${SB_URL}/rest/v1/api_config?id=eq.1&select=*`, { headers: sbHeaders });
    const cfgData = await cfgRes.json();
    config = cfgData[0];
  } catch(e) {
    return res.status(500).json({ error: 'Cannot load API config: ' + e.message });
  }

  if (!config) return res.status(500).json({ error: 'API config not found. Run SQL migration.' });
  if (!config.active) return res.status(200).json({ ok: false, message: 'Sincronización pausada por el administrador.' });

  const apiKey = config.api_key || ODDS_KEY;
  if (!apiKey) return res.status(500).json({ error: 'No API key configured.' });

  const sports    = config.sports_active || [];
  const bookmakers = (config.bookmakers || []).join(',');
  const regions   = (config.regions || ['eu']).join(',');
  const rateLimitMs = config.rate_limit_ms || 3000;

  // ── Check daily limit ──
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const creditsRes = await fetch(`${SB_URL}/rest/v1/api_credits_log?logged_at=gte.${todayStart.toISOString()}&select=credits_used`, { headers: sbHeaders });
  const creditsToday = await creditsRes.json();
  const usedToday = (creditsToday||[]).reduce((a,c) => a + (c.credits_used||1), 0);

  if (usedToday >= config.daily_limit) {
    return res.status(200).json({ ok: false, message: `Límite diario alcanzado: ${usedToday}/${config.daily_limit} créditos usados.` });
  }

  // ── Sync each sport ──
  let totalSynced = 0, totalCredits = 0;
  const sportsLog = {};
  const errors = [];

  for (const sport of sports) {
    // Rate limit protection
    if (sports.indexOf(sport) > 0) {
      await new Promise(r => setTimeout(r, rateLimitMs));
    }

    try {
      const r = await fetch(
        `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${apiKey}&regions=${regions}&markets=h2h,totals&oddsFormat=decimal${bookmakers ? '&bookmakers=' + bookmakers : ''}`,
        { signal: AbortSignal.timeout(10000) }
      );

      const remaining = parseInt(r.headers.get('x-requests-remaining') || '0');
      const used      = parseInt(r.headers.get('x-requests-used') || '1');

      if (!r.ok) {
        sportsLog[sport] = { status: 'error', reason: r.status };
        errors.push(`${sport}: HTTP ${r.status}`);
        continue;
      }

      const events = await r.json();

      // Process and upsert
      const rows = events.map(e => {
        const bks = e.bookmakers || [];
        let best1=null, bestX=null, best2=null, bestOver=null, bestUnder=null, totalLine=null;
        bks.forEach(bk => {
          bk.markets?.forEach(mkt => {
            if (mkt.key==='h2h') mkt.outcomes?.forEach(o => {
              if (o.name===e.home_team && (!best1||o.price>best1)) best1=o.price;
              if (o.name===e.away_team && (!best2||o.price>best2)) best2=o.price;
              if (o.name==='Draw'      && (!bestX||o.price>bestX)) bestX=o.price;
            });
            if (mkt.key==='totals') mkt.outcomes?.forEach(o => {
              if (o.name==='Over'  && (!bestOver||o.price>bestOver))  { bestOver=o.price; totalLine=o.point; }
              if (o.name==='Under' && (!bestUnder||o.price>bestUnder)) bestUnder=o.price;
            });
          });
        });
        return {
          id: e.id, sport_key: sport, sport_title: e.sport_title||sport,
          league: e.sport_title||sport, home_team: e.home_team, away_team: e.away_team,
          commence_time: e.commence_time, status: 'upcoming',
          odd_1: best1, odd_x: bestX, odd_2: best2,
          total_line: totalLine, total_over: bestOver, total_under: bestUnder,
          last_updated_at: new Date().toISOString(),
        };
      });

      if (rows.length) {
        await fetch(`${SB_URL}/rest/v1/api_events`, {
          method: 'POST',
          headers: { ...sbHeaders, 'Prefer': 'resolution=merge-duplicates' },
          body: JSON.stringify(rows),
        });
      }

      // Log credits per sport
      await fetch(`${SB_URL}/rest/v1/api_credits_log`, {
        method: 'POST',
        headers: sbHeaders,
        body: JSON.stringify({ sport_key: sport, credits_used: 1, events_count: rows.length, remaining }),
      });

      totalSynced += rows.length;
      totalCredits++;
      sportsLog[sport] = { status: 'ok', count: rows.length, remaining };

    } catch(err) {
      sportsLog[sport] = { status: 'error', reason: err.message };
      errors.push(`${sport}: ${err.message}`);
    }
  }

  const duration = Date.now() - startTime;
  const status = errors.length === 0 ? 'success' : errors.length < sports.length ? 'partial' : 'error';

  // ── Write sync log ──
  await fetch(`${SB_URL}/rest/v1/api_sync_logs`, {
    method: 'POST',
    headers: sbHeaders,
    body: JSON.stringify({
      status, total_events: totalSynced, credits_used: totalCredits,
      sports_log: sportsLog, error_msg: errors.length ? errors.join('; ') : null,
      duration_ms: duration,
    }),
  });

  // ── Update last_sync_at in config ──
  await fetch(`${SB_URL}/rest/v1/api_config?id=eq.1`, {
    method: 'PATCH',
    headers: sbHeaders,
    body: JSON.stringify({ last_sync_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
  });

  return res.status(200).json({ ok: true, synced: totalSynced, credits: totalCredits, status, duration_ms: duration, sports: sportsLog });
}
