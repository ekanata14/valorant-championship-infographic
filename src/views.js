/* ============================================================
   views.js — halaman Juara, VCT, Turnamen lain, Tim, Pemain.
   Memakai indeks yang sudah dibangun app.js lewat window.__APP.
   ============================================================ */

(() => {
  'use strict';

  const A = window.__APP;
  if (!A) return;
  const { DATA: D, F, P_NAMES, P_MATCHES, P_TEAM, TEAM_NONE } = A;
  const fmt = A.fmt;
  const pct = A.pct;
  const esc = A.esc;
  const IMG = D.images || {};

  const initials = (name) =>
    String(name)
      .replace(/[^A-Za-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || '?';

  const eventBadge = (w, cls = 'logo-event') => {
    const src =
      (IMG.events && IMG.events[w.name]) ||
      (w.tier !== 'other' && IMG.events && IMG.events.__vct);
    if (src) return `<img class="${cls}" src="${src}" alt="" loading="lazy" decoding="async">`;
    return `<span class="${cls} avatar-fallback">${esc(initials(w.name))}</span>`;
  };

  const imgOr = (kind, name, cls) => {
    const src = IMG[kind] && IMG[kind][name];
    if (src) {
      return `<img class="${cls}" src="${src}" alt="" loading="lazy" decoding="async">`;
    }
    return `<span class="${cls} avatar-fallback">${esc(initials(name))}</span>`;
  };

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const B36 = '0123456789abcdefghijklmnopqrstuvwxyz';
  const BV = {};
  for (let i = 0; i < 36; i++) BV[B36[i]] = i;
  const dN = (s, i, w) => {
    let v = 0;
    for (let k = 0; k < w; k++) v = v * 36 + BV[s[i + k]];
    return v;
  };

  const WIN = (D.winners && D.winners.tournaments) || [];
  const RES = (D.winners && D.winners.matchResults) || '';
  const SCORES = (D.winners && D.winners.matchScores) || '';
  const PERF = D.performance || { playerWidth: 0, teamWidth: 0, players: '', teams: '' };
  const MATCH_N = F.matches.year.length;
  const TOUR_IDX = new Map(F.tournaments.map((n, i) => [n, i]));
  const WIN_BY_NAME = new Map(WIN.map((w) => [w.name, w]));
  const TIX_YEAR = new Map();
  WIN.forEach((w) => {
    const i = TOUR_IDX.get(w.name);
    if (i != null) TIX_YEAR.set(i, w.year);
  });

  /* ------------------------------ decode performa ------------------------------ */

  const P_PERF = new Map();
  const T_PERF = new Map();

  const pw = PERF.playerWidth || 0;
  for (let i = 0; pw && i < PERF.players.length; i += pw) {
    const rec = {
      player: dN(PERF.players, i, 3),
      tour: dN(PERF.players, i + 3, 2),
      maps: dN(PERF.players, i + 5, 2),
      kills: dN(PERF.players, i + 7, 3),
      deaths: dN(PERF.players, i + 10, 3),
      rating: dN(PERF.players, i + 13, 4),
      acs: dN(PERF.players, i + 17, 4),
      wins: dN(PERF.players, i + 21, 2),
      losses: dN(PERF.players, i + 23, 2),
    };
    let arr = P_PERF.get(rec.player);
    if (!arr) { arr = []; P_PERF.set(rec.player, arr); }
    arr.push(rec);
  }

  const tw = PERF.teamWidth || 0;
  for (let i = 0; tw && i < PERF.teams.length; i += tw) {
    const rec = {
      team: dN(PERF.teams, i, 3),
      tour: dN(PERF.teams, i + 3, 2),
      maps: dN(PERF.teams, i + 5, 3),
      wins: dN(PERF.teams, i + 8, 2),
      losses: dN(PERF.teams, i + 10, 2),
      rating: dN(PERF.teams, i + 12, 5),
      acs: dN(PERF.teams, i + 17, 6),
    };
    let arr = T_PERF.get(rec.team);
    if (!arr) { arr = []; T_PERF.set(rec.team, arr); }
    arr.push(rec);
  }

  const perfFor = (p, tix) => {
    const arr = P_PERF.get(p);
    return arr ? arr.find((r) => r.tour === tix) : null;
  };
  const ratingOf = (rec) => (rec && rec.maps ? rec.rating / 100 / rec.maps : 0);
  const acsOf = (rec) => (rec && rec.maps ? rec.acs / rec.maps : 0);
  const kdOf = (rec) => (rec && rec.deaths ? rec.kills / rec.deaths : 0);

  /* ------------------------------ pemain per tim/turnamen ------------------------------ */

  const PT_TEAM = new Map();
  const TEAM_TOUR = new Map();
  const TEAM_PLAYERS = new Map();

  for (let m = 0; m < MATCH_N; m++) {
    const tix = A.matchTour[m];
    const ta = A.matchTeamA[m];
    const tb = A.matchTeamB[m];
    for (let k = A.MP_OFFSET[m]; k < A.MP_OFFSET[m + 1]; k++) {
      const p = A.MP_LIST[k];
      const side = A.MP_SIDE[k];
      const team = side === 0 ? ta : side === 1 ? tb : -1;
      if (team < 0 || team === TEAM_NONE) continue;
      const key = p + '|' + tix;
      if (!PT_TEAM.has(key)) PT_TEAM.set(key, team);
      const tk = tix + '|' + team;
      let set = TEAM_TOUR.get(tk);
      if (!set) { set = new Set(); TEAM_TOUR.set(tk, set); }
      set.add(p);
      let tp = TEAM_PLAYERS.get(team);
      if (!tp) { tp = new Set(); TEAM_PLAYERS.set(team, tp); }
      tp.add(p);
    }
  }

  const rosterFor = (w) => {
    if (w.winner == null) return [];
    const tix = TOUR_IDX.get(w.name);
    const set = TEAM_TOUR.get(tix + '|' + w.winner);
    return set ? [...set].sort((a, b) => P_MATCHES[b] - P_MATCHES[a]) : [];
  };

  /* ------------------------------ fokus: 16 major VCT ------------------------------ */

  const isChampions = (w) => /^Valorant Champions \d{4}$/.test(w.name);
  const MAJORS = WIN.filter((w) => w.tier === 'major' && w.winner != null);
  const CHAMPIONS = MAJORS.filter(isChampions).sort(
    (a, b) => (b.year || 0) - (a.year || 0)
  );
  const MASTERS = MAJORS.filter((w) => !isChampions(w)).sort(
    (a, b) => (b.year || 0) - (a.year || 0) || b.name.localeCompare(a.name)
  );

  const TEAM_TITLES = new Map();
  MAJORS.forEach((w) => {
    for (const [idx, key] of [
      [w.winner, 'titles'],
      [w.runnerUp, 'finals'],
    ]) {
      if (idx == null || idx === TEAM_NONE) continue;
      let entry = TEAM_TITLES.get(idx);
      if (!entry) {
        entry = { titles: [], finals: [] };
        TEAM_TITLES.set(idx, entry);
      }
      entry[key].push(w);
    }
  });

  const PLAYER_TITLES = new Map();
  MAJORS.forEach((w) => {
    for (const p of rosterFor(w)) {
      let entry = PLAYER_TITLES.get(p);
      if (!entry) {
        entry = { titles: [], teams: new Set() };
        PLAYER_TITLES.set(p, entry);
      }
      entry.titles.push(w);
      entry.teams.add(w.winner);
    }
  });

  const teamRanking = () =>
    [...TEAM_TITLES.entries()]
      .filter(([, entry]) => entry.titles.length > 0)
      .map(([id, entry]) => ({ id, titles: entry.titles, finals: entry.finals }))
      .sort(
        (a, b) =>
          b.titles.length - a.titles.length ||
          b.finals.length - a.finals.length ||
          F.teams[a.id].localeCompare(F.teams[b.id])
      );

  const playerRanking = () =>
    [...PLAYER_TITLES.entries()]
      .map(([p, entry]) => ({ p, titles: entry.titles, teams: [...entry.teams] }))
      .sort(
        (a, b) =>
          b.titles.length - a.titles.length ||
          P_MATCHES[b.p] - P_MATCHES[a.p] ||
          P_NAMES[a.p].localeCompare(P_NAMES[b.p])
      );

  // statistik menang–kalah per tim, hanya dari 16 major
  const MAJOR_TIX = new Set(MAJORS.map((w) => TOUR_IDX.get(w.name)).filter((x) => x != null));
  const TEAM_MAJOR = new Map();
  for (let m = 0; m < MATCH_N; m++) {
    if (!MAJOR_TIX.has(A.matchTour[m])) continue;
    const win = RES[m] ? +RES[m] : 2;
    if (win === 2) continue;
    const year = F.years[A.matchYear[m]];
    for (const [side, id] of [
      [0, A.matchTeamA[m]],
      [1, A.matchTeamB[m]],
    ]) {
      if (id === TEAM_NONE) continue;
      let entry = TEAM_MAJOR.get(id);
      if (!entry) {
        entry = { wins: 0, losses: 0, byYear: new Map() };
        TEAM_MAJOR.set(id, entry);
      }
      let y = entry.byYear.get(year);
      if (!y) {
        y = { wins: 0, losses: 0 };
        entry.byYear.set(year, y);
      }
      if (win === side) {
        entry.wins++;
        y.wins++;
      } else {
        entry.losses++;
        y.losses++;
      }
    }
  }

  const MAJOR_YEARS = [...new Set(MAJORS.map((w) => w.year))].sort((a, b) => b - a);

  const PODIUMS = [...new Set(MAJORS.map((w) => w.year))]
    .sort((a, b) => a - b)
    .map((year) => {
      const champs = CHAMPIONS.find((w) => w.year === year);
      const event =
        champs ||
        MAJORS.filter((w) => w.year === year).sort(
          (a, b) => Number(b.finalMatch || 0) - Number(a.finalMatch || 0)
        )[0];
      return event ? { year, event, isChampions: !!champs } : null;
    })
    .filter(Boolean);

  const titleHead = `<div class="title-row title-head">
    <span>#</span><span></span><span>Tim</span><span>Gelar</span><span>Tahun</span><span>Final</span>
  </div>`;

  const titleRow = (t, i) => `<a class="title-row" href="#/team/${t.id}">
    <span class="title-rank">${i + 1}</span>
    ${imgOr('teams', F.teams[t.id], 'logo-team')}
    <span class="title-name">${esc(F.teams[t.id])}</span>
    <span class="title-count">${t.titles.length}</span>
    <span class="title-years">${t.titles.map((w) => w.year).join(' · ')}</span>
    <span class="title-finals">${t.finals.length}</span>
  </a>`;

  /* ------------------------------ format & tautan ------------------------------ */

  const teamLink = (i, cls = '') =>
    i == null || i === TEAM_NONE
      ? '—'
      : `<a class="${cls} with-logo" href="#/team/${i}">${imgOr(
          'teams',
          F.teams[i],
          'logo-team'
        )}<span>${esc(F.teams[i])}</span></a>`;

  const teamName = (i) =>
    i == null || i === TEAM_NONE ? '—' : `<a href="#/team/${i}">${esc(F.teams[i])}</a>`;

  const playerLink = (p, cls = '') =>
    `<a class="${cls} with-logo" href="#/player/${p}">${imgOr(
      'players',
      P_NAMES[p],
      'avatar-player'
    )}<span>${esc(P_NAMES[p])}</span></a>`;

  const scoreText = (w) => (w.score ? `${w.score[0]}–${w.score[1]}` : '—');

  const playerChip = (p, tix) => {
    const rec = perfFor(p, tix);
    const r = ratingOf(rec);
    return `<a class="chip-player with-logo" href="#/player/${p}">${imgOr(
      'players',
      P_NAMES[p],
      'avatar-player'
    )}<span>${esc(P_NAMES[p])}</span>${r ? `<small>${r.toFixed(2)}</small>` : ''}</a>`;
  };

  const outcome = (m, team) => {
    const w = RES[m] ? +RES[m] : 2;
    if (w === 2 || team == null || team < 0) return '?';
    const side = A.matchTeamA[m] === team ? 0 : 1;
    return w === side ? 'W' : 'L';
  };

  const perspectiveScore = (m, team) => {
    const a = SCORES[m * 2];
    const b = SCORES[m * 2 + 1];
    if (!a || a === 'z' || !b || b === 'z') return '—';
    const va = BV[a];
    const vb = BV[b];
    return A.matchTeamA[m] === team ? `${va}–${vb}` : `${vb}–${va}`;
  };

  const matchRow = (m, team) => {
    const opp = A.matchTeamA[m] === team ? A.matchTeamB[m] : A.matchTeamA[m];
    const out = outcome(m, team);
    return `<div class="match-row">
      <span class="match-out ${out === 'W' ? 'is-win' : out === 'L' ? 'is-loss' : ''}">${out}</span>
      <a class="match-opp with-logo" href="#/team/${opp}">${imgOr(
        'teams',
        F.teams[opp],
        'logo-team'
      )}<span>${esc(F.teams[opp])}</span></a>
      <span class="match-event">${esc(F.tournaments[A.matchTour[m]])}</span>
      <span class="match-score">${perspectiveScore(m, team)}</span>
    </div>`;
  };

  const playerTeamInMatch = (p, m) => {
    for (let k = A.MP_OFFSET[m]; k < A.MP_OFFSET[m + 1]; k++) {
      if (A.MP_LIST[k] === p) {
        return A.MP_SIDE[k] === 0 ? A.matchTeamA[m] : A.MP_SIDE[k] === 1 ? A.matchTeamB[m] : -1;
      }
    }
    return -1;
  };

  const teamRegion = (team) => {
    const st = A.teamStats.get(team);
    if (!st) return '';
    const counts = new Map();
    for (const tix of st.tournaments.keys()) {
      const r = F.regions[A.tourRegion[tix]];
      counts.set(r, (counts.get(r) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  };

  /* ------------------------------ komponen juara ------------------------------ */

  const teamTourStats = (team, tix) => {
    if (team == null) return '';
    const rec = (T_PERF.get(team) || []).find((r) => r.tour === tix);
    if (!rec || !rec.maps) return '';
    return `${rec.maps} peta · ${(rec.rating / 100 / rec.maps).toFixed(2)} rating · ${Math.round(
      rec.acs / rec.maps
    )} ACS`;
  };

  const champCard = (w) => {
    const tix = TOUR_IDX.get(w.name);
    const roster = rosterFor(w).slice(0, 5);
    const stats = teamTourStats(w.winner, tix);
    return `<article class="champ-card">
      <div class="champ-top">
        <span class="champ-year">${w.year || '—'}</span>
        <span class="champ-tier">${w.tier === 'major' ? 'VCT Major' : w.tier === 'vct' ? 'VCT' : 'Lainnya'}</span>
      </div>
      <h3 class="champ-event"><span class="with-logo">${eventBadge(
        w
      )}<span>${esc(w.name)}</span></span></h3>
      <div class="champ-main">
        ${teamLink(w.winner, 'champ-team')}
        <span class="champ-score">${scoreText(w)}</span>
      </div>
      <p class="champ-sub">mengalahkan ${teamLink(w.runnerUp, 'champ-runner')}</p>
      <p class="champ-stats">${stats}</p>
      <div class="champ-roster">${roster.map((p) => playerChip(p, tix)).join('')}</div>
    </article>`;
  };

  const winnerHead = `<div class="winner-row winner-head">
    <span>Tahun</span><span>Turnamen</span><span>Wilayah</span><span>Juara</span><span>Skor</span>
  </div>`;

  const winnerRows = (list, limit) => {
    if (!list.length) return '';
    return (
      winnerHead +
      list
        .slice(0, limit || list.length)
        .map(
          (w) => `<div class="winner-row">
            <span class="winner-year">${w.year || '—'}</span>
            <span class="winner-event with-logo">${eventBadge(
              w
            )}<span>${esc(w.name)}</span></span>
            <span class="winner-region">${esc(w.region || '')}</span>
            ${teamLink(w.winner, 'winner-team')}
            <span class="winner-score">${scoreText(w)}</span>
          </div>`
        )
        .join('')
    );
  };

  const viewHead = (eyebrow, title, sub, logo = '') => `<header class="view-head">
    <p class="eyebrow">${eyebrow}</p>
    <div class="view-title-row">${logo}<h1>${title}</h1></div>
    <p class="view-sub">${sub}</p>
  </header>`;

  /* ------------------------------ home ------------------------------ */

  let winYear = 'all';
  let winTeam = 'all';
  let winMetric = 'wins';

  function winStats() {
    let totalW = 0;
    let totalL = 0;
    const rows = [];
    for (const [id, entry] of TEAM_MAJOR) {
      if (winTeam !== 'all' && String(id) !== String(winTeam)) continue;
      let w = entry.wins;
      let l = entry.losses;
      if (winYear !== 'all') {
        const y = entry.byYear.get(Number(winYear));
        w = y ? y.wins : 0;
        l = y ? y.losses : 0;
      }
      if (w + l === 0) continue;
      rows.push({ id, w, l, rate: w / (w + l) });
      totalW += w;
      totalL += l;
    }
    rows.sort((a, b) =>
      winMetric === 'losses'
        ? b.l - a.l || b.rate - a.rate || F.teams[a.id].localeCompare(F.teams[b.id])
        : b.w - a.w || b.rate - a.rate || F.teams[a.id].localeCompare(F.teams[b.id])
    );
    return { rows, totalW, totalL, totalM: totalW + totalL };
  }

  function winHeroHtml() {
    const teamOptions = [...TEAM_MAJOR.entries()]
      .sort((a, b) => b[1].wins - a[1].wins || F.teams[a[0]].localeCompare(F.teams[b[0]]))
      .map(
        ([id]) =>
          `<option value="${id}"${String(winTeam) === String(id) ? ' selected' : ''}>${esc(
            F.teams[id]
          )}</option>`
      )
      .join('');
    const yearOptions = MAJOR_YEARS.map(
      (y) =>
        `<option value="${y}"${String(winYear) === String(y) ? ' selected' : ''}>${y}</option>`
    ).join('');
    return `<article class="win-hero panel"><div class="panel-body">
      <div class="win-hero-head">
        <div>
          <h2 class="panel-title">Statistik kemenangan tim</h2>
          <p class="panel-note">Dihitung dari 16 major VCT</p>
        </div>
        <div class="win-controls">
          <label class="filter-field"><span class="filter-label">Tahun</span>
            <select id="winYear"><option value="all"${
              winYear === 'all' ? ' selected' : ''
            }>Semua</option>${yearOptions}</select>
          </label>
          <label class="filter-field"><span class="filter-label">Tim</span>
            <select id="winTeam"><option value="all"${
              winTeam === 'all' ? ' selected' : ''
            }>Semua tim</option>${teamOptions}</select>
          </label>
          <div class="seg" id="winMetric" role="group" aria-label="Urutkan">
            <button type="button" data-win-metric="wins" aria-pressed="${winMetric === 'wins'}">Menang</button>
            <button type="button" data-win-metric="losses" aria-pressed="${winMetric === 'losses'}">Kalah</button>
          </div>
          <button class="chip-reset" id="winReset" type="button">Reset</button>
        </div>
      </div>
      <div id="winHeroBody"></div>
    </div></article>`;
  }

  function updateWinHero() {
    const box = $('#winHeroBody');
    if (!box) return;
    const { rows, totalW, totalL, totalM } = winStats();
    const top = rows.slice(0, winTeam === 'all' ? 10 : 1);
    const max = Math.max(1, ...top.map((r) => (winMetric === 'losses' ? r.l : r.w)));
    const leader = rows[0];
    box.innerHTML = `
      <div class="win-kpis">
        <div><b>${fmt(totalM)}</b><span>Laga</span></div>
        <div><b>${fmt(totalW)}</b><span>Menang</span></div>
        <div><b>${fmt(totalL)}</b><span>Kalah</span></div>
        <div><b>${fmt(rows.length)}</b><span>Tim</span></div>
      </div>
      <div class="win-table">
        <div class="win-row win-head">
          <span>#</span><span>Tim</span><span></span><span>M</span><span>K</span><span>%</span>
        </div>
        ${
          top
            .map(
              (r, i) => `<div class="win-row">
                <span class="win-rank">${i + 1}</span>
                <a class="win-team" href="#/team/${r.id}">${imgOr(
                  'teams',
                  F.teams[r.id],
                  'logo-team'
                )}<span>${esc(F.teams[r.id])}</span></a>
                <span class="win-bar"><span style="width:${
                  ((winMetric === 'losses' ? r.l : r.w) / max) * 100
                }%;background:${
                  winMetric === 'losses' ? 'var(--muted)' : 'var(--red)'
                }"></span></span>
                <span class="win-val">${r.w}</span>
                <span class="win-val">${r.l}</span>
                <span class="win-rate">${pct(r.rate)}</span>
              </div>`
            )
            .join('') || '<p class="chart-note">Tidak ada data pada filter ini.</p>'
        }
      </div>
      <p class="chart-note">${
        leader
          ? `${
              winMetric === 'losses' ? 'Paling banyak kalah' : 'Paling banyak menang'
            }: ${esc(F.teams[leader.id])} (${leader.w} menang, ${leader.l} kalah). Angka ini hanya dari 16 major VCT.`
          : ''
      }</p>
    `;
  }

  function initWinHero() {
    const y = $('#winYear');
    const t = $('#winTeam');
    const m = $('#winMetric');
    const reset = $('#winReset');
    if (!y || !t || !m || !reset) return;
    y.addEventListener('change', () => {
      winYear = y.value;
      updateWinHero();
    });
    t.addEventListener('change', () => {
      winTeam = t.value;
      updateWinHero();
    });
    m.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-win-metric]');
      if (!btn) return;
      winMetric = btn.dataset.winMetric;
      m.querySelectorAll('[data-win-metric]').forEach((b) =>
        b.setAttribute('aria-pressed', String(b === btn))
      );
      updateWinHero();
    });
    reset.addEventListener('click', () => {
      winYear = 'all';
      winTeam = 'all';
      winMetric = 'wins';
      y.value = 'all';
      t.value = 'all';
      m.querySelectorAll('[data-win-metric]').forEach((b) =>
        b.setAttribute('aria-pressed', String(b.dataset.winMetric === 'wins'))
      );
      updateWinHero();
    });
    updateWinHero();
  }

  function podiumCard(p) {
    const w = p.event;
    const third = (w.third || [])
      .map((id) => teamLink(id, 'podium-team'))
      .join('<span class="team-sep">·</span>');
    return `<article class="podium-card">
      <div class="podium-top">
        <span class="podium-year">${p.year}</span>
        <span class="podium-event with-logo">${eventBadge(w)}<span>${esc(w.name)}</span></span>
      </div>
      ${
        !p.isChampions
          ? `<p class="podium-note">Belum ada Champions tahun ini, jadi podium memakai ${esc(
              w.name
            )}.</p>`
          : ''
      }
      <div class="podium-row p1">
        <span class="podium-rank">1</span>${teamLink(w.winner, 'podium-team')}
        <span class="podium-score">${scoreText(w)}</span>
      </div>
      <div class="podium-row p2">
        <span class="podium-rank">2</span>${teamLink(w.runnerUp, 'podium-team')}<span></span>
      </div>
      <div class="podium-row p3">
        <span class="podium-rank">${w.thirdLabel || '3'}</span>
        <span class="podium-third">${third || '—'}</span><span></span>
      </div>
    </article>`;
  }

  function renderHome() {
    const ranking = teamRanking();

    $('#appView').innerHTML = `
      ${viewHead(
        'VCT · 2021–2026',
        'Juara VCT',
        `${MAJORS.length} major · ${CHAMPIONS.length} Champions · ${MASTERS.length} Masters · ${ranking.length} tim juara`
      )}

      ${winHeroHtml()}

      <h2 class="dash-title">Podium per tahun</h2>
      <div class="podium-grid">${PODIUMS.map(podiumCard).join('')}</div>
      <p class="chart-note">Podium diambil dari Champions tiap tahun. Khusus 2026, Champions belum
        digelar, jadi dipakai Masters terakhir.</p>

      <h2 class="dash-title">Champions</h2>
      <div class="champ-grid">${CHAMPIONS.map(champCard).join('')}</div>

      <h2 class="dash-title">Masters</h2>
      <div class="champ-grid">${MASTERS.map(champCard).join('')}</div>

      <div class="section-head">
        <h2 class="dash-title">Papan gelar</h2>
        <a class="section-link" href="#/teams">Semua tim →</a>
      </div>
      <div class="winner-table">${titleHead}${ranking
        .slice(0, 8)
        .map(titleRow)
        .join('')}</div>
      <p class="chart-note">Halaman ini fokus ke 16 major VCT. Data 235 turnamen tetap bisa dibuka di
        <a href="#/data">Arsip Data</a>.</p>
    `;

    initWinHero();
  }

  /* ------------------------------ VCT ------------------------------ */

  let vctYear = 'all';
  let vctQuery = '';

  function renderVct() {
    const all = WIN.filter(
      (w) => (w.tier === 'major' || w.tier === 'vct') && w.winner != null
    );
    const years = [...new Set(all.map((w) => w.year))].sort((a, b) => b - a);
    const list = all.filter((w) => vctYear === 'all' || String(w.year) === String(vctYear));
    const majors = list
      .filter((w) => w.tier === 'major')
      .sort((a, b) => (b.year || 0) - (a.year || 0) || b.name.localeCompare(a.name));
    const regional = list
      .filter((w) => w.tier === 'vct')
      .sort((a, b) => (b.year || 0) - (a.year || 0) || Number(b.finalMatch || 0) - Number(a.finalMatch || 0));

    $('#appView').innerHTML = `
      ${viewHead('VCT', 'Semua juara VCT', `${majors.length} major · ${regional.length} event regional/Challengers pada filter ini`)}
      <div class="filterbar view-filters">
        <span class="filter-label">Tahun</span>
        <div class="chip-group" id="vctYears" role="group" aria-label="Filter tahun VCT">
          <button class="chip" type="button" data-year="all" aria-pressed="${vctYear === 'all'}">Semua</button>
          ${years
            .map(
              (y) =>
                `<button class="chip" type="button" data-year="${y}" aria-pressed="${String(vctYear) === String(y)}">${y}</button>`
            )
            .join('')}
        </div>
        <div class="search" style="margin-left:auto">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <circle cx="11" cy="11" r="7"></circle><path d="M20 20l-4.3-4.3"></path>
          </svg>
          <label class="sr-only" for="vctSearch">Cari event atau tim</label>
          <input id="vctSearch" type="search" placeholder="Cari event / tim…" autocomplete="off" value="${esc(vctQuery)}">
        </div>
      </div>
      <h2 class="dash-title">Major</h2>
      <div class="champ-grid">${majors.map(champCard).join('') || '<p class="chart-note">Tidak ada data.</p>'}</div>
      <h2 class="dash-title">Regional &amp; Challengers</h2>
      <div class="winner-table" id="vctBody"></div>
      <p class="chart-note" id="vctCount"></p>
    `;

    const update = () => {
      const q = vctQuery.trim().toLowerCase();
      const rows = regional.filter(
        (w) =>
          !q ||
          w.name.toLowerCase().includes(q) ||
          (w.winner != null && F.teams[w.winner].toLowerCase().includes(q))
      );
      $('#vctBody').innerHTML = winnerRows(rows) || '<p class="chart-note">Tidak ada data cocok.</p>';
      $('#vctCount').textContent = `${rows.length} event`;
    };

    $('#vctYears').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-year]');
      if (!btn) return;
      vctYear = btn.dataset.year;
      renderVct();
    });
    $('#vctSearch').addEventListener('input', (e) => {
      vctQuery = e.target.value;
      update();
    });
    update();
  }

  /* ------------------------------ turnamen lain ------------------------------ */

  let otherQuery = '';
  let otherYear = 'all';

  function renderOthers() {
    const all = WIN.filter((w) => w.tier === 'other' && w.winner != null);
    const years = [...new Set(all.map((w) => w.year))].sort((a, b) => b - a);

    $('#appView').innerHTML = `
      ${viewHead('Turnamen lain', 'Juara turnamen lainnya', `${all.length} turnamen VCT Challengers, kualifikasi, dan pihak ketiga`)}
      <div class="filterbar view-filters">
        <span class="filter-label">Tahun</span>
        <div class="chip-group" id="otherYears" role="group" aria-label="Filter tahun">
          <button class="chip" type="button" data-year="all" aria-pressed="${otherYear === 'all'}">Semua</button>
          ${years
            .map(
              (y) =>
                `<button class="chip" type="button" data-year="${y}" aria-pressed="${String(otherYear) === String(y)}">${y}</button>`
            )
            .join('')}
        </div>
        <div class="search" style="margin-left:auto">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <circle cx="11" cy="11" r="7"></circle><path d="M20 20l-4.3-4.3"></path>
          </svg>
          <label class="sr-only" for="otherSearch">Cari turnamen atau tim</label>
          <input id="otherSearch" type="search" placeholder="Cari turnamen / tim…" autocomplete="off" value="${esc(otherQuery)}">
        </div>
      </div>
      <div class="winner-table" id="otherBody"></div>
      <p class="chart-note" id="otherCount"></p>
    `;

    const update = () => {
      const q = otherQuery.trim().toLowerCase();
      const rows = all
        .filter((w) => otherYear === 'all' || String(w.year) === String(otherYear))
        .filter(
          (w) =>
            !q ||
            w.name.toLowerCase().includes(q) ||
            (w.winner != null && F.teams[w.winner].toLowerCase().includes(q))
        )
        .sort(
          (a, b) =>
            (b.year || 0) - (a.year || 0) || Number(b.finalMatch || 0) - Number(a.finalMatch || 0)
        );
      $('#otherBody').innerHTML = winnerRows(rows) || '<p class="chart-note">Tidak ada data cocok.</p>';
      $('#otherCount').textContent = `${rows.length} turnamen`;
    };

    $('#otherYears').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-year]');
      if (!btn) return;
      otherYear = btn.dataset.year;
      $$('#otherYears [data-year]').forEach((b) =>
        b.setAttribute('aria-pressed', String(b === btn))
      );
      update();
    });
    $('#otherSearch').addEventListener('input', (e) => {
      otherQuery = e.target.value;
      update();
    });
    update();
  }

  /* ------------------------------ papan gelar & pemain juara ------------------------------ */

  function renderTeamsIndex() {
    const rows = teamRanking();
    $('#appView').innerHTML = `
      ${viewHead(
        'Tim',
        'Papan gelar major',
        `${rows.length} tim pernah menjuarai VCT major · ${MAJORS.length} gelar`
      )}
      <div class="winner-table">${titleHead}${rows.map(titleRow).join('')}</div>
      <p class="chart-note">Di sini hanya dihitung gelar major, yaitu Champions dan Masters.
        Gelar regional tetap ada di halaman tiap tim.</p>
    `;
  }

  function renderPlayersIndex() {
    const rows = playerRanking();
    $('#appView').innerHTML = `
      ${viewHead(
        'Pemain',
        'Pemain juara major',
        `${rows.length} pemain pernah menjuarai VCT major`
      )}
      <div class="winner-table">
        <div class="player-title-row player-title-head">
          <span></span><span>Pemain</span><span>Tim</span><span>Gelar</span><span>Tahun</span>
        </div>
        ${rows
          .map(
            (r) => `<a class="player-title-row" href="#/player/${r.p}">
              ${imgOr('players', P_NAMES[r.p], 'avatar-player')}
              <span class="player-title-name">${esc(P_NAMES[r.p])}</span>
              <span class="player-title-team">${r.teams
                .map(
                  (t) =>
                    `<span class="team-inline with-logo">${imgOr(
                      'teams',
                      F.teams[t],
                      'logo-team'
                    )}<span>${esc(F.teams[t])}</span></span>`
                )
                .join('<span class="team-sep">·</span>')}</span>
              <span class="title-count">${r.titles.length}</span>
              <span class="title-years">${r.titles.map((w) => w.year).join(' · ')}</span>
            </a>`
          )
          .join('')}
      </div>
      <p class="chart-note">Termasuk pemain pengganti yang sempat tampil untuk tim juara.</p>
    `;
  }

  /* ------------------------------ halaman tim ------------------------------ */

  function renderTeam(id) {
    if (!(id >= 0 && id < F.teams.length)) return renderNotFound();
    const st = A.teamStats.get(id);
    const tt = TEAM_TITLES.get(id) || { titles: [], finals: [] };
    const trophies = WIN.filter((w) => w.winner === id).sort(
      (a, b) =>
        (b.tier === 'major') - (a.tier === 'major') ||
        (b.year || 0) - (a.year || 0) ||
        Number(b.finalMatch || 0) - Number(a.finalMatch || 0)
    );
    const perf = T_PERF.get(id) || [];
    const maps = perf.reduce((s, r) => s + r.maps, 0);
    const wins = perf.reduce((s, r) => s + r.wins, 0);
    const losses = perf.reduce((s, r) => s + r.losses, 0);
    const ratingSum = perf.reduce((s, r) => s + r.rating, 0) / 100;
    const acsSum = perf.reduce((s, r) => s + r.acs, 0);
    const played = wins + losses;
    const roster = [...(TEAM_PLAYERS.get(id) || [])].sort((a, b) => P_MATCHES[b] - P_MATCHES[a]);
    const recent = [];
    for (let m = MATCH_N - 1; m >= 0 && recent.length < 12; m--) {
      if (A.matchTeamA[m] === id || A.matchTeamB[m] === id) recent.push(m);
    }

    $('#appView').innerHTML = `
      ${viewHead(
        'Tim',
        esc(F.teams[id]),
        `${esc(teamRegion(id))} · ${tt.titles.length} gelar major · ${trophies.length} trofi · ${
          st ? fmt(st.matches) : 0
        } laga`,
        imgOr('teams', F.teams[id], 'logo-hero')
      )}
      <a class="back-link" href="#/">← Kembali ke juara</a>
      <div class="dash">
        <article class="panel col-8">
          <div class="panel-body">
            <div class="panel-head"><h2 class="panel-title">Penghargaan</h2><span class="panel-note">${tt.titles.length} major · ${trophies.length} total</span></div>
            <div class="rd-stats">
              <div><b>${tt.titles.length}</b><span>Gelar major</span></div>
              <div><b>${tt.finals.length}</b><span>Final major</span></div>
              <div><b>${trophies.length}</b><span>Total gelar</span></div>
            </div>
            <div class="trophy-list">${
              trophies
                .map(
                  (w) => `<div class="trophy-row">
                    ${eventBadge(w)}
                    <span class="trophy-year">${w.year}</span>
                    <span class="trophy-name">${esc(w.name)}</span>
                    <span class="trophy-tier">${w.tier === 'major' ? 'Major' : w.tier === 'vct' ? 'VCT' : 'Lain'}</span>
                    <span class="trophy-score">${scoreText(w)}</span>
                  </div>`
                )
                .join('') || '<p class="chart-note">Belum ada trofi pada arsip ini.</p>'
            }</div>
            <p class="rd-method">Yang dihitung sebagai penghargaan hanya gelar turnamen. Dataset ini tidak punya data MVP atau penghargaan individu.</p>

            <div class="panel-head" style="margin-top:18px"><h2 class="panel-title">Performa</h2><span class="panel-note">seluruh turnamen</span></div>
            <div class="rd-stats">
              <div><b>${fmt(wins)}–${fmt(losses)}</b><span>Menang–kalah</span></div>
              <div><b>${pct(played ? wins / played : 0)}</b><span>Win rate</span></div>
              <div><b>${maps ? (ratingSum / maps).toFixed(2) : '—'}</b><span>Rating rata-rata</span></div>
              <div><b>${maps ? Math.round(acsSum / maps) : '—'}</b><span>ACS rata-rata</span></div>
              <div><b>${fmt(maps)}</b><span>Peta dimainkan</span></div>
              <div><b>${fmt(st ? st.tournaments.size : 0)}</b><span>Turnamen</span></div>
            </div>

            <div class="panel-head" style="margin-top:18px"><h2 class="panel-title">Laga terakhir</h2><span class="panel-note">klik lawan untuk detail</span></div>
            <div class="match-list">${recent.map((m) => matchRow(m, id)).join('') || '<p class="chart-note">Tidak ada laga.</p>'}</div>
          </div>
        </article>

        <article class="panel col-4">
          <div class="panel-body">
            <div class="panel-head"><h2 class="panel-title">Roster</h2><span class="panel-note">${roster.length} pemain</span></div>
            <div class="rel-list">${
              roster
                .map((p) => `<a class="rel-item" href="#/player/${p}"><span class="with-logo">${imgOr('players', P_NAMES[p], 'avatar-player')}<span>${esc(P_NAMES[p])}</span></span><small>${fmt(P_MATCHES[p])} laga</small></a>`)
                .join('') || '<p class="chart-note">Tidak ada pemain.</p>'
            }</div>
          </div>
        </article>
      </div>
    `;
  }

  /* ------------------------------ halaman pemain ------------------------------ */

  function renderPlayer(id) {
    if (!(id >= 0 && id < P_NAMES.length)) return renderNotFound();
    const recs = (P_PERF.get(id) || []).slice().sort(
      (a, b) => (TIX_YEAR.get(b.tour) || 0) - (TIX_YEAR.get(a.tour) || 0)
    );
    const matches = A.playerMatchList[id] || [];

    const maps = recs.reduce((s, r) => s + r.maps, 0);
    const kills = recs.reduce((s, r) => s + r.kills, 0);
    const deaths = recs.reduce((s, r) => s + r.deaths, 0);
    const wins = recs.reduce((s, r) => s + r.wins, 0);
    const losses = recs.reduce((s, r) => s + r.losses, 0);
    const rating = recs.reduce((s, r) => s + r.rating, 0) / 100;
    const acs = recs.reduce((s, r) => s + r.acs, 0);
    const played = wins + losses;

    const years = matches.map((m) => F.years[A.matchYear[m]]);
    const first = years.length ? Math.min(...years) : '—';
    const last = years.length ? Math.max(...years) : '—';

    const trophies = recs
      .map((r) => {
        const w = WIN_BY_NAME.get(F.tournaments[r.tour]);
        const team = PT_TEAM.get(id + '|' + r.tour);
        return w && w.winner != null && w.winner === team ? w : null;
      })
      .filter(Boolean);

    const recent = matches.slice(-12).reverse();
    const mainTeam = P_TEAM[id] === A.P_NONE ? -1 : P_TEAM[id];
    const pt = PLAYER_TITLES.get(id) || { titles: [], teams: new Set() };

    $('#appView').innerHTML = `
      ${viewHead(
        'Pemain',
        esc(P_NAMES[id]),
        `${mainTeam >= 0 ? esc(F.teams[mainTeam]) : 'Tanpa tim utama'} · ${pt.titles.length} gelar major · ${first}–${last} · ${fmt(matches.length)} laga`,
        imgOr('players', P_NAMES[id], 'avatar-hero')
      )}
      <a class="back-link" href="#/">← Kembali ke juara</a>
      <div class="dash">
        <article class="panel col-8">
          <div class="panel-body">
            <div class="panel-head"><h2 class="panel-title">Karier</h2><span class="panel-note">rating & ACS dari VLR</span></div>
            <div class="rd-stats">
              <div><b>${fmt(played)}</b><span>Laga</span></div>
              <div><b>${fmt(wins)}–${fmt(losses)}</b><span>Menang–kalah</span></div>
              <div><b>${pct(played ? wins / played : 0)}</b><span>Win rate</span></div>
              <div><b>${maps ? (rating / maps).toFixed(2) : '—'}</b><span>Rating</span></div>
              <div><b>${maps ? Math.round(acs / maps) : '—'}</b><span>ACS</span></div>
              <div><b>${deaths ? (kills / deaths).toFixed(2) : '—'}</b><span>K/D</span></div>
            </div>
            <p class="chart-note">${fmt(maps)} peta · ${fmt(kills)} kill · ${fmt(deaths)} death</p>

            <div class="panel-head" style="margin-top:18px"><h2 class="panel-title">Performa per turnamen</h2><span class="panel-note">${recs.length} turnamen</span></div>
            <div class="perf-table">
              <div class="perf-row perf-head">
                <span>Turnamen</span><span>Tahun</span><span>Tim</span><span>Peta</span><span>Rating</span><span>ACS</span><span>W–L</span>
              </div>
              ${recs
                .map((r) => {
                  const w = WIN_BY_NAME.get(F.tournaments[r.tour]);
                  const team = PT_TEAM.get(id + '|' + r.tour);
                  const rr = ratingOf(r);
                  return `<div class="perf-row">
                    <span class="perf-event">${esc(F.tournaments[r.tour])}</span>
                    <span class="perf-year">${w ? w.year : TIX_YEAR.get(r.tour) || ''}</span>
                    <span class="perf-team">${teamLink(team, '')}</span>
                    <span class="perf-val">${r.maps} peta</span>
                    <span class="perf-val">${rr ? rr.toFixed(2) : '—'}</span>
                    <span class="perf-val">${r.maps ? Math.round(acsOf(r)) : '—'}</span>
                    <span class="perf-val">${r.wins}–${r.losses}</span>
                  </div>`;
                })
                .join('') || '<p class="chart-note">Tidak ada data performa.</p>'}
            </div>
          </div>
        </article>

        <article class="panel col-4">
          <div class="panel-body">
            <div class="panel-head"><h2 class="panel-title">Penghargaan</h2><span class="panel-note">${pt.titles.length} major · ${trophies.length} total</span></div>
            <div class="trophy-list">${
              trophies
                .sort((a, b) => (b.tier === 'major') - (a.tier === 'major') || (b.year || 0) - (a.year || 0))
                .map(
                  (w) => `<div class="trophy-row">
                    ${eventBadge(w)}
                    <span class="trophy-year">${w.year}</span>
                    <span class="trophy-name">${esc(w.name)}</span>
                    <span class="trophy-tier">${w.tier === 'major' ? 'Major' : w.tier === 'vct' ? 'VCT' : 'Lain'}</span>
                  </div>`
                )
                .join('') || '<p class="chart-note">Belum ada trofi.</p>'
            }</div>
            <p class="rd-method">Gelar major dihitung dari roster tim yang menang. Dataset ini tidak punya data MVP atau penghargaan individu.</p>

            <div class="panel-head" style="margin-top:18px"><h2 class="panel-title">Laga terakhir</h2></div>
            <div class="match-list">${
              recent
                .map((m) => {
                  const team = playerTeamInMatch(id, m);
                  return matchRow(m, team);
                })
                .join('') || '<p class="chart-note">Tidak ada laga.</p>'
            }</div>
          </div>
        </article>
      </div>
    `;
  }

  function renderNotFound() {
    $('#appView').innerHTML = `${viewHead('404', 'Tidak ditemukan', 'Entitas yang diminta tidak ada di dataset.')}
      <a class="back-link" href="#/">← Kembali ke juara</a>`;
  }

  /* ------------------------------ router ------------------------------ */

  function setActive(route) {
    $$('.tabs a').forEach((a) => a.classList.toggle('is-active', a.getAttribute('href') === '#' + route));
  }

  function router() {
    const raw = (location.hash || '#/').slice(1);
    if (raw === 'main') {
      const main = $('#main');
      if (main) { main.setAttribute('tabindex', '-1'); main.focus(); }
      return;
    }
    const path = raw || '/';
    const view = $('#appView');
    const dash = $('#dashboard');
    if (!view || !dash) return;

    if (path === '/data') {
      view.hidden = true;
      view.innerHTML = '';
      dash.hidden = false;
      setActive('/data');
      return;
    }

    view.hidden = false;
    dash.hidden = true;

    if (path.startsWith('/team/')) {
      renderTeam(Number(path.split('/')[2]));
      setActive('');
    } else if (path.startsWith('/player/')) {
      renderPlayer(Number(path.split('/')[2]));
      setActive('');
    } else if (path === '/teams') {
      renderTeamsIndex();
      setActive('/teams');
    } else if (path === '/players') {
      renderPlayersIndex();
      setActive('/players');
    } else if (path === '/vct' || path === '/lainnya') {
      renderHome();
      setActive('/');
    } else {
      renderHome();
      setActive('/');
    }

    window.scrollTo(0, 0);
  }

  window.addEventListener('hashchange', router);
  router();
})();
