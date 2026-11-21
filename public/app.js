// AI 회사 본사 · 화면
// 네 칸: 내 할 일, 매일 할 일, 내 직원, 내 리소스.
// 모든 데이터는 textContent 로만 넣는다 (AI가 쓴 글은 데이터일 뿐, 절대 실행하지 않음).
'use strict';

const C = window.Charts;
let S = null;
const ui = {
  route: 'home', param: '', open: null, picking: null, rtPicking: null, editingEmp: null, openAccount: null, resTab: 'all',
  taskPick: 'jay', rtPick: 'jay', rtSched: 'time', homeFilter: 'all', doneOpen: false, insertOpen: {}, empDraftEngine: {},
  drag: false, office: null, tools: null, briefOpen: false, models: null, listening: false, lastThread: null, handout: {}, ob: null, lan: null,
  composing: false, pendingRender: false, lastSig: '',
};

function isEmpCooling(e) {
  if (!e || !e.cooldownUntil) return false;
  const ts = Date.parse(e.cooldownUntil);
  return Number.isFinite(ts) && ts > Date.now();
}
function empCooldownMin(e) {
  if (!isEmpCooling(e)) return 0;
  return Math.max(1, Math.ceil((Date.parse(e.cooldownUntil) - Date.now()) / 60000));
}
function healthLabel(level) {
  return level === 'overload' ? '과부하' : level === 'busy' ? '혼잡' : level === 'down' ? '꺼짐' : '여유';
}

document.addEventListener('compositionstart', () => { ui.composing = true; });
document.addEventListener('compositionend', () => { ui.composing = false; });
document.addEventListener('focusout', () => {
  if (!ui.pendingRender) return;
  setTimeout(() => {
    if (ui.pendingRender && !isEditingPageInput()) { ui.pendingRender = false; render(); }
  }, 80);
});

function isEditingPageInput() {
  if (ui.composing) return true;
  const el = document.activeElement;
  if (!el || !el.closest('#page')) return false;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) && el.type !== 'checkbox';
}

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

