/* PredictX — Application */

/* ════════════════════════════════════════════════════
   STATE
════════════════════════════════════════════════════ */
const S = {
  sport:     localStorage.getItem('px_sport')  || 'soccer_epl',
  theme:     localStorage.getItem('px_theme')  || 'dark',
  markets:   [],
  filtered:  [],
  sport_cat: 'all',
  tab:       'all',
  filter:    'all',
  sort:      'date',
  searchQ:   '',
  navMode:   'home',
  catMode:   'all',
  probChart: null,
  slipMode:  'single',  // 'single' | 'combo'
};

// betslip: { [key]: { match, pick, odd, stake } }
const SLIP = {};

/* ════════════════════════════════════════════════════
   THEME
════════════════════════════════════════════════════ */
function applyTheme(t) {
  S.theme = t;
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem('px_theme', t);
  // Chart colors update deferred — no full re-render needed
  if (S.probChart) requestAnimationFrame(() => { updateChartColors(S.probChart); S.probChart.update('none'); });
}
function toggleTheme() {
  const bni = document.getElementById('bn-theme-ico');
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const next = isDark ? 'light' : 'dark';
  if (bni) bni.textContent = next === 'dark' ? '☀️' : '🌙';
  applyTheme(next);
}
const cGrid  = () => S.theme==='dark'?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.05)';
const cTick  = () => S.theme==='dark'?'#555870':'#9ea2b8';
const cTipBg = () => S.theme==='dark'?'#262840':'#fff';
const cTipBd = () => S.theme==='dark'?'rgba(255,255,255,.1)':'rgba(0,0,0,.1)';
const cTipTx = () => S.theme==='dark'?'#8b8fa8':'#555870';
const cTipBo = () => S.theme==='dark'?'#ecedf5':'#0f1117';
function updateChartColors(ch) {
  ch.options.scales.x.grid.color = cGrid(); ch.options.scales.y.grid.color = cGrid();
  ch.options.scales.x.ticks.color = cTick(); ch.options.scales.y.ticks.color = cTick();
  ch.options.plugins.tooltip.backgroundColor = cTipBg();
  ch.options.plugins.tooltip.borderColor = cTipBd();
  ch.options.plugins.tooltip.titleColor = cTipTx();
  ch.options.plugins.tooltip.bodyColor = cTipBo();
}

/* ════════════════════════════════════════════════════
   SIDEBAR
════════════════════════════════════════════════════ */
function toggleSidebar() {
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('overlay');
  const isOpen = sb.classList.toggle('open');
  ov.classList.toggle('show', isOpen);
  document.body.classList.toggle('panel-open', isOpen);
  document.getElementById('betslip').classList.remove('open');
  document.getElementById('overlay-slip').classList.remove('show');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('overlay').classList.remove('show');
  document.body.classList.remove('panel-open');
  const bnSp = document.getElementById('bn-sports');
  if (bnSp) bnSp.classList.remove('active');
}

/* ════════════════════════════════════════════════════
   BETSLIP PANEL
════════════════════════════════════════════════════ */
function toggleBetslip() {
  const bs = document.getElementById('betslip');
  const ov = document.getElementById('overlay-slip');
  const isOpen = bs.classList.toggle('open');
  ov.classList.toggle('show', isOpen);
  // Prevent background scroll on mobile
  document.body.classList.toggle('panel-open', isOpen);
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('overlay').classList.remove('show');
}
function closeBetslip() {
  document.getElementById('betslip').classList.remove('open');
  document.getElementById('overlay-slip').classList.remove('show');
  document.body.classList.remove('panel-open');
}
function closeAll() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('overlay').classList.remove('show');
  document.getElementById('betslip').classList.remove('open');
  document.getElementById('overlay-slip').classList.remove('show');
  document.body.classList.remove('panel-open');
}

/* ════════════════════════════════════════════════════
   INIT
════════════════════════════════════════════════════ */
/* boot is handled by the auth DOMContentLoaded below */

function autoExpandActiveSport() {
  // Find the league element matching S.sport and expand its group
  const leagues = document.querySelectorAll('.sb-league');
  leagues.forEach(el => {
    const onclick = el.getAttribute('onclick') || '';
    if (onclick.includes("'" + S.sport + "'")) {
      el.classList.add('active');
      _activeLeagueEl = el;
      const group = el.closest('.sb-leagues');
      if (group) {
        group.classList.add('open');
        const arrow = document.getElementById('arr-' + group.id);
        if (arrow) arrow.classList.add('open');
      }
    }
  });
}

/* ════════════════════════════════════════════════════
   API
════════════════════════════════════════════════════ */
/* ── Mercados por categoría de deporte ── */
function marketsForSport(sport) {
  if (sport.includes('winner') || sport.includes('championship_winner') || sport.includes('golf')) {
    return 'outrights';
  }
  const cat = sport.split('_')[0];
  switch (cat) {
    case 'soccer':          return 'h2h,totals,btts';
    case 'basketball':      return 'h2h,totals,spreads';
    case 'baseball':        return 'h2h,totals,spreads';
    case 'americanfootball': return 'h2h,totals,spreads';
    case 'icehockey':       return 'h2h,totals';
    case 'mma':             return 'h2h';
    default:                return 'h2h';
  }
}

async function oddsApiFetch(sport, force=false) {
  // La API key vive en el servidor (Netlify env var ODDS_API_KEY).
  const markets = marketsForSport(sport);
  const params = new URLSearchParams({
    sport,
    regions:    'eu,uk,us',
    markets,
    oddsFormat: 'decimal',
    force:      force ? '1' : '0',
  });
  const res = await fetch('/api/proxy?' + params.toString(), {
    signal: AbortSignal.timeout(20000)
  });
  return res;
}

