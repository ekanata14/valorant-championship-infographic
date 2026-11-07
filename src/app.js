/* ============================================================
   app.js — tema, filter lanjutan, agregasi, dan render dashboard.
   Data mentah per baris disimpan terkompresi di data.json (base36)
   agar semua kartu bisa difilter lintas dimensi.
   ============================================================ */

(() => {
  'use strict';

  const DATA = JSON.parse(document.getElementById('data').textContent);
  const F = DATA.filters;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const fmt = (n) => new Intl.NumberFormat('id-ID').format(n);
  const pct = (n, d = 1) =>
    new Intl.NumberFormat('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n * 100) + '%';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esc = (s) =>
    String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ------------------------------ decode baris ------------------------------ */

  const B36 = '0123456789abcdefghijklmnopqrstuvwxyz';
  const B36V = {};
  for (let i = 0; i < 36; i++) B36V[B36[i]] = i;
  const d1 = (s, i) => B36V[s[i]];
  const dN = (s, i, w) => {
    let v = 0;
    for (let k = 0; k < w; k++) v = v * 36 + B36V[s[i + k]];
    return v;
  };

  const ROW_N = F.rows.map.length;
  const MATCH_N = F.matches.year.length;
  const rowMap = new Uint8Array(ROW_N);
  const rowMatch = new Uint16Array(ROW_N);
  for (let i = 0; i < ROW_N; i++) {
    rowMap[i] = d1(F.rows.map, i);
    rowMatch[i] = dN(F.rows.match, i * 3, 3);
  }

  const matchYear = new Uint8Array(MATCH_N);
  const matchStage = new Uint8Array(MATCH_N);
  const matchTour = new Uint16Array(MATCH_N);
  const matchTeamA = new Uint16Array(MATCH_N);
  const matchTeamB = new Uint16Array(MATCH_N);
  const matchMapCount = new Uint8Array(MATCH_N);
  for (let i = 0; i < MATCH_N; i++) {
    matchYear[i] = d1(F.matches.year, i);
    matchStage[i] = d1(F.matches.stage, i);
    matchTour[i] = dN(F.matches.tournament, i * 2, 2);
    matchTeamA[i] = dN(F.matches.teams, i * 6, 3);
    matchTeamB[i] = dN(F.matches.teams, i * 6 + 3, 3);
  }
  for (let i = 0; i < ROW_N; i++) matchMapCount[rowMatch[i]]++;

  const tourRegion = new Uint8Array(F.tournaments.length);
  for (let i = 0; i < F.tournaments.length; i++) tourRegion[i] = d1(F.tournamentRegion, i);

  const TEAM_NONE = F.teamSentinel;

  /* ------------------------------ decode pemain ------------------------------ */

  const PJ = DATA.players_dim || null;
  const P_NAMES = PJ ? PJ.players : [];
  const P_MATCHES = PJ ? PJ.matchCount : [];
  const P_LOWER = P_NAMES.map((n) => n.toLowerCase());
  const P_N = P_NAMES.length;
  const P_INDEX = new Map(P_NAMES.map((n, i) => [n, i]));
  const P_NONE = 46655;
  const P_TEAM = new Uint16Array(P_N);
  const MP_OFFSET = new Uint32Array(MATCH_N + 1);
  const MP_LIST = [];
  const MP_SIDE = [];
  if (PJ) {
    for (let i = 0; i < P_N; i++) P_TEAM[i] = dN(PJ.playerTeam, i * 3, 3);
    let ptr = 0;
    for (let m = 0; m < MATCH_N; m++) {
      MP_OFFSET[m] = MP_LIST.length;
      for (;;) {
        const v = dN(PJ.matchPlayers, ptr * 4, 3);
        const side = d1(PJ.matchPlayers, ptr * 4 + 3);
        ptr++;
        if (v === P_NONE) break;
        MP_LIST.push(v);
        MP_SIDE.push(side);
      }
    }
    MP_OFFSET[MATCH_N] = MP_LIST.length;
  }
  const matchHasPlayer = (m, p) => {
    for (let i = MP_OFFSET[m]; i < MP_OFFSET[m + 1]; i++) if (MP_LIST[i] === p) return true;
    return false;
  };

  /* ------------------------------ indeks global ------------------------------ */

  const MATCH_IDS = F.matchIds || [];
  const T_LOWER = F.teams.map((n) => n.toLowerCase());
  const TOUR_LOWER = F.tournaments.map((n) => n.toLowerCase());
  const matchMaps = Array.from({ length: MATCH_N }, () => []);
  const matchSearch = new Array(MATCH_N);
  const playerMatchList = Array.from({ length: P_N }, () => []);
  const teamStats = new Map();
  const tourStats = new Map();

  for (let i = 0; i < ROW_N; i++) matchMaps[rowMatch[i]].push(rowMap[i]);

  for (let m = 0; m < MATCH_N; m++) {
    const t = matchTour[m];
    let ts = tourStats.get(t);
    if (!ts) {
      ts = { matches: 0, mapGames: 0, teams: new Map(), players: new Set(), years: new Set() };
      tourStats.set(t, ts);
    }
    ts.matches++;
    ts.mapGames += matchMapCount[m];
    ts.years.add(matchYear[m]);

    for (const ti of [matchTeamA[m], matchTeamB[m]]) {
      if (ti === TEAM_NONE) continue;
      let st = teamStats.get(ti);
      if (!st) {
        st = { matches: 0, mapGames: 0, tournaments: new Map(), players: new Set() };
        teamStats.set(ti, st);
      }
      st.matches++;
      st.mapGames += matchMapCount[m];
      st.tournaments.set(t, (st.tournaments.get(t) || 0) + 1);
      ts.teams.set(ti, (ts.teams.get(ti) || 0) + 1);
    }

    for (let k = MP_OFFSET[m]; k < MP_OFFSET[m + 1]; k++) {
      const p = MP_LIST[k];
      playerMatchList[p].push(m);
      ts.players.add(p);
      const ti = MP_SIDE[k] === 0 ? matchTeamA[m] : MP_SIDE[k] === 1 ? matchTeamB[m] : -1;
      if (ti >= 0 && ti !== TEAM_NONE) teamStats.get(ti).players.add(p);
    }

    matchSearch[m] = (
      `${F.teams[matchTeamA[m]] || ''} vs ${F.teams[matchTeamB[m]] || ''} ` +
      `${F.tournaments[t]} ${F.stages[matchStage[m]]} ${F.years[matchYear[m]]} ${MATCH_IDS[m] || ''}`
    ).toLowerCase();
  }

  const teamOrder = [...teamStats.keys()].sort(
    (a, b) => teamStats.get(b).matches - teamStats.get(a).matches || F.teams[a].localeCompare(F.teams[b])
  );
  const tourOrder = [...tourStats.keys()].sort(
    (a, b) => tourStats.get(b).mapGames - tourStats.get(a).mapGames
  );

  const YEARS = F.years;
  const REGION_ORDER = F.regions;
  const regionColor = (name) => {
    const i = REGION_ORDER.indexOf(name);
    return i === -1 ? 'var(--muted)' : `var(--cat-${(i % 7) + 1})`;
  };

  const state = {
    year: 'all',
    region: '',
    stage: '',
    map: '',
    tournament: '',
    team: '',
    player: '',
    metric: 'mapGames',
    mapFocus: null,
    focusRegion: null,
    teamQuery: '',
    theme: 'light',
  };

  let VIEW = null;

  /* ------------------------------ tema ------------------------------ */

  function initTheme() {
    const param = new URLSearchParams(location.search).get('theme');
    const stored = (() => {
      try { return localStorage.getItem('vd-theme'); } catch { return null; }
    })();
    state.theme = param === 'light' || param === 'dark' ? param : stored || 'light';
    applyTheme();
  }

  function applyTheme() {
    document.documentElement.dataset.theme = state.theme;
    const btn = $('#themeBtn');
    if (btn) btn.textContent = state.theme === 'dark' ? 'Light mode' : 'Dark mode';
  }

  function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('vd-theme', state.theme); } catch { /* file:// may block */ }
    applyTheme();
  }

  /* ------------------------------ mesin filter ------------------------------ */

  function buildView() {
    const yearIdx = state.year === 'all' ? -1 : F.years.indexOf(Number(state.year));
    const stageIdx = state.stage ? F.stages.indexOf(state.stage) : -1;
    const tourIdx = state.tournament ? F.tournaments.indexOf(state.tournament) : -1;
    const regionIdx = state.region ? F.regions.indexOf(state.region) : -1;
    const teamIdx = state.team ? F.teams.indexOf(state.team) : -1;
    const mapIdx = state.map ? F.maps.indexOf(state.map) : -1;
    const playerIdx = state.player ? (P_INDEX.has(state.player) ? P_INDEX.get(state.player) : -2) : -1;

    const mask = new Uint8Array(MATCH_N);
    const maskNoYear = new Uint8Array(MATCH_N);
    for (let i = 0; i < MATCH_N; i++) {
      const base =
        (stageIdx < 0 || matchStage[i] === stageIdx) &&
        (tourIdx < 0 || matchTour[i] === tourIdx) &&
        (regionIdx < 0 || tourRegion[matchTour[i]] === regionIdx) &&
        (teamIdx < 0 || matchTeamA[i] === teamIdx || matchTeamB[i] === teamIdx) &&
        (playerIdx < 0 || matchHasPlayer(i, playerIdx));
      maskNoYear[i] = base ? 1 : 0;
      mask[i] = base && (yearIdx < 0 || matchYear[i] === yearIdx) ? 1 : 0;
    }

    const yearAgg = F.years.map((year) => ({
      year,
      mapGames: 0,
      matches: new Set(),
      tournaments: new Set(),
      mapsPlayed: new Set(),
    }));
    const yearTrend = F.years.map((year) => ({
      year,
      mapGames: 0,
      matches: new Set(),
      tournaments: new Set(),
      mapsPlayed: new Set(),
    }));
    const mapTotal = new Uint32Array(F.maps.length);
    const mapTrend = F.maps.map(() => new Uint32Array(F.years.length));
    const stageCount = new Uint32Array(F.stages.length);
    const regionTotal = new Uint32Array(F.regions.length);
    const regionTrend = F.regions.map(() => new Uint32Array(F.years.length));
    const regionTours = F.regions.map(() => new Map());
    const teamMaps = new Map();

    const passMatches = [];
    const tournamentSet = new Set();
    const teamSet = new Set();
    const teamMatches = new Map();
    const playerAgg = new Map();
    const formatAgg = [0, 0, 0, 0, 0, 0];

    for (let m = 0; m < MATCH_N; m++) {
      if (!mask[m]) continue;
      passMatches.push(m);
      tournamentSet.add(matchTour[m]);
      formatAgg[Math.min(matchMapCount[m], 5)]++;
      for (const t of [matchTeamA[m], matchTeamB[m]]) {
        if (t === TEAM_NONE) continue;
        teamSet.add(t);
        let set = teamMatches.get(t);
        if (!set) { set = new Set(); teamMatches.set(t, set); }
        set.add(m);
      }
      for (let k = MP_OFFSET[m]; k < MP_OFFSET[m + 1]; k++) {
        const p = MP_LIST[k];
        let agg = playerAgg.get(p);
        if (!agg) {
          agg = { matches: 0, first: matchYear[m], last: matchYear[m] };
          playerAgg.set(p, agg);
        }
        agg.matches++;
        if (matchYear[m] < agg.first) agg.first = matchYear[m];
        if (matchYear[m] > agg.last) agg.last = matchYear[m];
      }
      yearAgg[matchYear[m]].matches.add(m);
      yearAgg[matchYear[m]].tournaments.add(matchTour[m]);
    }

    for (let m = 0; m < MATCH_N; m++) {
      if (!maskNoYear[m]) continue;
      const yi = matchYear[m];
      yearTrend[yi].matches.add(m);
      yearTrend[yi].tournaments.add(matchTour[m]);
    }

    let mapGames = 0;
    for (let i = 0; i < ROW_N; i++) {
      const m = rowMatch[i];
      const mi = rowMap[i];
      if (mapIdx >= 0 && mi !== mapIdx) continue;
      const yi = matchYear[m];
      const ri = tourRegion[matchTour[m]];

      if (maskNoYear[m]) {
        mapTrend[mi][yi]++;
        regionTrend[ri][yi]++;
        yearTrend[yi].mapGames++;
        yearTrend[yi].mapsPlayed.add(mi);
      }
      if (!mask[m]) continue;

      mapGames++;
      mapTotal[mi]++;
      yearAgg[yi].mapGames++;
      yearAgg[yi].mapsPlayed.add(mi);
      stageCount[matchStage[m]]++;
      regionTotal[ri]++;
      regionTours[ri].set(matchTour[m], (regionTours[ri].get(matchTour[m]) || 0) + 1);
      for (const tm of [matchTeamA[m], matchTeamB[m]]) {
        if (tm !== TEAM_NONE) teamMaps.set(tm, (teamMaps.get(tm) || 0) + 1);
      }
    }

    const mapsOut = [];
    F.maps.forEach((name, i) => {
      if (!mapTotal[i]) return;
      const byYear = {};
      let first = null;
      let last = null;
      let peak = null;
      let peakV = 0;
      F.years.forEach((y, yi) => {
        const v = mapTrend[i][yi];
        byYear[y] = v;
        if (v > 0) {
          if (first === null) first = y;
          last = y;
          if (v > peakV) { peakV = v; peak = y; }
        }
      });
      mapsOut.push({
        map: name,
        total: mapTotal[i],
        share: mapTotal[i] / (mapGames || 1),
        byYear,
        firstYear: first,
        lastYear: last,
        peakYear: peak,
      });
    });
    mapsOut.sort((a, b) => b.total - a.total);

    const stagesOut = [];
    F.stages.forEach((name, i) => {
      if (!stageCount[i]) return;
      stagesOut.push({ stage: name, count: stageCount[i], share: stageCount[i] / (mapGames || 1) });
    });
    stagesOut.sort((a, b) => b.count - a.count);

    const regionsOut = [];
    F.regions.forEach((name, i) => {
      if (!regionTotal[i]) return;
      const byYear = {};
      let first = null;
      let last = null;
      let peak = null;
      let peakV = 0;
      F.years.forEach((y, yi) => {
        const v = regionTrend[i][yi];
        byYear[y] = v;
        if (v > 0) {
          if (first === null) first = y;
          last = y;
          if (v > peakV) { peakV = v; peak = y; }
        }
      });
      const topTournaments = [...regionTours[i].entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([ti, games]) => ({ name: F.tournaments[ti], mapGames: games }));
      regionsOut.push({
        region: name,
        mapGames: regionTotal[i],
        share: regionTotal[i] / (mapGames || 1),
        tournaments: regionTours[i].size,
        byYear,
        topTournaments,
      });
    });
    regionsOut.sort((a, b) => b.mapGames - a.mapGames);

    const topTeams = [...teamMatches.entries()]
      .map(([ti, set]) => ({ team: F.teams[ti], matches: set.size, mapGames: teamMaps.get(ti) || 0 }))
      .sort((a, b) => b.matches - a.matches || a.team.localeCompare(b.team));

    const playerEntries = [...playerAgg.entries()].sort(
      (a, b) => b[1].matches - a[1].matches || P_NAMES[a[0]].localeCompare(P_NAMES[b[0]])
    );
    const playerTop = playerEntries.slice(0, 40).map(([pi, agg]) => ({
      player: P_NAMES[pi],
      matches: agg.matches,
      firstYear: F.years[agg.first],
      lastYear: F.years[agg.last],
      team: P_TEAM[pi] === P_NONE ? '' : F.teams[P_TEAM[pi]],
    }));
    const playerByIdx = new Map(playerEntries);

    const yearTotals = {};
    F.years.forEach((y, yi) => {
      yearTotals[y] = yearTrend[yi].mapGames;
    });

    const top3 = mapsOut.slice(0, 3);
    const insights = {
      top3MapShare: mapGames ? top3.reduce((s, m) => s + m.total, 0) / mapGames : 0,
      top3Maps: top3.map((m) => m.map),
      topMap: mapsOut[0] ? mapsOut[0].map : '',
      topMapTotal: mapsOut[0] ? mapsOut[0].total : 0,
      coverage2021_2022: mapGames
        ? yearAgg.reduce((s, y) => s + (y.year <= 2022 ? y.mapGames : 0), 0) / mapGames
        : 0,
      openQualifierShare: (stagesOut.find((s) => s.stage === 'Open Qualifier') || { share: 0 }).share,
      mostActiveTeam: topTeams[0] ? topTeams[0].team : '',
      mostActiveTeamMatches: topTeams[0] ? topTeams[0].matches : 0,
    };

    return {
      meta: {
        mapGames,
        matches: passMatches.length,
        tournaments: tournamentSet.size,
        teams: teamSet.size,
        maps: mapsOut.length,
        players: PJ ? playerAgg.size : DATA.meta.players,
        mapsPerMatch: passMatches.length ? +(mapGames / passMatches.length).toFixed(2) : 0,
        yearMin: F.years[0],
        yearMax: F.years[F.years.length - 1],
      },
      years: yearAgg.map((y) => ({
        year: y.year,
        mapGames: y.mapGames,
        matches: y.matches.size,
        tournaments: y.tournaments.size,
        mapsPlayed: y.mapsPlayed.size,
      })),
      yearTrend: yearTrend.map((y) => ({
        year: y.year,
        mapGames: y.mapGames,
        matches: y.matches.size,
        tournaments: y.tournaments.size,
        mapsPlayed: y.mapsPlayed.size,
      })),
      maps: mapsOut,
      stages: stagesOut,
      mapsPerMatch: [1, 2, 3, 4, 5].map((k) => ({ maps: k, matches: formatAgg[k] })),
      regions: regionsOut,
      topTeams,
      players: playerTop,
      playerCount: playerAgg.size,
      playerByIdx,
      insights,
      yearTotals,
    };
  }

  /* ------------------------------ KPI ------------------------------ */

  let counted = false;

  function renderKpis(animate) {
    const items = [
      { v: VIEW.meta.mapGames, l: 'Map dimainkan' },
      { v: VIEW.meta.matches, l: 'Pertandingan' },
      { v: VIEW.meta.tournaments, l: 'Turnamen' },
      { v: VIEW.meta.maps, l: 'Peta' },
      { v: VIEW.meta.teams, l: 'Tim' },
      { v: VIEW.meta.players, l: 'Pemain', note: PJ ? '' : 'dataset' },
    ];
    $('#kpis').innerHTML = items
      .map(
        (it, i) => `
        <div class="kpi">
          <div class="kpi-l">${it.l}${it.note ? ` <span class="kpi-tag">${it.note}</span>` : ''}</div>
          <div class="kpi-v" data-count="${it.v}" data-delay="${i * 60}">${animate ? '0' : fmt(it.v)}</div>
        </div>`
      )
      .join('');
    if (animate) {
      counted = false;
      countUp();
    }
  }

  function finalizeKpis() {
    $$('#kpis [data-count]').forEach((node) => {
      node.dataset.done = '1';
      node.textContent = fmt(Number(node.dataset.count));
    });
  }

  function countUp() {
    if (counted) return;
    counted = true;
    $$('#kpis [data-count]').forEach((node) => {
      const target = Number(node.dataset.count);
      if (reduceMotion) { node.textContent = fmt(target); return; }
      const start = performance.now();
      const dur = 1100;
      const delay = Number(node.dataset.delay || 0);
      const tick = (now) => {
        if (node.dataset.done) return;
        const p = Math.min(Math.max((now - start - delay) / dur, 0), 1);
        const eased = 1 - Math.pow(1 - p, 3);
        node.textContent = fmt(Math.round(target * eased));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    setTimeout(finalizeKpis, 1500);
  }

  window.addEventListener('beforeprint', finalizeKpis);

  /* ------------------------------ 01 skala ------------------------------ */

  function renderScale() {
    const series = VIEW.yearTrend;
    $('#scaleChart').replaceChildren(Charts.yearBars({ years: series, metric: state.metric, highlight: state.year }));
    $$('[data-metric]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.metric === state.metric)));

    const total = VIEW.meta.mapGames;
    const active = state.year === 'all' ? null : VIEW.years.find((y) => y.year === Number(state.year));
    const peak = series.reduce((a, b) => (a.mapGames > b.mapGames ? a : b));
    const peakTotal = series.reduce((s, y) => s + y.mapGames, 0);
    $('#scaleNote').textContent = !total
      ? 'Tidak ada data pada filter ini.'
      : active
      ? `${active.year} · ${fmt(active.mapGames)} map dari ${fmt(active.matches)} pertandingan · tahun lain diredupkan`
      : `Puncak: ${peak.year} — ${pct(peak.mapGames / (peakTotal || 1))} dari seluruh map dimainkan`;

    buildTable(
      $('#scaleTable'),
      ['Tahun', 'Map dimainkan', 'Pertandingan', 'Turnamen', 'Peta'],
      series.map((y) => [y.year, fmt(y.mapGames), fmt(y.matches), fmt(y.tournaments), y.mapsPlayed])
    );
  }

  /* ------------------------------ 02 peta ------------------------------ */

  function renderMeta() {
    $('#heatmap').replaceChildren(
      Charts.heatmap({
        maps: VIEW.maps,
        years: YEARS,
        focus: state.mapFocus,
        yearFilter: state.year,
        yearTotals: VIEW.yearTotals,
      })
    );

    const grid = $('#mapGrid');
    grid.innerHTML = VIEW.maps
      .map((m) => {
        const isFocus = state.mapFocus === m.map;
        const badge =
          m.firstYear && m.firstYear > VIEW.meta.yearMin
            ? `Baru ${m.firstYear}`
            : m.lastYear && m.lastYear < VIEW.meta.yearMax
            ? `Terakhir ${m.lastYear}`
            : '';
        return `
          <button class="map-card${state.mapFocus && !isFocus ? ' is-dim' : ''}"
                  type="button" data-map="${esc(m.map)}" aria-pressed="${isFocus}"
                  aria-label="${esc(m.map)}: ${fmt(m.total)} map dimainkan">
            <span class="mc-top">
              <span class="mc-name">${esc(m.map)}</span>
              <span class="mc-val">${fmt(m.total)}</span>
            </span>
            <span class="mc-badge">${badge}</span>
          </button>`;
      })
      .join('');

    VIEW.maps.forEach((m, i) => {
      const card = grid.children[i];
      if (!card) return;
      const values = YEARS.map((y) => m.byYear[String(y)] || 0);
      card.appendChild(
        Charts.sparkline({
          values,
          highlight: state.mapFocus === m.map,
          markIndex: state.year === 'all' ? null : YEARS.indexOf(Number(state.year)),
        })
      );
      card.setAttribute(
        'data-tip',
        `${m.map}\n${fmt(m.total)} map dimainkan (${pct(m.share)})\nPertama muncul ${m.firstYear} · puncak ${m.peakYear}`
      );
    });

    renderMapInsight();
    buildTable(
      $('#mapTable'),
      ['Peta', ...YEARS.map(String), 'Total'],
      VIEW.maps.map((m) => [m.map, ...YEARS.map((y) => fmt(m.byYear[String(y)] || 0)), fmt(m.total)])
    );
  }

  function renderMapInsight() {
    const box = $('#mapInsight');
    if (!state.mapFocus) {
      box.hidden = true;
      box.innerHTML = '';
      return;
    }
    const m = VIEW.maps.find((x) => x.map === state.mapFocus);
    if (!m) { box.hidden = true; return; }
    box.hidden = false;
    const peak = Math.max(...YEARS.map((y) => m.byYear[String(y)] || 0));
    box.innerHTML = `<span class="tag">Fokus</span><b>${esc(m.map)}</b> · ${fmt(m.total)} map (${pct(m.share)}) ·
      ${m.firstYear}–${m.lastYear} · puncak ${m.peakYear} (${fmt(peak)})`;
  }

  /* ------------------------------ 03 struktur ------------------------------ */

  function renderStructure() {
    const stages = VIEW.stages.filter((s) => s.count > 0);
    const totalStage = stages.reduce((a, b) => a + b.count, 0) || 1;

    $('#stageChart').replaceChildren(
      Charts.barRows({
        items: stages.map((s) => ({
          label: s.stage,
          value: s.count,
          tip: `${s.stage}\n${fmt(s.count)} map (${pct(s.count / totalStage)})\ndari ${fmt(totalStage)} map`,
        })),
        max: Math.max(1, ...stages.map((s) => s.count)),
      })
    );

    const totalMatches = VIEW.mapsPerMatch.reduce((a, b) => a + b.matches, 0) || 1;
    $('#formatChart').innerHTML = VIEW.mapsPerMatch
      .map((b) => {
        const share = b.matches / totalMatches;
        return `
        <div class="format-row">
          <span class="fr-label">${b.maps >= 5 ? '5 peta' : `${b.maps} peta`}</span>
          <span class="fr-track"><span class="fr-fill" style="width:${(share * 100).toFixed(2)}%"></span></span>
          <span class="fr-val">${fmt(b.matches)}</span>
          <span class="fr-share">${pct(share)}</span>
        </div>`;
      })
      .join('');

    const single = VIEW.mapsPerMatch.find((b) => b.maps === 1);
    $('#formatNote').textContent = VIEW.meta.matches
      ? `Satu peta = ${pct(single.matches / totalMatches)} (${fmt(single.matches)} laga) — tidak lazim di VALORANT, ` +
        `kemungkinan arsip tidak lengkap, bukan best-of-one.`
      : 'Tidak ada data pada filter ini.';

    buildTable(
      $('#stageTable'),
      ['Stage', 'Map dimainkan', 'Porsi'],
      stages.map((s) => [s.stage, fmt(s.count), pct(s.count / totalStage)])
    );
  }

  /* ------------------------------ 04 wilayah ------------------------------ */

  function renderRegions() {
    const regions = VIEW.regions.filter((r) => r.mapGames > 0);
    if (state.focusRegion && !regions.some((r) => r.region === state.focusRegion)) state.focusRegion = null;
    const total = regions.reduce((a, b) => a + b.mapGames, 0) || 1;

    $('#regionChart').innerHTML = regions
      .map(
        (r) => `
        <button class="region-bar" type="button" data-region="${esc(r.region)}"
                aria-pressed="${state.focusRegion === r.region}"
                data-tip="${esc(r.region)}\n${fmt(r.mapGames)} map dimainkan\n${pct(r.mapGames / total)} dari ${fmt(total)} map\n${r.tournaments} turnamen">
          <span class="sw" style="background:${regionColor(r.region)}"></span>
          <span class="rb-name">${esc(r.region)}</span>
          <span class="rb-track" aria-hidden="true"><span class="rb-fill" style="width:${(r.mapGames / total) * 100}%;background:${regionColor(r.region)}"></span></span>
          <span class="rb-num"><b>${pct(r.mapGames / total)}</b><span>${fmt(r.mapGames)} map</span></span>
        </button>`
      )
      .join('');

    const active = state.focusRegion ? regions.find((r) => r.region === state.focusRegion) : regions[0];
    renderRegionDetail(active, total);

    buildTable(
      $('#regionTable'),
      ['Wilayah', 'Map dimainkan', 'Porsi', 'Turnamen'],
      regions.map((r) => [r.region, fmt(r.mapGames), pct(r.mapGames / total), r.tournaments])
    );
  }

  function renderRegionDetail(active, total) {
    const detail = $('#regionDetail');
    const note = $('#regionNote');
    if (!active) {
      detail.innerHTML = '<p class="chart-note">Tidak ada data wilayah pada filter ini.</p>';
      if (note) note.textContent = '';
      return;
    }
    if (note) note.textContent = state.focusRegion ? 'dipilih' : 'wilayah teratas';
    const color = regionColor(active.region);
    const maxYear = Math.max(1, ...Object.values(active.byYear));
    const yearBars = YEARS.map((y) => {
      const v = active.byYear[String(y)] || 0;
      const dim = state.year !== 'all' && Number(state.year) !== y;
      return `<span class="rd-y${dim ? ' is-dim' : ''}">
        <span class="rd-bar"><i style="height:${Math.max((v / maxYear) * 100, 2)}%;background:${color}"></i></span>
        <b>${fmt(v)}</b><small>${y}</small>
      </span>`;
    }).join('');
    const peak = Object.entries(active.byYear).sort((a, b) => b[1] - a[1])[0];

    detail.innerHTML = `
      <div class="rd-head">
        <span class="sw" style="background:${color}"></span>
        <span class="rd-name">${esc(active.region)}</span>
      </div>
      <div class="rd-stats">
        <div><b>${pct(active.mapGames / total)}</b><span>Porsi map</span></div>
        <div><b>${fmt(active.mapGames)}</b><span>Map dimainkan</span></div>
        <div><b>${peak[0]}</b><span>Tahun puncak</span></div>
      </div>
      <p class="rd-title">Map per tahun</p>
      <div class="rd-years">${yearBars}</div>
      <p class="rd-title">Turnamen terbanyak · dari ${active.tournaments} turnamen</p>
      <ul>${active.topTournaments
        .map((t) => `<li><span>${esc(t.name)}</span><span>${fmt(t.mapGames)}</span></li>`)
        .join('')}</ul>
      <p class="rd-method">Wilayah heuristik dari nama turnamen; angka per tahun memakai filter lain tanpa filter tahun.</p>`;
  }

  /* ------------------------------ 05 tim ------------------------------ */

  function renderTeams() {
    const query = state.teamQuery.trim().toLowerCase();
    let teams = VIEW.topTeams.filter((t) => t.matches > 0);
    if (query) teams = teams.filter((t) => t.team.toLowerCase().includes(query));
    teams = teams.slice(0, 12);

    const max = Math.max(1, ...teams.map((t) => t.matches));
    $('#teamChart').replaceChildren(
      Charts.barRows({
        items: teams.map((t) => ({
          label: t.team,
          value: t.matches,
          className: 'team-bar',
          tip: `${t.team}\n${fmt(t.matches)} pertandingan · ${fmt(t.mapGames)} map`,
        })),
        max,
        labelW: 240,
        width: 1080,
        rowH: 32,
      })
    );

    $('#teamCount').textContent = `${teams.length} dari ${VIEW.topTeams.length} tim pada filter ini`;

    buildTable(
      $('#teamTable'),
      ['Tim', 'Pertandingan', 'Map dimainkan'],
      teams.map((t) => [t.team, fmt(t.matches), fmt(t.mapGames)])
    );
  }

  /* ------------------------------ 06 pemain ------------------------------ */

  function renderPlayers() {
    const chart = $('#playerChart');
    if (!chart) return;
    const top = VIEW.players.slice(0, 12);

    chart.replaceChildren(
      Charts.barRows({
        items: top.map((p) => ({
          label: p.player,
          value: p.matches,
          className: 'player-bar',
          attrs: { 'data-player': p.player },
          tip: `${p.player}\n${fmt(p.matches)} pertandingan\n${fmt(VIEW.meta.matches)} laga dalam filter`,
        })),
        max: Math.max(1, ...top.map((p) => p.matches)),
        labelW: 220,
        width: 900,
        rowH: 30,
      })
    );
    $('#playerCount').textContent = `${top.length} dari ${fmt(VIEW.playerCount)} pemain pada filter ini`;
    buildTable(
      $('#playerTable'),
      ['Pemain', 'Pertandingan'],
      top.map((p) => [p.player, fmt(p.matches)])
    );

    const selected = state.player || (VIEW.players[0] && VIEW.players[0].player);
    const idx = selected && P_INDEX.has(selected) ? P_INDEX.get(selected) : -1;
    const agg = idx >= 0 ? VIEW.playerByIdx.get(idx) : null;
    const detail = $('#playerDetail');
    const note = $('#playerNote');
    if (!selected || !agg) {
      detail.innerHTML = '<p class="chart-note">Tidak ada data pemain pada filter ini.</p>';
      if (note) note.textContent = '';
      return;
    }
    if (note) note.textContent = state.player ? 'dipilih' : 'pemain teratas';
    const team = P_TEAM[idx] === P_NONE ? '' : F.teams[P_TEAM[idx]];
    const share = DATA.meta.matches ? agg.matches / DATA.meta.matches : 0;
    detail.innerHTML = `
      <div class="rd-head"><span class="rd-name">${esc(selected)}</span></div>
      <div class="rd-stats">
        <div><b>${fmt(agg.matches)}</b><span>Laga</span></div>
        <div><b>${pct(share)}</b><span>Pangsa dataset</span></div>
        <div><b>${F.years[agg.first]}–${F.years[agg.last]}</b><span>Tahun aktif</span></div>
      </div>
      <p class="rd-title">Tim utama</p>
      <p class="rd-team">${team ? esc(team) : '—'}</p>
      <p class="rd-method">Partisipasi dihitung per pertandingan (gabungan seluruh peta laga).</p>`;
  }

  function selectPlayer(name) {
    state.player = name;
    const input = $('#fPlayer');
    if (input) input.value = name;
    hidePlayerResults();
    refresh();
  }

  let playerActive = -1;

  function renderPlayerResults(query) {
    const list = $('#playerResults');
    const input = $('#fPlayer');
    if (!list) return;
    const q = query.trim().toLowerCase();
    const out = [];
    for (let i = 0; i < P_N && out.length < 8; i++) {
      if (!q || P_LOWER[i].includes(q)) out.push(i);
    }
    playerActive = out.length ? 0 : -1;
    list.innerHTML = out.length
      ? out
          .map(
            (i, k) => `<li role="option" class="combo-item${k === 0 ? ' is-active' : ''}"
              data-player-name="${esc(P_NAMES[i])}"><span>${esc(P_NAMES[i])}</span><small>${fmt(P_MATCHES[i])} laga</small></li>`
          )
          .join('')
      : '<li class="combo-empty">Tidak ada pemain cocok</li>';
    list.hidden = false;
    if (input) input.setAttribute('aria-expanded', 'true');
  }

  function hidePlayerResults() {
    const list = $('#playerResults');
    const input = $('#fPlayer');
    if (list) list.hidden = true;
    if (input) input.setAttribute('aria-expanded', 'false');
    playerActive = -1;
  }

  /* ------------------------------ cari data ------------------------------ */

  const dataState = {
    type: 'player',
    query: '',
    sel: { player: -1, match: -1, team: -1, tournament: -1 },
  };
  const DATA_COLS = {
    player: { cols: '1fr 130px 70px', head: ['Nama', 'Tim utama', 'Laga'] },
    match: { cols: '1fr 190px 58px', head: ['Laga', 'Turnamen', 'Tahun'] },
    team: { cols: '1fr 70px 70px', head: ['Tim', 'Laga', 'Peta'] },
    tournament: { cols: '1fr 70px 70px', head: ['Turnamen', 'Laga', 'Peta'] },
  };

  const relItem = (goto, id, name, suffix) =>
    `<button class="rel-item" type="button" data-goto="${goto}" data-id="${id}">
      <span>${esc(name)}</span>${suffix ? `<small>${suffix}</small>` : ''}</button>`;

  const matchLabel = (m) => `${F.teams[matchTeamA[m]]} vs ${F.teams[matchTeamB[m]]}`;

  function recentMatches(filterFn, limit) {
    const out = [];
    for (let m = MATCH_N - 1; m >= 0 && out.length < limit; m--) if (filterFn(m)) out.push(m);
    return out;
  }

  function rowFor(type, id) {
    if (type === 'player') {
      return { id, cells: [P_NAMES[id], P_TEAM[id] === P_NONE ? '' : F.teams[P_TEAM[id]], fmt(P_MATCHES[id])] };
    }
    if (type === 'match') {
      return { id, cells: [matchLabel(id), F.tournaments[matchTour[id]], F.years[matchYear[id]]] };
    }
    if (type === 'team') {
      const st = teamStats.get(id);
      return { id, cells: [F.teams[id], fmt(st.matches), fmt(st.mapGames)] };
    }
    const st = tourStats.get(id);
    return { id, cells: [F.tournaments[id], fmt(st.matches), fmt(st.mapGames)] };
  }

  function renderExplorer() {
    const type = dataState.type;
    const meta = DATA_COLS[type];
    const q = dataState.query.trim().toLowerCase();
    const head = $('#dataHead');
    const rowsEl = $('#dataRows');
    if (!head || !rowsEl) return;

    const table = $('#dataTable');
    if (table) table.dataset.type = type;
    head.style.gridTemplateColumns = meta.cols;
    head.innerHTML = meta.head.map((h, i) => `<span class="${i ? 'num' : ''}">${h}</span>`).join('');

    const rows = [];
    const LIMIT = 60;
    if (type === 'player') {
      for (let i = 0; i < P_N && rows.length < LIMIT; i++) {
        if (q && !P_LOWER[i].includes(q)) continue;
        rows.push({
          id: i,
          cells: [P_NAMES[i], P_TEAM[i] === P_NONE ? '' : F.teams[P_TEAM[i]], fmt(P_MATCHES[i])],
        });
      }
    } else if (type === 'match') {
      for (let m = MATCH_N - 1; m >= 0 && rows.length < LIMIT; m--) {
        if (q && !matchSearch[m].includes(q)) continue;
        rows.push({
          id: m,
          cells: [matchLabel(m), F.tournaments[matchTour[m]], F.years[matchYear[m]]],
        });
      }
    } else if (type === 'team') {
      for (const ti of teamOrder) {
        if (rows.length >= LIMIT) break;
        if (q && !T_LOWER[ti].includes(q)) continue;
        const st = teamStats.get(ti);
        rows.push({ id: ti, cells: [F.teams[ti], fmt(st.matches), fmt(st.mapGames)] });
      }
    } else {
      for (const ti of tourOrder) {
        if (rows.length >= LIMIT) break;
        if (q && !TOUR_LOWER[ti].includes(q)) continue;
        const st = tourStats.get(ti);
        rows.push({ id: ti, cells: [F.tournaments[ti], fmt(st.matches), fmt(st.mapGames)] });
      }
    }

    let sel = dataState.sel[type];
    if (sel >= 0 && !rows.some((r) => r.id === sel)) {
      const extra = rowFor(type, sel);
      if (extra) rows.unshift(extra);
    }
    if (!rows.some((r) => r.id === sel)) sel = rows.length ? rows[0].id : -1;
    dataState.sel[type] = sel;

    rowsEl.innerHTML =
      rows
        .map(
          (r) => `
      <button class="data-row${r.id === sel ? ' is-sel' : ''}" type="button" data-id="${r.id}" style="grid-template-columns:${meta.cols}">
        ${r.cells.map((c, i) => `<span class="${i ? 'num' : ''}">${esc(c)}</span>`).join('')}
      </button>`
        )
        .join('') || '<p class="combo-empty">Tidak ada data cocok.</p>';

    $('#dataCount').textContent = rows.length
      ? `${rows.length} baris${q ? ` untuk “${dataState.query.trim()}”` : ''} · seluruh dataset`
      : 'Tidak ada data cocok.';

    renderDataDetail(type, sel);
  }

  function renderDataDetail(type, id) {
    const box = $('#dataDetail');
    const title = $('#dataDetailTitle');
    const note = $('#dataDetailNote');
    if (!box) return;
    if (id < 0) {
      title.textContent = 'Detail';
      note.textContent = '';
      box.innerHTML = '<p class="chart-note">Pilih baris untuk melihat detail.</p>';
      return;
    }

    if (type === 'player') {
      const matches = playerMatchList[id] || [];
      const first = matches.length ? F.years[matchYear[matches[0]]] : '—';
      const last = matches.length ? F.years[matchYear[matches[matches.length - 1]]] : '—';
      const team = P_TEAM[id] === P_NONE ? '' : F.teams[P_TEAM[id]];
      const tourCounts = new Map();
      const mates = new Map();
      for (const m of matches) {
        tourCounts.set(matchTour[m], (tourCounts.get(matchTour[m]) || 0) + 1);
        let side = -1;
        for (let k = MP_OFFSET[m]; k < MP_OFFSET[m + 1]; k++) if (MP_LIST[k] === id) side = MP_SIDE[k];
        for (let k = MP_OFFSET[m]; k < MP_OFFSET[m + 1]; k++) {
          const p = MP_LIST[k];
          if (p !== id && MP_SIDE[k] === side) mates.set(p, (mates.get(p) || 0) + 1);
        }
      }
      const topTours = [...tourCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
      const topMates = [...mates.entries()]
        .sort((a, b) => b[1] - a[1] || P_NAMES[a[0]].localeCompare(P_NAMES[b[0]]))
        .slice(0, 5);
      const recent = matches.slice(-5).reverse();

      title.textContent = P_NAMES[id];
      note.textContent = 'pemain';
      box.innerHTML = `
        <div class="rd-stats">
          <div><b>${fmt(matches.length)}</b><span>Laga</span></div>
          <div><b>${pct(DATA.meta.matches ? matches.length / DATA.meta.matches : 0)}</b><span>Pangsa dataset</span></div>
          <div><b>${first}–${last}</b><span>Tahun aktif</span></div>
        </div>
        ${team ? `<p class="rd-title">Tim utama</p><div class="rel-chips">${relItem('team', P_TEAM[id], team)}</div>` : ''}
        <p class="rd-title">Turnamen</p>
        <div class="rel-list">${topTours
          .map(([t, c]) => relItem('tournament', t, F.tournaments[t], `${fmt(c)} laga`))
          .join('')}</div>
        <p class="rd-title">Rekan tim tersering</p>
        <div class="rel-list">${topMates
          .map(([p, c]) => relItem('player', p, P_NAMES[p], `${fmt(c)}×`))
          .join('')}</div>
        <p class="rd-title">Laga terakhir</p>
        <div class="rel-list">${recent
          .map((m) => relItem('match', m, matchLabel(m), `${F.tournaments[matchTour[m]]} · ${F.years[matchYear[m]]}`))
          .join('')}</div>
        <p class="rd-method"><a class="vlr-link" href="#/player/${id}">Buka halaman pemain →</a></p>`;
      return;
    }

    if (type === 'match') {
      const a = F.teams[matchTeamA[id]];
      const b = F.teams[matchTeamB[id]];
      const maps = matchMaps[id].map((mi) => F.maps[mi]);
      const lineup = [[], [], []];
      for (let k = MP_OFFSET[id]; k < MP_OFFSET[id + 1]; k++) lineup[Math.min(MP_SIDE[k], 2)].push(MP_LIST[k]);
      const totalPlayers = lineup[0].length + lineup[1].length + lineup[2].length;

      title.textContent = `${a} vs ${b}`;
      note.textContent = MATCH_IDS[id] ? `Match ID ${MATCH_IDS[id]}` : 'pertandingan';
      box.innerHTML = `
        <div class="rd-stats">
          <div><b>${F.years[matchYear[id]]}</b><span>Tahun</span></div>
          <div><b>${maps.length}</b><span>Peta</span></div>
          <div><b>${totalPlayers}</b><span>Pemain</span></div>
        </div>
        <p class="rd-title">Turnamen</p>
        <div class="rel-list">${relItem('tournament', matchTour[id], F.tournaments[matchTour[id]], `${F.stages[matchStage[id]]} · ${F.years[matchYear[id]]}`)}</div>
        <p class="rd-title">Peta</p>
        <div class="rel-chips">${maps.map((x) => `<span class="rel-chip">${esc(x)}</span>`).join('')}</div>
        <p class="rd-title">Lineup</p>
        <div class="lineup">
          <div><h4>${relItem('team', matchTeamA[id], a)}</h4>
            ${lineup[0].map((p) => relItem('player', p, P_NAMES[p])).join('') || '<p class="chart-note">—</p>'}</div>
          <div><h4>${relItem('team', matchTeamB[id], b)}</h4>
            ${lineup[1].map((p) => relItem('player', p, P_NAMES[p])).join('') || '<p class="chart-note">—</p>'}</div>
        </div>
        ${
          lineup[2].length
            ? `<p class="rd-title">Tim tidak dikenali</p><div class="rel-list">${lineup[2]
                .map((p) => relItem('player', p, P_NAMES[p]))
                .join('')}</div>`
            : ''
        }
        ${
          MATCH_IDS[id]
            ? `<p class="rd-method"><a class="vlr-link" href="https://www.vlr.gg/${MATCH_IDS[id]}" target="_blank" rel="noopener">Buka di VLR.gg →</a></p>`
            : ''
        }`;
      return;
    }

    if (type === 'team') {
      const st = teamStats.get(id);
      const tours = [...st.tournaments.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
      const players = [...st.players].sort((a, b) => P_MATCHES[b] - P_MATCHES[a]).slice(0, 6);
      const recent = recentMatches((m) => matchTeamA[m] === id || matchTeamB[m] === id, 5);

      title.textContent = F.teams[id];
      note.textContent = 'tim';
      box.innerHTML = `
        <div class="rd-stats">
          <div><b>${fmt(st.matches)}</b><span>Laga</span></div>
          <div><b>${fmt(st.mapGames)}</b><span>Peta</span></div>
          <div><b>${fmt(st.tournaments.size)}</b><span>Turnamen</span></div>
        </div>
        <p class="rd-title">Turnamen</p>
        <div class="rel-list">${tours
          .map(([t, c]) => relItem('tournament', t, F.tournaments[t], `${fmt(c)} laga`))
          .join('')}</div>
        <p class="rd-title">Pemain</p>
        <div class="rel-list">${players
          .map((p) => relItem('player', p, P_NAMES[p], `${fmt(P_MATCHES[p])} laga`))
          .join('')}</div>
        <p class="rd-title">Laga terakhir</p>
        <div class="rel-list">${recent
          .map((m) => relItem('match', m, matchLabel(m), `${F.tournaments[matchTour[m]]} · ${F.years[matchYear[m]]}`))
          .join('')}</div>
        <p class="rd-method"><a class="vlr-link" href="#/team/${id}">Buka halaman tim →</a></p>`;
      return;
    }

    const ts = tourStats.get(id);
    const years = [...ts.years].map((y) => F.years[y]).sort();
    const teams = [...ts.teams.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const players = [...ts.players].sort((a, b) => P_MATCHES[b] - P_MATCHES[a]).slice(0, 5);
    const recent = recentMatches((m) => matchTour[m] === id, 5);

    title.textContent = F.tournaments[id];
    note.textContent = `${F.regions[tourRegion[id]]} · ${years.join(', ')}`;
    box.innerHTML = `
      <div class="rd-stats">
        <div><b>${fmt(ts.matches)}</b><span>Laga</span></div>
        <div><b>${fmt(ts.mapGames)}</b><span>Peta</span></div>
        <div><b>${fmt(ts.teams.size)}</b><span>Tim</span></div>
      </div>
      <p class="rd-title">Tim teratas</p>
      <div class="rel-list">${teams
        .map(([ti, c]) => relItem('team', ti, F.teams[ti], `${fmt(c)} laga`))
        .join('')}</div>
      <p class="rd-title">Pemain teratas</p>
      <div class="rel-list">${players
        .map((p) => relItem('player', p, P_NAMES[p], `${fmt(P_MATCHES[p])} laga`))
        .join('')}</div>
      <p class="rd-title">Laga terakhir</p>
      <div class="rel-list">${recent
        .map((m) => relItem('match', m, matchLabel(m), `${F.stages[matchStage[m]]} · ${F.years[matchYear[m]]}`))
        .join('')}</div>`;
  }

  function openData(type, id) {
    dataState.type = type;
    dataState.query = '';
    const input = $('#dataSearch');
    if (input) input.value = '';
    dataState.sel = { player: -1, match: -1, team: -1, tournament: -1 };
    dataState.sel[type] = id;
    $$('#dataTabs [data-type]').forEach((b) =>
      b.setAttribute('aria-pressed', String(b.dataset.type === type))
    );
    renderExplorer();
  }

  /* ------------------------------ ringkasan & temuan ------------------------------ */

  function renderFacts() {
    const years = VIEW.years;
    const peak = years.reduce((a, b) => (a.mapGames > b.mapGames ? a : b));
    const activeYears = years.filter((y) => y.mapGames > 0).length;
    const avg = activeYears ? VIEW.meta.mapGames / activeYears : 0;
    const recent = years.filter((y) => y.year >= 2023).reduce((s, y) => s + y.mapGames, 0);
    const top = VIEW.maps[0];
    const oq = VIEW.stages.find((s) => s.stage === 'Open Qualifier');
    const filtered = state.year !== 'all' || state.region || state.stage || state.map || state.tournament || state.team;
    let rows;
    if (!VIEW.meta.mapGames) {
      rows = [['Tidak ada data', '—', 'untuk kombinasi filter ini']];
    } else if (state.year === 'all') {
      rows = [
        ['Tahun puncak', peak.year, `${fmt(peak.mapGames)} map · ${pct(peak.mapGames / VIEW.meta.mapGames)}`],
        ['Rata-rata per tahun', fmt(Math.round(avg)), 'map dimainkan'],
        ['2023–2026', pct(recent / VIEW.meta.mapGames), `${fmt(recent)} map`],
        ['Peta teratas', top.map, `${fmt(top.total)} map · ${pct(top.share)}`],
        ['Peta berbeda', VIEW.meta.maps, 'dalam filter'],
      ];
    } else {
      rows = [
        ['Tahun dipilih', state.year, `${fmt(VIEW.meta.mapGames)} map · ${fmt(VIEW.meta.matches)} pertandingan`],
        ['Pangsa dataset', pct(VIEW.meta.mapGames / DATA.meta.mapGames), `${fmt(VIEW.meta.mapGames)} dari ${fmt(DATA.meta.mapGames)} map`],
        ['Peta teratas', top.map, `${fmt(top.total)} map · ${pct(top.share)}`],
        ['Peta berbeda', VIEW.meta.maps, 'dalam filter'],
      ];
    }
    if (filtered && VIEW.meta.mapGames && state.year === 'all') {
      rows.splice(3, 0, ['Pangsa dataset', pct(VIEW.meta.mapGames / DATA.meta.mapGames), `${fmt(VIEW.meta.mapGames)} dari ${fmt(DATA.meta.mapGames)} map`]);
    }

    $('#factsSkala').innerHTML = rows
      .map(
        ([label, value, sub]) => `
        <div class="stat-row">
          <div><span class="stat-label">${label}</span><span class="stat-sub">${sub}</span></div>
          <b class="stat-value">${value}</b>
        </div>`
      )
      .join('');

    const note = $('#noteStruktur');
    if (note) note.textContent = oq ? `Open Qualifier ${pct(oq.share)}` : '';

    $('#formatStats').innerHTML = [
      ['Rata-rata', VIEW.meta.mapsPerMatch.toFixed(2).replace('.', ','), 'peta per laga'],
      ['Total', fmt(VIEW.meta.matches), 'pertandingan'],
    ]
      .map(
        ([label, value, sub]) => `
        <div class="stat-row">
          <div><span class="stat-label">${label}</span><span class="stat-sub">${sub}</span></div>
          <b class="stat-value">${value}</b>
        </div>`
      )
      .join('');
  }

  function renderFindings() {
    const totalMatches = VIEW.mapsPerMatch.reduce((s, x) => s + x.matches, 0);
    const single = VIEW.mapsPerMatch.find((x) => x.maps === 1);
    const singleShare = totalMatches ? single.matches / totalMatches : 0;
    const f = (v, l, s) => `<div class="finding"><b>${v}</b><span>${l}</span><small>${s}</small></div>`;

    $('#closing').innerHTML =
      [
        f(pct(VIEW.insights.top3MapShare), VIEW.insights.top3Maps.join(' · ') || '—', `dari ${fmt(VIEW.meta.mapGames)} map`),
        f(pct(VIEW.insights.coverage2021_2022), 'Data 2021–2022', 'cakupan arsip tidak merata'),
        f(pct(VIEW.insights.openQualifierShare), 'Open Qualifier', 'stage dengan map terbanyak'),
        f(pct(singleShare), '1 peta per laga', 'kemungkinan arsip tidak lengkap'),
      ].join('') + '<p class="findings-note">Tanpa skor/pemenang — tidak ada analisis hasil.</p>';
  }

  /* ------------------------------ header & status ------------------------------ */

  function updateHeader() {
    const m = VIEW.meta;
    $('#pageSub').textContent = `${fmt(m.mapGames)} map dimainkan · ${fmt(m.matches)} pertandingan · ${fmt(m.tournaments)} turnamen · ${fmt(m.teams)} tim`;

    const active = [];
    if (state.year !== 'all') active.push(String(state.year));
    if (state.region) active.push(state.region);
    if (state.stage) active.push(state.stage);
    if (state.map) active.push(state.map);
    if (state.tournament) active.push(state.tournament);
    if (state.team) active.push(state.team);
    if (state.player) active.push(state.player);
    $('#filterStatus').textContent = active.length
      ? `Filter aktif: ${active.join(' · ')} — ${fmt(m.mapGames)} map, ${fmt(m.matches)} pertandingan`
      : '';
    $('#emptyState').hidden = m.mapGames !== 0;
    const clear = $('#playerClear');
    if (clear) clear.hidden = !state.player;
  }

  /* ------------------------------ tabel aksesibilitas ------------------------------ */

  function buildTable(container, headers, rows) {
    if (!container) return;
    container.innerHTML = `
      <summary>Lihat data sebagai tabel</summary>
      <table>
        <thead><tr>${headers.map((h) => `<th scope="col">${h}</th>`).join('')}</tr></thead>
        <tbody>${rows
          .map((r) => `<tr>${r.map((c, i) => (i === 0 ? `<th scope="row">${esc(c)}</th>` : `<td>${c}</td>`)).join('')}</tr>`)
          .join('')}</tbody>
      </table>`;
  }

  /* ------------------------------ tooltip ------------------------------ */

  const tip = { el: null, node: null };

  function initTooltip() {
    tip.el = $('#tooltip');

    const place = (x, y) => {
      const pad = 14;
      const rect = tip.el.getBoundingClientRect();
      const left = Math.min(Math.max(x, rect.width / 2 + 8), window.innerWidth - rect.width / 2 - 8);
      const top = y - pad < rect.height + 8 ? y + rect.height + pad * 2 : y;
      tip.el.style.left = `${left}px`;
      tip.el.style.top = `${top}px`;
    };
    const show = (node, x, y) => {
      if (!node || !node.dataset.tip) return;
      tip.node = node;
      tip.el.textContent = node.dataset.tip;
      tip.el.classList.add('show');
      place(x, y);
    };
    const hide = () => {
      tip.el.classList.remove('show');
      tip.node = null;
    };

    document.addEventListener('pointerover', (e) => {
      const node = e.target.closest('[data-tip]');
      if (node) show(node, e.clientX, e.clientY);
    });
    document.addEventListener('pointermove', (e) => {
      if (tip.node) place(e.clientX, e.clientY);
    });
    document.addEventListener('pointerout', (e) => {
      if (e.target.closest('[data-tip]')) hide();
    });
    document.addEventListener('focusin', (e) => {
      const node = e.target.closest('[data-tip]');
      if (!node) return;
      const r = node.getBoundingClientRect();
      show(node, r.left + r.width / 2, r.top);
    });
    document.addEventListener('focusout', hide);
    window.addEventListener('scroll', hide, { passive: true });
  }

  /* ------------------------------ filter UI ------------------------------ */

  function fillSelect(id, values, allLabel, sorter) {
    const el = $(id);
    if (!el) return;
    const list = sorter ? [...values].sort(sorter) : values;
    el.innerHTML =
      `<option value="">${allLabel}</option>` +
      list.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
  }

  function initFilters() {
    fillSelect('#fRegion', F.regions, 'Semua wilayah');
    fillSelect('#fStage', F.stages, 'Semua stage');
    fillSelect('#fMap', F.maps, 'Semua peta', (a, b) => a.localeCompare(b));
    fillSelect('#fTournament', F.tournaments, 'Semua turnamen');
    fillSelect('#fTeam', F.teams, 'Semua tim');

    const binds = [
      ['fRegion', 'region'],
      ['fStage', 'stage'],
      ['fMap', 'map'],
      ['fTournament', 'tournament'],
      ['fTeam', 'team'],
    ];
    binds.forEach(([id, key]) => {
      $('#' + id).addEventListener('change', (e) => {
        state[key] = e.target.value;
        refresh();
      });
    });
  }

  function refresh() {
    VIEW = buildView();
    if (state.mapFocus && !VIEW.maps.some((m) => m.map === state.mapFocus)) state.mapFocus = null;
    if (state.focusRegion && !VIEW.regions.some((r) => r.region === state.focusRegion)) state.focusRegion = null;
    renderKpis(false);
    renderFacts();
    renderScale();
    renderMeta();
    renderStructure();
    renderRegions();
    renderTeams();
    renderPlayers();
    renderFindings();
    updateHeader();
  }

  function setYear(year) {
    state.year = year === 'all' ? 'all' : String(year);
    $$('[data-year]').forEach((b) => b.setAttribute('aria-pressed', String(String(b.dataset.year) === String(year))));
    if ($('#filters')) $('#filters').dataset.active = String(year);
    refresh();
  }

  function resetFilters() {
    state.year = 'all';
    state.region = '';
    state.stage = '';
    state.map = '';
    state.tournament = '';
    state.team = '';
    state.mapFocus = null;
    state.focusRegion = null;
    state.teamQuery = '';
    state.player = '';
    ['#fRegion', '#fStage', '#fMap', '#fTournament', '#fTeam', '#fPlayer'].forEach((sel) => {
      const el = $(sel);
      if (el) el.value = '';
    });
    const input = $('#teamInput');
    if (input) input.value = '';
    hidePlayerResults();
    setYear('all');
  }

  /* ------------------------------ interaksi ------------------------------ */

  function toggleMap(map) {
    state.mapFocus = state.mapFocus === map ? null : map;
    renderMeta();
  }

  function initEvents() {
    $('#yearChips').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-year]');
      if (btn) setYear(btn.dataset.year);
    });

    $('#resetFilters').addEventListener('click', resetFilters);

    $('#metricToggle').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-metric]');
      if (!btn) return;
      state.metric = btn.dataset.metric;
      renderScale();
    });

    $('#heatmap').addEventListener('click', (e) => {
      const cell = e.target.closest('[data-map-year]');
      if (!cell) return;
      toggleMap(cell.dataset.mapYear.split('|')[0]);
    });

    $('#heatmap').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const cell = e.target.closest('[data-map-year]');
      if (!cell) return;
      e.preventDefault();
      toggleMap(cell.dataset.mapYear.split('|')[0]);
    });

    $('#mapGrid').addEventListener('click', (e) => {
      const card = e.target.closest('[data-map]');
      if (card) toggleMap(card.dataset.map);
    });

    $('#mapGrid').addEventListener('keydown', (e) => {
      const card = e.target.closest('[data-map]');
      if (!card) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleMap(card.dataset.map);
      }
    });

    $('#regionChart').addEventListener('click', (e) => {
      const row = e.target.closest('[data-region]');
      if (!row) return;
      const viaKeyboard = e.detail === 0;
      state.focusRegion = state.focusRegion === row.dataset.region ? null : row.dataset.region;
      renderRegions();
      if (!viaKeyboard) return;
      const next = $(`#regionChart [data-region="${CSS.escape(row.dataset.region)}"]`);
      if (next) next.focus({ preventScroll: true });
    });

    const playerChart = $('#playerChart');
    if (playerChart) {
      playerChart.addEventListener('click', (e) => {
        const g = e.target.closest('[data-player]');
        if (g) selectPlayer(g.dataset.player);
      });
      playerChart.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const g = e.target.closest('[data-player]');
        if (!g) return;
        e.preventDefault();
        selectPlayer(g.dataset.player);
      });
    }

    const pInput = $('#fPlayer');
    if (pInput) {
      pInput.addEventListener('input', () => {
        if (!pInput.value.trim() && state.player) {
          state.player = '';
          refresh();
        }
        renderPlayerResults(pInput.value);
      });
      pInput.addEventListener('focus', () => renderPlayerResults(pInput.value));
      pInput.addEventListener('keydown', (e) => {
        const items = $$('#playerResults .combo-item');
        if (e.key === 'Escape') { hidePlayerResults(); pInput.blur(); return; }
        if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && items.length) {
          e.preventDefault();
          playerActive = (playerActive + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
          items.forEach((it, k) => it.classList.toggle('is-active', k === playerActive));
          items[playerActive].scrollIntoView({ block: 'nearest' });
          return;
        }
        if (e.key === 'Enter' && playerActive >= 0 && items[playerActive]) {
          e.preventDefault();
          selectPlayer(items[playerActive].dataset.playerName);
          pInput.blur();
        }
      });
      pInput.addEventListener('blur', () => setTimeout(hidePlayerResults, 120));
    }

    const pResults = $('#playerResults');
    if (pResults) {
      pResults.addEventListener('mousedown', (e) => {
        const item = e.target.closest('.combo-item');
        if (!item) return;
        e.preventDefault();
        selectPlayer(item.dataset.playerName);
        if (pInput) pInput.blur();
      });
    }

    const pClear = $('#playerClear');
    if (pClear) {
      pClear.addEventListener('click', () => {
        state.player = '';
        if (pInput) pInput.value = '';
        hidePlayerResults();
        refresh();
      });
    }

    const dataTabs = $('#dataTabs');
    if (dataTabs) {
      dataTabs.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-type]');
        if (!btn) return;
        dataState.type = btn.dataset.type;
        dataState.query = '';
        const search = $('#dataSearch');
        if (search) search.value = '';
        $$('#dataTabs [data-type]').forEach((b) =>
          b.setAttribute('aria-pressed', String(b === btn))
        );
        renderExplorer();
      });
    }

    const dataSearch = $('#dataSearch');
    if (dataSearch) {
      dataSearch.addEventListener('input', () => {
        dataState.query = dataSearch.value;
        dataState.sel[dataState.type] = -1;
        renderExplorer();
      });
    }

    const dataRows = $('#dataRows');
    if (dataRows) {
      dataRows.addEventListener('click', (e) => {
        const row = e.target.closest('.data-row');
        if (!row) return;
        dataState.sel[dataState.type] = Number(row.dataset.id);
        renderExplorer();
      });
    }

    const dataDetail = $('#dataDetail');
    if (dataDetail) {
      dataDetail.addEventListener('click', (e) => {
        const rel = e.target.closest('[data-goto]');
        if (!rel) return;
        openData(rel.dataset.goto, Number(rel.dataset.id));
      });
    }

    const input = $('#teamInput');
    input.addEventListener('input', () => {
      state.teamQuery = input.value;
      renderTeams();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        input.value = '';
        state.teamQuery = '';
        renderTeams();
        input.blur();
      }
    });

    $('#themeBtn').addEventListener('click', toggleTheme);
  }

  /* ------------------------------ progress ------------------------------ */

  function initObservers() {
    const bar = $('#progress');
    const onScroll = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      bar.style.width = `${max > 0 ? (h.scrollTop / max) * 100 : 0}%`;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ------------------------------ boots ------------------------------ */

  function boot() {
    initTheme();
    initFilters();
    VIEW = buildView();
    renderKpis(true);
    renderFacts();
    renderScale();
    renderMeta();
    renderStructure();
    renderRegions();
    renderTeams();
    renderPlayers();
    renderExplorer();
    renderFindings();
    updateHeader();
    initTooltip();
    initEvents();
    initObservers();
    $$('[data-year]').forEach((b) =>
      b.setAttribute('aria-pressed', String(b.dataset.year === 'all'))
    );
  }

  window.__APP = {
    DATA,
    F,
    P_NAMES,
    P_MATCHES,
    P_TEAM,
    P_NONE,
    TEAM_NONE,
    teamStats,
    tourStats,
    playerMatchList,
    matchMaps,
    MATCH_IDS,
    matchTeamA,
    matchTeamB,
    matchTour,
    matchStage,
    matchYear,
    MP_OFFSET,
    MP_LIST,
    MP_SIDE,
    tourRegion,
    fmt,
    pct,
    esc,
    matchLabel,
  };

  document.addEventListener('DOMContentLoaded', boot);
})();