function setDlg(dlg, ...kids) {
  dlg.replaceChildren(...kids.flat(3).filter((k) => k !== null && k !== undefined && k !== false));
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
const ENGINE_LABEL = { web: '복사해서 맡기기', none: '스스로 보고 (MCP, CLI)', local: '로컬 모델', claude: 'Claude Code', codex: 'Codex', agy: 'agy' };
const RUN_LABEL = { off: '꺼짐', manual: '누를 때만', auto: '자동 실행' };
// 이 앱이 직접 일을 시킬 수 있는가 (로컬 모델, 또는 이 맥에 설치된 Claude Code, Codex)
function canRun(e) {
  if (!e || e.runMode === 'off') return false;
  if (e.engine === 'local') return Boolean(e.model);
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

function stateSignature(st) {
  const mh = st.machineHealth || {};
  const mhSig = Object.values(mh).map((x) => `${x.id}:${x.level}:${x.ramPct ?? ''}`).join(',');
  const wSig = (st.working || []).map((w) => `${w.emp}:${w.taskId}`).join(',');
  const oSig = (st.offices || []).map((o) => `${o.id}:${o.state}:${o.log || ''}`).join(',');
  return `${st.rev || 0}|${wSig}|${(st.assigning || []).join(',')}|${oSig}|${mhSig}`;
}

async function load({ background = false } = {}) {
  const r = await fetch('/api/state', { credentials: 'same-origin' });
  const next = await r.json();
  const sig = stateSignature(next);
  const unchanged = background && S && sig === ui.lastSig;
  S = next;
  ui.lastSig = sig;
  if (unchanged) return;
  if (background && isEditingPageInput()) {
    ui.pendingRender = true;
    renderNav();
    return;
  }
  ui.pendingRender = false;
  render();
}

function snapshotInputs() {
  const snap = new Map();
  for (const el of document.querySelectorAll('[data-k]')) {
    snap.set(el.dataset.k, { value: el.value, checked: el.checked, open: el.open, scrollTop: el.scrollTop || 0, focused: document.activeElement === el, s: el.selectionStart, e: el.selectionEnd });
  }
  return snap;
}
function restoreInputs(snap) {
  for (const el of document.querySelectorAll('[data-k]')) {
    const v = snap.get(el.dataset.k);
    if (!v) continue;
    if (el.tagName === 'DETAILS') { el.open = v.open; continue; }
    if (el.type === 'checkbox') { el.checked = v.checked; continue; }
    if (el.dataset.fresh !== '1') el.value = v.value;
    if (el.tagName === 'TEXTAREA' && v.scrollTop) el.scrollTop = v.scrollTop;
    if (v.focused) { el.focus(); try { el.setSelectionRange(v.s, v.e); } catch { /* select */ } }
  }
}

function openTaskById(tid) {
  const t = S?.data?.tasks?.find((x) => x.id === tid);
  if (t && t.status === '완료') ui.doneOpen = true;
  ui.open = tid;
  ui.picking = null;
  if (ui.route !== 'home') { ui.route = 'home'; location.hash = `#home/${tid}`; }
  render();
  setTimeout(() => {
    const db = document.querySelector('.done-box');
    if (t && t.status === '완료' && db) db.open = true;
    document.querySelector(`li[data-id="${tid}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 30);
}

async function openPromptPreview(kind, id, flushFn = null) {
  if (flushFn) await flushFn();
  const dlg = document.getElementById('dlg');
  dlg.className = 'wide';
  setDlg(dlg, h('h3', null, 'AI에게 전달되는 최종 지시서'), h('div', { class: 'small muted' }, '지시서를 정리하는 중…'));
  dlg.showModal();
  try {
    const p = await api('GET', `/api/ui/${kind}/${id}/prompt-preview`);
    const badges = [];
    if (p.empName) badges.push(h('span', { class: 'tag solid' }, p.empName));
    if (p.linked?.office) badges.push(h('span', { class: 'tag' }, p.linked.office));
    if (p.linked?.browser) badges.push(h('span', { class: 'tag' }, p.linked.account?.spaceName ? `${p.linked.browser} (${p.linked.account.spaceName})` : p.linked.browser));
    if (p.linked?.account) badges.push(h('span', { class: 'tag' }, p.linked.account.name.split(' · ')[0].split(' (')[0]));
    for (const dName of p.linked?.designs || []) badges.push(h('span', { class: 'tag' }, `디자인: ${dName}`));
    for (const tObj of p.linked?.tools || []) badges.push(h('span', { class: 'tag' }, tObj.name));
    if (p.linked?.estCost) badges.push(h('span', { class: 'tag' }, `예상 ${won(p.linked.estCost)}`));
    if (p.linked?.gate) badges.push(h('span', { class: 'tag' }, `${p.linked.gate} ${p.linked.gateApproved ? '확인됨' : '확인 필요'}`));
    setDlg(dlg, 
      h('h3', null, 'AI에게 전달되는 최종 지시서'),
      h('p', { class: 'small muted', style: 'margin:-8px 0 12px' }, '실행하거나 복사할 때 AI 직원에게 그대로 전달되는 전체 지시문입니다. (읽기 전용 미리보기)'),
      badges.length ? h('div', { class: 'row', style: 'margin-bottom:12px' }, badges) : null,
      p.linked?.account?.blocked ? h('div', { class: 'warn', style: 'margin-bottom:12px' }, p.linked.account.message) : null,
      h('pre', { class: 'report-pre' }, p.prompt),
      h('div', { class: 'bar' },
        h('button', { class: 'btn', onclick: () => { dlg.className = ''; dlg.close(); } }, '닫기'),
        h('button', { class: 'btn dark', onclick: async () => { await copyText(p.prompt); toast('최종 지시서를 복사했어요'); } }, '지시서 복사')));
  } catch {
    dlg.className = '';
    dlg.close();
  }
}

async function openConnectModal() {
  const dlg = document.getElementById('dlg');
  dlg.className = 'wide';
  const loadView = async () => {
    setDlg(dlg, h('h3', null, 'AI 도구 연결 (MCP · 스킬)'), h('div', { class: 'small muted' }, '이 컴퓨터의 AI 도구를 확인하는 중…'));
    if (!dlg.open) dlg.showModal();
    try {
      const c = await api('GET', '/api/onboard/connect');
      const list = (c.targets || []).filter((t) => t.found);
      const rows = list.length ? list.map((t) => {
        const done = t.mcp.configured && (!t.skill || t.skill.installed);
        return h('div', { class: 'ob-conn' },
          h('div', { class: 'row' },
            h('div', null, h('b', null, t.name), h('div', { class: 'small muted' }, `직원 아이디 ${t.employee}${t.skill ? ' · MCP + 스킬' : ' · MCP'}`)),
            done ? h('span', { class: 'tag solid' }, '연결됨 ✓') : h('span', { class: 'tag' }, '연결 전')),
          !done ? h('div', { class: 'ob-cmds' },
            !t.mcp.configured ? (t.mcp.line ? copyBlock('터미널에 붙여넣기 · 출입증(MCP)', t.mcp.line) : copyBlock(`${t.mcp.file}에 합치기 · 출입증(MCP)`, t.mcp.snippet)) : null,
            t.skill && !t.skill.installed ? copyBlock('터미널에 붙여넣기 · 직원 수첩(스킬)', t.skill.line) : null) : null);
      }) : [h('div', { class: 'empty' }, '이 컴퓨터에서 Claude Code, Codex, Gemini CLI, LM Studio를 찾지 못했어요. 웹에서 쓰는 AI는 할 일에서 지시문 복사로 바로 쓸 수 있어요.')];
      setDlg(dlg, 
        h('h3', null, 'AI 도구 연결 (MCP · 스킬)'),
        h('p', { class: 'small muted', style: 'margin:-8px 0 12px' }, '터미널에서 아래 명령을 실행하거나 npx github:wonseokjung/connect-ai-autonomous-company connect 를 치면 자동으로 연결해 드려요.'),
        ...rows,
        h('div', { class: 'bar' },
          h('button', { class: 'btn', onclick: loadView }, '연결 다시 확인'),
          h('button', { class: 'btn dark', onclick: () => { dlg.className = ''; dlg.close(); } }, '닫기')));
    } catch {
      dlg.className = '';
      dlg.close();
    }
  };
  loadView();
}

function openSettingsModal() {
  const dlg = document.getElementById('dlg');
  dlg.className = 'wide';
  const d = S.data;
  const ownerName = h('input', { class: 'in', value: d.owner.name || '', placeholder: '예: Jay', 'aria-label': '대표 이름' });
  const companyName = h('input', { class: 'in', value: d.settings.companyName || '', placeholder: '예: CONNECT AI LAB', 'aria-label': '회사 이름' });
  const qFrom = h('input', { class: 'in', type: 'time', value: d.settings.quietHours?.from || '', 'aria-label': '자는 시간 시작' });
  const qTo = h('input', { class: 'in', type: 'time', value: d.settings.quietHours?.to || '', 'aria-label': '자는 시간 끝' });
  const f = d.settings.features || {};
  const fAppr = h('input', { type: 'checkbox', checked: Boolean(f.approvals) });
  const fMsg = h('input', { type: 'checkbox', checked: Boolean(f.messenger) });
  const fRev = h('input', { type: 'checkbox', checked: Boolean(f.revenue) });
  const fOpt = h('input', { type: 'checkbox', checked: d.settings.autoOptimize !== false });
  const memCount = Object.keys(d.settings.assignMemory || {}).length;
  const save = () => once('save-set', async () => {
    const patch = {
      ownerName: ownerName.value.trim() || undefined,
      companyName: companyName.value.trim(),
      autoOptimize: fOpt.checked,
      features: { approvals: fAppr.checked, messenger: fMsg.checked, revenue: fRev.checked, channel: fRev.checked },
    };
    if (qFrom.value && qTo.value && qFrom.value !== qTo.value) patch.quietHours = { from: qFrom.value, to: qTo.value };
    else if (!qFrom.value && !qTo.value) patch.quietHours = null;
    dlg.className = '';
    dlg.close();
    await act('PATCH', '/api/ui/settings', patch, '설정을 저장했어요');
  });
  setDlg(dlg,
    h('h3', null, '본사 설정'),
    h('div', { class: 'grid2' },
      h('label', { class: 'field' }, '대표 이름', ownerName),
      h('label', { class: 'field' }, '회사 이름', companyName)),
    h('div', { class: 'grid2', style: 'margin-top:12px' },
      h('label', { class: 'field' }, '자는 시간 시작 (선택)', qFrom),
      h('label', { class: 'field' }, '일어나는 시간 (선택)', qTo)),
    h('div', { style: 'margin-top:16px' },
      h('div', { class: 'small muted', style: 'margin-bottom:8px' }, '성능 · 자동 최적화'),
      h('label', { class: 'chk-l' }, fOpt, '토큰 한도 도달 시 대체 AI 전환 · RAM 85% 초과 시 대체 컴퓨터 우회/대기열 보호')),
    h('div', { style: 'margin-top:16px' },
      h('div', { class: 'small muted', style: 'margin-bottom:8px' }, '선택 메뉴 표시 (기본은 4개 핵심 메뉴만 깔끔하게 보여요)'),
      h('div', { class: 'chk-wrap' },
        h('label', { class: 'chk-l' }, fAppr, '결재함 탭'),
        h('label', { class: 'chk-l' }, fMsg, '사내 메신저 탭'),
        h('label', { class: 'chk-l' }, fRev, '매출 · 채널 탭'))),
    h('div', { class: 'bp-bar' },
      h('div', { class: 'small muted' }, `대표님 담당 선택 기억: ${memCount}개 패턴`),
      memCount ? h('button', { type: 'button', class: 'btn sm', onclick: async () => { await act('PATCH', '/api/ui/settings', { resetAssignMemory: true }, '담당 선택 기억을 초기화했어요'); openSettingsModal(); } }, '기억 초기화') : null),
    h('div', { class: 'bp-bar' },
      h('button', { type: 'button', class: 'btn sm', onclick: () => { dlg.className = ''; dlg.close(); openConnectModal(); } }, 'AI 도구 연결 (MCP · 스킬)'),
      h('button', { type: 'button', class: 'btn sm', onclick: async () => { if (confirm('1분 시작하기 안내를 다시 열어 볼까요? (기존 데이터는 유지돼요)')) { dlg.className = ''; dlg.close(); ui.ob = null; await act('PATCH', '/api/ui/settings', { onboarded: false }); } } }, '처음 시작하기 다시 보기')),
    h('div', { class: 'bar' },
      h('button', { class: 'btn', onclick: () => { dlg.className = ''; dlg.close(); } }, '취소'),
      h('button', { class: 'btn dark', onclick: save }, '저장')));
  dlg.showModal();
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
  const mobSet = document.getElementById('mob-set');
  if (mobSet && !mobSet.dataset.bound) { mobSet.dataset.bound = '1'; mobSet.addEventListener('click', openSettingsModal); }
  const thisMacRes = d.resources.find((r) => r.kind === '기계' && r.isThisMac);
  const localH = thisMacRes ? S.machineHealth?.[thisMacRes.id] : null;
  const coolCnt = d.employees.filter(isEmpCooling).length;
  const queueCnt = d.tasks.filter((t) => t.queued && t.status !== '완료').length;
  const footNodes = [
    h('div', null, `AI 직원 ${d.employees.length}명 · 자동 실행 ${d.employees.filter((e) => e.runMode === 'auto').length}명`),
    localH && typeof localH.ramPct === 'number'
      ? h('div', { class: 'side-health' }, `RAM ${localH.ramPct}% · `, h('b', null, healthLabel(localH.level)))
      : null,
    coolCnt || queueCnt
      ? h('div', { class: 'side-health' }, [coolCnt ? `토큰 휴식 ${coolCnt}명` : '', queueCnt ? `대기열 ${queueCnt}건` : ''].filter(Boolean).join(' · '))
      : h('div', null, `알람 ${d.settings.alarmsEnabled ? '켜짐' : '꺼짐'} · 최적화 ${d.settings.autoOptimize !== false ? '켜짐' : '꺼짐'}`),
    h('button', { type: 'button', class: 'btn sm side-set-btn', onclick: openSettingsModal }, '설정'),
  ].filter(Boolean);
  document.getElementById('side-foot').replaceChildren(...footNodes);
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

function taskRow(t, { draggable = true, overdue = false } = {}) {
  const open = ui.open === t.id;
  const done = t.status === '완료';
  // 확인 버튼은 AI가 할 일에만 (내가 직접 하는 일은 내가 하는 것이 곧 확인)
  const gated = t.gate && !t.gateApprovedAt && !done && t.assignee !== 'jay';
  const pendAppr = S.data.approvals.some((a) => a.taskId === t.id && a.status === '대기');
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
  const stLen = (t.steps || []).length;
  const stDone = stLen ? t.steps.filter((s) => s.status === '완료').length : 0;
  const right = h('div', { class: 'right' },
    overdue && !done ? h('button', { class: 'btn sm', title: '오늘 할 일로 옮기기', onclick: (ev) => { ev.stopPropagation(); act('PATCH', `/api/ui/tasks/${t.id}`, { date: S.today }, '오늘로 옮겼어요'); } }, '오늘로') : null,
    pendAppr ? h('span', { class: 'tag solid', title: '대표 결재 대기 중' }, '결재 대기') : null,
    gated ? h('button', { class: 'btn sm dark', onclick: (ev) => { ev.stopPropagation(); if (confirm(`"${t.title}" 에 ${gateK(t.gate)} 들어 있습니다. AI가 진행해도 될까요?`)) act('POST', `/api/ui/tasks/${t.id}/approve-gate`, {}, `${gateO(t.gate)} 확인했어요`); } }, `${t.gate} 확인`) : null,
    stLen ? h('span', { class: 'tag', title: '팀 협업 워크플로우' }, `${t.stepMode === 'parallel' ? '동시' : '협업'} ${stDone}/${stLen}`) : null,
    t.queued && !done ? h('span', { class: 'tag dash', title: t.queueReason || '여유 생기면 자동 시작' }, '대기열') : null,
    t.status === '진행' || t.status === '막힘' ? h('span', { class: `stat-pill ${t.status}` }, officeOf(t) && t.status === '진행' ? `${officeOf(t).name}에서 실행 중` : isWorking(t.assignee) && t.status === '진행' ? '일하는 중' : t.status) : null,
    msgs ? h('span', { class: 'small muted', title: '스레드 메시지' }, `대화 ${msgs}`) : null,
    who);
  const meta = [];
  if (t.queued && t.queueReason && !done) meta.push(`대기열: ${t.queueReason}`);
  if (t.reason) meta.push(thinking ? `${t.reason} · 다시 보는 중` : t.reason);
  if (t.resource && res(t.resource) && !(t.reason || '').includes(res(t.resource).name)) meta.push(res(t.resource).name);
  if (t.browser && res(t.browser) && !(t.reason || '').includes(res(t.browser).name)) meta.push(res(t.browser).name);
  if (t.design && res(t.design) && !(t.reason || '').includes(res(t.design).name)) meta.push(res(t.design).name);
  for (const tid of t.tools || []) if (res(tid) && !(t.reason || '').includes(res(tid).name)) meta.push(res(tid).name);
  if (t.routineId) meta.push('매일');
  if (t.date !== S.today) meta.push(dateK(t.date));

  const toggleOpen = () => { ui.open = open ? null : t.id; ui.picking = null; render(); };
  const timeText = t.intervalMin ? (t.intervalMin === 60 ? '매1h' : `매${t.intervalMin}분`) : (t.time || '·');
  li.appendChild(h('div', {
    class: 'line', tabindex: '0', role: 'button', 'aria-expanded': open ? 'true' : 'false',
    onclick: (ev) => { if (ev.target.closest('button,input,a')) return; toggleOpen(); },
    onkeydown: (ev) => { if (ev.target !== ev.currentTarget) return; if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggleOpen(); } },
  },
  draggable ? h('button', { class: 'handle', 'aria-label': '끌어서 순서 바꾸기', title: '끌어서 순서 바꾸기' }, GRIP()) : h('span'),
  chk,
  h('span', { class: `time${t.time || t.intervalMin ? '' : ' none'}` }, timeText),
  h('div', { class: 'ttl' }, h('span', { class: 't' }, t.title, h('span', { class: 'ttl-chev', 'aria-hidden': 'true' }, open ? '▴' : '▾')), meta.length ? h('span', { class: 'note' }, meta.join(' · ')) : null),
  right));
  if (ui.picking === t.id) {
    li.appendChild(h('div', { class: 'pick-row' }, assigneePicker(t.assignee, (id) => { ui.picking = null; act('PATCH', `/api/ui/tasks/${t.id}`, { assignee: id }, `${shortName(id)}에게 맡겼어요`); })));
  }
  if (open) li.appendChild(taskDetail(t, e));
  return li;
}

function stepsEditor(kind, item) {
  const isTask = kind === 'tasks';
  const steps = item.steps || [];
  const mode = item.stepMode === 'parallel' ? 'parallel' : 'serial';
  const machines = S.data.resources.filter((r) => r.kind === '기계' && r.status !== '꺼짐');
  const browsers = S.data.resources.filter((r) => r.kind === '브라우저' && r.status !== '꺼짐');
  const designs = S.data.resources.filter((r) => r.kind === '디자인' && r.status !== '꺼짐');
  const ossList = S.data.resources.filter((r) => r.kind === '오픈소스' && r.status !== '꺼짐');
  const doneCount = steps.filter((s) => s.status === '완료').length;
  const activeSet = new Set(
    mode === 'parallel'
      ? steps.filter((s) => s.status !== '완료').map((s) => s.id)
      : [steps.find((s) => s.status !== '완료')?.id].filter(Boolean),
  );
  const base = `/api/ui/${kind}/${item.id}`;
  const stepInput = h('input', { class: 'in sm', 'data-k': `wf-add-${kind}-${item.id}`, placeholder: '단계 추가 (예: 블렌더 3D 모델링 — AI·사무실·도구 자동 추천)', 'aria-label': '새 협업 단계' });
  const addStep = () => submitInput(stepInput, `wf-add-${kind}-${item.id}`, (v) => act('POST', `${base}/steps`, { title: v }, '단계를 추가했어요'));
  stepInput.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && !ev.isComposing) addStep(); });
  const folderInput = h('input', { class: 'in sm', value: item.sharedFolder || '', 'data-k': `wf-dir-${kind}-${item.id}`, placeholder: '공유 폴더 (선택, 예: ~/iCloud/영상편집)', 'aria-label': '공유 폴더' });
  const saveFolder = () => act('PATCH', base, { sharedFolder: folderInput.value.trim() }, '공유 폴더를 저장했어요');
  folderInput.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && !ev.isComposing) saveFolder(); });

  const moveStep = (idx, dir) => {
    const next = [...steps];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    act('PATCH', base, { steps: next }, '단계 순서를 바꿨어요');
  };

  const renderStep = (s, idx) => {
    const isAct = isTask && activeSet.has(s.id);
    const isDone = isTask && s.status === '완료';
    const patchStep = (patch, msg) => act('PATCH', `${base}/steps/${s.id}`, patch, msg);
    return h('li', { class: `wf-step${isDone ? ' done' : ''}${isAct ? ' active' : ''}`, 'data-step': s.id },
      h('div', { class: 'wf-top' },
        isTask ? h('input', { type: 'checkbox', class: 'chk', checked: isDone, 'aria-label': `${s.title} 완료`, onchange: (ev) => patchStep({ status: ev.target.checked ? '완료' : '대기' }, ev.target.checked ? `${idx + 1}단계 완료` : '대기로 되돌렸어요') }) : null,
        h('span', { class: `wf-num${isAct ? ' on' : ''}` }, String(idx + 1)),
        h('span', { class: 'wf-title' }, s.title),
        isAct ? h('span', { class: 'tag solid' }, mode === 'parallel' ? '동시 진행' : '지금 차례') : null,
        h('div', { class: 'wf-ord' },
          idx > 0 ? h('button', { type: 'button', class: 'btn link', 'aria-label': '위로', onclick: () => moveStep(idx, -1) }, '↑') : null,
          idx < steps.length - 1 ? h('button', { type: 'button', class: 'btn link', 'aria-label': '아래로', onclick: () => moveStep(idx, 1) }, '↓') : null,
          h('button', { type: 'button', class: 'x', 'aria-label': `${s.title} 지우기`, onclick: () => act('DELETE', `${base}/steps/${s.id}`, undefined, '단계를 지웠어요') }, '×'))),
      h('div', { class: 'wf-ctl' },
        h('select', { class: 'in sm', 'aria-label': `${s.title} 담당`, onchange: (ev) => patchStep({ assignee: ev.target.value || null }, '담당을 바꿨어요') },
          h('option', { value: '', selected: !s.assignee }, '담당 미정'),
          h('option', { value: 'jay', selected: s.assignee === 'jay' }, '나 (대표)'),
          S.data.employees.map((e) => h('option', { value: e.id, selected: s.assignee === e.id }, shortName(e.id)))),
        machines.length ? h('select', { class: 'in sm', 'aria-label': `${s.title} 사무실`, onchange: (ev) => patchStep({ resource: ev.target.value || null }, '사무실을 바꿨어요') },
          h('option', { value: '', selected: !s.resource }, '사무실 자동'),
          machines.map((m) => h('option', { value: m.id, selected: s.resource === m.id }, m.name))) : null,
        browsers.length ? h('select', { class: 'in sm', 'aria-label': `${s.title} 브라우저`, onchange: (ev) => patchStep({ browser: ev.target.value || null }, '브라우저를 바꿨어요') },
          h('option', { value: '', selected: !s.browser }, '브라우저 없음'),
          browsers.map((b) => h('option', { value: b.id, selected: s.browser === b.id }, b.name))) : null,
        designs.length ? h('select', { class: 'in sm', 'aria-label': `${s.title} 디자인`, onchange: (ev) => patchStep({ design: ev.target.value || null }, '디자인 스타일을 바꿨어요') },
          h('option', { value: '', selected: !s.design }, '디자인 기본'),
          designs.map((des) => h('option', { value: des.id, selected: s.design === des.id }, des.name))) : null),
      ossList.length ? h('div', { class: 'wf-tools' }, ossList.map((o) => {
        const has = (s.tools || []).includes(o.id);
        return h('button', {
          type: 'button', class: `chip sm${has ? ' on' : ''}`,
          onclick: () => {
            const next = has ? (s.tools || []).filter((x) => x !== o.id) : [...(s.tools || []), o.id];
            patchStep({ tools: next });
          },
        }, o.name);
      })) : null,
      s.note ? h('div', { class: 'small muted wf-note' }, s.note) : null,
      s.output ? h('div', { class: 'small wf-out' }, `결과: ${s.output}`) : null);
  };

  const sumText = steps.length
    ? `팀 분업 워크플로우 · ${isTask ? `${doneCount}/${steps.length} 완료` : `${steps.length}단계`} · ${mode === 'parallel' ? '동시에 함께' : '순서대로'}`
    : '팀으로 나눠 하기 (여러 AI · 사무실이 단계별 협업)';

  return h('details', { class: 'wf-box', 'data-k': `wf-${kind}-${item.id}`, open: steps.length > 0 ? true : undefined },
    h('summary', null, sumText),
    h('div', { class: 'wf-body' },
      h('div', { class: 'wf-bar' },
        h('div', { class: 'seg', role: 'group', 'aria-label': '협업 방식' },
          h('button', { type: 'button', class: mode === 'serial' ? 'on' : '', onclick: () => mode !== 'serial' && act('PATCH', base, { stepMode: 'serial' }, '순서대로(릴레이)로 바꿨어요') }, '순서대로'),
          h('button', { type: 'button', class: mode === 'parallel' ? 'on' : '', onclick: () => mode !== 'parallel' && act('PATCH', base, { stepMode: 'parallel' }, '동시에 함께(병렬)로 바꿨어요') }, '동시에 함께')),
        h('div', { class: 'wf-dir' }, folderInput, h('button', { type: 'button', class: 'btn sm', onclick: saveFolder }, '저장'))),
      !steps.length && (S.options.stepTemplates || []).length ? h('div', { class: 'wf-tpls' },
        h('span', { class: 'small muted' }, '예시로 채우기'),
        S.options.stepTemplates.map((tpl) => h('button', {
          type: 'button', class: 'chip',
          onclick: () => once(`tpl-${kind}-${item.id}-${tpl.key}`, () => act('POST', `${base}/steps/template`, { key: tpl.key }, `${tpl.label}을 채웠어요`)),
        }, tpl.label))) : null,
      steps.length ? h('ul', { class: 'wf-steps' }, steps.map(renderStep)) : null,
      h('div', { class: 'wf-add' }, stepInput, h('button', { type: 'button', class: 'btn sm dark', onclick: addStep }, '+ 추가'))));
}

// ───────── 프롬프트 중심 입력 도우미 (끼워넣기 + 자동 연결 1줄) ─────────

function insertAtCursor(ta, snippet) {
  const s = ta.selectionStart ?? ta.value.length;
  const e = ta.selectionEnd ?? ta.value.length;
  const before = ta.value.slice(0, s);
  const after = ta.value.slice(e);
  const padL = before && !/[\s(\[]$/.test(before) ? ' ' : '';
  const padR = after && !/^[\s,.)\]]/.test(after) ? ' ' : '';
  ta.value = `${before}${padL}${snippet}${padR}${after}`;
  const pos = s + padL.length + snippet.length;
  ta.focus();
  try { ta.setSelectionRange(pos, pos); } catch { /* ignore */ }
}

function promptInsertDrawer(ta, key) {
  const active = S.data.resources.filter((r) => r.status !== '꺼짐');
  const items = [
    ...active.filter((r) => r.kind === '브라우저').slice(0, 2).map((r) => ({ label: r.name, text: `${r.name} 사용해서` })),
    ...active.filter((r) => r.kind === '오픈소스').slice(0, 6).map((r) => ({ label: r.name, text: `${r.name} 오픈소스로` })),
    ...active.filter((r) => r.kind === '디자인').slice(0, 4).map((r) => ({ label: r.name, text: `${r.name} 스타일로` })),
    ...active.filter((r) => r.kind === '계정')
      .sort((a, b) => (b.spaceName ? 1 : 0) - (a.spaceName ? 1 : 0))
      .slice(0, 6)
      .map((r) => {
        const clean = r.name.split(' · ')[0].split(' (')[0];
        return { label: clean, text: r.spaceName ? `${clean} (${r.spaceName} 스페이스)` : clean };
      }),
    ...active.filter((r) => r.kind === '기계' && !r.isThisMac).slice(0, 2).map((r) => ({ label: r.name, text: `${r.name}에서` })),
  ];
  if (!items.length) return { btn: null, panel: null };
  const panel = h('div', { class: 'p-insert', style: ui.insertOpen[key] ? '' : 'display:none' },
    h('div', { class: 'picker' }, items.map((it) => h('button', {
      type: 'button', class: 'chip sm', onclick: () => { insertAtCursor(ta, it.text); ta.dispatchEvent(new Event('input')); },
    }, `+ ${it.label}`))));
  const btn = h('button', {
    type: 'button', class: `chip sm${ui.insertOpen[key] ? ' on' : ''}`,
    onclick: () => {
      ui.insertOpen[key] = !ui.insertOpen[key];
      panel.style.display = ui.insertOpen[key] ? '' : 'none';
      btn.classList.toggle('on', ui.insertOpen[key]);
      btn.textContent = ui.insertOpen[key] ? '끼워넣기 접기 ▴' : '+ 도구 · 디자인 · 계정 끼워넣기 ▾';
    },
  }, ui.insertOpen[key] ? '끼워넣기 접기 ▴' : '+ 도구 · 디자인 · 계정 끼워넣기 ▾');
  return { btn, panel };
}

function linkedSummaryLine(item) {
  const parts = [];
  const acc = item.account ? res(item.account) : null;
  const br = (item.browser ? res(item.browser) : null) || (acc ? ((acc.browser ? res(acc.browser) : null) || defaultBrowser()) : null);
  if (br && br.kind === '브라우저') parts.push(acc?.spaceName ? `${br.name} (${acc.spaceName})` : br.name);
  for (const tid of item.tools || []) {
    const o = res(tid);
    if (o) parts.push(o.command && /^npx\b/i.test(o.command) ? `${o.name} (npx)` : o.name);
  }
  const des = item.design ? res(item.design) : null;
  if (des) parts.push(`디자인: ${des.name}`);
  if (acc) parts.push(`${acc.name.split(' · ')[0].split(' (')[0]} (${accountSummaryText(acc)})`);
  const cost = Number(item.estCost) > 0 ? Number(item.estCost) : 0;
  if (cost) parts.push(`예상 ${won(cost)}`);
  if (!parts.length) return null;
  return h('div', { class: 'p-linked small muted' }, h('b', null, '자동 연결됨'), ' · ', parts.join(' · '));
}

function taskDetail(t, e) {
  const browsers = S.data.resources.filter((r) => r.kind === '브라우저' && r.status !== '꺼짐');
  const ossList = S.data.resources.filter((r) => r.kind === '오픈소스' && r.status !== '꺼짐');
  const designList = S.data.resources.filter((r) => r.kind === '디자인' && r.status !== '꺼짐');
  const accList = S.data.resources.filter((r) => r.kind === '계정' && r.status !== '꺼짐');
  const f = {
    title: h('input', { class: 'in sm', value: t.title, 'data-k': `e-title-${t.id}`, 'aria-label': '제목' }),
    time: h('input', { class: 'in sm', type: 'time', value: t.time || '', 'data-k': `e-time-${t.id}`, 'aria-label': '시간' }),
    date: h('input', { class: 'in sm', type: 'date', value: t.date, 'data-k': `e-date-${t.id}`, 'aria-label': '날짜' }),
    note: h('textarea', {
      class: 'in prompt-box', rows: 4, 'data-k': `e-note-${t.id}`, 'aria-label': '프롬프트 지시서',
      placeholder: 'AI에게 시킬 내용을 편하게 적어 주세요.\n예: Ego Lite 이메일 스페이스에서 새 영수증 요청 확인하고 초안만 저장해줘\n예: 모션 그래픽은 Hyperframes로 CONNECT AI 흑백 미니멀 스타일, 3D는 Blender로 해줘',
    }, t.note || ''),
    estCost: h('input', { class: 'in sm', inputmode: 'numeric', value: t.estCost ? String(t.estCost) : '', 'data-k': `e-cost-${t.id}`, placeholder: '예상 비용 (원, 선택)', 'aria-label': '예상 비용 (원)' }),
    resource: h('select', { class: 'in sm', 'data-k': `e-res-${t.id}`, 'aria-label': '리소스' }, h('option', { value: '' }, '사무실·리소스 자동'),
      S.data.resources.filter((r) => !['브라우저', '오픈소스', '디자인'].includes(r.kind)).map((r) => h('option', { value: r.id, selected: t.resource === r.id }, `${r.name} · ${r.status}`))),
    gate: h('select', { class: 'in sm', 'data-k': `e-gate-${t.id}`, 'aria-label': '대표 확인' }, h('option', { value: '' }, '확인 필요 없음'),
      S.options.gates.map((g) => h('option', { value: g, selected: t.gate === g }, `${g} · 대표 확인 필요`))),
  };
  const dirtyEl = h('span', { class: 'p-dirty' }, '');
  const isDirty = () => f.title.value !== t.title || f.note.value !== (t.note || '') || f.time.value !== (t.time || '') || f.date.value !== t.date || (f.estCost.value.trim() !== (t.estCost ? String(t.estCost) : ''));
  const syncDirty = () => { dirtyEl.textContent = isDirty() ? '저장 안 됨 · ⌘↵' : ''; };
  for (const el of [f.title, f.note, f.time, f.date, f.estCost]) el.addEventListener('input', syncDirty);

  const save = async (silent = false) => {
    const r = await act('PATCH', `/api/ui/tasks/${t.id}`, {
      title: f.title.value, time: f.time.value, date: f.date.value, note: f.note.value,
      estCost: f.estCost.value.trim() === '' ? null : f.estCost.value.trim(),
      resource: f.resource.value || null,
      ...(f.gate.value !== (t.gate || '') ? { gate: f.gate.value || null } : {}),
    }, silent ? null : '저장했어요');
    return r;
  };
  const flushIfDirty = async () => { if (isDirty()) await save(true); };
  f.title.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && !ev.isComposing) save(); });
  f.note.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); save(); } });

  const insDrawer = promptInsertDrawer(f.note, `t-${t.id}`);
  const accountPicker = accList.length ? h('div', { class: 'd-tools' }, h('span', { class: 'small muted' }, '연결 계정'),
    h('div', { class: 'picker' },
      h('button', { type: 'button', class: `chip sm${!t.account ? ' on' : ''}`, onclick: () => act('PATCH', `/api/ui/tasks/${t.id}`, { account: null }) }, '자동'),
      accList.map((a) => h('button', { type: 'button', class: `chip sm${t.account === a.id ? ' on' : ''}`, onclick: () => act('PATCH', `/api/ui/tasks/${t.id}`, { account: a.id }, `${a.name} 연결했어요`) }, a.name)))) : null;
  const browserPicker = browsers.length ? h('div', { class: 'd-tools' }, h('span', { class: 'small muted' }, '브라우저'),
    h('div', { class: 'picker' },
      h('button', { type: 'button', class: `chip sm${!t.browser ? ' on' : ''}`, onclick: () => act('PATCH', `/api/ui/tasks/${t.id}`, { browser: null }) }, '자동'),
      browsers.map((b) => h('button', { type: 'button', class: `chip sm${t.browser === b.id ? ' on' : ''}`, onclick: () => act('PATCH', `/api/ui/tasks/${t.id}`, { browser: b.id }, `${b.name}로 정했어요`) }, b.name)))) : null;
  const designPicker = designList.length ? h('div', { class: 'd-tools' }, h('span', { class: 'small muted' }, '디자인'),
    h('div', { class: 'picker' },
      h('button', { type: 'button', class: `chip sm${!t.design ? ' on' : ''}`, onclick: () => act('PATCH', `/api/ui/tasks/${t.id}`, { design: null }) }, '자동'),
      designList.map((dObj) => h('button', { type: 'button', class: `chip sm${t.design === dObj.id ? ' on' : ''}`, onclick: () => act('PATCH', `/api/ui/tasks/${t.id}`, { design: dObj.id }, `${dObj.name} 스타일을 적용했어요`) }, dObj.name)))) : null;
  const ossPicker = ossList.length ? h('div', { class: 'd-tools' }, h('span', { class: 'small muted' }, '오픈소스'),
    h('div', { class: 'picker' }, ossList.map((o) => {
      const has = (t.tools || []).includes(o.id);
      return h('button', {
        type: 'button', class: `chip sm${has ? ' on' : ''}`,
        onclick: () => {
          const next = has ? (t.tools || []).filter((x) => x !== o.id) : [...(t.tools || []), o.id];
          act('PATCH', `/api/ui/tasks/${t.id}`, { tools: next });
        },
      }, o.name);
    }))) : null;
  return h('div', { class: 'detail' },
    h('div', { class: 'd-grid' }, h('div', { class: 'span2' }, f.title), f.time, f.date),
    h('div', { class: 'p-wrap' },
      h('div', { class: 'p-toolbar' },
        h('div', { class: 'row' }, insDrawer.btn, dirtyEl),
        h('button', { type: 'button', class: 'btn link', onclick: () => openPromptPreview('tasks', t.id, flushIfDirty) }, '최종 지시서 미리보기')),
      insDrawer.panel,
      f.note,
      linkedSummaryLine(t)),
    h('div', { class: 'd-who' }, h('span', { class: 'small muted' }, '담당'), assigneePicker(t.assignee, (id) => act('PATCH', `/api/ui/tasks/${t.id}`, { assignee: id }, `${shortName(id)}에게 맡겼어요`))),
    h('div', { class: 'd-bar' },
      h('div', { class: 'row' },
        h('button', { class: 'btn sm', onclick: () => { if (confirm(`이 할 일을 지울까요?\n${t.title}`)) { ui.open = null; act('DELETE', `/api/ui/tasks/${t.id}`, undefined, '지웠어요'); } } }, '지우기'),
        !t.routineId ? h('button', { class: 'btn sm', onclick: () => once(`tor-${t.id}`, async () => { await flushIfDirty(); await act('POST', `/api/ui/tasks/${t.id}/to-routine`, {}, '매일 할 일에 넣었어요'); }) }, '매일 루틴으로') : null,
        h('select', { class: 'in sm', style: 'width:96px', 'aria-label': '상태', onchange: (ev) => act('PATCH', `/api/ui/tasks/${t.id}`, { status: ev.target.value }) },
          S.options.statuses.map((s) => h('option', { value: s, selected: s === t.status }, s)))),
      h('div', { class: 'row' },
        h('button', { class: 'btn sm dark', onclick: () => save() }, '저장'))),
    h('details', { class: 'adv-fold', 'data-k': `adv-${t.id}`, open: (t.steps || []).length > 0 ? true : undefined },
      h('summary', null, (t.steps || []).length ? `세부 설정 · 팀 분업 ${(t.steps || []).length}단계` : '세부 설정 · 수동 연결 · 팀 분업'),
      h('div', { class: 'adv-body' },
        h('div', { class: 'd-grid2' }, f.resource, f.gate),
        h('div', { class: 'd-grid2' }, f.estCost,
          h('label', { class: 'chk-l', style: 'align-self:center' },
            h('input', { type: 'checkbox', checked: Boolean(t.localOnly), onchange: (ev) => act('PATCH', `/api/ui/tasks/${t.id}`, { localOnly: ev.target.checked }, ev.target.checked ? '로컬 전용으로 잠갔어요 (외부 클라우드 AI 우회 금지)' : '로컬 전용을 해제했어요') }),
            '로컬 전용 (외부 AI 우회 금지)')),
        accountPicker, browserPicker, designPicker, ossPicker,
        stepsEditor('tasks', t))),
    t.reasonBy && /로컬 AI/.test(t.reasonBy) ? h('div', { class: 'small muted', style: 'margin-top:8px' }, `배분을 다시 본 것: ${t.reasonBy.replace(/ \(규칙 유지\)/, '')}`) : null,
    officeBox(t, e),
    e && !t.officeRun ? workBox(t, e, flushIfDirty) : null,
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
function workBox(t, e, flushIfDirty = null) {
  if (t.status === '완료' && !ui.handout[t.id]) return null;
  const locked = t.gate && !t.gateApprovedAt;
  const retryBtn = (t.status === '막힘' || t.queued) ? h('button', { class: 'btn sm', onclick: () => once(`retry-${t.id}`, () => act('POST', `/api/ui/tasks/${t.id}/retry`, {}, '대기 상태로 초기화했어요')) }, t.queued ? '대기열 해제' : '다시 시도') : null;
  if (canRun(e)) {
    const local = e.engine === 'local';
    return h('div', { class: 'work' },
      h('div', { class: 'small' }, local ? `${e.name}: 이 컴퓨터 안에서 바로 답해요.` : `${e.name}: 이 컴퓨터에서 한 번 실행해요 (작업 폴더 workspaces/${e.id}).`),
      t.queued && t.queueReason ? h('div', { class: 'small muted' }, `⏳ 대기열: ${t.queueReason}`) : null,
      locked ? h('div', { class: 'small muted' }, `${gateK(t.gate)} 들어간 일이라 대표 확인 뒤에 시킬 수 있어요.`) : null,
      h('div', { class: 'row' },
        h('button', { class: 'btn dark', 'data-act': 'run', disabled: isWorking(e.id) || locked,
          onclick: () => {
            if (local || confirm(`${e.name}: 지금 한 번 실행할까요?`)) {
              once(`run-${t.id}`, async () => {
                if (flushIfDirty) await flushIfDirty();
                const resRun = await act('POST', `/api/ui/tasks/${t.id}/run`, {});
                if (resRun?.queued) toast(`⏳ 대기열: ${resRun.reason || '여유 생기면 자동 시작해요'}`);
                else if (resRun?.rerouted) toast(`⚡ ${resRun.reason || `${resRun.office}로 우회했어요`}`);
                else if (resRun) toast(local ? `${josa(shortName(e.id), '이', '가')} 쓰는 중이에요` : `시켰어요: ${nameOf(resRun.empId || e.id)}`);
              });
            }
          } },
        isWorking(e.id) ? (local ? '쓰는 중 · 보통 10~50초' : '일하는 중') : local ? '지금 답 받기' : `${shortName(e.id)} 한 번 실행`),
        retryBtn));
  }
  const ho = ui.handout[t.id];
  const url = ho?.url || e.webUrl || '';
  const paste = h('textarea', { class: 'in', rows: 4, 'data-k': `paste-${t.id}`, placeholder: `${shortName(e.id)}에게 받은 답을 여기에 붙여 넣으세요`, 'aria-label': '받은 답' });
  const doneBox = h('input', { type: 'checkbox', checked: true, 'data-k': `paste-done-${t.id}`, 'aria-label': '끝난 일로 표시' });
  const getPrompt = () => once(`ho-${t.id}`, async () => {
    try {
      if (flushIfDirty) await flushIfDirty();
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
      url ? h('a', { class: 'btn', href: url, target: '_blank', rel: 'noopener noreferrer', 'data-act': 'open' }, `2. ${shortName(e.id)} 열기`) : null,
      retryBtn),
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
  setDlg(dlg, 
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
    el.dispatchEvent(new Event('input'));
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

// 담당 직접 선택(기본) + 컴퓨터 자동 최적화 실시간 미리보기 바
function createWhoBar(titleInput, pickKey) {
  const cur = () => ui[pickKey] || 'jay';
  const sugBox = h('div', { class: 'add-suggest', 'aria-live': 'polite' });
  let lastSug = null;
  let timer = null;
  let seq = 0;

  const btns = [];
  const addChip = (id, label, extraClass = '') => {
    const b = h('button', { type: 'button', class: `chip sm${extraClass}${cur() === id ? ' on' : ''}`, 'aria-pressed': cur() === id ? 'true' : 'false' }, label);
    btns.push([id, b]);
    return b;
  };
  const autoBtn = h('button', { type: 'button', class: `chip sm${cur() === 'auto' ? ' on' : ''}`, 'aria-pressed': cur() === 'auto' ? 'true' : 'false' }, '자동 추천');
  const picker = h('div', { class: 'picker', role: 'group', 'aria-label': '담당 선택' },
    addChip('jay', '나'),
    S.data.employees.map((e) => addChip(e.id, isEmpCooling(e) ? `${shortName(e.id)} (휴식)` : shortName(e.id), isEmpCooling(e) ? ' cool' : '')),
    autoBtn);
  btns.push(['auto', autoBtn]);

  const updateView = () => {
    const pick = cur();
    for (const [id, b] of btns) {
      const on = pick === id;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    const q = titleInput.value.trim();
    if (!q && (pick === 'jay' || pick === 'auto')) {
      autoBtn.textContent = '자동 추천';
      sugBox.classList.remove('show');
      sugBox.replaceChildren();
      return;
    }
    if (!lastSug) {
      if (pick !== 'jay' && pick !== 'auto') {
        sugBox.replaceChildren(h('b', null, shortName(pick)), ' 직접 지정 · 컴퓨터는 상태 보고 자동 최적화합니다');
        sugBox.classList.add('show');
      } else {
        sugBox.classList.remove('show');
        sugBox.replaceChildren();
      }
      return;
    }
    const sugWho = lastSug.assignee ? shortName(lastSug.assignee) : '미정';
    autoBtn.textContent = pick === 'auto' && q ? `자동 · → ${sugWho}` : '자동 추천';
    const extras = [];
    if (lastSug.browserName) extras.push(lastSug.spaceName ? `${lastSug.browserName} (${lastSug.spaceName})` : lastSug.browserName);
    if (lastSug.accountName) extras.push(lastSug.accountName.split(' · ')[0].split(' (')[0]);
    if (lastSug.designName) extras.push(`디자인: ${lastSug.designName}`);
    for (const tn of lastSug.toolNames || []) extras.push(tn);
    if (lastSug.gate) extras.push(`${lastSug.gate} 확인 필요`);

    const mh = lastSug.machineHealth;
    const compText = lastSug.machineQueued
      ? `컴퓨터 과부하(${mh?.ramPct ?? '?'}%) · 실행 시 대기열 보호`
      : lastSug.machineRerouted && lastSug.machineReason
        ? `⚡ ${lastSug.machineReason}`
        : lastSug.resourceName
          ? `컴퓨터 자동: ${lastSug.resourceName}${typeof mh?.ramPct === 'number' ? ` (RAM ${mh.ramPct}% · ${healthLabel(mh.level)})` : ''}`
          : '';

    sugBox.replaceChildren();
    if (pick === 'auto') {
      sugBox.append(
        '자동 추천 → ',
        h('b', null, sugWho),
        lastSug.reason ? ` · ${lastSug.reason}` : '',
        compText ? ` · ${compText}` : '',
        extras.length ? ` · 연결: ${extras.join(', ')}` : '');
      sugBox.classList.add('show');
    } else if (pick === 'jay') {
      if (extras.length) {
        sugBox.append(h('b', null, '나'), ' 직접 할 일 · 연결: ', extras.join(', '));
        sugBox.classList.add('show');
      } else {
        sugBox.classList.remove('show');
      }
    } else {
      const cool = lastSug.empCooldown;
      sugBox.append(
        h('b', null, shortName(pick)),
        cool
          ? ` 토큰 휴식 중(${cool.remainingMin}분 남음${cool.fallbackName ? ` · 실행 시 ${shortName(cool.fallbackId)}로 자동 전환` : ''})`
          : ' 직접 지정',
        compText ? ` · ${compText}` : '',
        extras.length ? ` · 연결: ${extras.join(', ')}` : '');
      sugBox.classList.add('show');
    }
  };

  const fetchSuggest = () => {
    const q = titleInput.value.trim();
    const pick = cur();
    if (!q && (pick === 'jay' || pick === 'auto')) { lastSug = null; updateView(); return; }
    const mySeq = ++seq;
    fetch('/api/ui/assign/suggest', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-HQ-UI': '1' },
      body: JSON.stringify({ title: q, assignee: pick }),
    }).then((r) => (r.ok ? r.json() : null)).then((s) => {
      if (mySeq !== seq || !s) return;
      lastSug = s;
      updateView();
    }).catch(() => { /* 조용히 무시 */ });
  };

  for (const [id, b] of btns) {
    b.addEventListener('click', () => {
      ui[pickKey] = id;
      updateView();
      fetchSuggest();
      titleInput.focus();
    });
  }

  titleInput.addEventListener('input', () => {
    clearTimeout(timer);
    if (!titleInput.value.trim() && (cur() === 'jay' || cur() === 'auto')) { lastSug = null; updateView(); return; }
    timer = setTimeout(fetchSuggest, 160);
  });

  const wrap = h('div', null,
    h('div', { class: 'add-who' }, h('span', { class: 'small muted' }, '담당'), picker),
    sugBox);
  wrap.resetSuggest = () => { lastSug = null; updateView(); if (cur() !== 'jay' && cur() !== 'auto') fetchSuggest(); };
  setTimeout(() => { if (titleInput.value.trim() || (cur() !== 'jay' && cur() !== 'auto')) fetchSuggest(); }, 20);
  return wrap;
}

function addBar() {
  const title = h('input', { class: 'in big', placeholder: '할 일을 적어 주세요 (아래에서 담당 직접 선택 · 컴퓨터는 자동 최적화)', 'data-k': 'add-title', 'aria-label': '새 할 일' });
  const time = h('input', { class: 'in big', type: 'time', 'data-k': 'add-time', 'aria-label': '시간 (선택)' });
  const whoBar = createWhoBar(title, 'taskPick');
  const add = async () => {
    const tm = time.value;
    const picked = ui.taskPick || 'jay';
    const r = await submitInput(title, 'add-task', (v) => {
      time.value = '';
      return act('POST', '/api/ui/tasks', { title: v, time: tm, date: S.today, assignee: picked });
    });
    if (r) {
      whoBar.resetSuggest();
      const comp = r.resource && res(r.resource) ? ` · ${res(r.resource).name}` : '';
      toast(picked === 'auto' ? (r.reason ? `${shortName(r.assignee)}에게 맡겼어요 · ${r.reason}` : '추가했어요') : `${shortName(r.assignee)}에게 맡겼어요${comp}`);
      document.querySelector('[data-k="add-title"]')?.focus();
    }
  };
  title.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) add(); });
  return h('div', null,
    h('div', { class: 'addbar' },
      title, time,
      h('button', { class: `mic-sm${ui.listening ? ' on' : ''}`, 'aria-label': ui.listening ? '듣기 멈추기' : '말로 적기', 'aria-pressed': ui.listening ? 'true' : 'false', title: '말로 적기', onclick: () => toggleMic(title) }, MIC_SVG()),
      h('button', { class: 'btn dark big', onclick: add }, '추가')),
    whoBar);
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
      h('button', { class: 'btn sm', onclick: () => openTaskById(tid) }, '열기'));
    })) : h('div', { class: 'empty' }, '아직 대화가 없습니다'));
}

// 오늘 목록: 필터 + 끝난 일 접기 + 30개가 넘으면 담당별 묶음
function todayList(today) {
  const f = ui.homeFilter || 'all';
  const mineCount = today.filter((t) => t.assignee === 'jay' && t.status !== '완료').length;
  const aiCount = today.filter((t) => t.assignee !== 'jay' && t.status !== '완료').length;
  const gateCount = today.filter((t) => ((t.gate && !t.gateApprovedAt) || S.data.approvals.some((a) => a.status === '대기' && a.taskId === t.id)) && t.status !== '완료').length;
  const filterTabs = [
    ['all', `전체 (${today.length})`],
    ['me', `나 (${mineCount})`],
    ['ai', `AI (${aiCount})`],
    ...(gateCount || f === 'gate' ? [['gate', `확인 대기 (${gateCount})`]] : []),
  ];
  const filterBar = h('div', { class: 'filter-bar', role: 'group', 'aria-label': '오늘 할 일 보기' },
    filterTabs.map(([k, label]) => h('button', {
      type: 'button', class: `chip sm${f === k ? ' on' : ''}`, 'aria-pressed': f === k ? 'true' : 'false',
      onclick: () => { ui.homeFilter = k; render(); },
    }, label)));

  const filtered = today.filter((t) => {
    if (f === 'me') return t.assignee === 'jay';
    if (f === 'ai') return t.assignee !== 'jay';
    if (f === 'gate') return (t.gate && !t.gateApprovedAt) || S.data.approvals.some((a) => a.status === '대기' && a.taskId === t.id);
    return true;
  });
  const open = filtered.filter((t) => t.status !== '완료');
  const done = filtered.filter((t) => t.status === '완료');
  const doneBox = done.length ? h('details', {
    class: 'done-box', 'data-k': 'done-box', open: ui.doneOpen ? true : undefined,
    ontoggle: (ev) => { ui.doneOpen = ev.target.open; },
  }, h('summary', null, `끝난 일 ${done.length}개`), taskList(done, { draggable: false })) : null;

  if (filtered.length <= 30) {
    return h('div', null, filterBar, open.length ? taskList(open, { draggable: f === 'all' }) : h('div', { class: 'empty' }, f === 'all' ? '남은 일이 없습니다.' : '해당하는 할 일이 없습니다.'), doneBox);
  }
  const order = ['jay', ...S.data.employees.map((e) => e.id), null];
  const keyOf = (t) => (t.assignee === 'jay' || emp(t.assignee) ? t.assignee : null);
  const groups = order.map((id) => [id, open.filter((t) => keyOf(t) === id)]).filter(([, l]) => l.length);
  return h('div', null,
    filterBar,
    groups.map(([id, list]) => h('div', { class: 'grp-list' }, h('div', { class: 'grp-name' }, `${id === 'jay' ? '나' : id ? shortName(id) : '담당 미정'} · ${list.length}`), taskList(list))),
    doneBox);
}

// 아침/오늘 보고 1줄 띠: AI 완료·확인 대기·막힘이 있을 때만 조용히 표시, 확인 누르면 사라짐
function morningBriefing(today) {
  const d = S.data;
  const aiDone = today.filter((t) => t.assignee !== 'jay' && t.status === '완료');
  const waiting = d.tasks.filter((t) => t.gate && !t.gateApprovedAt && t.status !== '완료' && t.assignee !== 'jay');
  const pendingAppr = d.approvals.filter((a) => a.status === '대기');
  const stuck = d.tasks.filter((t) => t.status === '막힘' && t.assignee !== 'jay');
  const total = aiDone.length + waiting.length + stuck.length + pendingAppr.length;
  if (!total) return null;
  const sig = `${S.today}:${aiDone.map((x) => x.id).join(',')}:${waiting.map((x) => x.id).join(',')}:${stuck.map((x) => x.id).join(',')}:${pendingAppr.map((x) => x.id).join(',')}`;
  try { if (localStorage.getItem('aihq_brief_ack') === sig) return null; } catch { /* ignore */ }
  const parts = [];
  if (aiDone.length) parts.push(`AI 완료 ${aiDone.length}`);
  if (waiting.length + pendingAppr.length) parts.push(`확인 대기 ${waiting.length + pendingAppr.length}`);
  if (stuck.length) parts.push(`막힘 ${stuck.length}`);
  const items = [...waiting.map((t) => ({ tag: `${t.gate} 확인`, t })), ...stuck.map((t) => ({ tag: '막힘', t })), ...aiDone.map((t) => ({ tag: '완료', t }))];
  return h('div', { class: 'briefing' },
    h('div', { class: 'briefing-bar' },
      h('div', { class: 'small' }, h('b', null, '오늘 AI 보고'), ' · ', parts.join(' · ')),
      h('div', { class: 'row' },
        items.length ? h('button', { class: 'btn sm', onclick: () => { ui.briefOpen = !ui.briefOpen; render(); } }, ui.briefOpen ? '접기' : '보기') : null,
        h('button', { class: 'btn sm dark', onclick: () => { try { localStorage.setItem('aihq_brief_ack', sig); } catch { /* ignore */ } ui.briefOpen = false; render(); } }, '확인'))),
    ui.briefOpen && items.length ? h('ul', { class: 'briefing-list' }, items.map(({ tag, t }) => h('li', { class: 'row', style: 'justify-content:space-between' },
      h('span', null, h('span', { class: 'tag', style: 'margin-right:8px' }, tag), t.title, ' ', h('span', { class: 'small muted' }, shortName(t.assignee))),
      h('button', { class: 'btn link', onclick: () => openTaskById(t.id) }, '열기')))) : null);
}

async function openDailyReport() {
  const dlg = document.getElementById('dlg');
  dlg.className = 'wide';
  setDlg(dlg, h('h3', null, '오늘의 자율 회사 리포트'), h('div', { class: 'small muted' }, '정리하는 중…'));
  dlg.showModal();
  try {
    const rep = await api('GET', '/api/ui/report/daily');
    setDlg(dlg, 
      h('h3', null, '오늘의 자율 회사 리포트'),
      h('p', { class: 'small muted', style: 'margin:-8px 0 14px' }, '매출 금액·계정 정보는 빼고 오늘 AI가 일한 숫자만 담았어요. 방송 오프닝이나 커뮤니티 인증에 바로 붙여 넣으세요.'),
      h('pre', { class: 'report-pre' }, rep.text),
      h('div', { class: 'bar' },
        h('button', { class: 'btn', onclick: () => { dlg.className = ''; dlg.close(); } }, '닫기'),
        h('button', { class: 'btn dark', onclick: async () => { await copyText(rep.text); toast('리포트를 복사했어요'); } }, '리포트 복사')));
  } catch {
    dlg.className = '';
    dlg.close();
  }
}

function approvalInlineCard(a) {
  const hasDraft = a.draft !== null && a.draft !== undefined && a.draft !== '';
  const draftEl = hasDraft ? h('textarea', { class: 'in sm', rows: 3, 'data-k': `appr-draft-${a.id}`, 'aria-label': '보낼 초안 수정' }, a.draft) : null;
  const linkedTask = a.taskId ? S.data.tasks.find((t) => t.id === a.taskId) : null;
  return h('div', { class: 'appr-inline' },
    h('div', { class: 'row', style: 'justify-content:space-between;align-items:flex-start' },
      h('div', { style: 'min-width:0;flex:1' },
        h('div', { style: 'font-size:15px;font-weight:600' },
          a.accountName ? h('span', { class: 'tag', style: 'margin-right:8px' }, `${a.accountName}${a.accountAction ? ` · ${a.accountAction}` : ''}`) : null,
          a.what),
        h('div', { class: 'small muted', style: 'margin-top:3px' }, [a.kind, nameOf(a.from), linkedTask ? `할 일: ${linkedTask.title}` : '', stamp(a.requestedAt)].filter(Boolean).join(' · '))),
      linkedTask ? h('button', { type: 'button', class: 'btn link', onclick: () => openTaskById(linkedTask.id) }, '할 일 열기') : null),
    a.original ? h('div', { class: 'orig' }, `원본 · ${a.original}`) : null,
    draftEl ? h('label', { class: 'field' }, h('span', { class: 'small muted' }, '보낼 초안 (수정 후 승인 가능)'), draftEl) : null,
    h('div', { class: 'row', style: 'justify-content:flex-end' },
      h('button', { type: 'button', class: 'btn sm', onclick: () => once(`ap-r-${a.id}`, () => act('POST', `/api/ui/approvals/${a.id}/decide`, { decision: '반려' }, '반려했어요')) }, '반려'),
      h('button', { type: 'button', class: 'btn sm dark', onclick: () => once(`ap-a-${a.id}`, () => act('POST', `/api/ui/approvals/${a.id}/decide`, { decision: '승인', ...(draftEl ? { finalText: draftEl.value } : {}) }, '승인했어요')) }, '승인')));
}

function pageHome() {
  const d = S.data;
  const day = new Date(`${S.today}T12:00:00`);
  const sorter = (a, b) => a.order - b.order;
  const today = d.tasks.filter((t) => t.date === S.today).sort(sorter);
  const overdue = d.tasks.filter((t) => t.date < S.today && t.status !== '완료').sort((a, b) => a.date.localeCompare(b.date) || sorter(a, b));
  const later = d.tasks.filter((t) => t.date > S.today).sort((a, b) => a.date.localeCompare(b.date) || sorter(a, b)).slice(0, 20);
  const pendingApprs = d.approvals.filter((a) => a.status === '대기');
  const mine = today.filter((t) => t.assignee === 'jay');
  const ai = today.filter((t) => t.assignee !== 'jay');
  const ownerLabel = d.owner.name ? `${d.owner.name} 대표님` : '대표님';
  return h('div', null,
    h('div', { class: 'head' }, h('div', null,
      h('h1', null, `${greeting()}, `, h('b', null, ownerLabel)),
      h('div', { class: 'sub' }, `${day.getMonth() + 1}월 ${day.getDate()}일 ${WD[day.getDay()]}요일 · 내가 할 일 ${mine.filter((t) => t.status !== '완료').length} · AI 직원이 할 일 ${ai.filter((t) => t.status !== '완료').length}`)),
    h('button', { class: 'btn sm', onclick: openDailyReport }, '오늘 리포트')),
    morningBriefing(today),
    addBar(),
    h('p', { class: 'rule' }, '결제, 업로드, 게시, 삭제, 메시지 발송이 들어간 일은 대표가 누를 때까지 AI가 시작하지 못합니다.'),
    !d.employees.length ? h('div', { class: 'callout' },
      h('div', null, h('b', null, '먼저 쓰는 AI를 직원으로 추가하세요.'), h('div', { class: 'small muted' }, 'ChatGPT, Claude, Gemini 처럼 이미 쓰는 AI를 고르면, 적은 일을 알맞은 AI에게 나눠 줍니다.')),
      h('button', { class: 'btn dark', onclick: openAddEmployee }, '직원 추가')) : null,
    pendingApprs.length ? h('section', { class: 'sec' }, secHead('대표 확인 대기', `${pendingApprs.length}건 · 승인 전에 내용을 고칠 수 있어요`),
      pendingApprs.map(approvalInlineCard)) : null,
    overdue.length ? h('section', { class: 'sec' }, secHead('지난 날짜, 아직 안 끝남', `${overdue.length}개`), taskList(overdue, { draggable: false, overdue: true })) : null,
    h('section', { class: 'sec' }, secHead(`오늘 · ${dateK(S.today)}`, `${today.filter((t) => t.status === '완료').length}/${today.length} 완료`),
      today.length ? todayList(today) : h('div', { class: 'empty' }, '오늘 할 일이 없습니다. 위에 적어 보세요.')),
    later.length ? h('section', { class: 'sec' }, secHead('예정', `${later.length}개`), taskList(later, { draggable: false })) : null,
    h('div', { class: 'cols home-foot' }, timeline(), recentTalk()));
}

// ───────── 워크플로우 청사진 공유 (수강생·팀 배포용) ─────────

async function openBlueprintExport() {
  const dlg = document.getElementById('dlg');
  dlg.className = 'wide';
  setDlg(dlg, h('h3', null, '워크플로우 청사진 내보내기'), h('div', { class: 'small muted' }, '개인 정보를 제거하고 청사진을 만드는 중…'));
  dlg.showModal();
  try {
    const bp = await api('GET', '/api/ui/blueprint/export');
    const jsonText = JSON.stringify(bp, null, 2);
    const download = () => {
      const blob = new Blob([jsonText], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `connect-ai-hq-blueprint-${S.today}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast('청사진 JSON 파일을 저장했어요');
    };
    setDlg(dlg, 
      h('h3', null, '워크플로우 청사진 내보내기'),
      h('p', { class: 'small muted', style: 'margin:-8px 0 12px' }, '로컬 파일 경로, 이메일, API 키, 매출 기록, 개인 루틴은 모두 자동으로 제거했습니다. 수강생이나 팀원에게 안전하게 공유할 수 있어요.'),
      h('div', { class: 'row', style: 'margin-bottom:12px' },
        h('span', { class: 'tag' }, `오픈소스 ${(bp.openSource || []).length}개`),
        h('span', { class: 'tag' }, `디자인 ${(bp.designs || []).length}개`),
        h('span', { class: 'tag' }, `계정 틀 ${(bp.accounts || []).length}개`),
        h('span', { class: 'tag' }, `AI 루틴 ${(bp.routines || []).length}개`)),
      h('pre', { class: 'report-pre mono' }, jsonText),
      h('div', { class: 'bar' },
        h('button', { class: 'btn', onclick: () => { dlg.className = ''; dlg.close(); } }, '닫기'),
        h('button', { class: 'btn', onclick: download }, '파일 저장 (.json)'),
        h('button', { class: 'btn dark', onclick: async () => { await copyText(jsonText); toast('워크플로우 청사진을 복사했어요'); } }, 'JSON 복사')));
  } catch {
    dlg.className = '';
    dlg.close();
  }
}

function openBlueprintImport() {
  const dlg = document.getElementById('dlg');
  dlg.className = 'wide';
  const ta = h('textarea', { class: 'in mono', rows: 10, placeholder: '공유받은 청사진 JSON을 붙여 넣거나, 아래에서 .json 파일을 골라 주세요.', 'aria-label': '청사진 JSON' });
  const fileIn = h('input', { type: 'file', accept: '.json,application/json', 'aria-label': '청사진 파일 선택', onchange: async (ev) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    ta.value = await file.text();
  } });
  const doImport = () => once('bp-import', async () => {
    const raw = ta.value.trim();
    if (!raw) { ta.focus(); return; }
    let parsed;
    try { parsed = JSON.parse(raw); } catch { toast('올바른 JSON 형식이 아니에요'); return; }
    dlg.className = '';
    dlg.close();
    const res = await act('POST', '/api/ui/blueprint/import', { blueprint: parsed });
    if (res?.added) {
      const a = res.added;
      const sum = [];
      if (a.employees) sum.push(`직원 ${a.employees}`);
      if (a.openSource) sum.push(`오픈소스 ${a.openSource}`);
      if (a.designs) sum.push(`디자인 ${a.designs}`);
      if (a.accounts) sum.push(`계정 ${a.accounts}`);
      if (a.routines) sum.push(`루틴 ${a.routines}`);
      toast(sum.length ? `청사진을 가져왔어요 · ${sum.join(' · ')}` : '이미 모든 항목이 들어 있어요');
    }
  });
  setDlg(dlg, 
    h('h3', null, '워크플로우 청사진 가져오기'),
    h('p', { class: 'small muted', style: 'margin:-8px 0 12px' }, '같은 이름의 직원·도구·루틴은 건너뛰고, 새로 추가되는 워크플로우만 안전하게 담아옵니다.'),
    h('div', { class: 'row', style: 'margin-bottom:10px' }, fileIn),
    ta,
    h('div', { class: 'bar' },
      h('button', { class: 'btn', onclick: () => { dlg.className = ''; dlg.close(); render(); } }, '취소'),
      h('button', { class: 'btn dark', onclick: doImport }, '가져오기')));
  dlg.showModal();
  ta.focus();
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

function dots7(r) {
  const today = new Date(`${S.today}T12:00:00`);
  const items = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const done = r.log?.[key] === '완료';
    const sched = (r.days || []).includes(d.getDay());
    items.push(h('i', { class: done ? 'ok' : sched ? 'miss' : '', title: `${key} ${done ? '완료' : sched ? '기록 없음' : '쉬는 날'}` }));
  }
  return h('span', { class: 'dots7', 'aria-label': '최근 7일 기록' }, items);
}

function pageDaily() {
  const d = S.data;
  const visible = d.routines.filter((r) => !r.feature || features()[r.feature]);
  const ivList = S.options.intervalMins || [5, 15, 30, 60];
  const curSched = ui.rtSched || 'time';
  const title = h('input', { class: 'in', placeholder: '예: 이메일 체크, 8시 영상 편집 (아래에서 담당 직접 선택 가능)', 'data-k': 'rt-title', 'aria-label': '매일 할 일' });
  const schedSel = h('select', { class: 'in', 'data-k': 'rt-sched', style: 'width:128px', 'aria-label': '반복 주기' },
    h('option', { value: 'time', selected: curSched === 'time' }, '매일 시각'),
    ivList.map((m) => h('option', { value: String(m), selected: curSched === String(m) }, m === 60 ? '1시간마다' : `${m}분마다`)));
  const time = h('input', { class: 'in', type: 'time', 'data-k': 'rt-time', style: `width:126px;${curSched === 'time' ? '' : 'display:none'}`, 'aria-label': '시간' });
  const addBarEl = h('div', { class: `addbar rt-add${curSched === 'time' ? '' : ' iv-mode'}` });
  schedSel.addEventListener('change', () => {
    ui.rtSched = schedSel.value;
    const isIv = schedSel.value !== 'time';
    time.style.display = isIv ? 'none' : '';
    addBarEl.classList.toggle('iv-mode', isIv);
  });
  const whoBar = createWhoBar(title, 'rtPick');
  const days = dayPicker([0, 1, 2, 3, 4, 5, 6]);
  const add = async () => {
    const iv = schedSel.value === 'time' ? null : Number(schedSel.value);
    const tm = iv ? '' : time.value;
    const picked = ui.rtPick || 'jay';
    const r = await submitInput(title, 'add-routine', (v) => {
      time.value = '';
      return act('POST', '/api/ui/routines', { title: v, time: tm, intervalMin: iv, days: days.getDays(), assignee: picked });
    });
    if (r) {
      whoBar.resetSuggest();
      const comp = r.resource && res(r.resource) ? ` · ${res(r.resource).name}` : '';
      toast(picked === 'auto' ? (r.reason ? `${shortName(r.assignee)}에게 맡겼어요 · ${r.reason}` : '추가했어요') : `${shortName(r.assignee)}에게 맡겼어요${comp}`);
    }
  };
  title.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) add(); });
  addBarEl.append(title, schedSel, time, h('button', { class: 'btn dark', onclick: add }, '추가'));

  const row = (r) => {
    const e = emp(r.assignee);
    const human = r.assignee === 'jay';
    const picking = ui.rtPicking === r.id;
    const todayTask = d.tasks.find((t) => t.date === S.today && t.routineId === r.id);
    const schedText = r.intervalMin ? (r.intervalMin === 60 ? '1시간마다 반복' : `${r.intervalMin}분마다 반복`) : (r.time || '시간 없음');
    const autoText = human ? null : !e ? '담당을 고르면 매일 아침 그 직원의 할 일로 들어갑니다'
      : e.runMode === 'auto' && canRun(e) ? `자동 실행 · ${r.intervalMin ? `${r.intervalMin}분마다 다시 확인합니다` : '시간이 되면 혼자 시작합니다'}`
        : `할 일로만 들어감 · ${e.name} 자동 실행 ${RUN_LABEL[e.runMode]}`;

    const rTitle = h('input', { class: 'in sm', value: r.title, 'data-k': `rt-ttl-${r.id}`, 'aria-label': '루틴 이름', style: 'flex:1;min-width:180px' });
    const rCost = !human ? h('input', { class: 'in sm', inputmode: 'numeric', value: r.estCost ? String(r.estCost) : '', 'data-k': `rt-cost-${r.id}`, placeholder: '예상 비용 (원)', style: 'width:128px', 'aria-label': '예상 비용 (원)' }) : null;
    const rDays = dayPicker(r.days || [0, 1, 2, 3, 4, 5, 6]);
    const ins = h('textarea', {
      class: 'in prompt-box', rows: 4, 'data-k': `rt-ins-${r.id}`, 'aria-label': '프롬프트 지시서',
      placeholder: 'AI에게 시킬 내용을 편하게 적어 주세요.\n예: 5분마다 Ego Lite 이메일 스페이스에서 새 메일과 영수증 요청 확인하고 초안만 저장해줘\n예: 8시 영상 편집 — 모션 그래픽은 Hyperframes로 미니멀 스타일, 3D는 Office 1에서 Blender로 해줘',
    }, r.instruction || '');
    const rTime = h('input', { class: 'in sm', type: 'time', value: r.time || '', 'data-k': `rt-tm-${r.id}`, style: `width:120px;${r.intervalMin ? 'display:none' : ''}`, 'aria-label': '실행 시각' });
    const rSched = !human ? h('select', { class: 'in sm', 'data-k': `rt-iv-${r.id}`, style: 'width:120px', 'aria-label': '반복 주기', onchange: (ev) => {
      const v = ev.target.value;
      if (v === 'time') { rTime.style.display = ''; act('PATCH', `/api/ui/routines/${r.id}`, { intervalMin: null }, '매일 시각 방식으로 바꿨어요'); }
      else { rTime.style.display = 'none'; act('PATCH', `/api/ui/routines/${r.id}`, { intervalMin: Number(v) }, `${v}분마다 반복으로 바꿨어요`); }
    } },
      h('option', { value: 'time', selected: !r.intervalMin }, '매일 시각'),
      ivList.map((m) => h('option', { value: String(m), selected: r.intervalMin === m }, m === 60 ? '1시간마다' : `${m}분마다`))) : null;
    rTime.addEventListener('change', () => act('PATCH', `/api/ui/routines/${r.id}`, { time: rTime.value || null }, '시간을 바꿨어요'));

    const dirtyEl = h('span', { class: 'p-dirty' }, '');
    const isDirty = () => rTitle.value !== r.title || (!human && (ins.value !== (r.instruction || '') || (rCost && rCost.value.trim() !== (r.estCost ? String(r.estCost) : ''))));
    const syncDirty = () => { dirtyEl.textContent = isDirty() ? '저장 안 됨 · ⌘↵' : ''; };
    rTitle.addEventListener('input', syncDirty);
    if (!human) {
      ins.addEventListener('input', syncDirty);
      if (rCost) rCost.addEventListener('input', syncDirty);
    }
    const saveRoutine = async (silent = false) => {
      const body = { title: rTitle.value, days: rDays.getDays() };
      if (!human) {
        body.instruction = ins.value;
        if (rCost) body.estCost = rCost.value.trim() === '' ? null : rCost.value.trim();
      }
      return act('PATCH', `/api/ui/routines/${r.id}`, body, silent ? null : '저장했어요');
    };
    const flushRoutine = async () => { if (isDirty()) await saveRoutine(true); };
    rTitle.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && !ev.isComposing) saveRoutine(); });
    ins.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); saveRoutine(); } });

    const insDrawer = !human ? promptInsertDrawer(ins, `r-${r.id}`) : null;
    const relay = !human ? h('div', { class: 'r-relay' },
      h('span', null, '끝나면 넘기기'),
      h('select', { class: 'in sm', 'aria-label': '끝나면 넘기기', onchange: (ev) => act('PATCH', `/api/ui/routines/${r.id}`, { nextAssignee: ev.target.value || null }, '바꿨어요') },
        h('option', { value: '' }, '넘기지 않음'),
        h('option', { value: 'jay', selected: r.nextAssignee === 'jay' }, '나 (대표 확인)'),
        d.employees.filter((x) => x.id !== r.assignee).map((x) => h('option', { value: x.id, selected: r.nextAssignee === x.id }, x.name)))) : null;
    const toolNames = [res(r.resource)?.name, res(r.browser)?.name, res(r.design)?.name, ...(r.tools || []).map((id) => res(id)?.name)].filter(Boolean);
    const stepOffices = [...new Set((r.steps || []).map((s) => res(s.resource)?.name).filter(Boolean))];
    const stepSummary = (r.steps || []).length ? `${r.steps.length}단계 협업${stepOffices.length ? ` (${stepOffices.join(' · ')})` : ''}` : '';
    const foldLabel = human ? '편집 · 8주 기록' : [
      r.instruction ? '프롬프트 (지시서)' : '프롬프트 쓰기',
      (r.steps || []).length ? `팀 분업 ${(r.steps || []).length}단계` : '',
      r.nextAssignee ? `끝나면 → ${shortName(r.nextAssignee)}` : '',
      '8주 기록',
    ].filter(Boolean).join(' · ');
    const whoBtn = h('button', {
      type: 'button', class: `who-chip${r.assignee === 'jay' ? '' : r.assignee ? ' ai' : ' none'}`,
      'aria-expanded': picking ? 'true' : 'false', title: '눌러서 담당 바꾸기',
      onclick: () => { ui.rtPicking = picking ? null : r.id; render(); },
    }, shortName(r.assignee));

    return h('li', { class: `routine${r.enabled === false ? ' off' : ''}` },
      h('div', { class: 'r-top' },
        h('div', { class: 'r-main' },
          h('div', { class: 'r-title' }, r.title),
          h('div', { class: 'small muted' }, [daysText(r.days), schedText, r.where, stepSummary, ...toolNames].filter(Boolean).join(' · '))),
        h('div', { class: 'r-ctl' },
          whoBtn,
          dots7(r),
          human ? h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: r.alarm, onchange: (ev) => act('PATCH', `/api/ui/routines/${r.id}`, { alarm: ev.target.checked }) }), h('span', { class: 'tr' }), '알람') : null,
          h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: r.enabled !== false, onchange: (ev) => act('PATCH', `/api/ui/routines/${r.id}`, { enabled: ev.target.checked }) }), h('span', { class: 'tr' }), '켜짐'),
          h('button', { class: 'x', 'aria-label': `${r.title} 지우기`, onclick: () => { if (confirm(`이 매일 할 일을 지울까요?\n${r.title}`)) act('DELETE', `/api/ui/routines/${r.id}`, undefined, '지웠어요'); } }, '×'))),
      picking ? h('div', { class: 'r-who' }, assigneePicker(r.assignee, (id) => { ui.rtPicking = null; act('PATCH', `/api/ui/routines/${r.id}`, { assignee: id }, `${shortName(id)}에게 맡겼어요`); })) : null,
      h('div', { class: 'small muted', style: 'margin-top:6px' }, [r.reason, autoText].filter(Boolean).join(' · ')),
      h('details', { 'data-k': `rt-d-${r.id}`, style: 'margin-top:10px' }, h('summary', null, foldLabel),
        h('div', { class: 'r-fold' },
          h('div', { class: 'r-sched-row' }, rTitle, rSched, rTime, rCost),
          h('div', { class: 'r-sched-row' }, h('span', { class: 'small muted' }, '요일'), rDays),
          !human ? h('div', { class: 'p-wrap' },
            h('div', { class: 'p-toolbar' },
              h('div', { class: 'row' }, insDrawer.btn, dirtyEl),
              h('button', { type: 'button', class: 'btn link', onclick: () => openPromptPreview('routines', r.id, flushRoutine) }, '최종 지시서 미리보기')),
            insDrawer.panel,
            ins,
            linkedSummaryLine(r),
            h('div', { class: 'row', style: 'justify-content:space-between;margin-top:4px' },
              todayTask ? h('button', { type: 'button', class: 'btn link', onclick: () => openTaskById(todayTask.id) }, '오늘 할 일 열기 →') : h('span'),
              h('button', { type: 'button', class: 'btn sm dark', onclick: () => saveRoutine() }, '저장')))
            : h('div', { class: 'row', style: 'justify-content:space-between' },
              todayTask ? h('button', { type: 'button', class: 'btn link', onclick: () => openTaskById(todayTask.id) }, '오늘 할 일 열기 →') : h('span'),
              h('button', { type: 'button', class: 'btn sm dark', onclick: () => saveRoutine() }, '저장')),
          relay,
          !human ? stepsEditor('routines', r) : null,
          C.habitGrid(r, S.today))));
  };
  const people = visible.filter((r) => r.assignee === 'jay');
  const ais = visible.filter((r) => r.assignee !== 'jay');
  const packs = S.options.routinePacks || [];
  const haveTitles = new Set(d.routines.map((r) => r.title));
  const packBox = h('details', { class: 'pack-box', 'data-k': 'rt-packs' },
    h('summary', null, '실습 루틴 팩 담아오기 · 워크플로우 청사진 공유 (1인 AI 회사 데일리 · 아침 브리핑 · 리버스 비즈니스)'),
    packs.length ? h('div', { class: 'pack-grid' }, packs.map((p) => {
      const doneAll = p.titles.every((tt) => haveTitles.has(tt));
      return h('div', { class: 'pack-card' },
        h('div', { class: 'top' }, h('span', { class: 'tag' }, p.badge), h('b', null, p.title)),
        h('p', { class: 'small muted', style: 'margin:6px 0 8px' }, p.summary),
        h('ul', { class: 'pack-list' }, p.titles.map((tt) => h('li', null, tt))),
        h('div', { class: 'row', style: 'justify-content:flex-end;margin-top:10px' },
          doneAll ? h('span', { class: 'tag solid' }, '담김')
            : h('button', { type: 'button', class: 'btn sm dark', onclick: () => once(`pack-${p.key}`, async () => {
              const r = await act('POST', '/api/ui/routines/pack', { key: p.key });
              if (r) toast(r.added ? `${p.title} ${r.added}개를 담았어요` : '이미 모두 담겨 있어요');
            }) }, '이 팩 담기')));
    })) : null,
    h('div', { class: 'bp-bar' },
      h('span', { class: 'small muted' }, '수강생·팀원과 내 AI 워크플로우를 파일 하나로 공유하세요 (개인 경로·시크릿·매출 자동 제외)'),
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn sm', onclick: openBlueprintExport }, '청사진 내보내기'),
        h('button', { type: 'button', class: 'btn sm dark', onclick: openBlueprintImport }, '청사진 가져오기'))));
  return h('div', null,
    h('div', { class: 'head' }, h('div', null, h('h1', null, h('b', null, '매일 할 일')),
      h('div', { class: 'sub' }, '정해진 시각 또는 5분~1시간 간격으로 AI가 프롬프트대로 반복 실행합니다.')),
    h('div', { class: 'row' },
      h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: d.settings.alarmsEnabled, onchange: (ev) => act('PATCH', '/api/ui/settings', { alarmsEnabled: ev.target.checked }, ev.target.checked ? '알람을 켰어요' : '알람을 껐어요') }), h('span', { class: 'tr' }), h('b', null, '알람')),
      h('button', { class: 'btn sm', onclick: () => act('POST', '/api/ui/alarms/test', {}, '시험 알림을 보냈어요') }, '알림 시험'),
      h('button', { class: 'btn sm', onclick: openBlueprintExport }, '청사진 공유'))),
    addBarEl,
    whoBar,
    h('div', { style: 'margin-top:10px' }, days),
    packBox,
    h('section', { class: 'sec' }, secHead('내가 매일 할 일', `${people.length}개 · 알람은 정한 시각에 이 컴퓨터에 뜹니다`), people.length ? h('ul', { class: 'routines' }, people.map(row)) : h('div', { class: 'empty' }, '없습니다')),
    h('section', { class: 'sec' }, secHead('AI 직원이 매일 할 일', `${ais.length}개`), ais.length ? h('ul', { class: 'routines' }, ais.map(row)) : h('div', { class: 'empty' }, '없습니다. 위에 적으면 맞는 AI 직원에게 배분합니다.')));
}