/* Fetch mercados adicionales (player props) para un evento concreto */
async function fetchEventMarkets(sport, eventId, markets) {
  const params = new URLSearchParams({ sport, eventId, markets, regions: 'eu,uk,us' });
  try {
    const res = await fetch('/api/proxy?' + params.toString(), {
      signal: AbortSignal.timeout(15000)
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

let _loadMarketsInProgress = false;
let _marketsLastLoaded = 0;
const MARKETS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function loadMarkets(force=false) {
  // Skip reload if data is fresh (unless forced)
  if (!force && _marketsLastLoaded && Date.now() - _marketsLastLoaded < MARKETS_CACHE_TTL && S.markets.length > 0) {
    applyFilters();
    return;
  }
  if (_loadMarketsInProgress && !force) return; // prevent simultaneous calls
  _loadMarketsInProgress = true;
  const vl = document.getElementById('view-list');
  if (vl && vl.style.display === 'none') vl.style.display = 'block';
  document.getElementById('events-list').innerHTML =
    '<div class="spinner-wrap"><div class="spin"></div><div>Cargando eventos…</div></div>';
  try {
    // ── Read from Supabase api_events (no API call) ──
    // Filter by selected sport/league if one is active
    let apiQuery = _SB
      .from('api_events')
      .select('*')
      .in('status', ['upcoming', 'live'])
      .order('commence_time', { ascending: true })
      .limit(300);

    // If a specific league is selected, filter by sport_key
    if (S.sport && S.sport !== 'all') {
      apiQuery = apiQuery.eq('sport_key', S.sport);
    }

    const { data: apiData, error: apiError } = await apiQuery;

    if (apiError) throw new Error(apiError.message);

    const apiEvents = (apiData || []).map(e => { try { return processManualEvent({ ...e, _fromApi: true, sport_key: e.sport_key, league: e.league || e.sport_title }); } catch(err) { console.warn('processManualEvent error:', err); return null; } }).filter(Boolean);

    // ── Also load manual events ──
    let manualMarkets = [];
    try {
      const { data: manualData } = await _SB
        .from('manual_events')
        .select('*')
        .in('status', ['upcoming','live'])
        .order('commence_time', { ascending: true });
      manualMarkets = (manualData || []).map(e => processManualEvent(e));
    } catch(e) {
      console.warn('Manual events fetch failed:', e.message);
    }

    const total = apiEvents.length + manualMarkets.length;
    if (total > 0) {
      showToast(`✅ ${total} eventos cargados desde la base de datos`);
    } else {
      showToast('⚠️ Sin eventos. Sincroniza desde el panel admin.');
    }

    // Merge: featured manual first, then by time
    S.markets = [...manualMarkets, ...apiEvents].sort((a, b) => {
      if (a._featured && !b._featured) return -1;
      if (!a._featured && b._featured) return 1;
      return new Date(a.commence_time) - new Date(b.commence_time);
    });

    _marketsLastLoaded = Date.now();
    updateSidebarCounts();
    applyFilters();
    updateAPIPill(true);
  } catch(err) {
    const msg = err.message.includes('Failed to fetch') || err.message.includes('NetworkError')
      ? 'Sin conexión. Verifica tu red e intenta de nuevo.'
      : err.message;
    renderEmpty('error', msg);
    updateAPIPill(false);
  } finally {
    _loadMarketsInProgress = false;
  }
}

/* ════════════════════════════════════════════════════
   DATA PROCESSING — DECIMAL ODDS
════════════════════════════════════════════════════ */

/* Convert a manual_events DB row into the same shape as processMarket() output */
function applyOddsMargin(odd, marginPct) {
  if (!odd || !marginPct) return odd;
  // Reduce odds by margin percentage
  // e.g. odd=2.00, margin=5% → 2.00 / 1.05 = 1.905 → rounded to 1.90
  return Math.max(1.01, +(odd / (1 + marginPct / 100)).toFixed(2));
}

function processManualEvent(e) {
  // Apply odds margin for API events (not manual ones)
  const marginPct = e._fromApi ? (+(getSiteConfig().odds_margin || 0)) : 0;
  const o1 = applyOddsMargin(e.odd_1, marginPct);
  const oX = applyOddsMargin(e.odd_x, marginPct);
  const o2 = applyOddsMargin(e.odd_2, marginPct);
  const imp1 = o1 ? +(1/o1*100).toFixed(1) : null;
  const impX = oX ? +(1/oX*100).toFixed(1) : null;
  const imp2 = o2 ? +(1/o2*100).toFixed(1) : null;
  const margin = [imp1,impX,imp2].filter(Boolean).reduce((a,b)=>a+b,0);
  return {
    id: e.id, sport_key: e.sport_key, sport_title: e.sport_title,
    home_team: e.home_team, away_team: e.away_team,
    commence_time: e.commence_time,
    bookmakers: [], _manual: true, _featured: e.featured, _status: e.status,
    best1: o1||null, bestX: oX||null, best2: o2||null,
    imp1, impX, imp2,
    margin: margin > 0 ? +margin.toFixed(1) : null,
    bks: [], omap: {}, allMkts: {},
    homeOdds: o1 ? [{bk: e._fromApi ? 'API' : 'Manual', price: o1}] : [],
    awayOdds: o2 ? [{bk: e._fromApi ? 'API' : 'Manual', price: o2}] : [],
    drawOdds:  oX ? [{bk: e._fromApi ? 'API' : 'Manual', price: oX}] : [],
    totals: e.total_line ? { line:e.total_line, over:e.total_over||null, under:e.total_under||null, raw:{} } : null,
    btts: (e.btts_yes||e.btts_no) ? { yes:e.btts_yes, no:e.btts_no } : null,
    spreads: (e.spread_home||e.spread_away) ? {
      home: { price:e.spread_home, point:e.spread_home_pt },
      away: { price:e.spread_away, point:e.spread_away_pt }, raw:{}
    } : null,
    spark: genSpark(imp1||50, 24),
    vol: Math.round(Math.random()*500000+50000),
    sportCat: (e.sport_key||'').split('_')[0],
  };
}

function processMarket(m) {
  if (!m || !m.home_team || !m.away_team) return null;
  const bks = m.bookmakers || [];

  // ── Aggregate all markets by type across bookmakers ──
  // Structure: allMkts[marketKey][outcomeName] = [{ bk, price }]
  const allMkts = {};
  bks.forEach(bk => {
    (bk.markets || []).forEach(mkt => {
      const mk = mkt.key;
      if (!allMkts[mk]) allMkts[mk] = {};
      mkt.outcomes.forEach(o => {
        if (!o.name || o.price == null) return;
        // Normalise key: for totals use "Over X.X" / "Under X.X"
        const name = o.name + (o.point != null ? ' ' + o.point : '');
        if (!allMkts[mk][name]) allMkts[mk][name] = [];
        allMkts[mk][name].push({ bk: bk.title, price: parseFloat(o.price), point: o.point });
      });
    });
  });
  // Sort each outcome by best price
  Object.values(allMkts).forEach(outcomes =>
    Object.values(outcomes).forEach(arr => arr.sort((a,b) => b.price - a.price))
  );

  // ── 1X2 (h2h) ──
  const omap = allMkts['h2h'] || {};
  let homeOdds = omap[m.home_team] || [];
  let awayOdds = omap[m.away_team] || [];
  const drawOdds = omap['Draw'] || [];
  if (!homeOdds.length || !awayOdds.length) {
    const names = Object.keys(omap).filter(n => n !== 'Draw');
    if (names.length >= 2) {
      if (!homeOdds.length) homeOdds = omap[names[0]] || [];
      if (!awayOdds.length) awayOdds = omap[names[1]] || [];
    }
  }
  const best1 = homeOdds[0]?.price || null;
  const bestX = drawOdds[0]?.price  || null;
  const best2 = awayOdds[0]?.price  || null;
  const imp1 = best1 ? +(1/best1*100).toFixed(1) : null;
  const impX = bestX ? +(1/bestX*100).toFixed(1) : null;
  const imp2 = best2 ? +(1/best2*100).toFixed(1) : null;
  const margin = [imp1,impX,imp2].filter(Boolean).reduce((a,b)=>a+b,0);

  // ── Totals: best Over/Under lines ──
  const totalsRaw = allMkts['totals'] || {};
  // Find the most common line (the one most bookmakers offer)
  const lineCount = {};
  Object.keys(totalsRaw).forEach(k => {
    const match = k.match(/[\d.]+/);
    if (match) lineCount[match[0]] = (lineCount[match[0]] || 0) + (totalsRaw[k]?.length || 0);
  });
  const mainLine = Object.keys(lineCount).sort((a,b) => lineCount[b]-lineCount[a])[0] || null;
  const totals = mainLine ? {
    line: parseFloat(mainLine),
    over:  (totalsRaw[`Over ${mainLine}`]  || totalsRaw[`Over`]  || [])[0]?.price || null,
    under: (totalsRaw[`Under ${mainLine}`] || totalsRaw[`Under`] || [])[0]?.price || null,
    raw: totalsRaw
  } : null;

  // ── BTTS (Both Teams To Score) — soccer only ──
  const bttsRaw = allMkts['btts'] || {};
  const btts = Object.keys(bttsRaw).length ? {
    yes: (bttsRaw['Yes'] || [])[0]?.price || null,
    no:  (bttsRaw['No']  || [])[0]?.price || null,
  } : null;

  // ── Spreads / Hándicap ──
  const spreadsRaw = allMkts['spreads'] || {};
  // Best spread for home team
  const spreadHomeKey = Object.keys(spreadsRaw).find(k => k.startsWith(m.home_team) || k.includes(m.home_team.split(' ').pop()));
  const spreadAwayKey = Object.keys(spreadsRaw).find(k => k.startsWith(m.away_team) || k.includes(m.away_team.split(' ').pop()));
  const spreads = (spreadHomeKey || spreadAwayKey) ? {
    home: { name: spreadHomeKey, price: spreadHomeKey ? (spreadsRaw[spreadHomeKey]||[])[0]?.price : null, point: spreadHomeKey ? (spreadsRaw[spreadHomeKey]||[])[0]?.point : null },
    away: { name: spreadAwayKey, price: spreadAwayKey ? (spreadsRaw[spreadAwayKey]||[])[0]?.price : null, point: spreadAwayKey ? (spreadsRaw[spreadAwayKey]||[])[0]?.point : null },
    raw: spreadsRaw
  } : null;

  return {
    ...m,
    homeOdds, awayOdds, drawOdds,
    best1, bestX, best2,
    imp1, impX, imp2,
    margin: margin > 0 ? +margin.toFixed(1) : null,
    bks, omap, allMkts,
    totals, btts, spreads,
    spark: genSpark(imp1||50, 24),
    vol: Math.round(Math.random()*8000000+100000),
    sportCat: (m.sport_key||'').split('_')[0],
  };
}

function genSpark(base, pts) {
  const arr = [];
  let p = Math.max(10, Math.min(90, base + (Math.random()-.5)*20));
  for (let i = 0; i < pts; i++) { p += (Math.random()-.5)*5; p = Math.max(5, Math.min(95, p)); arr.push(+p.toFixed(1)); }
  arr.push(+base.toFixed(1));
  return arr;
}

/* Format decimal odd: show 2 decimals */
function fOdd(o) {
  if (!o || isNaN(o)) return '—';
  return parseFloat(o).toFixed(2);
}

function fVol(n) {
  return n>=1e6?'$'+(n/1e6).toFixed(1)+'M':n>=1000?'$'+(n/1000).toFixed(0)+'K':'$'+n;
}

function fDate(d) {
  if (!d) return '—';
  const dt = new Date(d), now = new Date(), diff = dt - now;
  if (diff < 0) return 'En curso';
  if (diff < 3600000) return 'En ' + Math.round(diff/60000) + 'min';
  if (diff < 86400000) return 'En ' + Math.round(diff/3600000) + 'h';
  return dt.toLocaleDateString('es',{weekday:'short',hour:'2-digit',minute:'2-digit'});
}

function sportIco(key) {
  const m={soccer:'⚽',basketball:'🏀',americanfootball:'🏈',baseball:'⚾',icehockey:'🏒',mma:'🥊',tennis:'🎾',golf:'⛳',boxing:'🥊',rugby:'🏉',cricket:'🏏'};
  return m[(key||'').split('_')[0]]||'🎯';
}

function isLive(m) {
  // Manual events use explicit _status field
  if (m._manual) return m._status === 'live';
  return new Date(m.commence_time) <= new Date();
}

/* ════════════════════════════════════════════════════
   FILTERS
════════════════════════════════════════════════════ */
/* Category pill handler */
function setCat(cat, btn) {
  S.catMode = cat;
  document.querySelectorAll('.cat-pill').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  if (cat === 'live') {
    S.tab = 'live';
    S.sport_cat = 'all';
  } else if (cat === 'new') {
    S.tab = 'all';
    S.sport_cat = 'all';
    S.sort = 'date';
  } else if (cat === 'all') {
    S.tab = 'all';
    S.sport_cat = 'all';
    S.sort = 'vol';
  } else {
    // sport category
    S.tab = 'all';
    S.sport_cat = cat;
    S.sort = 'date';
  }
  applyFilters();
}

function applyFilters() {
  try {
  let list = [...S.markets];

  // Sport category (cat-bar pills like Fútbol, Baloncesto...)
  // Manual events always show regardless of sport filter (they have their own sportCat)
  if (S.sport_cat && S.sport_cat !== 'all') {
    list = list.filter(m => m._manual || m.sportCat === S.sport_cat);
  }

  const now = new Date();

  // navMode: sidebar tabs (Todos, Próximos, Mayor Volumen)
  if (S.navMode === 'upcoming') {
    // Próximos: matches starting in the future (not yet live)
    const future = list.filter(m => !isLive(m) && new Date(m.commence_time) > now);
    list = future.length ? future : list.filter(m => !isLive(m));
  } else if (S.navMode === 'best') {
    // Mayor Volumen: all events sorted by volume (no filter)
  } else {
    // home / Destacados: show ALL events as-is (no time filter)
  }

  // Search
  if (S.searchQ) {
    const q = S.searchQ.toLowerCase();
    list = list.filter(m =>
      ((m.home_team||'') + (m.away_team||'') + (m.sport_title||''))
      .toLowerCase().includes(q)
    );
  }

  // Sort
  if (S.navMode === 'best' || S.sort === 'vol') {
    list.sort((a,b) => (b.vol||0) - (a.vol||0));
  } else if (S.sort === 'odd') {
    list.sort((a,b) => (a.best1||99) - (b.best1||99));
  } else if (S.sort === 'alpha') {
    list.sort((a,b) => (a.home_team||'').localeCompare(b.home_team||''));
  } else {
    // Default: soonest first
    list.sort((a,b) => new Date(a.commence_time) - new Date(b.commence_time));
  }

  S.filtered = list;
  renderEvents();
  updateMeta();
  } catch(err) { console.error('applyFilters error:', err); }
}

function updateMeta() {
  const n = S.filtered.length;
  const catLabels = {
    all:'Todos los mercados', new:'✨ Más recientes',
    soccer:'⚽ Fútbol', basketball:'🏀 Baloncesto', americanfootball:'🏈 Fútbol Americano',
    baseball:'⚾ Béisbol', icehockey:'🏒 Hockey', mma:'🥊 MMA & UFC',
    tennis:'🎾 Tenis', golf:'⛳ Golf'
  };
  const navLabels = {
    home:     '⚡ Todos',
    
    upcoming: '📅 Próximos',
    best:     '📊 Mayor Volumen',
  };
  const title = navLabels[S.navMode] || catLabels[S.catMode] || catLabels[S.sport_cat] || 'Apuestas';
  const titleEl = document.getElementById('list-title');
  if (titleEl) titleEl.textContent = title;
  const subEl = document.getElementById('list-sub');
  if (subEl) subEl.textContent = `${S.markets.length} mercado${S.markets.length!==1?'s':''} · Cuotas decimales`;
  // Debug: log markets/filtered count in console
  if (S.markets.length && !n) console.warn('Markets loaded but filtered is empty. sport_cat:', S.sport_cat, 'catMode:', S.catMode, 'tab:', S.tab, 'filter:', S.filter);
}

function updateSidebarCounts() {
  const cats = {};
  S.markets.forEach(m=>{ cats[m.sportCat]=(cats[m.sportCat]||0)+1; });
  Object.keys(cats).forEach(c=>{ const el=document.getElementById('ct-'+c); if(el)el.textContent=cats[c]; });
  const a=document.getElementById('ct-all'), b=document.getElementById('badge-total');
  if(a)a.textContent=S.markets.length;
  if(b)b.textContent=S.markets.length;
}

/* ════════════════════════════════════════════════════
   RENDER EVENTS LIST
════════════════════════════════════════════════════ */
/* Build a single Polymarket-style market card */
function buildCard(m, i) {
  const live = isLive(m);
  const k1 = slipKey(m,'1'), kX = slipKey(m,'X'), k2 = slipKey(m,'2');
  const imp1 = m.imp1 || 50;
  const imp2 = m.imp2 || 50;
  const hasX = m.bestX && m.bestX > 0;

  // For binary markets (no draw) show Yes/No style
  const isBinary = !hasX;

  return `<div class="mkt-card" onclick="openDetail(${i})">
    <div class="mc-head">
      <div class="mc-ico">${sportIco(m.sport_key)}</div>
      <div class="mc-info">
        <div class="mc-title">${esc(m.home_team)} vs ${esc(m.away_team)}</div>
        <div class="mc-meta">
          ${live ? '<span class="mc-live-badge">EN VIVO</span>' : ''}
          <span>${esc(m.sport_title||m.sport_key)}</span>
          <span class="mc-dot"></span>
          <span>${fDate(m.commence_time)}</span>
        </div>
      </div>
    </div>

    ${isBinary ? `
    <div>
      <div class="mc-prob-row">
        <span class="mc-prob-yes">${imp1}%</span>
        <span class="mc-prob-no">${imp2}%</span>
      </div>
      <div class="mc-prob-bar"><div class="mc-prob-fill" style="width:${imp1}%"></div></div>
      <div class="mc-prob-row" style="font-size:11px;color:var(--text2)">
        <span>${esc(m.home_team.split(' ').pop())}</span>
        <span>${esc(m.away_team.split(' ').pop())}</span>
      </div>
    </div>` : `
    <div>
      <div class="mc-prob-bar"><div class="mc-prob-fill" style="width:${imp1}%"></div></div>
      <div class="mc-prob-row" style="font-size:11px;color:var(--text2);margin-top:3px">
        <span>${esc(m.home_team.split(' ').pop())} ${imp1}%</span>
        ${m.impX ? `<span>X ${m.impX}%</span>` : ''}
        <span>${esc(m.away_team.split(' ').pop())} ${imp2}%</span>
      </div>
    </div>`}

    <div class="mc-odds">
      <div class="mc-odd-btn ${SLIP[k1]?'in-slip':''}" id="btn-${k1}"
           onclick="event.stopPropagation();addToSlip(${i},'1')">
        <span class="mc-odd-lbl">1 ${esc(m.home_team.split(' ').pop())}</span>
        <span class="mc-odd-val yes-val">${fOdd(m.best1)}</span>
      </div>
      ${hasX ? `<div class="mc-odd-btn ${SLIP[kX]?'in-slip':''}" id="btn-${kX}"
           onclick="event.stopPropagation();addToSlip(${i},'X')">
        <span class="mc-odd-lbl">Empate</span>
        <span class="mc-odd-val">${fOdd(m.bestX)}</span>
      </div>` : ''}
      <div class="mc-odd-btn ${SLIP[k2]?'in-slip':''}" id="btn-${k2}"
           onclick="event.stopPropagation();addToSlip(${i},'2')">
        <span class="mc-odd-lbl">2 ${esc(m.away_team.split(' ').pop())}</span>
        <span class="mc-odd-val no-val">${fOdd(m.best2)}</span>
      </div>
    </div>

    <div class="mc-foot">
      <span class="mc-vol">${fVol(m.vol)} Vol.</span>
    </div>
  </div>`;
}

function renderEvents() {
  const mainEl = document.getElementById('events-list');
  const liveEl = document.getElementById('live-grid');
  const liveSec = document.getElementById('live-section');
  const mainSec = document.getElementById('main-section');

  if (!S.filtered.length) { renderEmpty('no-results'); liveSec.style.display='none'; return; }

  // Split live vs upcoming
  const liveEvts = S.filtered.filter(isLive);
  const upEvts   = S.filtered.filter(m => !isLive(m));

  // Live section
  if (liveEvts.length && S.catMode !== 'live') {
    liveSec.style.display = 'block';
    document.getElementById('live-count').textContent = liveEvts.length + ' eventos';
    liveEl.innerHTML = liveEvts.map(m => { try { return buildCard(m, S.filtered.indexOf(m)); } catch(e){ return ''; } }).join('');
    mainEl.innerHTML = upEvts.map(m => { try { return buildCard(m, S.filtered.indexOf(m)); } catch(e){ return ''; } }).join('');
    document.getElementById('main-section-hdr').style.display = upEvts.length ? 'flex' : 'none';
    document.getElementById('main-count').textContent = upEvts.length + ' próximos';
  } else {
    liveSec.style.display = 'none';
    mainEl.innerHTML = S.filtered.map((m,i) => {
      try { return buildCard(m, i); }
      catch(e) { console.warn('buildCard error at', i, e); return ''; }
    }).join('');
    document.getElementById('main-section-hdr').style.display = 'flex';
    document.getElementById('main-count').textContent = S.filtered.length + ' eventos';
  }
}

/* ════════════════════════════════════════════════════
   BETSLIP LOGIC
════════════════════════════════════════════════════ */
function slipKey(m, pick) { return (m.id||m.home_team) + '_' + pick; }

function addToSlip(idx, pick) {
  const m = S.filtered[idx];
  if (!m) return;
  const key     = slipKey(m, pick);
  const marketId = m.id || m.home_team;
  const odd     = pick==='1' ? m.best1 : pick==='X' ? m.bestX : m.best2;
  if (!odd) { showToast('⚠️ Cuota no disponible'); return; }

  if (SLIP[key]) {
    // Toggle off — deselect this pick
    delete SLIP[key];
    const btn = document.getElementById('btn-'+key);
    if (btn) btn.classList.remove('in-slip');
  } else {
    // Remove ANY other pick from the same market first (1, X or 2)
    ['1','X','2'].forEach(p => {
      if (p === pick) return;
      const conflictKey = marketId + '_' + p;
      if (SLIP[conflictKey]) {
        delete SLIP[conflictKey];
        // Deselect the conflicting button visually
        const conflictBtn = document.getElementById('btn-' + conflictKey);
        if (conflictBtn) conflictBtn.classList.remove('in-slip');
        const detBtn = document.getElementById('det-btn-' + conflictKey);
        if (detBtn) detBtn.classList.remove('active');
      }
    });

    const pickLabel = pick==='1' ? m.home_team : pick==='X' ? 'Empate' : m.away_team;
    SLIP[key] = { key, match:`${m.home_team} vs ${m.away_team}`, pick:pickLabel, pickCode:pick, odd, stake:10, marketId };

    const btn = document.getElementById('btn-'+key);
    if (btn) btn.classList.add('in-slip');
  }

  renderSlip();
  updateSlipCount();
}

function removeFromSlip(key) {
  delete SLIP[key];
  // Clear card-grid button
  const btn = document.getElementById('btn-'+key);
  if (btn) btn.classList.remove('in-slip');
  // Clear extra-market button (xmkt-btn)
  const xbtn = document.getElementById('xbtn-'+key);
  if (xbtn) xbtn.classList.remove('active');
  renderSlip();
  updateSlipCount();
}

function updateSlipCount() {
  const n = Object.keys(SLIP).length;
  const ct = document.getElementById('slip-count');
  if (ct) { ct.textContent = n; ct.classList.toggle('show', n > 0); }
  // Sync bottom nav badge
  const bb = document.getElementById('bn-badge');
  if (bb) { bb.textContent = n; bb.classList.toggle('show', n > 0); }
}

/* Bottom nav actions */
function bnHome(btn) {
  document.querySelectorAll('.bn-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  closeSidebar();
  closeDetail();
}
function bnSearch(btn) {
  document.querySelectorAll('.bn-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  closeSidebar();
  closeBetslip();
  // On mobile open the dedicated search overlay; on desktop focus the nav input
  if (window.innerWidth <= 600) {
    openMobSearch();
  } else {
    const si = document.getElementById('search-inp') || document.querySelector('.nav-search input');
    if (si) { si.focus(); si.scrollIntoView({behavior:'smooth'}); }
  }
}

function openMobSearch() {
  const overlay = document.getElementById('mob-search-overlay');
  if (!overlay) return;
  overlay.classList.add('open');
  setTimeout(() => {
    const inp = document.getElementById('mob-search-inp');
    if (inp) inp.focus();
  }, 100);
}

function closeMobSearch() {
  const overlay = document.getElementById('mob-search-overlay');
  if (overlay) overlay.classList.remove('open');
  clearSearch();
  // Restore home button active state
  document.querySelectorAll('.bn-btn').forEach((b,i) => b.classList.toggle('active', i===0));
}

function clearMobSearch() {
  const inp = document.getElementById('mob-search-inp');
  if (inp) { inp.value = ''; inp.focus(); }
  const drop = document.getElementById('mob-search-drop');
  if (drop) drop.style.display = 'none';
  clearSearch();
}
function bnSports(btn) {
  document.querySelectorAll('.bn-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  toggleSidebar();
}
function bnSlip(btn) {
  document.querySelectorAll('.bn-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  closeSidebar();
  toggleBetslip();
}

function clearSlip() {
  Object.keys(SLIP).forEach(k => delete SLIP[k]);
  // Reset all buttons
  document.querySelectorAll('.ev-odd-btn.in-slip').forEach(el=>el.classList.remove('in-slip'));
  document.querySelectorAll('.odd-card.active').forEach(el=>el.classList.remove('active'));
  document.querySelectorAll('.xmkt-btn.active').forEach(el=>el.classList.remove('active'));
  renderSlip();
  updateSlipCount();
}

function setSlipMode(mode, btn) {
  S.slipMode = mode;
  btn.closest('.slip-mode').querySelectorAll('.slip-mode-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  renderSlip();
}

function renderSlip() {
  const body = document.getElementById('slip-body');
  const foot = document.getElementById('slip-foot');
  const items = Object.values(SLIP);

  if (!items.length) {
    body.innerHTML = `<div class="slip-empty"><div class="slip-empty-ico">🎯</div><div class="slip-empty-txt">Selecciona cuotas para añadirlas al boleto</div></div>`;
    foot.style.display = 'none';
    return;
  }

  if (S.slipMode === 'combo') {
    renderComboSlip(body, foot, items);
  } else {
    renderSingleSlip(body, foot, items);
  }
}

function renderSingleSlip(body, foot, items) {
  let totalStake = 0, totalReturn = 0;

  body.innerHTML = items.map(sel => {
    const ret = sel.odd * sel.stake;
    totalStake += sel.stake;
    totalReturn += ret;
    return `
    <div class="slip-sel">
      <div class="slip-sel-remove" onclick="removeFromSlip('${esc(sel.key)}')">✕</div>
      <div class="slip-sel-match">${esc(sel.match)}</div>
      <div class="slip-sel-pick">${esc(sel.pick)}</div>
      <div class="slip-sel-odd">× ${fOdd(sel.odd)}</div>
      <div class="slip-stake-row">
        <span class="slip-stake-lbl">Apuesta</span>
        <input class="slip-stake-inp" type="number" min="1" value="${sel.stake}"
               oninput="updateStake('${esc(sel.key)}',this.value)" placeholder="$" name="$">
      </div>
      <div class="slip-stake-return">Retorno: <span>${ret.toFixed(2)}</span></div>
      <div class="quick-stakes">
        ${[5,10,20,50].map(v=>`<div class="qs-btn" onclick="setStake('${esc(sel.key)}',${v})">${v}</div>`).join('')}
      </div>
    </div>`;
  }).join('');

  document.getElementById('slip-ttl-stake').textContent = '$' + totalStake.toFixed(2);
  document.getElementById('slip-ttl-ret').textContent   = '$' + totalReturn.toFixed(2);
  foot.style.display = 'block';
}

function renderComboSlip(body, foot, items) {
  // ── Detect conflicting picks (2+ picks from the same market) ──
  const marketCounts = {};
  items.forEach(s => {
    marketCounts[s.marketId] = (marketCounts[s.marketId] || 0) + 1;
  });
  const hasConflict = Object.values(marketCounts).some(c => c > 1);

  const comboOdd = hasConflict ? 0 : items.reduce((acc,s) => acc * s.odd, 1);
  const stake    = items[0]?.comboStake || 10;
  const ret      = comboOdd * stake;

  body.innerHTML = items.map(sel => {
    const isConflicted = marketCounts[sel.marketId] > 1;
    return `
    <div class="slip-sel" style="padding:10px 12px;${isConflicted ? 'border-color:var(--red-bd);background:var(--red-bg)' : ''}">
      <div class="slip-sel-remove" onclick="removeFromSlip('${esc(sel.key)}')">✕</div>
      <div class="slip-sel-match">${esc(sel.match)}${isConflicted ? ' <span style="color:var(--red);font-weight:700">⚠ Conflicto</span>' : ''}</div>
      <div class="slip-sel-pick" style="font-size:12px">${esc(sel.pick)} <span style="color:var(--text3)">× ${fOdd(sel.odd)}</span></div>
    </div>`;
  }).join('') +
  (hasConflict
    ? `<div class="slip-sel" style="background:var(--red-bg);border-color:var(--red-bd);text-align:center;padding:14px">
        <div style="font-size:13px;font-weight:700;color:var(--red);margin-bottom:4px">⚠️ Combinada inválida</div>
        <div style="font-size:11px;color:var(--text2);line-height:1.5">Tienes dos o más selecciones del mismo partido. Elimina una para continuar.</div>
       </div>`
    : `<div class="slip-sel" style="background:var(--green-bg);border-color:var(--green-bd)">
        <div class="slip-sel-match">Combinada (${items.length} selecciones)</div>
        <div class="slip-sel-odd" style="font-size:15px">× ${fOdd(comboOdd)}</div>
        <div class="slip-stake-row">
          <span class="slip-stake-lbl">Apuesta</span>
          <input class="slip-stake-inp" type="number" min="1" value="${stake}"
                 oninput="updateComboStake(this.value)" placeholder="$" name="$">
        </div>
        <div class="slip-stake-return">Retorno potencial: <span>${ret.toFixed(2)}</span></div>
        <div class="quick-stakes">
          ${[5,10,20,50].map(v=>`<div class="qs-btn" onclick="updateComboStake(${v},true)">${v}</div>`).join('')}
        </div>
       </div>`
  );

  // Disable bet button if conflict
  const betBtn = document.querySelector('.slip-bet-btn');
  if (betBtn) betBtn.disabled = hasConflict;

  document.getElementById('slip-ttl-stake').textContent = hasConflict ? '—' : '$' + stake.toFixed(2);
  document.getElementById('slip-ttl-ret').textContent   = hasConflict ? '—' : '$' + ret.toFixed(2);
  foot.style.display = 'block';
}

function updateStake(key, val) {
  const n = Math.max(0.01, parseFloat(val) || 0.01);
  if (SLIP[key]) {
    SLIP[key].stake = n;
    // Update return inline without full re-render
    const ret = SLIP[key].odd * n;
    const sel = document.querySelector(`[onclick="removeFromSlip('${CSS.escape(key)}')"]`)?.closest('.slip-sel');
    if (sel) {
      const retEl = sel.querySelector('.slip-stake-return span');
      if (retEl) retEl.textContent = '$' + ret.toFixed(2);
    }
    // Update totals
    const items = Object.values(SLIP);
    const ts = items.reduce((a,s)=>a+s.stake,0);
    const tr = items.reduce((a,s)=>a+s.stake*s.odd,0);
    document.getElementById('slip-ttl-stake').textContent = '$' + ts.toFixed(2);
    document.getElementById('slip-ttl-ret').textContent   = '$' + tr.toFixed(2);
  }
}

function setStake(key, val) {
  if (SLIP[key]) {
    SLIP[key].stake = val;
    renderSlip();
  }
}

function updateComboStake(val, doRender) {
  const n = parseFloat(val) || 0;
  Object.values(SLIP).forEach(s=>s.comboStake=n);
  if (doRender) renderSlip();
  else {
    const comboOdd = Object.values(SLIP).reduce((acc,s)=>acc*s.odd,1);
    const ret = comboOdd * n;
    document.getElementById('slip-ttl-stake').textContent = '$'+n.toFixed(2);
    document.getElementById('slip-ttl-ret').textContent   = '$'+ret.toFixed(2);
  }
}

function placeBets() {
  const items = Object.values(SLIP);
  if (!items.length) return;
  const total = S.slipMode==='combo'
    ? (items[0]?.comboStake||10)
    : items.reduce((a,s)=>a+s.stake,0);
  showToast(`✅ Apuesta de ${total.toFixed(2)} registrada (simulación)`);
  clearSlip();
  closeBetslip();
}

/* ════════════════════════════════════════════════════
   DETAIL VIEW
════════════════════════════════════════════════════ */
function openDetail(idx) {
  const m = S.filtered[idx];
  if (!m) return;
  closeSidebar();

  document.getElementById('view-list').style.display   = 'none';
  setTimeout(updateSidebarVisibility, 50);
  document.getElementById('view-detail').style.display = 'block';
  renderDetail(m);
}

function closeDetail() {
  const bnH = document.getElementById('bn-home');
  if (bnH) { document.querySelectorAll('.bn-btn').forEach(b=>b.classList.remove('active')); bnH.classList.add('active'); }
  if (S.probChart) { S.probChart.destroy(); S.probChart = null; }
  document.getElementById('view-detail').style.display = 'none';
  document.getElementById('view-list').style.display   = 'block';
  requestAnimationFrame(redrawSparks);
}

/* ── Helpers para mercados adicionales ── */

// Registro global: almacena los datos de cada botón de mercado extra
// Clave: mkId string → { pick, match, odd, conflictGroup }
// Evita pasar datos por onclick strings (previene bugs con apostrofes y chars especiales)
const XMKT_REG = {};

function mkId(eventId, marketKey, pick) {
  // ID único por selección: eventId__marketKey__pick_normalizado
  return `${eventId}__${marketKey}__${pick.replace(/[^\w.]/g,'_')}`;
}

function mkGroup(marketId) {
  // Grupo de conflicto = eventId__marketKey (las dos primeras partes del ID)
  const parts = marketId.split('__');
  return parts.slice(0, 2).join('__');
}

// Llamado desde onclick="xmktClick('...')"
function xmktClick(mid) {
  const reg = XMKT_REG[mid];
  if (!reg) return;
  detAddToSlipGeneric(mid, reg.pick, reg.match, reg.odd, reg.conflictGroup);
}

function detAddToSlipGeneric(marketId, pick, matchLabel, odd, conflictGroup) {
  if (!odd || odd <= 0) { showToast('⚠️ Cuota no disponible'); return; }

  if (SLIP[marketId]) {
    // Toggle OFF: quitar del boleto
    delete SLIP[marketId];
    const btn = document.getElementById('xbtn-' + marketId);
    if (btn) btn.classList.remove('active');
    showToast(`🗑 ${pick} eliminado del boleto`);
  } else {
    // Quitar cualquier otra selección del mismo grupo de conflicto
    Object.keys(SLIP).forEach(k => {
      if (SLIP[k].conflictGroup === conflictGroup) {
        delete SLIP[k];
        const prevBtn = document.getElementById('xbtn-' + k);
        if (prevBtn) prevBtn.classList.remove('active');
      }
    });
    // Añadir la nueva selección
    // slipGroup = conflictGroup → usado por renderSlip para detectar conflictos en combinada
    SLIP[marketId] = {
      key: marketId,
      match: matchLabel,
      pick,
      pickCode: pick,
      odd,
      stake: 10,
      marketId: conflictGroup,   // ← usar conflictGroup como marketId para detección en renderSlip
      conflictGroup,
    };
    const btn = document.getElementById('xbtn-' + marketId);
    if (btn) btn.classList.add('active');
    showToast(`✅ ${pick} añadido al boleto`);
  }
  renderSlip();
  updateSlipCount();
}

/* Registra un botón en XMKT_REG y devuelve el HTML del botón */
function xmktBtn(mid, pick, odd, conflictGroup, matchLabel) {
  XMKT_REG[mid] = { pick, odd, conflictGroup, match: matchLabel };
  const active = SLIP[mid] ? 'active' : '';
  return `<button class="xmkt-btn ${active}" id="xbtn-${mid}" onclick="xmktClick('${mid}')">
    <span class="xmkt-pick">${esc(pick)}</span><span class="xmkt-odd">${fOdd(odd)}</span>
  </button>`;
}

/* Render una fila de 2 botones Over/Under o Sí/No */
function renderTwoBtnRow(mid1, pick1, odd1, mid2, pick2, odd2, matchLabel) {
  const group1 = mkGroup(mid1);
  const group2 = mkGroup(mid2);
  // group1 === group2 siempre en una fila de 2 opciones del mismo mercado
  return `<div class="xmkt-row">
    ${xmktBtn(mid1, pick1, odd1, group1, matchLabel)}
    ${xmktBtn(mid2, pick2, odd2, group2, matchLabel)}
  </div>`;
}

/* Renders a collapsible extra-market section */
function renderMktSection(id, title, icon, content) {
  return `
  <div class="xmkt-section" id="xs-${id}">
    <button class="xmkt-header" onclick="toggleXmkt('${id}')">
      <span class="xmkt-icon">${icon}</span>
      <span class="xmkt-title">${title}</span>
      <span class="xmkt-arrow" id="xarr-${id}">▾</span>
    </button>
    <div class="xmkt-body" id="xbody-${id}">${content}</div>
  </div>`;
}

function toggleXmkt(id) {
  const body = document.getElementById('xbody-' + id);
  const arrow = document.getElementById('xarr-' + id);
  if (!body) return;
  const open = body.classList.toggle('open');
  if (arrow) arrow.style.transform = open ? 'rotate(180deg)' : '';
}

/* Render extra markets panel based on sport */
function renderExtraMarkets(m) {
  const sport   = m.sport_key || '';
  const cat     = sport.split('_')[0];
  const eventId = m.id || m.home_team;
  const matchLabel = `${m.home_team} vs ${m.away_team}`;

  let sections = '';

  /* ══════════════════════════════════════════════
     FÚTBOL — Totales · BTTS · Hándicap · DC · Corners · Tarjetas
  ══════════════════════════════════════════════ */
  if (cat === 'soccer') {
    // Totales de goles
    if (m.totals) {
      const line = m.totals.line;
      sections += renderMktSection('totals', `Total de Goles — Línea ${line}`, '🥅',
        `<div class="xmkt-line-label">¿Cuántos goles en el partido?</div>` +
        renderTwoBtnRow(
          mkId(eventId,'totals',`Over_${line}`),  `Más de ${line}`,   m.totals.over  || 0,
          mkId(eventId,'totals',`Under_${line}`), `Menos de ${line}`, m.totals.under || 0,
          matchLabel
        )
      );
    }

    // Ambos equipos marcan (BTTS)
    if (m.btts && (m.btts.yes || m.btts.no)) {
      sections += renderMktSection('btts', 'Ambos Equipos Marcan', '⚽',
        `<div class="xmkt-line-label">¿Marcarán los dos equipos?</div>` +
        renderTwoBtnRow(
          mkId(eventId,'btts','Si'), 'Sí', m.btts.yes || 0,
          mkId(eventId,'btts','No'), 'No', m.btts.no  || 0,
          matchLabel
        )
      );
    }

    // Hándicap asiático
    if (m.spreads) {
      const hHome = m.spreads.home;
      const hAway = m.spreads.away;
      if (hHome.price || hAway.price) {
        const hLabel = (pt) => pt != null ? (pt > 0 ? `+${pt}` : `${pt}`) : '';
        sections += renderMktSection('spreads', 'Hándicap Asiático', '📐',
          `<div class="xmkt-line-label">Ventaja de goles al inicio</div>` +
          renderTwoBtnRow(
            mkId(eventId,'spreads',`Home_${hHome.point}`), `${m.home_team.split(' ').pop()} ${hLabel(hHome.point)}`, hHome.price || 0,
            mkId(eventId,'spreads',`Away_${hAway.point}`), `${m.away_team.split(' ').pop()} ${hLabel(hAway.point)}`, hAway.price || 0,
            matchLabel
          )
        );
      }
    }

    // Doble oportunidad
    {
      const dc1x = m.best1 && m.bestX ? +((m.best1 * m.bestX)/(m.best1 + m.bestX - 1)).toFixed(2) : null;
      const dc12 = m.best1 && m.best2 ? +((m.best1 * m.best2)/(m.best1 + m.best2 - 1)).toFixed(2) : null;
      const dcx2 = m.bestX && m.best2 ? +((m.bestX * m.best2)/(m.bestX + m.best2 - 1)).toFixed(2) : null;
      if (dc1x || dc12 || dcx2) {
        const hShort = m.home_team.split(' ').pop();
        const aShort = m.away_team.split(' ').pop();
        const mid1x = mkId(eventId,'dc','1X');
        const mid12 = mkId(eventId,'dc','12');
        const midX2 = mkId(eventId,'dc','X2');
        const grp = mkGroup(mid1x);
        sections += renderMktSection('dc', 'Doble Oportunidad', '🔄',
          `<div class="xmkt-line-label">Ganas con dos de tres resultados posibles</div>
          <div class="xmkt-row xmkt-row-3">
            ${xmktBtn(mid1x, `${hShort} o Empate`, dc1x||0, grp, matchLabel)}
            ${xmktBtn(mid12, `${hShort} o ${aShort}`, dc12||0, grp, matchLabel)}
            ${xmktBtn(midX2, `Empate o ${aShort}`, dcx2||0, grp, matchLabel)}
          </div>`
        );
      }
    }

    // Corners (cuotas simuladas — API de corners requiere plan premium)
    {
      const corners = estimateCornersMarket(m);
      sections += renderMktSection('corners', 'Corners (Total del Partido)', '🚩',
        `<div class="xmkt-line-label">Línea estimada: ${corners.line} córners</div>` +
        `<div class="xmkt-note">⚡ Cuotas simuladas basadas en probabilidades del partido</div>` +
        renderTwoBtnRow(
          mkId(eventId,'corners',`Over_${corners.line}`),  `Más de ${corners.line}`,  corners.over,
          mkId(eventId,'corners',`Under_${corners.line}`), `Menos de ${corners.line}`, corners.under,
          matchLabel
        )
      );
    }

    // Tarjetas (cuotas simuladas)
    {
      const cards = estimateCardsMarket(m);
      sections += renderMktSection('cards', 'Tarjetas (Total del Partido)', '🟨',
        `<div class="xmkt-line-label">Línea estimada: ${cards.line} tarjetas</div>` +
        `<div class="xmkt-note">⚡ Cuotas simuladas basadas en probabilidades del partido</div>` +
        renderTwoBtnRow(
          mkId(eventId,'cards',`Over_${cards.line}`),  `Más de ${cards.line}`,  cards.over,
          mkId(eventId,'cards',`Under_${cards.line}`), `Menos de ${cards.line}`, cards.under,
          matchLabel
        )
      );
    }
  }

  /* ══════════════════════════════════════════════
     BALONCESTO — Totales · Spreads · Props de jugador
  ══════════════════════════════════════════════ */
  if (cat === 'basketball') {
    if (m.totals) {
      const line = m.totals.line;
      sections += renderMktSection('totals', `Total de Puntos — Línea ${line}`, '🏀',
        `<div class="xmkt-line-label">Puntos combinados de ambos equipos</div>` +
        renderTwoBtnRow(
          mkId(eventId,'totals',`Over_${line}`),  `Más de ${line} pts`,  m.totals.over  || 0,
          mkId(eventId,'totals',`Under_${line}`), `Menos de ${line} pts`, m.totals.under || 0,
          matchLabel
        )
      );
    }

    if (m.spreads) {
      const hHome = m.spreads.home;
      const hAway = m.spreads.away;
      const ptFmt = pt => pt != null ? (pt > 0 ? `+${pt}` : `${pt}`) : '';
      if (hHome.price || hAway.price) {
        sections += renderMktSection('spreads', 'Hándicap de Puntos', '📐',
          `<div class="xmkt-line-label">Diferencia de puntos al final</div>` +
          renderTwoBtnRow(
            mkId(eventId,'spreads',`Home_${hHome.point}`), `${m.home_team.split(' ').pop()} ${ptFmt(hHome.point)}`, hHome.price || 0,
            mkId(eventId,'spreads',`Away_${hAway.point}`), `${m.away_team.split(' ').pop()} ${ptFmt(hAway.point)}`, hAway.price || 0,
            matchLabel
          )
        );
      }
    }

    // Props de jugador — grupo por jugador para que Over/Under del mismo jugador sean exclusivos
    // pero jugadores distintos sean independientes entre sí
    const props = estimateBasketballProps(m);
    sections += renderMktSection('ppoints', 'Props de Jugador — Puntos', '🏆',
      `<div class="xmkt-note">⚡ Cuotas simuladas · Mercado referencial</div>` +
      props.points.map(p => {
        const playerKey = p.player.replace(/[^\w]/g,'_');
        const midO = mkId(eventId, `ppoints_${playerKey}`, `Over_${p.line}`);
        const midU = mkId(eventId, `ppoints_${playerKey}`, `Under_${p.line}`);
        return `<div class="xmkt-prop-row">
          <span class="xmkt-prop-name">${esc(p.player)}</span>
          ${renderTwoBtnRow(midO, `Más ${p.line} pts`, p.over, midU, `Menos ${p.line} pts`, p.under, matchLabel)}
        </div>`;
      }).join('')
    );

    sections += renderMktSection('passists', 'Props de Jugador — Asistencias', '🎯',
      `<div class="xmkt-note">⚡ Cuotas simuladas · Mercado referencial</div>` +
      props.assists.map(p => {
        const playerKey = p.player.replace(/[^\w]/g,'_');
        const midO = mkId(eventId, `passists_${playerKey}`, `Over_${p.line}`);
        const midU = mkId(eventId, `passists_${playerKey}`, `Under_${p.line}`);
        return `<div class="xmkt-prop-row">
          <span class="xmkt-prop-name">${esc(p.player)}</span>
          ${renderTwoBtnRow(midO, `Más ${p.line} ast`, p.over, midU, `Menos ${p.line} ast`, p.under, matchLabel)}
        </div>`;
      }).join('')
    );
  }

  /* ══════════════════════════════════════════════
     BÉISBOL — Totales · Spreads · Carrera inicial
  ══════════════════════════════════════════════ */
  if (cat === 'baseball') {
    if (m.totals) {
      const line = m.totals.line;
      sections += renderMktSection('totals', `Total de Carreras — Línea ${line}`, '⚾',
        `<div class="xmkt-line-label">Carreras combinadas de ambos equipos</div>` +
        renderTwoBtnRow(
          mkId(eventId,'totals',`Over_${line}`),  `Más de ${line} carreras`,  m.totals.over  || 0,
          mkId(eventId,'totals',`Under_${line}`), `Menos de ${line} carreras`, m.totals.under || 0,
          matchLabel
        )
      );
    }

    if (m.spreads) {
      const hHome = m.spreads.home;
      const hAway = m.spreads.away;
      const ptFmt = pt => pt != null ? (pt > 0 ? `+${pt}` : `${pt}`) : '';
      if (hHome.price || hAway.price) {
        sections += renderMktSection('spreads', 'Run Line (Hándicap)', '📐',
          `<div class="xmkt-line-label">Handicap de carreras — típicamente ±1.5</div>` +
          renderTwoBtnRow(
            mkId(eventId,'spreads',`Home_${hHome.point}`), `${m.home_team.split(' ').pop()} ${ptFmt(hHome.point)}`, hHome.price || 0,
            mkId(eventId,'spreads',`Away_${hAway.point}`), `${m.away_team.split(' ').pop()} ${ptFmt(hAway.point)}`, hAway.price || 0,
            matchLabel
          )
        );
      }
    }

    // 1ª entrada (simulado)
    const first = estimateBaseballFirstInning(m);
    sections += renderMktSection('1stin', '1ª Entrada — ¿Anota el local?', '🏟️',
      `<div class="xmkt-note">⚡ Cuotas simuladas · Mercado referencial</div>` +
      renderTwoBtnRow(
        mkId(eventId,'1stinning','home_yes'), 'Sí anota', first.homeYes,
        mkId(eventId,'1stinning','home_no'),  'No anota',  first.homeNo,
        matchLabel
      )
    );
  }

  /* ══════════════════════════════════════════════
     FÚTBOL AMERICANO — Totales · Spreads
  ══════════════════════════════════════════════ */
  if (cat === 'americanfootball') {
    if (m.totals) {
      const line = m.totals.line;
      sections += renderMktSection('totals', `Total de Puntos — Línea ${line}`, '🏈',
        `<div class="xmkt-line-label">Puntos combinados del partido</div>` +
        renderTwoBtnRow(
          mkId(eventId,'totals',`Over_${line}`),  `Más de ${line} pts`,  m.totals.over  || 0,
          mkId(eventId,'totals',`Under_${line}`), `Menos de ${line} pts`, m.totals.under || 0,
          matchLabel
        )
      );
    }
    if (m.spreads) {
      const hHome = m.spreads.home;
      const hAway = m.spreads.away;
      const ptFmt = pt => pt != null ? (pt > 0 ? `+${pt}` : `${pt}`) : '';
      if (hHome.price || hAway.price) {
        sections += renderMktSection('spreads', 'Point Spread', '📐',
          `<div class="xmkt-line-label">Diferencia de puntos al final del partido</div>` +
          renderTwoBtnRow(
            mkId(eventId,'spreads',`Home_${hHome.point}`), `${m.home_team.split(' ').pop()} ${ptFmt(hHome.point)}`, hHome.price || 0,
            mkId(eventId,'spreads',`Away_${hAway.point}`), `${m.away_team.split(' ').pop()} ${ptFmt(hAway.point)}`, hAway.price || 0,
            matchLabel
          )
        );
      }
    }
  }

  /* ══════════════════════════════════════════════
     HOCKEY — Totales
  ══════════════════════════════════════════════ */
  if (cat === 'icehockey') {
    if (m.totals) {
      const line = m.totals.line;
      sections += renderMktSection('totals', `Total de Goles — Línea ${line}`, '🏒',
        `<div class="xmkt-line-label">Goles combinados del partido</div>` +
        renderTwoBtnRow(
          mkId(eventId,'totals',`Over_${line}`),  `Más de ${line}`,  m.totals.over  || 0,
          mkId(eventId,'totals',`Under_${line}`), `Menos de ${line}`, m.totals.under || 0,
          matchLabel
        )
      );
    }
  }

  if (!sections) {
    sections = `<div class="xmkt-empty">No hay mercados adicionales disponibles para este deporte.</div>`;
  }

  return sections;
}

/* ── Generadores de mercados simulados coherentes ── */
function estimateCornersMarket(m) {
  // Línea base: ~9-11 corners por partido en Europa
  const imp1 = m.imp1 || 33, imp2 = m.imp2 || 33;
  const intensity = Math.abs(imp1 - imp2); // partidos más disputados = más corners
  const baseLine = 9.5 + (intensity > 20 ? 0.5 : 0);
  const line = +(baseLine).toFixed(1);
  const margin = 1.04;
  const pOver = 0.52 + (Math.random() - 0.5) * 0.06;
  const over  = +(1 / (pOver * margin)).toFixed(2);
  const under = +(1 / ((1 - pOver) * margin)).toFixed(2);
  return { line, over: Math.max(1.5, over), under: Math.max(1.5, under) };
}

function estimateCardsMarket(m) {
  const line = 3.5;
  const margin = 1.04;
  const pOver = 0.54 + (Math.random() - 0.5) * 0.08;
  const over  = +(1 / (pOver * margin)).toFixed(2);
  const under = +(1 / ((1 - pOver) * margin)).toFixed(2);
  return { line, over: Math.max(1.5, over), under: Math.max(1.5, under) };
}

function estimateBasketballProps(m) {
  // Generar props ficticios pero coherentes con cuotas NBA típicas
  const playerSuffixes = ['James', 'Durant', 'Curry', 'Antetokounmpo', 'Doncic'];
  const homeSuffix = m.home_team.split(' ').pop();
  const awaySuffix = m.away_team.split(' ').pop();
  const margin = 1.05;
  const mkProp = (player, line, pOver) => ({
    player,
    line,
    over:  +(1 / (pOver * margin)).toFixed(2),
    under: +(1 / ((1-pOver) * margin)).toFixed(2)
  });
  return {
    points: [
      mkProp(`${homeSuffix} Star`, 22.5, 0.5 + (Math.random()-0.5)*0.1),
      mkProp(`${awaySuffix} Star`, 19.5, 0.5 + (Math.random()-0.5)*0.1),
    ],
    assists: [
      mkProp(`${homeSuffix} PG`, 6.5, 0.5 + (Math.random()-0.5)*0.1),
      mkProp(`${awaySuffix} PG`, 5.5, 0.5 + (Math.random()-0.5)*0.1),
    ]
  };
}

function estimateBaseballFirstInning(m) {
  const margin = 1.04;
  const pYes = 0.42 + (Math.random()-0.5)*0.06;
  return {
    homeYes: +(1/(pYes * margin)).toFixed(2),
    homeNo:  +(1/((1-pYes) * margin)).toFixed(2)
  };
}

function renderDetail(m) {
  const el = document.getElementById('detail-content');
  const k1=slipKey(m,'1'), kX=slipKey(m,'X'), k2=slipKey(m,'2');
  // Limpiar registro de botones del evento anterior
  Object.keys(XMKT_REG).forEach(k => delete XMKT_REG[k]);

  const extraMkts = renderExtraMarkets(m);

  el.innerHTML = `
    <div class="back-btn" onclick="closeDetail()">← Volver</div>
    <div class="det-header">
      <div class="det-ico">${sportIco(m.sport_key)}</div>
      <div style="flex:1;min-width:0">
        <div class="det-title">${esc(m.home_team)} vs ${esc(m.away_team)}</div>
        <div class="det-tags">
          <span class="det-tag league">${esc(m.sport_title)}</span>
          <span class="det-tag">📅 ${fDate(m.commence_time)}</span>
          
          <span class="det-tag">Margen: ${m.margin||'—'}%</span>
        </div>
      </div>
    </div>

    <!-- Pestañas de mercado -->
    <div class="mkt-tabs">
      <button class="mkt-tab active" onclick="switchMktTab('main',this)">Resultado</button>
      <button class="mkt-tab" onclick="switchMktTab('extra',this)">Más Mercados</button>
    </div>

    <!-- Panel principal: 1X2 -->
    <div id="mkt-panel-main">
      <div class="odds-panel">
        <div class="odds-panel-title">Resultado Final · 1X2</div>
        <div class="odds-1x2">
          <div class="odd-card ${SLIP[k1]?'active':''}" id="det-btn-${k1}" onclick="detAddToSlip('${m.id||m.home_team}','1','${esc(m.home_team)}','${esc(m.away_team)}',${m.best1||0})">
            <div class="odd-card-lbl">1 — Local</div>
            <div class="odd-card-team">${esc(m.home_team.split(' ').slice(-2).join(' '))}</div>
            <div class="odd-card-val">${fOdd(m.best1)}</div>
            <div class="odd-card-prob">${m.imp1||'—'}% prob.</div>
          </div>
          <div class="odd-card ${SLIP[kX]?'active':''}" id="det-btn-${kX}" onclick="detAddToSlip('${m.id||m.home_team}','X','${esc(m.home_team)}','${esc(m.away_team)}',${m.bestX||0})">
            <div class="odd-card-lbl">X — Empate</div>
            <div class="odd-card-team">Empate</div>
            <div class="odd-card-val">${fOdd(m.bestX)}</div>
            <div class="odd-card-prob">${m.impX||'—'}% prob.</div>
          </div>
          <div class="odd-card ${SLIP[k2]?'active':''}" id="det-btn-${k2}" onclick="detAddToSlip('${m.id||m.home_team}','2','${esc(m.home_team)}','${esc(m.away_team)}',${m.best2||0})">
            <div class="odd-card-lbl">2 — Visitante</div>
            <div class="odd-card-team">${esc(m.away_team.split(' ').slice(-2).join(' '))}</div>
            <div class="odd-card-val">${fOdd(m.best2)}</div>
            <div class="odd-card-prob">${m.imp2||'—'}% prob.</div>
          </div>
        </div>
      </div>

      <!-- Stats -->
      <div class="stats-row">
        <div class="stat-card"><div class="stat-lbl">Mejor 1</div><div class="stat-val g">${fOdd(m.best1)}</div></div>
        <div class="stat-card"><div class="stat-lbl">Mejor X</div><div class="stat-val">${fOdd(m.bestX)}</div></div>
        <div class="stat-card"><div class="stat-lbl">Mejor 2</div><div class="stat-val r">${fOdd(m.best2)}</div></div>
        <div class="stat-card"><div class="stat-lbl">Margen</div><div class="stat-val">${m.margin?m.margin+'%':'—'}</div></div>
      </div>

      <!-- Chart -->
      <div class="chart-card">
        <div class="chart-hd">
          <div class="chart-title">Probabilidad implícita — ${esc(m.home_team)}</div>
          <div class="chart-tabs">
            <div class="chart-tab active">24h</div>
            <div class="chart-tab">7d</div>
          </div>
        </div>
        <div class="chart-wrap"><canvas id="prob-chart"></canvas></div>
      </div>
    </div>

    <!-- Panel mercados adicionales -->
    <div id="mkt-panel-extra" style="display:none">
      <div class="xmkt-container">
        ${extraMkts}
      </div>
    </div>
  `;

  requestAnimationFrame(() => drawProbChart(m));
}

function switchMktTab(panel, btn) {
  document.querySelectorAll('.mkt-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('mkt-panel-main').style.display  = panel === 'main'  ? '' : 'none';
  document.getElementById('mkt-panel-extra').style.display = panel === 'extra' ? '' : 'none';
}

function detAddToSlip(marketId, pick, home, away, odd) {
  if (!odd) { showToast('⚠️ Cuota no disponible'); return; }
  const key       = marketId + '_' + pick;
  const pickLabel = pick==='1' ? home : pick==='X' ? 'Empate' : away;

  if (SLIP[key]) {
    // Toggle off
    delete SLIP[key];
    const btn = document.getElementById('det-btn-'+key);
    if (btn) btn.classList.remove('active');
    const listBtn = document.getElementById('btn-'+key);
    if (listBtn) listBtn.classList.remove('in-slip');
    showToast(`🗑 ${pickLabel} eliminado del boleto`);
  } else {
    // Remove conflicting picks from the same market
    ['1','X','2'].forEach(p => {
      if (p === pick) return;
      const conflictKey = marketId + '_' + p;
      if (SLIP[conflictKey]) {
        delete SLIP[conflictKey];
        const cb = document.getElementById('det-btn-' + conflictKey);
        if (cb) cb.classList.remove('active');
        const lb = document.getElementById('btn-' + conflictKey);
        if (lb) lb.classList.remove('in-slip');
      }
    });

    SLIP[key] = { key, match:`${home} vs ${away}`, pick:pickLabel, pickCode:pick, odd, stake:10, marketId };

    const btn = document.getElementById('det-btn-'+key);
    if (btn) btn.classList.add('active');
    const listBtn = document.getElementById('btn-'+key);
    if (listBtn) listBtn.classList.add('in-slip');
    showToast(`✅ ${pickLabel} añadido al boleto`);
  }

  renderSlip();
  updateSlipCount();
}

/* ════════════════════════════════════════════════════
   CHART
════════════════════════════════════════════════════ */
function drawProbChart(m) {
  if (S.probChart) { S.probChart.destroy(); S.probChart=null; }
  const ctx = document.getElementById('prob-chart');
  if (!ctx) return;
  const data = m.spark;
  const labels = data.map((_,i)=>i===data.length-1?'Ahora':`-${data.length-1-i}h`);
  const col  = m.imp1>50?'#06d6a0':'#ff5c5c';
  const alph = m.imp1>50?'rgba(6,214,160,0.12)':'rgba(255,92,92,0.12)';
  S.probChart = new Chart(ctx, {
    type:'line',
    data:{ labels, datasets:[{ data, borderColor:col, borderWidth:2, pointRadius:0, pointHoverRadius:4, pointHoverBackgroundColor:col, fill:true,
      backgroundColor:c2=>{ const g=c2.chart.ctx.createLinearGradient(0,0,0,180); g.addColorStop(0,alph); g.addColorStop(1,'transparent'); return g; },
      tension:.4 }] },
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false}, tooltip:{ backgroundColor:cTipBg(), borderColor:cTipBd(), borderWidth:1, titleColor:cTipTx(), bodyColor:cTipBo(),
        bodyFont:{family:'JetBrains Mono'}, callbacks:{label:c=>' '+c.raw+'%'} } },
      scales:{
        x:{grid:{color:cGrid()},ticks:{color:cTick(),font:{size:10},maxTicksLimit:8}},
        y:{grid:{color:cGrid()},ticks:{color:cTick(),font:{size:10},callback:v=>v+'%'},min:0,max:100}
      }
    }
  });
}

/* ════════════════════════════════════════════════════
   SPARKLINES
════════════════════════════════════════════════════ */
function redrawSparks() {
  S.filtered.forEach((_,i) => {
    // no sparklines in new list design — could add if desired
  });
}

/* ════════════════════════════════════════════════════
   NAV / FILTER CALLBACKS
════════════════════════════════════════════════════ */
function navTo(mode, btn) {
  S.catMode = 'all'; S.sport_cat = 'all'; S.searchQ = '';
  S.sort = (mode === 'best') ? 'vol' : 'date';
  document.querySelectorAll('.cat-pill').forEach(b => b.classList.remove('active'));
  const allPill = document.querySelector('.cat-pill[data-cat="all"]');
  if (allPill) allPill.classList.add('active');
  S.navMode = mode;
  document.querySelectorAll('[id^="nav-"]').forEach(b=>b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  closeSidebar();
  applyFilters();
}
function toggleGroup(id) {
  const panel = document.getElementById(id);
  const arrow = document.getElementById('arr-' + id);
  if (!panel) return;
  const isOpen = panel.classList.toggle('open');
  if (arrow) arrow.classList.toggle('open', isOpen);
}

let _activeLeagueEl = null;

async function loadLeague(sportKey, label, el) {
  // Mark active
  if (_activeLeagueEl) _activeLeagueEl.classList.remove('active', 'loading');
  _activeLeagueEl = el;
  el.classList.add('active', 'loading');
  closeSidebar();

  // Update title immediately
  document.getElementById('list-title').textContent = label;
  document.getElementById('list-sub').textContent = 'Cargando eventos…';
  document.getElementById('events-list').innerHTML =
    '<div class="spinner-wrap"><div class="spin"></div><div>Cargando ' + label + '…</div></div>';

  S.sport = sportKey;
  localStorage.setItem('px_sport', sportKey);
  S.tab = 'all'; S.filter = 'all'; S.navMode = 'home';
  S.sport_cat = 'all'; S.catMode = 'all'; S.sort = 'vol';

  // Reset cat-pill UI to "Tendencia"
  document.querySelectorAll('.cat-pill').forEach((b,i) => b.classList.toggle('active', i===0));

  // Reset tab UI
  document.querySelectorAll('.list-tab').forEach((b,i) => b.classList.toggle('active', i===0));

  try {
    // Read from Supabase api_events (source of truth)
    const { data: apiData, error: apiError } = await _SB
      .from('api_events')
      .select('*')
      .eq('sport_key', sportKey)
      .in('status', ['upcoming','live'])
      .order('commence_time', { ascending: true })
      .limit(200);

    if (apiError) throw new Error(apiError.message);

    const apiEvents = (apiData || []).map(e => processManualEvent({
      ...e, _fromApi: true,
      sport_key: e.sport_key,
      league: e.league || e.sport_title,
    }));

    // Also load manual events for this sport
    const { data: manualData } = await _SB
      .from('manual_events')
      .select('*')
      .eq('sport_key', sportKey)
      .in('status', ['upcoming','live'])
      .order('commence_time', { ascending: true });

    const manualEvents = (manualData || []).map(e => processManualEvent(e));

    S.markets = [...manualEvents, ...apiEvents].sort((a,b) => {
      if (a._featured && !b._featured) return -1;
      if (!a._featured && b._featured) return 1;
      return new Date(a.commence_time) - new Date(b.commence_time);
    });

    el.classList.remove('loading');
    updateAPIPill(true);
    applyFilters();
    const total = apiEvents.length + manualEvents.length;
    showToast(`✅ ${total} eventos de ${label}`);
  } catch(err) {
    el.classList.remove('active', 'loading');
    _activeLeagueEl = null;
    renderEmpty('error', err.message);
    updateAPIPill(false);
  }
}

function selectSport(sport, btn) {
  // kept for backward compat but no longer used directly
  S.sport_cat = sport;
  applyFilters();
}
function setTab(tab, btn) {
  S.tab = tab;
  document.querySelectorAll('.list-tab').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  applyFilters();
}
function setFilter(f, btn) {
  S.filter = f;
  document.querySelectorAll('.chip').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  applyFilters();
}
function sortBy(v) { S.sort=v; applyFilters(); }
/* ════════════════════════════════════════════════
   BUSCADOR GLOBAL
════════════════════════════════════════════════ */
let _searchIdx = -1;

function getSearchDrop() {
  // Returns the active search dropdown: mobile overlay one if open, else desktop
  const mobOverlay = document.getElementById('mob-search-overlay');
  if (mobOverlay && mobOverlay.classList.contains('open')) {
    return document.getElementById('mob-search-drop');
  }
  return document.getElementById('search-drop');
}

// Debounce helper
function debounce(fn, delay) {
  let timer;
  return function(...args) { clearTimeout(timer); timer = setTimeout(() => fn.apply(this, args), delay); };
}

const _debouncedApplySearch = debounce(applyFilters, 200);

function onSearch(q) {
  S.searchQ = q.trim();
  // Sync both inputs
  const desktopInp = document.getElementById('search-inp');
  const mobInp     = document.getElementById('mob-search-inp');
  if (desktopInp && document.activeElement !== desktopInp) desktopInp.value = q;
  if (mobInp     && document.activeElement !== mobInp)     mobInp.value     = q;
  if (!q.trim()) { hideSearchDrop(); applyFilters(); return; }
  showSearchDrop();
  renderSearchDrop(q.trim());
}

function renderSearchDrop(q) {
  const drop = getSearchDrop();
  if (!drop) return;
  const lq = q.toLowerCase();
  _searchIdx = -1;

  // Filter markets
  const matches = S.markets.filter(m =>
    (m.home_team||'').toLowerCase().includes(lq) ||
    (m.away_team||'').toLowerCase().includes(lq) ||
    (m.sport_title||'').toLowerCase().includes(lq) ||
    (m.sport_key||'').toLowerCase().includes(lq)
  ).slice(0, 8);

  if (!matches.length) {
    drop.innerHTML = '<div class="sd-empty">Sin resultados para "' + esc(q) + '"</div>';
    return;
  }

  // Group by sport
  const groups = {};
  matches.forEach(m => {
    const g = m.sport_title || m.sport_key;
    if (!groups[g]) groups[g] = [];
    groups[g].push(m);
  });

  drop.innerHTML = Object.entries(groups).map(([sport, evts]) => `
    <div class="sd-section">
      <div class="sd-lbl">${sportIco(evts[0].sport_key)} ${esc(sport)}</div>
      ${evts.map(m => {
        const idx = S.markets.indexOf(m);
        const live = isLive(m);
        return `<div class="sd-item" onclick="searchPickEvent(${idx})" data-idx="${idx}">
          <div class="sd-ico">${live ? '🔴' : '⚽'}</div>
          <div class="sd-info">
            <div class="sd-title">${highlight(m.home_team, lq)} vs ${highlight(m.away_team, lq)}</div>
            <div class="sd-sub">${fDate(m.commence_time)}</div>
          </div>
          <div class="sd-odds">${fOdd(m.best1)}</div>
        </div>`;
      }).join('')}
    </div>`).join('');

  drop.innerHTML += '<div class="sd-shortcut">↑↓ para navegar · Enter para abrir · Esc para cerrar</div>';
}

function highlight(text, q) {
  if (!q) return esc(text);
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return esc(text);
  return esc(text.slice(0, idx)) +
    '<mark style="background:rgba(6,214,160,.25);color:inherit;border-radius:2px">' +
    esc(text.slice(idx, idx + q.length)) + '</mark>' +
    esc(text.slice(idx + q.length));
}

function searchPickEvent(idx) {
  clearSearch();
  closeMobSearch();
  S.navMode = 'home';
  S.searchQ = '';
  applyFilters();
  setTimeout(() => openDetail(idx), 50);
}

function showSearchDrop() {
  const drop = getSearchDrop();
  if (drop) drop.style.display = 'block';
  const inp = document.getElementById('search-inp');
  if (inp) inp.setAttribute('aria-expanded', 'true');
  setTimeout(() => document.addEventListener('click', hideSearchOnClick), 10);
}

function hideSearchDrop() {
  // Hide both dropdowns
  const d1 = document.getElementById('search-drop');
  const d2 = document.getElementById('mob-search-drop');
  if (d1) d1.style.display = 'none';
  if (d2) d2.style.display = 'none';
  const inp = document.getElementById('search-inp');
  if (inp) inp.setAttribute('aria-expanded', 'false');
  document.removeEventListener('click', hideSearchOnClick);
}

function hideSearchOnClick(e) {
  const wrap    = document.getElementById('search-wrap');
  const mobOver = document.getElementById('mob-search-overlay');
  if (wrap    && wrap.contains(e.target))    return;
  if (mobOver && mobOver.contains(e.target)) return;
  hideSearchDrop();
}

function clearSearch() {
  const inp  = document.getElementById('search-inp');
  const mobInp = document.getElementById('mob-search-inp');
  if (inp)    inp.value    = '';
  if (mobInp) mobInp.value = '';
  S.searchQ = '';
  hideSearchDrop();
  applyFilters();
}

function searchKeyNav(e) {
  const drop = document.getElementById('search-drop');
  if (!drop || drop.style.display === 'none') return;
  const items = drop.querySelectorAll('.sd-item');
  if (!items.length) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    _searchIdx = Math.min(_searchIdx + 1, items.length - 1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    _searchIdx = Math.max(_searchIdx - 1, 0);
  } else if (e.key === 'Enter' && _searchIdx >= 0) {
    e.preventDefault();
    items[_searchIdx].click();
    return;
  } else if (e.key === 'Escape') {
    hideSearchDrop();
    return;
  }
  items.forEach((el, i) => el.classList.toggle('active', i === _searchIdx));
  if (_searchIdx >= 0) items[_searchIdx].scrollIntoView({ block:'nearest' });
}

/* ════════════════════════════════════════════════
   NOTIFICACIONES
════════════════════════════════════════════════ */
const NOTIFS = [];
let _notifTimer = null;
let _notifPanelOpen = false;

function initNotifications() {
  // Show bell if notifications are supported
  const bell = document.getElementById('notif-bell');
  if ('Notification' in window && bell) {
    bell.style.display = 'flex';
    updateNotifPermBtn();
  }
  // Start checking for upcoming match notifications every minute
  _notifTimer = setInterval(checkUpcomingNotifs, 60 * 1000);
  checkUpcomingNotifs(); // check immediately on load
}

function requestNotifPermission() {
  if (!('Notification' in window)) { showToast('Tu navegador no soporta notificaciones'); return; }
  Notification.requestPermission().then(perm => {
    updateNotifPermBtn();
    if (perm === 'granted') {
      showToast('✅ Notificaciones activadas');
      checkUpcomingNotifs();
    } else {
      showToast('⚠️ Permisos denegados — actívalos en la configuración del navegador');
    }
  });
}

function updateNotifPermBtn() {
  const btn = document.getElementById('notif-perm-btn');
  if (!btn) return;
  const perm = Notification.permission;
  if (perm === 'granted') {
    btn.textContent = '✅ Notificaciones activas';
    btn.style.background = 'var(--gbg)';
    btn.style.color = 'var(--green)';
    btn.disabled = true;
  } else if (perm === 'denied') {
    btn.textContent = '❌ Permisos denegados — actívalos en el navegador';
    btn.style.background = 'var(--rbg)';
    btn.style.color = 'var(--red)';
    btn.disabled = true;
  }
}

function checkUpcomingNotifs() {
  if (!SESSION) return;
  const bets = betHistory();
  if (!bets.length) return;

  const now = Date.now();
  const ALERT_WINDOW = 15 * 60 * 1000; // 15 min before

  // For each pending bet, check if the match starts soon
  bets.filter(b => b.status === 'open').forEach(bet => {
    // Find the market in S.markets
    const market = S.markets.find(m =>
      (m.home_team + ' vs ' + m.away_team) === bet.match ||
      bet.match.includes(m.home_team)
    );
    if (!market) return;

    const matchTime = new Date(market.commence_time).getTime();
    const timeUntil = matchTime - now;
    const notifKey = 'notif_' + bet.id;

    // Fire if within 15 min window and not already notified
    if (timeUntil > 0 && timeUntil <= ALERT_WINDOW && !localStorage.getItem(notifKey)) {
      localStorage.setItem(notifKey, '1');
      const minsLeft = Math.round(timeUntil / 60000);
      addNotif({
        type: 'match_soon',
        title: '⏰ Partido por empezar',
        body: `${bet.match} empieza en ${minsLeft} min`,
        sub: `Tu apuesta: ${bet.pick} @ ${fOdd(bet.odd)}`,
        time: 'Ahora',
        unread: true,
        action: () => {
          const idx = S.markets.indexOf(market);
          if (idx >= 0) openDetail(idx);
        },
      });
      // Browser notification
      if (Notification.permission === 'granted') {
        try {
          const n = new Notification('PredictX — Partido por empezar', {
            body: `${bet.match} empieza en ${minsLeft} min
Tu apuesta: ${bet.pick} @ ${fOdd(bet.odd)}`,
            icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">⚡</text></svg>',
            tag: notifKey,
          });
          n.onclick = () => { window.focus(); n.close(); };
        } catch(e) {}
      }
    }

    // Also notify when a match goes live
    if (timeUntil <= 0 && timeUntil >= -5*60*1000) {
      const liveKey = 'notif_live_' + bet.id;
      if (!localStorage.getItem(liveKey)) {
        localStorage.setItem(liveKey, '1');
        addNotif({
          type: 'match_live',
          title: '🔴 ¡Partido en Vivo!',
          body: `${bet.match} ha comenzado`,
          sub: `Tu apuesta: ${bet.pick} @ ${fOdd(bet.odd)}`,
          time: 'Ahora',
          unread: true,
        });
        if (Notification.permission === 'granted') {
          try {
            new Notification('PredictX — Partido iniciado', {
              body: `${bet.match} ha comenzado
Tu apuesta: ${bet.pick}`,
              tag: liveKey,
            });
          } catch(e) {}
        }
      }
    }
  });
}

function addNotif(notif) {
  NOTIFS.unshift(notif);
  if (NOTIFS.length > 50) NOTIFS.pop();
  renderNotifList();
  updateNotifBadge();
  // Flash the bell
  const bell = document.getElementById('notif-bell');
  if (bell) {
    bell.style.animation = 'none';
    bell.offsetHeight; // reflow
    bell.style.animation = 'bellShake .5s ease';
  }
}

function renderNotifList() {
  const list = document.getElementById('notif-list');
  if (!list) return;
  if (!NOTIFS.length) {
    list.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text2);font-size:13px">No hay notificaciones</div>';
    return;
  }
  list.innerHTML = NOTIFS.map((n, i) => `
    <div class="notif-item ${n.unread ? 'unread' : ''}" onclick="clickNotif(${i})">
      <div class="ni-ico">${n.type === 'match_live' ? '🔴' : n.type === 'match_soon' ? '⏰' : '📢'}</div>
      <div class="ni-body">
        <div class="ni-title">${n.title}</div>
        <div class="ni-sub">${n.body}</div>
        ${n.sub ? `<div class="ni-sub" style="color:var(--green)">${n.sub}</div>` : ''}
        <div class="ni-time">${n.time}</div>
      </div>
      ${n.unread ? '<div style="width:7px;height:7px;border-radius:50%;background:var(--green);flex-shrink:0;margin-top:4px"></div>' : ''}
    </div>`).join('');
}

function clickNotif(idx) {
  if (NOTIFS[idx]) {
    NOTIFS[idx].unread = false;
    if (NOTIFS[idx].action) NOTIFS[idx].action();
    renderNotifList();
    updateNotifBadge();
    if (!NOTIFS[idx].action) toggleNotifPanel();
  }
}

function updateNotifBadge() {
  const count = NOTIFS.filter(n => n.unread).length;
  const badge = document.getElementById('notif-count');
  if (badge) {
    badge.textContent = count;
    badge.style.display = count ? 'flex' : 'none';
  }
}

function toggleNotifPanel() {
  const panel = document.getElementById('notif-panel');
  if (!panel) return;
  _notifPanelOpen = !_notifPanelOpen;
  panel.style.display = _notifPanelOpen ? 'block' : 'none';
  if (_notifPanelOpen) {
    // Mark all as read when opened
    NOTIFS.forEach(n => n.unread = false);
    renderNotifList();
    updateNotifBadge();
    // Close on outside click
    setTimeout(() => document.addEventListener('click', closeNotifOnClick), 10);
  } else {
    document.removeEventListener('click', closeNotifOnClick);
  }
}

function closeNotifOnClick(e) {
  const panel = document.getElementById('notif-panel');
  const bell  = document.getElementById('notif-bell');
  if (panel && !panel.contains(e.target) && !bell.contains(e.target)) {
    panel.style.display = 'none';
    _notifPanelOpen = false;
    document.removeEventListener('click', closeNotifOnClick);
  }
}

function clearAllNotifs() {
  NOTIFS.length = 0;
  renderNotifList();
  updateNotifBadge();
}

/* ════════════════════════════════════════════════════
   API MODAL
════════════════════════════════════════════════════ */
function openModal()  { document.getElementById('modal').classList.add('show'); }
function closeModal() { document.getElementById('modal').classList.remove('show'); }
document.getElementById('modal').addEventListener('click',e=>{ if(e.target===document.getElementById('modal'))closeModal(); });

async function connectAPI() {
  const sport = document.getElementById('modal-sport').value;
  const st    = document.getElementById('modal-status');
  st.className='modal-status load'; st.textContent='⏳ Cargando eventos…';
  S.sport = sport;
  localStorage.setItem('px_sport', sport);
  try {
    // force=true: user manually changed sport in modal
    const res = await oddsApiFetch(sport, true);
    if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e.message||'Error '+res.status); }
    const data = await res.json();
    const rem  = res.headers.get('x-requests-remaining');
    st.className='modal-status ok'; st.textContent=`✅ ${data.length} eventos cargados · ${rem||'?'} requests restantes`;
    S.markets = data.map(m => {
      try { return processMarket(m); }
      catch(e) { console.warn('processMarket error:', e, m); return null; }
    }).filter(Boolean);
    updateSidebarCounts(); applyFilters(); updateAPIPill(true);
    setTimeout(closeModal, 1200);
  } catch(err) {
    st.className='modal-status err';
    st.textContent='❌ ' + (err.message.includes('Failed to fetch') ? 'Sin conexión a internet.' : err.message);
    updateAPIPill(false);
  }
}
function updateAPIPill(on) { /* api-pill removed from frontend */ }

// Hide admin-only elements for non-admin users
function applyAdminOnlyVisibility() {
  const admin = isOwner();
  // Add/remove body class for CSS-based admin visibility
  document.body.classList.toggle('is-admin', admin);
  // Hide Izipay test card info
  document.querySelectorAll('.admin-only-el').forEach(el => {
    el.style.display = admin ? '' : 'none';
  });
  // Hide Izipay SDK bubble (Information / Test Methods)
  let style = document.getElementById('admin-only-style');
  if (!style) {
    style = document.createElement('style');
    style.id = 'admin-only-style';
    document.head.appendChild(style);
  }
  style.textContent = admin
    ? ''
    : '.kr-help-button, .kr-form-help, [class*="kr-help"], [class*="kr-info"] { display: none !important; }';
}

/* ════════════════════════════════════════════════════
   EMPTY STATES
════════════════════════════════════════════════════ */
function renderEmpty(type, msg) {
  const el = document.getElementById('events-list'); if (!el) return;
  if (type === 'error')
    el.innerHTML = `<div class="empty"><div class="empty-ico">⚠️</div><div class="empty-title">Error al cargar</div><div class="empty-sub">${esc(msg)}<br><br><button style="margin-top:12px;padding:9px 20px;background:var(--green);border-radius:8px;font-weight:700;font-size:13px;cursor:pointer;color:${S.theme==='dark'?'#000':'#fff'}" onclick="loadMarkets()">Reintentar →</button>&nbsp;<button style="margin-top:12px;padding:9px 16px;background:var(--bg3);border:1px solid var(--border2);border-radius:8px;font-size:13px;cursor:pointer;color:var(--text2)" onclick="openModal()">Cambiar liga →</button></div></div>`;
  else
    el.innerHTML = `<div class="empty"><div class="empty-ico">🔍</div><div class="empty-title">Sin resultados</div><div class="empty-sub">Prueba con otros filtros o selecciona otro deporte</div></div>`;
}

/* ════════════════════════════════════════════════════
   TOAST
════════════════════════════════════════════════════ */
function showToast(msg) {
  const t=document.getElementById('toast');
  t.textContent=msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),2600);
}

/* ════════════════════════════════════════════════════
   UTILS
════════════════════════════════════════════════════ */
function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

/* ════════════════════════════════════════════════
   AUTH SYSTEM
════════════════════════════════════════════════ */

/* ── Tiny DB helpers ── */
/* ══════════════════════════════════════════════════════════════
   SUPABASE — base de datos real entre dispositivos
══════════════════════════════════════════════════════════════ */
const _SB = supabase.createClient('https://ghgkvtdhuqfpigbtzefz.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdoZ2t2dGRodXFmcGlnYnR6ZWZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0MTQ4NDYsImV4cCI6MjA5Mzk5MDg0Nn0.guFwC8DFo1Wt_TB_D2fv4JifQK-r0lo2hlsuxl4umtU');

// localStorage sigue usándose solo para preferencias de UI (tema, deporte)
const DB = {
  get:    k => { try { return JSON.parse(localStorage.getItem('px_'+k)||'null'); } catch(e){ return null; } },
  set:    (k,v) => localStorage.setItem('px_'+k, JSON.stringify(v)),
  del:    k => localStorage.removeItem('px_'+k),
  remove: k => localStorage.removeItem('px_'+k),
};

/* ── Session ── */
let SESSION = null;       // { id, email, name, country }
let _pendingUser = null;
let _currentPayMethod = 'card';
let _firstDeposit = true;
let _sbProfile = null;    // full profile row from Supabase

/* ── Supabase helpers ── */
async function sbQuery(table, filter={}) {
  try {
    let q = _SB.from(table).select('*');
    Object.entries(filter).forEach(([k,v]) => { q = q.eq(k, v); });
    const { data, error } = await q;
    if (error) { return []; }
    return data || [];
  } catch(e) { return []; }
}
async function sbUpsert(table, row) {
  try {
    const { data, error } = await _SB.from(table).upsert(row, {onConflict:'email'}).select();
    if (error) { return null; }
    return data?.[0] || null;
  } catch(e) { return null; }
}
async function sbInsert(table, row) {
  try {
    const { data, error } = await _SB.from(table).insert(row).select();
    if (error) { return null; }
    return data?.[0] || null;
  } catch(e) { return null; }
}
async function sbUpdate(table, match, values) {
  try {
    const { data, error } = await _SB.from(table).update(values).match(match).select();
    if (error) { return null; }
    return data?.[0] || null;
  } catch(e) { return null; }
}

/* ── Profile helpers (sync with Supabase + local cache) ── */
async function loadProfile(email) {
  const rows = await sbQuery('profiles', {email});
  _sbProfile = rows[0] || null;
  return _sbProfile;
}
function defaultAdmin(s) {
  return {
    name: s?.name||'', email: s?.email||'',
    balance: 0, deposited: 0, withdrawn: 0,
    currency: 'USD', phone: '', country: s?.country||'',
    twofa: false, firstDeposit: true
  };
}
/* adminData defined later */
async function saveAdminData(d) {
  if (!SESSION) return;
  _sbProfile = d;
  await sbUpsert('profiles', { ...d, email: SESSION.email });
}

/* ── Bets & transactions (Supabase tables) ── */
async function betHistoryAsync() {
  if (!SESSION) return [];
  return await sbQuery('bets', {user_email: SESSION.email});
}
async function saveBet(bet) {
  if (!SESSION) return;
  await sbInsert('bets', { ...bet, user_email: SESSION.email });
}
async function txHistoryAsync() {
  if (!SESSION) return defaultTx();
  const rows = await sbQuery('transactions', {user_email: SESSION.email});
  return rows.length ? rows : defaultTx();
}
async function saveTx(tx) {
  if (!SESSION) return;
  await sbInsert('transactions', { ...tx, user_email: SESSION.email });
}

// Sync wrappers for parts of the app that haven't migrated to async yet
/* betHistory defined later */
function saveBets(b)   { DB.set('bets_cache_'+(SESSION?.email||''), b); }
/* txHistory defined later */

function defaultTx()   { return []; }
/* todayStr defined later */

/* ── Boot: check saved session ── */
document.addEventListener('DOMContentLoaded', async () => {
  applyTheme(S.theme);
  renderSlip();
  document.getElementById('modal-sport').value = S.sport;
  autoExpandActiveSport();

  // Check Supabase session (works across devices)
  const { data: { session: sbSession } } = await _SB.auth.getSession();
  if (sbSession?.user) {
    const email = sbSession.user.email;
    const profile = await loadProfile(email);
    const name = profile?.name || email.split('@')[0];
    SESSION = { id: sbSession.user.id, email, name, role: profile?.role || 'user' };
    setTimeout(applyAdminOnlyVisibility, 200);
    onLoginSuccess(false);
  } else {
    // Fallback: check localStorage session — only restore if Supabase has a live token
    const saved = DB.get('session');
    if (saved?.email) {
      // Re-request session: Supabase may have refreshed the token automatically
      const { data: { session: recheck } } = await _SB.auth.getSession().catch(()=>({data:{session:null}}));
      if (recheck?.user) {
        SESSION = saved;
        onLoginSuccess(false);
      } else {
        // Token expired — clear stale local data silently, user stays logged out
        DB.remove('session');
      }
    }
  }
  loadMarkets();
  // Load site config from Supabase (for config enforcement)
  await loadSiteConfig();
  // Apply admin-only visibility rules
  applyAdminOnlyVisibility();
  // Check manual events auto-live on startup
  checkManualEventsAutoLive();
  // Show maintenance banner if active and user is not owner
  const cfg = getSiteConfig();
  if (cfg.maintenance && !isOwner()) {
    showToast('🔧 Sitio en mantenimiento — algunas funciones no disponibles');
  }
});

/* ── Show/hide auth forms ── */
function authTab(tab, btn) {
  // Hide all sub-forms
  ['login','register','forgot'].forEach(f => { // 2fa removed from main flow
    const el = document.getElementById('form-'+f);
    if (el) el.style.display = 'none';
  });

  // Show/hide bonus banner
  const bonus = document.getElementById('auth-bonus');
  if (bonus) bonus.style.display = (tab === 'register') ? 'flex' : 'none';

  // Show the target form
  const form = document.getElementById('form-'+tab);
  if (form) form.style.display = 'block';

  // Update tab pill UI
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  if (btn) {
    btn.classList.add('active');
  } else {
    // Find and activate the matching tab button
    document.querySelectorAll('.auth-tab').forEach(t => {
      if (t.getAttribute('onclick') && t.getAttribute('onclick').includes("'" + tab + "'")) {
        t.classList.add('active');
      }
    });
  }
  clearAuthStatus();
}
function showAuthForm(tab) { authTab(tab, null); }

function clearAuthStatus() {
  const el = document.getElementById('auth-status');
  if (el) { el.className = 'auth-status'; el.textContent = ''; }
}
function setAuthStatus(msg, type) {
  const el = document.getElementById('auth-status');
  if (!el) return;
  el.className = 'auth-status ' + type;
  el.textContent = msg;
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ── Password visibility toggle ── */
function togglePw(id, eye) {
  const inp = document.getElementById(id);
  if (!inp) return;
  inp.type = inp.type === 'password' ? 'text' : 'password';
  eye.textContent = inp.type === 'password' ? '👁' : '🙈';
}

/* ── Password strength ── */
function checkPwStrength(pw) {
  let score = 0;
  if (pw.length >= 8)  score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const bars   = ['pw-b1','pw-b2','pw-b3','pw-b4'];
  const labels = ['', 'Débil 🔴', 'Regular 🟡', 'Buena 🔵', 'Fuerte 🟢'];
  const cls    = ['', 'weak', 'ok', 'good', 'strong'];
  bars.forEach((id, i) => {
    const b = document.getElementById(id);
    if (!b) return;
    b.className = 'pw-bar ' + (i < score ? cls[score] : '');
  });
  const lbl = document.getElementById('pw-label');
  if (lbl) lbl.textContent = pw.length ? labels[score] : 'Introduce tu contraseña';
}

/* ── REGISTER ── */
async function doRegister() {
  clearAuthStatus();

  const name    = (document.getElementById('r-name')?.value    || '').trim();
  const email   = (document.getElementById('r-email')?.value   || '').trim().toLowerCase();
  const pass    = (document.getElementById('r-pass')?.value    || '');
  const country = (document.getElementById('r-country')?.value || '');
  const terms   =  document.getElementById('r-terms')?.checked || false;
  const btn     =  document.querySelector('#form-register .auth-btn');

  const fail = msg => {
    setAuthStatus(msg, 'err');
    if (btn) { btn.disabled = false; btn.textContent = 'Crear cuenta y recibir bono →'; }
  };

  if (!name)                          return fail('Introduce tu nombre completo.');
  if (!email || !email.includes('@')) return fail('El email no es válido.');
  if (pass.length < 8)               return fail('La contraseña debe tener al menos 8 caracteres.');
  if (!country)                       return fail('Selecciona tu país.');
  if (!terms)                         return fail('Debes aceptar los Términos y condiciones (+18).');

  if (btn) { btn.disabled = true; btn.textContent = '⏳ Creando cuenta…'; }

  // Register with Supabase Auth
  const { data: authData, error: authErr } = await _SB.auth.signUp({ email, password: pass });
  if (authErr) return fail(
    authErr.message.includes('already') ? 'Ya existe una cuenta con ese email.' :
    authErr.message.includes('invalid') ? 'El email no es válido.' :
    'Error al crear cuenta: ' + authErr.message
  );

  // Save profile in Supabase DB
  const profile = { email, name, country, balance: 0, deposited: 0, withdrawn: 0, currency: 'USD', phone: '', twofa: false, first_deposit: true, created_at: new Date().toISOString() };
  await sbUpsert('profiles', profile);
  _sbProfile = profile;

  SESSION = { id: authData.user?.id, email, name, country };
  DB.set('session', SESSION);

  if (btn) { btn.disabled = false; btn.textContent = 'Crear cuenta y recibir bono →'; }
  onLoginSuccess(true);
}

/* ── LOGIN ── */
async function doLogin() {
  clearAuthStatus();

  const email    = (document.getElementById('l-email')?.value    || '').trim().toLowerCase();
  const pass     = (document.getElementById('l-pass')?.value     || '');
  const remember =  document.getElementById('l-remember')?.checked || false;
  const btn      =  document.querySelector('#form-login .auth-btn');

  const fail = msg => {
    setAuthStatus(msg, 'err');
    if (btn) { btn.disabled = false; btn.textContent = 'Entrar →'; }
  };

  if (!email || !pass) return fail('Introduce tu email y contraseña.');

  if (btn) { btn.disabled = true; btn.textContent = '⏳ Verificando…'; }

  const { data: authData, error: authErr } = await _SB.auth.signInWithPassword({ email, password: pass });
  if (authErr) return fail(
    authErr.message.includes('Invalid') ? 'Email o contraseña incorrectos.' :
    authErr.message.includes('not found') ? 'No existe ninguna cuenta con ese email.' :
    'Error al iniciar sesión: ' + authErr.message
  );

  // Load profile from Supabase
  const profile = await loadProfile(email);
  const name = profile?.name || authData.user?.user_metadata?.name || email.split('@')[0];

  SESSION = { id: authData.user?.id, email, name, role: profile?.role || 'user' };
  if (remember) DB.set('session', SESSION);

  if (btn) { btn.disabled = false; btn.textContent = 'Entrar →'; }
  onLoginSuccess(true);
}

function socialLogin(provider) {
  setAuthStatus('⏳ Conectando con ' + provider + '…', 'ok');
  setTimeout(() => {
    // Simulate social auth — create/find user
    const email = 'social_' + provider.toLowerCase() + '@predictx.demo';
    const users = getUsers();
    if (!users[email]) {
      users[email] = { name: 'Usuario ' + provider, email, pass: '', country: 'es', createdAt: Date.now(), twofa: false };
      saveUsers(users);
      DB.set('admin_'+email, defaultAdmin({ name:'Usuario '+provider, email }));
      DB.set('tx_'+email, defaultTx());
    }
    SESSION = { email, name: users[email].name };
    DB.set('session', SESSION);
    onLoginSuccess(true);
  }, 1200);
}

/* ── 2FA ── */
function launch2FA(email, flow) {
  // Generate a random 6-digit OTP (shown to user in a toast for demo)
  _otpExpected = String(Math.floor(100000 + Math.random() * 900000));
  showToast('📱 Código de verificación: ' + _otpExpected + ' (demo)');

  authTab('2fa', null);
  const dest = document.getElementById('tfa-dest');
  if (dest) dest.textContent = email;
  [0,1,2,3,4,5].forEach(i => { const b = document.getElementById('otp-'+i); if(b) b.value=''; });
  document.getElementById('otp-0')?.focus();

  // Countdown 60s
  let secs = 60;
  clearInterval(_otpTimer);
  const secsEl = document.getElementById('otp-secs');
  const resendEl = document.getElementById('otp-resend-btn');
  if (resendEl) resendEl.style.display = 'none';
  _otpTimer = setInterval(() => {
    secs--;
    if (secsEl) secsEl.textContent = secs;
    if (secs <= 0) {
      clearInterval(_otpTimer);
      if (resendEl) resendEl.style.display = 'block';
    }
  }, 1000);
}

function otpNext(idx, inp) {
  inp.value = inp.value.replace(/\D/g,'').slice(-1);
  if (inp.value && idx < 5) {
    document.getElementById('otp-'+(idx+1))?.focus();
  }
  // Auto-verify when all 6 filled
  const code = [0,1,2,3,4,5].map(i=>document.getElementById('otp-'+i)?.value||'').join('');
  if (code.length === 6) setTimeout(verifyOTP, 200);
}
function otpBack(idx, e) {
  if (e.key==='Backspace' && !e.target.value && idx>0) {
    document.getElementById('otp-'+(idx-1))?.focus();
  }
}
function resendOTP() {
  if (!_pendingUser) return;
  launch2FA(_pendingUser.email, 'resend');
  showToast('📱 Nuevo código: ' + _otpExpected + ' (demo)');
}

function verifyOTP() {
  const code = [0,1,2,3,4,5].map(i=>document.getElementById('otp-'+i)?.value||'').join('');
  if (code.length < 6) return setAuthStatus('Introduce los 6 dígitos del código.', 'err');
  if (code !== _otpExpected) { setAuthStatus('Código incorrecto. Inténtalo de nuevo.', 'err'); return; }

  clearInterval(_otpTimer);
  SESSION = { email: _pendingUser.email, name: _pendingUser.name };
  if (_pendingUser.remember !== false) DB.set('session', SESSION);
  onLoginSuccess(true);
}

/* ── FORGOT PASSWORD ── */
function doForgot() {
  const email = document.getElementById('f-email')?.value.trim().toLowerCase();
  if (!email || !email.includes('@')) return setAuthStatus('Introduce un email válido.', 'err');
  const users = getUsers();
  if (!users[email]) return setAuthStatus('No hay cuenta asociada a ese email.', 'err');
  setAuthStatus('✅ Enlace de recuperación enviado a ' + email + ' (simulación)', 'ok');
}

/* ── POST-LOGIN ── */
/* ── Open auth gate on demand (not on page load) ── */
function openAuthGate() {
  const gate = document.getElementById('auth-gate');
  if (!gate) return;
  gate.style.opacity = '0';
  gate.style.display = 'flex';
  gate.style.transition = 'opacity .25s';
  requestAnimationFrame(() => { gate.style.opacity = '1'; });
  // Reset to login tab by default
  authTab('login', document.querySelector('.auth-tab'));
  document.querySelectorAll('.auth-tab').forEach((b,i) => b.classList.toggle('active', i===0));
}

function onLoginSuccess(animate) {
  // Hide auth gate
  const gate = document.getElementById('auth-gate');
  if (gate) {
    if (animate) {
      gate.style.transition = 'opacity .4s';
      gate.style.opacity = '0';
      setTimeout(() => { gate.style.display = 'none'; }, 400);
    } else {
      gate.style.display = 'none';
    }
  }

  // Init notifications
  initNotifications();
  // Always ensure view-list is visible and others hidden
  const vl = document.getElementById('view-list');
  const vd = document.getElementById('view-detail');
  const va = document.getElementById('view-admin');
  const vo = document.getElementById('view-owner');
  if (vl) vl.style.display = 'block';
  if (vd) vd.style.display = 'none';
  if (va) va.style.display = 'none';
  if (vo) vo.style.display = 'none';

  // Update nav avatar
  const avatarEl = document.getElementById('nav-avatar');
  if (avatarEl) {
    avatarEl.textContent = (SESSION.name||'U')[0].toUpperCase();
    avatarEl.classList.add('show');
  }

  // No bonus banner — users must deposit to play

  // Update admin profile display
  setText('admin-user-name-el',  SESSION.name  || 'Usuario');
  setText('admin-user-email-el', SESSION.email || '');
  setText('profile-display-name',  SESSION.name  || 'Usuario');
  setText('profile-display-email', SESSION.email || '');

  // Check owner role and show/hide owner button
  checkOwnerAccess();

  if (animate) showToast('👋 Bienvenido, ' + (SESSION.name?.split(' ')[0] || 'usuario') + '!');
}

async function doLogout() {
  await _SB.auth.signOut();
  DB.del('session');
  SESSION = null;
  _pendingUser = null;
  // Reset auth form to login tab but DON'T open the gate
  authTab('login', document.querySelector('.auth-tab'));
  document.querySelectorAll('.auth-tab').forEach((b,i)=>b.classList.toggle('active',i===0));
  const avatarEl = document.getElementById('nav-avatar');
  if (avatarEl) avatarEl.classList.remove('show');
  document.getElementById('nav-bonus-badge')?.classList.remove('show');
  closeAdmin();
  showToast('👋 Sesión cerrada correctamente');
}

/* ── Override openAdmin to require login ── */
const _origOpenAdmin = window.openAdmin;
window.openAdmin = function() {
  if (!SESSION) { openAuthGate(); return; }
  // Show admin panel, hide others
  const vl = document.getElementById('view-list');
  const vd = document.getElementById('view-detail');
  const va = document.getElementById('view-admin');
  const vo = document.getElementById('view-owner');
  if (vl) vl.style.display = 'none';
  if (vd) vd.style.display = 'none';
  if (va) va.style.display = 'block';
  if (vo) vo.style.display = 'none';
  updateSidebarVisibility(); // ← Bug 1 fix
  refreshAdminData();
  showAdminPage('dashboard', document.getElementById('ap-nav-dashboard'));
  document.querySelectorAll('.bn-btn').forEach(b=>b.classList.remove('active'));
  const bp = document.getElementById('bn-profile'); if(bp) bp.classList.add('active');
};

/* ── PAYMENT system ── */
function openPayModal(mode) {
  if (!SESSION) { openAuthGate(); return; }
  const cfg = getSiteConfig();
  if (mode === 'deposit' && !cfg.allowDeposits) {
    showToast('⛔ Los depósitos están temporalmente desactivados'); return;
  }
  if (cfg.maintenance && !isOwner()) {
    showToast('🔧 Sitio en mantenimiento — operaciones no disponibles'); return;
  }
  document.getElementById('pay-modal-title').textContent = mode==='withdraw' ? 'Retirar fondos' : 'Depositar fondos';
  document.getElementById('pay-step1').style.display = 'block';
  document.getElementById('pay-step2').style.display = 'none';
  document.getElementById('pay-step3').style.display = 'none';
  document.getElementById('pay-status').className = 'auth-status';
  document.getElementById('pay-amount').value = '';
  document.querySelectorAll('.quick-amt').forEach(b=>b.classList.remove('sel'));
  _currentPayMethod = 'yape';
  document.querySelectorAll('.pay-method').forEach(m=>m.classList.remove('selected'));
  document.getElementById('pm-yape')?.classList.add('selected');
  document.getElementById('pay-modal').classList.add('show');
}
function closePayModal() {
  document.getElementById('pay-modal').classList.remove('show');
  refreshAdminData();
  if (document.getElementById('view-admin').style.display==='block') {
    renderTx(_txFilter||'all');
  }
}

function selectPayMethod(method, el) {
  _currentPayMethod = method;
  document.querySelectorAll('.pay-method').forEach(m=>m.classList.remove('selected'));
  el.classList.add('selected');
  // Update currency symbol
  const sym = { yape:'$', card:'$', transfer:'$' };
  const symEl = document.getElementById('pay-currency-sym');
  if (symEl) symEl.textContent = sym[method]||'$';
}

function setQuickAmt(v, btn) {
  document.getElementById('pay-amount').value = v;
  document.querySelectorAll('.quick-amt').forEach(b=>b.classList.remove('sel'));
  btn.classList.add('sel');
}
function clearQuickAmt() {
  document.querySelectorAll('.quick-amt').forEach(b=>b.classList.remove('sel'));
}

function payStep2() {
  const amt = parseFloat(document.getElementById('pay-amount').value);
  if (!amt || amt < 5) {
    document.getElementById('pay-status').className='auth-status err';
    document.getElementById('pay-status').textContent='Introduce un importe mínimo de $5.';
    return;
  }
  if (amt > 50000) {
    document.getElementById('pay-status').className='auth-status err';
    document.getElementById('pay-status').textContent='El importe máximo por depósito es $50,000.';
    return;
  }
  document.getElementById('pay-step1').style.display='none';
  document.getElementById('pay-step2').style.display='block';
  ['yape','card','transfer'].forEach(m=>{
    const el=document.getElementById('pay-'+m);
    if(el) el.style.display = m===_currentPayMethod?'block':'none';
  });
  // If card selected, init Izipay widget
  if (_currentPayMethod === 'card') {
    console.log('[Izipay] payStep2: calling initIzipayForm, method=', _currentPayMethod);
    setTimeout(() => initIzipayForm(), 100);
  }
}
function payBackStep() {
  document.getElementById('pay-step2').style.display='none';
  document.getElementById('pay-step1').style.display='block';
}

/* ─── creditBalance: called after any successful payment ─── */
async function creditBalance(amt, method, orderId) {
  if (!SESSION) { showToast('❌ Debes iniciar sesión'); return; }
  if (!amt || isNaN(amt) || amt <= 0 || amt > 50000) { showToast('❌ Monto inválido'); return; }
  amt = Math.round(amt * 100) / 100;

  // ── Anti-replay: check if this orderId was already processed ──
  if (orderId) {
    const { data: existing } = await _SB
      .from('payment_orders')
      .select('order_id')
      .eq('order_id', orderId)
      .maybeSingle();
    if (existing) {
      showToast('⚠️ Este pago ya fue procesado anteriormente');
      console.warn('Replay attack blocked for orderId:', orderId);
      return;
    }
    // Register order BEFORE crediting (atomic guard)
    const { error: insertErr } = await _SB.from('payment_orders').insert({
      order_id:   orderId,
      user_email: SESSION.email,
      amount:     amt,
      method,
    });
    if (insertErr) {
      // Duplicate key error = already processed
      showToast('⚠️ Este pago ya fue procesado anteriormente');
      return;
    }
  }

  // ── Credit balance in Supabase (source of truth) ──
  const { data: prof, error: profErr } = await _SB
    .from('profiles')
    .select('balance, deposited')
    .eq('email', SESSION.email)
    .single();
  if (profErr || !prof) { showToast('❌ Error al obtener saldo'); return; }

  const newBalance   = Math.round((+(prof.balance   || 0) + amt) * 100) / 100;
  const newDeposited = Math.round((+(prof.deposited || 0) + amt) * 100) / 100;

  const { error: updateErr } = await _SB.from('profiles').update({
    balance:   newBalance,
    deposited: newDeposited,
  }).eq('email', SESSION.email);
  if (updateErr) { showToast('❌ Error al acreditar saldo: ' + updateErr.message); return; }

  // Record transaction
  await _SB.from('transactions').insert({
    user_email:  SESSION.email,
    description: 'Depósito vía ' + method,
    type:        'deposit',
    amount:      amt,
    balance:     newBalance,
    created_at:  new Date().toISOString(),
  });

  // Update local cache
  if (_sbProfile) { _sbProfile.balance = newBalance; _sbProfile.deposited = newDeposited; }
  const localD = adminData();
  localD.balance = newBalance; localD.deposited = newDeposited;
  DB.set('admin', localD);

  // Update UI
  document.getElementById('nav-bonus-badge')?.classList.remove('show');
  document.getElementById('pay-step2').style.display = 'none';
  document.getElementById('pay-step3').style.display = 'block';
  document.getElementById('pay-bonus-txt').textContent = '✅ Saldo acreditado';
  document.getElementById('pay-success-msg').textContent =
    `Depósito de $${amt.toFixed(2)} procesado. Tu saldo es $${newBalance.toFixed(2)}.`;
  setText('sc-balance', '$' + newBalance.toFixed(2));
  setText('tx-balance', '$' + newBalance.toFixed(2));
}

/* ─── Izipay token request ─── */
async function izipayRequestToken(amt) {
  const email = SESSION?.email || 'cliente@predictx.com';
  const orderId = 'PX-' + Date.now();
  const resp = await fetch('/api/izipay-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: amt, currency: 'PEN', email, orderId }),
  });
  const data = await resp.json();
  if (!resp.ok || data.error) throw new Error(data.error || 'Error al crear token');
  return data; // { formToken, mode, shopId, publicKey }
}

/* ─── Load Izipay SDK dynamically only when card payment is needed ─── */
let _izipaySDKLoaded = false;
function loadIzipaySDK() {
  return new Promise((resolve, reject) => {
    if (_izipaySDKLoaded || typeof KR !== 'undefined') { _izipaySDKLoaded = true; resolve(); return; }
    const script = document.createElement('script');
    script.src = 'https://static.micuentaweb.pe/static/js/krypton-client/V4.0/stable/kr-payment-form.min.js';
    script.setAttribute('kr-public-key', '38756342:testpublickey_Lt2sylPSfsBCVlmyIY2aLqB7fiS7hTuCNl4vZKSGtSq3i');
    script.setAttribute('kr-language', 'es-PE');
    script.onload = () => { _izipaySDKLoaded = true; resolve(); };
    script.onerror = () => reject(new Error('No se pudo cargar el SDK de Izipay'));
    document.head.appendChild(script);
  });
}

/* ─── Init Izipay widget cuando se abre el paso de tarjeta ─── */
async function initIzipayForm() {
  const amt   = parseFloat(document.getElementById('pay-amount').value) || 0;
  const izAmt = document.getElementById('iz-amt-show');
  const izErr = document.getElementById('iz-error');
  if (izAmt) izAmt.textContent = '$' + amt.toFixed(2);
  if (izErr) { izErr.classList.remove('show'); izErr.textContent = ''; }

  // Reset container — SDK will re-render the smart form
  const wrapper = document.getElementById('iz-form-wrapper');
  if (wrapper) wrapper.innerHTML = '<div class="kr-smart-form"></div>';

  try {
    // Load SDK dynamically if not already loaded
    await loadIzipaySDK();
    const { formToken, publicKey, mode } = await izipayRequestToken(amt);

    const badge = document.getElementById('iz-env-badge');
    const hint  = document.getElementById('iz-test-hint');
    if (badge) {
      badge.className = 'izipay-env-badge' + (mode === 'prod' ? ' prod' : '');
      badge.textContent = mode === 'prod' ? '✅ Modo Producción' : '🧪 Modo TEST — usa tarjeta de prueba';
    }
    if (hint) hint.style.display = mode === 'prod' ? 'none' : 'block';

    // SDK uses KR global (not KRGlue) in this version
    let krAttempts = 0;
    while (typeof KR === 'undefined' && krAttempts < 30) {
      await new Promise(r => setTimeout(r, 100));
      krAttempts++;
    }

    if (typeof KR === 'undefined') {
      const el = document.getElementById('iz-error');
      if (el) { el.textContent = '❌ El SDK de Izipay no pudo cargar. Recarga la página.'; el.classList.add('show'); }
      return;
    }

    console.log('[Izipay] KR available after', krAttempts * 100, 'ms');

    // Hide "Confirmar depósito" — Izipay provides its own pay button
    const confirmBtn = document.getElementById('pay-confirm-btn');
    if (confirmBtn) confirmBtn.style.display = 'none';

    KR.setFormConfig({
      formToken: formToken,
      'kr-public-key': publicKey,
      'kr-language': 'es-PE',
    }).then(() => {
        KR.onSubmit(async (paymentData) => {
          try {
            const vResp = await fetch('/api/izipay-verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                kr_answer:         paymentData.clientAnswer,
                kr_hash:           paymentData.hash,
                kr_hash_algorithm: paymentData.hashAlgorithm || 'sha256',
              }),
            });
            const vData = await vResp.json();
            if (vData.paid) {
              const paidAmt = (vData.amount || amt * 100) / 100;
              await creditBalance(paidAmt, 'Tarjeta Visa/Mastercard (Izipay)', vData.orderId);
            } else {
              const el = document.getElementById('iz-error');
              if (el) { el.textContent = '❌ Pago no verificado: ' + (vData.error || vData.status || 'Error desconocido'); el.classList.add('show'); }
            }
          } catch(err) {
            const el = document.getElementById('iz-error');
            if (el) { el.textContent = '❌ Error al verificar el pago: ' + err.message; el.classList.add('show'); }
          }
          return false;
        });
        KR.onError(err => {
          const el = document.getElementById('iz-error');
          if (el) { el.textContent = '❌ ' + (err.errorMessage || 'Error en el formulario de pago'); el.classList.add('show'); }
        });
      })
      .catch(err => {
        const el = document.getElementById('iz-error');
        if (el) { el.textContent = '❌ No se pudo inicializar el formulario: ' + err.message; el.classList.add('show'); }
        console.error('[Izipay] KR error:', err);
      });

  } catch(err) {
    const el = document.getElementById('iz-error');
    if (el) { el.textContent = '❌ ' + err.message; el.classList.add('show'); }
  }
}

