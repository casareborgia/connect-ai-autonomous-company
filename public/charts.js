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

  // 얇은 고리 게이지. frac 이 null 이면 점선 고리.
  function ring(frac) {
    const r = 23;
    const c = 2 * Math.PI * r;
    const svg = s('svg', { viewBox: '0 0 56 56', role: 'img' });
    svg.appendChild(s('circle', { cx: 28, cy: 28, r, fill: 'none', stroke: frac === null ? GREY : LINE, 'stroke-width': frac === null ? 1 : 3, 'stroke-dasharray': frac === null ? '2 3' : null }));
    if (frac !== null) {
      svg.appendChild(s('circle', { cx: 28, cy: 28, r, fill: 'none', stroke: INK, 'stroke-width': 3, 'stroke-dasharray': `${(c * Math.min(Math.max(frac, 0), 1)).toFixed(2)} ${c.toFixed(2)}`, transform: 'rotate(-90 28 28)', 'stroke-linecap': 'butt' }));
      svg.appendChild(s('text', { x: 28, y: 32, 'text-anchor': 'middle', 'font-size': 12, fill: INK, 'font-family': 'Pretendard, -apple-system, sans-serif' }, `${Math.round(frac * 100)}%`));
    }
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

  window.Charts = { spark, paybar, timelineRow, flow, ring, habitGrid };
})();