// ───────── 내 직원 ─────────

async function ensureModels() {
  if (ui.models) return;
  ui.models = [];
  try { ui.models = await (await fetch('/api/models')).json(); } catch { ui.models = []; }
  render();
}

function openCooldownModal(e) {
  const dlg = document.getElementById('dlg');
  const opts = [
    [30, '30분 휴식'],
    [60, '1시간 휴식'],
    [300, '5시간 휴식 (5시간 한도)'],
    [1440, '오늘 하루 휴식'],
  ];
  const fbName = e.fallbackTo ? shortName(e.fallbackTo) : '여유 AI 자동 선택';
  setDlg(dlg,
    h('h3', null, `${e.name} · 토큰 한도 휴식`),
    h('p', { class: 'small muted', style: 'margin:-8px 0 14px' }, `휴식하는 동안 이 직원에게 들어오는 일은 대체 AI(${fbName})로 자동 전환됩니다.`),
    h('div', { class: 'picker' }, opts.map(([mins, label]) => h('button', {
      type: 'button', class: 'btn sm',
      onclick: () => once(`cd-${e.id}`, async () => {
        dlg.close();
        await act('POST', `/api/ui/employees/${e.id}/cooldown`, { minutes: mins, reason: `대표가 ${label} 지정` }, `${e.name}: ${label} 설정했어요 (대체: ${fbName})`);
      }),
    }, label))),
    h('div', { class: 'bar' },
      h('button', { class: 'btn', onclick: () => dlg.close() }, '취소')));
  dlg.showModal();
}