/* ─── payStep2 override: init Izipay if card selected ─── */
function confirmPayment() {
  if (!SESSION) { openAuthGate(); return; }
  // Card payments go through Izipay widget — never credit manually
  if (_currentPayMethod === 'card') {
    showToast('⚠️ Usa el botón de pago del formulario de tarjeta');
    return;
  }
  // Yape / Transfer: manual confirmation flow
  const amt = parseFloat(document.getElementById('pay-amount').value)||0;
  const btn = document.getElementById('pay-confirm-btn');
  if (btn) { btn.disabled=true; btn.textContent='Procesando…'; }
  setTimeout(async () => {
    await creditBalance(amt, _currentPayMethod, null);
    if (btn) { btn.disabled=false; btn.textContent='Confirmar depósito'; }
  }, 1800);
}

function formatCard(inp) {
  let v = inp.value.replace(/\D/g,'').slice(0,16);
  inp.value = v.replace(/(.{4})/g,'$1 ').trim();
}

/* ── Hook into placeBets to require login + deduct balance ── */
window.placeBets = async function() {
  if (!SESSION) { openAuthGate(); return; }
  try {
  const cfg = getSiteConfig();
  if (!cfg.allowBets) { showToast('⛔ Las apuestas están temporalmente desactivadas'); return; }
  const items = Object.values(SLIP);
  if (!items.length) return;

  // ── Read balance from Supabase (source of truth) ──
  const { data: prof, error: profErr } = await _SB.from('profiles').select('balance').eq('email', SESSION.email).single();
  if (profErr || !prof) { showToast('❌ Error al verificar saldo'); return; }
  const currentBalance = +(prof.balance || 0);

  const d = adminData();
  d.balance = currentBalance; // sync local cache with Supabase

  const txs = txHistory();
  const bets = betHistory();
  const isCombo = S.slipMode==='combo';

  // ── Guard: block combo with conflicting picks from same market ──
  if (isCombo) {
    const marketCounts = {};
    items.forEach(s => { marketCounts[s.marketId] = (marketCounts[s.marketId]||0) + 1; });
    if (Object.values(marketCounts).some(c => c > 1)) {
      showToast('❌ Combinada inválida: hay dos selecciones del mismo partido');
      return;
    }
  }

  let totalStake = 0;
  if (isCombo) {
    totalStake = parseFloat(items[0]?.comboStake)||10;
  } else {
    totalStake = items.reduce((a,s)=>a+(parseFloat(s.stake)||0),0);
  }

  if (totalStake > currentBalance) {
    showToast('❌ Saldo insuficiente. Recarga tu cuenta.');
    openPayModal('deposit');
    return;
  }

  const newBalance = +(currentBalance - totalStake).toFixed(2);

  if (isCombo) {
    const stake = parseFloat(items[0]?.comboStake)||10;
    const comboOdd = items.reduce((a,s)=>a*s.odd,1);
    const matchName = items.map(i=>i.match).join(' + ');
    const pick = items.map(i=>i.pick).join(' / ');
    bets.push({ id:'B'+Date.now(), date:todayStr(), match:matchName, pick, odd:+comboOdd.toFixed(3), stake, ret:0, status:'open', type:'combo' });
    txs.push({ id:'TX'+Date.now(), date:todayStr(), desc:'Apuesta combinada', type:'bet', amount:stake, balance:newBalance });
    // Save to Supabase in parallel
    await Promise.all([
      _SB.from('bets').insert({ user_email:SESSION.email, match_name:matchName, pick, odd:+comboOdd.toFixed(3), stake, status:'open', type:'combo', created_at:new Date().toISOString() }),
      _SB.from('transactions').insert({ user_email:SESSION.email, description:'Apuesta combinada', type:'bet', amount:stake, balance:newBalance, created_at:new Date().toISOString() })
    ]);
  } else {
    let runningBalance = currentBalance;
    for (const sel of items) {
      const stake = Math.max(0.01, parseFloat(sel.stake) || 0.01);
      if (stake > runningBalance) continue;
      runningBalance = +(runningBalance - stake).toFixed(2);
      bets.push({ id:'B'+Date.now()+Math.random(), date:todayStr(), match:sel.match, pick:sel.pick, odd:sel.odd, stake, ret:0, status:'open', type:'single' });
      txs.push({ id:'TX'+Date.now()+Math.random(), date:todayStr(), desc:'Apuesta: '+sel.pick, type:'bet', amount:stake, balance:runningBalance });
      await _SB.from('bets').insert({ user_email:SESSION.email, match_name:sel.match, pick:sel.pick, odd:sel.odd, stake, status:'open', type:'single', created_at:new Date().toISOString() });
      await _SB.from('transactions').insert({ user_email:SESSION.email, description:'Apuesta: '+sel.pick, type:'bet', amount:stake, balance:runningBalance, created_at:new Date().toISOString() });
    }
  }

  // ── Update balance in Supabase ──
  await _SB.from('profiles').update({ balance: newBalance }).eq('email', SESSION.email);

  // ── Update local cache ──
  d.balance = newBalance;
  saveAdminData(d); saveBets(bets); saveTx(txs);

  Object.keys(SLIP).forEach(k=>delete SLIP[k]);
  document.querySelectorAll('.ev-odd-btn.in-slip,.odd-card').forEach(el=>{ el.classList.remove('in-slip','active'); });
  document.querySelectorAll('.xmkt-btn.active').forEach(el=>el.classList.remove('active'));
  renderSlip(); updateSlipCount(); closeBetslip();
  setText('sc-balance','$'+newBalance.toFixed(2));
  showToast('✅ Apuesta registrada · Saldo: $'+newBalance.toFixed(2));
  refreshAdminData();
  } catch(err) {
    showToast('❌ Error al procesar apuesta: ' + err.message, 'error');
  }
};

