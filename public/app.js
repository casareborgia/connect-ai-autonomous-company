// AI 회사 본사 · 화면
// 네 칸: 내 할 일, 매일 할 일, 내 직원, 내 리소스.
// 모든 데이터는 textContent 로만 넣는다 (AI가 쓴 글은 데이터일 뿐, 절대 실행하지 않음).
'use strict';

const C = window.Charts;
let S = null;
const ui = {
  route: 'home', param: '', open: null, picking: null, editingEmp: null, drag: false, office: null,
  models: null, listening: false, lastThread: null, handout: {}, ob: null, lan: null,
};

// 같은 요청을 두 번 보내지 않는다 (엔터 두 번, 빠른 두 번 클릭)
const inflight = new Set();
async function once(key, fn) {
  if (inflight.has(key)) return null;
  inflight.add(key);
  try { return await fn(); } finally { inflight.delete(key); }
}
// 입력칸 값을 먼저 비우고 보낸다. 실패하면 되돌린다.
async function submitInput(input, key, send) {
  const v = input.value;
  if (!v.trim()) { input.focus(); return null; }
  return once(key, async () => {
    input.value = '';
    const r = await send(v);
    if (!r) { const el = document.querySelector(`[data-k="${input.dataset.k}"]`) || input; if (!el.value) el.value = v; }
    return r;
  });
}

async function copyText(textValue) {
  try { await navigator.clipboard.writeText(textValue); return true; } catch { /* http 폰 등 */ }
  const ta = h('textarea', { style: 'position:fixed;top:-1000px;opacity:0' }, textValue);
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove();
  return ok;
}
const batchim = (w) => { const c = w.charCodeAt(w.length - 1) - 0xac00; return c >= 0 && c < 11172 && c % 28 !== 0; };
// 한국어 조사: 받침이 있으면 앞의 것 (영어 이름은 끝 글자 소리로 짐작)
function josa(w, withB, without) {
  const s = String(w || '').trim();
  const last = s.slice(-1);
  const has = /[가-힣]/.test(last) ? batchim(s) : /(ng|[klmn])$/i.test(s);
  return `${s}${has ? withB : without}`;
}
const gateK = (g) => `${g}${batchim(g) ? '이' : '가'}`;
const gateO = (g) => `${g}${batchim(g) ? '을' : '를'}`;

// ───────── 작은 도우미 ─────────

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = Boolean(v);
      else if (k === 'style') el.style.cssText = v; // CSP: style 속성 대신 CSSOM
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const k of kids.flat(3)) {
    if (k === null || k === undefined || k === false) continue;
    el.appendChild(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return el;
}

const WD = ['일', '월', '화', '수', '목', '금', '토'];
const pad = (n) => String(n).padStart(2, '0');
const won = (n) => `${Math.round(n).toLocaleString('ko-KR')}원`;
function money(n, cur) { return cur === 'KRW' ? won(n) : `${cur} ${Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })}`; }
function bigMoney(n) { return [Math.round(n).toLocaleString('ko-KR'), h('small', null, '원')]; }
function dateK(ymd) {
  const d = new Date(`${ymd}T12:00:00`);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WD[d.getDay()]})`;
}
function periodK(p) { return /^\d{4}-\d{2}$/.test(p) ? `${Number(p.slice(5))}월 전체` : dateK(p); }
function stamp(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const same = S && S.today === `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return same ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function emp(id) { return S.data.employees.find((e) => e.id === id); }
function res(id) { return S.data.resources.find((r) => r.id === id); }
function nameOf(id) {
  if (id === 'jay') return `${S.data.owner.name} 대표`;
  if (id === 'system') return '본사';
  return emp(id)?.name || '담당 미정';
}
function shortName(id) {
  if (id === 'jay') return '나';
  const e = emp(id);
  if (!e) return '미정';
  return e.name.replace(/ 멤버십.*$/, '').replace(/^내가 학습시킨 /, '');
}
function kindBadge(kind, imported, pasted) {
  if (imported) return h('span', { class: 'kind ghost' }, '가져옴');
  if (pasted) return h('span', { class: 'kind ghost' }, '붙여 넣음');
  if (kind === 'human') return h('span', { class: 'kind' }, '사람');
  if (kind === 'ai') return h('span', { class: 'kind ai' }, 'AI');
  return h('span', { class: 'kind sys' }, '본사');
}
function evidenceLink(file) {
  return file ? h('a', { class: 'evi', href: `/evidence/${encodeURIComponent(file)}`, target: '_blank', rel: 'noopener' }, '근거 보기') : null;
}
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 2600);
}
const ENGINE_LABEL = { web: '복사해서 맡기기', none: '스스로 보고 (MCP, CLI)', local: '로컬 모델', claude: 'Claude Code', codex: 'Codex', agy: 'agy', script: '자동화' };
// 등록 파일(automations.json)에 있는 자동화. 직원 하나가 하나를 맡는다.
const automationList = () => (S.automations && S.automations.list) || [];
const automationOf = (e) => automationList().find((a) => a.id === e.automation) || null;
const RUN_LABEL = { off: '꺼짐', manual: '누를 때만', auto: '자동 실행' };
// 이 앱이 직접 일을 시킬 수 있는가 (로컬 모델, 또는 이 맥에 설치된 Claude Code, Codex)
function canRun(e) {
  if (!e || e.runMode === 'off') return false;
  if (e.engine === 'local') return Boolean(e.model);
  if (e.engine === 'script') return Boolean(automationOf(e));
  if (['claude', 'codex', 'agy'].includes(e.engine)) return Boolean(S.runners[e.engine]);
  return false;
}
const isWorking = (id) => S.working.some((w) => w.emp === id);
const features = () => S.data.settings.features || {};

async function api(method, url, body) {
  const r = await fetch(url, {
    method, credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-HQ-UI': '1' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try { json = await r.json(); } catch { /* 빈 응답 */ }
  if (r.status === 401) {
    toast('사람 세션이 없습니다. 화면을 새로고침합니다.');
    setTimeout(() => location.reload(), 1200);
    throw new Error('session');
  }
  if (!r.ok) { const msg = json?.error || `오류 ${r.status}`; toast(msg); throw new Error(msg); }
  return json;
}
async function act(method, url, body, okMsg) {
  try {
    const r = await api(method, url, body);
    if (okMsg) toast(okMsg);
    await load();
    return r;
  } catch {
    return null;
  }
}

// ───────── 불러오기와 다시 그리기 ─────────

async function load() {
  const r = await fetch('/api/state', { credentials: 'same-origin' });
  S = await r.json();
  render();
}

function snapshotInputs() {
  const snap = new Map();
  for (const el of document.querySelectorAll('[data-k]')) {
    snap.set(el.dataset.k, { value: el.value, open: el.open, focused: document.activeElement === el, s: el.selectionStart, e: el.selectionEnd });
  }
  return snap;
}
function restoreInputs(snap) {
  for (const el of document.querySelectorAll('[data-k]')) {
    const v = snap.get(el.dataset.k);
    if (!v) continue;
    if (el.tagName === 'DETAILS') { el.open = v.open; continue; }
    if (el.type === 'checkbox') continue;
    if (el.dataset.fresh !== '1') el.value = v.value;
    if (v.focused) { el.focus(); try { el.setSelectionRange(v.s, v.e); } catch { /* select */ } }
  }
}

function render() {
  if (!S || (ui.drag && document.querySelector('.dragging')) || document.getElementById('dlg').open) return;
  ui.drag = false;
  const snap = snapshotInputs();
  const th = document.querySelector('.thread');
  const nearBottom = th ? th.scrollHeight - th.scrollTop - th.clientHeight < 60 : true;
  document.body.classList.toggle('onboarding', !S.data.settings.onboarded);
  renderNav();
  const page = document.getElementById('page');
  page.replaceChildren(pageFor(ui.route)());
  restoreInputs(snap);
  const th2 = document.querySelector('.thread');
  if (th2 && (nearBottom || ui.lastThread !== ui.open)) th2.scrollTop = th2.scrollHeight;
  ui.lastThread = ui.open;
}

const NAV = [['home', '내 할 일'], ['daily', '매일 할 일'], ['staff', '내 직원'], ['resources', '내 리소스']];
function hiddenOn() { return (window.HIDDEN || []).filter((x) => features()[x.flag]); }

function pageFor(route) {
  if (!S.data.settings.onboarded) return pageStart;
  const base = { home: pageHome, daily: pageDaily, staff: pageStaff, resources: pageResources }[route];
  if (base) return base;
  const hid = hiddenOn().find((x) => x.id === route);
  return hid ? hid.fn : pageHome;
}

function renderNav() {
  const d = S.data;
  const open = d.tasks.filter((t) => t.date <= S.today && t.status !== '완료').length;
  const waiting = d.tasks.filter((t) => t.gate && !t.gateApprovedAt && t.status !== '완료' && t.assignee !== 'jay').length + d.approvals.filter((a) => a.status === '대기').length;
  const items = [...NAV, ...hiddenOn().map((x) => [x.id, x.label])];
  document.getElementById('nav').replaceChildren(...items.map(([id, label]) => {
    let c = null;
    if (id === 'home' && (open || waiting)) c = h('span', { class: `cnt${waiting ? ' hot' : ''}`, title: waiting ? `대표 확인 ${waiting}건` : '' }, waiting || open);
    return h('a', { href: `#${id}`, class: ui.route === id ? 'on' : '', 'aria-current': ui.route === id ? 'page' : null }, h('span', null, label), c);
  }));
  document.getElementById('brand-sub').textContent = d.settings.companyName || (d.owner.name ? `${d.owner.name} 대표` : '');
  document.getElementById('side-foot').replaceChildren(
    h('div', null, `AI 직원 ${d.employees.length}명 · 자동 실행 ${d.employees.filter((e) => e.runMode === 'auto').length}명`),
    h('div', null, `알람 ${d.settings.alarmsEnabled ? '켜짐' : '꺼짐'}`));
}

function secHead(title, meta, ...actions) {
  return h('div', { class: 'sec-h' }, h('h2', null, title), h('div', { class: 'actions' }, meta ? h('span', { class: 'meta' }, meta) : null, ...actions));
}

// 한 번 눌러 담당 바꾸기 (끝에 직원 추가)
function assigneePicker(current, onPick) {
  const opts = [['jay', '나'], ...S.data.employees.map((e) => [e.id, shortName(e.id)])];
  return h('div', { class: 'picker', role: 'group', 'aria-label': '담당 고르기' }, opts.map(([id, label]) => h('button', {
    type: 'button', class: `chip${current === id ? ' on' : ''}`, 'aria-pressed': current === id ? 'true' : 'false',
    onclick: (ev) => { ev.stopPropagation(); onPick(id); },
  }, label)), h('button', { type: 'button', class: 'chip add', onclick: (ev) => { ev.stopPropagation(); openAddEmployee(); } }, '+ 직원 추가'));
}

const GRIP = () => {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 10 14');
  for (const [x, y] of [[2, 2], [8, 2], [2, 7], [8, 7], [2, 12], [8, 12]]) {
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('r', 1.3); c.setAttribute('fill', 'currentColor');
    svg.appendChild(c);
  }
  return svg;
};

// ───────── 할 일 줄 ─────────

function taskRow(t, { draggable = true } = {}) {
  const open = ui.open === t.id;
  const done = t.status === '완료';
  // 확인 버튼은 AI가 할 일에만 (내가 직접 하는 일은 내가 하는 것이 곧 확인)
  const gated = t.gate && !t.gateApprovedAt && !done && t.assignee !== 'jay';
  const e = emp(t.assignee);
  const thinking = S.assigning.includes(`task:${t.id}`);
  const li = h('li', { class: `task${done ? ' done' : ''}${open ? ' open' : ''}`, 'data-id': t.id });

  const chk = h('input', { type: 'checkbox', class: 'chk', checked: done, 'aria-label': `${t.title} 완료`,
    onchange: () => act('PATCH', `/api/ui/tasks/${t.id}`, { status: chk.checked ? '완료' : '대기' }) });
  const who = h('button', {
    class: `who-chip${t.assignee === 'jay' ? '' : t.assignee ? ' ai' : ' none'}`, 'aria-label': '담당 바꾸기', 'aria-expanded': ui.picking === t.id ? 'true' : 'false',
    onclick: (ev) => { ev.stopPropagation(); ui.picking = ui.picking === t.id ? null : t.id; render(); },
  }, t.assignee ? shortName(t.assignee) : '담당 미정');
  const msgs = S.data.messages.filter((m) => m.thread === `task:${t.id}` && m.fromKind !== 'system').length;
  const right = h('div', { class: 'right' },
    gated ? h('button', { class: 'btn sm dark', onclick: (ev) => { ev.stopPropagation(); if (confirm(`"${t.title}" 에 ${gateK(t.gate)} 들어 있습니다. AI가 진행해도 될까요?`)) act('POST', `/api/ui/tasks/${t.id}/approve-gate`, {}, `${gateO(t.gate)} 확인했습니다`); } }, `${t.gate} 확인`) : null,
    t.status === '진행' || t.status === '막힘' ? h('span', { class: `stat-pill ${t.status}` }, officeOf(t) && t.status === '진행' ? `${officeOf(t).name}에서 실행 중` : isWorking(t.assignee) && t.status === '진행' ? '일하는 중' : t.status) : null,
    msgs ? h('span', { class: 'small muted', title: '스레드 메시지' }, `대화 ${msgs}`) : null,
    who);
  const meta = [];
  if (t.reason) meta.push(thinking ? `${t.reason} · 다시 보는 중` : t.reason);
  if (t.resource && res(t.resource) && !(t.reason || '').includes(res(t.resource).name)) meta.push(res(t.resource).name);
  if (t.routineId) meta.push('매일');
  if (t.date !== S.today) meta.push(dateK(t.date));

  li.appendChild(h('div', { class: 'line', onclick: (ev) => { if (ev.target.closest('button,input,a')) return; ui.open = open ? null : t.id; ui.picking = null; render(); } },
    draggable ? h('button', { class: 'handle', 'aria-label': '끌어서 순서 바꾸기', title: '끌어서 순서 바꾸기' }, GRIP()) : h('span'),
    chk,
    h('span', { class: `time${t.time ? '' : ' none'}` }, t.time || '-'),
    h('div', { class: 'ttl' }, h('span', { class: 't' }, t.title), meta.length ? h('span', { class: 'note' }, meta.join(' · ')) : null),
    right));
  if (ui.picking === t.id) {
    li.appendChild(h('div', { class: 'pick-row' }, assigneePicker(t.assignee, (id) => { ui.picking = null; act('PATCH', `/api/ui/tasks/${t.id}`, { assignee: id }, `${shortName(id)}에게 맡겼습니다`); })));
  }
  if (open) li.appendChild(taskDetail(t, e));
  return li;
}

function taskDetail(t, e) {
  const f = {
    title: h('input', { class: 'in sm', value: t.title, 'data-k': `e-title-${t.id}`, 'aria-label': '제목' }),
    time: h('input', { class: 'in sm', type: 'time', value: t.time || '', 'data-k': `e-time-${t.id}`, 'aria-label': '시간' }),
    date: h('input', { class: 'in sm', type: 'date', value: t.date, 'data-k': `e-date-${t.id}`, 'aria-label': '날짜' }),
    note: h('textarea', { class: 'in', rows: 2, placeholder: '메모', 'data-k': `e-note-${t.id}`, 'aria-label': '메모' }, t.note || ''),
    resource: h('select', { class: 'in sm', 'data-k': `e-res-${t.id}`, 'aria-label': '리소스' }, h('option', { value: '' }, '리소스 없음'),
      S.data.resources.map((r) => h('option', { value: r.id, selected: t.resource === r.id }, `${r.name} · ${r.status}`))),
    gate: h('select', { class: 'in sm', 'data-k': `e-gate-${t.id}`, 'aria-label': '대표 확인' }, h('option', { value: '' }, '확인 필요 없음'),
      S.options.gates.map((g) => h('option', { value: g, selected: t.gate === g }, `${g} · 대표 확인 필요`))),
  };
  const save = () => act('PATCH', `/api/ui/tasks/${t.id}`, { title: f.title.value, time: f.time.value, date: f.date.value, note: f.note.value, resource: f.resource.value || null, ...(f.gate.value !== (t.gate || '') ? { gate: f.gate.value || null } : {}) }, '저장했습니다');
  f.title.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && !ev.isComposing) save(); });
  return h('div', { class: 'detail' },
    h('div', { class: 'd-grid' }, h('div', { class: 'span2' }, f.title), f.time, f.date, h('div', { class: 'span2' }, f.note), f.resource, f.gate),
    h('div', { class: 'd-who' }, h('span', { class: 'small muted' }, '담당'), assigneePicker(t.assignee, (id) => act('PATCH', `/api/ui/tasks/${t.id}`, { assignee: id }, `${shortName(id)}에게 맡겼습니다`))),
    h('div', { class: 'd-bar' },
      h('div', { class: 'row' },
        h('button', { class: 'btn sm', onclick: () => { if (confirm(`이 할 일을 지울까요?\n${t.title}`)) { ui.open = null; act('DELETE', `/api/ui/tasks/${t.id}`, undefined, '지웠습니다'); } } }, '지우기'),
        h('select', { class: 'in sm', style: 'width:96px', 'aria-label': '상태', onchange: (ev) => act('PATCH', `/api/ui/tasks/${t.id}`, { status: ev.target.value }) },
          S.options.statuses.map((s) => h('option', { value: s, selected: s === t.status }, s)))),
      h('div', { class: 'row' },
        h('button', { class: 'btn sm dark', onclick: save }, '저장'))),
    t.reasonBy && /로컬 AI/.test(t.reasonBy) ? h('div', { class: 'small muted' }, `배분을 다시 본 것: ${t.reasonBy.replace(/ \(규칙 유지\)/, '')}`) : null,
    officeBox(t, e),
    e && !t.officeRun ? workBox(t, e) : null,
    threadView(t));
}