function empCard(e) {
  const editing = ui.editingEmp === e.id;
  const openEdit = (field) => { ui.editingEmp = e.id; ui.empDraftEngine[e.id] = e.engine; render(); setTimeout(() => document.querySelector(`[data-k="emp-${field}-${e.id}"]`)?.focus(), 0); };
  const valOr = (v, field) => (v ? v : h('button', { class: 'input-me', onclick: () => openEdit(field) }, '입력'));
  const today = S.data.tasks.filter((t) => t.date === S.today && t.assignee === e.id);
  const cooling = isEmpCooling(e);
  const coolMin = empCooldownMin(e);
  if (!editing) {
    const how = engineText(e);
    const runSeg = h('div', { class: 'seg', role: 'group', 'aria-label': '실행 방식' }, S.options.runModes.map((m) => h('button', {
      type: 'button', class: e.runMode === m ? 'on' : '', 'aria-pressed': e.runMode === m ? 'true' : 'false', disabled: ['none', 'web'].includes(e.engine) && m !== 'off',
      onclick: () => act('PATCH', `/api/ui/employees/${e.id}`, { runMode: m }, `${e.name}: ${RUN_LABEL[m]}`),
    }, RUN_LABEL[m])));
    const coolBtn = cooling
      ? h('button', { class: 'btn sm dark', onclick: () => once(`cd0-${e.id}`, () => act('POST', `/api/ui/employees/${e.id}/cooldown`, { minutes: 0 }, `${e.name} 휴식을 해제했어요`)) }, '휴식 해제')
      : h('button', { class: 'btn sm', title: '멤버십 토큰이 다 썼을 때 대체 AI로 넘김', onclick: () => openCooldownModal(e) }, '한도 휴식');
    return h('div', { class: 'card' },
      h('div', { class: 'row', style: 'justify-content:space-between;align-items:flex-start' },
        h('div', null, h('h3', null, e.name, h('span', { class: 'emp-id', title: 'CLI · MCP 직원 아이디' }, e.id)), h('div', { class: 'small muted' }, how), modelLine(e)),
        cooling ? h('span', { class: 'tag solid', title: e.cooldownReason || '토큰 한도 휴식 중' }, `토큰 휴식 · ${coolMin}분`)
          : isWorking(e.id) ? h('span', { class: 'tag solid' }, '일하는 중') : today.length ? h('span', { class: 'tag' }, `오늘 ${today.length}`) : null),
      h('dl', { class: 'kv' },
        h('dt', null, '역할'), h('dd', null, valOr(e.role, 'role')),
        h('dt', null, '도구'), h('dd', null, valOr(e.tools.join(', '), 'tools')),
        h('dt', null, '업무 매뉴얼'), h('dd', null, e.manual ? h('span', { class: 'clamp2' }, e.manual) : valOr('', 'manual')),
        h('dt', null, '막히면 대체'), h('dd', null, e.fallbackTo && emp(e.fallbackTo) ? `${shortName(e.fallbackTo)} (토큰 소진 시 자동 전환)` : h('button', { class: 'input-me', onclick: () => openEdit('fallbackTo') }, '자동 선택')),
        h('dt', null, '월급'), h('dd', null, e.salary === null || e.salary === undefined ? valOr('', 'salary') : e.salary === 0 ? '무료' : `월 ${won(e.salary)}`),
        h('dt', null, '리소스'), h('dd', null, e.resources.length ? e.resources.map((id) => res(id)?.name).filter(Boolean).join(', ') : valOr('', 'res')),
        h('dt', null, '근무'), h('dd', null, [e.runsOn, e.command].filter(Boolean).join(' · ') || valOr('', 'runsOn'))),
      h('div', { class: 'foot' },
        ['none', 'web'].includes(e.engine) ? h('span', { class: 'small muted' }, e.engine === 'web' ? '할 일에서 복사해서 맡겨요' : 'MCP, CLI 로 스스로 보고') : runSeg,
        h('div', { class: 'row' }, coolBtn, h('button', { class: 'btn sm', onclick: () => { ui.editingEmp = e.id; ui.empDraftEngine[e.id] = e.engine; render(); } }, '편집'))));
  }
  const curEng = ui.empDraftEngine[e.id] ?? e.engine;
  if (curEng === 'local') ensureModels();
  const k = (f) => `emp-${f}-${e.id}`;
  const assignableRes = S.data.resources.filter((r) => ['기계', '멤버십', '폴더'].includes(r.kind));
  const resBoxes = assignableRes.map((r) => h('label', { class: 'chk-l' }, h('input', { type: 'checkbox', value: r.id, checked: e.resources.includes(r.id), class: 'res-box', 'data-k': `emp-res-${e.id}-${r.id}` }), `${r.name}`));
  const f = {
    role: h('input', { class: 'in sm', value: e.role, 'data-k': k('role') }),
    tools: h('input', { class: 'in sm', value: e.tools.join(', '), placeholder: '쉼표로 구분', 'data-k': k('tools') }),
    runsOn: h('input', { class: 'in sm', value: e.runsOn, 'data-k': k('runsOn') }),
    command: h('input', { class: 'in sm', value: e.command, 'data-k': k('command') }),
    salary: h('input', { class: 'in sm', value: e.salary === null || e.salary === undefined ? '' : String(e.salary), inputmode: 'numeric', placeholder: '원 단위, 무료는 0', 'data-k': k('salary') }),
    fallbackTo: h('select', { class: 'in sm', 'data-k': k('fallbackTo') },
      h('option', { value: '' }, '자동으로 여유 AI 선택'),
      S.data.employees.filter((x) => x.id !== e.id).map((x) => h('option', { value: x.id, selected: e.fallbackTo === x.id }, `${x.name} (${x.id})`))),
    engine: h('select', { class: 'in sm', 'data-k': k('engine'), onchange: (ev) => { ui.empDraftEngine[e.id] = ev.target.value; render(); } },
      [['web', '복사해서 맡기기 (ChatGPT, Claude, Gemini 웹 등)'], ['local', '로컬 모델 (이 컴퓨터 안에서 바로 답)'],
        ['claude', `Claude Code (${S.runners.claude ? '이 컴퓨터에 설치됨' : '이 컴퓨터에 없음'})`], ['codex', `Codex (${S.runners.codex ? '이 컴퓨터에 설치됨' : '이 컴퓨터에 없음'})`],
        ['none', '스스로 보고 (MCP, CLI 로 연결한 AI)'], ...(S.runners.agy || curEng === 'agy' ? [['agy', 'agy']] : [])].map(([v, t]) => h('option', { value: v, selected: curEng === v }, t))),
    webUrl: h('input', { class: 'in sm', value: e.webUrl || '', placeholder: 'https://', 'data-k': k('webUrl') }),
    model: h('select', { class: 'in sm', 'data-k': k('model') }, h('option', { value: '' }, ui.models && ui.models.length ? '모델 고르기' : '로컬 모델을 찾는 중이거나 없음'),
      (ui.models || []).map((m) => h('option', { value: m.id, selected: e.model === m.id }, `${m.label}${m.size ? ` · ${m.size}` : ''}`))),
    manual: h('textarea', { class: 'in', rows: 6, 'data-k': k('manual'), placeholder: '이 직원이 일하는 방식, 말투, 하지 말아야 할 것' }, e.manual || ''),
  };
  const fld = (label, el) => h('label', { class: 'field' }, label, el);
  const save = async () => {
    const r = await act('PATCH', `/api/ui/employees/${e.id}`, {
      role: f.role.value, tools: f.tools.value, runsOn: f.runsOn.value, command: f.command.value,
      salary: f.salary.value.trim() === '' ? null : f.salary.value, engine: f.engine.value,
      fallbackTo: f.fallbackTo.value || null,
      model: f.engine.value === 'local' ? f.model.value : undefined, manual: f.manual.value,
      webUrl: f.engine.value === 'web' ? f.webUrl.value : undefined,
      resources: [...document.querySelectorAll('.res-box')].filter((x) => x.checked).map((x) => x.value),
    }, '저장했어요');
    if (r) { delete ui.empDraftEngine[e.id]; ui.editingEmp = null; render(); }
  };
  return h('div', { class: 'card wide' },
    h('h3', null, `${e.name} 편집`, h('span', { class: 'emp-id' }, e.id)),
    h('div', { class: 'f-grid' }, fld('역할', f.role), fld('도구', f.tools), fld('근무 위치', f.runsOn), fld('명령 방법', f.command), fld('월급 (월, 원)', f.salary), fld('막히면 대신할 AI (토큰 소진 시)', f.fallbackTo), fld('일 시키는 방법', f.engine), curEng === 'local' ? fld('로컬 모델', f.model) : null, curEng === 'web' ? fld('열 주소 (선택)', f.webUrl) : null),
    assignableRes.length ? h('div', { style: 'margin-top:16px' }, h('div', { class: 'small', style: 'color:#555;margin-bottom:6px' }, '쓸 수 있는 사무실 · 멤버십 · 폴더'), h('div', { class: 'chk-wrap' }, resBoxes)) : null,
    h('div', { style: 'margin-top:16px' }, fld('업무 매뉴얼', f.manual), h('div', { class: 'warn' }, '비밀번호, 인증 코드, 카드 번호는 여기에 쓰지 마세요. 이 글은 AI에게 그대로 전달됩니다.')),
    ['claude', 'codex', 'agy'].includes(curEng) ? h('p', { class: 'small muted' }, S.runners[curEng] ? `실행을 누르면 ${ENGINE_LABEL[curEng]}를 workspaces/${e.id} 폴더에서 한 번 실행합니다. 권한을 건너뛰는 옵션은 쓰지 않아요.` : `이 컴퓨터에 ${ENGINE_LABEL[curEng]}가 없어요. 그래도 할 일에서 복사해서 맡기기로 같은 일을 시킬 수 있어요.`) : null,
    h('div', { class: 'row', style: 'justify-content:space-between;margin-top:16px' },
      h('button', { class: 'btn sm', onclick: () => { if (confirm(`${e.name}, 명단에서 뺄까요?`)) { delete ui.empDraftEngine[e.id]; ui.editingEmp = null; act('DELETE', `/api/ui/employees/${e.id}`, undefined, '명단에서 뺐어요'); } } }, '명단에서 빼기'),
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => { delete ui.empDraftEngine[e.id]; ui.editingEmp = null; load(); } }, '취소'), h('button', { class: 'btn dark', onclick: save }, '저장'))));
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
  if (['claude', 'codex'].includes(e.engine)) return `${ENGINE_LABEL[e.engine]} · ${S.runners[e.engine] ? '이 컴퓨터에 설치됨' : '이 컴퓨터에 없음, 복사해서 맡기기로 씀'}`;
  return ENGINE_LABEL[e.engine] || e.engine;
}