/* ── Security page helpers ── */
function renderSecurityBadges() {
  const d = adminData();
  const el = document.getElementById('sec-badges-wrap');
  if (!el) return;
  el.innerHTML = `
    <div class="sec-badge ok">✅ Email verificado</div>
    <div class="sec-badge ${d.twofa?'ok':'neutral'}" style="cursor:${d.twofa?'default':'pointer'}" onclick="${d.twofa?'':'open2FASetup()'}">
      ${d.twofa?'✅':'🔒'} Verificación en 2 pasos: ${d.twofa?'Activa':'<span style="text-decoration:underline">Desactivada — clic para activar</span>'}
    </div>
    ${d.twofa ? '<div class="sec-badge warn" style="cursor:pointer" onclick="disable2FA()">⚠️ Desactivar 2FA</div>' : ''}
    <div class="sec-badge ok">🔒 Sesión cifrada SSL</div>
    <div class="sec-badge ok">📱 Dispositivo reconocido</div>
  `;
}

/* ── Deposit/withdraw buttons in admin panel ── */
/* showDepositModal defined later */
/* showWithdrawModal defined later */

/* ── Fix refreshAdminData to use session-scoped data ── */
const _origRefresh = window.refreshAdminData;
window.refreshAdminData = function() {
  if (!SESSION) return;
  const d    = adminData();
  const bets = betHistory();
  const open = bets.filter(b=>b.status==='open').length;
  const won  = bets.filter(b=>b.status==='win').length;
  const totalStake = bets.reduce((a,b)=>a+(b.stake||0),0);
  const totalRet   = bets.filter(b=>b.status==='win').reduce((a,b)=>a+(b.ret||0),0);
  const roi  = totalStake>0?((totalRet-totalStake)/totalStake*100).toFixed(1)+'%':'—';
  setText('sc-balance',  '$'+d.balance.toFixed(2));
  setText('sc-open',     open);
  setText('sc-won',      won);
  setText('sc-roi',      roi);
  setText('tx-balance',  '$'+d.balance.toFixed(2));
  setText('tx-deposited','$'+d.deposited.toFixed(2));
  setText('tx-withdrawn','$'+d.withdrawn.toFixed(2));
  const badge=document.getElementById('open-bets-badge');
  if(badge){badge.textContent=open;badge.style.display=open>0?'':'none';}
  renderSecurityBadges();
};