// ───────── 사무실에서 실행 (배차) ─────────
const ACTIVE_REMOTE = ['sending', 'running', 'fetching'];
function officeOf(t) { return t.remote && ACTIVE_REMOTE.includes(t.remote.state) ? (S.offices || []).find((o) => o.id === t.remote.res) : null; }
function isOfficeRes(r) { return r && r.kind === '기계' && !r.isThisMac && r.sshAlias; }

// 리소스가 사무실 기계일 때만 보인다: 스위치 하나 + 일 종류 + 값 하나 + 상태 한 줄
function officeBox(t, e) {
  const r = res(t.resource);
  if (!isOfficeRes(r) || !e) return null;
  const o = (S.offices || []).find((x) => x.id === r.id);
  const active = t.remote && ACTIVE_REMOTE.includes(t.remote.state);
  const job = t.officeJob || { template: 'ai-text', params: {} };
  const allowed = o ? o.templates : ['ai-text'];
  const tplSel = h('select', { class: 'in sm', 'aria-label': '일 종류', disabled: active, 'data-k': `oj-t-${t.id}` },
    (S.officeTemplates || []).filter((x) => allowed.includes(x.key)).map((x) => h('option', { value: x.key, selected: job.template === x.key }, x.label)));
  const PARAM = { 'ffmpeg-test': ['seconds', '초 (1~10)'], 'remotion-render': ['composition', '컴포지션 이름'], 'blender-render': ['blend', 'render-node/…/파일.blend'] };
  const pk = PARAM[job.template];
  const param = pk ? h('input', { class: 'in sm', style: 'max-width:200px', 'data-k': `oj-p-${t.id}`, value: job.params?.[pk[0]] ?? '', placeholder: pk[1], 'aria-label': pk[1], disabled: active }) : null;
  const extra = job.template === 'remotion-render' ? h('input', { class: 'in sm', style: 'max-width:110px', 'data-k': `oj-f-${t.id}`, value: job.params?.frames || '', placeholder: '프레임 0-29', 'aria-label': '프레임', disabled: active })
    : job.template === 'blender-render' ? h('input', { class: 'in sm', style: 'max-width:90px', 'data-k': `oj-f-${t.id}`, value: job.params?.frame ?? '', placeholder: '프레임', 'aria-label': '프레임', disabled: active }) : null;
  const readJob = () => {
    const tpl = tplSel.value;
    const p = {};
    const k = PARAM[tpl];
    if (k && tpl === job.template && param) p[k[0]] = param.value.trim();
    if (tpl === 'remotion-render' && extra && tpl === job.template && extra.value.trim()) p.frames = extra.value.trim();
    if (tpl === 'blender-render' && extra && tpl === job.template && extra.value.trim()) p.frame = extra.value.trim();
    return { template: tpl, params: p };
  };
  tplSel.addEventListener('change', () => { if (tplSel.value !== job.template) act('PATCH', `/api/ui/tasks/${t.id}`, { officeJob: { template: tplSel.value, params: {} }, officeRun: false }); });
  const sw = h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: Boolean(t.officeRun), disabled: active,
    onchange: (ev) => act('PATCH', `/api/ui/tasks/${t.id}`, ev.target.checked ? { officeJob: readJob(), officeRun: true } : { officeRun: false }, ev.target.checked ? `${o ? o.name : r.name}에서 실행을 켰어요` : '껐어요') }),
  h('span', { class: 'tr' }), h('b', null, `${o ? o.name : r.name}에서 실행`));
  let line = '';
  const rm = t.remote;
  if (active) line = `${o ? o.name : ''}에서 실행 중${o && o.log ? ` · ${o.log}` : ''}`;
  else if (rm && ['retry', 'blocked'].includes(rm.state)) line = rm.reason;
  else if (rm && rm.state === 'done') line = `끝남 · ${stamp(rm.endedAt)}`;
  else if (rm && rm.state === 'failed') line = `멈춤 · ${rm.reason || ''}`;
  else if (t.officeRun) line = t.gate && !t.gateApprovedAt ? `${gateK(t.gate)} 들어간 일이라 대표 확인 뒤에 보내요` : t.status === '대기' ? '곧 보내요' : '';
  return h('div', { class: 'work' },
    h('div', { class: 'row' }, sw, tplSel, param, extra),
    line ? h('div', { class: 'small muted' }, line) : null);
}