function openAddEmployee() {
  const dlg = document.getElementById('dlg');
  const name = h('input', { class: 'in', 'aria-label': '이름', placeholder: '예: ChatGPT' });
  const role = h('input', { class: 'in', 'aria-label': '역할', placeholder: '예: 글쓰기, 고객 답장' });
  let picked = null;
  const have = new Set(S.data.employees.map((e) => e.catalog).filter(Boolean));
  const multi = S.data.groups.length > 1;
  const group = multi ? h('select', { class: 'in', 'aria-label': '근무 형태' }, S.data.groups.map((g) => h('option', { value: g.id }, [g.title, g.subtitle].filter(Boolean).join(' · ')))) : null;
  const quick = h('div', { class: 'picker' }, S.options.catalog.filter((c) => !have.has(c.key)).map((c) => h('button', {
    type: 'button', class: 'chip', onclick: (ev) => {
      picked = c.key; name.value = c.name; role.value = c.role;
      if (group && c.group) group.value = c.group;
      for (const b of quick.children) b.classList.toggle('on', b === ev.currentTarget);
    },
  }, c.engine === 'local' ? `${c.name} (로컬)` : c.name)));
  setDlg(dlg, h('h3', null, 'AI 직원 추가'),
    h('p', { class: 'small muted', style: 'margin:-8px 0 12px' }, '이미 쓰는 AI를 고르면 역할이 채워집니다. 역할은 배분할 때 씁니다.'),
    quick,
    h('label', { class: 'field', style: 'margin-top:14px' }, '이름', name), h('label', { class: 'field', style: 'margin-top:12px' }, '역할', role),
    multi ? h('label', { class: 'field', style: 'margin-top:12px' }, '근무 형태', group) : null,
    h('div', { class: 'bar' }, h('button', { class: 'btn', onclick: () => { dlg.close(); render(); } }, '취소'),
      h('button', { class: 'btn dark', onclick: () => once('add-emp', async () => {
        if (!name.value.trim()) { name.focus(); return; }
        dlg.close();
        const r = await act('POST', '/api/ui/employees', { name: name.value, role: role.value, catalog: picked && name.value === S.options.catalog.find((c) => c.key === picked)?.name ? picked : undefined, group: group?.value }, '추가했어요');
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
    h('div', { class: 'row' },
      h('button', { class: 'btn sm', onclick: openConnectModal }, 'AI 도구 연결 (MCP · 스킬)'),
      h('button', { class: 'btn dark sm', onclick: openAddEmployee }, '직원 추가'))),
    !d.employees.length ? h('div', { class: 'empty' }, '아직 직원이 없어요. 직원 추가를 눌러 지금 쓰는 AI를 고르세요.') : null,
    d.groups.length <= 1 ? h('div', { class: 'cards' }, d.employees.map(empCard)) : d.groups.filter((g) => d.employees.some((e) => e.group === g.id)).map((g, i) => {
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
  const status = h('select', { class: `in sm st-sel${r.status === '꺼짐' ? ' off' : ''}`, 'aria-label': `${r.name} 상태`, onchange: (ev) => act('PATCH', `/api/ui/resources/${r.id}`, { status: ev.target.value }, '상태를 바꿨어요') },
    S.options.resStatus.map((s) => h('option', { value: s, selected: s === r.status }, s)));
  let extra = null;
  const mh = r.kind === '기계' ? S.machineHealth?.[r.id] : null;
  const otherMachines = r.kind === '기계' ? S.data.resources.filter((x) => x.kind === '기계' && x.id !== r.id) : [];
  const optBar = r.kind === '기계' ? h('div', { class: 'opt-row' },
    h('span', { class: 'small muted' }, '최적화'),
    h('select', { class: 'in sm', 'aria-label': `${r.name} RAM 상한`, onchange: (ev) => act('PATCH', `/api/ui/resources/${r.id}`, { maxRamPct: Number(ev.target.value) }, `RAM 상한을 ${ev.target.value}%로 바꿨어요`) },
      [75, 80, 85, 90].map((p) => h('option', { value: String(p), selected: (r.maxRamPct || 85) === p }, `RAM 상한 ${p}%${p === 85 ? ' (추천)' : ''}`))),
    h('select', { class: 'in sm', 'aria-label': `${r.name} 동시 무거운 작업 상한`, onchange: (ev) => act('PATCH', `/api/ui/resources/${r.id}`, { maxHeavy: Number(ev.target.value) }, `동시 무거운 작업 상한을 ${ev.target.value}개로 바꿨어요`) },
      [1, 2].map((n) => h('option', { value: String(n), selected: (r.maxHeavy || 1) === n }, `무거운 작업 최대 ${n}개`))),
    otherMachines.length ? h('select', { class: 'in sm', 'aria-label': `${r.name} 바쁘면 넘길 컴퓨터`, onchange: (ev) => act('PATCH', `/api/ui/resources/${r.id}`, { fallbackTo: ev.target.value || null }, '대체 컴퓨터를 바꿨어요') },
      h('option', { value: '' }, '바쁘면 → 여유 컴퓨터 자동'),
      otherMachines.map((m) => h('option', { value: m.id, selected: r.fallbackTo === m.id }, `바쁘면 → ${m.name}`))) : null) : null;

  const ramLine = mh && typeof mh.ramPct === 'number' ? h('div', { class: 'ram-line' },
    h('div', { class: 'ram-bar', title: `RAM ${mh.ramPct}% 사용 (상한 ${mh.maxRamPct}%)` },
      h('div', { class: `ram-fill${mh.level === 'overload' ? ' over' : ''}`, style: `width:${Math.min(100, mh.ramPct)}%` })),
    h('span', { class: 'small muted' }, `RAM ${mh.ramPct}%${mh.availGB != null ? ` · 여유 ${mh.availGB}GB` : ''}${mh.diskFreeGB != null ? ` · 디스크 ${mh.diskFreeGB}GB` : ''}`),
    h('span', { class: `tag${mh.level === 'overload' ? ' solid' : mh.level === 'busy' ? ' dash' : ''}` }, healthLabel(mh.level))) : null;

  if (r.kind === '기계' && r.isThisMac) {
    const L = ui.office?.local;
    extra = h('div', null,
      ramLine,
      L ? h('div', { class: 'small muted', style: 'margin-top:4px' }, `이 컴퓨터 · ${L.chip} · 켜진 지 ${uptimeK(L.uptimeSec)} · 부하 ${L.load[0]}`) : h('div', { class: 'small muted', style: 'margin-top:4px' }, '이 컴퓨터 · 읽는 중'),
      optBar);
  } else if (r.kind === '기계') {
    const host = h('input', { class: 'in sm', value: r.hostname || '', placeholder: '호스트 이름 또는 IP', 'data-k': `host-${r.id}`, style: 'max-width:200px', 'aria-label': `${r.name} 호스트` });
    const lc = r.lastCheck;
    const alias = h('input', { class: 'in sm', value: r.sshAlias || '', placeholder: 'ssh 별칭 (예: office-1)', 'data-k': `alias-${r.id}`, style: 'max-width:150px', 'aria-label': `${r.name} ssh 별칭` });
    const o = (S.offices || []).find((x) => x.id === r.id);
    const oLine = o ? (o.state === 'busy' ? `${o.name}에서 실행 중 · ${o.title || ''}${o.since ? ` · ${stamp(o.since)}부터` : ''}${o.log ? ` · ${o.log}` : ''}`
      : o.state === 'down' ? `안 닿음 · ${o.reason}${o.retryAt ? ` · ${stamp(o.retryAt)}에 다시` : ''}` : `쉬는 중${o.checkedAt ? ` · ${stamp(o.checkedAt)} 확인` : ''}`) : null;
    extra = h('div', null, ramLine, oLine ? h('div', { class: 'small office-line' }, oLine) : null, h('div', { class: 'row', style: 'margin-top:6px' }, host, alias,
      h('button', { class: 'btn sm', onclick: () => act('PATCH', `/api/ui/resources/${r.id}`, { hostname: host.value, sshAlias: alias.value.trim() }, '저장했어요') }, '저장'),
      h('button', { class: 'btn sm', disabled: !r.hostname && !r.sshAlias, onclick: () => act('POST', `/api/ui/resources/${r.id}/check`, {}, '확인했어요') }, '연결 확인'),
      h('span', { class: 'small muted' }, lc ? `${lc.ok ? '닿음' : '안 닿음'} · ${lc.reason} · ${stamp(lc.checkedAt)}` : r.sshAlias ? '누를 때 ssh 로 한 번 확인 (키로만)' : r.hostname ? '누를 때 한 번만 확인 (로그인 안 함)' : ''),
      h('button', { class: 'btn link', onclick: () => act('PATCH', `/api/ui/resources/${r.id}`, { isThisMac: true }, `이 컴퓨터로 지정했어요: ${r.name}`) }, '이 컴퓨터로 지정')),
      optBar);
  } else if (r.kind === '폴더') {
    extra = h('div', { class: 'small muted mono' }, r.path || '');
  }
  let title;
  if (ui.renamingRes === r.id) {
    const nm = h('input', { class: 'in sm', value: r.name, 'data-k': `rename-${r.id}`, style: 'max-width:220px', 'aria-label': `${r.name} 새 이름` });
    const save = () => { const v = nm.value.trim(); ui.renamingRes = null; if (v && v !== r.name) act('PATCH', `/api/ui/resources/${r.id}`, { name: v }, `이름을 바꿨어요: ${v}`); else render(); };
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
      h('button', { class: 'x', 'aria-label': `${r.name} 지우기`, onclick: () => { if (confirm(`이 리소스를 지울까요?\n${r.name}`)) act('DELETE', `/api/ui/resources/${r.id}`, undefined, '지웠어요'); } }, '×')));
}

// 같은 와이파이의 폰에서 보기 (기본 꺼짐, 본사 컴퓨터 화면에서만 켜고 끈다)
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
        h('div', null, h('div', { class: 'small muted' }, '폰에서 열 주소'), (L.urls || info.urls).map((u) => h('div', { class: 'row', style: 'margin-top:4px' },
          h('span', { class: 'mono lan-url' }, u),
          h('button', { type: 'button', class: 'btn sm', onclick: async () => { await copyText(u); toast('주소를 복사했어요'); } }, '주소 복사')))),
        L.code && left > 0 ? h('div', null, h('div', { class: 'small muted' }, `연결 코드 · ${left}분 동안, 한 번만`), h('div', { class: 'pair-code', 'aria-label': '연결 코드' }, L.code))
          : h('button', { class: 'btn', onclick: fresh }, '연결 코드 받기')) : null));
}

// Muse 읽기 (읽기만, 기본 꺼짐). 읽을 곳 (이 컴퓨터 / 사무실), 스위치 하나, 상태 한 줄.
function musePanel() {
  const onMac = ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname);
  const m = S.data.settings.muse;
  if (!onMac || !m) return null;
  const host = m.host === 'office' ? 'office' : 'local';
  const offices = S.data.resources.filter(isOfficeRes);
  const office = res(m.res) || offices[0];
  const officeLabel = office ? office.name.replace(/\s*\(.*\)\s*$/, '') : '사무실';
  const place = host === 'office' ? officeLabel : '이 컴퓨터';
  const toggle = (on) => once('muse', () => act('POST', '/api/ui/muse', { on }, on ? 'Muse 읽기를 켰어요' : 'Muse 읽기를 껐어요'));
  const setHost = (v) => once('muse-host', () => act('POST', '/api/ui/muse', { host: v }, v === 'office' ? `${officeLabel}에서 읽어요` : '이 컴퓨터에서 읽어요'));
  const need = ['login', 'nobrowser', 'noego'].includes(m.status);
  const line = !m.enabled ? '' : `${m.statusText || ''}${m.lastRunAt ? ` · ${stamp(m.lastRunAt)}` : ''}`;
  const hostPick = h('div', { class: 'picker', role: 'group', 'aria-label': 'Muse 를 읽을 곳' },
    h('button', { type: 'button', class: `chip${host === 'local' ? ' on' : ''}`, 'aria-pressed': host === 'local' ? 'true' : 'false', onclick: () => host !== 'local' && setHost('local') }, '이 컴퓨터'),
    h('button', { type: 'button', class: `chip${host === 'office' ? ' on' : ''}`, 'aria-pressed': host === 'office' ? 'true' : 'false', disabled: !offices.length, title: offices.length ? '' : '내 리소스에서 사무실 기계의 ssh 별칭을 넣으면 고를 수 있어요', onclick: () => host !== 'office' && setHost('office') }, officeLabel));
  const how = host === 'office' ? `한 번만: 화면 공유로 ${place}에 들어가 Ego Lite를 열고 Muse에 직접 로그인해 두세요.` : '한 번만: 이 컴퓨터에서 Ego Lite를 열고 Muse에 직접 로그인해 두세요.';
  return h('section', { class: 'sec' }, secHead('Muse'),
    h('div', { class: 'lan' },
      h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: Boolean(m.enabled), onchange: (ev) => toggle(ev.target.checked) }), h('span', { class: 'tr' }),
        h('b', null, `Muse 대화 읽어 오기 (${place}, ${m.everyMin || 30}분마다)`)),
      h('div', { class: 'muse-host' }, h('span', { class: 'small muted' }, '읽는 곳'), hostPick),
      line ? h('p', { class: `small${need ? '' : ' muted'}` }, line) : null,
      h('p', { class: 'small muted' }, `${how} 앱은 읽기만 하고, 보내거나 누르지 않아요. 가져온 글은 이 컴퓨터에만 남아요.`)));
}

