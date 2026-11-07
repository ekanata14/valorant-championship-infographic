/* ============================================================
   charts.js — renderer SVG tanpa dependensi.
   Setiap elemen interaktif membawa atribut data-tip (tooltip),
   dan atribut data-* untuk event delegation di app.js.
   ============================================================ */

const Charts = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  const fmt = (n) => new Intl.NumberFormat('id-ID').format(n);
  const pct = (n, d = 1) =>
    new Intl.NumberFormat('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n * 100) + '%';

  function el(tag, attrs = {}, children = []) {
    const node = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      node.setAttribute(k, v);
    }
    for (const c of [].concat(children)) {
      if (c === null || c === undefined) continue;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return node;
  }

  function makeSvg(w, h, label) {
    const svg = el('svg', {
      viewBox: `0 0 ${w} ${h}`,
      role: 'img',
      'aria-label': label,
      preserveAspectRatio: 'xMidYMid meet',
    });
    svg.appendChild(el('title', {}, [label]));
    return svg;
  }

  /* ---------------- vertical bars per year ---------------- */

  function yearBars({ years, metric = 'mapGames', highlight = 'all', onTip }) {
    const W = 760, H = 300;
    const pad = { t: 16, r: 8, b: 34, l: 58 };
    const svg = makeSvg(W, H, 'Jumlah map dimainkan dan pertandingan per tahun');
    const max = Math.max(1, ...years.map((y) => y[metric]));
    let niceMax;
    if (max <= 20) {
      niceMax = Math.ceil(max / 4) * 4;
    } else {
      const rough = max / 4;
      const mag = Math.pow(10, Math.floor(Math.log10(rough)));
      const s = rough / mag;
      const tickStep = ([1, 2, 3, 4, 5, 10].find((v) => s <= v) || 10) * mag;
      niceMax = tickStep * 4;
    }
    const innerW = W - pad.l - pad.r;
    const innerH = H - pad.t - pad.b;
    const step = innerW / years.length;
    const barW = Math.min(58, step * 0.56);

    const ticks = 4;
    for (let i = 0; i <= ticks; i++) {
      const v = (niceMax / ticks) * i;
      const y = pad.t + innerH - (v / niceMax) * innerH;
      svg.appendChild(el('line', { x1: pad.l, y1: y, x2: W - pad.r, y2: y, class: 'grid-line' }));
      svg.appendChild(el('text', { x: pad.l - 10, y: y + 4, 'text-anchor': 'end', class: 'lbl-dim' }, [fmt(v)]));
    }
    svg.appendChild(el('line', { x1: pad.l, y1: pad.t + innerH, x2: W - pad.r, y2: pad.t + innerH, class: 'axis-line' }));

    years.forEach((row, i) => {
      const h = (row[metric] / niceMax) * innerH;
      const x = pad.l + step * i + (step - barW) / 2;
      const y = pad.t + innerH - h;
      const dim = highlight !== 'all' && Number(highlight) !== row.year;
      const g = el('g', {
        class: `bar-group${dim ? ' is-dim' : ''}`,
        tabindex: '0',
        role: 'img',
        'aria-label': `${row.year}: ${fmt(row[metric])} ${metric === 'mapGames' ? 'map dimainkan' : 'pertandingan'}`,
        'data-tip': `${row.year}\n${fmt(row.mapGames)} map dimainkan\n${fmt(row.matches)} pertandingan\n${row.tournaments} turnamen`,
        'data-year-cell': row.year,
      });
      g.appendChild(el('rect', { x, y, width: barW, height: Math.max(h, 1), class: 'bar-fill' }));
      g.appendChild(el('rect', { x: pad.l + step * i, y: pad.t, width: step, height: innerH, class: 'bar-hit' }));
      svg.appendChild(g);

      svg.appendChild(
        el(
          'text',
          { x: x + barW / 2, y: pad.t + innerH + 20, 'text-anchor': 'middle', class: dim ? 'lbl-dim' : 'lbl-strong' },
          [String(row.year)]
        )
      );
      if (!dim && h > 22) {
        svg.appendChild(
          el(
            'text',
            { x: x + barW / 2, y: y - 8, 'text-anchor': 'middle', class: 'lbl-strong' },
            [fmt(row[metric])]
          )
        );
      }
    });

    return svg;
  }

  /* ---------------- heatmap map x year ---------------- */

  function heatmap({ maps, years, focus = null, yearFilter = 'all', yearTotals = {} }) {
    const labelW = 116;
    const cellH = 34;
    const colW = 96;
    const W = labelW + colW * years.length + 8;
    const H = 30 + cellH * maps.length + 6;
    const svg = makeSvg(
      W,
      H,
      'Peta VALORANT dan jumlah map dimainkan per tahun'
    );

    const max = Math.max(1, ...maps.flatMap((m) => years.map((y) => m.byYear[String(y)] || 0)));

    years.forEach((year, ci) => {
      const isDimCol = yearFilter !== 'all' && String(yearFilter) !== String(year);
      svg.appendChild(
        el(
          'text',
          {
            x: labelW + colW * ci + colW / 2,
            y: 18,
            'text-anchor': 'middle',
            class: isDimCol ? 'lbl-dim' : 'lbl-strong',
          },
          [String(year)]
        )
      );
    });

    maps.forEach((m, ri) => {
      const y = 30 + ri * cellH;
      const isFocus = focus === m.map;
      const rowDim = focus && !isFocus;
      svg.appendChild(
        el(
          'text',
          {
            x: labelW - 12,
            y: y + cellH / 2 + 4,
            'text-anchor': 'end',
            class: isFocus ? 'lbl-strong' : rowDim ? 'lbl-dim' : '',
          },
          [m.map]
        )
      );

      years.forEach((year, ci) => {
        const value = m.byYear[String(year)] || 0;
        const x = labelW + colW * ci;
        const dim = rowDim || (yearFilter !== 'all' && String(yearFilter) !== String(year));
        const intensity = value === 0 ? 0 : 0.1 + 0.9 * Math.sqrt(value / max);
        const g = el('g', {
          class: 'cell',
          'data-tip': `${m.map} · ${year}\n${fmt(value)} map dimainkan\n${pct(yearTotals[year] ? value / yearTotals[year] : 0)} dari seluruh map tahun ${year}`,
          'data-map-year': `${m.map}|${year}`,
          tabindex: '0',
          role: 'img',
          'aria-label': `${m.map} ${year}: ${fmt(value)} map dimainkan`,
        });
        g.appendChild(
          el('rect', {
            x: x + 3,
            y: y + 3,
            width: colW - 6,
            height: cellH - 6,
            fill: value ? 'var(--heat)' : 'var(--panel-2)',
            'fill-opacity': value ? intensity : 1,
            opacity: dim ? 0.18 : 1,
          })
        );
        if (dim) g.setAttribute('opacity', '0.25');
        svg.appendChild(g);
        if (value) {
          svg.appendChild(
            el(
              'text',
              {
                x: x + colW / 2,
                y: y + cellH / 2 + 4,
                'text-anchor': 'middle',
                'pointer-events': 'none',
                class: 'cell-v',
                opacity: dim ? 0.3 : 1,
              },
              [fmt(value)]
            )
          );
        }
      });
    });

    return svg;
  }

  /* ---------------- sparkline ---------------- */

  function sparkline({ values, highlight = false, markIndex = null }) {
    const W = 130, H = 26, pad = 2;
    const svg = makeSvg(W, H, 'tren jumlah map dimainkan per tahun');
    const max = Math.max(...values, 1);
    const step = (W - pad * 2) / Math.max(values.length - 1, 1);
    const pts = values.map((v, i) => {
      const x = pad + i * step;
      const y = H - pad - (v / max) * (H - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    if (highlight) {
      const area = `M${pad},${H - pad} L${pts.join(' L')} L${W - pad},${H - pad} Z`;
      svg.appendChild(el('path', { d: area, class: 'spark-area' }));
    }
    svg.appendChild(el('polyline', { points: pts.join(' '), class: 'spark', opacity: highlight ? 1 : 0.55 }));
    values.forEach((v, i) => {
      if (v > 0) {
        const [x, y] = pts[i].split(',');
        svg.appendChild(el('circle', { cx: x, cy: y, r: 1.6, fill: 'var(--red)', opacity: highlight ? 1 : 0.6 }));
      }
    });
    if (markIndex !== null && pts[markIndex]) {
      const [x, y] = pts[markIndex].split(',');
      svg.appendChild(
        el('circle', { cx: x, cy: y, r: 2.8, fill: 'var(--panel)', stroke: 'var(--red)', 'stroke-width': 1.6 })
      );
    }
    return svg;
  }

  /* ---------------- horizontal bars ---------------- */

  function barRows({ items, max, valueFmt = fmt, labelW = 148, barH = 18, rowH = 30, width = 560 }) {
    const W = width;
    const H = items.length * rowH + 4;
    const svg = makeSvg(W, H, 'perbandingan kategori');
    const trackW = W - labelW - 74;
    const denom = Math.max(1, max);

    items.forEach((item, i) => {
      const y = i * rowH;
      const w = Math.max((item.value / denom) * trackW, 1.5);
      const g = el('g', {
        class: 'bar-group',
        tabindex: '0',
        role: 'img',
        'aria-label': `${item.label}: ${valueFmt(item.value)}`,
        'data-tip': item.tip || `${item.label}\n${valueFmt(item.value)}`,
      });
      if (item.attrs) {
        for (const [k, v] of Object.entries(item.attrs)) g.setAttribute(k, v);
      }
      g.appendChild(
        el('text', { x: labelW - 10, y: y + rowH / 2 + 4, 'text-anchor': 'end', class: 'lbl-strong' }, [item.label])
      );
      g.appendChild(el('rect', { x: labelW, y: y + (rowH - barH) / 2, width: trackW, height: barH, fill: 'var(--panel-2)' }));
      g.appendChild(
        el('rect', {
          x: labelW,
          y: y + (rowH - barH) / 2,
          width: w,
          height: barH,
          class: item.className || 'bar-fill',
        })
      );
      g.appendChild(
        el('text', { x: W - 4, y: y + rowH / 2 + 4, 'text-anchor': 'end', class: 'lbl-dim' }, [valueFmt(item.value)])
      );
      svg.appendChild(g);
    });

    return svg;
  }

  return { yearBars, heatmap, sparkline, barRows, fmt, pct };
})();