// AI에게 일 시키기. 앱이 직접 실행할 수 있으면 실행 버튼, 아니면 복사해서 맡기기 (설치, 환경변수 없이)
function workBox(t, e) {
  if (t.status === '완료' && !ui.handout[t.id]) return null;
  const locked = t.gate && !t.gateApprovedAt;
  if (canRun(e)) {
    const local = e.engine === 'local';
    return h('div', { class: 'work' },
      h('div', { class: 'small' }, local ? `${e.name}: 이 맥 안에서 바로 답해요.` : e.engine === 'script' ? `${e.name}: 등록된 자동화(${automationOf(e).title})를 한 번 실행해요.` : `${e.name}: 이 맥에서 한 번 실행해요 (작업 폴더 workspaces/${e.id}).`),
      locked ? h('div', { class: 'small muted' }, `${gateK(t.gate)} 들어간 일이라 대표 확인 뒤에 시킬 수 있어요.`) : null,
      h('button', { class: 'btn dark', 'data-act': 'run', disabled: isWorking(e.id) || locked,
        onclick: () => { if (local || confirm(`${e.name}: 지금 한 번 실행할까요?`)) once(`run-${t.id}`, () => act('POST', `/api/ui/tasks/${t.id}/run`, {}, local ? `${josa(shortName(e.id), '이', '가')} 쓰는 중이에요` : `시켰습니다: ${e.name}`)); } },
      isWorking(e.id) ? (local ? '쓰는 중 · 보통 10~50초' : '일하는 중') : local ? '지금 답 받기' : `${shortName(e.id)} 한 번 실행`));
  }
  const ho = ui.handout[t.id];
  const url = ho?.url || e.webUrl || '';
  const paste = h('textarea', { class: 'in', rows: 4, 'data-k': `paste-${t.id}`, placeholder: `${shortName(e.id)}에게 받은 답을 여기에 붙여 넣으세요`, 'aria-label': '받은 답' });
  const doneBox = h('input', { type: 'checkbox', checked: true, 'aria-label': '끝난 일로 표시' });
  const getPrompt = () => once(`ho-${t.id}`, async () => {
    try {
      const r = await api('POST', `/api/ui/tasks/${t.id}/handout`, {});
      ui.handout[t.id] = r;
      const ok = await copyText(r.prompt);
      toast(ok ? `복사했어요. ${shortName(e.id)}에 붙여 넣으세요` : '아래 지시문을 길게 눌러 복사해 주세요');
      await load();
    } catch { /* toast 는 api 가 띄움 */ }
  });
  const savePaste = () => submitInput(paste, `paste-${t.id}`, (v) => act('POST', `/api/ui/tasks/${t.id}/paste`, { text: v, done: doneBox.checked }, '결과를 남겼어요'));
  return h('div', { class: 'work' },
    h('div', { class: 'small' }, h('b', null, '복사해서 맡기기'), ` · ${josa(e.name, '은', '는')} 이 앱 안에서 직접 답하지 않아요. 지시문을 복사해 ${url ? '열어서' : `${shortName(e.id)}에`} 붙여 넣고, 받은 답을 아래에 넣어 주세요.`),
    locked ? h('div', { class: 'small muted' }, `${gateK(t.gate)} 들어간 일이라 대표 확인 뒤에 맡길 수 있어요.`) : null,
    h('div', { class: 'row' },
      h('button', { class: 'btn dark', 'data-act': 'copy', disabled: locked, onclick: getPrompt }, ho ? '지시문 다시 복사' : '1. 지시문 복사'),
      url ? h('a', { class: 'btn', href: url, target: '_blank', rel: 'noopener noreferrer', 'data-act': 'open' }, `2. ${shortName(e.id)} 열기`) : null),
    ho ? h('details', { 'data-k': `ho-d-${t.id}` }, h('summary', null, '지시문 보기'), h('pre', { class: 'full' }, ho.prompt)) : null,
    paste,
    h('div', { class: 'row', style: 'justify-content:space-between' },
      h('label', { class: 'chk-l' }, doneBox, '끝난 일로 표시'),
      h('button', { class: 'btn dark', 'data-act': 'paste', onclick: savePaste }, `${url ? '3' : '2'}. 결과로 남기기`)));
}

// ───────── 할 일 스레드 ─────────

function msgView(m) {
  if (m.fromKind === 'system') return h('div', { class: 'm sys' }, `${m.text} · ${stamp(m.at)}`);
  const head = h('div', { class: 'by' }, h('b', null, m.from === 'jay' ? '나' : nameOf(m.from)), kindBadge(m.fromKind, m.imported, m.pasted), h('span', null, stamp(m.at)),
    m.kind === 'result' ? h('span', { class: 'tag' }, '결과') : null,
    m.kind === 'transcript' ? h('span', { class: 'tag' }, '작업 기록') : null,
    m.run ? h('span', null, [m.run.label, m.run.model ? `모델 ${m.run.model}` : ''].filter(Boolean).join(' · ')) : null);
  let body;
  if (m.kind === 'handoff' && m.handoff) {
    const hf = m.handoff;
    const kv = (k, v) => h('div', null, h('div', { class: 'k' }, k), h('div', { class: 'v' }, v || '-'));
    body = h('div', { class: 'handoff' },
      h('div', { class: 'small', style: 'font-weight:600' }, hf.to ? `인수인계 → ${nameOf(hf.to)}` : '인수인계 · 다음 담당을 골라 주세요'),
      h('div', { class: 'hf-grid' }, kv('한 것', hf.done), kv('멈춘 곳', hf.stuck), kv('이유', hf.why), hf.model ? kv('모델', hf.model) : null,
        h('div', null, h('div', { class: 'k' }, '파일'), hf.files?.length ? h('ul', { class: 'files' }, hf.files.map((x) => h('li', null, x))) : h('div', { class: 'v' }, '-'))));
  } else if (m.kind === 'transcript') {
    body = h('div', null, h('div', { class: 'body clamp' }, m.summary || ''),
      h('details', { 'data-k': `tr-${m.id}` }, h('summary', null, `전체 보기${m.fileName ? ` · ${m.fileName}` : ''}`), h('pre', { class: 'full' }, m.text)));
  } else if (m.kind === 'approval') {
    const a = S.data.approvals.find((x) => x.id === m.approvalId);
    body = h('div', { class: 'handoff' }, h('div', { class: 'body' }, m.text),
      a && a.status === '대기'
        ? h('div', { class: 'row', style: 'margin-top:10px' },
          h('button', { class: 'btn sm', onclick: () => act('POST', `/api/ui/approvals/${a.id}/decide`, { decision: '반려' }, '반려했습니다') }, '반려'),
          h('button', { class: 'btn sm dark', onclick: () => act('POST', `/api/ui/approvals/${a.id}/decide`, { decision: '승인' }, '승인했습니다') }, '승인'))
        : h('div', { class: 'small muted', style: 'margin-top:6px' }, a ? `${a.status}${a.decidedAt ? ` · ${stamp(a.decidedAt)}` : ''}` : ''));
  } else {
    const long = m.text.length > 600;
    body = h('div', null, h('div', { class: `body${long ? ' clamp' : ''}` }, long ? m.text.slice(0, 600) : m.text),
      long ? h('details', { 'data-k': `long-${m.id}` }, h('summary', null, '전체 보기'), h('pre', { class: 'full' }, m.text)) : null,
      m.link ? h('a', { class: 'evi', href: m.link, target: '_blank', rel: 'noopener noreferrer' }, m.link) : null);
  }
  return h('div', { class: `m${m.from === 'jay' ? ' me' : ''}` }, head, body);
}

function threadView(t) {
  const list = S.data.messages.filter((m) => m.thread === `task:${t.id}`);
  const typing = S.working.filter((w) => w.thread === `task:${t.id}`).map((w) => (w.kind === 'office' ? `${w.office}에서 실행 중 · ${nameOf(w.emp)}` : `${nameOf(w.emp)} ${w.kind === 'local' ? '쓰는 중' : '일하는 중'}`));
  const a = emp(t.assignee);
  const replies = a && a.engine === 'local' && a.model;
  const ta = h('textarea', { class: 'in', rows: 2, 'data-k': `compose-${t.id}`, 'aria-label': '스레드 메시지',
    placeholder: a ? (replies ? `${nameOf(t.assignee)}에게 (다른 직원은 @이름)` : `메모 남기기 · ${josa(shortName(t.assignee), '은', '는')} 여기서 답하지 않아요`) : '메모나 메시지 (@이름 으로 부르기)' });
  const sendMsg = async () => {
    const r = await submitInput(ta, `msg-${t.id}`, (v) => act('POST', `/api/ui/tasks/${t.id}/messages`, { text: v }));
    if (r) document.querySelector(`[data-k="compose-${t.id}"]`)?.focus();
  };
  ta.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) sendMsg(); });
  return h('div', { class: 'thread-box' },
    h('div', { class: 'small', style: 'font-weight:600;margin-bottom:8px' }, `스레드${list.length ? ` · ${list.filter((m) => m.fromKind !== 'system').length}` : ''}`),
    h('div', { class: 'thread' }, list.length ? list.map(msgView) : h('div', { class: 'small muted' }, '아직 대화가 없습니다. 이 일에 대한 모든 직원의 대화가 여기에 모입니다.')),
    typing.length ? h('div', { class: 'typing' }, typing.join(' · ')) : null,
    h('div', { class: 'compose' }, ta,
      h('div', { class: 'row', style: 'justify-content:space-between' },
        h('button', { class: 'btn sm', onclick: () => openImport(t) }, '대화 가져오기'),
        h('button', { class: 'btn sm dark', onclick: sendMsg }, '보내기'))));
}

function openImport(t) {
  const dlg = document.getElementById('dlg');
  const who = h('select', { class: 'in', 'aria-label': '누구의 대화' }, S.data.employees.map((e) => h('option', { value: e.id, selected: e.id === t.assignee }, e.name)));
  const body = h('textarea', { class: 'in', rows: 8, placeholder: '피클, Muse, ChatGPT 앱 등에서 나눈 대화를 붙여 넣으세요', 'aria-label': '대화 내용' });
  const link = h('input', { class: 'in', placeholder: '공유 링크 (선택, https)', 'aria-label': '공유 링크' });
  dlg.replaceChildren(
    h('h3', null, '대화 가져오기'),
    h('p', { class: 'small muted', style: 'margin:-8px 0 16px' }, `할 일 "${t.title}" 스레드에 그 직원의 메시지로 남고, 가져옴 표시가 붙습니다.`),
    h('label', { class: 'field' }, '누구와의 대화', who),
    h('label', { class: 'field', style: 'margin-top:12px' }, '대화 내용', body),
    h('label', { class: 'field', style: 'margin-top:12px' }, '공유 링크', link),
    h('div', { class: 'bar' },
      h('button', { class: 'btn', onclick: () => { dlg.close(); render(); } }, '취소'),
      h('button', { class: 'btn dark', onclick: () => once(`imp-${t.id}`, async () => { dlg.close(); await act('POST', `/api/ui/tasks/${t.id}/import`, { emp: who.value, text: body.value, link: link.value }, '대화를 가져왔습니다'); }) }, '가져오기')));
  dlg.showModal();
  body.focus();
}

function taskList(list, opts = {}) {
  const ul = h('ul', { class: 'tasks' }, list.map((t) => taskRow(t, opts)));
  if (opts.draggable !== false) enableDrag(ul);
  return ul;
}

function enableDrag(ul) {
  ul.addEventListener('pointerdown', (e) => {
    const hd = e.target.closest('.handle');
    if (!hd) return;
    const li = hd.closest('li.task');
    e.preventDefault();
    // 줄을 옮기면 손잡이가 DOM 에서 잠깐 빠지므로, 포인터는 목록(ul)이 붙잡는다
    ul.setPointerCapture(e.pointerId);
    ui.drag = true;
    li.classList.add('dragging');
    const before = [...ul.children].map((x) => x.dataset.id).join();
    const move = (ev) => {
      const sibs = [...ul.querySelectorAll(':scope > li.task')].filter((x) => x !== li);
      let placed = false;
      for (const sb of sibs) {
        const r = sb.getBoundingClientRect();
        if (ev.clientY < r.top + r.height / 2) { if (li.nextSibling !== sb) ul.insertBefore(li, sb); placed = true; break; }
      }
      if (!placed && ul.lastElementChild !== li) ul.appendChild(li);
    };
    const up = async () => {
      ul.removeEventListener('pointermove', move);
      li.classList.remove('dragging');
      ui.drag = false;
      const ids = [...ul.children].map((x) => x.dataset.id);
      if (ids.join() !== before) await act('POST', '/api/ui/tasks/reorder', { ids });
    };
    let ended = false;
    const end = () => { if (ended) return; ended = true; up(); };
    ul.addEventListener('pointermove', move);
    ul.addEventListener('pointerup', end, { once: true });
    ul.addEventListener('pointercancel', end, { once: true });
    ul.addEventListener('lostpointercapture', end, { once: true });
  });
}

// ───────── 음성 (보조) ─────────