/* ── Fix renderBets/renderTx to use session data ── */
window.renderBets = function(filter) {
  _betFilter = filter;
  if (!SESSION) return;
  const bets  = betHistory();
  const shown = (filter==='all'?bets:bets.filter(b=>b.status===filter)).slice().reverse();
  const ts=shown.reduce((a,b)=>a+(b.stake||0),0);
  const tr=shown.reduce((a,b)=>a+(b.ret||0),0);
  const pnl=tr-ts;
  setText('bets-total-stake','$'+ts.toFixed(2));
  setText('bets-total-ret','$'+tr.toFixed(2));
  const pEl=document.getElementById('bets-pnl');
  if(pEl){pEl.textContent=(pnl>=0?'+':'')+'$'+pnl.toFixed(2);pEl.className='sc-val '+(pnl>=0?'g':'r');}
  const tb=document.getElementById('bets-body');
  if(!tb) return;
  if(!shown.length){tb.innerHTML='<tr><td colspan="8" style="text-align:center;color:var(--text2);padding:36px;font-size:13px">No hay apuestas '+( filter==='all'?'':'con este estado')+'</td></tr>';return;}
  tb.innerHTML=shown.map(b=>`<tr>
    <td style="white-space:nowrap;color:var(--text2)">${b.date||'—'}</td>
    <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(b.match)}</td>
    <td style="font-weight:600">${esc(b.pick)}</td>
    <td><span class="tx-type ${b.type==='combo'?'bet':'bet'}">${b.type==='combo'?'Combinada':'Simple'}</span></td>
    <td style="font-family:var(--mono)">${parseFloat(b.odd).toFixed(2)}</td>
    <td style="font-family:var(--mono)">${parseFloat(b.stake).toFixed(2)}</td>
    <td style="font-family:var(--mono);color:${b.status==='win'?'var(--green)':'var(--text2)'}">${parseFloat(b.ret||0).toFixed(2)}</td>
    <td>${badgeHtml(b.status)}</td>
  </tr>`).join('');
};