async function loadTools() {
  try { ui.tools = await (await fetch('/api/tools/detect')).json(); } catch { ui.tools = { browsers: [], openSource: [] }; }
  render();
}

function parseOssInputClient(raw) {
  const s = String(raw || '').trim();
  const gh = /^https?:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:\/.*)?$/i.exec(s);
  if (gh) return { name: gh[2], repo: `https://github.com/${gh[1]}/${gh[2]}`, command: `npx github:${gh[1]}/${gh[2]}` };
  const ghShort = /^(?:npx\s+(?:-y\s+)?)?github:([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/i.exec(s);
  if (ghShort) return { name: ghShort[2], repo: `https://github.com/${ghShort[1]}/${ghShort[2]}`, command: s.startsWith('npx') ? s : `npx ${s}` };
  const npx = /^npx\s+(?:-y\s+)?(@?[A-Za-z0-9_./@-]+)/i.exec(s);
  if (npx) return { name: npx[1].split('/').pop().replace(/@[^@]+$/, ''), repo: '', command: s };
  return { name: s, repo: '', command: '' };
}

function openAddOss() {
  const dlg = document.getElementById('dlg');
  const src = h('input', { class: 'in', placeholder: 'GitHub 주소 또는 npx 명령 (예: https://github.com/... 또는 npx hyperframes)', 'aria-label': 'GitHub 주소 또는 npx 명령' });
  const name = h('input', { class: 'in', placeholder: '예: Hyperframes, Remotion, Blender', 'aria-label': '도구 이름' });
  const when = h('input', { class: 'in', placeholder: '예: 모션 그래픽, 3D 영상, 자막 추출', 'aria-label': '언제 쓰나요' });
  const cmd = h('input', { class: 'in', placeholder: '실행 명령 (예: npx hyperframes)', 'aria-label': '실행 명령' });
  const repo = h('input', { class: 'in', placeholder: 'GitHub 주소 (선택)', 'aria-label': 'GitHub 주소' });
  const skillPath = h('input', { class: 'in', placeholder: '스킬 파일 경로 (선택)', 'aria-label': '스킬 파일 경로' });
  const preview = h('div', { class: 'small muted', style: 'margin-top:6px' }, 'GitHub 주소나 npx 명령을 붙여넣으면 이름과 실행법이 자동으로 채워집니다.');
  src.addEventListener('input', () => {
    const p = parseOssInputClient(src.value);
    if (p.name) name.value = p.name;
    if (p.command) cmd.value = p.command;
    if (p.repo) repo.value = p.repo;
    preview.textContent = p.command || p.repo ? `자동 인식됨 → ${p.name}${p.command ? ` · ${p.command}` : ''}` : '직접 이름을 입력해도 됩니다.';
  });
  setDlg(dlg, 
    h('h3', null, '오픈소스 도구 추가'),
    h('p', { class: 'small muted', style: 'margin:-8px 0 12px' }, '등록해 두면 프롬프트에 이름만 적었을 때 AI가 이 GitHub/npx 명령을 정확히 사용합니다.'),
    h('label', { class: 'field' }, 'GitHub 주소 또는 npx 명령 (1줄 붙여넣기)', src),
    preview,
    h('label', { class: 'field', style: 'margin-top:12px' }, '도구 이름', name),
    h('label', { class: 'field', style: 'margin-top:12px' }, '언제 쓰나요? (쉼표로 구분)', when),
    h('details', { style: 'margin-top:12px' }, h('summary', null, '세부 명령 · 저장소 (자동 채워짐)'),
      h('label', { class: 'field', style: 'margin-top:10px' }, '실행 명령', cmd),
      h('label', { class: 'field', style: 'margin-top:10px' }, 'GitHub 주소', repo),
      h('label', { class: 'field', style: 'margin-top:10px' }, '스킬 파일 경로', skillPath)),
    h('div', { class: 'bar' },
      h('button', { class: 'btn', onclick: () => { dlg.close(); render(); } }, '취소'),
      h('button', { class: 'btn dark', onclick: () => once('add-oss', async () => {
        if (!name.value.trim() && !src.value.trim()) { src.focus(); return; }
        dlg.close();
        await act('POST', '/api/ui/resources', { kind: '오픈소스', sourceInput: src.value, name: name.value, when: when.value, note: when.value, command: cmd.value, repo: repo.value, skillPath: skillPath.value }, '오픈소스를 추가했어요');
      }) }, '추가')));
  dlg.showModal();
  src.focus();
}

function openEditOss(r) {
  const dlg = document.getElementById('dlg');
  const name = h('input', { class: 'in', value: r.name || '', 'aria-label': '도구 이름' });
  const when = h('input', { class: 'in', value: r.when || r.note || '', placeholder: '예: 모션 그래픽, 3D 영상, 자막 추출', 'aria-label': '언제 쓰나요' });
  const cmd = h('input', { class: 'in', value: r.command || '', placeholder: '실행 명령 (예: npx hyperframes)', 'aria-label': '실행 명령' });
  const repo = h('input', { class: 'in', value: r.repo || '', placeholder: 'GitHub 주소 (선택)', 'aria-label': 'GitHub 주소' });
  const skillPath = h('input', { class: 'in', value: r.skillPath || '', placeholder: '스킬 파일 경로 (선택)', 'aria-label': '스킬 파일 경로' });
  setDlg(dlg, 
    h('h3', null, `${r.name} 편집`),
    h('p', { class: 'small muted', style: 'margin:-8px 0 12px' }, '실행 명령, GitHub 주소, 언제 쓰는지를 수정하면 프롬프트 지시서에 즉시 반영됩니다.'),
    h('label', { class: 'field' }, '도구 이름', name),
    h('label', { class: 'field', style: 'margin-top:12px' }, '언제 쓰나요? (쉼표로 구분)', when),
    h('label', { class: 'field', style: 'margin-top:12px' }, '실행 명령 (npx · CLI)', cmd),
    h('label', { class: 'field', style: 'margin-top:12px' }, 'GitHub 주소 (선택)', repo),
    h('label', { class: 'field', style: 'margin-top:12px' }, '스킬 파일 경로 (선택)', skillPath),
    h('div', { class: 'bar', style: 'justify-content:space-between' },
      h('button', { class: 'btn sm', onclick: () => { if (confirm(`${r.name}을 도구함에서 뺄까요?`)) { dlg.close(); act('DELETE', `/api/ui/resources/${r.id}`, undefined, '뺐어요'); } } }, '도구함에서 빼기'),
      h('div', { class: 'row' },
        h('button', { class: 'btn', onclick: () => { dlg.close(); render(); } }, '취소'),
        h('button', { class: 'btn dark', onclick: () => once(`edit-oss-${r.id}`, async () => {
          if (!name.value.trim()) { name.focus(); return; }
          dlg.close();
          await act('PATCH', `/api/ui/resources/${r.id}`, { name: name.value, when: when.value, note: when.value, command: cmd.value, repo: repo.value, skillPath: skillPath.value }, '오픈소스 설정을 저장했어요');
        }) }, '저장'))));
  dlg.showModal();
  name.focus();
}

function openAddDesign() {
  const dlg = document.getElementById('dlg');
  const name = h('input', { class: 'in', placeholder: '예: CONNECT AI 미니멀, 야학당 썸네일', 'aria-label': '디자인 이름' });
  const rules = h('textarea', { class: 'in', rows: 3, placeholder: '예: 흰 배경(#fff), 검정 글자(#111), 넓은 여백, 깔끔한 표 중심, 이모지 남발 금지', 'aria-label': '디자인 규칙' });
  const assetPath = h('input', { class: 'in', placeholder: '참고 파일·캐릭터 폴더 경로 (선택, 예: ~/Brand/DESIGN.md)', 'aria-label': '에셋 폴더' });
  const refUrl = h('input', { class: 'in', placeholder: '참고 사이트 주소 (선택, https://...)', 'aria-label': '참고 주소' });
  setDlg(dlg, 
    h('h3', null, '내 디자인 스타일 추가'),
    h('p', { class: 'small muted', style: 'margin:-8px 0 12px' }, '등록해 두면 프롬프트에 스타일 이름만 적었을 때 AI가 이 디자인 규칙과 캐릭터/에셋 폴더를 그대로 따릅니다.'),
    h('label', { class: 'field' }, '스타일 이름', name),
    h('label', { class: 'field', style: 'margin-top:12px' }, '디자인 규칙 (색상·폰트·톤·금지사항)', rules),
    h('label', { class: 'field', style: 'margin-top:12px' }, '캐릭터 · 에셋 폴더 또는 DESIGN.md (선택)', assetPath),
    h('label', { class: 'field', style: 'margin-top:12px' }, '참고 주소 (선택)', refUrl),
    h('div', { class: 'bar' },
      h('button', { class: 'btn', onclick: () => { dlg.close(); render(); } }, '취소'),
      h('button', { class: 'btn dark', onclick: () => once('add-des', async () => {
        if (!name.value.trim()) { name.focus(); return; }
        dlg.close();
        await act('POST', '/api/ui/resources', { kind: '디자인', name: name.value, rules: rules.value, assetPath: assetPath.value, refUrl: refUrl.value, note: rules.value.slice(0, 60) }, '디자인 스타일을 추가했어요');
      }) }, '추가')));
  dlg.showModal();
  name.focus();
}

function openEditDesign(r) {
  const dlg = document.getElementById('dlg');
  const name = h('input', { class: 'in', value: r.name || '', 'aria-label': '스타일 이름' });
  const rules = h('textarea', { class: 'in', rows: 4, placeholder: '색상·폰트·톤·금지사항', 'aria-label': '디자인 규칙' }, r.rules || '');
  const assetPath = h('input', { class: 'in', value: r.assetPath || '', placeholder: '예: ~/Brand/DESIGN.md 또는 캐릭터 폴더', 'aria-label': '에셋 폴더' });
  const refUrl = h('input', { class: 'in', value: r.refUrl || '', placeholder: 'https://...', 'aria-label': '참고 주소' });
  setDlg(dlg, 
    h('h3', null, `${r.name} 편집`),
    h('p', { class: 'small muted', style: 'margin:-8px 0 12px' }, '디자인 규칙이나 캐릭터·DESIGN.md 경로를 넣어 두면 AI가 매번 정확히 참고합니다.'),
    h('label', { class: 'field' }, '스타일 이름', name),
    h('label', { class: 'field', style: 'margin-top:12px' }, '디자인 규칙 (색상·폰트·톤·금지사항)', rules),
    h('label', { class: 'field', style: 'margin-top:12px' }, '캐릭터 · 에셋 폴더 또는 DESIGN.md (선택)', assetPath),
    h('label', { class: 'field', style: 'margin-top:12px' }, '참고 주소 (선택)', refUrl),
    h('div', { class: 'bar', style: 'justify-content:space-between' },
      h('button', { class: 'btn sm', onclick: () => { if (confirm(`${r.name} 스타일을 지울까요?`)) { dlg.close(); act('DELETE', `/api/ui/resources/${r.id}`, undefined, '지웠어요'); } } }, '지우기'),
      h('div', { class: 'row' },
        h('button', { class: 'btn', onclick: () => { dlg.close(); render(); } }, '취소'),
        h('button', { class: 'btn dark', onclick: () => once(`edit-des-${r.id}`, async () => {
          if (!name.value.trim()) { name.focus(); return; }
          dlg.close();
          await act('PATCH', `/api/ui/resources/${r.id}`, { name: name.value, rules: rules.value, assetPath: assetPath.value, refUrl: refUrl.value, note: rules.value.slice(0, 60) }, '디자인 스타일을 저장했어요');
        }) }, '저장'))));
  dlg.showModal();
  name.focus();
}

function designPanel() {
  const saved = S.data.resources.filter((r) => r.kind === '디자인');
  const presets = S.options.designPresets || [];
  const presetCards = presets.map((p) => {
    const existing = saved.find((r) => r.preset === p.key || r.name === p.name);
    const on = Boolean(existing && existing.status !== '꺼짐');
    const mainBtn = h('button', {
      type: 'button', class: `tool-card${on ? ' on' : ''}`, 'aria-pressed': on ? 'true' : 'false',
      onclick: () => once(`des-${p.key}`, () => existing
        ? act('DELETE', `/api/ui/resources/${existing.id}`, undefined, `${p.name}을 뺐어요`)
        : act('POST', '/api/ui/resources', { kind: '디자인', name: p.name, preset: p.key, rules: p.rules, note: p.rules.slice(0, 60) }, `${p.name} 스타일을 켰어요`)),
    },
    h('div', { class: 'top' }, h('b', null, existing ? existing.name : p.name), on ? h('span', { class: 'tag solid' }, '사용 중') : null),
    h('span', { class: 'small muted', style: on ? 'padding-bottom:18px' : '' }, [existing?.rules || p.rules, existing?.assetPath].filter(Boolean).join(' · ')));
    if (!on || !existing) return mainBtn;
    return h('div', { class: 'tool-card-wrap' }, mainBtn,
      h('button', { type: 'button', class: 'tool-card-edit', onclick: (ev) => { ev.stopPropagation(); openEditDesign(existing); } }, '편집'));
  });
  const custom = saved.filter((r) => !presets.some((p) => p.key === r.preset || p.name === r.name));
  return h('section', { class: 'sec' }, secHead('내 디자인 스타일', '프롬프트에 스타일 이름만 적으면 이 규칙과 캐릭터·에셋 폴더가 자동 적용됩니다', h('button', { class: 'btn sm', onclick: openAddDesign }, '+ 직접 추가')),
    h('div', { class: 'tool-cards' }, presetCards,
      custom.map((r) => h('button', {
        type: 'button', class: 'tool-card on',
        onclick: () => openEditDesign(r),
      }, h('div', { class: 'top' }, h('b', null, r.name), h('span', { class: 'tag solid' }, '편집')), h('span', { class: 'small muted' }, [r.rules, r.assetPath].filter(Boolean).join(' · ') || '직접 추가')))));
}

// 내가 쓰는 브라우저 (Ego Lite, Aside 등) — 1클릭 선택 및 기본 지정
function browserPanel() {
  const saved = S.data.resources.filter((r) => r.kind === '브라우저');
  const detected = ui.tools?.browsers || [];
  const cards = detected.map((b) => {
    const existing = saved.find((r) => r.preset === b.key || r.name.toLowerCase() === b.name.toLowerCase());
    const on = Boolean(existing && existing.status !== '꺼짐');
    const isDef = Boolean(existing?.isDefault);
    return h('button', {
      type: 'button', class: `tool-card${on ? ' on' : ''}`, 'aria-pressed': on ? 'true' : 'false',
      onclick: () => once(`br-${b.key}`, () => {
        if (!existing) return act('POST', '/api/ui/resources', { kind: '브라우저', name: b.name, preset: b.key, command: b.command, guide: b.guide, note: b.hint, isDefault: true }, `${b.name}을 기본 브라우저로 켰어요`);
        if (!isDef) return act('PATCH', `/api/ui/resources/${existing.id}`, { status: '사용 가능', isDefault: true }, `${b.name}을 기본 브라우저로 바꿨어요`);
        if (!confirm(`${b.name}을 기본 브라우저에서 끌까요?`)) return null;
        return act('DELETE', `/api/ui/resources/${existing.id}`, undefined, `${b.name}을 껐어요`);
      }),
    },
    h('div', { class: 'top' }, h('b', null, b.name),
      isDef ? h('span', { class: 'tag solid' }, '기본') : on ? h('span', { class: 'tag' }, '켜짐') : b.found ? h('span', { class: 'tag' }, '설치됨') : null),
    h('span', { class: 'small muted' }, b.hint));
  });
  const custom = saved.filter((r) => !detected.some((b) => b.key === r.preset || b.name.toLowerCase() === r.name.toLowerCase()));
  return h('section', { class: 'sec' }, secHead('내가 쓰는 브라우저', '웹 확인·자동화가 필요할 때 AI가 이 브라우저를 씁니다'),
    h('div', { class: 'tool-cards' }, cards,
      custom.map((r) => h('button', {
        type: 'button', class: `tool-card${r.status !== '꺼짐' ? ' on' : ''}`,
        onclick: () => {
          if (r.isDefault) {
            if (confirm(`${r.name}을 브라우저 목록에서 뺄까요?`)) act('DELETE', `/api/ui/resources/${r.id}`, undefined, '뺐어요');
          } else {
            act('PATCH', `/api/ui/resources/${r.id}`, { isDefault: true, status: '사용 가능' }, `${r.name}을 기본 브라우저로 바꿨어요`);
          }
        },
      }, h('div', { class: 'top' }, h('b', null, r.name), r.isDefault ? h('span', { class: 'tag solid' }, '기본') : null), h('span', { class: 'small muted' }, r.note || '직접 추가')))));
}

// 내가 쓰는 오픈소스 도구 — 이 컴퓨터에서 찾은 것부터 원클릭 켜기/끄기
function ossPanel() {
  const saved = S.data.resources.filter((r) => r.kind === '오픈소스');
  const detected = ui.tools?.openSource || [];
  const sorted = [...detected.filter((x) => x.found), ...detected.filter((x) => !x.found)];
  const cards = sorted.map((o) => {
    const existing = saved.find((r) => r.preset === o.key || r.name.toLowerCase() === o.name.toLowerCase());
    const on = Boolean(existing && existing.status !== '꺼짐');
    const mainBtn = h('button', {
      type: 'button', class: `tool-card${on ? ' on' : ''}`, 'aria-pressed': on ? 'true' : 'false',
      onclick: () => once(`oss-${o.key}`, () => existing
        ? act('DELETE', `/api/ui/resources/${existing.id}`, undefined, `${o.name}을 뺐어요`)
        : act('POST', '/api/ui/resources', { kind: '오픈소스', name: o.name, preset: o.key, when: o.when, command: o.command, repo: o.repo || '', skillPath: o.skillPath, note: o.hint }, `${o.name}을 도구함에 넣었어요`)),
    },
    h('div', { class: 'top' }, h('b', null, existing ? existing.name : o.name),
      on ? h('span', { class: 'tag solid' }, '사용 중') : o.found ? h('span', { class: 'tag' }, '이 컴퓨터에 있음') : o.command && /^npx\b/i.test(o.command) ? h('span', { class: 'tag' }, 'npx') : null),
    h('span', { class: 'small muted', style: on ? 'padding-bottom:18px' : '' }, existing?.command && existing.command !== o.command ? `${existing.command} · ${existing.when || o.hint}` : o.hint));
    if (!on || !existing) return mainBtn;
    return h('div', { class: 'tool-card-wrap' }, mainBtn,
      h('button', { type: 'button', class: 'tool-card-edit', onclick: (ev) => { ev.stopPropagation(); openEditOss(existing); } }, '편집'));
  });
  const custom = saved.filter((r) => !detected.some((o) => o.key === r.preset || o.name.toLowerCase() === r.name.toLowerCase()));
  return h('section', { class: 'sec' }, secHead('내가 쓰는 오픈소스 도구', '켜 두거나 GitHub·npx로 추가하면, 프롬프트에 이름만 써도 AI가 정확히 꺼내 씁니다', h('button', { class: 'btn sm', onclick: openAddOss }, '+ GitHub / npx 추가')),
    h('div', { class: 'tool-cards' }, cards,
      custom.map((r) => h('button', {
        type: 'button', class: 'tool-card on',
        onclick: () => openEditOss(r),
      }, h('div', { class: 'top' }, h('b', null, r.name), h('span', { class: 'tag solid' }, r.command && /^npx\b/i.test(r.command) ? 'npx · 편집' : '편집')), h('span', { class: 'small muted' }, [r.command, r.when || r.note].filter(Boolean).join(' · ') || '직접 추가')))));
}

// ───────── 연결 계정 · 컴퓨터 유즈 권한 ─────────

function accountPlatformOf(r) {
  const list = S.options.accountPlatforms || [];
  return list.find((p) => p.key === r.platform) || list[list.length - 1] || { key: 'generic', name: '계정', actions: [] };
}

function defaultBrowser() {
  const browsers = S.data.resources.filter((x) => x.kind === '브라우저' && x.status !== '꺼짐');
  return browsers.find((b) => b.isDefault) || browsers[0] || null;
}

function accountSummaryText(r) {
  const p = accountPlatformOf(r);
  const perms = r.permissions || {};
  const br = (r.browser ? res(r.browser) : null) || defaultBrowser();
  const pinnedEmp = r.assignee ? emp(r.assignee) : null;
  const parts = [];
  if (br && br.kind === '브라우저') parts.push(r.spaceName ? `${br.name} (${r.spaceName})` : br.name);
  else if (r.spaceName) parts.push(`스페이스: ${r.spaceName}`);
  if (pinnedEmp) parts.push(`${shortName(pinnedEmp.id)} 전담`);
  if (r.preset === 'readonly') {
    parts.push('읽기만 (안전)');
  } else {
    const allow = [];
    const approval = [];
    const deny = [];
    for (const a of p.actions) {
      const lv = perms[a.key] || a.locked || 'deny';
      const short = a.short || a.label.split(' ')[0].replace(/·.+/, '');
      if (lv === 'allow') allow.push(short);
      else if (lv === 'approval') approval.push(short);
      else deny.push(short);
    }
    if (allow.length) parts.push(`${allow.join('·')} 자동`);
    if (approval.length) parts.push(`${approval.join('·')} 승인 후`);
    if (deny.length) parts.push(`${deny.join('·')} 금지`);
  }
  return parts.join(' · ') || '권한을 정해 주세요';
}

function openAddAccount() {
  const dlg = document.getElementById('dlg');
  const plats = S.options.accountPlatforms || [];
  const cats = S.options.accountCategories || [{ key: 'media', label: '영상 · 숏폼 · SNS' }, { key: 'business', label: '블로그 · 고객 · 커머스' }, { key: 'ops', label: '개발 · 결제 · 기타' }];
  const browsers = S.data.resources.filter((r) => r.kind === '브라우저' && r.status !== '꺼짐');
  const defBr = browsers.find((b) => b.isDefault) || browsers[0] || null;
  let pickedPlat = plats[0]?.key || 'youtube';
  let pickedPreset = 'approval';
  let pickedBr = '';
  let pickedEmp = '';
  const name = h('input', { class: 'in', value: plats[0]?.name || '', placeholder: '예: 네이버 블로그, 네이버 클립, YouTube', 'aria-label': '계정 이름' });
  const spaceIn = h('input', { class: 'in', placeholder: '예: 이메일, 네이버, 결제, SNS (선택)', 'aria-label': 'Ego Lite 스페이스' });
  const note = h('input', { class: 'in', placeholder: '메모 (선택, 예: 검색 유입·숏폼 채널)', 'aria-label': '메모' });
  const presetRow = h('div', { class: 'picker' });
  const renderPresets = () => {
    const curPlat = plats.find((x) => x.key === pickedPlat);
    const isPay = pickedPlat === 'payment';
    if (isPay) pickedPreset = 'readonly';
    else if (pickedPreset === 'draft_auto' && !curPlat?.supportsDraftAuto) pickedPreset = 'approval';
    const opts = [
      { key: 'readonly', label: '읽기만 (안전)' },
      ...(isPay ? [] : [{ key: 'approval', label: '초안·승인 후 (추천)' }]),
      ...(curPlat?.supportsDraftAuto ? [{ key: 'draft_auto', label: '임시저장만 자동 (크리에이터)' }] : []),
    ];
    presetRow.replaceChildren(...opts.map((pr) => h('button', {
      type: 'button', class: `chip${pickedPreset === pr.key ? ' on' : ''}`,
      onclick: () => { pickedPreset = pr.key; renderPresets(); },
    }, pr.label)));
  };
  const allChipBtns = [];
  const platGroups = h('div', { class: 'plat-groups' }, cats.map((cat) => {
    const items = plats.filter((p) => (p.category || 'ops') === cat.key);
    if (!items.length) return null;
    return h('div', { class: 'plat-group' },
      h('div', { class: 'small muted', style: 'margin-bottom:5px' }, cat.label),
      h('div', { class: 'picker' }, items.map((p) => {
        const btn = h('button', {
          type: 'button', class: `chip${p.key === pickedPlat ? ' on' : ''}`,
          onclick: () => {
            const prevPlat = plats.find((x) => x.key === pickedPlat);
            pickedPlat = p.key;
            if (!name.value.trim() || name.value === prevPlat?.name) name.value = p.name;
            for (const b of allChipBtns) b.classList.toggle('on', b === btn);
            renderPresets();
          },
        }, p.name);
        allChipBtns.push(btn);
        return btn;
      })));
  }));
  renderPresets();
  const brSel = browsers.length ? h('select', { class: 'in', 'aria-label': '연결 브라우저', onchange: (ev) => { pickedBr = ev.target.value; } },
    h('option', { value: '' }, defBr ? `기본 브라우저 자동 사용 (${defBr.name})` : '기본 브라우저 자동 사용'),
    browsers.map((b) => h('option', { value: b.id, selected: b.id === pickedBr }, `${b.name}${b.isDefault ? ' (기본)' : ''}`))) : null;
  const empSel = S.data.employees.length ? h('select', { class: 'in', 'aria-label': '담당 AI 모델', onchange: (ev) => { pickedEmp = ev.target.value; } },
    h('option', { value: '' }, '자동 배정 (할 일에 맞춰 고름)'),
    S.data.employees.map((e) => h('option', { value: e.id }, `${e.name}${e.role ? ` · ${e.role}` : ''}`))) : null;
  setDlg(dlg, 
    h('h3', null, '연결 계정 추가'),
    h('p', { class: 'small muted', style: 'margin:-8px 0 12px' }, '브라우저(Ego Lite 등)로 들어갈 계정을 고르면, 알맞은 안전 권한이 미리 채워집니다.'),
    platGroups,
    h('label', { class: 'field', style: 'margin-top:12px' }, '계정 이름', name),
    brSel ? h('label', { class: 'field', style: 'margin-top:12px' }, '연결 브라우저', brSel) : null,
    h('label', { class: 'field', style: 'margin-top:12px' }, 'Ego Lite 스페이스 (선택)', spaceIn),
    empSel ? h('label', { class: 'field', style: 'margin-top:12px' }, '전담 AI 직원 (선택)', empSel) : null,
    h('div', { style: 'margin-top:12px' }, h('div', { class: 'small muted', style: 'margin-bottom:6px' }, '처음 권한'), presetRow),
    h('label', { class: 'field', style: 'margin-top:12px' }, '메모 (선택)', note),
    h('div', { class: 'bar' },
      h('button', { class: 'btn', onclick: () => { dlg.close(); render(); } }, '취소'),
      h('button', { class: 'btn dark', onclick: () => once('add-acc', async () => {
        if (!name.value.trim()) { name.focus(); return; }
        dlg.close();
        const created = await act('POST', '/api/ui/resources', {
          kind: '계정', name: name.value, platform: pickedPlat, preset: pickedPreset, browser: pickedBr || null, spaceName: spaceIn.value.trim(), assignee: pickedEmp || null, note: note.value,
        }, '계정을 추가했어요');
        if (created?.id) { ui.openAccount = created.id; render(); }
      }) }, '추가')));
  dlg.showModal();
  name.focus();
}

function accountCard(r) {
  const p = accountPlatformOf(r);
  const perms = r.permissions || {};
  const browsers = S.data.resources.filter((x) => x.kind === '브라우저' && x.status !== '꺼짐');
  const defBr = defaultBrowser();
  const activeBr = (r.browser ? res(r.browser) : null) || defBr;
  const openUrl = r.url || p.url || '';
  const open = ui.openAccount === r.id;
  const levels = S.options.permLevels || ['deny', 'approval', 'allow'];
  const labels = S.options.permLabels || { deny: '금지', approval: '승인 후', allow: '자동' };
  const toggleOpen = () => { ui.openAccount = open ? null : r.id; render(); };
  const setPreset = (preset) => act('PATCH', `/api/ui/resources/${r.id}`, { preset },
    preset === 'readonly' ? '읽기만으로 바꿨어요' : preset === 'draft_auto' ? '임시저장만 자동으로 바꿨어요' : '초안·승인 후로 바꿨어요');
  const setPerm = (key, lv) => act('PATCH', `/api/ui/resources/${r.id}`, { permissions: { [key]: lv } }, `${p.actions.find((a) => a.key === key)?.label || key}: ${labels[lv]}`);
  const isPay = p.key === 'payment';
  return h('li', { class: `acc-item${open ? ' open' : ''}`, 'data-acc': r.id },
    h('div', { class: 'acc-head' },
      h('div', { class: 'main', onclick: toggleOpen, style: 'cursor:pointer' },
        h('div', { class: 't' }, r.name, h('span', { class: 'tag', style: 'margin-left:8px' }, p.name)),
        h('div', { class: 's' }, accountSummaryText(r))),
      h('div', { class: 'row' },
        h('button', { type: 'button', class: `btn sm${open ? ' dark' : ''}`, 'aria-expanded': open ? 'true' : 'false', onclick: toggleOpen }, open ? '닫기' : '권한 설정'),
        h('button', { class: 'x', 'aria-label': `${r.name} 지우기`, onclick: () => { if (confirm(`이 계정을 지울까요?\n${r.name}`)) { if (ui.openAccount === r.id) ui.openAccount = null; act('DELETE', `/api/ui/resources/${r.id}`, undefined, '지웠어요'); } } }, '×'))),
    open ? h('div', { class: 'acc-body' },
      h('div', { class: 'acc-row' },
        h('span', { class: 'small muted' }, '연결 브라우저'),
        browsers.length ? h('div', { class: 'picker' },
          h('button', { type: 'button', class: `chip${!r.browser ? ' on' : ''}`, onclick: () => act('PATCH', `/api/ui/resources/${r.id}`, { browser: null }, defBr ? `기본 브라우저(${defBr.name})를 씁니다` : '기본 브라우저를 씁니다') }, defBr ? `기본 (${defBr.name})` : '기본 브라우저'),
          browsers.map((b) => h('button', { type: 'button', class: `chip${r.browser === b.id ? ' on' : ''}`, onclick: () => act('PATCH', `/api/ui/resources/${r.id}`, { browser: b.id }, `${b.name}로 고정했어요`) }, b.name)),
          openUrl ? h('a', { class: 'btn link', href: openUrl, target: '_blank', rel: 'noopener noreferrer', style: 'margin-left:4px' }, '사이트 열기 ↗') : null)
          : h('span', { class: 'small muted' }, '위에서 Ego Lite를 한 번만 켜 두면 모든 연결 계정이 자동으로 접속돼요')),
      (() => {
        const sp = h('input', { class: 'in sm', value: r.spaceName || '', 'data-k': `acc-sp-${r.id}`, placeholder: '예: 이메일, 네이버, 결제, SNS (선택)', style: 'max-width:220px', 'aria-label': 'Ego Lite 스페이스' });
        const saveSp = () => act('PATCH', `/api/ui/resources/${r.id}`, { spaceName: sp.value.trim() }, '스페이스 이름을 저장했어요');
        sp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && !ev.isComposing) saveSp(); });
        return h('div', { class: 'acc-row' }, h('span', { class: 'small muted' }, '스페이스'), h('div', { class: 'row' }, sp, h('button', { type: 'button', class: 'btn sm', onclick: saveSp }, '저장')));
      })(),
      S.data.employees.length ? h('div', { class: 'acc-row' },
        h('span', { class: 'small muted' }, '전담 AI'),
        h('div', { class: 'picker' },
          h('button', { type: 'button', class: `chip${!r.assignee ? ' on' : ''}`, onclick: () => act('PATCH', `/api/ui/resources/${r.id}`, { assignee: null }, '할 일에 맞춰 자동 배정해요') }, '자동 배정'),
          S.data.employees.map((e) => h('button', { type: 'button', class: `chip${r.assignee === e.id ? ' on' : ''}`, onclick: () => act('PATCH', `/api/ui/resources/${r.id}`, { assignee: e.id }, `${shortName(e.id)}을 전담 AI로 연결했어요`) }, shortName(e.id))))) : null,
      h('div', { class: 'acc-row' },
        h('span', { class: 'small muted' }, '빠른 설정'),
        h('div', { class: 'picker' },
          h('button', { type: 'button', class: `chip${r.preset === 'readonly' ? ' on' : ''}`, onclick: () => setPreset('readonly') }, '읽기만 (안전)'),
          !isPay ? h('button', { type: 'button', class: `chip${r.preset === 'approval' ? ' on' : ''}`, onclick: () => setPreset('approval') }, '초안·승인 후 (추천)') : null,
          p.supportsDraftAuto ? h('button', { type: 'button', class: `chip${r.preset === 'draft_auto' ? ' on' : ''}`, onclick: () => setPreset('draft_auto') }, '임시저장만 자동') : null,
          r.preset === 'custom' ? h('span', { class: 'tag' }, '직접 설정') : null)),
      h('div', { class: 'perm-list' }, p.actions.map((a) => {
        const cur = perms[a.key] || a.locked || 'deny';
        return h('div', { class: 'perm-row' },
          h('span', { class: 'perm-label' }, a.label),
          a.locked
            ? h('span', { class: 'tag' }, '항상 금지 · 대표만')
            : h('div', { class: 'seg', role: 'group', 'aria-label': `${a.label} 권한` }, levels.map((lv) => h('button', {
              type: 'button', class: cur === lv ? 'on' : '', 'aria-pressed': cur === lv ? 'true' : 'false',
              onclick: () => cur !== lv && setPerm(a.key, lv),
            }, labels[lv]))));
      })),
      h('p', { class: 'small muted acc-guard' }, `${activeBr ? `${activeBr.name}에서 처음 한 번만 직접 로그인해 두면 AI가 위 권한 안에서 접속해요. ` : ''}고정 안전선: ${(S.options.hardGuardrails || ['비밀번호 입력', '본인인증', '결제·송금']).join(' · ')}은 대표님만 할 수 있어요.`)) : null);
}