let recog = null;
function toggleMic(input) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { toast('이 브라우저는 음성 인식을 지원하지 않습니다'); return; }
  if (ui.listening && recog) { recog.stop(); return; }
  recog = new SR();
  recog.lang = 'ko-KR';
  recog.interimResults = true;
  recog.continuous = false;
  recog.onresult = (e) => {
    let s = '';
    for (let i = 0; i < e.results.length; i++) s += e.results[i][0].transcript;
    const el = document.querySelector('[data-k="add-title"]') || input;
    el.value = s;
  };
  recog.onend = () => { ui.listening = false; render(); };
  recog.onerror = (e) => toast(e.error === 'not-allowed' ? '마이크 권한이 필요합니다' : `음성 인식 오류: ${e.error}`);
  recog.start();
  ui.listening = true;
  render();
}

const MIC_SVG = () => {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '1.5');
  for (const d of ['M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z', 'M5.5 11.5a6.5 6.5 0 0 0 13 0', 'M12 18v3']) {
    const p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); p.setAttribute('stroke-linecap', 'round'); svg.appendChild(p);
  }
  return svg;
};

// ───────── 내 할 일 (홈) ─────────

function greeting() {
  const hr = new Date().getHours();
  if (hr < 5) return '늦은 밤입니다';
  if (hr < 12) return '좋은 아침입니다';
  if (hr < 18) return '좋은 오후입니다';
  return '좋은 저녁입니다';
}

function addBar() {
  const title = h('input', { class: 'in big', placeholder: '할 일을 적으면 알아서 배분합니다', 'data-k': 'add-title', 'aria-label': '새 할 일' });
  const time = h('input', { class: 'in big', type: 'time', 'data-k': 'add-time', 'aria-label': '시간 (선택)' });
  const add = async () => {
    const tm = time.value;
    const r = await submitInput(title, 'add-task', (v) => { time.value = ''; return act('POST', '/api/ui/tasks', { title: v, time: tm, date: S.today }); });
    if (r) {
      toast(r.reason || '추가했어요');
      document.querySelector('[data-k="add-title"]')?.focus();
    }
  };
  title.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) add(); });
  return h('div', { class: 'addbar' },
    title, time,
    h('button', { class: `mic-sm${ui.listening ? ' on' : ''}`, 'aria-label': ui.listening ? '듣기 멈추기' : '말로 적기', 'aria-pressed': ui.listening ? 'true' : 'false', title: '말로 적기', onclick: () => toggleMic(title) }, MIC_SVG()),
    h('button', { class: 'btn dark big', onclick: add }, '추가'));
}

function workBlocks(empId) {
  const start = new Date(`${S.today}T00:00:00`).getTime();
  const end = start + 86400000;
  const now = Date.now();
  const toMin = (ms) => Math.max(0, Math.min(1440, (ms - start) / 60000));
  const blocks = [];
  for (const t of S.data.tasks) {
    let open = null;
    for (const hs of t.history || []) {
      const at = Date.parse(hs.at);
      if (hs.by !== empId) { if (open !== null && hs.status !== '진행') { blocks.push([open, at, t.title]); open = null; } continue; }
      if (hs.status === '진행') { if (open === null) open = at; } else if (open !== null) { blocks.push([open, at, t.title]); open = null; } else if (hs.status === '완료') blocks.push([at - 5 * 60000, at, t.title]);
    }
    if (open !== null) blocks.push([open, now, t.title]);
  }
  for (const w of S.data.worklog || []) if (w.emp === empId) blocks.push([Date.parse(w.start), Date.parse(w.end), w.label]);
  for (const w of S.working) if (w.emp === empId) blocks.push([Date.parse(w.since), now, '일하는 중']);
  return blocks.filter(([a, b]) => b > start && a < end).map(([a, b, label]) => ({ start: toMin(a), end: toMin(b), label }));
}

function timeline() {
  const nowMin = (Date.now() - new Date(`${S.today}T00:00:00`).getTime()) / 60000;
  const any = S.data.employees.some((e) => workBlocks(e.id).length);
  return h('section', { class: 'sec small-sec' },
    secHead('AI 직원 근무', any ? '오늘 · 검정 = 일한 시간' : '오늘 아직 일한 기록 없음'),
    h('div', { class: 'tl' },
      h('div', { class: 'tl-axis' }, h('span'), h('div', { class: 'ticks' }, ['0', '6', '12', '18', '24'].map((x, i) => h('span', { style: `left:${i * 25}%` }, x)))),
      S.data.employees.map((e) => h('div', { class: 'tl-row' }, h('div', { class: 'nm', title: e.name }, shortName(e.id)), C.timelineRow(workBlocks(e.id), nowMin)))));
}

function recentTalk() {
  const list = S.data.messages.filter((m) => m.fromKind !== 'system' && m.thread.startsWith('task:')).slice(-5).reverse();
  return h('section', { class: 'sec small-sec' }, secHead('최근 대화'),
    list.length ? h('ul', { class: 'list' }, list.map((m) => {
      const tid = m.thread.slice(5);
      const t = S.data.tasks.find((x) => x.id === tid);
      const txt = m.kind === 'handoff' ? '인수인계를 남김' : m.kind === 'transcript' ? (m.summary || '작업 기록') : m.text;
      return h('li', null, h('div', { class: 'main' },
        h('div', { class: 't' }, h('b', { style: 'font-weight:600' }, m.from === 'jay' ? '나' : shortName(m.from)), ' ', txt.length > 70 ? `${txt.slice(0, 70)}…` : txt),
        h('div', { class: 's' }, `${t ? t.title : tid} · ${stamp(m.at)}`)),
      h('button', { class: 'btn sm', onclick: () => { ui.open = tid; ui.route = 'home'; render(); document.querySelector(`li[data-id="${tid}"]`)?.scrollIntoView({ block: 'center' }); } }, '열기'));
    })) : h('div', { class: 'empty' }, '아직 대화가 없습니다'));
}

// 오늘 목록: 끝난 일은 접고, 30개가 넘으면 담당별로 나눈다
function todayList(today) {
  const open = today.filter((t) => t.status !== '완료');
  const done = today.filter((t) => t.status === '완료');
  const doneBox = done.length ? h('details', { class: 'done-box', 'data-k': 'done-box' }, h('summary', null, `끝난 일 ${done.length}개`), taskList(done, { draggable: false })) : null;
  if (today.length <= 30) return h('div', null, open.length ? taskList(open) : h('div', { class: 'empty' }, '남은 일이 없습니다.'), doneBox);
  const order = ['jay', ...S.data.employees.map((e) => e.id), null];
  const keyOf = (t) => (t.assignee === 'jay' || emp(t.assignee) ? t.assignee : null);
  const groups = order.map((id) => [id, open.filter((t) => keyOf(t) === id)]).filter(([, l]) => l.length);
  return h('div', null,
    groups.map(([id, list]) => h('div', { class: 'grp-list' }, h('div', { class: 'grp-name' }, `${id === 'jay' ? '나' : id ? shortName(id) : '담당 미정'} · ${list.length}`), taskList(list))),
    doneBox);
}

function pageHome() {
  const d = S.data;
  const day = new Date(`${S.today}T12:00:00`);
  const sorter = (a, b) => a.order - b.order;
  const today = d.tasks.filter((t) => t.date === S.today).sort(sorter);
  const overdue = d.tasks.filter((t) => t.date < S.today && t.status !== '완료').sort((a, b) => a.date.localeCompare(b.date) || sorter(a, b));
  const later = d.tasks.filter((t) => t.date > S.today).sort((a, b) => a.date.localeCompare(b.date) || sorter(a, b)).slice(0, 20);
  const freeAppr = d.approvals.filter((a) => a.status === '대기' && !a.taskId);
  const mine = today.filter((t) => t.assignee === 'jay');
  const ai = today.filter((t) => t.assignee !== 'jay');
  return h('div', null,
    h('div', { class: 'head' }, h('div', null,
      h('h1', null, `${greeting()}, `, h('b', null, `${d.owner.name} 대표님`)),
      h('div', { class: 'sub' }, `${day.getMonth() + 1}월 ${day.getDate()}일 ${WD[day.getDay()]}요일 · 내가 할 일 ${mine.filter((t) => t.status !== '완료').length} · AI 직원이 할 일 ${ai.filter((t) => t.status !== '완료').length}`))),
    addBar(),
    h('p', { class: 'rule' }, '결제, 업로드, 게시, 삭제, 메시지 발송이 들어간 일은 대표가 누를 때까지 AI가 시작하지 못합니다.'),
    !d.employees.length ? h('div', { class: 'callout' },
      h('div', null, h('b', null, '먼저 쓰는 AI를 직원으로 추가하세요.'), h('div', { class: 'small muted' }, 'ChatGPT, Claude, Gemini 처럼 이미 쓰는 AI를 고르면, 적은 일을 알맞은 AI에게 나눠 줍니다.')),
      h('button', { class: 'btn dark', onclick: openAddEmployee }, '직원 추가')) : null,
    freeAppr.length ? h('section', { class: 'sec' }, secHead('대표 확인 대기', `${freeAppr.length}건`),
      h('ul', { class: 'list' }, freeAppr.map((a) => h('li', null, h('div', { class: 'main' }, h('div', { class: 't' }, a.what), h('div', { class: 's' }, `${a.kind} · ${nameOf(a.from)} · ${stamp(a.requestedAt)}`)),
        h('div', { class: 'row' },
          h('button', { class: 'btn sm', onclick: () => act('POST', `/api/ui/approvals/${a.id}/decide`, { decision: '반려' }, '반려했습니다') }, '반려'),
          h('button', { class: 'btn sm dark', onclick: () => act('POST', `/api/ui/approvals/${a.id}/decide`, { decision: '승인' }, '승인했습니다') }, '승인')))))) : null,
    overdue.length ? h('section', { class: 'sec' }, secHead('지난 날짜, 아직 안 끝남', `${overdue.length}개`), taskList(overdue, { draggable: false })) : null,
    h('section', { class: 'sec' }, secHead(`오늘 · ${dateK(S.today)}`, `${today.filter((t) => t.status === '완료').length}/${today.length} 완료`),
      today.length ? todayList(today) : h('div', { class: 'empty' }, '오늘 할 일이 없습니다. 위에 적어 보세요.')),
    later.length ? h('section', { class: 'sec' }, secHead('예정', `${later.length}개`), taskList(later, { draggable: false })) : null,
    h('div', { class: 'cols home-foot' }, timeline(), recentTalk()));
}

// ───────── 매일 할 일 ─────────

function dayPicker(selected) {
  const state = new Set(selected);
  const wrap = h('div', { class: 'days', role: 'group', 'aria-label': '요일' });
  WD.forEach((w, i) => {
    const b = h('button', { type: 'button', class: `chip${state.has(i) ? ' on' : ''}`, 'aria-pressed': state.has(i) ? 'true' : 'false',
      onclick: () => { if (state.has(i)) state.delete(i); else state.add(i); b.classList.toggle('on'); b.setAttribute('aria-pressed', state.has(i) ? 'true' : 'false'); } }, w);
    wrap.appendChild(b);
  });
  wrap.getDays = () => [...state].sort();
  return wrap;
}

function daysText(days) {
  if (days.length === 7) return '매일';
  if (days.join() === '1,2,3,4,5') return '월~금';
  if (days.join() === '0,6') return '주말';
  return days.map((x) => WD[x]).join(' ');
}