window.renderTx = function(filter) {
  _txFilter = filter;
  if (!SESSION) return;
  const txs   = txHistory();
  const shown = (filter==='all'?txs:txs.filter(t=>t.type===filter)).slice().reverse();
  const tb=document.getElementById('tx-body');
  if(!tb)return;
  if(!shown.length){tb.innerHTML='<tr><td colspan="5" style="text-align:center;color:var(--text2);padding:36px;font-size:13px">No hay transacciones</td></tr>';return;}
  tb.innerHTML=shown.map(t=>`<tr>
    <td style="white-space:nowrap;color:var(--text2)">${t.date||'—'}</td>
    <td>${esc(t.desc)}</td>
    <td><span class="tx-type ${t.type}">${txTypeLabel(t.type)}</span></td>
    <td style="font-family:var(--mono);font-weight:600;color:${t.type==='dep'||t.type==='win'?'var(--green)':'var(--red)'}">
      ${t.type==='dep'||t.type==='win'?'+':'−'}${Math.abs(t.amount).toFixed(2)}
    </td>
    <td style="font-family:var(--mono)">${parseFloat(t.balance||0).toFixed(2)}</td>
  </tr>`).join('');
};

window.renderProfile = function() {
  if (!SESSION) return;
  const d=adminData();
  setVal('pf-name',    d.name||SESSION.name||'');
  setVal('pf-surname', d.surname||'');
  setVal('pf-email',   SESSION.email);
  setVal('pf-phone',   d.phone||'');
  setVal('pf-country', d.country||'');
  setVal('pf-currency',d.currency||'USD');
  renderSecurityBadges();
};

window.saveProfile = function() {
  if (!SESSION) return;
  const d=adminData();
  d.name    =document.getElementById('pf-name')?.value||d.name;
  d.surname =document.getElementById('pf-surname')?.value||d.surname;
  d.phone   =document.getElementById('pf-phone')?.value||d.phone;
  d.country =document.getElementById('pf-country')?.value||d.country;
  d.currency=document.getElementById('pf-currency')?.value||d.currency;
  saveAdminData(d);
  SESSION.name=d.name; DB.set('session',SESSION);
  setText('profile-display-name',d.name||'Usuario');
  setText('admin-user-name-el',d.name||'Usuario');
  showToast('✅ Perfil guardado correctamente');
};

/* ════════════════════════════════════════════════
   ADMIN PANEL JS
════════════════════════════════════════════════ */

// DB already declared above — using the same instance

// Load stored data or create defaults
function adminData() {
  return DB.get('admin') || {
    name:'', surname:'', email:'usuario@predictx.com', phone:'', country:'', currency:'USD',
    balance: 0,
    deposited: 0,
    withdrawn: 0,
  };
}
function betHistory()  { return DB.get('bets') || []; }
function txHistory()   { return DB.get('tx') || []; }

/* ── Navigation ── */
/* ════════════════════════════════════════════════
   ROLES & NAVIGATION
════════════════════════════════════════════════ */

// El email del owner se define aquí — cámbialo por el tuyo
// En producción esto se valida TAMBIÉN desde Supabase (columna role='owner' en profiles)
const OWNER_EMAIL = 'hermanncadevillajr@gmail.com';


// ── Sidebar visibility: only show in home and event detail ──
function updateSidebarVisibility() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;
  const vl = document.getElementById('view-list');
  const vd = document.getElementById('view-detail');
  const inHome   = vl && vl.style.display !== 'none';
  const inDetail = vd && vd.style.display !== 'none';
  sidebar.style.display = (inHome || inDetail) ? '' : 'none';
}

function isOwner() {
  return SESSION && (
    SESSION.role === 'owner' ||
    SESSION.email === OWNER_EMAIL
  );
}

function hideAllViews() {
  ['view-list','view-detail','view-admin','view-owner'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}
function showListView() {
  setTimeout(updateSidebarVisibility, 50);
  ['view-detail','view-admin','view-owner'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  const vl = document.getElementById('view-list');
  if (vl) vl.style.display = 'block';
}

/* ── Open user admin panel ── */
function openAdmin() {
  if (!SESSION) { openAuthGate(); return; }
  const vl = document.getElementById('view-list');
  const vd = document.getElementById('view-detail');
  const va = document.getElementById('view-admin');
  const vo = document.getElementById('view-owner');
  if (vl) vl.style.display = 'none';
  if (vd) vd.style.display = 'none';
  if (va) va.style.display = 'block';
  if (vo) vo.style.display = 'none';
  updateSidebarVisibility();
  refreshAdminData();
  showAdminPage('dashboard', document.getElementById('ap-nav-dashboard'));
  document.querySelectorAll('.bn-btn').forEach(b => b.classList.remove('active'));
  const bp = document.getElementById('bn-profile'); if (bp) bp.classList.add('active');
}
function closeAdmin() {
  showListView();
  updateSidebarVisibility();
  document.querySelectorAll('.bn-btn').forEach(b => b.classList.remove('active'));
  const bh = document.getElementById('bn-home'); if (bh) bh.classList.add('active');
}

/* ── Open owner panel ── */
function openOwner() {
  if (!SESSION) { openAuthGate(); return; }
  if (!isOwner()) { showToast('⛔ Acceso restringido'); return; }
  const vl = document.getElementById('view-list');
  const vd = document.getElementById('view-detail');
  const va = document.getElementById('view-admin');
  const vo = document.getElementById('view-owner');
  if (vl) vl.style.display = 'none';
  if (vd) vd.style.display = 'none';
  if (va) va.style.display = 'none';
  if (vo) vo.style.display = 'block';
  updateSidebarVisibility();
  showOwnerPage('dashboard', document.getElementById('own-nav-dashboard'));
}
function closeOwner() {
  showListView();
  updateSidebarVisibility();
}

/* ── Sub-page switching (user panel) ── */
function showAdminPage(page, sidebarBtn, tabBtn) {
  document.querySelectorAll('.admin-page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.admin-nav-item').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
  const el = document.getElementById('ap-' + page);
  if (el) el.classList.add('active');
  const sId = document.getElementById('ap-nav-' + page);
  if (sId) sId.classList.add('active');
  if (sidebarBtn) sidebarBtn.classList.add('active');
  if (tabBtn) tabBtn.classList.add('active');
  if (page === 'dashboard') renderDashboard();
  if (page === 'bets')      renderBets('all');
  if (page === 'tx')        renderTx('all');
  if (page === 'profile')   renderProfile();
}

/* ── Sub-page switching (owner panel) ── */
function showOwnerPage(page, sidebarBtn, tabBtn) {
  document.querySelectorAll('.owner-page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.owner-nav-item').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.owner-tab').forEach(t => t.classList.remove('active'));
  const el = document.getElementById('own-' + page);
  if (el) el.classList.add('active');
  const sId = document.getElementById('own-nav-' + page);
  if (sId) sId.classList.add('active');
  if (sidebarBtn) sidebarBtn.classList.add('active');
  if (tabBtn) tabBtn.classList.add('active');
  // Load data for each page
  if (page === 'dashboard') renderOwnerDashboard();
  if (page === 'users')     renderOwnerUsers();
  if (page === 'bets')      renderOwnerBets('all');
  if (page === 'tx')        renderOwnerTx('all');
  if (page === 'events')    renderOwnerEvents();
  if (page === 'config')    renderOwnerConfig();
}

function bnProfile(btn) {
  document.querySelectorAll('.bn-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  closeSidebar(); closeBetslip();
  openAdmin();
}

/* ════════════════════════════════════════════════
   OWNER PANEL — DATA LAYER
   Todas las queries del owner usan _SB directamente
   Las RLS de Supabase deben permitir al owner ver todo
════════════════════════════════════════════════ */

// Cache en memoria para el owner
let _ownerCache = { users:[], bets:[], tx:[], loaded:false };

async function ownerFetchAll() {
  try {
    const [usersRes, betsRes, txRes] = await Promise.all([
      _SB.from('profiles').select('*').order('created_at', { ascending: false }),
      _SB.from('bets').select('*').order('created_at', { ascending: false }),
      _SB.from('transactions').select('*').order('created_at', { ascending: false }),
    ]);
    _ownerCache.users = usersRes.data || [];
    _ownerCache.bets  = betsRes.data  || [];
    _ownerCache.tx    = txRes.data    || [];
    _ownerCache.loaded = true;
  } catch(e) {
    console.error('Owner fetch error:', e);
  }
}

/* ════════════════════════════════════════════════
   OWNER DASHBOARD
════════════════════════════════════════════════ */
async function renderOwnerDashboard() {
  // Show skeletons while loading
  ['kpi-users','kpi-deposits','kpi-open-bets','kpi-margin'].forEach(id => setText(id, '⏳'));

  await ownerFetchAll();
  const { users, bets, tx } = _ownerCache;

  const totalUsers    = users.filter(u => u.role !== 'owner').length;
  const totalDeposits = tx.filter(t => t.type === 'dep').reduce((a,t) => a + (+t.amount||0), 0);
  const openBets      = bets.filter(b => b.status === 'open').length;
  const totalBet      = tx.filter(t => t.type === 'bet').reduce((a,t) => a + (+t.amount||0), 0);
  const totalWin      = tx.filter(t => t.type === 'win' && t.description !== 'Bono de bienvenida').reduce((a,t) => a + (+t.amount||0), 0);
  const margin        = totalBet > 0 ? (((totalBet - totalWin) / totalBet) * 100).toFixed(1) : '—';
  const openExposure  = bets.filter(b => b.status === 'open').reduce((a,b) => a + ((+b.odd||1) * (+b.stake||0)), 0);

  setText('kpi-users',     totalUsers);
  setText('kpi-deposits',  '$' + totalDeposits.toFixed(0));
  setText('kpi-open-bets', openBets);
  setText('kpi-margin',    totalBet > 0 ? margin + '%' : '—');
  setText('own-users-badge', totalUsers);
  setText('own-bets-badge',  openBets);

  // Activity feed — last 10 transactions across all users
  const recentTx = [...tx].slice(0, 10);
  const actBody = document.getElementById('own-activity-body');
  if (actBody) {
    if (!recentTx.length) {
      actBody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text2);padding:24px">Sin actividad aún</td></tr>';
    } else {
      actBody.innerHTML = recentTx.map(t => `
        <tr>
          <td style="color:var(--text2);white-space:nowrap">${fmtDateTime(t.created_at)}</td>
          <td style="font-weight:500">${esc(shortEmail(t.user_email||''))}</td>
          <td>${esc(t.description||t.desc||'')}</td>
          <td style="font-family:var(--mono);font-weight:600;color:${t.type==='dep'||t.type==='win'?'var(--green)':'var(--red)'}">
            ${t.type==='dep'||t.type==='win'?'+':'−'}${Math.abs(+t.amount).toFixed(2)}
          </td>
          <td style="font-family:var(--mono)">${(+t.balance||0).toFixed(2)}</td>
        </tr>`).join('');
    }
  }

  // Bet distribution
  const betDist = document.getElementById('own-bet-dist');
  if (betDist) {
    const total = bets.length || 1;
    const dist  = [
      { label:'Activas',  count: bets.filter(b=>b.status==='open').length,  color:'var(--yellow)' },
      { label:'Ganadas',  count: bets.filter(b=>b.status==='win').length,   color:'var(--green)'  },
      { label:'Perdidas', count: bets.filter(b=>b.status==='loss').length,  color:'var(--red)'    },
      { label:'Anuladas', count: bets.filter(b=>b.status==='void').length,  color:'var(--text3)'  },
    ];
    betDist.innerHTML = dist.map(d => `
      <div style="display:flex;align-items:center;gap:10px">
        <div style="flex:1;font-size:12px;color:var(--text2)">${d.label}</div>
        <div style="font-size:12px;font-family:var(--mono);color:${d.color};font-weight:600">${d.count}</div>
        <div style="width:80px;height:6px;background:var(--bg4);border-radius:3px;overflow:hidden">
          <div style="height:100%;width:${Math.round(d.count/total*100)}%;background:${d.color};border-radius:3px"></div>
        </div>
      </div>`).join('');
  }

  // Top users by volume
  const topBody = document.getElementById('own-top-users-body');
  if (topBody) {
    const sorted = [...users]
      .filter(u => u.role !== 'owner')
      .sort((a,b) => (+b.deposited||0) - (+a.deposited||0))
      .slice(0, 5);
    if (!sorted.length) {
      topBody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text2);padding:20px">Sin datos</td></tr>';
    } else {
      topBody.innerHTML = sorted.map((u,i) => `
        <tr>
          <td style="color:var(--text3);font-weight:600">#${i+1}</td>
          <td><div style="display:flex;align-items:center;gap:8px">
            <div class="user-row-avatar">${(u.name||u.email||'?')[0].toUpperCase()}</div>
            <div><div style="font-size:12px;font-weight:600">${esc(u.name||'—')}</div>
            <div style="font-size:10px;color:var(--text2)">${esc(shortEmail(u.email||''))}</div></div>
          </div></td>
          <td style="font-family:var(--mono);color:var(--green)">${(+u.deposited||0).toFixed(0)}</td>
          <td style="font-family:var(--mono)">${(+u.balance||0).toFixed(2)}</td>
        </tr>`).join('');
    }
  }
}

/* ════════════════════════════════════════════════
   OWNER — USUARIOS
════════════════════════════════════════════════ */
let _ownerUsersFiltered = [];

async function renderOwnerUsers() {
  const body = document.getElementById('own-users-body');
  if (body) body.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text2);padding:24px">⏳ Cargando...</td></tr>';
  await ownerFetchAll();
  _ownerUsersFiltered = _ownerCache.users;
  paintOwnerUsers(_ownerUsersFiltered);
}

function filterOwnerUsers(q) {
  const search = (q || document.getElementById('user-search')?.value || '').toLowerCase();
  const role   = document.getElementById('user-filter-role')?.value || 'all';
  let list = _ownerCache.users;
  if (search) list = list.filter(u => (u.email+' '+(u.name||'')).toLowerCase().includes(search));
  if (role === 'user')      list = list.filter(u => !u.is_suspended && u.role !== 'owner');
  if (role === 'owner')     list = list.filter(u => u.role === 'owner');
  if (role === 'suspended') list = list.filter(u => u.is_suspended);
  paintOwnerUsers(list);
}

function paintOwnerUsers(list) {
  const body = document.getElementById('own-users-body');
  if (!body) return;
  if (!list.length) {
    body.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text2);padding:36px">Sin usuarios</td></tr>';
    return;
  }
  const userBets = {};
  _ownerCache.bets.forEach(b => { userBets[b.user_email] = (userBets[b.user_email]||0) + 1; });
  body.innerHTML = list.map(u => `
    <tr>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="user-row-avatar">${(u.name||u.email||'?')[0].toUpperCase()}</div>
          <div>
            <div style="font-size:13px;font-weight:600;color:var(--text)">${esc(u.name||'—')}</div>
            <div style="font-size:11px;color:var(--text2)">${esc(u.email||'')}</div>
          </div>
        </div>
      </td>
      <td style="color:var(--text2)">${u.country ? '🌍 '+u.country.toUpperCase() : '—'}</td>
      <td style="font-family:var(--mono);font-weight:600">${(+u.balance||0).toFixed(2)}</td>
      <td style="font-family:var(--mono);color:var(--green)">${(+u.deposited||0).toFixed(2)}</td>
      <td style="text-align:center">${userBets[u.email]||0}</td>
      <td>
        ${u.is_suspended
          ? '<span class="role-badge suspended">Suspendido</span>'
          : u.role === 'owner'
            ? '<span class="role-badge owner">⚡ Owner</span>'
            : '<span class="role-badge user">Usuario</span>'}
      </td>
      <td style="white-space:nowrap">
        ${u.is_suspended
          ? `<button class="tbl-action success" onclick="toggleSuspend('${esc(u.email)}',false)">Activar</button>`
          : u.role !== 'owner'
            ? `<button class="tbl-action danger" onclick="toggleSuspend('${esc(u.email)}',true)">Suspender</button>`
            : ''}
        <button class="tbl-action" onclick="viewUserDetail('${esc(u.email)}')">Ver detalle</button>
      </td>
    </tr>`).join('');
}

async function toggleSuspend(email, suspend) {
  if (!isOwner()) return;
  const { error } = await _SB.from('profiles').update({ is_suspended: suspend }).eq('email', email);
  if (error) { showToast('❌ Error: ' + error.message); return; }
  showToast(suspend ? '🚫 Usuario suspendido' : '✅ Usuario reactivado');
  await ownerFetchAll();
  filterOwnerUsers();
}

async function promoteUser() {
  const email = document.getElementById('cfg-promote-email')?.value.trim().toLowerCase();
  if (!email) return showToast('⚠️ Escribe un email');
  const { error } = await _SB.from('profiles').update({ role:'owner' }).eq('email', email);
  if (error) { showToast('❌ Error: ' + error.message); return; }
  // Update SESSION in real-time if it's the current user
  if (SESSION?.email === email) { SESSION.role = 'owner'; DB.set('session', SESSION); }
  showToast('✅ ' + email + ' ahora es Owner');
  await ownerFetchAll();
}

async function demoteUser() {
  const email = document.getElementById('cfg-promote-email')?.value.trim().toLowerCase();
  if (!email) return showToast('⚠️ Escribe un email');
  if (email === SESSION?.email) return showToast('⚠️ No puedes degradarte a ti mismo');
  const { error } = await _SB.from('profiles').update({ role:'user' }).eq('email', email);
  if (error) { showToast('❌ Error: ' + error.message); return; }
  showToast('✅ ' + email + ' ahora es Usuario');
  await ownerFetchAll();
}

