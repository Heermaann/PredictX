// api/sync-events.js — Sin dependencias externas, usa fetch nativo

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).end('Method not allowed');
  }

  const ODDS_KEY  = process.env.ODDS_API_KEY;
  const SB_URL    = 'https://ghgkvtdhuqfpigbtzefz.supabase.co';
  const SB_KEY    = process.env.SUPABASE_SERVICE_KEY;

  if (!ODDS_KEY) return res.status(500).json({ error: 'ODDS_API_KEY not configured' });
  if (!SB_KEY)   return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY not configured' });

  const SPORTS = [
    'soccer_epl','soccer_spain_la_liga','soccer_uefa_champs_league',
    'soccer_germany_bundesliga','soccer_italy_serie_a','soccer_france_ligue_one',
    'soccer_usa_mls','soccer_brazil_campeonato','soccer_conmebol_copa_libertadores',
    'basketball_nba','basketball_euroleague',
    'americanfootball_nfl','baseball_mlb','icehockey_nhl','mma_mixed_martial_arts',
  ];

  const upsertToSupabase = async (rows) => {
    const r = await fetch(`${SB_URL}/rest/v1/api_events`, {
      method: 'POST',
      headers: {
        'apikey': SB_KEY,
        'Authorization': `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify(rows),
    });
    return r.ok;
  };

  let totalSynced = 0;
  const results = [];

  for (const sport of SPORTS) {
    try {
      const r = await fetch(
        `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${ODDS_KEY}&regions=eu&markets=h2h,totals&oddsFormat=decimal`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (!r.ok) { results.push({ sport, status: 'skip', reason: r.status }); continue; }
      const events = await r.json();
      if (!events.length) { results.push({ sport, status: 'empty' }); continue; }

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
        const now = new Date();
        const status = new Date(e.commence_time) <= now ? 'live' : 'upcoming';
        return {
          id: e.id, sport_key: sport, sport_title: e.sport_title||sport,
          league: e.sport_title||sport, home_team: e.home_team, away_team: e.away_team,
          commence_time: e.commence_time, status,
          odd_1: best1, odd_x: bestX, odd_2: best2,
          total_line: totalLine, total_over: bestOver, total_under: bestUnder,
          last_updated_at: now.toISOString(),
        };
      });

      const ok = await upsertToSupabase(rows);
      if (ok) totalSynced += rows.length;
      results.push({ sport, status: ok?'ok':'error', count: rows.length });
    } catch(err) {
      results.push({ sport, status: 'error', reason: err.message });
    }
  }

  // Mark old live events as finished (started > 3h ago)
  const cutoff = new Date(Date.now() - 3*60*60*1000).toISOString();
  await fetch(`${SB_URL}/rest/v1/api_events?status=eq.live&commence_time=lt.${cutoff}`, {
    method: 'PATCH',
    headers: {
      'apikey': SB_KEY,
      'Authorization': `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status: 'finished', last_updated_at: new Date().toISOString() }),
  });

  return res.status(200).json({ ok: true, synced: totalSynced, sports: results });
}