function pageDaily() {
  const d = S.data;
  const visible = d.routines.filter((r) => !r.feature || features()[r.feature]);
  const title = h('input', { class: 'in', placeholder: '매일 할 일 (알아서 배분합니다)', 'data-k': 'rt-title', 'aria-label': '매일 할 일' });
  const time = h('input', { class: 'in', type: 'time', 'data-k': 'rt-time', style: 'width:130px', 'aria-label': '시간' });
  const days = dayPicker([0, 1, 2, 3, 4, 5, 6]);
  const add = async () => {
    const tm = time.value;
    const r = await submitInput(title, 'add-routine', (v) => { time.value = ''; return act('POST', '/api/ui/routines', { title: v, time: tm, days: days.getDays() }); });
    if (r) toast(r.reason || '추가했어요');
  };
  title.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) add(); });

  const row = (r) => {
    const e = emp(r.assignee);
    const human = r.assignee === 'jay';
    const autoText = human ? null : !e ? '담당을 고르면 매일 아침 그 직원의 할 일로 들어갑니다'
      : e.runMode === 'auto' && canRun(e) ? '자동 실행 · 시간이 되면 혼자 시작합니다'
        : `할 일로만 들어감 · ${e.name} 자동 실행 ${RUN_LABEL[e.runMode]}`;
    const ins = h('textarea', { class: 'in', rows: 6, 'data-k': `rt-ins-${r.id}`, placeholder: 'AI 직원이 따를 지시서', 'aria-label': '지시서' }, r.instruction || '');
    return h('li', { class: `routine${r.enabled === false ? ' off' : ''}` },
      h('div', { class: 'r-top' },
        h('div', { class: 'r-main' },
          h('div', { class: 'r-title' }, r.title),
          h('div', { class: 'small muted' }, [daysText(r.days), r.time || '시간 없음', r.where, res(r.resource)?.name].filter(Boolean).join(' · '))),
        h('div', { class: 'r-ctl' },
          human ? h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: r.alarm, onchange: (ev) => act('PATCH', `/api/ui/routines/${r.id}`, { alarm: ev.target.checked }) }), h('span', { class: 'tr' }), '알람') : null,
          h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: r.enabled !== false, onchange: (ev) => act('PATCH', `/api/ui/routines/${r.id}`, { enabled: ev.target.checked }) }), h('span', { class: 'tr' }), '켜짐'),
          h('button', { class: 'x', 'aria-label': `${r.title} 지우기`, onclick: () => { if (confirm(`이 매일 할 일을 지울까요?\n${r.title}`)) act('DELETE', `/api/ui/routines/${r.id}`, undefined, '지웠습니다'); } }, '×'))),
      h('div', { class: 'r-who' }, assigneePicker(r.assignee, (id) => act('PATCH', `/api/ui/routines/${r.id}`, { assignee: id }, `${shortName(id)}에게 맡겼습니다`))),
      h('div', { class: 'small muted', style: 'margin-top:6px' }, [r.reason, autoText].filter(Boolean).join(' · ')),
      !human ? h('details', { 'data-k': `rt-d-${r.id}`, style: 'margin-top:10px' }, h('summary', null, r.instruction ? '지시서' : '지시서 쓰기'), ins,
        h('div', { class: 'row', style: 'justify-content:flex-end;margin-top:8px' }, h('button', { class: 'btn sm dark', onclick: () => act('PATCH', `/api/ui/routines/${r.id}`, { instruction: ins.value }, '지시서를 저장했습니다') }, '저장'))) : null);
  };
  const people = visible.filter((r) => r.assignee === 'jay');
  const ais = visible.filter((r) => r.assignee !== 'jay');
  return h('div', null,
    h('div', { class: 'head' }, h('div', null, h('h1', null, h('b', null, '매일 할 일')),
      h('div', { class: 'sub' }, '켜 둔 매일 할 일은 매일 아침 담당이 정해진 채 오늘 할 일로 들어갑니다.')),
    h('div', { class: 'row' },
      h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: d.settings.alarmsEnabled, onchange: (ev) => act('PATCH', '/api/ui/settings', { alarmsEnabled: ev.target.checked }, ev.target.checked ? '알람을 켰습니다' : '알람을 껐습니다') }), h('span', { class: 'tr' }), h('b', null, '맥 알람')),
      h('button', { class: 'btn sm', onclick: () => act('POST', '/api/ui/alarms/test', {}, '시험 알림을 보냈습니다') }, '알림 시험'))),
    h('div', { class: 'addbar slim' }, title, time, h('button', { class: 'btn dark', onclick: add }, '추가')),
    h('div', { style: 'margin-top:10px' }, days),
    h('section', { class: 'sec' }, secHead('내가 매일 할 일', `${people.length}개 · 알람은 정한 시각에 이 맥에 뜹니다`), people.length ? h('ul', { class: 'routines' }, people.map(row)) : h('div', { class: 'empty' }, '없습니다')),
    h('section', { class: 'sec' }, secHead('AI 직원이 매일 할 일', `${ais.length}개`), ais.length ? h('ul', { class: 'routines' }, ais.map(row)) : h('div', { class: 'empty' }, '없습니다. 위에 적으면 맞는 AI 직원에게 배분합니다.')));
}

// ───────── 내 직원 ─────────

async function ensureModels() {
  if (ui.models) return;
  ui.models = [];
  try { ui.models = await (await fetch('/api/models')).json(); } catch { ui.models = []; }
  render();
}

function empCard(e) {
  const editing = ui.editingEmp === e.id;
  const openEdit = (field) => { ui.editingEmp = e.id; render(); setTimeout(() => document.querySelector(`[data-k="emp-${field}-${e.id}"]`)?.focus(), 0); };
  const valOr = (v, field) => (v ? v : h('button', { class: 'input-me', onclick: () => openEdit(field) }, '입력'));
  const today = S.data.tasks.filter((t) => t.date === S.today && t.assignee === e.id);
  if (!editing) {
    const how = engineText(e);
    const runSeg = h('div', { class: 'seg', role: 'group', 'aria-label': '실행 방식' }, S.options.runModes.map((m) => h('button', {
      type: 'button', class: e.runMode === m ? 'on' : '', 'aria-pressed': e.runMode === m ? 'true' : 'false', disabled: ['none', 'web'].includes(e.engine) && m !== 'off',
      onclick: () => act('PATCH', `/api/ui/employees/${e.id}`, { runMode: m }, `${e.name}: ${RUN_LABEL[m]}`),
    }, RUN_LABEL[m])));
    return h('div', { class: 'card' },
      h('div', { class: 'row', style: 'justify-content:space-between;align-items:flex-start' },
        h('div', null, h('h3', null, e.name), h('div', { class: 'small muted' }, how), modelLine(e)),
        isWorking(e.id) ? h('span', { class: 'tag solid' }, '일하는 중') : today.length ? h('span', { class: 'tag' }, `오늘 ${today.length}`) : null),
      h('dl', { class: 'kv' },
        h('dt', null, '역할'), h('dd', null, valOr(e.role, 'role')),
        h('dt', null, '도구'), h('dd', null, valOr(e.tools.join(', '), 'tools')),
        h('dt', null, '업무 매뉴얼'), h('dd', null, e.manual ? h('span', { class: 'clamp2' }, e.manual) : valOr('', 'manual')),
        h('dt', null, '월급'), h('dd', null, e.salary === null || e.salary === undefined ? valOr('', 'salary') : e.salary === 0 ? '무료' : `월 ${won(e.salary)}`),
        h('dt', null, '리소스'), h('dd', null, e.resources.length ? e.resources.map((id) => res(id)?.name).filter(Boolean).join(', ') : valOr('', 'res')),
        h('dt', null, '근무'), h('dd', null, [e.runsOn, e.command].filter(Boolean).join(' · ') || valOr('', 'runsOn'))),
      h('div', { class: 'foot' }, ['none', 'web'].includes(e.engine) ? h('span', { class: 'small muted' }, e.engine === 'web' ? '할 일에서 복사해서 맡겨요' : 'MCP, CLI 로 스스로 보고') : runSeg, h('button', { class: 'btn sm', onclick: () => { ui.editingEmp = e.id; render(); } }, '편집')));
  }
  if (e.engine === 'local') ensureModels();
  const k = (f) => `emp-${f}-${e.id}`;
  const resBoxes = S.data.resources.map((r) => h('label', { class: 'chk-l' }, h('input', { type: 'checkbox', value: r.id, checked: e.resources.includes(r.id), class: 'res-box' }), `${r.name}`));
  const f = {
    role: h('input', { class: 'in sm', value: e.role, 'data-k': k('role') }),
    tools: h('input', { class: 'in sm', value: e.tools.join(', '), placeholder: '쉼표로 구분', 'data-k': k('tools') }),
    runsOn: h('input', { class: 'in sm', value: e.runsOn, 'data-k': k('runsOn') }),
    command: h('input', { class: 'in sm', value: e.command, 'data-k': k('command') }),
    salary: h('input', { class: 'in sm', value: e.salary === null || e.salary === undefined ? '' : String(e.salary), inputmode: 'numeric', placeholder: '원 단위, 무료는 0', 'data-k': k('salary') }),
    engine: h('select', { class: 'in sm', 'data-k': k('engine'), onchange: (ev) => { e.engine = ev.target.value; render(); } },
      [['web', '복사해서 맡기기 (ChatGPT, Claude, Gemini 웹 등)'], ['local', '로컬 모델 (이 맥 안에서 바로 답)'],
        ['claude', `Claude Code (${S.runners.claude ? '이 맥에 설치됨' : '이 맥에 없음'})`], ['codex', `Codex (${S.runners.codex ? '이 맥에 설치됨' : '이 맥에 없음'})`],
        ['none', '스스로 보고 (MCP, CLI 로 연결한 AI)'], ...(S.runners.agy || e.engine === 'agy' ? [['agy', 'agy']] : []),
        ...(automationList().length || e.engine === 'script' ? [['script', '자동화 (등록된 명령을 실행)']] : [])].map(([v, t]) => h('option', { value: v, selected: e.engine === v }, t))),
    webUrl: h('input', { class: 'in sm', value: e.webUrl || '', placeholder: 'https://', 'data-k': k('webUrl') }),
    model: h('select', { class: 'in sm', 'data-k': k('model') }, h('option', { value: '' }, ui.models && ui.models.length ? '모델 고르기' : '로컬 모델을 찾는 중이거나 없음'),
      (ui.models || []).map((m) => h('option', { value: m.id, selected: e.model === m.id }, `${m.label}${m.size ? ` · ${m.size}` : ''}`))),
    automation: h('select', { class: 'in sm', 'data-k': k('automation') }, h('option', { value: '' }, automationList().length ? '자동화 고르기' : '등록된 자동화가 없음'),
      automationList().map((a) => h('option', { value: a.id, selected: e.automation === a.id }, a.title))),
    manual: h('textarea', { class: 'in', rows: 6, 'data-k': k('manual'), placeholder: '이 직원이 일하는 방식, 말투, 하지 말아야 할 것' }, e.manual || ''),
  };
  const fld = (label, el) => h('label', { class: 'field' }, label, el);
  const save = async () => {
    const r = await act('PATCH', `/api/ui/employees/${e.id}`, {
      role: f.role.value, tools: f.tools.value, runsOn: f.runsOn.value, command: f.command.value,
      salary: f.salary.value.trim() === '' ? null : f.salary.value, engine: f.engine.value,
      model: f.engine.value === 'local' ? f.model.value : undefined, manual: f.manual.value,
      automation: f.engine.value === 'script' ? f.automation.value : undefined,
      webUrl: f.engine.value === 'web' ? f.webUrl.value : undefined,
      resources: [...document.querySelectorAll('.res-box')].filter((x) => x.checked).map((x) => x.value),
    }, '저장했습니다');
    if (r) { ui.editingEmp = null; render(); }
  };
  return h('div', { class: 'card wide' },
    h('h3', null, `${e.name} 편집`),
    h('div', { class: 'f-grid' }, fld('역할', f.role), fld('도구', f.tools), fld('근무 위치', f.runsOn), fld('명령 방법', f.command), fld('월급 (월, 원)', f.salary), fld('일 시키는 방법', f.engine), e.engine === 'local' ? fld('로컬 모델', f.model) : null, e.engine === 'script' ? fld('자동화', f.automation) : null, e.engine === 'web' ? fld('열 주소 (선택)', f.webUrl) : null),
    h('div', { style: 'margin-top:16px' }, h('div', { class: 'small', style: 'color:#555;margin-bottom:6px' }, '쓸 수 있는 리소스'), h('div', { class: 'chk-wrap' }, resBoxes)),
    h('div', { style: 'margin-top:16px' }, fld('업무 매뉴얼', f.manual), h('div', { class: 'warn' }, '비밀번호, 인증 코드, 카드 번호는 여기에 쓰지 마세요. 이 글은 AI에게 그대로 전달됩니다.')),
    e.engine === 'script' ? h('p', { class: 'small muted' }, `실행하면 등록된 명령을 그대로 돌립니다. 할 일의 글은 명령에 들어가지 않아요. 명령은 화면에서 바꿀 수 없고 등록 파일에서만 바꿉니다: ${(S.automations && S.automations.file) || 'automations.json'}`) : null,
    e.engine === 'script' && S.automations && S.automations.problems.length ? h('div', { class: 'warn' }, `등록 파일에서 받지 않은 항목: ${S.automations.problems.join(' / ')}`) : null,
    ['claude', 'codex', 'agy'].includes(e.engine) ? h('p', { class: 'small muted' }, S.runners[e.engine] ? `실행을 누르면 ${ENGINE_LABEL[e.engine]}를 workspaces/${e.id} 폴더에서 한 번 실행합니다. 권한을 건너뛰는 옵션은 쓰지 않아요.` : `이 맥에 ${ENGINE_LABEL[e.engine]}가 없어요. 그래도 할 일에서 복사해서 맡기기로 같은 일을 시킬 수 있어요.`) : null,
    h('div', { class: 'row', style: 'justify-content:space-between;margin-top:16px' },
      h('button', { class: 'btn sm', onclick: () => { if (confirm(`${e.name}, 명단에서 뺄까요?`)) { ui.editingEmp = null; act('DELETE', `/api/ui/employees/${e.id}`, undefined, '명단에서 뺐습니다'); } } }, '명단에서 빼기'),
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => { ui.editingEmp = null; load(); } }, '취소'), h('button', { class: 'btn dark', onclick: save }, '저장'))));
}

