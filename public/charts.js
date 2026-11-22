// 작은 흑백 SVG 차트들. 라이브러리 없음. 가짜 데이터 없음: 값이 없으면 점선이나 빈칸으로 둔다.
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const INK = '#111111';
  const GREY = '#c9c9c9';
  const LINE = '#e6e6e6';

  function s(tag, attrs = {}, ...kids) {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) el.setAttribute(k, String(v));
    for (const k of kids) if (k) el.appendChild(typeof k === 'string' ? document.createTextNode(k) : k);
    return el;
  }

  // 30일 매출 선. 보고 없는 날은 건너뛰고, 하나도 없으면 점선 바닥만.
  function spark(series) {
    const W = 240;
    const H = 34;
    const base = H - 3;
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'spark', role: 'img', 'aria-label': '최근 30일 매출' });
    const pts = series.map((d, i) => ({ i, v: d.amount })).filter((p) => p.v !== null);
    if (!pts.length) {
      svg.appendChild(s('line', { x1: 0, x2: W, y1: base, y2: base, stroke: GREY, 'stroke-width': 1, 'stroke-dasharray': '3 4' }));
      return svg;
    }
    svg.appendChild(s('line', { x1: 0, x2: W, y1: base + 0.5, y2: base + 0.5, stroke: LINE, 'stroke-width': 1 }));
    const max = Math.max(...pts.map((p) => p.v), 1);
    const min = Math.min(0, ...pts.map((p) => p.v));
    const x = (i) => (i / (series.length - 1)) * (W - 4) + 2;
    const y = (v) => base - ((v - min) / (max - min || 1)) * (H - 8);
    if (pts.length > 1) {
      const d = pts.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
      svg.appendChild(s('path', { d, fill: 'none', stroke: INK, 'stroke-width': 1.25, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    }
    const last = pts[pts.length - 1];
    svg.appendChild(s('circle', { cx: x(last.i), cy: y(last.v), r: 2.6, fill: INK }));
    return svg;
  }

  // 급여명세서 막대: 매출 = AI 월급(회색) + 순수익(검정)
  function paybar(revenue, salary) {
    const svg = s('svg', { viewBox: '0 0 100 10', preserveAspectRatio: 'none', role: 'img', 'aria-label': '매출, AI 월급, 순수익' });
    if (revenue === null) {
      svg.appendChild(s('rect', { x: 0.2, y: 0.5, width: 99.6, height: 9, fill: 'none', stroke: GREY, 'stroke-width': 1, 'stroke-dasharray': '3 3', 'vector-effect': 'non-scaling-stroke', rx: 1 }));
      return svg;
    }
    const total = Math.max(revenue, salary, 1);
    const g = (Math.min(salary, total) / total) * 100;
    const b = (Math.max(revenue - salary, 0) / total) * 100;
    svg.appendChild(s('rect', { x: 0, y: 0, width: 100, height: 10, fill: '#f3f3f3' }));
    if (g > 0) svg.appendChild(s('rect', { x: 0, y: 0, width: g, height: 10, fill: GREY }));
    if (b > 0) svg.appendChild(s('rect', { x: g, y: 0, width: b, height: 10, fill: INK }));
    return svg;
  }

  // 근무 타임라인 한 줄 (00시~24시). blocks: [{start, end}] 하루 안의 분.
  function timelineRow(blocks, nowMin) {
    const svg = s('svg', { viewBox: '0 0 1440 14', preserveAspectRatio: 'none', role: 'img' });
    svg.appendChild(s('line', { x1: 0, x2: 1440, y1: 7, y2: 7, stroke: LINE, 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' }));
    for (const h of [6, 12, 18]) svg.appendChild(s('line', { x1: h * 60, x2: h * 60, y1: 4, y2: 10, stroke: LINE, 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' }));
    for (const b of blocks) {
      const w = Math.max(b.end - b.start, 6);
      svg.appendChild(s('rect', { x: b.start, y: 2, width: w, height: 10, fill: INK, rx: 1 }, s('title', {}, b.label || '')));
    }
    if (nowMin !== null) svg.appendChild(s('line', { x1: nowMin, x2: nowMin, y1: -4, y2: 18, stroke: INK, 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' }));
    return svg;
  }

  // 인수인계 흐름: 점과 화살표 (Codex → Claude → 대표)
  function flow(names, openLast) {
    const n = names.length;
    const gap = n > 1 ? Math.min(150, 380 / (n - 1)) : 0;
    const W = 40 + gap * (n - 1) + 40;
    const svg = s('svg', { viewBox: `0 0 ${W} 58`, class: 'flow', role: 'img', 'aria-label': names.join(' 에서 ') });
    svg.style.maxWidth = `${W}px`;
    const defs = s('defs');
    const mk = s('marker', { id: `ah${Math.random().toString(36).slice(2, 7)}`, viewBox: '0 0 8 8', refX: 7, refY: 4, markerWidth: 7, markerHeight: 7, orient: 'auto' }, s('path', { d: 'M0,0 L8,4 L0,8 z', fill: INK }));
    defs.appendChild(mk);
    svg.appendChild(defs);
    names.forEach((name, i) => {
      const cx = 40 + i * gap;
      if (i < n - 1) {
        const last = i === n - 2 && openLast;
        svg.appendChild(s('line', { x1: cx + 9, x2: cx + gap - 10, y1: 16, y2: 16, stroke: last ? GREY : INK, 'stroke-width': 1, 'stroke-dasharray': last ? '3 3' : null, 'marker-end': last ? null : `url(#${mk.id})` }));
      }
      const pending = i === n - 1 && openLast;
      svg.appendChild(s('circle', { cx, cy: 16, r: 5, fill: pending ? '#fff' : INK, stroke: pending ? GREY : INK, 'stroke-width': 1, 'stroke-dasharray': pending ? '2 2' : null }));
      const label = name.length > 9 ? `${name.slice(0, 8)}…` : name;
      svg.appendChild(s('text', { x: cx, y: 44, 'text-anchor': 'middle' }, label));
    });
    return svg;
  }

  // 얇은 고리 게이지. frac 이 null 이면 점선 고리. opt: { label, sub, capFrac }
  function ring(frac, opt = {}) {
    const r = 23;
    const c = 2 * Math.PI * r;
    const svg = s('svg', { viewBox: '0 0 56 56', role: 'img', 'aria-label': opt.label || '' });
    svg.appendChild(s('circle', { cx: 28, cy: 28, r, fill: 'none', stroke: frac === null ? GREY : LINE, 'stroke-width': frac === null ? 1 : 3, 'stroke-dasharray': frac === null ? '2 3' : null }));
    if (frac !== null) {
      svg.appendChild(s('circle', { cx: 28, cy: 28, r, fill: 'none', stroke: INK, 'stroke-width': 3, 'stroke-dasharray': `${(c * Math.min(Math.max(frac, 0), 1)).toFixed(2)} ${c.toFixed(2)}`, transform: 'rotate(-90 28 28)', 'stroke-linecap': 'butt' }));
      svg.appendChild(s('text', { x: 28, y: 32, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 600, fill: INK, 'font-family': 'Pretendard, -apple-system, sans-serif' }, `${Math.round(frac * 100)}%`));
    } else {
      svg.appendChild(s('text', { x: 28, y: 32, 'text-anchor': 'middle', 'font-size': 11, fill: '#999', 'font-family': 'Pretendard, -apple-system, sans-serif' }, '—'));
    }
    if (typeof opt.capFrac === 'number') {
      const ang = (opt.capFrac * 360 - 90) * (Math.PI / 180);
      const x1 = 28 + Math.cos(ang) * (r - 3.5);
      const y1 = 28 + Math.sin(ang) * (r - 3.5);
      const x2 = 28 + Math.cos(ang) * (r + 3.5);
      const y2 = 28 + Math.sin(ang) * (r + 3.5);
      svg.appendChild(s('line', { x1: x1.toFixed(1), y1: y1.toFixed(1), x2: x2.toFixed(1), y2: y2.toFixed(1), stroke: INK, 'stroke-width': 1.5 }));
    }
    return svg;
  }

  // 실시간 RAM 사용률 추이 + 85% 상한선 그래프 (실제 측정치만 그림, 가짜 데이터 없음)
  function ramChart(history, maxRamPct = 85) {
    const W = 420;
    const H = 128;
    const padL = 32;
    const padR = 14;
    const padT = 16;
    const padB = 22;
    const cw = W - padL - padR;
    const ch = H - padT - padB;
    const yOf = (pct) => padT + ch - (Math.min(100, Math.max(0, pct)) / 100) * ch;
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'ram-svg', role: 'img', 'aria-label': '실시간 RAM 사용률 추이' });

    for (const tick of [0, 50, 100]) {
      const y = yOf(tick);
      svg.appendChild(s('line', { x1: padL, x2: W - padR, y1: y, y2: y, stroke: tick === 0 ? '#d8d8d8' : '#efefef', 'stroke-width': 1 }));
      svg.appendChild(s('text', { x: padL - 6, y: y + 3, 'text-anchor': 'end', 'font-size': 9.5, fill: '#999', 'font-family': 'Pretendard, -apple-system, sans-serif' }, `${tick}%`));
    }

    // 85% 상한선
    const capY = yOf(maxRamPct);
    svg.appendChild(s('line', { x1: padL, x2: W - padR, y1: capY, y2: capY, stroke: INK, 'stroke-width': 1, 'stroke-dasharray': '4 3', opacity: 0.75 }));
    svg.appendChild(s('text', { x: W - padR, y: capY - 4, 'text-anchor': 'end', 'font-size': 9.5, 'font-weight': 600, fill: INK, 'font-family': 'Pretendard, -apple-system, sans-serif' }, `상한 ${maxRamPct}%`));

    const pts = Array.isArray(history) ? history.filter((p) => typeof p.ramPct === 'number') : [];
    if (!pts.length) {
      svg.appendChild(s('text', { x: padL + cw / 2, y: padT + ch / 2, 'text-anchor': 'middle', 'font-size': 11, fill: '#999' }, '측정 중…'));
      return svg;
    }

    if (pts.length === 1) {
      const y = yOf(pts[0].ramPct);
      svg.appendChild(s('rect', { x: padL, y, width: cw, height: Math.max(0, yOf(0) - y), fill: '#f3f3f3' }));
      svg.appendChild(s('line', { x1: padL, x2: W - padR, y1: y, y2: y, stroke: INK, 'stroke-width': 1.75 }));
      svg.appendChild(s('circle', { cx: W - padR, cy: y, r: 3.5, fill: INK }));
      svg.appendChild(s('text', { x: padL + 4, y: H - 5, 'font-size': 9.5, fill: '#999' }, '방금 측정 시작 · 10초마다 자동 기록'));
      return svg;
    }

    const coords = pts.map((p, i) => ({
      x: padL + (i / (pts.length - 1)) * cw,
      y: yOf(p.ramPct),
      pct: p.ramPct,
      at: p.at,
    }));
    const linePath = coords.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const areaPath = `${linePath} L${coords[coords.length - 1].x.toFixed(1)},${yOf(0).toFixed(1)} L${coords[0].x.toFixed(1)},${yOf(0).toFixed(1)} Z`;
    svg.appendChild(s('path', { d: areaPath, fill: '#f2f2f2' }));
    svg.appendChild(s('path', { d: linePath, fill: 'none', stroke: INK, 'stroke-width': 1.75, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    const last = coords[coords.length - 1];
    svg.appendChild(s('circle', { cx: last.x.toFixed(1), cy: last.y.toFixed(1), r: 3.5, fill: INK }));
    svg.appendChild(s('text', { x: padL, y: H - 5, 'font-size': 9.5, fill: '#999' }, `최근 ${pts.length}회 측정`));
    svg.appendChild(s('text', { x: W - padR, y: H - 5, 'text-anchor': 'end', 'font-size': 9.5, 'font-weight': 600, fill: INK }, `현재 ${last.pct}%`));
    return svg;
  }

  // 대표 7일 컨디션 추이 그래프 (RAM 추이 그래프와 동일 비율, 실제 기록만 그림)
  function healthChart(trend7) {
    const W = 420;
    const H = 128;
    const padL = 32;
    const padR = 14;
    const padT = 16;
    const padB = 22;
    const cw = W - padL - padR;
    const ch = H - padT - padB;
    const yOf = (score) => padT + ch - (Math.min(100, Math.max(0, score)) / 100) * ch;
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'ram-svg', role: 'img', 'aria-label': '최근 7일 대표 컨디션 추이' });

    for (const tick of [0, 50, 100]) {
      const y = yOf(tick);
      svg.appendChild(s('line', { x1: padL, x2: W - padR, y1: y, y2: y, stroke: tick === 0 ? '#d8d8d8' : '#efefef', 'stroke-width': 1 }));
      svg.appendChild(s('text', { x: padL - 6, y: y + 3, 'text-anchor': 'end', 'font-size': 9.5, fill: '#999', 'font-family': 'Pretendard, -apple-system, sans-serif' }, `${tick}`));
    }

    // 최적 목표선 (80점)
    const targetY = yOf(80);
    svg.appendChild(s('line', { x1: padL, x2: W - padR, y1: targetY, y2: targetY, stroke: INK, 'stroke-width': 1, 'stroke-dasharray': '4 3', opacity: 0.45 }));
    svg.appendChild(s('text', { x: padL + 4, y: targetY - 4, 'text-anchor': 'start', 'font-size': 9.5, fill: '#777', 'font-family': 'Pretendard, -apple-system, sans-serif' }, '최적 80+'));

    const days = Array.isArray(trend7) && trend7.length ? trend7 : [];
    const xOf = (i) => padL + (days.length > 1 ? (i / (days.length - 1)) * cw : cw / 2);

    // 하단 요일 라벨
    days.forEach((d, i) => {
      svg.appendChild(s('text', {
        x: xOf(i).toFixed(1), y: H - 5, 'text-anchor': 'middle', 'font-size': 9.5,
        'font-weight': i === days.length - 1 ? 600 : 400,
        fill: i === days.length - 1 ? INK : '#999',
        'font-family': 'Pretendard, -apple-system, sans-serif',
      }, d.label || ''));
    });

    const scored = days.map((d, i) => (typeof d.score === 'number' ? { ...d, i, x: xOf(i), y: yOf(d.score) } : null)).filter(Boolean);
    if (!scored.length) {
      svg.appendChild(s('text', { x: padL + cw / 2, y: padT + ch / 2 + 2, 'text-anchor': 'middle', 'font-size': 11, fill: '#999' }, '5초 기록 또는 아이폰·안드로이드 연동 시 7일 추이가 그려집니다'));
      return svg;
    }

    if (scored.length >= 2) {
      const linePath = scored.map((p, k) => `${k ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
      const areaPath = `${linePath} L${scored[scored.length - 1].x.toFixed(1)},${yOf(0).toFixed(1)} L${scored[0].x.toFixed(1)},${yOf(0).toFixed(1)} Z`;
      svg.appendChild(s('path', { d: areaPath, fill: '#f2f2f2' }));
      svg.appendChild(s('path', { d: linePath, fill: 'none', stroke: INK, 'stroke-width': 1.75, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    } else {
      const p = scored[0];
      svg.appendChild(s('line', { x1: p.x.toFixed(1), x2: p.x.toFixed(1), y1: yOf(0).toFixed(1), y2: p.y.toFixed(1), stroke: '#d8d8d8', 'stroke-width': 2 }));
    }

    for (const p of scored) {
      const isLast = p.i === days.length - 1;
      const tip = [
        `${p.date} · 컨디션 ${p.score}점`,
        p.steps != null ? `걸음 ${p.steps.toLocaleString('ko-KR')}보` : '',
        p.sleepHours != null ? `수면 ${p.sleepHours}시간` : '',
        p.heartRate != null ? `심박 ${p.heartRate}bpm` : '',
        p.exerciseMin != null ? `운동 ${p.exerciseMin}분` : '',
      ].filter(Boolean).join(' · ');
      svg.appendChild(s('circle', {
        cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: isLast ? 4 : 3,
        fill: isLast ? INK : '#fff', stroke: INK, 'stroke-width': 1.5,
      }, s('title', {}, tip)));
    }
    return svg;
  }

  // AI 직원별 오늘 업무 분포 막대 그래프 (완료 = 검정, 대기/진행 = 회색)
  function workloadBars(items) {
    const rowH = 30;
    const W = 420;
    const H = Math.max(48, items.length * rowH + 8);
    const labelW = 94;
    const countW = 54;
    const barW = W - labelW - countW - 12;
    const maxTotal = Math.max(1, ...items.map((x) => x.total));
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'wbar-svg', role: 'img', 'aria-label': 'AI 직원별 오늘 업무 분포' });

    items.forEach((it, idx) => {
      const y = idx * rowH + 6;
      const nm = it.name.length > 9 ? `${it.name.slice(0, 8)}…` : it.name;
      svg.appendChild(s('text', { x: 0, y: y + 14, 'font-size': 12, 'font-weight': it.working ? 600 : 400, fill: it.cooling ? '#999' : INK, 'font-family': 'Pretendard, -apple-system, sans-serif' }, nm));
      svg.appendChild(s('rect', { x: labelW, y: y + 5, width: barW, height: 10, rx: 3, fill: '#f3f3f3' }));
      if (it.total > 0) {
        const doneW = (it.done / maxTotal) * barW;
        const openW = ((it.total - it.done) / maxTotal) * barW;
        if (doneW > 0) svg.appendChild(s('rect', { x: labelW, y: y + 5, width: Math.max(4, doneW), height: 10, rx: 3, fill: INK }));
        if (openW > 0) svg.appendChild(s('rect', { x: labelW + doneW + (doneW > 0 ? 1.5 : 0), y: y + 5, width: Math.max(4, openW - (doneW > 0 ? 1.5 : 0)), height: 10, rx: 3, fill: '#9a9a9a' }));
      }
      const stat = it.cooling ? '휴식' : it.total ? `${it.done}/${it.total}` : '대기';
      svg.appendChild(s('text', { x: W, y: y + 14, 'text-anchor': 'end', 'font-size': 11, fill: it.total ? INK : '#aaa', 'font-family': 'ui-monospace, Menlo, monospace' }, stat));
    });
    return svg;
  }

  // AI 회사 라이브 구조도 (대표·루틴 → AI 직원 + 대체 순위 → AI 사무실 컴퓨터 RAM + 도구)
  function companyGraph(model, { onSelect } = {}) {
    const W = 920;
    const col1X = 20; const col1W = 216;
    const col2X = 336; const col2W = 228;
    const col3X = 656; const col3W = 236;
    const topY = 42;
    const cardH = 54;
    const gapY = 12;

    const leftNodes = model.left || [];
    const empNodes = model.employees || [];
    const rightNodes = model.right || [];
    const maxRows = Math.max(leftNodes.length, empNodes.length, rightNodes.length, 3);
    const H = Math.max(300, topY + maxRows * (cardH + gapY) + 34);

    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'topo-svg', role: 'img', 'aria-label': 'AI 회사 라이브 구조도' });

    // 화살표 마커 (실선 검정, 점선 회색)
    const defs = s('defs');
    const mkDark = s('marker', { id: 'arr-dark', viewBox: '0 0 8 8', refX: 6.5, refY: 4, markerWidth: 6, markerHeight: 6, orient: 'auto' }, s('path', { d: 'M0,1 L7,4 L0,7 z', fill: INK }));
    const mkMuted = s('marker', { id: 'arr-muted', viewBox: '0 0 8 8', refX: 6.5, refY: 4, markerWidth: 6, markerHeight: 6, orient: 'auto' }, s('path', { d: 'M0,1 L7,4 L0,7 z', fill: '#a8a8a8' }));
    defs.appendChild(mkDark);
    defs.appendChild(mkMuted);
    svg.appendChild(defs);

    // 스위스 스타일 세로 가이드 & 열 제목
    const colMeta = [
      [col1X, col1W, 'CONTROL · 대표 & 자동 루틴'],
      [col2X, col2W, 'WORKFORCE · AI 직원'],
      [col3X, col3W, 'AI OFFICE · 컴퓨터 & 리소스'],
    ];
    for (const [cx, cw, label] of colMeta) {
      svg.appendChild(s('text', { x: cx, y: 20, 'font-size': 10.5, 'font-weight': 600, fill: '#8a8a8a', 'letter-spacing': '0.06em', 'font-family': 'Pretendard, -apple-system, sans-serif' }, label));
      svg.appendChild(s('line', { x1: cx, x2: cx + cw, y1: 28, y2: 28, stroke: '#e8e8e8', 'stroke-width': 1 }));
    }

    // 세로 중앙 정렬 위치 계산
    const layoutCol = (list, x, w) => {
      const totalH = list.length * cardH + Math.max(0, list.length - 1) * gapY;
      const availH = H - topY - 26;
      const startY = topY + Math.max(0, (availH - totalH) / 2);
      return list.map((item, i) => ({ ...item, x, y: startY + i * (cardH + gapY), w, h: cardH, cy: startY + i * (cardH + gapY) + cardH / 2 }));
    };

    const L = layoutCol(leftNodes, col1X, col1W);
    const M = layoutCol(empNodes, col2X, col2W);
    const R = layoutCol(rightNodes, col3X, col3W);
    const byKey = new Map();
    for (const n of [...L, ...M, ...R]) byKey.set(n.key, n);

    const edgeLayer = s('g', { class: 'topo-edges' });
    const nodeLayer = s('g', { class: 'topo-nodes' });
    svg.appendChild(edgeLayer);
    svg.appendChild(nodeLayer);

    const edgeEls = [];
    const nodeEls = [];

    const addCurve = (fromKey, toKey, { active = false, dashed = false, gutterX = null, label = '' } = {}) => {
      const a = byKey.get(fromKey);
      const b = byKey.get(toKey);
      if (!a || !b) return;
      let dPath;
      if (gutterX !== null) {
        const x0 = a.x + a.w;
        const y0 = a.cy + 6;
        const x1 = b.x + b.w;
        const y1 = b.cy - 6;
        dPath = `M${x0},${y0} C${gutterX},${y0} ${gutterX},${y1} ${x1 + 3},${y1}`;
      } else {
        const x0 = a.x + a.w;
        const y0 = a.cy;
        const x1 = b.x - 3;
        const y1 = b.cy;
        const mx = (x0 + x1) / 2;
        dPath = `M${x0},${y0} C${mx},${y0} ${mx},${y1} ${x1},${y1}`;
      }
      const p = s('path', {
        d: dPath,
        fill: 'none',
        class: `topo-edge${active ? ' active' : ''}${dashed ? ' fb' : ''}`,
        stroke: active ? INK : dashed ? '#b2b2b2' : '#d6d6d6',
        'stroke-width': active ? 1.75 : 1.15,
        'stroke-dasharray': dashed ? '3.5 3' : null,
        'marker-end': active ? 'url(#arr-dark)' : dashed ? 'url(#arr-muted)' : null,
        'data-from': fromKey,
        'data-to': toKey,
      }, label ? s('title', {}, label) : null);
      edgeLayer.appendChild(p);
      edgeEls.push(p);
    };

    for (const ed of model.edges || []) addCurve(ed.from, ed.to, ed);

    const trunc = (str, n) => {
      const txt = String(str || '');
      return txt.length > n ? `${txt.slice(0, n - 1)}…` : txt;
    };

    const clearHighlight = () => {
      for (const e of edgeEls) { e.classList.remove('hi', 'dim'); }
      for (const nd of nodeEls) { nd.classList.remove('dim'); }
    };
    svg.addEventListener('mouseleave', clearHighlight);

    const drawNode = (n) => {
      const g = s('g', { class: `topo-node${n.solid ? ' solid' : ''}${n.cooling ? ' cool' : ''}`, 'data-key': n.key, style: 'cursor:pointer' });
      const bg = n.solid ? INK : '#ffffff';
      const bd = n.solid ? INK : n.cooling ? '#9a9a9a' : n.highlight ? INK : '#dcdcdc';
      const inkMain = n.solid ? '#ffffff' : INK;
      const inkSub = n.solid ? '#cccccc' : '#777777';

      g.appendChild(s('rect', {
        x: n.x, y: n.y, width: n.w, height: n.h, rx: 10,
        fill: bg, stroke: bd, 'stroke-width': n.solid || n.highlight ? 1.4 : 1,
        'stroke-dasharray': n.cooling ? '4 3' : null,
      }));

      // 왼쪽 상태 점
      if (n.dot) {
        const dotX = n.x + 14;
        const dotY = n.y + 20;
        if (n.dot === 'working') {
          g.appendChild(s('circle', { cx: dotX, cy: dotY, r: 5.5, fill: 'none', stroke: '#ffffff', 'stroke-width': 1, opacity: 0.45, class: 'pulse-ring' }));
          g.appendChild(s('circle', { cx: dotX, cy: dotY, r: 3, fill: '#ffffff' }));
        } else if (n.dot === 'cool') {
          g.appendChild(s('circle', { cx: dotX, cy: dotY, r: 3.5, fill: '#fff', stroke: '#888', 'stroke-width': 1.2, 'stroke-dasharray': '1.5 1.5' }));
        } else if (n.dot === 'over') {
          g.appendChild(s('circle', { cx: dotX, cy: dotY, r: 3.5, fill: INK }));
        } else {
          g.appendChild(s('circle', { cx: dotX, cy: dotY, r: 3, fill: n.solid ? '#fff' : INK, opacity: n.solid ? 1 : 0.35 }));
        }
      }

      const textX = n.dot ? n.x + 25 : n.x + 13;
      g.appendChild(s('text', {
        x: textX, y: n.y + 23, 'font-size': 12.5, 'font-weight': 600, fill: inkMain,
        'font-family': 'Pretendard, -apple-system, sans-serif',
      }, trunc(n.title, n.badge ? 14 : 19)));

      if (n.badge) {
        const bw = Math.min(72, Math.max(36, n.badge.length * 6.5 + 14));
        const bx = n.x + n.w - bw - 10;
        const by = n.y + 10;
        const badgeSolid = Boolean(n.badgeSolid && !n.solid);
        g.appendChild(s('rect', {
          x: bx, y: by, width: bw, height: 18, rx: 9,
          fill: n.solid ? 'rgba(255,255,255,0.16)' : badgeSolid ? INK : '#f3f3f3',
          stroke: n.solid ? 'none' : badgeSolid ? INK : '#e2e2e2',
          'stroke-width': 0.8,
        }));
        g.appendChild(s('text', {
          x: bx + bw / 2, y: by + 12.5, 'text-anchor': 'middle', 'font-size': 9.5, 'font-weight': 600,
          fill: n.solid || badgeSolid ? '#ffffff' : '#555555',
          'font-family': 'Pretendard, -apple-system, sans-serif',
        }, trunc(n.badge, 10)));
      }

      if (typeof n.ramPct === 'number') {
        // 인라인 마이크로 RAM 바 + 상한 눈금
        const barX = textX;
        const barY = n.y + 34;
        const barW = n.w - (textX - n.x) - 56;
        const capPct = n.maxRamPct || 85;
        g.appendChild(s('rect', { x: barX, y: barY, width: barW, height: 5, rx: 2.5, fill: '#ececec' }));
        g.appendChild(s('rect', { x: barX, y: barY, width: Math.max(3, (Math.min(100, n.ramPct) / 100) * barW), height: 5, rx: 2.5, fill: n.ramPct >= capPct ? INK : '#555555' }));
        const capX = barX + (capPct / 100) * barW;
        g.appendChild(s('line', { x1: capX, x2: capX, y1: barY - 2, y2: barY + 7, stroke: INK, 'stroke-width': 1.2 }));
        g.appendChild(s('text', {
          x: n.x + n.w - 10, y: barY + 5.5, 'text-anchor': 'end', 'font-size': 10, fill: '#666',
          'font-family': 'ui-monospace, Menlo, monospace',
        }, `${n.ramPct}%`));
      } else if (n.sub) {
        g.appendChild(s('text', {
          x: textX, y: n.y + 41, 'font-size': 10.5, fill: inkSub,
          'font-family': 'Pretendard, -apple-system, sans-serif',
        }, trunc(n.sub, 25)));
      }

      if (n.tooltip) g.appendChild(s('title', {}, n.tooltip));

      g.addEventListener('mouseenter', () => {
        const connected = new Set([n.key]);
        for (const e of edgeEls) {
          const hit = e.dataset.from === n.key || e.dataset.to === n.key;
          e.classList.toggle('hi', hit);
          e.classList.toggle('dim', !hit);
          if (hit) { connected.add(e.dataset.from); connected.add(e.dataset.to); }
        }
        for (const nd of nodeEls) nd.classList.toggle('dim', !connected.has(nd.dataset.key));
      });
      g.addEventListener('mouseleave', clearHighlight);
      if (onSelect) g.addEventListener('click', () => onSelect(n));

      nodeLayer.appendChild(g);
      nodeEls.push(g);
    };

    for (const n of [...L, ...M, ...R]) drawNode(n);

    // 하단 범례 1줄
    const ly = H - 8;
    svg.appendChild(s('line', { x1: col1X, x2: col1X + 18, y1: ly - 3, y2: ly - 3, stroke: INK, 'stroke-width': 1.75 }));
    svg.appendChild(s('text', { x: col1X + 24, y: ly, 'font-size': 10, fill: '#888' }, '실행 · 활성 연결'));
    svg.appendChild(s('line', { x1: col1X + 124, x2: col1X + 142, y1: ly - 3, y2: ly - 3, stroke: '#999', 'stroke-width': 1.2, 'stroke-dasharray': '3.5 3' }));
    svg.appendChild(s('text', { x: col1X + 148, y: ly, 'font-size': 10, fill: '#888' }, '토큰 소진 · RAM 과부하 시 대체 우회'));
    svg.appendChild(s('text', { x: W - 28, y: ly, 'text-anchor': 'end', 'font-size': 10, fill: '#aaa' }, '노드에 마우스를 올리면 연결 경로가 강조됩니다 · 클릭 시 이동'));

    return svg;
  }

  // 습관 기록: 최근 8주, 주마다 한 칸 열. 채움 = 완료, 테두리 = 할 날인데 기록 없음, 옅은 칸 = 쉬는 날.
  function habitGrid(routine, todayStr) {
    const cell = 11;
    const gap = 3;
    const left = 16;
    const today = new Date(`${todayStr}T12:00:00`);
    const start = new Date(today);
    start.setDate(start.getDate() - today.getDay() - 7 * 7);
    const W = left + 8 * (cell + gap);
    const H = 7 * (cell + gap);
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'hgrid', width: W * 1.15, height: H * 1.15, role: 'img', 'aria-label': `${routine.title} 최근 8주 기록` });
    ['일', '', '화', '', '목', '', '토'].forEach((t, i) => {
      if (t) svg.appendChild(s('text', { x: 0, y: i * (cell + gap) + 9, 'font-size': 8, fill: '#8a8a8a', 'font-family': 'Pretendard, -apple-system, sans-serif' }, t));
    });
    const pad = (n) => String(n).padStart(2, '0');
    for (let w = 0; w < 8; w++) {
      for (let d = 0; d < 7; d++) {
        const day = new Date(start);
        day.setDate(start.getDate() + w * 7 + d);
        if (day > today) continue;
        const key = `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
        const st = routine.log?.[key];
        const sched = routine.days.includes(d);
        const x = left + w * (cell + gap);
        const y = d * (cell + gap);
        let attrs;
        if (st === '완료') attrs = { fill: INK };
        else if (sched) attrs = { fill: '#fff', stroke: '#d4d4d4', 'stroke-width': 1 };
        else attrs = { fill: '#f4f4f4' };
        svg.appendChild(s('rect', { x: x + 0.5, y: y + 0.5, width: cell - 1, height: cell - 1, rx: 2, ...attrs }, s('title', {}, `${key} ${st || (sched ? '기록 없음' : '쉬는 날')}`)));
      }
    }
    return svg;
  }

  // CONNECT AI LAB 오리지널 컬러 크루 16종 (한국 전통 K-수호 크루 8종 + 모던 랩 크루 8종)
  const CREW_PALETTE = {
    // 한국 전통 K-수호 크루
    haetae:      { bg: '#F0FDFA', main: '#2DD4BF', sub: '#FACC15', skin: '#FFFDF7', hair: '#99F6E4', accent: '#EF4444' },
    dokkaebi:    { bg: '#FFF5F2', main: '#EF4444', sub: '#FACC15', skin: '#FFE4D1', hair: '#2D2A32', accent: '#3B82F6' },
    kkachi:      { bg: '#F0F6FF', main: '#1E3A8A', sub: '#F59E0B', skin: '#FFFFFF', hair: '#1E293B', accent: '#38BDF8' },
    horangi:     { bg: '#FFFBEB', main: '#F59E0B', sub: '#FB923C', skin: '#FEF3C7', hair: '#451A03', accent: '#38BDF8' },
    cheongnyong: { bg: '#ECFEFF', main: '#06B6D4', sub: '#FB7185', skin: '#CFFAFE', hair: '#FFFFFF', accent: '#FDE047' },
    dalto:       { bg: '#FDF2F8', main: '#F472B6', sub: '#34D399', skin: '#FFFDF9', hair: '#FCE7F3', accent: '#FACC15' },
    jangseung:   { bg: '#FEF9EE', main: '#D97706', sub: '#1E293B', skin: '#FDE68A', hair: '#92400E', accent: '#EF4444' },
    bonghwang:   { bg: '#FFF7ED', main: '#FB923C', sub: '#FACC15', skin: '#FFEDD5', hair: '#14B8A6', accent: '#14B8A6' },
    // 모던 랩 크루
    nova: { bg: '#FFF3EE', main: '#FF7A59', sub: '#FDE68A', skin: '#FFE4D1', hair: '#4A3728', accent: '#34D399' },
    volt: { bg: '#EFF9FF', main: '#38BDF8', sub: '#FACC15', skin: '#FFE7D6', hair: '#2B3A55', accent: '#60A5FA' },
    lumi: { bg: '#F4F0FF', main: '#8B5CF6', sub: '#FDE047', skin: '#FFE6DC', hair: '#3B2F63', accent: '#C4B5FD' },
    momo: { bg: '#FFF0F7', main: '#F472B6', sub: '#38BDF8', skin: '#FFFFFF', hair: '#FBCFE8', accent: '#FDE047' },
    coco: { bg: '#ECFDF5', main: '#10B981', sub: '#FACC15', skin: '#FFE5D4', hair: '#334155', accent: '#FB7185' },
    bobo: { bg: '#FFFBEB', main: '#FBBF24', sub: '#22C55E', skin: '#1E293B', hair: '#F59E0B', accent: '#F472B6' },
    pip:  { bg: '#FFF5EB', main: '#FB923C', sub: '#2DD4BF', skin: '#FFE4D1', hair: '#43302B', accent: '#38BDF8' },
    zing: { bg: '#FFF0F3', main: '#FDE047', sub: '#FB7185', skin: '#FEF08A', hair: '#F43F5E', accent: '#38BDF8' },
  };

  // 16x16 컬러 픽셀 아트 도트맵 (문자별 색 매핑)
  const PIXEL_GRIDS = {
    haetae: [
      '.......uu.......',
      '.....hhmmhh.....',
      '...hhmmmmmmhh...',
      '..hmmssssssmmh..',
      '..hmssksSkssmh..',
      '..hmssksssksmh..',
      '..hmsppssppsmh..',
      '...hmssssssmh...',
      '...hhmaaaamhh...',
      '..hhmmmuummmhh..',
      '..mmmmmmmmmmmm..',
      '..mmwwwwwwwwmm..',
      '...mmmmmmmmmm...',
      '....mm....mm....',
    ],
    dokkaebi: [
      '....u......u....',
      '....uu....uu....',
      '...hhhhhhhhhh...',
      '..hhsssssssshh..',
      '..hsssksSksssh..',
      '..hssskssskssh..',
      '..hssppssppssh..',
      '...hsssssssssh..',
      '...mmmmmmmmmm...',
      '..mmmmwwwwmmmm..',
      '..mmmmwwwwmmmm..',
      '..mmmawwwwuumm..',
      '...mmmmmmmmmm...',
      '....mm....mm....',
    ],
    kkachi: [
      '.....hhhhhh.....',
      '..hhhhhhhhhhhh..',
      '....hmmmmmmh....',
      '...mmwwwwwwmm...',
      '..mmwwkwwkwwmm..',
      '..mmwwpwwpwwmm..',
      '..mmmwwuuwwmmm..',
      '...mmmwwwwmmm...',
      '..mmmmwwwwmmmm..',
      '..mmmawwwwammm..',
      '...mmmwwwwmmm...',
      '....mmmmmmmm....',
      '.....uu..uu.....',
      '................',
    ],
    horangi: [
      '...mm......mm...',
      '..mmmmmmmmmmmm..',
      '..mmhmmmmmmhmm..',
      '..mmmmmmmmmmmm..',
      '..mmsksSksSsmm..',
      '..mmssssssssmm..',
      '..mmppssssppmm..',
      '...mmmmmmmmmm...',
      '..mmmmmmmmmmmm..',
      '..mhmmaaaammhm..',
      '..mmmmmmmmmmmm..',
      '...mmmmmmmmmm...',
      '....mm....mm....',
      '................',
    ],
    cheongnyong: [
      '...u........u...',
      '...uu.mmmm.uu...',
      '...mmmmmmmmmm...',
      '..mmssssssssmm..',
      '..mmsksSksssmm..',
      '..mmsppssppsmm..',
      '...mmssssssmm...',
      '..wwwwwwwwwwww..',
      '.wwwwwwwwwwwwww.',
      '..mmmmaaaammmm..',
      '..mmmaaaaaammm..',
      '...mmmmmmmmmm...',
      '....mm....mm....',
      '................',
    ],
    dalto: [
      '....ss....ss....',
      '....sm....ms....',
      '....sm....ms....',
      '...ssssssssss...',
      '..ssskssssksss..',
      '..ssppssssppss..',
      '...ssssssssss...',
      '...mmmmmmmmmm...',
      '..mmmmuuuummmm..',
      '..mmmmmmmmmmmm..',
      '..mmmmmmmmmmmm..',
      '...mmmmmmmmmm...',
      '....ss....ss....',
      '................',
    ],
    jangseung: [
      '.....uuuuuu.....',
      '...uuuuuuuuuu...',
      '....mmmmmmmm....',
      '...mmssssssmm...',
      '...mskssssksm...',
      '...msppssppsm...',
      '...mmssssssmm...',
      '...mmmmmmmmmm...',
      '..mmmmmmmmmmmm..',
      '..mmmmaaaammmm..',
      '..mmmmmmmmmmmm..',
      '...mmmmmmmmmm...',
      '...mmmmmmmmmm...',
      '................',
    ],
    bonghwang: [
      '.....u.uu.u.....',
      '.....mmmmmm.....',
      '...mmmmmmmmmm...',
      '..mmssssssssmm..',
      '..mmsksSksssmm..',
      '..mmsppSSppsmm..',
      '...mmssuussmm...',
      '..aaammmmmmaaa..',
      '..aaammmmmmaaa..',
      '...ammmmmmmma...',
      '....mmmmmmmm....',
      '.....uu..uu.....',
      '................',
      '................',
    ],
    nova: [
      '.....mmmmmm.....',
      '....mmmmmmmm....',
      '...mhhhhhhhm....',
      '...hsssssssh....',
      '..hhssksSksshh..',
      '..hssskssskssh..',
      '..hssppssppssh..',
      '...hsssssssssh..',
      '....hsssssssh...',
      '...mmmssssmmm...',
      '..mmmmmmmmmmmm..',
      '..mmmmaaaammmm..',
      '..mmmmmmmmmmmm..',
      '...mm......mm...',
    ],
    volt: [
      '....mmmmmmmm....',
      '...mmmmmmmmmm...',
      '..ummhhhhhhmmu..',
      '..umhsssssshmu..',
      '..umssksSkssmu..',
      '..umssksssksmu..',
      '..umsppssppsmu..',
      '...mssssssssm...',
      '...mmmmmmmmmm...',
      '..mmmmmmmmmmmm..',
      '..mmmaaaaaammm..',
      '..mmmaauuaammm..',
      '..mmmmmmmmmmmm..',
      '...mm......mm...',
    ],
    lumi: [
      '....mmmmmmmm....',
      '...mmmmmmummm...',
      '..mmmhhhhhhmmm..',
      '..mmhsssssshmm..',
      '..mmssksSkssmm..',
      '..mmssksssksmm..',
      '..mmsppssppsmm..',
      '..mmmssssssmmm..',
      '...mmmmmmmmmm...',
      '..mmmmmmmmmmmm..',
      '..mmmmaaaammmm..',
      '..mmmaauuaammm..',
      '..mmmmmmmmmmmm..',
      '...mm......mm...',
    ],
    momo: [
      '.....wwwwww.....',
      '...wwwwwwwwww...',
      '..wwwwwwwwwwww..',
      '..wwwwwwwwwwww..',
      '.wwwkwwwwwwkwww.',
      '.wwppwwwwwwppww.',
      '.wwwwwwkkwwwwww.',
      '..wwwwwwwwwwww..',
      '..mmmmmmmmmmmm..',
      '...mmmmmmmmmm...',
      '..wwwwmmmmwwww..',
      '..wwwuuuuuuwww..',
      '...wwuuuuuuww...',
      '....wwwwwwww....',
    ],
    coco: [
      '...mmmmmmmmmm...',
      '..mmmmmmmmmmmm..',
      '..mmhhhhhhhhmm..',
      '...hssssssssh...',
      '..hhssksSksshh..',
      '..hssskssskssh..',
      '..hssppssppssh..',
      '...hsssssssssh..',
      '...mmmuuuummm...',
      '..mmmuummmmmmm..',
      '..mmummmaaammm..',
      '..mmmmmmaaammm..',
      '...mmmmmmmmmm...',
      '...mm......mm...',
    ],
    bobo: [
      '.......uu.......',
      '......uuuu......',
      '.......uu.......',
      '...mmmmmmmmmm...',
      '..mmmmmmmmmmmm..',
      '..mmkkkkkkkkmm..',
      '..mmkwwkkwwkmm..',
      '..mmkpkwwkpkmm..',
      '..mmkkkkkkkkmm..',
      '..mmmmmmmmmmmm..',
      '..mmmmaaaammmm..',
      '..mmmmmmmmmmmm..',
      '...mmmmmmmmmm...',
      '....mm....mm....',
    ],
    pip: [
      '....mmmmmmmm....',
      '...mmmmmmmmmm...',
      '...mhhhhhhhhm...',
      '...hssssssssh...',
      '..hhssksSksshh..',
      '..hssskssskssh..',
      '..hssppssppssh..',
      '...hsssssssssh..',
      '...wwwmmmmwww...',
      '..mmmmmmmmmmmm..',
      '..mmuuuuuuuumm..',
      '..mmukukukukmm..',
      '..mmuuuuuuuumm..',
      '...mm......mm...',
    ],
    zing: [
      '.......mm.......',
      '......mmmm......',
      '.....mmmmmm.....',
      '..mmmmmmmmmmmm..',
      '.mmuuummmmuuumm.',
      '.mmuukmmmmkuumm.',
      '..mmmmkmmkmmmm..',
      '...mmppmmppmm...',
      '....mmmmmmmm....',
      '...mmmmmmmmmm...',
      '..mmmmmmmmmmmm..',
      '..mmmaaaaaammm..',
      '...mmm....mmm...',
      '...mm......mm...',
    ],
  };

  function pixelAvatarSvg(key, pal, { size, state }) {
    const working = state === 'working';
    const cooling = state === 'cooling';
    const svg = s('svg', {
      viewBox: '0 0 20 20', width: size, height: size,
      class: `avatar-svg av-pixel${working ? ' working' : ''}${cooling ? ' cool' : ''}`,
      'shape-rendering': 'crispEdges', role: 'img', 'aria-label': `AI 직원 픽셀 캐릭터 ${key}`,
    });
    svg.appendChild(s('rect', { x: 0, y: 0, width: 20, height: 20, rx: 4.5, fill: pal.bg }));
    const colorMap = {
      m: pal.main, u: pal.sub, s: pal.skin, h: pal.hair, a: pal.accent,
      w: '#FFFFFF', k: '#1E293B', S: '#1E293B', p: '#FF9EBB',
    };
    const grid = PIXEL_GRIDS[key] || PIXEL_GRIDS.bobo;
    const body = s('g', { class: 'av-px-body' });
    grid.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) {
        const ch = row[c];
        const fill = colorMap[ch];
        if (!fill) continue;
        body.appendChild(s('rect', { x: c + 2, y: r + 3, width: 1, height: 1, fill }));
      }
    });
    svg.appendChild(body);
    if (working) {
      svg.appendChild(s('rect', { x: 16, y: 2, width: 2, height: 2, fill: pal.main, class: 'av-spark1' }));
      svg.appendChild(s('rect', { x: 2, y: 3, width: 1.5, height: 1.5, fill: pal.sub, class: 'av-spark2' }));
    } else if (cooling) {
      svg.appendChild(s('rect', { x: 13, y: 1.5, width: 5.5, height: 3.6, rx: 1.5, fill: '#111' }));
      svg.appendChild(s('text', { x: 15.7, y: 4.2, 'text-anchor': 'middle', 'font-size': 2.8, 'font-weight': 700, fill: '#fff', 'font-family': 'Pretendard, sans-serif' }, 'zZ'));
    }
    return svg;
  }

  function avatarSvg(key = 'haetae', { size = 44, state = 'idle', style = 'motion', showZ = true } = {}) {
    const px = window.PixelCrew;
    if (px && (px.isJoseonKey(key) || (style === 'pixel' && px.SPRITES[key]))) {
      return px.renderSvg(key, { size, state, showZ });
    }
    const legacy = { fox: 'dokkaebi', cat: 'haetae', owl: 'kkachi', whale: 'cheongnyong', rabbit: 'dalto', bot: 'jangseung', bear: 'bonghwang', spark: 'horangi' };
    const k = CREW_PALETTE[key] ? key : (legacy[key] || 'haetae');
    const pal = CREW_PALETTE[k];
    if (style === 'pixel') {
      if (px && px.SPRITES[k]) return px.renderSvg(k, { size, state, showZ });
      return pixelAvatarSvg(k, pal, { size, state });
    }

    const working = state === 'working';
    const cooling = state === 'cooling';
    const animated = style === 'motion';
    const svg = s('svg', {
      viewBox: '0 0 64 64', width: size, height: size,
      class: `avatar-svg${animated ? ' av-motion' : ''}${working ? ' working' : ''}${cooling ? ' cool' : ''}`,
      role: 'img', 'aria-label': `AI 직원 캐릭터 ${k}`,
    });

    // 컬러 파스텔 배경 + 깔끔한 라운드 프레임
    svg.appendChild(s('rect', {
      x: 1.5, y: 1.5, width: 61, height: 61, rx: 16,
      fill: pal.bg,
      stroke: working ? pal.main : cooling ? '#cbd5e1' : 'rgba(17,17,17,0.08)',
      'stroke-width': working ? 2.2 : 1.2,
      'stroke-dasharray': cooling ? '4 3' : null,
    }));

    // 부드러운 바닥 그림자
    svg.appendChild(s('ellipse', { cx: 32, cy: 55.5, rx: 14, ry: 3, fill: pal.main, opacity: 0.16 }));

    const body = s('g', { class: 'av-body' });

    // 공통 귀여운 눈 + 반짝임 + 볼터치 헬퍼
    const addFace = (cx, cy, { darkScreen = false, smile = true } = {}) => {
      const eyeG = s('g', { class: 'av-eyes' });
      const eyeFill = darkScreen ? '#FFFFFF' : '#1E293B';
      if (cooling) {
        // 졸린 눈 (u u)
        eyeG.appendChild(s('path', { d: `M${cx - 8} ${cy} Q${cx - 5.5} ${cy + 3} ${cx - 3} ${cy}`, fill: 'none', stroke: eyeFill, 'stroke-width': 2, 'stroke-linecap': 'round' }));
        eyeG.appendChild(s('path', { d: `M${cx + 3} ${cy} Q${cx + 5.5} ${cy + 3} ${cx + 8} ${cy}`, fill: 'none', stroke: eyeFill, 'stroke-width': 2, 'stroke-linecap': 'round' }));
      } else if (working) {
        // 신난 반달 눈 (^ ^)
        eyeG.appendChild(s('path', { d: `M${cx - 8.5} ${cy + 1} Q${cx - 5.5} ${cy - 3.2} ${cx - 2.5} ${cy + 1}`, fill: 'none', stroke: eyeFill, 'stroke-width': 2.2, 'stroke-linecap': 'round' }));
        eyeG.appendChild(s('path', { d: `M${cx + 2.5} ${cy + 1} Q${cx + 5.5} ${cy - 3.2} ${cx + 8.5} ${cy + 1}`, fill: 'none', stroke: eyeFill, 'stroke-width': 2.2, 'stroke-linecap': 'round' }));
      } else {
        // 동글동글 반짝이는 눈
        eyeG.appendChild(s('circle', { cx: cx - 5.8, cy, r: 2.7, fill: eyeFill }));
        eyeG.appendChild(s('circle', { cx: cx + 5.8, cy, r: 2.7, fill: eyeFill }));
        if (!darkScreen) {
          eyeG.appendChild(s('circle', { cx: cx - 6.6, cy: cy - 1, r: 1, fill: '#fff' }));
          eyeG.appendChild(s('circle', { cx: cx + 5, cy: cy - 1, r: 1, fill: '#fff' }));
        }
      }
      body.appendChild(eyeG);
      // 핑크 볼터치
      body.appendChild(s('ellipse', { cx: cx - 10.5, cy: cy + 3.5, rx: 3.1, ry: 1.8, fill: '#FF8FAB', opacity: darkScreen ? 0.85 : 0.55 }));
      body.appendChild(s('ellipse', { cx: cx + 10.5, cy: cy + 3.5, rx: 3.1, ry: 1.8, fill: '#FF8FAB', opacity: darkScreen ? 0.85 : 0.55 }));
      if (smile) {
        body.appendChild(s('path', { d: `M${cx - 2.6} ${cy + 4.8} Q${cx} ${cy + 7.2} ${cx + 2.6} ${cy + 4.8}`, fill: 'none', stroke: eyeFill, 'stroke-width': 1.8, 'stroke-linecap': 'round' }));
      }
    };

    if (k === 'haetae') {
      // 해태 (옥빛 곱슬 구름 갈기 + 황금 뿔 + 빨간 매듭 방울 + 노트북)
      for (const [cx, cy, r] of [[16, 25, 7], [48, 25, 7], [19, 17, 7], [45, 17, 7], [32, 14, 8], [16, 34, 6], [48, 34, 6]]) {
        body.appendChild(s('circle', { cx, cy, r, fill: pal.hair }));
      }
      body.appendChild(s('circle', { cx: 32, cy: 31, r: 14, fill: pal.skin }));
      body.appendChild(s('polygon', { points: '29,18 35,18 32,9', fill: pal.sub, stroke: '#D97706', 'stroke-width': 1, class: 'av-wiggle' }));
      addFace(32, 31);
      body.appendChild(s('path', { d: 'M20 44 Q32 48 44 44', fill: 'none', stroke: pal.accent, 'stroke-width': 2.6, 'stroke-linecap': 'round' }));
      body.appendChild(s('circle', { cx: 32, cy: 47, r: 3.2, fill: pal.sub, stroke: '#D97706', 'stroke-width': 1 }));
      body.appendChild(s('rect', { x: 18, y: 47, width: 16, height: 7, rx: 2, fill: '#F5F5F0', stroke: '#CBD5E1', 'stroke-width': 1 }));
    } else if (k === 'dokkaebi') {
      // 도깨비 (다홍 한복 배자 + 꼬마 금뿔 + 도깨비방망이 펜)
      body.appendChild(s('path', { d: 'M17 53 C17 42 24 40 32 40 C40 40 47 42 47 53 Z', fill: pal.main }));
      body.appendChild(s('path', { d: 'M27 40 L32 47 L37 40', fill: '#FFFDF7' }));
      body.appendChild(s('circle', { cx: 32, cy: 29, r: 14, fill: pal.skin }));
      body.appendChild(s('path', { d: 'M17 28 C17 16 24 12 32 13 C40 12 47 16 47 28 C42 23 37 22 32 23 C27 22 22 23 17 28 Z', fill: pal.hair }));
      body.appendChild(s('polygon', { points: '21,17 26,15 21,9', fill: pal.sub, class: 'av-wiggle' }));
      body.appendChild(s('polygon', { points: '43,17 38,15 43,9', fill: pal.sub, class: 'av-wiggle' }));
      addFace(32, 30);
      body.appendChild(s('rect', { x: 43, y: 38, width: 4.5, height: 13, rx: 2, fill: pal.sub, transform: 'rotate(18 45 44)' }));
    } else if (k === 'kkachi') {
      // 까치 (반투명 전통 갓 + 감색/흰색 깃털 + 돋보기)
      body.appendChild(s('ellipse', { cx: 32, cy: 36, rx: 15, ry: 16, fill: pal.main }));
      body.appendChild(s('ellipse', { cx: 32, cy: 43, rx: 11, ry: 9, fill: '#FFFFFF' }));
      // 갓
      body.appendChild(s('g', { class: 'av-wiggle' },
        s('ellipse', { cx: 32, cy: 19, rx: 18, ry: 3.5, fill: '#1E293B', opacity: 0.85 }),
        s('rect', { x: 25, y: 9.5, width: 14, height: 9.5, rx: 2, fill: '#1E293B', opacity: 0.82 })));
      addFace(32, 30, { darkScreen: true, smile: false });
      body.appendChild(s('polygon', { points: '29.5,33 34.5,33 32,36.5', fill: pal.sub }));
      body.appendChild(s('circle', { cx: 20, cy: 43, r: 4.5, fill: '#E0F2FE', stroke: pal.sub, 'stroke-width': 1.8 }));
    } else if (k === 'horangi') {
      // 민화 호랑이 (치자빛 노랑 + 줄무늬 + 색동 목걸이)
      body.appendChild(s('circle', { cx: 19, cy: 17, r: 5.5, fill: pal.main }));
      body.appendChild(s('circle', { cx: 45, cy: 17, r: 5.5, fill: pal.main }));
      body.appendChild(s('circle', { cx: 19, cy: 17, r: 2.8, fill: pal.skin }));
      body.appendChild(s('circle', { cx: 45, cy: 17, r: 2.8, fill: pal.skin }));
      body.appendChild(s('ellipse', { cx: 32, cy: 45, rx: 14, ry: 9, fill: pal.main }));
      body.appendChild(s('circle', { cx: 32, cy: 29, r: 15, fill: pal.main }));
      body.appendChild(s('ellipse', { cx: 32, cy: 33, rx: 9.5, ry: 7, fill: pal.skin }));
      body.appendChild(s('path', { d: 'M27 17 L37 17 M29 20 L35 20', stroke: pal.hair, 'stroke-width': 2, 'stroke-linecap': 'round' }));
      addFace(32, 29);
      body.appendChild(s('path', { d: 'M21 43 Q32 47 43 43', fill: 'none', stroke: '#EF4444', 'stroke-width': 3, 'stroke-linecap': 'round' }));
      body.appendChild(s('circle', { cx: 32, cy: 46, r: 2.8, fill: '#FACC15' }));
    } else if (k === 'cheongnyong') {
      // 청룡 (청자빛 아기 용 + 산호 뿔 + 구름 카라 + 여의주)
      body.appendChild(s('path', { d: 'M22 18 L18 10 M20 14 L23 11 M42 18 L46 10 M44 14 L41 11', stroke: pal.sub, 'stroke-width': 2.6, 'stroke-linecap': 'round', class: 'av-wiggle' }));
      body.appendChild(s('ellipse', { cx: 32, cy: 45, rx: 13, ry: 9, fill: pal.main }));
      body.appendChild(s('circle', { cx: 32, cy: 29, r: 13.5, fill: pal.main }));
      body.appendChild(s('ellipse', { cx: 32, cy: 33, rx: 9, ry: 6, fill: pal.skin }));
      addFace(32, 29);
      // 흰 구름 목도리 + 여의주
      for (const cx of [22, 27, 32, 37, 42]) body.appendChild(s('circle', { cx, cy: 41, r: 3.4, fill: '#FFFFFF' }));
      body.appendChild(s('circle', { cx: 32, cy: 48, r: 5.5, fill: pal.accent, stroke: '#F59E0B', 'stroke-width': 1 }));
    } else if (k === 'dalto') {
      // 달토끼 (분홍 한복 저고리 + 민트 옷고름 + 스마트폰)
      body.appendChild(s('ellipse', { cx: 25, cy: 14, rx: 4, ry: 10, fill: pal.skin, stroke: '#FBCFE8', 'stroke-width': 1.2, class: 'av-wiggle' }));
      body.appendChild(s('ellipse', { cx: 39, cy: 14, rx: 4, ry: 10, fill: pal.skin, stroke: '#FBCFE8', 'stroke-width': 1.2, class: 'av-wiggle' }));
      body.appendChild(s('ellipse', { cx: 25, cy: 14, rx: 1.8, ry: 6, fill: '#FBCFE8' }));
      body.appendChild(s('ellipse', { cx: 39, cy: 14, rx: 1.8, ry: 6, fill: '#FBCFE8' }));
      body.appendChild(s('path', { d: 'M17 53 C17 42 24 40 32 40 C40 40 47 42 47 53 Z', fill: pal.main }));
      body.appendChild(s('path', { d: 'M27 40 L32 46 L37 40', fill: '#FFFFFF' }));
      body.appendChild(s('rect', { x: 28, y: 45, width: 9, height: 3.5, rx: 1.8, fill: pal.sub }));
      body.appendChild(s('circle', { cx: 32, cy: 30, r: 13.5, fill: pal.skin }));
      addFace(32, 30);
    } else if (k === 'jangseung') {
      // 꼬마 장승 (따뜻한 나무결 + 사모관대 + 빨간 복주머니)
      body.appendChild(s('rect', { x: 18, y: 20, width: 28, height: 34, rx: 13, fill: pal.main, stroke: '#B45309', 'stroke-width': 1.2 }));
      body.appendChild(s('ellipse', { cx: 32, cy: 31, rx: 11.5, ry: 10, fill: pal.skin }));
      // 사모관대
      body.appendChild(s('g', { class: 'av-wiggle' },
        s('rect', { x: 24, y: 11, width: 16, height: 10, rx: 5, fill: pal.sub }),
        s('ellipse', { cx: 19, cy: 17, rx: 4, ry: 2.2, fill: pal.sub }),
        s('ellipse', { cx: 45, cy: 17, rx: 4, ry: 2.2, fill: pal.sub })));
      addFace(32, 31);
      // 빨간 복주머니
      body.appendChild(s('circle', { cx: 32, cy: 47, r: 5.2, fill: pal.accent }));
      body.appendChild(s('circle', { cx: 32, cy: 47, r: 1.8, fill: '#FACC15' }));
    } else if (k === 'bonghwang') {
      // 아기 봉황 (복숭아·금·옥빛 깃털 + 왕관 벼슬 + 슬레이트)
      body.appendChild(s('g', { class: 'av-wiggle' },
        s('ellipse', { cx: 32, cy: 12, rx: 3.2, ry: 6, fill: pal.main }),
        s('ellipse', { cx: 26, cy: 14, rx: 2.6, ry: 5, fill: pal.sub, transform: 'rotate(-20 26 14)' }),
        s('ellipse', { cx: 38, cy: 14, rx: 2.6, ry: 5, fill: pal.accent, transform: 'rotate(20 38 14)' })));
      body.appendChild(s('ellipse', { cx: 32, cy: 36, rx: 15, ry: 16, fill: pal.main }));
      body.appendChild(s('ellipse', { cx: 32, cy: 31, rx: 12, ry: 10, fill: pal.skin }));
      addFace(32, 30, { smile: false });
      body.appendChild(s('polygon', { points: '29.5,33 34.5,33 32,36', fill: pal.sub }));
      body.appendChild(s('rect', { x: 22, y: 44, width: 20, height: 9, rx: 2, fill: pal.accent }));
      body.appendChild(s('rect', { x: 22, y: 44, width: 20, height: 2.8, rx: 1, fill: '#1E293B' }));
    } else if (k === 'bobo') {
      // 보보 (버터 옐로우 새싹 봇)
      const leaf = s('g', { class: 'av-wiggle' });
      leaf.appendChild(s('path', { d: 'M32 16 L32 11', stroke: '#16A34A', 'stroke-width': 2.2, 'stroke-linecap': 'round' }));
      leaf.appendChild(s('path', { d: 'M32 12 C26 9 25 5 31 7 C32 8 32 10 32 12 Z', fill: '#22C55E' }));
      leaf.appendChild(s('path', { d: 'M32 12 C38 9 39 5 33 7 C32 8 32 10 32 12 Z', fill: '#4ADE80' }));
      body.appendChild(leaf);
      body.appendChild(s('rect', { x: 14, y: 16, width: 36, height: 30, rx: 12, fill: pal.main, stroke: '#D97706', 'stroke-width': 1.2 }));
      body.appendChild(s('rect', { x: 19, y: 21, width: 26, height: 18, rx: 7, fill: '#1E293B' }));
      addFace(32, 29, { darkScreen: true });
      body.appendChild(s('rect', { x: 22, y: 46, width: 20, height: 7, rx: 3.5, fill: '#FDE68A' }));
      body.appendChild(s('circle', { cx: 32, cy: 49.5, r: 2, fill: '#F472B6' }));
    } else if (k === 'momo') {
      // 모모 (파스텔 구름 요정)
      body.appendChild(s('path', { d: 'M18 42 C11 42 10 31 17 29 C16 20 25 14 33 17 C41 14 49 21 47 29 C54 31 53 42 46 42 Z', fill: '#FFFFFF', stroke: '#F9A8D4', 'stroke-width': 1.5 }));
      // 진주 헤어밴드 + 스카프
      body.appendChild(s('circle', { cx: 26, cy: 17, r: 2.2, fill: pal.sub }));
      body.appendChild(s('circle', { cx: 32, cy: 15.5, r: 2.4, fill: pal.main }));
      body.appendChild(s('circle', { cx: 38, cy: 17, r: 2.2, fill: pal.accent }));
      addFace(32, 30);
      body.appendChild(s('rect', { x: 20, y: 40, width: 24, height: 7, rx: 3.5, fill: pal.main }));
      body.appendChild(s('rect', { x: 36, y: 44, width: 6, height: 9, rx: 3, fill: '#EC4899' }));
      // 미니 편지봉투
      body.appendChild(s('rect', { x: 15, y: 44, width: 12, height: 8, rx: 2, fill: pal.sub }));
      body.appendChild(s('path', { d: 'M15 44 L21 48.5 L27 44', fill: 'none', stroke: '#fff', 'stroke-width': 1.3 }));
    } else if (k === 'zing') {
      // 징 (파스텔 스파크 스타)
      body.appendChild(s('path', { d: 'M32 9 L39 22 L53 25 L43 35 L46 49 L32 43 L18 49 L21 35 L11 25 L25 22 Z', fill: pal.main, stroke: '#F59E0B', 'stroke-width': 1.4, 'stroke-linejoin': 'round' }));
      // 하트 선글라스 (머리 위)
      body.appendChild(s('circle', { cx: 27, cy: 20, r: 4, fill: pal.sub }));
      body.appendChild(s('circle', { cx: 37, cy: 20, r: 4, fill: pal.sub }));
      body.appendChild(s('line', { x1: 31, y1: 20, x2: 33, y2: 20, stroke: pal.sub, 'stroke-width': 2 }));
      addFace(32, 32);
      // 미니 메가폰
      body.appendChild(s('polygon', { points: '44,41 54,36 54,47 44,44', fill: pal.accent }));
    } else {
      // 귀여운 치비 크루 5종 (nova, volt, lumi, coco, pip)
      // 상체(후디/스웨터)
      body.appendChild(s('path', { d: 'M18 53 C18 43 24 41 32 41 C40 41 46 43 46 53 Z', fill: pal.main }));
      // 작은 CONNECT AI 배지 점
      body.appendChild(s('circle', { cx: 38, cy: 48, r: 2.1, fill: '#fff', opacity: 0.9 }));
      // 얼굴
      body.appendChild(s('circle', { cx: 32, cy: 30, r: 14.5, fill: pal.skin }));
      // 앞머리
      body.appendChild(s('path', { d: 'M17.5 28 C18 17 25 14 32 14 C39 14 46 17 46.5 28 C42 24 38 22 32 23 C26 22 22 24 17.5 28 Z', fill: pal.hair }));

      if (k === 'nova') {
        // 코랄 베레모 + 동그란 금테 안경 + 펜
        body.appendChild(s('ellipse', { cx: 32, cy: 16.5, rx: 16, ry: 6.5, fill: pal.main, class: 'av-wiggle' }));
        body.appendChild(s('circle', { cx: 32, cy: 10.5, r: 2.2, fill: pal.main }));
        addFace(32, 31);
        body.appendChild(s('circle', { cx: 26.2, cy: 31, r: 4.8, fill: 'none', stroke: '#D97706', 'stroke-width': 1.4 }));
        body.appendChild(s('circle', { cx: 37.8, cy: 31, r: 4.8, fill: 'none', stroke: '#D97706', 'stroke-width': 1.4 }));
        body.appendChild(s('line', { x1: 31, y1: 31, x2: 33, y2: 31, stroke: '#D97706', 'stroke-width': 1.4 }));
      } else if (k === 'volt') {
        // 노란 헤드폰 + 민트 미니 노트북
        body.appendChild(s('path', { d: 'M16 30 C16 14 48 14 48 30', fill: 'none', stroke: pal.sub, 'stroke-width': 3.5, 'stroke-linecap': 'round' }));
        body.appendChild(s('rect', { x: 13.5, y: 26, width: 5, height: 10, rx: 2.5, fill: pal.sub }));
        body.appendChild(s('rect', { x: 45.5, y: 26, width: 5, height: 10, rx: 2.5, fill: pal.sub }));
        addFace(32, 31);
        body.appendChild(s('rect', { x: 21, y: 45, width: 22, height: 9, rx: 2.5, fill: '#E0F2FE', stroke: '#38BDF8', 'stroke-width': 1.2 }));
        body.appendChild(s('circle', { cx: 32, cy: 49.5, r: 1.8, fill: pal.sub }));
      } else if (k === 'lumi') {
        // 라벤더 후드 + 별 머리핀
        body.appendChild(s('path', { d: 'M15 32 C15 15 22 11 32 11 C42 11 49 15 49 32', fill: 'none', stroke: pal.main, 'stroke-width': 4, 'stroke-linecap': 'round' }));
        body.appendChild(s('polygon', { points: '42,17 43.4,20 46.5,20.3 44.1,22.4 44.8,25.4 42,23.8 39.2,25.4 39.9,22.4 37.5,20.3 40.6,20', fill: pal.sub, class: 'av-wiggle' }));
        addFace(32, 31);
      } else if (k === 'coco') {
        // 민트 캡모자 + 옐로우 스트랩 + 코랄 스마트폰
        body.appendChild(s('path', { d: 'M17 22 C18 12 46 12 47 22 Z', fill: pal.main }));
        body.appendChild(s('rect', { x: 35, y: 19, width: 14, height: 4, rx: 2, fill: '#059669' }));
        addFace(32, 31);
        body.appendChild(s('line', { x1: 23, y1: 42, x2: 39, y2: 53, stroke: pal.sub, 'stroke-width': 3 }));
        body.appendChild(s('rect', { x: 43, y: 41, width: 8, height: 12, rx: 2, fill: pal.accent }));
      } else if (k === 'pip') {
        // 오렌지 화가 베레모 + 미니 슬레이트
        body.appendChild(s('ellipse', { cx: 31, cy: 16, rx: 16.5, ry: 6.5, fill: pal.main, transform: 'rotate(-8 31 16)', class: 'av-wiggle' }));
        addFace(32, 31);
        body.appendChild(s('rect', { x: 18, y: 44, width: 15, height: 10, rx: 2, fill: pal.sub }));
        body.appendChild(s('rect', { x: 18, y: 44, width: 15, height: 3, rx: 1, fill: '#1E293B' }));
      }
    }

    svg.appendChild(body);

    // 상태별 살아 있는 모션 이펙트
    if (working) {
      svg.appendChild(s('path', { d: 'M51 11 L52.5 14.5 L56 16 L52.5 17.5 L51 21 L49.5 17.5 L46 16 L49.5 14.5 Z', fill: pal.main, class: 'av-spark1' }));
      svg.appendChild(s('circle', { cx: 12, cy: 15, r: 2.5, fill: pal.sub, class: 'av-spark2' }));
    } else if (cooling) {
      svg.appendChild(s('g', { class: 'av-zzz' },
        s('rect', { x: 41, y: 5, width: 18, height: 12, rx: 6, fill: '#111' }),
        s('text', { x: 50, y: 13.5, 'text-anchor': 'middle', 'font-size': 8.5, 'font-weight': 700, fill: '#fff', 'font-family': 'Pretendard, sans-serif' }, 'zZ')));
    }
    return svg;
  }

  function swarmAllSvg(keys, opts) {
    return window.PixelCrew ? window.PixelCrew.renderAllClusterSvg(keys, opts) : avatarSvg('sejong', opts);
  }

  window.Charts = { spark, paybar, timelineRow, flow, ring, ramChart, healthChart, workloadBars, companyGraph, habitGrid, avatarSvg, swarmAllSvg };
})();
