// api/sync-events.js — Lee config desde Supabase, escribe logs
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).end();

  // ── Auth: verify CRON_SECRET or Vercel cron header ──
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authHeader = req.headers['authorization'] || '';
    const isVercelCron = req.headers['x-vercel-cron'] === '1';
    const hasValidToken = authHeader === `Bearer ${secret}`;
    if (!isVercelCron && !hasValidToken) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

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

  // ── Check if syncing a single sport ──
  const singleSport = req.query?.sport || (req.body?.sport);

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

  const allSports  = config.sports_active || [];
  const sports     = singleSport ? [singleSport] : allSports;
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
        // For each row, check if it has overrides or is paused/frozen
        // We need to fetch existing events to preserve overrides
        const ids = rows.map(r => r.id);
        const existingRes = await fetch(
          `${SB_URL}/rest/v1/api_events?id=in.(${ids.map(id=>`"${id}"`).join(',')})&select=id,sync_paused,odds_frozen,overrides,original_data`,
          { headers: sbHeaders }
        );
        const existing = existingRes.ok ? await existingRes.json() : [];
        const existingMap = {};
        (existing||[]).forEach(e => { existingMap[e.id] = e; });

        const rowsToUpsert = rows.map(row => {
          const prev = existingMap[row.id];
          if (!prev) {
            // New event — save original data
            return { ...row, original_data: { odd_1: row.odd_1, odd_x: row.odd_x, odd_2: row.odd_2, total_line: row.total_line, total_over: row.total_over, total_under: row.total_under } };
          }
          // Skip entirely if sync is paused for this event
          if (prev.sync_paused) return null;

          const overrides = prev.overrides || {};
          const result = { ...row };

          // Preserve overridden fields
          if (overrides.home_team)  result.home_team  = overrides.home_team;
          if (overrides.away_team)  result.away_team  = overrides.away_team;
          if (overrides.league)     result.league     = overrides.league;
          if (overrides.commence_time) result.commence_time = overrides.commence_time;

          // If odds are frozen, keep existing odds
          if (prev.odds_frozen) {
            result.odd_1        = overrides.odd_1        ?? prev.odd_1;
            result.odd_x        = overrides.odd_x        ?? prev.odd_x;
            result.odd_2        = overrides.odd_2        ?? prev.odd_2;
            result.total_line   = overrides.total_line   ?? prev.total_line;
            result.total_over   = overrides.total_over   ?? prev.total_over;
            result.total_under  = overrides.total_under  ?? prev.total_under;
          }

          // Update original_data with latest API values (even if overridden)
          result.original_data = {
            odd_1: row.odd_1, odd_x: row.odd_x, odd_2: row.odd_2,
            total_line: row.total_line, total_over: row.total_over, total_under: row.total_under,
            home_team: row.home_team, away_team: row.away_team,
            league: row.league, commence_time: row.commence_time,
          };

          return result;
        }).filter(Boolean);

        if (rowsToUpsert.length) {
          await fetch(`${SB_URL}/rest/v1/api_events`, {
            method: 'POST',
            headers: { ...sbHeaders, 'Prefer': 'resolution=merge-duplicates' },
            body: JSON.stringify(rowsToUpsert),
          });
        }
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