// 지금 쓰는 모델 한 줄, 바뀌었으면 한 줄 더
function modelLine(e) {
  const m = e.modelNow;
  if (!m) return null;
  const last = (e.modelHistory || []).slice(-1)[0];
  return h('div', { class: 'small muted' }, `모델 ${m.name}`,
    last ? h('div', null, `모델 바뀜: ${last.from} → ${last.to} (${dateK(last.at.slice(0, 10))})`) : null);
}

function engineText(e) {
  if (e.engine === 'web') return `복사해서 맡기기${e.webUrl ? ` · ${e.webUrl.replace(/^https:\/\//, '').replace(/\/.*$/, '')}` : ''}`;
  if (e.engine === 'local') return `로컬 모델 · ${e.model ? e.model.replace(/^(ollama|lmstudio):/, '') : '모델을 골라 주세요'}`;
  if (['claude', 'codex'].includes(e.engine)) return `${ENGINE_LABEL[e.engine]} · ${S.runners[e.engine] ? '이 맥에 설치됨' : '이 맥에 없음, 복사해서 맡기기로 씀'}`;
  if (e.engine === 'script') return `자동화 · ${automationOf(e) ? automationOf(e).title : '자동화를 골라 주세요'}`;
  return ENGINE_LABEL[e.engine] || e.engine;
}

function openAddEmployee() {
  const dlg = document.getElementById('dlg');
  const name = h('input', { class: 'in', 'aria-label': '이름', placeholder: '예: ChatGPT' });
  const role = h('input', { class: 'in', 'aria-label': '역할', placeholder: '예: 글쓰기, 고객 답장' });
  let picked = null;
  const have = new Set(S.data.employees.map((e) => e.catalog).filter(Boolean));
  const quick = h('div', { class: 'picker' }, S.options.catalog.filter((c) => !have.has(c.key) && c.engine !== 'local').map((c) => h('button', {
    type: 'button', class: 'chip', onclick: (ev) => {
      picked = c.key; name.value = c.name; role.value = c.role;
      for (const b of quick.children) b.classList.toggle('on', b === ev.currentTarget);
    },
  }, c.name)));
  const multi = S.data.groups.length > 1;
  const group = multi ? h('select', { class: 'in', 'aria-label': '근무 형태' }, S.data.groups.map((g) => h('option', { value: g.id }, [g.title, g.subtitle].filter(Boolean).join(' · ')))) : null;
  dlg.replaceChildren(h('h3', null, 'AI 직원 추가'),
    h('p', { class: 'small muted', style: 'margin:-8px 0 12px' }, '이미 쓰는 AI를 고르면 역할이 채워집니다. 역할은 배분할 때 씁니다.'),
    quick,
    h('label', { class: 'field', style: 'margin-top:14px' }, '이름', name), h('label', { class: 'field', style: 'margin-top:12px' }, '역할', role),
    multi ? h('label', { class: 'field', style: 'margin-top:12px' }, '근무 형태', group) : null,
    h('div', { class: 'bar' }, h('button', { class: 'btn', onclick: () => { dlg.close(); render(); } }, '취소'),
      h('button', { class: 'btn dark', onclick: () => once('add-emp', async () => {
        if (!name.value.trim()) { name.focus(); return; }
        dlg.close();
        const r = await act('POST', '/api/ui/employees', { name: name.value, role: role.value, catalog: picked && name.value === S.options.catalog.find((c) => c.key === picked)?.name ? picked : undefined, group: group?.value }, '추가했습니다');
        if (r && r.reassigned?.task?.length) toast(`추가했어요. 담당이 없던 일 ${r.reassigned.task.length}개를 다시 나눴어요`);
      }) }, '추가')));
  dlg.showModal();
  name.focus();
}

// 자는 시간: 이 시간에는 AI 가 대표를 부르지 않는다 (직원들이 whoami 로 본다)
function quietLine() {
  const q = S.data.settings.quietHours;
  const save = (from, to) => once('quiet', () => act('PATCH', '/api/ui/settings', { quietHours: from && to ? { from, to } : null }, '자는 시간을 바꿨어요'));
  const from = h('input', { class: 'in', type: 'time', value: q?.from || '', 'aria-label': '자는 시간 시작', onchange: (ev) => save(ev.target.value, to.value) });
  const to = h('input', { class: 'in', type: 'time', value: q?.to || '', 'aria-label': '자는 시간 끝', onchange: (ev) => save(from.value, ev.target.value) });
  return h('div', { class: 'quiet' }, h('b', null, '자는 시간'), from, h('span', { class: 'muted', 'aria-hidden': 'true' }, '~'), to,
    h('span', { class: 'small muted' }, '이 시간에는 AI가 대표를 부르지 않아요'));
}

function pageStaff() {
  const d = S.data;
  const total = d.employees.reduce((s, e) => s + (Number(e.salary) || 0), 0);
  const unknown = d.employees.filter((e) => e.salary === null || e.salary === undefined).length;
  return h('div', null,
    h('div', { class: 'head' }, h('div', null, h('h1', null, h('b', null, '내 직원')),
      h('div', { class: 'sub' }, `AI 직원 ${d.employees.length}명 · 월급 합계 월 ${won(total)}${unknown ? ` · 미입력 ${unknown}명` : ''}`)),
    h('button', { class: 'btn', onclick: openAddEmployee }, '직원 추가')),
    !d.employees.length ? h('div', { class: 'empty' }, '아직 직원이 없어요. 직원 추가를 눌러 지금 쓰는 AI를 고르세요.') : null,
    d.groups.length <= 1 ? h('div', { class: 'cards' }, d.employees.map(empCard)) : d.groups.map((g, i) => {
      const list = d.employees.filter((e) => e.group === g.id);
      return h('section', { class: 'grp' },
        h('div', { class: 'grp-h' }, h('span', { class: 'n0' }, String(i + 1)), h('h2', null, g.title), h('span', null, g.subtitle), h('span', { class: 'n' }, `${list.length}명`)),
        g.detail ? h('div', { class: 'small muted', style: 'margin-top:4px' }, g.detail) : null,
        h('div', { class: 'cards' }, list.map(empCard)));
    }),
    quietLine(),
    h('p', { class: 'small muted', style: 'margin-top:16px' }, '실행: 꺼짐 = 앱이 실행하지 않음 · 누를 때만 = 할 일에서 실행 버튼 · 자동 실행 = 매일 할 일이 시간이 되면 혼자 시작. 복사해서 맡기는 직원은 실행 설정이 필요 없어요.'));
}

// ───────── 내 리소스 ─────────

const GB = (b) => `${(b / 1024 ** 3).toFixed(b > 100 * 1024 ** 3 ? 0 : 1)}GB`;
function uptimeK(sec) {
  const dd = Math.floor(sec / 86400);
  const hh = Math.floor((sec % 86400) / 3600);
  const mm = Math.floor((sec % 3600) / 60);
  return dd ? `${dd}일 ${hh}시간` : hh ? `${hh}시간 ${mm}분` : `${mm}분`;
}
async function loadOffice() {
  try { ui.office = await (await fetch('/api/office')).json(); } catch { ui.office = { error: true }; }
  render();
}

function resRow(r) {
  const users = S.data.employees.filter((e) => e.resources.includes(r.id)).map((e) => shortName(e.id));
  const busy = S.working.filter((w) => { const t = S.data.tasks.find((x) => x.id === w.taskId); return t && t.resource === r.id; }).map((w) => shortName(w.emp));
  const status = h('select', { class: `in sm st-sel${r.status === '꺼짐' ? ' off' : ''}`, 'aria-label': `${r.name} 상태`, onchange: (ev) => act('PATCH', `/api/ui/resources/${r.id}`, { status: ev.target.value }, '상태를 바꿨습니다') },
    S.options.resStatus.map((s) => h('option', { value: s, selected: s === r.status }, s)));
  let extra = null;
  if (r.kind === '기계' && r.isThisMac) {
    const L = ui.office?.local;
    extra = L ? h('div', { class: 'small muted' }, `이 맥 · ${L.chip} · 메모리 ${Math.round((1 - L.memory.available / L.memory.total) * 100)}% 사용 · 디스크 ${L.disk ? `${GB(L.disk.free)} 남음` : '?'} · 켜진 지 ${uptimeK(L.uptimeSec)} · 부하 ${L.load[0]}`) : h('div', { class: 'small muted' }, '이 맥 · 읽는 중');
  } else if (r.kind === '기계') {
    const host = h('input', { class: 'in sm', value: r.hostname || '', placeholder: '호스트 이름 또는 IP', 'data-k': `host-${r.id}`, style: 'max-width:200px', 'aria-label': `${r.name} 호스트` });
    const lc = r.lastCheck;
    const alias = h('input', { class: 'in sm', value: r.sshAlias || '', placeholder: 'ssh 별칭 (예: office-1)', 'data-k': `alias-${r.id}`, style: 'max-width:150px', 'aria-label': `${r.name} ssh 별칭` });
    const o = (S.offices || []).find((x) => x.id === r.id);
    const oLine = o ? (o.state === 'busy' ? `${o.name}에서 실행 중 · ${o.title || ''}${o.since ? ` · ${stamp(o.since)}부터` : ''}${o.log ? ` · ${o.log}` : ''}`
      : o.state === 'down' ? `안 닿음 · ${o.reason}${o.retryAt ? ` · ${stamp(o.retryAt)}에 다시` : ''}` : `쉬는 중${o.checkedAt ? ` · ${stamp(o.checkedAt)} 확인` : ''}`) : null;
    extra = h('div', null, oLine ? h('div', { class: 'small office-line' }, oLine) : null, h('div', { class: 'row', style: 'margin-top:6px' }, host, alias,
      h('button', { class: 'btn sm', onclick: () => act('PATCH', `/api/ui/resources/${r.id}`, { hostname: host.value, sshAlias: alias.value.trim() }, '저장했습니다') }, '저장'),
      h('button', { class: 'btn sm', disabled: !r.hostname, onclick: () => act('POST', `/api/ui/resources/${r.id}/check`, {}, '확인했습니다') }, '연결 확인'),
      h('span', { class: 'small muted' }, lc ? `${lc.ok ? '닿음' : '안 닿음'} · ${lc.reason} · ${stamp(lc.checkedAt)}` : r.sshAlias ? '누를 때 ssh 로 한 번 확인 (키로만)' : r.hostname ? '누를 때 한 번만 확인 (로그인 안 함)' : ''),
      h('button', { class: 'btn link', onclick: () => act('PATCH', `/api/ui/resources/${r.id}`, { isThisMac: true }, `이 맥으로 지정: ${r.name}`) }, '이 맥으로 지정')));
  } else if (r.kind === '폴더') {
    extra = h('div', { class: 'small muted mono' }, r.path || '');
  }
  let title;
  if (ui.renamingRes === r.id) {
    const nm = h('input', { class: 'in sm', value: r.name, 'data-k': `rename-${r.id}`, style: 'max-width:220px', 'aria-label': `${r.name} 새 이름` });
    const save = () => { const v = nm.value.trim(); ui.renamingRes = null; if (v && v !== r.name) act('PATCH', `/api/ui/resources/${r.id}`, { name: v }, `이름을 바꿨습니다: ${v}`); else render(); };
    nm.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && !ev.isComposing) save(); if (ev.key === 'Escape') { ui.renamingRes = null; render(); } });
    title = h('div', { class: 'row' }, nm, h('button', { class: 'btn sm', onclick: save }, '저장'), h('button', { class: 'btn link', onclick: () => { ui.renamingRes = null; render(); } }, '취소'));
  } else {
    title = h('div', { class: 't' }, r.name,
      h('button', { class: 'btn link', style: 'margin-left:8px', 'aria-label': `${r.name} 이름 바꾸기`, onclick: () => { ui.renamingRes = r.id; render(); } }, '이름 바꾸기'),
      busy.length ? h('span', { class: 'tag solid', style: 'margin-left:8px' }, `${busy.join(', ')} 사용 중`) : null);
  }
  return h('li', { class: 'res' },
    h('div', { class: 'main' },
      title,
      h('div', { class: 's' }, [r.note, users.length ? `쓰는 직원: ${users.join(', ')}` : ''].filter(Boolean).join(' · ')),
      extra),
    h('div', { class: 'row' }, status,
      h('button', { class: 'x', 'aria-label': `${r.name} 지우기`, onclick: () => { if (confirm(`이 리소스를 지울까요?\n${r.name}`)) act('DELETE', `/api/ui/resources/${r.id}`, undefined, '지웠습니다'); } }, '×')));
}