function accountsPanel() {
  const list = S.data.resources.filter((r) => r.kind === '계정');
  return h('section', { class: 'sec' },
    secHead('연결 계정 · 자동화 권한', 'Ego Lite 같은 브라우저로 들어갈 계정마다 AI에게 어디까지 허용할지 정합니다', h('button', { class: 'btn sm', onclick: openAddAccount }, '+ 계정 추가')),
    list.length
      ? h('ul', { class: 'acc-list' }, list.map(accountCard))
      : h('div', { class: 'empty' }, '아직 연결된 계정이 없어요. YouTube, Instagram 같은 계정을 추가하고 권한을 정해 보세요.'));
}

function pageResources() {
  if (!ui.office) loadOffice();
  if (!ui.tools) loadTools();
  const d = S.data;
  const tab = ui.resTab || 'all';
  const show = (k) => tab === 'all' || tab === k;
  const genericKinds = S.options.resKinds.filter((k) => !['브라우저', '오픈소스', '계정', '디자인'].includes(k));
  const webCount = d.resources.filter((r) => ['브라우저', '계정'].includes(r.kind)).length;
  const toolsCount = d.resources.filter((r) => ['오픈소스', '디자인'].includes(r.kind)).length;
  const officeCount = d.resources.filter((r) => genericKinds.includes(r.kind)).length;
  const tabs = [
    ['all', '전체'],
    ['web', `브라우저 · 계정 (${webCount})`],
    ['tools', `오픈소스 · 디자인 (${toolsCount})`],
    ['office', `사무실 · 기기 (${officeCount})`],
  ];
  const name = h('input', { class: 'in', placeholder: '새 리소스 (예: Office 2 맥북, iPhone 미러링, 외장 SSD)', 'data-k': 'rs-name', 'aria-label': '리소스 이름' });
  const kind = h('select', { class: 'in', style: 'width:110px', 'data-k': 'rs-kind', 'aria-label': '종류' }, genericKinds.map((k) => h('option', { value: k }, k)));
  const add = () => submitInput(name, 'add-res', (v) => act('POST', '/api/ui/resources', { name: v, kind: kind.value }, '추가했어요'));
  name.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) add(); });
  return h('div', null,
    h('div', { class: 'head' }, h('div', null, h('h1', null, h('b', null, '내 리소스')),
      h('div', { class: 'sub' }, '여기에 한 번만 넣어 두면 할 일 프롬프트에 이름만 써도 AI가 알아서 연결합니다.')),
    h('button', { class: 'btn', onclick: () => { loadOffice(); loadTools(); } }, '다시 읽기')),
    h('div', { class: 'picker', style: 'margin-bottom:20px' }, tabs.map(([k, label]) => h('button', {
      type: 'button', class: `chip${tab === k ? ' on' : ''}`, onclick: () => { ui.resTab = k; render(); },
    }, label))),
    show('web') ? browserPanel() : null,
    show('web') ? accountsPanel() : null,
    show('tools') ? ossPanel() : null,
    show('tools') ? designPanel() : null,
    show('office') ? h('section', { class: 'sec' }, secHead('사무실 컴퓨터 · 멤버십 · 폴더 추가'),
      h('div', { class: 'addbar slim' }, kind, name, h('button', { class: 'btn dark', onclick: add }, '추가'))) : null,
    show('office') ? lanPanel() : null,
    show('web') ? musePanel() : null,
    show('office') ? genericKinds.map((k) => {
      const list = d.resources.filter((r) => r.kind === k);
      return list.length ? h('section', { class: 'sec' }, secHead(k, `${list.length}개`), h('ul', { class: 'list' }, list.map(resRow))) : null;
    }) : null);
}

