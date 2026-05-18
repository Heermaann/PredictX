// api/sync-events.js — Vercel serverless function
// Sincroniza eventos de The Odds API → Supabase
// Llamado por el cron job cada minuto

import { createClient } from '@supabase/supabase-js';

const SPORTS = [
  'soccer_epl', 'soccer_spain_la_liga', 'soccer_uefa_champs_league',
  'soccer_germany_bundesliga', 'soccer_italy_serie_a', 'soccer_france_ligue_one',
  'soccer_usa_mls', 'soccer_brazil_campeonato', 'soccer_conmebol_copa_libertadores',
  'basketball_nba', 'basketball_euroleague',
  'americanfootball_nfl',
  'baseball_mlb',
  'icehockey_nhl',
  'mma_mixed_martial_arts',
];

export default async function handler(req, res) {
  // Allow GET (cron) and POST (manual trigger)
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).end('Method not allowed');
  }

  // Security: verify cron secret or admin token
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers['authorization'];
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    // Allow Vercel cron (no auth header) or correct token
    const isVercelCron = req.headers['x-vercel-cron'] === '1';
    if (!isVercelCron && authHeader !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const ODDS_KEY = process.env.ODDS_API_KEY;
  const SB_URL   = process.env.SUPABASE_URL   || 'https://ghgkvtdhuqfpigbtzefz.supabase.co';
  const SB_KEY   = process.env.SUPABASE_SERVICE_KEY; // service role key (bypasses RLS)

  if (!ODDS_KEY) return res.status(500).json({ error: 'ODDS_API_KEY not configured' });
  if (!SB_KEY)   return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY not configured' });

  const _SB = createClient(SB_URL, SB_KEY);

  let totalSynced = 0, totalErrors = 0;
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

      // Process each event
      const upserts = events.map(e => {
        const bks = e.bookmakers || [];
        // Get best h2h odds
        let best1 = null, bestX = null, best2 = null;
        let bestOver = null, bestUnder = null, totalLine = null;

        bks.forEach(bk => {
          bk.markets?.forEach(mkt => {
            if (mkt.key === 'h2h') {
              mkt.outcomes?.forEach(o => {
                if (o.name === e.home_team && (!best1 || o.price > best1)) best1 = o.price;
                if (o.name === e.away_team && (!best2 || o.price > best2)) best2 = o.price;
                if (o.name === 'Draw'      && (!bestX || o.price > bestX)) bestX = o.price;
              });
            }
            if (mkt.key === 'totals') {
              mkt.outcomes?.forEach(o => {
                if (!totalLine) totalLine = o.point;
                if (o.name === 'Over'  && (!bestOver  || o.price > bestOver))  { bestOver  = o.price; totalLine = o.point; }
                if (o.name === 'Under' && (!bestUnder || o.price > bestUnder)) bestUnder = o.price;
              });
            }
          });
        });

        const commenceDate = new Date(e.commence_time);
        const now = new Date();
        const status = commenceDate <= now ? 'live' : 'upcoming';

        return {
          id:              e.id,
          sport_key:       sport,
          sport_title:     e.sport_title || sport,
          league:          e.sport_title || sport,
          home_team:       e.home_team,
          away_team:       e.away_team,
          commence_time:   e.commence_time,
          status,
          odd_1:           best1,
          odd_x:           bestX,
          odd_2:           best2,
          total_line:      totalLine,
          total_over:      bestOver,
          total_under:     bestUnder,
          bookmakers_raw:  bks.slice(0, 3), // store top 3 bookmakers
          last_updated_at: new Date().toISOString(),
        };
      });

      // Upsert in batches of 50
      for (let i = 0; i < upserts.length; i += 50) {
        const batch = upserts.slice(i, i + 50);
        const { error } = await _SB.from('api_events').upsert(batch, {
          onConflict: 'id',
          ignoreDuplicates: false,
        });
        if (error) { console.error(`Upsert error for ${sport}:`, error.message); totalErrors++; }
        else totalSynced += batch.length;
      }

      results.push({ sport, status: 'ok', count: upserts.length });
    } catch(err) {
      results.push({ sport, status: 'error', reason: err.message });
      totalErrors++;
    }
  }

  // Mark events as finished if they started > 3 hours ago and still "live"
  const cutoff = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  await _SB.from('api_events')
    .update({ status: 'finished', last_updated_at: new Date().toISOString() })
    .eq('status', 'live')
    .lt('commence_time', cutoff);

  return res.status(200).json({
    ok: true,
    synced: totalSynced,
    errors: totalErrors,
    sports: results,
    timestamp: new Date().toISOString(),
  });
}