// 같은 와이파이의 폰에서 보기 (기본 꺼짐, 맥 화면에서만 켜고 끈다)
function lanPanel() {
  const onMac = ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname);
  if (!onMac) return null;
  const info = S.lanInfo || { enabled: false, urls: [] };
  const L = ui.lan && ui.lan.enabled === info.enabled ? ui.lan : info;
  const toggle = (on) => once('lan', async () => {
    try { ui.lan = await api('POST', '/api/ui/lan', { on }); toast(on ? '폰에서 볼 수 있게 열었어요' : '폰에서 보기를 껐어요'); } catch { ui.lan = null; }
    await load();
  });
  const fresh = () => once('lan-code', async () => { try { ui.lan = await api('POST', '/api/ui/lan/code', {}); render(); } catch { /* toast */ } });
  const left = L.expiresAt ? Math.max(0, Math.round((Date.parse(L.expiresAt) - Date.now()) / 60000)) : 0;
  return h('section', { class: 'sec' }, secHead('폰에서 보기'),
    h('div', { class: 'lan' },
      h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: info.enabled, onchange: (ev) => toggle(ev.target.checked) }), h('span', { class: 'tr' }), h('b', null, '같은 와이파이의 폰에서 보기')),
      h('p', { class: 'small muted' }, '켜면 같은 와이파이에 있는 폰에서만 열립니다. 인터넷으로는 열리지 않아요. 처음 한 번은 이 화면에 뜬 6자리 코드를 폰에 넣어야 합니다. 집이나 사무실처럼 믿을 수 있는 와이파이에서만 켜 두세요.'),
      info.enabled ? h('div', { class: 'lan-on' },
        h('div', null, h('div', { class: 'small muted' }, '폰에서 열 주소'), (L.urls || info.urls).map((u) => h('div', { class: 'mono lan-url' }, u))),
        L.code && left > 0 ? h('div', null, h('div', { class: 'small muted' }, `연결 코드 · ${left}분 동안, 한 번만`), h('div', { class: 'pair-code', 'aria-label': '연결 코드' }, L.code))
          : h('button', { class: 'btn', onclick: fresh }, '연결 코드 받기')) : null));
}

// Muse 읽기 (읽기만, 기본 꺼짐). 읽을 곳 (이 맥 / 사무실), 스위치 하나, 상태 한 줄.
function musePanel() {
  const onMac = ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname);
  const m = S.data.settings.muse;
  if (!onMac || !m) return null;
  const host = m.host === 'office' ? 'office' : 'local';
  const offices = S.data.resources.filter(isOfficeRes);
  const office = res(m.res) || offices[0];
  const officeLabel = office ? office.name.replace(/\s*\(.*\)\s*$/, '') : '사무실';
  const place = host === 'office' ? officeLabel : '이 맥';
  const toggle = (on) => once('muse', () => act('POST', '/api/ui/muse', { on }, on ? 'Muse 읽기를 켰어요' : 'Muse 읽기를 껐어요'));
  const setHost = (v) => once('muse-host', () => act('POST', '/api/ui/muse', { host: v }, v === 'office' ? `${officeLabel}에서 읽어요` : '이 맥에서 읽어요'));
  const need = ['login', 'nobrowser', 'noego'].includes(m.status);
  const line = !m.enabled ? '' : `${m.statusText || ''}${m.lastRunAt ? ` · ${stamp(m.lastRunAt)}` : ''}`;
  const hostPick = h('div', { class: 'picker', role: 'group', 'aria-label': 'Muse 를 읽을 곳' },
    h('button', { type: 'button', class: `chip${host === 'local' ? ' on' : ''}`, 'aria-pressed': host === 'local' ? 'true' : 'false', onclick: () => host !== 'local' && setHost('local') }, '이 맥'),
    h('button', { type: 'button', class: `chip${host === 'office' ? ' on' : ''}`, 'aria-pressed': host === 'office' ? 'true' : 'false', disabled: !offices.length, title: offices.length ? '' : '내 리소스에서 사무실 기계의 ssh 별칭을 넣으면 고를 수 있어요', onclick: () => host !== 'office' && setHost('office') }, officeLabel));
  const how = host === 'office' ? `한 번만: 화면 공유로 ${place}에 들어가 ego lite 를 열고 Muse 에 직접 로그인해 두세요.` : '한 번만: 이 맥에서 ego lite 를 열고 Muse 에 직접 로그인해 두세요.';
  return h('section', { class: 'sec' }, secHead('Muse'),
    h('div', { class: 'lan' },
      h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: Boolean(m.enabled), onchange: (ev) => toggle(ev.target.checked) }), h('span', { class: 'tr' }),
        h('b', null, `Muse 대화 읽어 오기 (${place}, ${m.everyMin || 30}분마다)`)),
      h('div', { class: 'muse-host' }, h('span', { class: 'small muted' }, '읽는 곳'), hostPick),
      line ? h('p', { class: `small${need ? '' : ' muted'}` }, line) : null,
      h('p', { class: 'small muted' }, `${how} 앱은 읽기만 하고, 보내거나 누르지 않아요. 가져온 글은 이 맥에만 남아요.`)));
}

function pageResources() {
  if (!ui.office) loadOffice();
  const d = S.data;
  const name = h('input', { class: 'in', placeholder: '새 리소스 (예: Notion 계정, 외장 SSD)', 'data-k': 'rs-name', 'aria-label': '리소스 이름' });
  const kind = h('select', { class: 'in', style: 'width:110px', 'data-k': 'rs-kind', 'aria-label': '종류' }, S.options.resKinds.map((k) => h('option', { value: k }, k)));
  const add = () => submitInput(name, 'add-res', (v) => act('POST', '/api/ui/resources', { name: v, kind: kind.value }, '추가했습니다'));
  name.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) add(); });
  return h('div', null,
    h('div', { class: 'head' }, h('div', null, h('h1', null, h('b', null, '내 리소스')),
      h('div', { class: 'sub' }, '직원이 쓸 수 있는 기계, 멤버십, 계정, 폴더. 꺼짐으로 두면 배분할 때 빼고 고릅니다.')),
    h('button', { class: 'btn', onclick: loadOffice }, '이 맥 새로 읽기')),
    h('div', { class: 'addbar slim' }, kind, name, h('button', { class: 'btn dark', onclick: add }, '추가')),
    !d.resources.length ? h('div', { class: 'empty' }, '아직 없어요. 예: 맥북 에어 (기계), ChatGPT Plus (멤버십), 스마트스토어 (계정). 할 일 이름에 계정 이름이 나오면 배분할 때 함께 적어 줍니다.') : null,
    lanPanel(),
    musePanel(),
    S.options.resKinds.map((k) => {
      const list = d.resources.filter((r) => r.kind === k);
      return list.length ? h('section', { class: 'sec' }, secHead(k, `${list.length}개`), h('ul', { class: 'list' }, list.map(resRow))) : null;
    }));
}

// ───────── 1분 시작하기 (처음 켠 사람) ─────────
// 대표 이름과 회사 이름 → 이 컴퓨터에서 찾은 AI 체크 → 사무실 확인 → 자는 시간 → AI 도구 연결 (묻고 보여 주기) → 안전 규칙

const OB_STEPS = 6;

function obState() {
  if (!ui.ob) {
    ui.ob = { step: 1, name: S.data.owner.name || '', company: S.data.settings.companyName || '', ais: new Set(), machines: new Set(), ssh: new Set(),
      quiet: { from: S.data.settings.quietHours?.from || '23:00', to: S.data.settings.quietHours?.to || '07:00' }, det: null, connect: null, open: {} };
    fetch('/api/onboard/detect').then((r) => r.json()).then((det) => {
      ui.ob.det = det;
      if (det.claude) ui.ob.ais.add('claudecode');
      if (det.codex) ui.ob.ais.add('codex');
      if (det.gemini) ui.ob.ais.add('gemini');
      if (det.ollama) ui.ob.ais.add('ollama'); else if (det.lmstudio) ui.ob.ais.add('lmstudio');
      render();
    }).catch(() => { ui.ob.det = {}; render(); });
  }
  return ui.ob;
}

function obShell(step, title, sub, body, actions) {
  return h('div', { class: 'ob' },
    h('div', { class: 'ob-step' }, `${step} / ${OB_STEPS}`),
    h('h1', null, h('b', null, title)), sub ? h('p', { class: 'sub' }, sub) : null,
    h('div', { class: 'ob-body' }, body),
    h('div', { class: 'ob-actions' }, actions));
}

async function obSend(body) {
  return once('onboard', () => act('POST', '/api/ui/onboard', body));
}

function finishOnboarding() {
  return once('ob-done', async () => { await act('PATCH', '/api/ui/settings', { onboarded: true }, '본사를 열었어요'); ui.ob = null; location.hash = '#home'; });
}

function copyBlock(label, textValue) {
  return h('div', { class: 'ob-cmd' }, h('div', { class: 'row' }, h('span', { class: 'small muted' }, label), h('button', { type: 'button', class: 'btn sm', onclick: () => copyText(textValue) }, '복사')),
    h('pre', { class: 'mono' }, textValue));
}