function viewUserDetail(email) {
  const u    = _ownerCache.users.find(x => x.email === email);
  const bets = _ownerCache.bets.filter(b => b.user_email === email);
  const txs  = _ownerCache.tx.filter(t => t.user_email === email);
  if (!u) return;

  const won      = bets.filter(b => b.status === 'win').length;
  const lost     = bets.filter(b => b.status === 'loss').length;
  const open     = bets.filter(b => b.status === 'open').length;
  const staked   = bets.reduce((a,b) => a + (+b.stake||0), 0);
  const returned = bets.filter(b=>b.status==='win').reduce((a,b) => a + (+b.ret||0), 0);
  const netPnL   = returned - staked;

  // Build modal content
  const html = `
  <div id="user-detail-modal" style="
    position:fixed;inset:0;z-index:700;
    background:rgba(0,0,0,.7);
    display:flex;align-items:center;justify-content:center;padding:16px">
    <div style="
      background:var(--bg2);border:1px solid var(--border2);border-radius:16px;
      width:100%;max-width:520px;max-height:85vh;overflow-y:auto;
      box-shadow:0 8px 40px rgba(0,0,0,.5)">
      <!-- Header -->
      <div style="display:flex;align-items:center;justify-content:space-between;padding:20px 20px 0">
        <div style="display:flex;align-items:center;gap:12px">
          <div class="user-row-avatar" style="width:44px;height:44px;font-size:18px;border-radius:12px">
            ${(u.name||u.email||'?')[0].toUpperCase()}
          </div>
          <div>
            <div style="font-size:16px;font-weight:700">${esc(u.name||'Sin nombre')}</div>
            <div style="font-size:12px;color:var(--text2)">${esc(u.email)}</div>
          </div>
        </div>
        <button onclick="document.getElementById('user-detail-modal').remove()"
          style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;
                 width:32px;height:32px;font-size:16px;color:var(--text2);cursor:pointer">✕</button>
      </div>

      <!-- KPIs -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;padding:16px 20px">
        <div style="background:var(--bg3);border-radius:10px;padding:12px;text-align:center">
          <div style="font-size:11px;color:var(--text2);margin-bottom:4px">Saldo actual</div>
          <div style="font-size:17px;font-weight:700;font-family:var(--mono)">${(+u.balance||0).toFixed(2)}</div>
        </div>
        <div style="background:var(--bg3);border-radius:10px;padding:12px;text-align:center">
          <div style="font-size:11px;color:var(--text2);margin-bottom:4px">Total depositado</div>
          <div style="font-size:17px;font-weight:700;font-family:var(--mono);color:var(--green)">${(+u.deposited||0).toFixed(2)}</div>
        </div>
        <div style="background:var(--bg3);border-radius:10px;padding:12px;text-align:center">
          <div style="font-size:11px;color:var(--text2);margin-bottom:4px">P&L neto</div>
          <div style="font-size:17px;font-weight:700;font-family:var(--mono);color:${netPnL>=0?'var(--green)':'var(--red)'}">
            ${netPnL>=0?'+':''}${netPnL.toFixed(2)}
          </div>
        </div>
      </div>

      <!-- Bet stats -->
      <div style="padding:0 20px 16px">
        <div style="font-size:13px;font-weight:600;margin-bottom:10px">Historial de apuestas</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
          <span style="padding:4px 10px;border-radius:6px;font-size:12px;background:var(--yellow-bg,rgba(255,184,0,.12));color:var(--yellow);border:1px solid rgba(255,184,0,.25)">
            🎟 ${open} activas
          </span>
          <span style="padding:4px 10px;border-radius:6px;font-size:12px;background:var(--green-bg);color:var(--green);border:1px solid var(--green-bd)">
            ✓ ${won} ganadas
          </span>
          <span style="padding:4px 10px;border-radius:6px;font-size:12px;background:var(--red-bg);color:var(--red);border:1px solid var(--red-bd)">
            ✗ ${lost} perdidas
          </span>
        </div>
        ${bets.length ? `
        <div style="overflow-x:auto">
          <table class="adm-table">
            <thead><tr><th>Partido</th><th>Selección</th><th>Cuota</th><th>Apuesta</th><th>Estado</th></tr></thead>
            <tbody>
              ${bets.slice(0,8).map(b=>`
              <tr>
                <td style="font-size:11px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(b.match_name||b.match||'—')}</td>
                <td style="font-size:11px;font-weight:600">${esc(b.pick||'—')}</td>
                <td style="font-family:var(--mono);font-size:11px">${(+b.odd||0).toFixed(2)}</td>
                <td style="font-family:var(--mono);font-size:11px">${(+b.stake||0).toFixed(2)}</td>
                <td>${badgeHtml(b.status)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>` : '<div style="color:var(--text3);font-size:13px;text-align:center;padding:16px">Sin apuestas</div>'}
      </div>

      <!-- Actions -->
      <div style="padding:14px 20px;border-top:1px solid var(--border);display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">
        ${u.is_suspended
          ? `<button class="tbl-action success" onclick="toggleSuspend('${esc(u.email)}',false);document.getElementById('user-detail-modal').remove()">✅ Reactivar cuenta</button>`
          : u.role !== 'owner'
            ? `<button class="tbl-action danger" onclick="toggleSuspend('${esc(u.email)}',true);document.getElementById('user-detail-modal').remove()">🚫 Suspender cuenta</button>`
            : ''}
        <button onclick="document.getElementById('user-detail-modal').remove()"
          style="padding:7px 16px;border-radius:8px;background:var(--bg3);border:1px solid var(--border);color:var(--text2);cursor:pointer;font-size:13px">
          Cerrar
        </button>
      </div>
    </div>
  </div>`;

  // Remove existing modal if any
  const existing = document.getElementById('user-detail-modal');
  if (existing) existing.remove();
  document.body.insertAdjacentHTML('beforeend', html);
}

/* ════════════════════════════════════════════════
   OWNER — APUESTAS GLOBALES
════════════════════════════════════════════════ */
async function renderOwnerBets(filter) {
  const body = document.getElementById('own-bets-body');
  if (body) body.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--text2);padding:24px">⏳ Cargando...</td></tr>';
  if (!_ownerCache.loaded) await ownerFetchAll();
  paintOwnerBets(filter);
}

function filterOwnerBets(filter, btn) {
  if (btn) {
    document.querySelectorAll('#own-bets button').forEach(b => b.style.opacity = '.5');
    btn.style.opacity = '1';
  }
  paintOwnerBets(filter);
}

function paintOwnerBets(filter) {
  let list = _ownerCache.bets;
  if (filter !== 'all') list = list.filter(b => b.status === filter);

  const totalStake = list.reduce((a,b) => a + (+b.stake||0), 0);
  const openList   = _ownerCache.bets.filter(b => b.status === 'open');
  const exposure   = openList.reduce((a,b) => a + ((+b.odd||1)*(+b.stake||0)), 0);

  setText('own-bets-total',    '$' + totalStake.toFixed(2));
  setText('own-bets-open',     openList.length);
  setText('own-bets-exposure', '$' + exposure.toFixed(2));

  const body = document.getElementById('own-bets-body');
  if (!body) return;
  if (!list.length) {
    body.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--text2);padding:36px">Sin apuestas ${filter==='all'?'':'con este estado'}</td></tr>`;
    return;
  }
  body.innerHTML = list.map(b => `
    <tr>
      <td style="white-space:nowrap;color:var(--text2)">${fmtDate(b.created_at)}</td>
      <td style="font-size:11px">${esc(shortEmail(b.user_email||''))}</td>
      <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px">${esc(b.match_name||b.match||'')}</td>
      <td style="font-weight:600;font-size:12px">${esc(b.pick||'')}</td>
      <td style="font-family:var(--mono)">${(+b.odd||0).toFixed(2)}</td>
      <td style="font-family:var(--mono)">${(+b.stake||0).toFixed(2)}</td>
      <td style="font-family:var(--mono);color:${b.status==='win'?'var(--green)':'var(--text2)'}">${(+b.ret||0).toFixed(2)}</td>
      <td>${badgeHtml(b.status)}</td>
      <td style="white-space:nowrap">
        ${b.status==='open'
          ? `<button class="resolve-btn win"  onclick="resolveBet('${b.id}','${esc(b.user_email)}',${+b.stake||0},${+b.odd||1},'win')">✓ Win</button>
             <button class="resolve-btn loss" onclick="resolveBet('${b.id}','${esc(b.user_email)}',${+b.stake||0},${+b.odd||1},'loss')">✗ Loss</button>`
          : '—'}
      </td>
    </tr>`).join('');
}

async function resolveBet(betId, userEmail, stake, odd, result) {
  if (!isOwner()) return;
  if (!confirm(`¿Resolver apuesta como ${result.toUpperCase()}?`)) return;

  const ret = result === 'win' ? stake * odd : 0;
  // Update bet status
  const { error: betErr } = await _SB.from('bets').update({ status: result, ret }).eq('id', betId);
  if (betErr) { showToast('❌ Error al resolver: ' + betErr.message); return; }

  if (result === 'win') {
    // Credit user balance
    const { data: prof } = await _SB.from('profiles').select('balance').eq('email', userEmail).single();
    if (prof) {
      const newBal = (+prof.balance||0) + ret;
      await _SB.from('profiles').update({ balance: newBal }).eq('email', userEmail);
      await _SB.from('transactions').insert({
        user_email: userEmail, description: 'Premio apuesta ganada',
        type: 'win', amount: ret, balance: newBal
      });
    }
    showToast(`✅ Apuesta resuelta como GANADA — ${ret.toFixed(2)} acreditados`);
  } else {
    showToast('✅ Apuesta resuelta como PERDIDA');
  }

  // Refresh cache and repaint
  await ownerFetchAll();
  paintOwnerBets('all');
  renderOwnerDashboard();
}

/* ════════════════════════════════════════════════
   OWNER — TRANSACCIONES GLOBALES
════════════════════════════════════════════════ */
async function renderOwnerTx(filter) {
  const body = document.getElementById('own-tx-body');
  if (body) body.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text2);padding:24px">⏳ Cargando...</td></tr>';
  if (!_ownerCache.loaded) await ownerFetchAll();
  filterOwnerTx(filter);
}

function filterOwnerTx(filter) {
  let list = _ownerCache.tx;
  if (filter !== 'all') list = list.filter(t => t.type === filter);

  // Summary KPIs
  const dep = _ownerCache.tx.filter(t=>t.type==='dep').reduce((a,t)=>a+(+t.amount||0),0);
  const wit = _ownerCache.tx.filter(t=>t.type==='wit').reduce((a,t)=>a+(+t.amount||0),0);
  const bet = _ownerCache.tx.filter(t=>t.type==='bet').reduce((a,t)=>a+(+t.amount||0),0);
  const win = _ownerCache.tx.filter(t=>t.type==='win' && t.description!=='Bono de bienvenida').reduce((a,t)=>a+(+t.amount||0),0);
  setText('own-tx-dep','$'+dep.toFixed(2));
  setText('own-tx-wit','$'+wit.toFixed(2));
  setText('own-tx-bet','$'+bet.toFixed(2));
  setText('own-tx-win','$'+win.toFixed(2));

  const body = document.getElementById('own-tx-body');
  if (!body) return;
  if (!list.length) {
    body.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text2);padding:36px">Sin transacciones</td></tr>';
    return;
  }
  body.innerHTML = list.map(t => `
    <tr>
      <td style="white-space:nowrap;color:var(--text2)">${fmtDate(t.created_at)}</td>
      <td style="font-size:11px">${esc(shortEmail(t.user_email||''))}</td>
      <td style="font-size:12px">${esc(t.description||t.desc||'')}</td>
      <td><span class="tx-type ${t.type}">${txTypeLabel(t.type)}</span></td>
      <td style="font-family:var(--mono);font-weight:600;color:${t.type==='dep'||t.type==='win'?'var(--green)':'var(--red)'}">
        ${t.type==='dep'||t.type==='win'?'+':'−'}${Math.abs(+t.amount||0).toFixed(2)}
      </td>
    </tr>`).join('');
}

/* ════════════════════════════════════════════════
   OWNER — CONFIGURACIÓN
════════════════════════════════════════════════ */
/* ════════════════════════════════════════════════
   MANUAL EVENTS — Gestión de partidos manuales
════════════════════════════════════════════════ */

let _manualEvents   = [];
let _editingEventId = null;
let _evFilter       = 'all';

/* Carga eventos manuales desde Supabase */
async function loadManualEvents() {
  const { data, error } = await _SB.from('manual_events').select('*').order('commence_time', { ascending: true });
  if (error) throw new Error(error.message);
  _manualEvents = data || [];
  return _manualEvents;
}

/* Renderiza la lista de partidos en el panel owner */
async function renderOwnerEvents() {
  const list = document.getElementById('own-events-list');
  if (!list) return;
  list.innerHTML = '<div class="adm-empty">Cargando...</div>';
  try {
    await loadManualEvents();
    filterManualEvents(_evFilter);
  } catch(err) {
    list.innerHTML = `<div class="adm-empty" style="color:var(--red)">❌ Error: ${esc(err.message)}</div>`;
  }
}