// ───────── 1분 시작하기 (처음 켠 사람) ─────────
// 대표 이름과 회사 이름 → 이 컴퓨터에서 찾은 AI 체크 → 사무실 확인 → 자는 시간 → AI 도구 연결 (묻고 보여 주기) → 안전 규칙

const OB_STEPS = 6;

const STARTER_ROUTINES = [
  { key: 'email', title: '이메일 · 수강생 문의 체크', intervalMin: 5, instruction: '5분마다 Ego Lite 이메일 스페이스에서 새 메일과 문의를 확인해 줘. 급한 건 요약해 알리고, 답장은 초안만 임시저장해 둬.' },
  { key: 'news', title: '아침 업계 소식 3줄 요약', time: '08:30', instruction: '오늘 AI·자동화·크리에이터 업계의 핵심 소식 3가지를 골라 1줄 요약과 내 사업에 적용할 아이디어 1개씩 정리해 줘.' },
  { key: 'plan', title: '오늘 할 일 정리와 우선순위 추천', time: '09:00', instruction: '오늘 할 일 목록을 보고 대표님이 직접 해야 할 핵심 3가지와 AI가 먼저 처리할 일을 우선순위대로 정리해 줘.' },
  { key: 'wrap', title: '오늘 끝난 일 하루 마감 정리', time: '22:00', instruction: '오늘 완료된 할 일과 미완료 항목을 정리하고, 내일 아침에 바로 이어서 할 일 3가지를 제안해 줘.' },
];

function obState() {
  if (!ui.ob) {
    ui.ob = { step: 1, name: S.data.owner.name || '', company: S.data.settings.companyName || '', ais: new Set(), machines: new Set(), ssh: new Set(),
      browsers: new Set(), oss: new Set(), routines: new Set(), skippedConnect: false,
      quiet: { from: S.data.settings.quietHours?.from || '23:00', to: S.data.settings.quietHours?.to || '07:00' }, det: null, connect: null, open: {} };
    fetch('/api/onboard/detect').then((r) => r.json()).then((det) => {
      ui.ob.det = det;
      if (det.claude) ui.ob.ais.add('claudecode');
      if (det.codex) ui.ob.ais.add('codex');
      if (det.gemini) ui.ob.ais.add('gemini');
      if (det.ollama) ui.ob.ais.add('ollama'); else if (det.lmstudio) ui.ob.ais.add('lmstudio');
      for (const b of det.browsers || []) if (b.found) ui.ob.browsers.add(b.key);
      for (const o of det.openSource || []) if (o.found) ui.ob.oss.add(o.key);
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
  return h('div', { class: 'ob-cmd' }, h('div', { class: 'row' }, h('span', { class: 'small muted' }, label), h('button', { type: 'button', class: 'btn sm', onclick: async () => { await copyText(textValue); toast('복사했어요'); } }, '복사')),
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
    if (!ob.focused1) { ob.focused1 = true; setTimeout(() => document.querySelector('[data-k="ob-name"]')?.focus(), 0); }
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
    const allBrowsers = det.browsers || [];
    const showBrowsers = allBrowsers.filter((b) => b.found || ['egolite', 'chrome'].includes(b.key));
    const foundOss = (det.openSource || []).filter((o) => o.found);
    const chips = ['Mac mini', 'Mac Studio', 'MacBook Pro', 'MacBook Air', 'Windows PC'];
    const toggle = (set, v) => { if (set.has(v)) set.delete(v); else set.add(v); render(); };
    const done = async () => { const r = await obSend({ machines: [...ob.machines], sshHosts: [...ob.ssh], browsers: [...ob.browsers], openSource: [...ob.oss] }); if (r) next(4); };
    return obShell(3, '컴퓨터와 도구를 확인해 주세요.', '이 컴퓨터는 본사로 자동 등록돼요. 웹 자동화에 쓸 브라우저와 설치된 도구를 골라 두세요 (나중에 내 리소스에서 바꿀 수 있어요).',
      h('div', null,
        h('div', { class: 'card' }, h('div', { class: 'row' }, h('b', null, '이 컴퓨터 · 본사'), h('span', { class: 'tag' }, '자동')),
          h('div', { class: 'small muted' }, [M.chip, M.memoryGB ? `메모리 ${M.memoryGB}GB` : '', M.diskFreeGB ? `여유 ${M.diskFreeGB}GB` : ''].filter(Boolean).join(' · ') || '읽는 중')),
        showBrowsers.length ? h('div', { class: 'ob-group' }, h('div', { class: 'small muted' }, '웹 확인 · 자동화에 쓸 브라우저 (Ego Lite 추천)'),
          h('div', { class: 'picker' }, showBrowsers.map((b) => h('button', { type: 'button', class: `chip${ob.browsers.has(b.key) ? ' on' : ''}`, 'aria-pressed': ob.browsers.has(b.key) ? 'true' : 'false', onclick: () => toggle(ob.browsers, b.key) },
            `${b.name}${b.found ? ' · 설치됨' : b.key === 'egolite' ? ' · 추천' : ''}`)))) : null,
        foundOss.length ? h('div', { class: 'ob-group' }, h('div', { class: 'small muted' }, '이 컴퓨터에서 찾은 오픈소스 도구 (알맞은 일에 알아서 씀)'),
          h('div', { class: 'picker' }, foundOss.map((o) => h('button', { type: 'button', class: `chip${ob.oss.has(o.key) ? ' on' : ''}`, 'aria-pressed': ob.oss.has(o.key) ? 'true' : 'false', onclick: () => toggle(ob.oss, o.key) }, o.name)))) : null,
        hosts.length ? h('div', { class: 'ob-group' }, h('div', { class: 'small muted' }, 'ssh 설정에서 찾은 컴퓨터 (이름만 읽었어요, 접속은 하지 않아요)'),
          h('div', { class: 'picker' }, hosts.map((a) => h('button', { type: 'button', class: `chip${ob.ssh.has(a) ? ' on' : ''}`, 'aria-pressed': ob.ssh.has(a) ? 'true' : 'false', onclick: () => toggle(ob.ssh, a) }, a)))) : null,
        h('div', { class: 'ob-group' }, h('div', { class: 'small muted' }, '다른 컴퓨터가 있으면 골라 주세요 (없으면 그대로 확인).'),
          h('div', { class: 'picker' }, chips.map((c) => h('button', { type: 'button', class: `chip${ob.machines.has(c) ? ' on' : ''}`, 'aria-pressed': ob.machines.has(c) ? 'true' : 'false', onclick: () => toggle(ob.machines, c) }, c))))),
      [h('button', { class: 'btn', onclick: () => next(2) }, '이전'), h('button', { class: 'btn dark big', 'data-act': 'ob-next', onclick: done }, '확인')]);
  }

  if (ob.step === 4) {
    const from = h('input', { class: 'in', type: 'time', value: ob.quiet.from, 'data-k': 'ob-q-from', 'aria-label': '자는 시간 시작', oninput: (ev) => { ob.quiet.from = ev.target.value; } });
    const to = h('input', { class: 'in', type: 'time', value: ob.quiet.to, 'data-k': 'ob-q-to', 'aria-label': '자는 시간 끝', oninput: (ev) => { ob.quiet.to = ev.target.value; } });
    const done = async () => {
      const r = await obSend({ quiet: ob.quiet });
      if (!r) return;
      ob.connect = null;
      ob.skippedConnect = false;
      next(5);
    };
    return obShell(4, '몇 시에 자나요?', '이 시간에는 AI가 대표님을 부르지 않아요. 일은 계속하고, 메시지와 확인 요청은 아침에 볼 수 있게 남겨 둬요.',
      h('div', { class: 'ob-quiet' }, h('label', { class: 'field' }, '자는 시간', from), h('span', { class: 'muted', 'aria-hidden': 'true' }, '~'), h('label', { class: 'field' }, '일어나는 시간', to)),
      [h('button', { class: 'btn', onclick: () => next(3) }, '이전'), h('button', { class: 'btn dark big', 'data-act': 'ob-next', onclick: done }, '다음')]);
  }

  if (ob.step === 5) {
    const refreshConnect = (autoSkip = false) => {
      ob.connect = { loading: true };
      render();
      fetch('/api/onboard/connect').then((r) => r.json()).then((c) => {
        ob.connect = c;
        const foundHired = (c.targets || []).filter((t) => t.found && t.hired);
        if (autoSkip && !foundHired.length && ob.step === 5) {
          ob.skippedConnect = true;
          ob.step = 6;
        }
        render();
      }).catch(() => { ob.connect = { targets: [] }; render(); });
    };
    if (!ob.connect) {
      ob.connect = { loading: true };
      fetch('/api/onboard/connect').then((r) => r.json()).then((c) => {
        ob.connect = c;
        const foundHired = (c.targets || []).filter((t) => t.found && t.hired);
        if (!foundHired.length && ob.step === 5) {
          ob.skippedConnect = true;
          ob.step = 6;
        }
        render();
      }).catch(() => { ob.connect = { targets: [] }; render(); });
    }
    const list = (ob.connect.targets || []).filter((t) => t.found && t.hired);
    const row = (t) => {
      const done = t.mcp.configured && (!t.skill || t.skill.installed);
      const open = ob.open[t.key];
      return h('div', { class: 'ob-conn' },
        h('div', { class: 'row' }, h('div', null, h('b', null, t.name), h('div', { class: 'small muted' }, `직원 아이디 ${t.employee}${t.skill ? ' · 출입증(MCP)과 직원 수첩(스킬)' : ' · 출입증(MCP)'}`)),
          done ? h('span', { class: 'tag solid' }, '이미 연결됨')
            : h('button', { type: 'button', class: `btn sm${open ? '' : ' dark'}`, 'aria-expanded': open ? 'true' : 'false', onclick: () => { ob.open[t.key] = !open; render(); } }, open ? '접기' : '넣을래요')),
        open && !done ? h('div', { class: 'ob-cmds' },
          !t.mcp.configured ? (t.mcp.line ? copyBlock('터미널에 붙여 넣기 · 출입증(MCP)', t.mcp.line) : copyBlock(`${t.mcp.file} 에 합치기 · 출입증(MCP)`, t.mcp.snippet)) : null,
          t.skill && !t.skill.installed ? copyBlock('터미널에 붙여 넣기 · 직원 수첩(스킬)', t.skill.line) : null) : null);
    };
    return obShell(5, 'AI 도구를 본사에 연결할까요?', '찾기만 했고 아직 아무것도 바꾸지 않았어요. 넣을 도구만 눌러 명령을 확인하세요. 터미널에서 명령을 실행한 뒤 "연결 다시 확인"을 누르면 상태를 바로 확인합니다.',
      ob.connect.loading ? h('div', { class: 'small muted' }, '이 컴퓨터를 살펴보는 중')
        : list.length ? h('div', null,
          h('div', { class: 'row', style: 'justify-content:flex-end;margin-bottom:8px' },
            h('button', { type: 'button', class: 'btn sm', onclick: () => refreshConnect(false) }, '연결 다시 확인')),
          list.map(row))
          : h('div', { class: 'card small muted' }, '이 컴퓨터에서 연결할 AI 도구를 찾지 못했어요. 웹에서 쓰는 AI는 할 일에서 지시문을 복사해서 맡기면 돼요.'),
      [h('button', { class: 'btn', onclick: () => next(4) }, '이전'), h('button', { class: 'btn dark big', 'data-act': 'ob-next', onclick: () => next(6) }, '다음')]);
  }

  const finishWithRoutines = () => once('ob-done', async () => {
    const picked = STARTER_ROUTINES.filter((x) => ob.routines.has(x.key)).map(({ title, time, intervalMin, instruction }) => ({ title, time, intervalMin, instruction }));
    if (picked.length) await obSend({ routines: picked });
    await act('PATCH', '/api/ui/settings', { onboarded: true }, '본사를 열었어요');
    ui.ob = null;
    location.hash = '#home';
  });
  return obShell(6, '돈과 공개는 대표님 손으로만', '결제, 업로드, 게시, 삭제, 메시지 발송이 들어간 일은 대표님이 누를 때까지 AI가 시작하지 못해요. 원하시면 첫 매일 루틴도 하나 골라 바로 시작해 보세요.',
    h('div', null,
      h('div', { class: 'ob-assign' }, h('span', { class: 'who-chip ai' }, 'AI'), h('div', null, h('b', null, '광고비 5만원 결제'), h('div', { class: 'small muted' }, '결제가 들어간 일 → 사람')), h('span', { class: 'btn sm dark', 'aria-hidden': 'true' }, '결제 확인')),
      h('div', { class: 'ob-group' }, h('div', { class: 'small muted' }, '첫 매일 루틴 하나 담아 볼까요? (선택, 프롬프트까지 채워서 들어갑니다)'),
        h('div', { class: 'ob-routines' }, STARTER_ROUTINES.map((rt) => {
          const on = ob.routines.has(rt.key);
          const sched = rt.intervalMin ? `${rt.intervalMin}분마다` : rt.time;
          return h('button', { type: 'button', class: `chip${on ? ' on' : ''}`, 'aria-pressed': on ? 'true' : 'false', onclick: () => { if (on) ob.routines.delete(rt.key); else ob.routines.add(rt.key); render(); } }, `${sched} · ${rt.title}`);
        })))),
    [h('button', { class: 'btn', onclick: () => next(ob.skippedConnect ? 4 : 5) }, '이전'), h('button', { class: 'btn dark big', 'data-act': 'ob-finish', onclick: finishWithRoutines }, '알겠어요, 본사 열기')]);
}

// ───────── 라우팅 ─────────

function readHash() {
  const raw = decodeURIComponent(location.hash.replace(/^#/, ''));
  const [route, ...rest] = raw.split('/');
  const next = route || 'home';
  if (next !== ui.route) { ui.open = null; ui.picking = null; ui.rtPicking = null; ui.editingEmp = null; ui.empDraftEngine = {}; window.scrollTo(0, 0); }
  if (next === 'resources') ui.office = null;
  ui.route = next;
  ui.param = rest.join('/');
  if (next === 'home' && /^t\d+$/.test(ui.param)) ui.open = ui.param;
}

window.addEventListener('hashchange', () => { readHash(); render(); });
document.getElementById('dlg')?.addEventListener('close', (e) => {
  e.currentTarget.className = '';
  if (ui.pendingRender) { ui.pendingRender = false; render(); }
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const dlg = document.getElementById('dlg');
  if (dlg && dlg.open) return;
  const active = document.activeElement;
  if (active && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName)) { active.blur(); return; }
  if (ui.picking || ui.rtPicking || ui.open) { ui.picking = null; ui.rtPicking = null; ui.open = null; render(); }
});
readHash();
load();

// 새 소식: 누가 일하거나 배분 중이거나 스레드를 열어 두면 4초, 아니면 30초
let tick = 0;
setInterval(() => {
  tick++;
  const fast = S && (S.working.length || S.assigning.length || ui.open);
  if (document.hidden && !fast) return;
  if (fast || tick % 8 === 0) load({ background: true }).catch(() => {});
}, 4000);