function pageStart() {
  const ob = obState();
  const next = (n) => { ob.step = n; render(); window.scrollTo(0, 0); };
  const skip = h('button', { class: 'btn link', onclick: () => { if (confirm('시작하기를 건너뛰고 빈 화면으로 갈까요?')) finishOnboarding(); } }, '건너뛰기');

  if (ob.step === 1) {
    const name = h('input', { class: 'in big', value: ob.name, placeholder: '예: 민지', 'data-k': 'ob-name', 'aria-label': '대표 이름', oninput: (ev) => { ob.name = ev.target.value; } });
    const company = h('input', { class: 'in big', value: ob.company, placeholder: '예: 민지 스튜디오', 'data-k': 'ob-company', 'aria-label': '회사 이름', oninput: (ev) => { ob.company = ev.target.value; } });
    const go = () => { ob.name = name.value.trim(); ob.company = company.value.trim(); if (!ob.name) { name.focus(); return; } next(2); };
    for (const el of [name, company]) el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) go(); });
    setTimeout(() => document.querySelector('[data-k="ob-name"]')?.focus(), 0);
    return obShell(1, '나의 AI 자율 회사 본사를 차려 볼까요?', '1분이면 끝나요. 자세한 건 묻지 않아요. 모든 데이터는 이 컴퓨터 안에만 저장돼요.',
      h('div', { class: 'ob-fields' }, h('label', { class: 'field' }, '대표 이름', name), h('label', { class: 'field' }, '회사 이름 (나중에 정해도 돼요)', company)),
      [skip, h('button', { class: 'btn dark big', 'data-act': 'ob-next', onclick: go }, '시작하기')]);
  }

  if (ob.step === 2) {
    const det = ob.det || {};
    const found = (c) => (c.key === 'claudecode' && det.claude) || (c.key === 'codex' && det.codex) || (c.key === 'gemini' && det.gemini) || (c.local && det[c.local]);
    const missingLocal = (c) => c.local && ob.det && !det[c.local];
    const card = (c) => {
      const on = ob.ais.has(c.key);
      return h('button', { type: 'button', class: `ai-card${on ? ' on' : ''}`, 'aria-pressed': on ? 'true' : 'false', 'data-ai': c.key, disabled: missingLocal(c),
        onclick: () => { if (on) ob.ais.delete(c.key); else ob.ais.add(c.key); render(); } },
      h('span', { class: 'box', 'aria-hidden': 'true' }, on ? '✓' : ''),
      h('b', null, c.name), h('span', { class: 'small muted' }, c.hint),
      found(c) ? h('span', { class: 'tag' }, '이 컴퓨터에서 찾았어요') : missingLocal(c) ? h('span', { class: 'small muted' }, '이 컴퓨터에 없어요') : null);
    };
    const cat = S.options.catalog;
    const sorted = ob.det ? [...cat.filter(found), ...cat.filter((c) => !found(c))] : [];
    return obShell(2, 'AI 직원을 골라 주세요.', '이 컴퓨터에서 찾은 AI는 미리 체크해 두었어요. 웹에서 쓰는 AI는 지시문을 복사해서 맡기고 답을 붙여 넣는 방식이라 설치가 필요 없어요.',
      h('div', { class: 'ai-grid' }, ob.det ? sorted.map(card) : h('div', { class: 'small muted' }, '이 컴퓨터를 살펴보는 중')),
      [h('button', { class: 'btn', onclick: () => next(1) }, '이전'), h('button', { class: 'btn dark big', 'data-act': 'ob-next', disabled: !ob.ais.size,
        onclick: async () => { const r = await obSend({ name: ob.name, company: ob.company, ais: [...ob.ais] }); if (r) next(3); } }, ob.ais.size ? `${ob.ais.size}명 채용하고 다음` : 'AI를 골라 주세요')]);
  }

  if (ob.step === 3) {
    const det = ob.det || {};
    const M = det.thisMac || {};
    const hosts = det.sshHosts || [];
    const chips = ['Mac mini', 'Mac Studio', 'MacBook Pro', 'MacBook Air', 'Windows PC'];
    const toggle = (set, v) => { if (set.has(v)) set.delete(v); else set.add(v); render(); };
    const done = async () => { const r = await obSend({ machines: [...ob.machines], sshHosts: [...ob.ssh] }); if (r) next(4); };
    return obShell(3, '사무실을 확인해 주세요.', '컴퓨터 한 대가 사무실 하나예요. 이 컴퓨터는 본사로 자동으로 들어가요. 찾은 컴퓨터는 눌러서 확인만 하면 돼요.',
      h('div', null,
        h('div', { class: 'card' }, h('div', { class: 'row' }, h('b', null, '이 컴퓨터 · 본사'), h('span', { class: 'tag' }, '자동')),
          h('div', { class: 'small muted' }, [M.chip, M.memoryGB ? `메모리 ${M.memoryGB}GB` : '', M.diskFreeGB ? `여유 ${M.diskFreeGB}GB` : ''].filter(Boolean).join(' · ') || '읽는 중')),
        hosts.length ? h('div', { class: 'ob-group' }, h('div', { class: 'small muted' }, 'ssh 설정에서 찾은 컴퓨터 (이름만 읽었어요, 접속은 하지 않아요)'),
          h('div', { class: 'picker' }, hosts.map((a) => h('button', { type: 'button', class: `chip${ob.ssh.has(a) ? ' on' : ''}`, 'aria-pressed': ob.ssh.has(a) ? 'true' : 'false', onclick: () => toggle(ob.ssh, a) }, a)))) : null,
        h('div', { class: 'ob-group' }, h('div', { class: 'small muted' }, '다른 컴퓨터가 있으면 골라 주세요. 연결은 나중에 내 리소스에서 해요.'),
          h('div', { class: 'picker' }, chips.map((c) => h('button', { type: 'button', class: `chip${ob.machines.has(c) ? ' on' : ''}`, 'aria-pressed': ob.machines.has(c) ? 'true' : 'false', onclick: () => toggle(ob.machines, c) }, c))))),
      [h('button', { class: 'btn', onclick: () => next(2) }, '이전'), h('button', { class: 'btn dark big', 'data-act': 'ob-next', onclick: done }, '확인')]);
  }

  if (ob.step === 4) {
    const from = h('input', { class: 'in', type: 'time', value: ob.quiet.from, 'data-k': 'ob-q-from', 'aria-label': '자는 시간 시작', oninput: (ev) => { ob.quiet.from = ev.target.value; } });
    const to = h('input', { class: 'in', type: 'time', value: ob.quiet.to, 'data-k': 'ob-q-to', 'aria-label': '자는 시간 끝', oninput: (ev) => { ob.quiet.to = ev.target.value; } });
    const done = async () => { const r = await obSend({ quiet: ob.quiet }); if (r) next(5); };
    return obShell(4, '몇 시에 자나요?', '이 시간에는 AI가 대표님을 부르지 않아요. 일은 계속하고, 메시지와 확인 요청은 아침에 볼 수 있게 남겨 둬요.',
      h('div', { class: 'ob-quiet' }, h('label', { class: 'field' }, '자는 시간', from), h('span', { class: 'muted', 'aria-hidden': 'true' }, '~'), h('label', { class: 'field' }, '일어나는 시간', to)),
      [h('button', { class: 'btn', onclick: () => next(3) }, '이전'), h('button', { class: 'btn dark big', 'data-act': 'ob-next', onclick: done }, '다음')]);
  }

  if (ob.step === 5) {
    if (!ob.connect) {
      ob.connect = { loading: true };
      fetch('/api/onboard/connect').then((r) => r.json()).then((c) => { ob.connect = c; render(); }).catch(() => { ob.connect = { targets: [] }; render(); });
    }
    const list = (ob.connect.targets || []).filter((t) => t.found && t.hired);
    const row = (t) => {
      const done = t.mcp.configured && (!t.skill || t.skill.installed);
      const open = ob.open[t.key];
      return h('div', { class: 'ob-conn' },
        h('div', { class: 'row' }, h('div', null, h('b', null, t.name), h('div', { class: 'small muted' }, `직원 아이디 ${t.employee}${t.skill ? ' · 출입증(MCP)과 직원 수첩(스킬)' : ' · 출입증(MCP)'}`)),
          done ? h('span', { class: 'tag' }, '이미 연결됨')
            : h('button', { type: 'button', class: `btn sm${open ? '' : ' dark'}`, 'aria-expanded': open ? 'true' : 'false', onclick: () => { ob.open[t.key] = !open; render(); } }, open ? '접기' : '넣을래요')),
        open && !done ? h('div', { class: 'ob-cmds' },
          !t.mcp.configured ? (t.mcp.line ? copyBlock('터미널에 붙여 넣기 · 출입증(MCP)', t.mcp.line) : copyBlock(`${t.mcp.file} 에 합치기 · 출입증(MCP)`, t.mcp.snippet)) : null,
          t.skill && !t.skill.installed ? copyBlock('터미널에 붙여 넣기 · 직원 수첩(스킬)', t.skill.line) : null) : null);
    };
    return obShell(5, 'AI 도구를 본사에 연결할까요?', '찾기만 했고 아직 아무것도 바꾸지 않았어요. 넣을 도구만 눌러 명령을 확인하세요. 터미널에서 npx github:wonseokjung/connect-ai-autonomous-company connect 를 열면 도구마다 물어보고 넣어 줘요.',
      ob.connect.loading ? h('div', { class: 'small muted' }, '이 컴퓨터를 살펴보는 중')
        : list.length ? h('div', null, list.map(row))
          : h('div', { class: 'card small muted' }, '이 컴퓨터에서 연결할 AI 도구를 찾지 못했어요. 웹에서 쓰는 AI는 할 일에서 지시문을 복사해서 맡기면 돼요.'),
      [h('button', { class: 'btn', onclick: () => next(4) }, '이전'), h('button', { class: 'btn dark big', 'data-act': 'ob-next', onclick: () => next(6) }, '다음')]);
  }

  return obShell(6, '돈과 공개는 대표님 손으로만', '결제, 업로드, 게시, 삭제, 메시지 발송이 들어간 일은 대표님이 누를 때까지 AI가 시작하지 못해요. 이제 내 할 일에 오늘 할 일을 적거나, 매일 할 일에 루틴을 넣어 보세요.',
    h('div', { class: 'ob-assign' }, h('span', { class: 'who-chip ai' }, 'AI'), h('div', null, h('b', null, '광고비 5만원 결제'), h('div', { class: 'small muted' }, '결제가 들어간 일 → 사람')), h('span', { class: 'btn sm dark', 'aria-hidden': 'true' }, '결제 확인')),
    [h('button', { class: 'btn', onclick: () => next(5) }, '이전'), h('button', { class: 'btn dark big', 'data-act': 'ob-finish', onclick: finishOnboarding }, '알겠어요, 본사 열기')]);
}

// ───────── 라우팅 ─────────

function readHash() {
  const raw = decodeURIComponent(location.hash.replace(/^#/, ''));
  const [route, ...rest] = raw.split('/');
  const next = route || 'home';
  if (next !== ui.route) { ui.open = null; ui.picking = null; ui.editingEmp = null; window.scrollTo(0, 0); }
  if (next === 'resources') ui.office = null;
  ui.route = next;
  ui.param = rest.join('/');
  if (next === 'home' && /^t\d+$/.test(ui.param)) ui.open = ui.param;
}

window.addEventListener('hashchange', () => { readHash(); render(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && (ui.picking || ui.open)) { ui.picking = null; ui.open = null; render(); } });
readHash();
load();

// 새 소식: 누가 일하거나 배분 중이거나 스레드를 열어 두면 4초, 아니면 30초
let tick = 0;
setInterval(() => {
  tick++;
  const fast = S && (S.working.length || S.assigning.length || ui.open);
  if (document.hidden && !fast) return;
  if (fast || tick % 8 === 0) load().catch(() => {});
}, 4000);