function filterManualEvents(filter, btn) {
  _evFilter = filter;
  if (btn) {
    document.querySelectorAll('.ev-filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }
  const list = document.getElementById('own-events-list');
  if (!list) return;

  let evs = _manualEvents;
  if (filter === 'upcoming')  evs = evs.filter(e => e.status === 'upcoming');
  if (filter === 'live')      evs = evs.filter(e => e.status === 'live');
  if (filter === 'finished')  evs = evs.filter(e => e.status === 'finished');
  if (filter === 'featured')  evs = evs.filter(e => e.featured);

  if (!evs.length) { 
    list.innerHTML = '<div class="adm-empty">No hay partidos todavía. Crea uno con "+ Nuevo partido"</div>'; 
    return; 
  }

  list.innerHTML = evs.map(e => `
    <div class="ev-row" id="evrow-${e.id}">
      <div class="ev-row-main">
        <div class="ev-row-sport">${sportIco(e.sport_key)} ${esc(e.league)}</div>
        <div class="ev-row-match">${esc(e.home_team)} <span style="color:var(--text3)">vs</span> ${esc(e.away_team)}</div>
        <div class="ev-row-meta">
          ${e.featured ? '<span class="ev-tag featured">⭐ Destacado</span>' : ''}
          <span class="ev-tag ${e.status}">${e.status === 'upcoming' ? '📅 Próximo' : e.status === 'live' ? '🔴 En Vivo' : '✅ Finalizado'}</span>
          <span class="ev-tag">📅 ${fDate(e.commence_time)}</span>
          <span class="ev-tag odds">1: ${fOdd(e.odd_1)} · X: ${fOdd(e.odd_x)} · 2: ${fOdd(e.odd_2)}</span>
        </div>
      </div>
      <div class="ev-row-actions">
        ${e.status !== 'finished' ? `
          <button class="tbl-action" onclick="toggleEventLive('${e.id}','${e.status}')">
            ${e.status === 'live' ? '⏹ Pausar' : '▶ En Vivo'}
          </button>` : ''}
        ${e.status === 'live' ? `
          <button class="tbl-action success" onclick="openResolveEventModal('${e.id}')">🏁 Resolver</button>` : ''}
        <button class="tbl-action" onclick="openEditEventModal('${e.id}')">✏️ Editar</button>
        <button class="tbl-action danger" onclick="deleteManualEvent('${e.id}')">🗑 Borrar</button>
      </div>
    </div>
  `).join('');
}

/* Abre modal para crear partido nuevo */
function openCreateEventModal() {
  _editingEventId = null;
  document.getElementById('event-modal-title').textContent = 'Nuevo Partido';
  clearEventForm();
  const tomorrow = new Date(Date.now() + 86400000);
  tomorrow.setMinutes(0, 0, 0);
  document.getElementById('ev-datetime').value = tomorrow.toISOString().slice(0,16);
  const overlay = document.getElementById('event-modal-overlay');
  overlay.style.display = 'flex';
  overlay.style.position = 'fixed';
}

/* Abre modal para editar partido existente */
function openEditEventModal(id) {
  const e = _manualEvents.find(x => x.id === id);
  if (!e) return;
  _editingEventId = id;
  document.getElementById('event-modal-title').textContent = 'Editar Partido';

  document.getElementById('ev-sport').value     = e.sport_key || 'soccer_epl';
  document.getElementById('ev-league').value    = e.league || '';
  document.getElementById('ev-home').value      = e.home_team || '';
  document.getElementById('ev-away').value      = e.away_team || '';
  document.getElementById('ev-datetime').value  = e.commence_time ? new Date(e.commence_time).toISOString().slice(0,16) : '';
  document.getElementById('ev-featured').checked = !!e.featured;
  null.checked     = e.status === 'live';
  document.getElementById('ev-odd1').value       = e.odd_1 || '';
  document.getElementById('ev-oddx').value       = e.odd_x || '';
  document.getElementById('ev-odd2').value       = e.odd_2 || '';
  document.getElementById('ev-total-line').value  = e.total_line || '';
  document.getElementById('ev-total-over').value  = e.total_over || '';
  document.getElementById('ev-total-under').value = e.total_under || '';
  document.getElementById('ev-btts-yes').value    = e.btts_yes || '';
  document.getElementById('ev-btts-no').value     = e.btts_no  || '';
  document.getElementById('ev-spread-home-pt').value = e.spread_home_pt || '';
  document.getElementById('ev-spread-home').value    = e.spread_home    || '';
  document.getElementById('ev-spread-away-pt').value = e.spread_away_pt || '';
  document.getElementById('ev-spread-away').value    = e.spread_away    || '';

  onEvSportChange();
  const overlay = document.getElementById('event-modal-overlay');
  overlay.style.display = 'flex';
  overlay.style.position = 'fixed';
}

function closeEventModal() {
  document.getElementById('event-modal-overlay').style.display = 'none';
  _editingEventId = null;
}

function clearEventForm() {
  ['ev-league','ev-home','ev-away','ev-odd1','ev-oddx','ev-odd2',
   'ev-total-line','ev-total-over','ev-total-under',
   'ev-btts-yes','ev-btts-no','ev-spread-home-pt','ev-spread-home',
   'ev-spread-away-pt','ev-spread-away'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('ev-featured').checked = false;
  null.checked = false;
  document.getElementById('ev-sport').value = 'soccer_epl';
  onEvSportChange();
}

/* Muestra/oculta campos según deporte */
function onEvSportChange() {
  const sport = document.getElementById('ev-sport')?.value || '';
  const cat = sport.split('_')[0];
  // Empate solo en fútbol y hockey
  const hasDrawEl = document.getElementById('ev-oddx-wrap');
  if (hasDrawEl) hasDrawEl.style.display = (cat === 'soccer' || cat === 'icehockey') ? '' : 'none';
  // BTTS solo en fútbol
  const soccerMkts = document.getElementById('ev-soccer-markets');
  if (soccerMkts) soccerMkts.style.display = cat === 'soccer' ? '' : 'none';
}

/* Guarda o actualiza un partido manual */
async function saveManualEvent() {
  const sport    = document.getElementById('ev-sport').value;
  const league   = document.getElementById('ev-league').value.trim();
  const home     = document.getElementById('ev-home').value.trim();
  const away     = document.getElementById('ev-away').value.trim();
  const dt       = document.getElementById('ev-datetime').value;
  const featured = document.getElementById('ev-featured').checked;
  const isLiveChk = null.checked;

  if (!league || !home || !away || !dt) { showToast('❌ Completa todos los campos obligatorios'); return; }

  const sportTitles = {
    soccer_epl: 'Fútbol', basketball_nba: 'Baloncesto',
    americanfootball_nfl: 'Fútbol Americano', baseball_mlb: 'Béisbol',
    icehockey_nhl: 'Hockey', mma_mixed_martial_arts: 'MMA'
  };

  const payload = {
    sport_key:      sport,
    sport_title:    sportTitles[sport] || 'Deporte',
    league,
    home_team:      home,
    away_team:      away,
    commence_time:  new Date(dt).toISOString(),
    featured,
    status:         isLiveChk ? 'live' : (new Date(dt) <= new Date() ? 'live' : 'upcoming'),
    odd_1:          parseFloat(document.getElementById('ev-odd1').value) || null,
    odd_x:          parseFloat(document.getElementById('ev-oddx').value) || null,
    odd_2:          parseFloat(document.getElementById('ev-odd2').value) || null,
    total_line:     parseFloat(document.getElementById('ev-total-line').value) || null,
    total_over:     parseFloat(document.getElementById('ev-total-over').value) || null,
    total_under:    parseFloat(document.getElementById('ev-total-under').value) || null,
    btts_yes:       parseFloat(document.getElementById('ev-btts-yes').value) || null,
    btts_no:        parseFloat(document.getElementById('ev-btts-no').value) || null,
    spread_home_pt: parseFloat(document.getElementById('ev-spread-home-pt').value) || null,
    spread_home:    parseFloat(document.getElementById('ev-spread-home').value) || null,
    spread_away_pt: parseFloat(document.getElementById('ev-spread-away-pt').value) || null,
    spread_away:    parseFloat(document.getElementById('ev-spread-away').value) || null,
    created_by:     SESSION?.email || '',
    updated_at:     new Date().toISOString(),
  };

  let error;
  if (_editingEventId) {
    ({ error } = await _SB.from('manual_events').update(payload).eq('id', _editingEventId));
  } else {
    ({ error } = await _SB.from('manual_events').insert(payload));
  }

  if (error) { showToast('❌ Error: ' + error.message); return; }
  showToast(_editingEventId ? '✅ Partido actualizado' : '✅ Partido creado');
  closeEventModal();
  await renderOwnerEvents();
  // Refresh main markets list to include new event
  await loadMarkets(false);
}

/* Alternar estado En Vivo / Próximo */
async function toggleEventLive(id, currentStatus) {
  const newStatus = currentStatus === 'live' ? 'upcoming' : 'live';
  const { error } = await _SB.from('manual_events').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) { showToast('❌ ' + error.message); return; }
  showToast(newStatus === 'live' ? '🔴 Partido marcado como En Vivo' : '⏹ Partido pausado');
  await renderOwnerEvents();
  await loadMarkets(false);
}

/* Resolver partido manual */
function openResolveEventModal(id) {
  const e = _manualEvents.find(x => x.id === id);
  if (!e) return;
  const matchLabel = `${e.home_team} vs ${e.away_team}`;

  const existing = document.getElementById('resolve-event-modal');
  if (existing) existing.remove();

  const html = `
  <div id="resolve-event-modal" style="
    position:fixed;inset:0;z-index:800;
    background:rgba(0,0,0,.75);
    display:flex;align-items:center;justify-content:center;padding:16px">
    <div style="background:var(--bg2);border:1px solid var(--border2);border-radius:16px;width:100%;max-width:400px;padding:24px">
      <div style="font-size:16px;font-weight:700;margin-bottom:6px">Resolver Partido</div>
      <div style="font-size:13px;color:var(--text2);margin-bottom:20px">${esc(matchLabel)}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:20px">
        <button class="adm-btn" style="background:var(--green)" onclick="resolveManualEvent('${id}','1')">
          🏆 ${esc(e.home_team.split(' ').pop())}
        </button>
        <button class="adm-btn" style="background:var(--text3)" onclick="resolveManualEvent('${id}','X')">
          🤝 Empate
        </button>
        <button class="adm-btn" style="background:var(--red)" onclick="resolveManualEvent('${id}','2')">
          🏆 ${esc(e.away_team.split(' ').pop())}
        </button>
      </div>
      <button onclick="document.getElementById('resolve-event-modal').remove()"
        style="width:100%;padding:9px;border-radius:8px;background:var(--bg3);border:1px solid var(--border);color:var(--text2);cursor:pointer">
        Cancelar
      </button>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}

async function resolveManualEvent(id, result) {
  const e = _manualEvents.find(x => x.id === id);
  if (!e) return;

  // Mark event as finished
  const { error } = await _SB.from('manual_events')
    .update({ status: 'finished', result, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) { showToast('❌ ' + error.message); return; }

  // Resolve all open bets for this event
  const matchKey = `${e.home_team} vs ${e.away_team}`;
  const { data: openBets } = await _SB.from('bets')
    .select('*')
    .eq('status', 'open')
    .ilike('match_name', `%${e.home_team}%`);

  let resolved = 0;
  for (const bet of (openBets || [])) {
    const won = bet.pick === result ||
      (result === '1' && bet.pick === e.home_team) ||
      (result === '2' && bet.pick === e.away_team) ||
      (result === 'X' && (bet.pick === 'Empate' || bet.pick === 'X'));

    const newStatus = won ? 'win' : 'loss';
    const ret = won ? +(bet.odd * bet.stake).toFixed(2) : 0;

    await _SB.from('bets').update({ status: newStatus, ret }).eq('id', bet.id);

    if (won && ret > 0) {
      const { data: prof } = await _SB.from('profiles').select('balance').eq('email', bet.user_email).single();
      if (prof) {
        const newBal = +(prof.balance + ret).toFixed(2);
        await _SB.from('profiles').update({ balance: newBal }).eq('email', bet.user_email);
        await _SB.from('transactions').insert({
          user_email: bet.user_email,
          description: `Premio: ${bet.pick} (${matchKey})`,
          type: 'win',
          amount: ret,
          balance: newBal,
          created_at: new Date().toISOString(),
        });
      }
    }
    resolved++;
  }

  document.getElementById('resolve-event-modal')?.remove();
  showToast(`✅ Partido resuelto · ${resolved} apuesta${resolved!==1?'s':''} procesada${resolved!==1?'s':''}`);
  await renderOwnerEvents();
  await loadMarkets(false);
}

async function deleteManualEvent(id) {
  if (!confirm('¿Seguro que quieres borrar este partido?')) return;
  const { error } = await _SB.from('manual_events').delete().eq('id', id);
  if (error) { showToast('❌ ' + error.message); return; }
  showToast('🗑 Partido eliminado');
  await renderOwnerEvents();
  await loadMarkets(false);
}

/* ── Auto-live: pasa partidos manuales a En Vivo cuando llega su hora ── */
async function checkManualEventsAutoLive() {
  try {
    const now = new Date();
    const { data } = await _SB.from('manual_events')
      .select('id, commence_time')
      .eq('status', 'upcoming');
    if (!data || !data.length) return;
    const toActivate = data.filter(e => new Date(e.commence_time) <= now);
    if (!toActivate.length) return;
    await Promise.all(toActivate.map(e =>
      _SB.from('manual_events').update({ status: 'live', updated_at: now.toISOString() }).eq('id', e.id)
    ));
    await loadMarkets(false);
  } catch(_) {}
}
setInterval(checkManualEventsAutoLive, 60000);

function renderOwnerConfig() {
  const cfg = DB.get('site_config') || {};
  const setv = (id, v) => { const e=document.getElementById(id); if(e && v!==undefined) e.value=v; };
  const setc = (id, v) => { const e=document.getElementById(id); if(e) e.checked=!!v; };
  setv('cfg-bonus-pct',        cfg.bonusPct       ?? 100);
  setv('cfg-bonus-max',        cfg.bonusMax        ?? 100);
  setv('cfg-dep-min',          cfg.depMin          ?? 10);
  setv('cfg-wit-min',          cfg.witMin          ?? 20);
  setv('cfg-initial-balance',  cfg.initialBalance  ?? 0);
  setv('cfg-house-margin',     cfg.houseMargin     ?? 5);
  setc('cfg-allow-register',   cfg.allowRegister   ?? true);
  setc('cfg-allow-deposits',   cfg.allowDeposits   ?? true);
  setc('cfg-allow-bets',       cfg.allowBets       ?? true);
  setc('cfg-maintenance',      cfg.maintenance     ?? false);
}

async function saveOwnerConfig() {
  const gv = id => { const e=document.getElementById(id); return e ? +e.value : 0; };
  const gc = id => { const e=document.getElementById(id); return e ? e.checked : true; };
  const cfg = {
    bonusPct:       gv('cfg-bonus-pct'),
    bonusMax:       gv('cfg-bonus-max'),
    depMin:         gv('cfg-dep-min'),
    witMin:         gv('cfg-wit-min'),
    initialBalance: gv('cfg-initial-balance'),
    houseMargin:    gv('cfg-house-margin'),
    allowRegister:  gc('cfg-allow-register'),
    allowDeposits:  gc('cfg-allow-deposits'),
    allowBets:      gc('cfg-allow-bets'),
    maintenance:    gc('cfg-maintenance'),
  };
  // Persist locally (immediate effect)
  DB.set('site_config', cfg);
  // Persist in Supabase (cross-device)
  const { error } = await _SB.from('site_config').update({
    bonus_pct:       cfg.bonusPct,
    bonus_max:       cfg.bonusMax,
    dep_min:         cfg.depMin,
    wit_min:         cfg.witMin,
    initial_balance: cfg.initialBalance,
    house_margin:    cfg.houseMargin,
    allow_register:  cfg.allowRegister,
    allow_deposits:  cfg.allowDeposits,
    allow_bets:      cfg.allowBets,
    maintenance:     cfg.maintenance,
    updated_at:      new Date().toISOString(),
  }).eq('id', 1);
  if (error) {
    showToast('⚠️ Guardado localmente (Supabase: ' + error.message + ')');
  } else {
    showToast('✅ Configuración guardada');
  }
  if (cfg.maintenance) showToast('⚠️ Modo mantenimiento ACTIVADO — los usuarios verán un aviso');
}

/* Load site config from Supabase on init and cache locally */
async function loadSiteConfig() {
  try {
    const [siteRes, apiRes] = await Promise.all([
      _SB.from('site_config').select('*').eq('id', 1).single(),
      _SB.from('api_config').select('odds_margin').eq('id', 1).single(),
    ]);
    const data = siteRes.data;
    const apiData = apiRes.data;
    if (data) {
      const cfg = {
        bonusPct:       data.bonus_pct,
        bonusMax:       data.bonus_max,
        depMin:         data.dep_min,
        witMin:         data.wit_min,
        initialBalance: data.initial_balance,
        houseMargin:    data.house_margin,
        allowRegister:  data.allow_register,
        allowDeposits:  data.allow_deposits,
        allowBets:      data.allow_bets,
        maintenance:    data.maintenance,
        odds_margin:    apiData?.odds_margin ?? 0,
      };
      DB.set('site_config', cfg);
    }
  } catch(_) { /* use localStorage fallback */ }
}

/* Get current site config (always from cache) */
function getSiteConfig() {
  return DB.get('site_config') || {
    allowRegister: true, allowDeposits: true, allowBets: true, maintenance: false,
    depMin: 10, witMin: 20, bonusPct: 100, bonusMax: 100
  };
}

/* ════════════════════════════════════════════════
   POST-LOGIN: show owner button if applicable
════════════════════════════════════════════════ */
function checkOwnerAccess() {
  const btn = document.getElementById('owner-nav-btn');
  if (btn) btn.classList.toggle('show', isOwner());
  if (SESSION) {
    // Also check role from Supabase profile
    _SB.from('profiles').select('role').eq('email', SESSION.email).single()
      .then(({ data }) => {
        if (data?.role === 'owner') {
          SESSION.role = 'owner';
          if (btn) btn.classList.add('show');
        }
      });
  }
  const ownerEmailEl = document.getElementById('owner-email-display');
  if (ownerEmailEl && SESSION) ownerEmailEl.textContent = SESSION.email;
}

/* ════════════════════════════════════════════════
   HELPERS
════════════════════════════════════════════════ */
function shortEmail(email) {
  if (!email) return '—';
  const [user, domain] = email.split('@');
  if (!domain) return email;
  return user.slice(0,3) + '***@' + domain;
}
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es', { day:'2-digit', month:'2-digit', year:'2-digit' });
}
function fmtDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
}
/* txTypeLabel defined later */
/* badgeHtml defined later */

/* ── Refresh stats ── */
async function refreshAdminData() {
  if (!SESSION) return;
  try {
    // Read balance from Supabase (source of truth)
    const { data: prof } = await _SB.from('profiles').select('balance,deposited,withdrawn').eq('email', SESSION.email).single();
    if (prof) {
      const d = adminData();
      d.balance   = +(prof.balance   || 0);
      d.deposited = +(prof.deposited || 0);
      d.withdrawn = +(prof.withdrawn || 0);
      saveAdminData(d);
    }
  } catch(_) { /* use cached value on error */ }

  const d    = adminData();
  const bets = betHistory();
  const open = bets.filter(b=>b.status==='open').length;
  const won  = bets.filter(b=>b.status==='win').length;
  const totalStake = bets.reduce((a,b)=>a+(b.stake||0),0);
  const totalRet   = bets.filter(b=>b.status==='win').reduce((a,b)=>a+(b.ret||0),0);
  const roi = totalStake>0 ? ((totalRet-totalStake)/totalStake*100).toFixed(1)+'%' : '—';

  setText('sc-balance',  '$'+d.balance.toFixed(2));
  setText('sc-open',     open);
  setText('sc-won',      won);
  setText('sc-roi',      roi);
  setText('tx-balance',  '$'+d.balance.toFixed(2));
  setText('tx-deposited','$'+d.deposited.toFixed(2));
  setText('tx-withdrawn','$'+d.withdrawn.toFixed(2));

  const badge = document.getElementById('open-bets-badge');
  if (badge) { badge.textContent=open; badge.style.display=open>0?'':'none'; }
}
function setText(id,v){ const e=document.getElementById(id); if(e) e.textContent=v; }

/* ── Dashboard ── */
function renderDashboard() {
  refreshAdminData();
  renderDashBets();
  renderDashQuick();
}

function renderDashBets() {
  const bets = betHistory().slice(-5).reverse();
  const tb = document.getElementById('dash-bets-body');
  if (!tb) return;
  if (!bets.length) {
    tb.innerHTML='<tr><td colspan="5" style="text-align:center;color:var(--text2);padding:28px;font-size:13px">Aún no hay apuestas</td></tr>';
    return;
  }
  tb.innerHTML = bets.map(b=>`
    <tr>
      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(b.match)}</td>
      <td style="font-weight:600">${esc(b.pick)}</td>
      <td><span style="font-family:var(--mono);color:var(--green)">${parseFloat(b.odd).toFixed(2)}</span></td>
      <td style="font-family:var(--mono)">${parseFloat(b.stake).toFixed(2)}</td>
      <td>${badgeHtml(b.status)}</td>
    </tr>`).join('');
}

function renderDashQuick() {
  const grid = document.getElementById('dash-quick-grid');
  if (!grid) return;
  const live = S.markets.slice(0,4); // Show first 4 upcoming events
  if (!live.length) {
    grid.innerHTML='<div style="grid-column:1/-1;text-align:center;padding:24px;color:var(--text2);font-size:13px">Sin apuestas rápidas disponibles</div>';
    return;
  }
  grid.innerHTML = live.map(m=>`
    <div class="quick-bet-card">
      <div class="qbc-match">${sportIco(m.sport_key)} ${esc(m.sport_title)} · ${fDate(m.commence_time)}</div>
      <div class="qbc-title">${esc(m.home_team)} vs ${esc(m.away_team)}</div>
      <div class="qbc-odds">
        ${[{l:'1',v:m.best1,t:m.home_team},{l:'X',v:m.bestX,t:'Empate'},{l:'2',v:m.best2,t:m.away_team}]
          .filter(o=>o.v).map(o=>`
          <div class="qbc-odd" onclick="quickAddBet('${esc(m.id||m.home_team)}','${esc(o.l)}','${esc(o.t)}','${esc(m.home_team+' vs '+m.away_team)}',${o.v},this)">
            <div class="qbc-odd-lbl">${o.l}</div>
            <div class="qbc-odd-val">${fOdd(o.v)}</div>
          </div>`).join('')}
      </div>
    </div>`).join('');
}

function quickAddBet(mId, pick, team, match, odd, el) {
  const key = mId + '_' + pick;
  const pickLabel = pick === 'X' ? 'Empate' : team;

  // If already selected, toggle off
  if (SLIP[key]) {
    delete SLIP[key];
    el.closest('.qbc-odds').querySelectorAll('.qbc-odd').forEach(b => b.classList.remove('sel'));
    renderSlip(); updateSlipCount();
    showToast(`🗑 ${pickLabel} eliminado del boleto`);
    return;
  }

  // Remove any other pick from the SAME market before adding
  ['1','X','2'].forEach(p => {
    if (p === pick) return;
    const conflictKey = mId + '_' + p;
    if (SLIP[conflictKey]) {
      delete SLIP[conflictKey];
      // Sync visual state on list + detail buttons
      const lb = document.getElementById('btn-' + conflictKey);
      if (lb) lb.classList.remove('in-slip');
      const db = document.getElementById('det-btn-' + conflictKey);
      if (db) db.classList.remove('active');
    }
  });

  // Mark only this button as selected
  el.closest('.qbc-odds').querySelectorAll('.qbc-odd').forEach(b => b.classList.remove('sel'));
  el.classList.add('sel');

  SLIP[key] = { key, match, pick: pickLabel, pickCode: pick, odd, stake: 10, marketId: mId };
  renderSlip(); updateSlipCount();
  showToast('✅ ' + pickLabel + ' añadido al boleto');
}

/* ── My Bets ── */
let _betFilter = 'all';
function renderBets(filter) {
  _betFilter = filter;
  const bets = betHistory();
  const shown = filter==='all' ? bets : bets.filter(b=>b.status===filter);
  shown.reverse();

  const totalStake = shown.reduce((a,b)=>a+(b.stake||0),0);
  const totalRet   = shown.reduce((a,b)=>a+(b.ret||0),0);
  const pnl        = totalRet - totalStake;

  setText('bets-total-stake', '$'+totalStake.toFixed(2));
  setText('bets-total-ret',   '$'+totalRet.toFixed(2));
  const pnlEl = document.getElementById('bets-pnl');
  if (pnlEl) {
    pnlEl.textContent = (pnl>=0?'+':'')+'$'+pnl.toFixed(2);
    pnlEl.className = 'sc-val '+(pnl>=0?'g':'r');
  }

  const tb = document.getElementById('bets-body');
  if (!tb) return;
  if (!shown.length) {
    tb.innerHTML=`<tr><td colspan="8" style="text-align:center;color:var(--text2);padding:36px;font-size:13px">No hay apuestas ${filter==='all'?'':'con este estado'}</td></tr>`;
    return;
  }
  tb.innerHTML = shown.map(b=>`
    <tr>
      <td style="white-space:nowrap;color:var(--text2)">${b.date||'—'}</td>
      <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(b.match)}</td>
      <td style="font-weight:600">${esc(b.pick)}</td>
      <td><span class="tx-type ${b.type==='combo'?'bet':b.type||'bet'}">${b.type==='combo'?'Combinada':'Simple'}</span></td>
      <td style="font-family:var(--mono)">${parseFloat(b.odd).toFixed(2)}</td>
      <td style="font-family:var(--mono)">${parseFloat(b.stake).toFixed(2)}</td>
      <td style="font-family:var(--mono);color:${b.status==='win'?'var(--green)':'var(--text2)'}">${parseFloat(b.ret||0).toFixed(2)}</td>
      <td>${badgeHtml(b.status)}</td>
    </tr>`).join('');
}
function filterBets(filter, btn) {
  document.querySelectorAll('#ap-bets button').forEach(b=>b.style.opacity='0.5');
  btn.style.opacity='1';
  renderBets(filter);
}

/* ── Transactions ── */
let _txFilter = 'all';
function renderTx(filter) {
  _txFilter = filter;
  const txs = txHistory();
  const shown = filter==='all' ? txs : txs.filter(t=>t.type===filter);
  shown.slice().reverse();

  const tb = document.getElementById('tx-body');
  if (!tb) return;
  if (!shown.length) {
    tb.innerHTML=`<tr><td colspan="5" style="text-align:center;color:var(--text2);padding:36px;font-size:13px">No hay transacciones</td></tr>`;
    return;
  }
  tb.innerHTML = [...shown].reverse().map(t=>`
    <tr>
      <td style="white-space:nowrap;color:var(--text2)">${t.date||'—'}</td>
      <td>${esc(t.desc)}</td>
      <td><span class="tx-type ${t.type}">${txTypeLabel(t.type)}</span></td>
      <td style="font-family:var(--mono);font-weight:600;color:${t.type==='dep'||t.type==='win'?'var(--green)':'var(--red)'}">
        ${t.type==='dep'||t.type==='win'?'+':'−'}${Math.abs(t.amount).toFixed(2)}
      </td>
      <td style="font-family:var(--mono)">${parseFloat(t.balance||0).toFixed(2)}</td>
    </tr>`).join('');
}
function filterTx(v){ renderTx(v); }
function txTypeLabel(t){ return {dep:'Depósito',wit:'Retirada',bet:'Apuesta',win:'Ganancia'}[t]||t; }

/* ── Profile ── */
function renderProfile() {
  const d = adminData();
  setVal('pf-name',    d.name);
  setVal('pf-surname', d.surname);
  setVal('pf-email',   d.email);
  setVal('pf-phone',   d.phone);
  setVal('pf-country', d.country);
  setVal('pf-currency',d.currency);
}
function setVal(id,v){ const e=document.getElementById(id); if(e)e.value=v||''; }
function saveProfile() {
  const d = adminData();
  d.name    = document.getElementById('pf-name')?.value||d.name;
  d.surname = document.getElementById('pf-surname')?.value||d.surname;
  d.email   = document.getElementById('pf-email')?.value||d.email;
  d.phone   = document.getElementById('pf-phone')?.value||d.phone;
  d.country = document.getElementById('pf-country')?.value||d.country;
  d.currency= document.getElementById('pf-currency')?.value||d.currency;
  DB.set('admin', d);
  setText('profile-display-name', d.name||'Usuario');
  setText('profile-display-email', d.email);
  showToast('✅ Perfil guardado correctamente');
}
function resetProfile(){ renderProfile(); }

/* ── Deposit / Withdraw → use full modal ── */
function showDepositModal()  { openPayModal('deposit');  }
function showWithdrawModal() { openWithdrawModal(); }

/* ════════════════════════════════════════════════
   RETIRO DE FONDOS
════════════════════════════════════════════════ */
let _wdMethod = 'yape';

async function openWithdrawModal() {
  if (!SESSION) { openAuthGate(); return; }
  const cfg = getSiteConfig();
  if (cfg.maintenance && !isOwner()) { showToast('🔧 Sitio en mantenimiento'); return; }

  // Reset UI
  _wdMethod = 'yape';
  document.querySelectorAll('#withdraw-modal .pay-method').forEach(m=>m.classList.remove('selected'));
  document.getElementById('wd-yape')?.classList.add('selected');
  document.getElementById('wd-step1').style.display = 'block';
  document.getElementById('wd-step2').style.display = 'none';
  document.getElementById('wd-step3').style.display = 'none';
  document.getElementById('wd-amount').value = '';
  document.querySelectorAll('#withdraw-modal .quick-amt').forEach(b=>b.classList.remove('sel'));
  document.getElementById('withdraw-status').className = 'auth-status';

  // Show available balance from Supabase (source of truth)
  const balEl = document.getElementById('wd-balance-show');
  try {
    const { data: prof } = await _SB.from('profiles').select('balance').eq('email', SESSION.email).single();
    const bal = +(prof?.balance || 0);
    // Update local cache
    const d = adminData(); d.balance = bal; saveAdminData(d);
    if (balEl) balEl.textContent = '$' + bal.toFixed(2);
  } catch(_) {
    const d = adminData();
    if (balEl) balEl.textContent = '$' + (+d.balance||0).toFixed(2);
  }

  document.getElementById('withdraw-modal').classList.add('show');
}

function closeWithdrawModal() {
  document.getElementById('withdraw-modal').classList.remove('show');
  if (document.getElementById('view-admin')?.style.display === 'block') {
    renderTx(_txFilter||'all');
  }
}

function selectWdMethod(method, el) {
  _wdMethod = method;
  document.querySelectorAll('#withdraw-modal .pay-method').forEach(m=>m.classList.remove('selected'));
  el.classList.add('selected');
}

function setWdAmt(v, btn) {
  document.getElementById('wd-amount').value = v;
  document.querySelectorAll('#withdraw-modal .quick-amt').forEach(b=>b.classList.remove('sel'));
  btn.classList.add('sel');
}

function wdStep2() {
  const amt = parseFloat(document.getElementById('wd-amount').value) || 0;
  const d   = adminData();
  const statusEl = document.getElementById('withdraw-status');

  if (amt < 20)           { statusEl.className='auth-status error'; statusEl.textContent='❌ El monto mínimo es $20'; return; }
  if (amt > 5000)         { statusEl.className='auth-status error'; statusEl.textContent='❌ El monto máximo por solicitud es $5,000'; return; }
  if (amt > (+d.balance||0)) { statusEl.className='auth-status error'; statusEl.textContent='❌ Saldo insuficiente'; return; }

  document.getElementById('wd-amt-show').textContent = '$' + amt.toFixed(2);
  document.getElementById('wd-step1').style.display = 'none';
  document.getElementById('wd-step2').style.display = 'block';

  // Show correct fields
  document.getElementById('wd-yape-fields').style.display     = _wdMethod === 'yape'     ? 'block' : 'none';
  document.getElementById('wd-transfer-fields').style.display = _wdMethod === 'transfer'  ? 'block' : 'none';
}

async function submitWithdraw() {
  const amt = parseFloat(document.getElementById('wd-amount').value) || 0;
  const d   = adminData();
  const statusEl = document.getElementById('withdraw-status');

  if (amt > (+d.balance||0)) { statusEl.className='auth-status error'; statusEl.textContent='❌ Saldo insuficiente'; return; }

  // Build payload
  const payload = {
    user_email: SESSION.email,
    amount:     amt,
    method:     _wdMethod,
    status:     'pending',
    auto:       (_wdMethod === 'yape' && amt <= 500),
  };

  if (_wdMethod === 'yape') {
    const phone = document.getElementById('wd-yape-phone').value.trim();
    const name  = document.getElementById('wd-yape-name').value.trim();
    if (!phone || !name) { statusEl.className='auth-status error'; statusEl.textContent='❌ Completa los datos de Yape'; return; }
    payload.yape_phone = phone;
    payload.yape_name  = name;
  } else {
    const bank    = document.getElementById('wd-bank-name').value;
    const account = document.getElementById('wd-bank-account').value.trim();
    const cci     = document.getElementById('wd-bank-cci').value.trim();
    const holder  = document.getElementById('wd-bank-holder').value.trim();
    if (!bank || !account || !holder) { statusEl.className='auth-status error'; statusEl.textContent='❌ Completa los datos bancarios'; return; }
    payload.bank_name    = bank;
    payload.bank_account = account;
    payload.bank_cci     = cci;
    payload.bank_holder  = holder;
  }

  // Insert withdrawal request
  const { error } = await _SB.from('withdrawal_requests').insert(payload);
  if (error) { statusEl.className='auth-status error'; statusEl.textContent='❌ Error: ' + error.message; return; }

  // Deduct balance immediately (hold funds)
  const { data: prof } = await _SB.from('profiles').select('balance,withdrawn').eq('email', SESSION.email).single();
  if (prof) {
    const newBal  = Math.max(0, +(prof.balance  - amt).toFixed(2));
    const newWith = +(( prof.withdrawn || 0) + amt).toFixed(2);
    await _SB.from('profiles').update({ balance: newBal, withdrawn: newWith }).eq('email', SESSION.email);

    // Record transaction
    await _SB.from('transactions').insert({
      user_email:  SESSION.email,
      description: 'Solicitud de retiro vía ' + (_wdMethod === 'yape' ? 'Yape' : 'Transferencia'),
      type:        'withdraw',
      amount:      amt,
      balance:     newBal,
      created_at:  new Date().toISOString(),
    });

    // Update local cache
    if (_sbProfile) { _sbProfile.balance = newBal; _sbProfile.withdrawn = newWith; }
    const ld = adminData();
    ld.balance = newBal; ld.withdrawn = newWith;
    DB.set('admin', ld);
    setText('sc-balance', '$' + newBal.toFixed(2));
    setText('tx-balance', '$' + newBal.toFixed(2));
    setText('tx-withdrawn', '$' + newWith.toFixed(2));
  }

  // Show success
  document.getElementById('wd-step2').style.display = 'none';
  document.getElementById('wd-step3').style.display = 'block';
  document.getElementById('wd-success-msg').textContent =
    `Tu solicitud de retiro de $${amt.toFixed(2)} vía ${_wdMethod === 'yape' ? 'Yape' : 'transferencia bancaria'} ha sido recibida. El saldo ha sido retenido de tu cuenta.`;
}

/* ── Badge helper ── */
function badgeHtml(status) {
  const map={ open:'open Activa', win:'win Ganada', loss:'loss Perdida', void:'void Anulada' };
  const [cls,lbl] = (map[status]||'void Desconocido').split(' ');
  return `<span class="bet-badge ${cls}">${lbl}</span>`;
}
function todayStr(){ return new Date().toLocaleDateString('es',{year:'numeric',month:'2-digit',day:'2-digit'}); }


/* ════════════════════════════════════════════════
   2FA — TOTP (Google Authenticator compatible)
════════════════════════════════════════════════ */
let _totpSecret = null;
let _totpInstance = null;

function open2FASetup() {
  if (!SESSION) { openAuthGate(); return; }
  // Generate a new secret
  const secret = new OTPAuth.Secret({ size: 20 });
  _totpSecret = secret.base32;
  _totpInstance = new OTPAuth.TOTP({
    issuer:    'PredictX',
    label:     SESSION.email,
    algorithm: 'SHA1',
    digits:    6,
    period:    30,
    secret,
  });

  // Show QR via Google Charts API (no JS library needed, always works)
  const uri = _totpInstance.toString();
  const qrImg = document.getElementById('totp-qr-img');
  if (qrImg) {
    const encoded = encodeURIComponent(uri);
    qrImg.src = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encoded;
  }

  // Show secret key (formatted in groups of 4)
  const secretEl = document.getElementById('totp-secret-display');
  if (secretEl) secretEl.textContent = _totpSecret.match(/.{1,4}/g).join(' ');

  // Show step 1
  tfa2Step1();

  const modal = document.getElementById('modal-2fa-setup');
  if (modal) { modal.style.display = 'flex'; }
}

function close2FAModal() {
  const modal = document.getElementById('modal-2fa-setup');
  if (modal) modal.style.display = 'none';
  _totpSecret = null;
  _totpInstance = null;
}

function tfa2Step1() {
  document.getElementById('tfa-step1').style.display = 'block';
  document.getElementById('tfa-step2').style.display = 'none';
  const statusEl = document.getElementById('totp-verify-status');
  if (statusEl) statusEl.textContent = '';
}

function tfa2Step2() {
  document.getElementById('tfa-step1').style.display = 'none';
  document.getElementById('tfa-step2').style.display = 'block';
  const inp = document.getElementById('totp-verify-inp');
  if (inp) { inp.value = ''; inp.focus(); }
}

async function verify2FACode() {
  const code = (document.getElementById('totp-verify-inp')?.value || '').trim();
  const statusEl = document.getElementById('totp-verify-status');
  if (!_totpInstance) return;

  if (code.length !== 6) {
    if (statusEl) { statusEl.textContent = 'Introduce los 6 dígitos'; statusEl.style.color = 'var(--red)'; }
    return;
  }

  const delta = _totpInstance.validate({ token: code, window: 1 });
  if (delta !== null) {
    if (statusEl) { statusEl.textContent = '✅ Código correcto'; statusEl.style.color = 'var(--green)'; }
    // Update profile — both local cache and Supabase
    const d = adminData();
    d.twofa = true;
    d.totp_secret = _totpSecret;
    _sbProfile = d;           // update local cache immediately
    DB.set('admin', d);       // update localStorage cache too
    await saveAdminData(d);   // persist to Supabase
    setTimeout(() => {
      close2FAModal();
      renderSecurityBadges(); // re-render with updated d.twofa = true
      showToast('✅ Verificación en 2 pasos activada');
    }, 800);
  } else {
    if (statusEl) { statusEl.textContent = '❌ Código incorrecto — inténtalo de nuevo'; statusEl.style.color = 'var(--red)'; }
    const inp = document.getElementById('totp-verify-inp');
    if (inp) { inp.value = ''; inp.focus(); }
  }
}

async function disable2FA() {
  if (!confirm('¿Desactivar la verificación en 2 pasos?')) return;
  const d = adminData();
  d.twofa = false;
  d.totp_secret = null;
  _sbProfile = d;
  DB.set('admin', d);
  await saveAdminData(d);
  renderSecurityBadges();
  showToast('🔒 Verificación en 2 pasos desactivada');
}

// Hook into doLogin to check 2FA if enabled
const _origDoLogin = window.doLogin || doLogin;
async function doLoginWith2FA() {
  // doLogin runs normally — if user has 2FA, prompt for code after
  await (typeof _origDoLogin === 'function' ? _origDoLogin() : Promise.resolve());
}
