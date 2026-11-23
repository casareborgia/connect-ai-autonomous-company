// AI 회사 본사 · 화면
// 네 칸: 오늘 할 일, 자동 루틴, AI 직원, AI 사무실.
// 모든 데이터는 textContent 로만 넣는다 (AI가 쓴 글은 데이터일 뿐, 절대 실행하지 않음).
'use strict';

const C = window.Charts;
let S = null;
const ui = {
  route: 'home', param: '', open: null, picking: null, rtPicking: null, editingEmp: null, openAccount: null, resTab: 'all',
  taskPick: 'jay', rtPick: 'jay', rtSched: 'time', homeFilter: 'all', doneOpen: false, insertOpen: {}, empDraftEngine: {},
  swarmTeam: 'all', swarmSelected: 'all',
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

function closeDlg() {
  const dlg = document.getElementById('dlg');
  if (!dlg) return;
  dlg.className = '';
  if (dlg.open) dlg.close();
}

function githubShortLabel(url) {
  const s = String(url || '').trim();
  if (!s) return '';
  const m = /^https?:\/\/github\.com\/([^/\s]+\/[^/\s]+)(?:\/tree\/[^/]+\/(.+))?/i.exec(s);
  if (m) return m[2] ? `${m[1]}/${m[2].split('/').slice(-1)[0]}` : m[1];
  return s.replace(/^https?:\/\//i, '').slice(0, 36);
}

function parseClientRepoHint(raw) {
  const s = String(raw || '').trim();
  if (!s) return { name: '', command: '' };
  const ghUrl = /^https?:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(\/.*)?$/i.exec(s);
  if (ghUrl) {
    const subParts = (ghUrl[3] || '').replace(/\/+$/, '').split('/').filter(Boolean);
    const subLeaf = subParts.length >= 3 && (subParts[0] === 'tree' || subParts[0] === 'blob')
      ? subParts[subParts.length - 1].replace(/\.(md|mjs|js|ts|py)$/i, '')
      : '';
    return {
      name: subLeaf && subLeaf.toLowerCase() !== 'skill' ? subLeaf : ghUrl[2],
      command: `npx github:${ghUrl[1]}/${ghUrl[2]}`,
    };
  }
  const ghShort = /^(?:npx\s+(?:-y\s+)?)?github:([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/i.exec(s);
  if (ghShort) return { name: ghShort[2], command: s.startsWith('npx') ? s : `npx ${s}` };
  const pair = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(s);
  if (pair && !s.startsWith('@')) return { name: pair[2], command: `npx github:${pair[1]}/${pair[2]}` };
  const npx = /^npx\s+(?:-y\s+)?(@?[A-Za-z0-9_./@-]+)/i.exec(s);
  if (npx) return { name: npx[1].split('/').pop().replace(/@[^@]+$/, ''), command: s };
  return { name: '', command: '' };
}

function skillPillsEl(empObj, { onDark = false, max = 6 } = {}) {
  const skills = Array.isArray(empObj?.skills) ? empObj.skills : [];
  if (!skills.length) {
    return onDark
      ? h('div', { class: 'swarm-brain-bar' },
        h('button', { type: 'button', class: 'swarm-brain-pill', onclick: () => openEmployeeSkillsModal(empObj.id) }, '+ GitHub 스킬 연결 (예: Remotion)'))
      : h('button', { type: 'button', class: 'input-me', onclick: () => openEmployeeSkillsModal(empObj.id) }, '+ GitHub 스킬 연결 (예: Remotion)');
  }
  const shown = skills.slice(0, max);
  const more = skills.length - shown.length;
  return h('div', { class: `skill-pills${onDark ? ' on-dark' : ''}` },
    shown.map((sk) => h('span', { class: `skill-pill${onDark ? ' on-dark' : ''}`, title: [sk.when ? `키워드: ${sk.when}` : '', sk.command ? `명령: ${sk.command}` : '', sk.repo || ''].filter(Boolean).join('\n') },
      h('span', { class: 'skill-pill-name' }, sk.name),
      sk.repo ? h('a', { class: 'skill-gh-link', href: sk.repo, target: '_blank', rel: 'noopener noreferrer', title: sk.repo }, 'GitHub ↗') : null)),
    more > 0 ? h('button', { type: 'button', class: `skill-pill-add${onDark ? ' on-dark' : ''}`, onclick: () => openEmployeeSkillsModal(empObj.id) }, `+${more}`) : null,
    h('button', { type: 'button', class: `skill-pill-add${onDark ? ' on-dark' : ''}`, onclick: () => openEmployeeSkillsModal(empObj.id) }, '+ 스킬'));
}

function openEmployeeSkillsModal(empOrId) {
  const empId = typeof empOrId === 'string' ? empOrId : empOrId?.id;
  if (!empId) return;
  const dlg = document.getElementById('dlg');
  dlg.className = 'wide';
  let editingSkillId = null;

  const repoIn = h('input', { class: 'in', placeholder: 'https://github.com/remotion-dev/remotion 또는 owner/repo · npx 명령', 'aria-label': 'GitHub 주소 또는 실행 명령' });
  const nameIn = h('input', { class: 'in', placeholder: '예: Remotion 모션그래픽', 'aria-label': '스킬 이름' });
  const cmdIn = h('input', { class: 'in mono', placeholder: '예: npx remotion (선택)', 'aria-label': '실행 명령' });
  const whenIn = h('input', { class: 'in', placeholder: '예: 영상편집, 모션그래픽, 리모션, 쇼츠', 'aria-label': '언제 쓸지 키워드' });
  const noteIn = h('input', { class: 'in', placeholder: '예: 9:16 세로 쇼츠 인트로 기준 (선택)', 'aria-label': '스킬 메모' });
  let nameTouched = false;
  let cmdTouched = false;
  nameIn.addEventListener('input', () => { nameTouched = Boolean(nameIn.value.trim()); });
  cmdIn.addEventListener('input', () => { cmdTouched = Boolean(cmdIn.value.trim()); });
  repoIn.addEventListener('input', () => {
    const hint = parseClientRepoHint(repoIn.value);
    if (!nameTouched && hint.name) nameIn.value = hint.name;
    if (!cmdTouched && hint.command) cmdIn.value = hint.command;
  });

  const resetForm = () => {
    editingSkillId = null;
    repoIn.value = '';
    nameIn.value = '';
    cmdIn.value = '';
    whenIn.value = '';
    noteIn.value = '';
    nameTouched = false;
    cmdTouched = false;
    submitBtn.textContent = '+ 스킬 장착';
    cancelEditBtn.classList.add('hidden');
  };

  const listWrap = h('div');
  const presetWrap = h('div');
  const headCount = h('span', { class: 'tag' });
  const cancelEditBtn = h('button', { type: 'button', class: 'btn sm hidden', onclick: resetForm }, '편집 취소');

  const submitSkill = () => once('emp-skill-save', async () => {
    const rawRepo = repoIn.value.trim();
    const rawName = nameIn.value.trim();
    if (!rawRepo && !rawName) { repoIn.focus(); toast('GitHub 주소나 스킬 이름을 입력해 주세요'); return; }
    if (editingSkillId) {
      const r = await act('PATCH', `/api/ui/employees/${empId}/skills/${editingSkillId}`, {
        name: rawName,
        repo: rawRepo,
        command: cmdIn.value.trim(),
        when: whenIn.value.trim(),
        note: noteIn.value.trim(),
      }, '스킬을 수정했어요');
      if (r) { resetForm(); renderBody(); }
      return;
    }
    const isRepoLike = /^(https?:\/\/|github:|[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$)/i.test(rawRepo);
    const r = await act('POST', `/api/ui/employees/${empId}/skills`, {
      sourceInput: rawRepo,
      repo: isRepoLike ? rawRepo : '',
      name: rawName,
      command: cmdIn.value.trim(),
      when: whenIn.value.trim(),
      note: noteIn.value.trim(),
    }, '스킬을 장착했어요');
    if (r) { resetForm(); renderBody(); }
  });

  const submitBtn = h('button', { type: 'button', class: 'btn gold', onclick: submitSkill }, '+ 스킬 장착');
  repoIn.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && !ev.isComposing) submitSkill(); });
  whenIn.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && !ev.isComposing) submitSkill(); });

  const renderBody = () => {
    const e = emp(empId);
    if (!e) { closeDlg(); render(); return; }
    const skills = Array.isArray(e.skills) ? e.skills : [];
    headCount.textContent = `${skills.length}개 장착`;

    if (!skills.length) {
      listWrap.replaceChildren(h('div', { class: 'skill-empty' }, '아직 연결된 스킬이 없어요. 아래에 GitHub 주소를 붙여넣거나 추천 오픈소스를 1클릭으로 장착해 보세요.'));
    } else {
      listWrap.replaceChildren(h('div', { class: 'skill-list' }, skills.map((sk) => h('div', { class: 'skill-row' },
        h('div', { class: 'skill-row-main' },
          h('div', { class: 'skill-row-top' },
            h('b', null, sk.name),
            sk.repo ? h('a', { class: 'skill-repo-badge', href: sk.repo, target: '_blank', rel: 'noopener noreferrer', title: sk.repo }, `GitHub · ${githubShortLabel(sk.repo)} ↗`) : null,
            sk.command ? h('code', { class: 'skill-cmd' }, sk.command) : null),
          sk.when ? h('div', { class: 'skill-row-meta' }, `자동 배분 키워드: ${sk.when}`) : null,
          sk.note ? h('div', { class: 'skill-row-note' }, sk.note) : null),
        h('div', { class: 'skill-row-acts' },
          h('button', {
            type: 'button', class: 'btn sm',
            onclick: () => {
              editingSkillId = sk.id;
              repoIn.value = sk.repo || '';
              nameIn.value = sk.name || '';
              cmdIn.value = sk.command || '';
              whenIn.value = sk.when || '';
              noteIn.value = sk.note || '';
              nameTouched = Boolean(sk.name);
              cmdTouched = Boolean(sk.command);
              submitBtn.textContent = '스킬 수정 저장';
              cancelEditBtn.classList.remove('hidden');
              nameIn.focus();
            },
          }, '편집'),
          h('button', {
            type: 'button', class: 'btn sm',
            onclick: () => once(`del-sk-${sk.id}`, async () => {
              const r = await act('DELETE', `/api/ui/employees/${empId}/skills/${sk.id}`, undefined, `${sk.name} 스킬을 뺐어요`);
              if (r) { if (editingSkillId === sk.id) resetForm(); renderBody(); }
            }),
          }, '제거'))))));
    }

    const equippedKeys = new Set(skills.map((s) => (s.preset || '').toLowerCase()).filter(Boolean));
    const equippedRepos = new Set(skills.map((s) => (s.repo || '').toLowerCase()).filter(Boolean));
    const equippedNames = new Set(skills.map((s) => (s.name || '').toLowerCase()).filter(Boolean));
    const catalog = [...(S.options?.ossCatalog || [])].sort((a, b) => {
      const am = a.team === (e.team || 'ops') ? 1 : 0;
      const bm = b.team === (e.team || 'ops') ? 1 : 0;
      return bm - am;
    });
    const officeOss = (S.data.resources || []).filter((r) => r.kind === '오픈소스' && r.status !== '꺼짐'
      && !catalog.some((c) => c.key === r.preset || c.name.toLowerCase() === String(r.name || '').toLowerCase()));

    presetWrap.replaceChildren(
      h('div', { class: 'skill-preset-grid' }, catalog.map((c) => {
        const on = equippedKeys.has(c.key) || (c.repo && equippedRepos.has(c.repo.toLowerCase())) || equippedNames.has(c.name.toLowerCase());
        return h('button', {
          type: 'button',
          class: `skill-preset-btn${on ? ' on' : ''}`,
          onclick: () => once(`preset-sk-${c.key}`, async () => {
            const r = await act('POST', `/api/ui/employees/${empId}/skills`, { presetKey: c.key }, on ? `${c.name} 스킬을 최신으로 맞췄어요` : `${shortName(empId)}에게 ${c.name} 스킬을 장착했어요`);
            if (r) renderBody();
          }),
        },
        h('div', { class: 'skill-preset-top' },
          h('b', null, c.name),
          h('span', { class: `skill-preset-st${on ? ' on' : ''}` }, on ? '장착됨 ✓' : '+ 장착')),
        h('span', { class: 'skill-preset-hint' }, c.hint),
        c.repo ? h('span', { class: 'skill-preset-repo' }, githubShortLabel(c.repo)) : null);
      })),
      officeOss.length ? h('div', { class: 'skill-sec-sub' },
        h('div', { class: 'skill-sec-h' }, '내 사무실에 등록된 오픈소스 연결'),
        h('div', { class: 'picker' }, officeOss.map((r) => {
          const on = (r.repo && equippedRepos.has(r.repo.toLowerCase())) || equippedNames.has(String(r.name || '').toLowerCase());
          return h('button', {
            type: 'button',
            class: `chip sm${on ? ' on' : ''}`,
            onclick: () => once(`res-sk-${r.id}`, async () => {
              const out = await act('POST', `/api/ui/employees/${empId}/skills`, { resourceId: r.id }, `${r.name} 스킬을 연결했어요`);
              if (out) renderBody();
            }),
          }, `${on ? '✓ ' : '+ '}${r.name}`);
        }))) : null);
  };

  const e0 = emp(empId);
  const tInfo = e0 ? empTeamInfo(e0) : null;
  renderBody();
  const finish = () => { closeDlg(); render(); };

  setDlg(dlg,
    h('div', { class: 'row codex-top' },
      h('div', null,
        h('div', { class: 'swarm-kicker' }, 'CONNECT AI · EMPLOYEE SKILLS & GITHUB'),
        h('h3', { class: 'coord-dlg-h' }, `${shortName(empId)} · 스킬 & GitHub 오픈소스`,
          tInfo ? h('span', { class: `team-pill tm-${tInfo.key}` }, h('i'), tInfo.short) : null)),
      headCount),
    h('p', { class: 'small muted codex-desc' }, 'GitHub 오픈소스 주소(예: Remotion, Hyperframes 또는 직접 만든 커스텀 스킬 레포)를 연결하면 자동 배분과 실행 프롬프트에 바로 반영되고, 강의 청사진 공유에도 함께 담깁니다.'),
    h('div', { class: 'skill-sec-h' }, '장착된 스킬'),
    listWrap,
    h('div', { class: 'skill-form' },
      h('div', { class: 'skill-sec-h' }, 'GitHub 주소 · 커스텀 스킬 직접 연결'),
      h('label', { class: 'field' }, 'GitHub 주소 (또는 owner/repo · npx 명령)', repoIn),
      h('div', { class: 'grid2 coord-dlg-gap' },
        h('label', { class: 'field' }, '스킬 이름', nameIn),
        h('label', { class: 'field' }, '실행 명령 (선택)', cmdIn)),
      h('div', { class: 'grid2 coord-dlg-gap' },
        h('label', { class: 'field' }, '언제 쓸지 · 자동 배분 키워드 (쉼표 구분)', whenIn),
        h('label', { class: 'field' }, '사용 메모 (선택)', noteIn)),
      h('div', { class: 'skill-form-acts' }, cancelEditBtn, submitBtn)),
    h('div', { class: 'skill-sec-h coord-dlg-gap' }, '추천 오픈소스 스킬 (1클릭 장착)'),
    presetWrap,
    h('div', { class: 'bar' },
      h('button', { type: 'button', class: 'btn dark', onclick: finish }, '완료')));
  dlg.showModal();
  repoIn.focus();
}

function koSubject(word) {
  const s = String(word || '').trim();
  if (!s) return '';
  const ch = s.charCodeAt(s.length - 1);
  if (ch >= 0xac00 && ch <= 0xd7a3) return `${s}${(ch - 0xac00) % 28 === 0 ? '가' : '이'}`;
  return `${s}가`;
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
  const e = emp(id);
  if (!e) return '담당 미정';
  return e.avatarName && e.avatarName !== e.name ? `${e.avatarName} (${e.name})` : e.name;
}
function shortName(id) {
  if (id === 'jay') return '나';
  const e = emp(id);
  if (!e) return '미정';
  if (e.avatarName) return e.avatarName;
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
const SND = () => window.HQSound;
let liveCardSeq = 0;

function pushLiveCard({ kind = 'info', kicker = '', title = '', body = '', empId = null, taskId = null, actionLabel = '', sound = null, seal = false, duration = 4600 } = {}) {
  const dock = document.getElementById('live-dock');
  if (!dock) return;
  if (sound !== false) SND()?.play(sound || (kind === 'info' ? 'tick' : kind));
  const id = `lc-${++liveCardSeq}`;
  const kickerText = kicker || ({
    connect: 'CONNECT AI · 연결',
    done: 'CONNECT AI · 완료',
    handoff: 'CONNECT AI · 자동 인계',
    approve: 'CONNECT AI · 결재 印',
    alert: 'CONNECT AI · 확인 필요',
    info: 'CONNECT AI',
  }[kind] || 'CONNECT AI');
  const nowStr = `${pad(new Date().getHours())}:${pad(new Date().getMinutes())}`;
  const eObj = empId && S ? emp(empId) : null;
  const iconEl = eObj
    ? avatarEl(eObj, { size: 34, stateOverride: kind === 'connect' ? 'working' : 'idle' })
    : seal
      ? h('span', { class: 'live-seal', 'aria-hidden': 'true' }, '印')
      : h('span', { class: 'live-brand-dot', 'aria-hidden': 'true' }, h('i'), h('i'));

  let timer = null;
  const dismiss = () => {
    clearTimeout(timer);
    card.classList.add('hiding');
    setTimeout(() => card.remove(), 220);
  };
  const card = h('div', { class: `live-card k-${kind}`, 'data-id': id, role: 'status' },
    h('div', { class: 'live-card-in' },
      iconEl,
      h('div', { class: 'live-card-body' },
        h('div', { class: 'live-card-meta' }, h('span', { class: 'live-kicker' }, kickerText), h('span', { class: 'live-ts' }, nowStr)),
        h('div', { class: 'live-card-title' }, title),
        body ? h('div', { class: 'live-card-sub clamp2' }, body) : null,
        taskId ? h('button', { type: 'button', class: 'btn link live-card-act', onclick: () => { dismiss(); openTaskById(taskId); } }, actionLabel || '열기 →') : null),
      h('button', { type: 'button', class: 'live-x', 'aria-label': '알림 닫기', onclick: dismiss }, '×')),
    h('div', { class: 'live-prog' }, h('i')));

  card.addEventListener('mouseenter', () => { clearTimeout(timer); card.classList.add('paused'); });
  card.addEventListener('mouseleave', () => { card.classList.remove('paused'); timer = setTimeout(dismiss, 1800); });
  dock.prepend(card);
  while (dock.children.length > 4) dock.lastElementChild?.remove();
  requestAnimationFrame(() => card.classList.add('shown'));
  timer = setTimeout(dismiss, duration);
}

function toast(msg, opts = {}) {
  const txt = String(msg || '').trim();
  if (!txt) return;
  let kind = opts.kind || 'info';
  if (!opts.kind) {
    if (/승인|확인했어요/.test(txt)) kind = 'approve';
    else if (/완료|결과를 남겼/.test(txt)) kind = 'done';
    else if (/인계|우회|전환/.test(txt)) kind = 'handoff';
    else if (/시작했|켰어요|연결|맡겼/.test(txt)) kind = 'connect';
    else if (/실패|오류|필요해|중단|차단/.test(txt)) kind = 'alert';
  }
  pushLiveCard({
    kind,
    title: txt,
    body: opts.body || '',
    empId: opts.empId || null,
    taskId: opts.taskId || null,
    actionLabel: opts.actionLabel || '',
    sound: opts.sound !== undefined ? opts.sound : (kind === 'info' ? 'tick' : kind),
    seal: kind === 'approve',
    duration: opts.duration || (kind === 'alert' ? 5400 : 3800),
  });
}

function renderLiveWorker() {
  const box = document.getElementById('live-worker');
  if (!box || !S) return;
  const list = S.working || [];
  if (!list.length) { box.replaceChildren(); box.classList.remove('show'); return; }
  const w = list[0];
  const eObj = emp(w.emp);
  const tObj = w.taskId ? S.data.tasks.find((x) => x.id === w.taskId) : null;
  const more = list.length > 1 ? ` 외 ${list.length - 1}명` : '';
  const pill = h('button', {
    type: 'button', class: 'live-worker-pill',
    onclick: () => { if (w.taskId) openTaskById(w.taskId); else location.hash = '#dashboard'; },
  },
  eObj ? avatarEl(eObj, { size: 32, stateOverride: 'working' }) : h('span', { class: 'live-brand-dot' }, h('i'), h('i')),
  h('div', { class: 'live-worker-txt' },
    h('div', { class: 'live-worker-h' }, h('span', { class: 'live-pulse' }), h('b', null, `${shortName(w.emp)} 일하는 중${more}`)),
    h('div', { class: 'small muted clamp' }, w.statusLine || tObj?.title || w.label || '작업 실행 중')),
  h('span', { class: 'tag' }, '열기'));
  box.replaceChildren(pill);
  box.classList.add('show');
}

function detectLiveEvents(prev, next) {
  if (!prev || !next?.data) return;
  const prevWork = new Set((prev.working || []).map((w) => `${w.emp}:${w.taskId}`));
  for (const w of next.working || []) {
    if (!prevWork.has(`${w.emp}:${w.taskId}`)) {
      const t = next.data.tasks.find((x) => x.id === w.taskId);
      pushLiveCard({
        kind: 'connect',
        title: `${shortName(w.emp)} 작업 연결 · 시작`,
        body: t ? t.title : (w.label || '작업 시작'),
        empId: w.emp,
        taskId: w.taskId || null,
        actionLabel: '진행 보기 →',
        duration: 4200,
      });
    }
  }
  const prevTasks = new Map((prev.data?.tasks || []).map((t) => [t.id, t]));
  for (const t of next.data.tasks || []) {
    const old = prevTasks.get(t.id);
    if (!old) continue;
    const oldTrailLen = (old.failoverTrail || []).length;
    const newTrail = t.failoverTrail || [];
    if (newTrail.length > oldTrailLen) {
      const last = newTrail[newTrail.length - 1];
      pushLiveCard({
        kind: 'handoff',
        title: `자동 인계: ${last.fromName} → ${last.toName}`,
        body: `${t.title} (${last.reason})`,
        empId: last.to,
        taskId: t.id,
        actionLabel: '진행 보기 →',
        duration: 5400,
      });
    }
    if (old.status !== '완료' && t.status === '완료' && (t.completedBy || t.assignee) !== 'jay') {
      const byId = t.completedBy || t.assignee;
      pushLiveCard({
        kind: 'done',
        title: `${shortName(byId)} 작업 완료 · 결과물 도착`,
        body: t.resultSummary || t.title,
        empId: byId,
        taskId: t.id,
        actionLabel: '결과 보기 →',
        duration: 6000,
      });
    }
  }
  const prevApprs = new Set((prev.data?.approvals || []).map((a) => a.id));
  for (const a of next.data.approvals || []) {
    if (!prevApprs.has(a.id) && a.status === '대기') {
      pushLiveCard({
        kind: 'alert',
        title: `대표 결재 요청 (${a.kind})`,
        body: `${shortName(a.from)}: ${a.what}`,
        empId: a.from,
        taskId: a.taskId || null,
        actionLabel: '결재하기 →',
        seal: true,
        duration: 6500,
      });
    }
  }
}
const CLI_ENGINES = ['claude', 'codex', 'gemini', 'agy', 'opencode'];
const ENGINE_LABEL = { web: '복사해서 맡기기', none: '스스로 보고 (MCP, CLI)', local: '로컬 모델', claude: 'Claude Code', codex: 'Codex', gemini: 'Gemini CLI', agy: 'Antigravity (agy)', opencode: 'OpenCode' };
const RUN_LABEL = { off: '꺼짐', manual: '누를 때만', auto: '자동 실행' };
// 이 앱이 직접 일을 시킬 수 있는가 (로컬 모델, 또는 이 맥에 설치된 Claude Code, Codex, Gemini CLI, Antigravity, OpenCode)
function canRun(e) {
  if (!e || e.runMode === 'off') return false;
  if (e.engine === 'local') return Boolean(e.model);
  if (CLI_ENGINES.includes(e.engine)) return Boolean(S.runners[e.engine]);
  return false;
}
function accessChannelsOf(e) {
  const out = [];
  const d = S?.data;
  if (!d || !e) return out;
  const cuMac = d.resources.find((r) => r.kind === '기계' && r.status !== '꺼짐' && r.computerUse !== false);
  const defBr = d.resources.find((r) => r.kind === '브라우저' && r.status !== '꺼짐' && r.isDefault)
    || d.resources.find((r) => r.kind === '브라우저' && r.status !== '꺼짐');
  const phones = d.resources.filter((r) => r.kind === '스마트폰' && r.status !== '꺼짐');
  const isLocalExec = [...CLI_ENGINES, 'local'].includes(e.engine) || (e.group !== 'home-cloud' && /데스크탑|컴퓨터|로컬/.test(e.runsOn || ''));
  const canCu = Boolean(cuMac && (CLI_ENGINES.includes(e.engine) || /컴퓨터\s*유즈|자동화/.test(e.role || '')));
  const isMobileOnly = e.catalog === 'pickle' || /스마트폰/.test(e.role || '');

  if (isLocalExec) out.push('로컬 컴퓨터');
  if (canCu) out.push('화면 조작(CU)');
  if (defBr && e.engine !== 'local' && !isMobileOnly) out.push(`브라우저 · ${defBr.name}`);
  if (e.group === 'home-cloud' || e.engine === 'web') out.push(isMobileOnly ? '스마트폰 · 클라우드' : '클라우드 웹');
  for (const ph of phones) {
    const mode = ph.phoneMode || 'iphone-mirror';
    if (mode === 'mobile-ai' && (ph.assignee === e.id || isMobileOnly)) {
      out.push(`스마트폰 · ${ph.name}`);
    } else if ((mode === 'iphone-mirror' || mode === 'android-adb') && (ph.assignee === e.id || canCu)) {
      out.push(mode === 'iphone-mirror' ? `아이폰 미러링` : '안드로이드');
    }
  }
  return [...new Set(out)].slice(0, 4);
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
  const wSig = (st.working || []).map((w) => `${w.emp}:${w.taskId}:${w.statusLine || ''}`).join(',');
  const oSig = (st.offices || []).map((o) => `${o.id}:${o.state}:${o.log || ''}`).join(',');
  const uSig = Object.entries(st.employeeUsage || {}).map(([id, u]) => `${id}:${u.pct5h ?? ''}`).join(',');
  return `${st.rev || 0}|${wSig}|${(st.assigning || []).join(',')}|${oSig}|${mhSig}|${(st.ramHistory || []).length}|${st.health?.lastSyncAt || ''}|${st.health?.score ?? ''}|${uSig}|${st.runtime?.active ? 1 : 0}`;
}

async function load({ background = false } = {}) {
  const r = await fetch('/api/state', { credentials: 'same-origin' });
  const next = await r.json();
  const sig = stateSignature(next);
  const unchanged = background && S && sig === ui.lastSig;
  const prev = S;
  S = next;
  ui.lastSig = sig;
  if (prev && !unchanged) detectLiveEvents(prev, next);
  renderLiveWorker();
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
      const pending = list.filter((t) => !(t.mcp.configured && (!t.skill || t.skill.installed)));
      const oneLineCmd = c.terminal || 'npx github:wonseokjung/connect-ai-autonomous-company connect --yes';
      const rows = list.length ? list.map((t) => {
        const done = t.mcp.configured && (!t.skill || t.skill.installed);
        return h('div', { class: 'ob-conn' },
          h('div', { class: 'row' },
            h('div', null, h('b', null, t.name), h('div', { class: 'small muted' }, `직원 아이디 ${t.employee}${t.skill ? ' · MCP + 스킬' : ' · MCP'}`)),
            done ? h('span', { class: 'tag solid' }, '연결됨 ✓') : h('span', { class: 'tag' }, '연결 전')),
          !done ? h('details', { style: 'margin-top:6px' },
            h('summary', { class: 'small muted', style: 'cursor:pointer' }, '개별 수동 명령 보기'),
            h('div', { class: 'ob-cmds' },
              !t.mcp.configured ? (t.mcp.line ? copyBlock('터미널에 붙여넣기 · 출입증(MCP)', t.mcp.line) : copyBlock(`${t.mcp.file}에 합치기 · 출입증(MCP)`, t.mcp.snippet)) : null,
              t.skill && !t.skill.installed ? copyBlock('터미널에 붙여넣기 · 직원 수첩(스킬)', t.skill.line) : null)) : null);
      }) : [h('div', { class: 'empty' }, '이 컴퓨터에서 바이브코딩 툴(Claude Code · Codex · Antigravity · Cursor · OpenCode · Gemini CLI · Windsurf · Claude Desktop · LM Studio)을 찾지 못했어요. 웹 AI는 지시문 복사로 바로 쓸 수 있어요.')];
      setDlg(dlg,
        h('h3', null, 'AI 도구 연결 (MCP · 스킬)'),
        h('p', { class: 'small muted', style: 'margin:-6px 0 12px' }, '터미널에 아래 한 줄을 실행하면 감지된 바이브코딩 툴 전체에 안전하게(.bak 백업 후) 한 번에 연결됩니다.'),
        pending.length ? copyBlock(`터미널 한 줄로 감지된 ${pending.length}개 툴 한 번에 연결`, oneLineCmd) : null,
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
  const fSleep = h('input', { type: 'checkbox', checked: d.settings.preventSleep !== false });
  const fAutoAdd = h('input', { type: 'checkbox', checked: d.settings.autoStartAdded !== false });
  const fNotify = h('input', { type: 'checkbox', checked: d.settings.desktopNotify !== false });
  const fSound = h('input', { type: 'checkbox', checked: SND()?.enabled() !== false, onchange: (ev) => { SND()?.setEnabled(ev.target.checked); if (ev.target.checked) SND()?.play('connect', { force: true }); } });
  const memCount = Object.keys(d.settings.assignMemory || {}).length;
  const save = () => once('save-set', async () => {
    SND()?.setEnabled(fSound.checked);
    const patch = {
      ownerName: ownerName.value.trim() || undefined,
      companyName: companyName.value.trim(),
      autoOptimize: fOpt.checked,
      preventSleep: fSleep.checked,
      autoStartAdded: fAutoAdd.checked,
      desktopNotify: fNotify.checked,
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
      h('div', { class: 'small muted', style: 'margin-bottom:8px' }, '자동 실행 · 알림 · 사운드 · 런타임 안정화'),
      h('label', { class: 'chk-l' }, fAutoAdd, '자동 실행 AI 직원에게 할 일 추가(Add) 즉시 착수 (결제·발행·삭제 게이트는 승인 전 정지)'),
      h('label', { class: 'chk-l', style: 'margin-top:6px' }, fNotify, 'AI 작업 완료 · 결재 요청 시 맥 데스크탑 알림 받기 (자는 시간 제외)'),
      h('div', { class: 'row', style: 'margin-top:6px;justify-content:space-between;flex-wrap:wrap;gap:6px' },
        h('label', { class: 'chk-l' }, fSound, 'CONNECT AI 시그니처 효과음 (연결 · 완료 · 자동 인계 · 결재 印)'),
        h('div', { class: 'row', style: 'gap:4px' },
          h('button', { type: 'button', class: 'chip sm', onclick: () => { SND()?.play('connect', { force: true }); pushLiveCard({ kind: 'connect', title: '연결 · 착수 사운드', body: 'AI 직원이 일을 시작할 때 울립니다', sound: false }); } }, '연결음'),
          h('button', { type: 'button', class: 'chip sm', onclick: () => { SND()?.play('done', { force: true }); pushLiveCard({ kind: 'done', title: '완료 · 결과물 사운드', body: 'AI 직원이 일을 끝냈을 때 울립니다', sound: false }); } }, '완료음'),
          h('button', { type: 'button', class: 'chip sm', onclick: () => { SND()?.play('approve', { force: true }); pushLiveCard({ kind: 'approve', title: '결재 · 印 승인 사운드', body: '대표가 중요 작업을 승인할 때 울립니다', seal: true, sound: false }); } }, '결재음'))),
      h('label', { class: 'chk-l', style: 'margin-top:6px' }, fOpt, '토큰 한도 · 실패 시 대체 AI 자동 인계 · RAM 85% 초과 시 대체 컴퓨터 우회/대기열 보호'),
      h('label', { class: 'chk-l', style: 'margin-top:6px' }, fSleep, `작업 중 맥 잠자기 방지 (caffeinate · 먹통 감시 ${S.runtime?.hangWatchdogSec || 180}초)`)),
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

const NAV = [['home', '오늘 할 일'], ['dashboard', '대시보드'], ['daily', '자동 루틴'], ['staff', 'AI 직원'], ['resources', 'AI 사무실']];
function hiddenOn() { return (window.HIDDEN || []).filter((x) => features()[x.flag]); }

function pageFor(route) {
  if (!S.data.settings.onboarded) return pageStart;
  const base = { home: pageHome, dashboard: pageDashboard, pocket: pagePocket, daily: pageDaily, staff: pageStaff, resources: pageResources }[route];
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
  document.getElementById('brand-sub').textContent = d.settings.companyName || (d.owner.name ? `${d.owner.name} · 삶과 AI 일의 최적화` : '삶과 AI 일의 최적화');
  const mobSet = document.getElementById('mob-set');
  if (mobSet && !mobSet.dataset.bound) { mobSet.dataset.bound = '1'; mobSet.addEventListener('click', openSettingsModal); }
  const thisMacRes = d.resources.find((r) => r.kind === '기계' && r.isThisMac);
  const localH = thisMacRes ? S.machineHealth?.[thisMacRes.id] : null;
  const coolCnt = d.employees.filter(isEmpCooling).length;
  const queueCnt = d.tasks.filter((t) => t.queued && t.status !== '완료').length;
  const soundOn = SND()?.enabled() !== false;
  const footNodes = [
    h('div', null, `AI 직원 ${d.employees.length}명 · 자동 실행 ${d.employees.filter((e) => e.runMode === 'auto').length}명`),
    localH && typeof localH.ramPct === 'number'
      ? h('div', { class: 'side-health' }, `RAM ${localH.ramPct}% · `, h('b', null, healthLabel(localH.level)))
      : null,
    coolCnt || queueCnt
      ? h('div', { class: 'side-health' }, [coolCnt ? `토큰 휴식 ${coolCnt}명` : '', queueCnt ? `대기열 ${queueCnt}건` : ''].filter(Boolean).join(' · '))
      : h('div', null, `알람 ${d.settings.alarmsEnabled ? '켜짐' : '꺼짐'} · 최적화 ${d.settings.autoOptimize !== false ? '켜짐' : '꺼짐'}`),
    h('div', { class: 'row', style: 'margin-top:8px;gap:6px' },
      h('button', { type: 'button', class: `btn sm${ui.route === 'pocket' ? ' dark' : ''}`, onclick: () => { location.hash = '#pocket'; } }, '폰 뷰'),
      h('button', { type: 'button', class: 'btn sm', onclick: openSettingsModal }, '설정'),
      h('button', {
        type: 'button', class: `btn sm sound-btn${soundOn ? ' on' : ''}`,
        title: soundOn ? 'CONNECT AI 효과음 켜짐 (눌러서 끄기)' : '효과음 꺼짐 (눌러서 켜기)',
        'aria-label': soundOn ? '효과음 끄기' : '효과음 켜기',
        onclick: () => {
          const nextOn = !soundOn;
          SND()?.setEnabled(nextOn);
          if (nextOn) {
            SND()?.play('connect', { force: true });
            pushLiveCard({ kind: 'connect', title: 'CONNECT AI 효과음 켜짐', body: '연결 · 완료 · 자동 인계 · 결재 시 사운드가 울려요', sound: false, duration: 2800 });
          }
          renderNav();
        },
      }, soundOn ? '♪ ON' : '♪ OFF')),
    h('div', { class: 'brand-sign' }, 'CONNECT AI LAB · LIFE × AI OS'),
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

function isInstalledCli(e) {
  return Boolean(e && CLI_ENGINES.includes(e.engine) && S.runners?.[e.engine]);
}
function runnableCandidates(excludeId = null) {
  const list = (S?.data?.employees || []).filter((x) => x.id !== excludeId && (canRun(x) || isInstalledCli(x)));
  return list.sort((a, b) => Number(canRun(b)) - Number(canRun(a)));
}
function latestResultOf(t) {
  const msgs = (S?.data?.messages || []).filter((m) => m.thread === `task:${t.id}` && (m.kind === 'result' || m.fromKind === 'ai'));
  const last = msgs.filter((m) => m.kind === 'result').slice(-1)[0] || msgs.slice(-1)[0];
  if (last) return { text: last.text || '', by: last.from, at: last.at, run: last.run || null };
  if (t.resultSummary) return { text: t.resultSummary, by: t.completedBy || t.assignee, at: t.completedAt || t.lastRunAt, run: null };
  return null;
}

function taskRow(t, { draggable = true, overdue = false } = {}) {
  const open = ui.open === t.id;
  const done = t.status === '완료';
  // 확인 버튼은 AI가 할 일에만 (내가 직접 하는 일은 내가 하는 것이 곧 확인)
  const gated = t.gate && !t.gateApprovedAt && !done && t.assignee !== 'jay';
  const pendAppr = S.data.approvals.some((a) => a.taskId === t.id && a.status === '대기');
  const e = emp(t.assignee);
  const workJob = S.working.find((w) => w.taskId === t.id) || (t.status === '진행' ? S.working.find((w) => w.emp === t.assignee) : null);
  const thinking = S.assigning.includes(`task:${t.id}`);
  const trail = t.failoverTrail || [];
  const li = h('li', { class: `task${done ? ' done' : ''}${open ? ' open' : ''}`, 'data-id': t.id });

  const chk = h('input', { type: 'checkbox', class: 'chk', checked: done, 'aria-label': `${t.title} 완료`,
    onchange: () => act('PATCH', `/api/ui/tasks/${t.id}`, { status: chk.checked ? '완료' : '대기' }, chk.checked ? '완료했어요 · 오늘 한 일로 옮겼어요' : '오늘 할 일로 되돌렸어요') });
  const who = h('button', {
    class: `who-chip${t.assignee === 'jay' ? '' : t.assignee ? ' ai' : ' none'}`, 'aria-label': '담당 바꾸기', 'aria-expanded': ui.picking === t.id ? 'true' : 'false',
    onclick: (ev) => { ev.stopPropagation(); ui.picking = ui.picking === t.id ? null : t.id; render(); },
  }, t.assignee ? shortName(t.assignee) : '담당 미정');
  const msgs = S.data.messages.filter((m) => m.thread === `task:${t.id}` && m.fromKind !== 'system').length;
  const stLen = (t.steps || []).length;
  const stDone = stLen ? t.steps.filter((s) => s.status === '완료').length : 0;
  const nowHm = `${pad(new Date().getHours())}:${pad(new Date().getMinutes())}`;
  const isFutureScheduled = Boolean(!done && t.date === S.today && t.time && t.time > nowHm && e && e.runMode === 'auto');
  const quickRun = (!done && !gated && e && !t.officeRun && !workJob)
    ? (isFutureScheduled
      ? h('span', { class: 'tag', title: `${t.time}이 되면 ${shortName(e.id)}이(가) 자동으로 시작합니다` }, `예약 ${t.time}`)
      : canRun(e)
        ? h('button', {
          type: 'button', class: 'btn sm dark', title: `${shortName(e.id)} 지금 바로 실행`,
          onclick: (ev) => {
            ev.stopPropagation();
            once(`qrun-${t.id}`, async () => {
              const r = await act('POST', `/api/ui/tasks/${t.id}/run`, {});
              if (r?.queued) toast(`⏳ 대기열: ${r.reason || '여유 생기면 자동 시작해요'}`);
              else if (r) toast(`${shortName(r.empId || e.id)}이(가) 작업을 시작했어요`);
            });
          },
        }, t.status === '막힘' ? '재시도' : '실행')
        : (e.engine === 'web' ? h('span', { class: 'tag dash', title: '웹 전용 AI — 눌러서 설치된 AI로 바로 실행하거나 지시문 복사' }, '웹 복사') : null))
    : null;
  const right = h('div', { class: 'right' },
    overdue && !done ? h('button', { class: 'btn sm', title: '오늘 할 일로 옮기기', onclick: (ev) => { ev.stopPropagation(); act('PATCH', `/api/ui/tasks/${t.id}`, { date: S.today }, '오늘로 옮겼어요'); } }, '오늘로') : null,
    pendAppr ? h('span', { class: 'tag solid', title: '대표 결재 대기 중' }, '결재 대기') : null,
    gated ? h('button', { class: 'btn sm dark', onclick: (ev) => { ev.stopPropagation(); if (confirm(`"${t.title}" 에 ${gateK(t.gate)} 들어 있습니다. AI가 진행해도 될까요?`)) act('POST', `/api/ui/tasks/${t.id}/approve-gate`, {}, `${gateO(t.gate)} 확인했어요`); } }, `${t.gate} 확인`) : null,
    stLen ? h('span', { class: 'tag', title: '팀 협업 워크플로우' }, `${t.stepMode === 'parallel' ? '동시' : '협업'} ${stDone}/${stLen}`) : null,
    trail.length ? h('span', { class: 'tag', title: trail.map((x) => `${x.fromName} → ${x.toName} (${x.reason})`).join(' / ') }, `인계 ${trail.length}`) : null,
    t.queued && !done ? h('span', { class: 'tag dash', title: t.queueReason || '여유 생기면 자동 시작' }, '대기열') : null,
    workJob || t.status === '진행' || t.status === '막힘'
      ? h('span', { class: `stat-pill ${workJob ? '진행' : t.status}` }, officeOf(t) && t.status === '진행' ? `${officeOf(t).name}에서 실행 중` : workJob ? '● 일하는 중' : t.status === '막힘' ? '실패 · 막힘' : t.status)
      : null,
    quickRun,
    msgs ? h('span', { class: 'small muted', title: '스레드 메시지' }, `대화 ${msgs}`) : null,
    who);
  const meta = [];
  if (workJob?.statusLine) meta.push(`진행: ${workJob.statusLine}`);
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
  const workJob = S.working.find((w) => w.taskId === t.id) || (t.status === '진행' ? S.working.find((w) => w.emp === t.assignee) : null);
  const latestRes = latestResultOf(t);
  const trail = t.failoverTrail || [];
  const topStatusBox = workJob
    ? h('div', { class: 'res-card live' },
      h('div', { class: 'row', style: 'justify-content:space-between' },
        h('div', { class: 'row' },
          emp(workJob.emp) ? avatarEl(emp(workJob.emp), { size: 28, stateOverride: 'working' }) : null,
          h('b', null, `${shortName(workJob.emp)} 지금 실행 중`),
          h('span', { class: 'tag solid' }, workJob.label || '실행 중')),
        h('span', { class: 'small muted' }, stamp(workJob.since))),
      h('div', { class: 'small muted', style: 'margin-top:6px' }, workJob.statusLine || '작업을 처리하고 있어요… (끝나면 아래 오늘 한 일에 결과물이 올라옵니다)'))
    : latestRes
      ? h('div', { class: 'res-card' },
        h('div', { class: 'row', style: 'justify-content:space-between;flex-wrap:wrap;gap:6px' },
          h('div', { class: 'row', style: 'gap:8px' },
            emp(latestRes.by) ? avatarEl(emp(latestRes.by), { size: 26 }) : null,
            h('b', null, t.status === '완료' ? '완료 결과물' : '최근 실행 결과'),
            h('span', { class: 'small muted' }, `${latestRes.by === 'jay' ? '나' : shortName(latestRes.by)}${latestRes.at ? ` · ${stamp(latestRes.at)}` : ''}`),
            trail.length ? h('span', { class: 'tag' }, `⚡ 자동 인계: ${trail.map((x) => x.fromName).join(' → ')} → ${trail[trail.length - 1].toName}`) : null),
          h('button', { type: 'button', class: 'btn sm', onclick: async () => { await copyText(latestRes.text); toast('결과물을 복사했어요'); } }, '결과 복사')),
        h('pre', { class: 'res-pre' }, latestRes.text))
      : null;

  return h('div', { class: 'detail' },
    topStatusBox,
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
        !t.routineId ? h('button', { class: 'btn sm', onclick: () => once(`tor-${t.id}`, async () => { await flushIfDirty(); await act('POST', `/api/ui/tasks/${t.id}/to-routine`, {}, '자동 루틴에 넣었어요'); }) }, '자동 루틴으로') : null,
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

// AI에게 일 시키기. 앱이 직접 실행할 수 있으면 1클릭 실행, 설치된 CLI 가 꺼져 있거나 웹 전용 AI 면 1클릭 전환·바로 실행 제공
function workBox(t, e, flushIfDirty = null) {
  if (t.status === '완료' && !ui.handout[t.id]) return null;
  const locked = t.gate && !t.gateApprovedAt;
  const retryBtn = (t.status === '막힘' || t.queued) ? h('button', { class: 'btn sm', onclick: () => once(`retry-${t.id}`, () => act('POST', `/api/ui/tasks/${t.id}/retry`, {}, '대기 상태로 초기화했어요')) }, t.queued ? '대기열 해제' : '다시 시도') : null;
  const runNow = (payload = {}, msgFn = null) => once(`run-${t.id}-${payload.switchTo || 'cur'}`, async () => {
    if (flushIfDirty) await flushIfDirty();
    const resRun = await act('POST', `/api/ui/tasks/${t.id}/run`, payload);
    if (resRun?.queued) toast(`⏳ 대기열: ${resRun.reason || '여유 생기면 자동 시작해요'}`);
    else if (resRun?.rerouted) toast(`⚡ ${resRun.reason || `${resRun.office}로 우회했어요`}`);
    else if (resRun) toast(msgFn ? msgFn(resRun) : `${shortName(resRun.empId || e.id)}이(가) 작업을 시작했어요`);
  });

  const altRunners = runnableCandidates(e.id).slice(0, 3);
  if (canRun(e)) {
    const local = e.engine === 'local';
    return h('div', { class: 'work' },
      h('div', { class: 'small' }, local ? `${shortName(e.id)}: 이 컴퓨터 안에서 바로 답해요.` : `${shortName(e.id)}: 이 컴퓨터에서 직접 실행하고 결과물을 아래 「오늘 한 일」에 남깁니다 (실패 시 다른 AI에게 자동 인계).`),
      t.queued && t.queueReason ? h('div', { class: 'small muted' }, `⏳ 대기열: ${t.queueReason}`) : null,
      locked ? h('div', { class: 'small muted' }, `${gateK(t.gate)} 들어간 일이라 대표 확인 뒤에 시킬 수 있어요.`) : null,
      h('div', { class: 'row', style: 'flex-wrap:wrap' },
        h('button', { class: 'btn dark', 'data-act': 'run', disabled: isWorking(e.id) || locked,
          onclick: () => runNow({}, (r) => (local ? `${josa(shortName(e.id), '이', '가')} 쓰는 중이에요` : `${shortName(r.empId || e.id)}이(가) 작업을 시작했어요`)) },
        isWorking(e.id) ? (local ? '쓰는 중 · 보통 10~50초' : '● 일하는 중') : local ? '지금 답 받기' : `${shortName(e.id)} 바로 실행`),
        t.status === '막힘' && altRunners.length
          ? altRunners.slice(0, 2).map((cand) => h('button', {
            type: 'button', class: 'btn sm', disabled: locked,
            onclick: () => runNow({ switchTo: cand.id, enableAuto: true }, () => `${shortName(cand.id)}에게 넘겨서 바로 실행했어요`),
          }, `${shortName(cand.id)}에게 넘겨 실행`))
          : null,
        retryBtn));
  }

  // 이 컴퓨터에 CLI 가 설치되어 있지만 실행 모드가 '꺼짐(off)' 인 경우: 1클릭 자동 실행 켜고 바로 실행!
  if (isInstalledCli(e) && e.runMode === 'off') {
    return h('div', { class: 'work' },
      h('div', { class: 'small' }, h('b', null, `${shortName(e.id)}은 이 컴퓨터에 설치되어 있어요`), ' · 실행 모드가 꺼져 있어 대기 중입니다. 아래 버튼 한 번으로 자동 실행을 켜고 바로 시작할 수 있어요.'),
      locked ? h('div', { class: 'small muted' }, `${gateK(t.gate)} 들어간 일이라 대표 확인 뒤에 시킬 수 있어요.`) : null,
      h('div', { class: 'row', style: 'flex-wrap:wrap' },
        h('button', { type: 'button', class: 'btn dark', disabled: locked, onclick: () => runNow({ enableAuto: true }, () => `${shortName(e.id)} 자동 실행을 켜고 바로 시작했어요`) }, '자동 실행 켜고 지금 바로 실행'),
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
  const directHandoff = altRunners.length
    ? h('div', { class: 'handoff-run-box' },
      h('div', { class: 'small' }, h('b', null, `${shortName(e.id)}은 웹 전용이라 앱에서 직접 실행 못해요`), ' · 이 컴퓨터에 설치된 AI에게 넘겨 바로 실행할 수 있어요:'),
      h('div', { class: 'row', style: 'flex-wrap:wrap;margin-top:6px' },
        altRunners.map((cand) => h('button', {
          type: 'button', class: 'btn sm dark', disabled: locked,
          onclick: () => runNow({ switchTo: cand.id, enableAuto: true }, () => `${shortName(cand.id)}에게 넘겨 바로 작업을 시작했어요`),
        }, `${shortName(cand.id)}로 바로 실행`))))
    : null;
  return h('div', { class: 'work' },
    directHandoff,
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
  const autoBtn = h('button', { type: 'button', class: `chip sm gold-auto${cur() === 'auto' ? ' on' : ''}`, 'aria-pressed': cur() === 'auto' ? 'true' : 'false' }, '✦ 자동 배분');
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
      autoBtn.textContent = '✦ 자동 배분';
      sugBox.classList.remove('show');
      sugBox.replaceChildren();
      return;
    }
    if (!lastSug) {
      if (pick !== 'jay' && pick !== 'auto') {
        sugBox.replaceChildren(h('b', null, shortName(pick)), ' 직접 지정 · 메인 컴퓨터 기준으로 자동 최적화합니다');
        sugBox.classList.add('show');
      } else {
        sugBox.classList.remove('show');
        sugBox.replaceChildren();
      }
      return;
    }
    const sugWho = lastSug.assignee ? shortName(lastSug.assignee) : '미정';
    autoBtn.textContent = pick === 'auto' && q ? `✦ 자동 배분 → ${sugWho}` : '✦ 자동 배분';
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

function parseSmartTime(raw, { allowBareDigits = false } = {}) {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (/^(지금|바로|즉시)$/.test(s)) return '';
  const mRel = /(?:(\d{1,2})\s*시간(?:\s*(\d{1,2})\s*분|\s*(반))?|(\d{1,3})\s*분)\s*(?:뒤|후)(?:에)?/.exec(s);
  if (mRel) {
    const addH = mRel[1] ? Number(mRel[1]) : 0;
    const addM = mRel[3] ? 30 : mRel[2] ? Number(mRel[2]) : mRel[4] ? Number(mRel[4]) : 0;
    const tot = addH * 60 + addM;
    if (tot >= 1 && tot <= 720) {
      const d = new Date(Date.now() + tot * 60000);
      return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
  }
  const adj = (mer, h) => {
    if (['오후', '저녁', '밤'].includes(mer) && h >= 1 && h <= 11) return h + 12;
    if (mer === '낮' && h >= 1 && h <= 6) return h + 12;
    if (['오전', '새벽'].includes(mer) && h === 12) return 0;
    return h;
  };
  const m0 = /(오전|오후|아침|점심|낮|저녁|밤|새벽)\s*(\d{1,2}):([0-5]\d)(?!\d)/.exec(s);
  if (m0) { const h = adj(m0[1], Number(m0[2])); if (h <= 23) return `${pad(h)}:${m0[3]}`; }
  const m1 = /(오전|오후|아침|점심|낮|저녁|밤|새벽)\s*(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분|\s*(반))?/.exec(s);
  if (m1) {
    const h = adj(m1[1], Number(m1[2]));
    const mi = m1[4] ? 30 : m1[3] ? Number(m1[3]) : 0;
    if (h <= 23 && mi <= 59) return `${pad(h)}:${pad(mi)}`;
  }
  const m2 = /(?<!\d)(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분(?!마다)|\s*(반))/.exec(s);
  if (m2) {
    let h = Number(m2[1]);
    const mi = m2[3] ? 30 : Number(m2[2]);
    if (h <= 23 && mi <= 59) { if (h >= 1 && h <= 6) h += 12; return `${pad(h)}:${pad(mi)}`; }
  }
  const m3 = /(?<!\d)([01]?\d|2[0-3]):([0-5]\d)(?!\d)/.exec(s);
  if (m3) return `${pad(Number(m3[1]))}:${m3[2]}`;
  if (allowBareDigits) {
    // 4자리(1830), 3자리(630 → 18:30), 1~2자리(18 → 18:00)
    const d4 = /^(\d{2})(\d{2})$/.exec(s);
    if (d4 && Number(d4[1]) <= 23 && Number(d4[2]) <= 59) return `${d4[1]}:${d4[2]}`;
    const d3 = /^(\d)(\d{2})$/.exec(s);
    if (d3 && Number(d3[2]) <= 59) { let h = Number(d3[1]); if (h >= 1 && h <= 6) h += 12; return `${pad(h)}:${d3[2]}`; }
    const d2 = /^(\d{1,2})$/.exec(s);
    if (d2 && Number(d2[1]) <= 23) { let h = Number(d2[1]); if (h >= 1 && h <= 6) h += 12; return `${pad(h)}:00`; }
  }
  return null;
}

function fmtKoTime(hhmm) {
  if (!hhmm) return '지금 바로';
  const [hStr, mStr] = hhmm.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  const mer = h < 12 ? '오전' : '오후';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${mer} ${h12}시` : `${mer} ${h12}:${pad(m)}`;
}

function addMinutesHm(mins) {
  const d = new Date(Date.now() + mins * 60000);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function addBar() {
  const title = h('input', { class: 'in big', placeholder: '할 일을 적어 주세요 (예: 10분 뒤 이메일 체크 · 오후 6시 반 보고서)', 'data-k': 'add-title', 'aria-label': '새 할 일' });
  const timeVal = h('input', { type: 'hidden', value: ui.addTime || '', 'data-k': 'add-time' });
  let manualTime = Boolean(ui.addTimeManual);
  const pop = h('div', { class: 'time-pop', role: 'dialog', 'aria-label': '시간 선택' });
  const lblEl = h('span', { class: 'time-btn-lbl' });
  const clearBtn = h('span', {
    class: 'time-x', role: 'button', tabindex: '0', title: '지금 바로로 되돌리기', 'aria-label': '시간 지우기',
    onclick: (ev) => { ev.stopPropagation(); setTime('', false); closePop(); },
  }, '×');
  const timeBtn = h('button', {
    type: 'button', class: 'time-btn', 'aria-haspopup': 'dialog', 'aria-expanded': 'false',
    onclick: (ev) => { ev.stopPropagation(); togglePop(); },
  }, h('span', { class: 'time-ic', 'aria-hidden': 'true' }, '◷'), lblEl, clearBtn);

  const syncBtn = () => {
    const v = timeVal.value;
    lblEl.textContent = fmtKoTime(v);
    timeBtn.classList.toggle('has', Boolean(v));
    clearBtn.style.display = v ? 'inline-grid' : 'none';
  };
  const setTime = (v, isManual = true) => {
    timeVal.value = v || '';
    ui.addTime = timeVal.value;
    manualTime = Boolean(v && isManual);
    ui.addTimeManual = manualTime;
    syncBtn();
  };
  syncBtn();

  const quickIn = h('input', { class: 'in sm', placeholder: '직접 입력 (예: 1830, 오후 6:30, 15분 뒤)', 'aria-label': '시간 직접 입력' });
  const applyQuick = () => {
    const parsed = parseSmartTime(quickIn.value, { allowBareDigits: true });
    if (parsed === null) { quickIn.focus(); toast('예: 1830, 오후 6:30, 15분 뒤 형식으로 적어 주세요'); return; }
    setTime(parsed, Boolean(parsed));
    quickIn.value = '';
    closePop();
  };
  quickIn.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && !ev.isComposing) { ev.preventDefault(); applyQuick(); }
    if (ev.key === 'Escape') closePop();
  });

  const buildPop = () => {
    const rels = [[0, '지금 바로'], [5, '+5분'], [10, '+10분'], [30, '+30분'], [60, '+1시간']];
    const presets = [['09:00', '오전 9시'], ['10:00', '오전 10시'], ['14:00', '오후 2시'], ['18:00', '오후 6시'], ['20:00', '저녁 8시'], ['22:00', '밤 10시']];
    pop.replaceChildren(
      h('div', { class: 'time-pop-sec' },
        h('div', { class: 'small muted', style: 'margin-bottom:6px' }, '빠른 예약 (지금 기준)'),
        h('div', { class: 'picker' }, rels.map(([m, label]) => h('button', {
          type: 'button', class: `chip sm${(m === 0 && !timeVal.value) ? ' on' : ''}`,
          onclick: () => { setTime(m === 0 ? '' : addMinutesHm(m), m > 0); closePop(); },
        }, label)))),
      h('div', { class: 'time-pop-sec' },
        h('div', { class: 'small muted', style: 'margin-bottom:6px' }, '자주 쓰는 시각'),
        h('div', { class: 'picker' }, presets.map(([hhmm, label]) => h('button', {
          type: 'button', class: `chip sm${timeVal.value === hhmm ? ' on' : ''}`,
          onclick: () => { setTime(hhmm, true); closePop(); },
        }, label)))),
      h('div', { class: 'time-pop-sec' },
        h('div', { class: 'row', style: 'gap:6px' },
          quickIn,
          h('button', { type: 'button', class: 'btn sm dark', onclick: applyQuick }, '적용'))));
  };

  let onDocClick = null;
  const closePop = () => {
    pop.classList.remove('open');
    timeBtn.setAttribute('aria-expanded', 'false');
    if (onDocClick) { document.removeEventListener('click', onDocClick); onDocClick = null; }
  };
  const togglePop = () => {
    if (pop.classList.contains('open')) { closePop(); return; }
    buildPop();
    pop.classList.add('open');
    timeBtn.setAttribute('aria-expanded', 'true');
    quickIn.value = '';
    setTimeout(() => quickIn.focus(), 20);
    onDocClick = (ev) => { if (!timeWrap.contains(ev.target)) closePop(); };
    setTimeout(() => document.addEventListener('click', onDocClick), 0);
  };

  const timeWrap = h('div', { class: 'time-wrap' }, timeVal, timeBtn, pop);

  // 제목에 "10분 뒤", "오후 6:30", "저녁 8시" 를 적으면 실시간으로 시간 버튼이 자동 채워짐!
  title.addEventListener('input', () => {
    if (manualTime) return;
    const detected = parseSmartTime(title.value, { allowBareDigits: false });
    if (detected !== null) {
      timeVal.value = detected;
      ui.addTime = detected;
      syncBtn();
    } else if (timeVal.value) {
      timeVal.value = '';
      ui.addTime = '';
      syncBtn();
    }
  });

  const whoBar = createWhoBar(title, 'taskPick');
  const runDelegate = async () => {
    closePop();
    const tm = timeVal.value;
    const r = await submitInput(title, 'delegate-task', (v) => {
      setTime('', false);
      return act('POST', '/api/ui/coordinator/delegate', { title: v, time: tm, date: S.today });
    });
    if (r) {
      whoBar.resetSuggest();
      const multi = Array.isArray(r.steps) && r.steps.length >= 2;
      const host = r.mainMachineName ? ` · ${r.mainMachineName}` : '';
      const aiLabel = r.mainAiId ? shortName(r.mainAiId) : (r.mainAiName || '메인 AI');
      pushLiveCard({
        kind: r.gate ? 'approve' : 'connect',
        kicker: `CONNECT AI · ${multi ? '멀티 팀 자동 배분' : '자동 배분'}`,
        title: multi ? `${koSubject(aiLabel)} ${r.steps.length}단계로 팀에 배분했어요` : `${aiLabel} → ${shortName(r.assignee)} 배정 완료`,
        body: `${r.stepSummary || shortName(r.assignee)}${host}${r.autoStarted ? ' · 즉시 착수' : r.gate ? ` · ${r.gate} 승인 대기` : ''}`,
        empId: r.assignee !== 'jay' ? r.assignee : null,
        taskId: r.id,
        actionLabel: '배분 내역 보기 →',
      });
      if (multi) { ui.open = r.id; render(); }
      document.querySelector('[data-k="add-title"]')?.focus();
    }
  };
  const add = async () => {
    closePop();
    const tm = timeVal.value;
    const picked = ui.taskPick || 'jay';
    if (picked === 'auto') { await runDelegate(); return; }
    const r = await submitInput(title, 'add-task', (v) => {
      setTime('', false);
      return act('POST', '/api/ui/tasks', { title: v, time: tm, date: S.today, assignee: picked });
    });
    if (r) {
      whoBar.resetSuggest();
      const comp = r.resource && res(r.resource) ? ` · ${res(r.resource).name}` : '';
      const msg = r.autoStarted
        ? `${shortName(r.assignee)}에게 맡기고 바로 작업을 시작했어요${comp}`
        : r.autoQueued
          ? `${shortName(r.assignee)} 대기열에 올렸어요 (여유 생기면 자동 착수)`
          : r.gate
            ? `${shortName(r.assignee)} · ${r.gate} 확인이 필요해 승인 대기 중이에요`
            : r.time
              ? `${shortName(r.assignee)} · ${fmtKoTime(r.time)} 예약했어요${comp}`
              : `${shortName(r.assignee)}에게 맡겼어요${comp}`;
      toast(msg);
      document.querySelector('[data-k="add-title"]')?.focus();
    }
  };
  title.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) add(); });
  return h('div', null,
    h('div', { class: 'addbar with-delegate' },
      title, timeWrap,
      h('button', { class: `mic-sm${ui.listening ? ' on' : ''}`, 'aria-label': ui.listening ? '듣기 멈추기' : '말로 적기', 'aria-pressed': ui.listening ? 'true' : 'false', title: '말로 적기', onclick: () => toggleMic(title) }, MIC_SVG()),
      h('button', { type: 'button', class: 'btn gold big', title: '메인 AI가 알맞은 팀·직원과 메인 컴퓨터에 자동 분할·배분합니다', onclick: runDelegate }, '✦ 자동 배분'),
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

// 오늘 할 일(진행·대기·막힘) + 오늘 한 일(완료 & 결과물) 2단 분리
function doneCard(t) {
  const open = ui.open === t.id;
  const byId = t.completedBy || t.assignee || 'jay';
  const isAi = byId !== 'jay' && Boolean(emp(byId));
  const actorEmp = isAi ? emp(byId) : null;
  const resObj = latestResultOf(t);
  const trail = t.failoverTrail || [];
  const doneTime = t.completedAt ? stamp(t.completedAt) : (t.lastRunAt ? stamp(t.lastRunAt) : (t.time || ''));
  const chk = h('input', {
    type: 'checkbox', class: 'chk', checked: true, 'aria-label': `${t.title} 완료 해제`,
    onclick: (ev) => ev.stopPropagation(),
    onchange: () => act('PATCH', `/api/ui/tasks/${t.id}`, { status: '대기' }, '오늘 할 일로 되돌렸어요'),
  });
  const toggleOpen = () => { ui.open = open ? null : t.id; ui.picking = null; render(); };
  return h('li', { class: `done-card${open ? ' open' : ''}`, 'data-id': t.id },
    h('div', {
      class: 'done-card-top', tabindex: '0', role: 'button', 'aria-expanded': open ? 'true' : 'false',
      onclick: (ev) => { if (ev.target.closest('button,input,a')) return; toggleOpen(); },
      onkeydown: (ev) => { if (ev.target !== ev.currentTarget) return; if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggleOpen(); } },
    },
    chk,
    actorEmp ? avatarEl(actorEmp, { size: 28 }) : h('span', { class: 'done-human-badge' }, '나'),
    h('div', { class: 'done-card-main' },
      h('div', { class: 'done-card-title' },
        h('b', null, t.title),
        doneTime ? h('span', { class: 'small muted' }, `${doneTime} 완료`) : null,
        h('span', { class: `tag${isAi ? ' solid' : ''}` }, isAi ? `${shortName(byId)} 완료` : '대표 완료'),
        trail.length ? h('span', { class: 'tag', title: trail.map((x) => `${x.fromName} → ${x.toName} (${x.reason})`).join(' / ') }, `⚡ 인계: ${trail[0].fromName} → ${trail[trail.length - 1].toName}`) : null),
      resObj
        ? h('div', { class: 'done-res clamp2' }, resObj.text)
        : h('div', { class: 'small muted' }, isAi ? '완료 보고됨 (눌러서 상세 보기)' : (t.note ? t.note : '대표가 직접 완료 체크함'))),
    h('button', { type: 'button', class: 'btn sm', onclick: (ev) => { ev.stopPropagation(); toggleOpen(); } }, open ? '접기' : (resObj ? '결과 보기' : '열기'))),
    open ? taskDetail(t, emp(t.assignee)) : null);
}

function todayOpenSection(today) {
  const f = ui.homeFilter || 'all';
  const openAll = today.filter((t) => t.status !== '완료');
  const mineCount = openAll.filter((t) => t.assignee === 'jay').length;
  const aiCount = openAll.filter((t) => t.assignee !== 'jay').length;
  const gateCount = openAll.filter((t) => (t.gate && !t.gateApprovedAt) || S.data.approvals.some((a) => a.status === '대기' && a.taskId === t.id)).length;
  const filterTabs = [
    ['all', `전체 (${openAll.length})`],
    ['me', `나 (${mineCount})`],
    ['ai', `AI (${aiCount})`],
    ...(gateCount || f === 'gate' ? [['gate', `확인 대기 (${gateCount})`]] : []),
  ];
  const filterBar = h('div', { class: 'filter-bar', role: 'group', 'aria-label': '오늘 할 일 보기' },
    filterTabs.map(([k, label]) => h('button', {
      type: 'button', class: `chip sm${f === k ? ' on' : ''}`, 'aria-pressed': f === k ? 'true' : 'false',
      onclick: () => { ui.homeFilter = k; render(); },
    }, label)));

  const open = openAll.filter((t) => {
    if (f === 'me') return t.assignee === 'jay';
    if (f === 'ai') return t.assignee !== 'jay';
    if (f === 'gate') return (t.gate && !t.gateApprovedAt) || S.data.approvals.some((a) => a.status === '대기' && a.taskId === t.id);
    return true;
  });

  if (open.length <= 30) {
    return h('div', null, filterBar, open.length ? taskList(open, { draggable: f === 'all' }) : h('div', { class: 'empty' }, f === 'all' ? '남은 할 일이 없습니다. 아래 「오늘 한 일」에서 완료 결과물을 확인하세요.' : '해당하는 할 일이 없습니다.'));
  }
  const order = ['jay', ...S.data.employees.map((e) => e.id), null];
  const keyOf = (t) => (t.assignee === 'jay' || emp(t.assignee) ? t.assignee : null);
  const groups = order.map((id) => [id, open.filter((t) => keyOf(t) === id)]).filter(([, l]) => l.length);
  return h('div', null,
    filterBar,
    groups.map(([id, list]) => h('div', { class: 'grp-list' }, h('div', { class: 'grp-name' }, `${id === 'jay' ? '나' : id ? shortName(id) : '담당 미정'} · ${list.length}`), taskList(list))));
}

function todayDoneSection(today) {
  const doneAll = today
    .filter((t) => t.status === '완료')
    .sort((a, b) => String(b.completedAt || b.lastRunAt || '').localeCompare(String(a.completedAt || a.lastRunAt || '')));
  const aiDone = doneAll.filter((t) => (t.completedBy || t.assignee) !== 'jay');
  const humanDone = doneAll.filter((t) => (t.completedBy || t.assignee) === 'jay');
  const df = ui.doneFilter || 'all';
  const shown = df === 'ai' ? aiDone : df === 'me' ? humanDone : doneAll;
  const tabs = [
    ['all', `전체 (${doneAll.length})`],
    ['ai', `AI가 한 일 (${aiDone.length})`],
    ['me', `내가 한 일 (${humanDone.length})`],
  ];
  return h('section', { class: 'sec done-sec', 'data-k': 'today-done-sec' },
    secHead('오늘 한 일 · 완료 & 결과물', doneAll.length ? `AI ${aiDone.length}건 · 나 ${humanDone.length}건` : '완료된 일과 AI 결과물이 여기에 쌓입니다'),
    h('div', { class: 'filter-bar', role: 'group', 'aria-label': '오늘 한 일 분류' },
      tabs.map(([k, label]) => h('button', {
        type: 'button', class: `chip sm${df === k ? ' on' : ''}`, 'aria-pressed': df === k ? 'true' : 'false',
        onclick: () => { ui.doneFilter = k; render(); },
      }, label))),
    shown.length
      ? h('ul', { class: 'done-list' }, shown.map(doneCard))
      : h('div', { class: 'empty' }, doneAll.length ? '이 분류에 완료된 일이 아직 없어요.' : '아직 오늘 완료한 일이 없어요. 내가 체크한 일과 AI가 끝낸 결과물이 여기 자동으로 정리됩니다.'));
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
  const guardSvg = C.avatarSvg('sumunjang', { size: 38, state: 'working', style: 'pixel' });
  return h('div', { class: 'appr-inline' },
    h('div', { class: 'row', style: 'justify-content:space-between;align-items:flex-start' },
      h('div', { class: 'gate-guard', style: 'min-width:0;flex:1' },
        guardSvg,
        h('div', { style: 'min-width:0;flex:1' },
          h('div', { style: 'font-size:15px;font-weight:600' },
            a.accountName ? h('span', { class: 'tag', style: 'margin-right:8px' }, `${a.accountName}${a.accountAction ? ` · ${a.accountAction}` : ''}`) : null,
            a.what),
          h('div', { class: 'small muted', style: 'margin-top:3px' }, ['대표 승인 대기', a.kind, nameOf(a.from), linkedTask ? `할 일: ${linkedTask.title}` : '', stamp(a.requestedAt)].filter(Boolean).join(' · ')))),
      linkedTask ? h('button', { type: 'button', class: 'btn link', onclick: () => openTaskById(linkedTask.id) }, '할 일 열기') : null),
    a.original ? h('div', { class: 'orig' }, `원본 · ${a.original}`) : null,
    draftEl ? h('label', { class: 'field' }, h('span', { class: 'small muted' }, '보낼 초안 (수정 후 승인 가능)'), draftEl) : null,
    h('div', { class: 'row', style: 'justify-content:flex-end' },
      h('button', { type: 'button', class: 'btn sm', onclick: () => once(`ap-r-${a.id}`, () => act('POST', `/api/ui/approvals/${a.id}/decide`, { decision: '반려' }, '반려했어요')) }, '반려'),
      h('button', { type: 'button', class: 'btn sm dark', onclick: () => once(`ap-a-${a.id}`, () => act('POST', `/api/ui/approvals/${a.id}/decide`, { decision: '승인', ...(draftEl ? { finalText: draftEl.value } : {}) }, '승인했어요')) }, '승인')));
}

// ───────── CONNECT AI · LIVE CREW (매트 블랙 × 샴페인 골드 · K-Heritage 16비트 픽셀) ─────────

function empTeamInfo(e) {
  const teams = S.options?.teams || [];
  return teams.find((t) => t.key === e.team) || teams.find((t) => t.key === 'ops') || { key: 'ops', name: '운영 · OPS', short: '운영', code: 'OPS', color: '#38BDF8', hint: '운영 자동화' };
}

function teamSampleSprite(teamKey) {
  const map = { exec: 'sejong', dev: 'jangyeongsil', plan: 'seonbi', design: 'saimdang', marketing: 'bobusang', research: 'damo', ops: 'madangsoe' };
  return map[teamKey] || 'seonbi';
}

function openSwarmMissionModal(defaultKey = null) {
  const dlg = document.getElementById('dlg');
  dlg.className = 'wide';
  const missions = S.options?.swarmMissions || [];
  const teams = S.options?.teams || [];
  if (!missions.length) { toast('멀티 팀 프리셋을 불러오지 못했어요'); return; }
  let pickedKey = defaultKey && missions.some((m) => m.key === defaultKey) ? defaultKey : missions[0].key;
  const topicIn = h('input', { class: 'in big', placeholder: missions[0].placeholder || '실행할 주제를 적어 주세요', 'aria-label': '멀티 팀 실행 주제' });
  const cardsWrap = h('div', { class: 'mission-grid' });
  const previewWrap = h('div');

  const guessEmpForTeam = (teamKey) => {
    const pool = S.data.employees.filter((e) => (e.team || 'ops') === teamKey);
    if (pool.length) return pool.find((e) => e.runMode === 'auto') || pool[0];
    return S.data.employees.find((e) => e.runMode === 'auto') || S.data.employees[0] || null;
  };

  const renderMissionBody = () => {
    const cur = missions.find((m) => m.key === pickedKey) || missions[0];
    topicIn.placeholder = cur.placeholder || '실행할 주제를 적어 주세요';
    cardsWrap.replaceChildren(...missions.map((m) => h('button', {
      type: 'button', class: `mission-card${m.key === pickedKey ? ' on' : ''}`,
      onclick: () => { pickedKey = m.key; renderMissionBody(); },
    },
    h('div', { class: 'm-top' }, h('b', null, m.title), h('span', { class: 'tag' }, m.badge)),
    h('div', { class: 'small muted' }, m.hint),
    h('div', { class: 'mission-chain' }, m.steps.map((st, idx) => [
      C.avatarSvg(teamSampleSprite(st.team), { size: 24, state: 'working', style: 'pixel' }),
      idx < m.steps.length - 1 ? h('span', { class: 'small muted' }, m.mode === 'parallel' ? '+' : '→') : null,
    ])))));

    previewWrap.replaceChildren(
      h('div', { class: 'mission-step-list' },
        h('div', { class: 'row ms-head' },
          h('b', { class: 'ms-kicker' }, `${cur.mode === 'parallel' ? 'PARALLEL · 동시 실행' : 'RELAY · 순차 바통 터치'} · ${cur.steps.length} TEAMS`),
          h('span', { class: 'ms-hint' }, '자동 실행 AI는 즉시 가동됩니다')),
        ...cur.steps.map((st, idx) => {
          const tMeta = teams.find((t) => t.key === st.team);
          const assigned = guessEmpForTeam(st.team);
          const avKey = assigned && window.PixelCrew?.SPRITES[assigned.avatar] ? assigned.avatar : teamSampleSprite(st.team);
          return h('div', { class: 'mission-step-row' },
            h('span', { class: 'ms-num' }, String(idx + 1)),
            C.avatarSvg(avKey, { size: 30, state: 'working', style: 'pixel' }),
            h('div', { class: 'ms-body' },
              h('div', { class: 'ms-ttl' }, st.title),
              h('div', { class: 'ms-sub' }, `${tMeta?.name || st.team} · 담당: ${assigned ? shortName(assigned.id) : '대표'}`)));
        })));
  };

  renderMissionBody();
  const launch = () => once('swarm-dispatch', async () => {
    const r = await act('POST', '/api/ui/swarm/dispatch', { missionKey: pickedKey, topic: topicIn.value.trim() }, '멀티 팀 협업을 시작했어요');
    if (r) {
      closeDlg();
      if (ui.route !== 'home') location.hash = '#home';
      ui.open = r.id;
      render();
    }
  });
  topicIn.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && !ev.isComposing) launch(); });

  setDlg(dlg,
    h('div', { class: 'swarm-kicker' }, 'CONNECT AI · SYSTEMIZATION'),
    h('h3', { class: 'coord-dlg-h' }, '멀티 팀 협업 실행'),
    h('p', { class: 'small muted coord-dlg-sub' }, '워크플로우를 고르고 주제만 적으면, 각 부서 AI 크루가 순서대로 또는 동시에 바로 가동됩니다.'),
    cardsWrap,
    h('label', { class: 'field' }, '실행 주제 (선택 · 각 팀 지시서에 자동 반영)', topicIn),
    previewWrap,
    h('div', { class: 'bar' },
      h('button', { type: 'button', class: 'btn', onclick: closeDlg }, '닫기'),
      h('button', { type: 'button', class: 'btn dark', onclick: launch }, '멀티 팀 실행')));
  dlg.showModal();
  topicIn.focus();
}

function openJoseonCodexModal() {
  const dlg = document.getElementById('dlg');
  dlg.className = 'wide';
  const presets = (S.options?.avatarPresets || []).filter((p) => p.pack === 'joseon');
  const groups = [
    ['HQ · FOUNDER & MASCOT (세종 · 소헌왕후 · 솜이 · 수문장)', ['som', 'sejong', 'queen', 'sumunjang']],
    ['DEV · 개발 (장영실 · 천문 아씨)', ['jangyeongsil', 'cheomseong']],
    ['PLAN · 기획 (집현전 선비 · 문인 아씨)', ['seonbi', 'munin']],
    ['DESIGN · 디자인 (김홍도 · 신사임당 · 안견 · 신윤복 · 추사)', ['hwawon', 'saimdang', 'angyeon', 'yunbok', 'chusa']],
    ['GROWTH · 마케팅 (보부상 · 예인 아씨)', ['bobusang', 'yein']],
    ['RESEARCH · 리서치 & QA (사냥꾼 · 다모)', ['hunter', 'damo']],
    ['OPS & HEALTH · 운영 · 헬스 (마당쇠 · 행랑 아씨 · 허준 · 대장금)', ['madangsoe', 'haengrang', 'heojun', 'daejanggeum']],
  ];
  let mode = 'working';
  const stateBar = h('div', { class: 'picker' });
  const body = h('div');

  const renderCodex = () => {
    stateBar.replaceChildren(
      ...[['working', 'ACTIVE · 가동 모션'], ['idle', 'IDLE · Z 대기 모션']].map(([mk, ml]) => h('button', {
        type: 'button', class: `chip sm${mode === mk ? ' on' : ''}`,
        onclick: () => { mode = mk; renderCodex(); },
      }, ml)));

    body.replaceChildren(...groups.map(([gTitle, keys]) => {
      const items = keys.map((k) => presets.find((p) => p.key === k)).filter(Boolean);
      return h('div', null,
        h('div', { class: 'codex-sec' }, gTitle),
        h('div', { class: 'codex-grid' }, items.map((p) => h('button', {
          type: 'button', class: 'codex-card',
          title: `${p.name} — 클릭해 적용 또는 채용`,
          onclick: () => {
            if (p.key === 'sejong' || p.key === 'queen' || p.key === 'som') {
              once('codex-royal', async () => {
                await act('PATCH', '/api/ui/settings', { ownerAvatar: p.key }, `Coordinator 캐릭터를 ${p.name.split(' ')[0]}(으)로 바꿨어요`);
                closeDlg();
              });
              return;
            }
            if (p.key === 'heojun' || p.key === 'daejanggeum') {
              once('codex-doc', async () => {
                await act('PATCH', '/api/ui/settings', { healthDoctor: p.key }, `컨디션 담당 캐릭터를 ${p.name.split(' ')[0]}(으)로 바꿨어요`);
                closeDlg();
              });
              return;
            }
            closeDlg();
            openAddEmployee({ pack: 'joseon', avatar: p.key, team: p.team || 'ops' });
          },
        },
        C.avatarSvg(p.key, { size: 54, state: mode, style: 'pixel' }),
        h('b', null, p.name.replace(/\s*\([^)]*\)/, '')),
        h('span', null, p.hint)))));
    }));
  };

  renderCodex();
  setDlg(dlg,
    h('div', { class: 'row codex-top' },
      h('div', null,
        h('div', { class: 'swarm-kicker' }, 'CONNECT AI LAB · SIGNATURE DROP'),
        h('h3', { class: 'coord-dlg-h' }, 'K-Heritage Pixel Edition (21)')),
      stateBar),
    h('p', { class: 'small muted codex-desc' }, '캐릭터를 클릭하면 해당 팀으로 새 AI 직원을 추가합니다 (솜이·세종·왕후는 Coordinator, 허준·대장금은 헬스 담당으로 전환).'),
    body,
    h('div', { class: 'bar' },
      h('button', {
        type: 'button', class: 'btn',
        onclick: () => once('codex-dress-all', async () => {
          await act('POST', '/api/ui/employees/avatar-style', { pack: 'joseon', avatarStyle: 'pixel', rebalanceTeams: true }, '전체 AI 직원에게 K-Heritage Pixel을 적용했어요');
          closeDlg();
        }),
      }, '전체 직원에 부서별 적용'),
      h('button', { type: 'button', class: 'btn dark', onclick: closeDlg }, '닫기')));
  dlg.showModal();
}

function openCoordinatorConfigModal() {
  const dlg = document.getElementById('dlg');
  dlg.className = '';
  const d = S.data;
  const machines = d.resources.filter((r) => r.kind === '기계');
  const curAi = d.settings?.mainAi || '';
  const curMac = d.settings?.mainMachine || '';
  const aiSel = h('select', { class: 'in', 'aria-label': '메인 두뇌 AI 선택' },
    h('option', { value: '' }, '자동 선택 (실행 가능한 최우선 AI)'),
    ...d.employees.map((e) => h('option', { value: e.id, selected: e.id === curAi }, `${shortName(e.id)} · ${empTeamInfo(e).short}${e.runMode === 'auto' ? ' (자동 실행)' : ''}`)));
  const macSel = h('select', { class: 'in', 'aria-label': '메인 본사 컴퓨터 선택' },
    h('option', { value: '' }, '자동 선택 (이 컴퓨터 우선)'),
    ...machines.map((m) => {
      const mh = S.machineHealth?.[m.id];
      const ram = typeof mh?.ramPct === 'number' ? ` · RAM ${mh.ramPct}%` : '';
      return h('option', { value: m.id, selected: m.id === curMac }, `${m.name}${m.isThisMac ? ' (이 컴퓨터)' : ''}${ram}`);
    }));
  const save = () => once('coord-cfg', async () => {
    const r = await act('PATCH', '/api/ui/settings', { mainAi: aiSel.value || null, mainMachine: macSel.value || null }, '메인 AI와 메인 컴퓨터를 저장했어요');
    if (r) closeDlg();
  });
  setDlg(dlg,
    h('div', { class: 'swarm-kicker' }, 'CONNECT AI · COORDINATOR SETUP'),
    h('h3', { class: 'coord-dlg-h' }, '메인 AI · 메인 컴퓨터 설정'),
    h('p', { class: 'small muted coord-dlg-sub' }, '「✦ 자동 배분」을 누르면 설정한 메인 AI가 목표를 부서별 팀원에게 자동 분할·배분하고, 메인 컴퓨터(RAM 85% 초과 시 자동 우회)에서 실행합니다.'),
    h('label', { class: 'field' }, '메인 두뇌 AI (Coordinator)', aiSel),
    h('label', { class: 'field coord-dlg-gap' }, '메인 본사 컴퓨터 (기본 실행 머신)', macSel),
    h('div', { class: 'bar' },
      h('button', { type: 'button', class: 'btn', onclick: closeDlg }, '취소'),
      h('button', { type: 'button', class: 'btn dark', onclick: save }, '저장')));
  dlg.showModal();
}

function joseonSwarmPanel() {
  const d = S.data;
  if (!d.employees.length) return null;
  const teams = S.options?.teams || [];
  const px = window.PixelCrew;
  const isJoseonMode = d.employees.some((e) => px?.isJoseonKey(e.avatar));
  const teamFilter = ui.swarmTeam || 'all';
  const filtered = teamFilter === 'all' ? d.employees : d.employees.filter((e) => (e.team || 'ops') === teamFilter);
  const visible = teamFilter === 'all' ? d.employees : filtered;
  const selEmp = ui.swarmSelected && ui.swarmSelected !== 'all' ? d.employees.find((e) => e.id === ui.swarmSelected) : null;
  const royalOrder = ['sejong', 'som', 'queen'];
  const ownerAv = royalOrder.includes(d.settings?.ownerAvatar) ? d.settings.ownerAvatar : 'sejong';
  const nextOwnerAv = royalOrder[(royalOrder.indexOf(ownerAv) + 1) % royalOrder.length];
  const ownerLabels = { sejong: '세종대왕', som: '솜이', queen: '소헌왕후' };
  const workingCount = S.working.length;
  const activeTeamMeta = teams.find((t) => t.key === teamFilter);

  const assignTo = (empObj) => {
    ui.taskPick = empObj.id;
    if (ui.route !== 'home') {
      location.hash = '#home';
      setTimeout(() => document.querySelector('[data-k="add-title"]')?.focus(), 80);
    } else {
      render();
      setTimeout(() => document.querySelector('[data-k="add-title"]')?.focus(), 20);
    }
    toast(`${shortName(empObj.id)}에게 맡길 일을 적어 주세요`);
  };

  // 1. 상단 부서 필터 탭 + CONNECT AI 액션
  const teamTabs = [
    h('button', {
      type: 'button', class: `swarm-tab${teamFilter === 'all' ? ' on' : ''}`,
      onclick: () => { ui.swarmTeam = 'all'; ui.swarmSelected = 'all'; render(); },
    }, workingCount ? h('span', { class: 'st-live' }) : null, `ALL (${d.employees.length})`),
    ...teams.filter((t) => t.key !== 'exec').map((t) => {
      const members = d.employees.filter((e) => (e.team || 'ops') === t.key);
      const anyWork = members.some((e) => isWorking(e.id));
      return h('button', {
        type: 'button', class: `swarm-tab tm-${t.key}${teamFilter === t.key ? ' on' : ''}${members.length ? '' : ' empty-team'}`,
        title: `${t.name} · ${t.hint}`,
        onclick: () => { ui.swarmTeam = t.key; ui.swarmSelected = members.length === 1 ? members[0].id : 'all'; render(); },
      }, anyWork ? h('span', { class: 'st-live' }) : h('span', { class: 'st-dot' }), `${t.short} ${members.length}`);
    }),
  ];

  const topActions = h('div', { class: 'swarm-actions' },
    h('button', { type: 'button', class: 'swarm-btn gold', onclick: () => openSwarmMissionModal() }, '멀티 팀 실행'),
    h('button', { type: 'button', class: 'swarm-btn', onclick: openJoseonCodexModal }, '크루 에디션'),
    !isJoseonMode
      ? h('button', {
        type: 'button', class: 'swarm-btn',
        title: '전체 AI 직원에게 K-Heritage 16비트 픽셀 에디션을 적용합니다',
        onclick: () => once('dress-joseon', () => act('POST', '/api/ui/employees/avatar-style', { pack: 'joseon', avatarStyle: 'pixel', rebalanceTeams: true }, 'K-Heritage Pixel 에디션을 적용했어요')),
      }, 'K-픽셀')
      : h('button', {
        type: 'button', class: 'swarm-btn',
        onclick: () => once('dress-k3d', () => act('POST', '/api/ui/employees/avatar-style', { pack: 'k-crew', avatarStyle: 'studio' }, 'K-Guardian 3D로 전환했어요')),
      }, '3D 스튜디오'));

  // 2. 중앙 스포트라이트 (Coordinator OR 선택한 AI 직원)
  let heroNode;
  if (!selEmp) {
    const ownerName = d.owner?.name ? `${d.owner.name} · Coordinator` : 'THE FOUNDER · Coordinator';
    const anyWork = workingCount > 0;
    const teamPick = activeTeamMeta ? (visible.find((e) => e.runMode === 'auto') || visible[0]) : null;
    const heroSprite = activeTeamMeta ? teamSampleSprite(activeTeamMeta.key) : ownerAv;
    const mainAiEmp = (d.settings?.mainAi && d.employees.find((e) => e.id === d.settings.mainAi)) || d.employees.find((e) => e.runMode === 'auto') || d.employees[0];
    const mainMacObj = (d.settings?.mainMachine && d.resources.find((r) => r.id === d.settings.mainMachine && r.kind === '기계')) || d.resources.find((r) => r.kind === '기계' && r.isThisMac) || d.resources.find((r) => r.kind === '기계');
    const mainRam = mainMacObj && S.machineHealth?.[mainMacObj.id]?.ramPct != null ? ` · RAM ${S.machineHealth[mainMacObj.id].ramPct}%` : '';
    heroNode = h('div', { class: 'swarm-hero' },
      h('button', {
        type: 'button', class: 'swarm-hero-av',
        title: activeTeamMeta ? `${activeTeamMeta.name} — 클릭해 크루 에디션 열기` : `클릭해 Coordinator 캐릭터 전환 (${ownerLabels[ownerAv]} → ${ownerLabels[nextOwnerAv]})`,
        onclick: () => activeTeamMeta ? openJoseonCodexModal() : once('flip-royal', () => act('PATCH', '/api/ui/settings', { ownerAvatar: nextOwnerAv }, `Coordinator를 ${ownerLabels[nextOwnerAv]}(으)로 전환했어요`)),
      }, C.avatarSvg(heroSprite, { size: 62, state: anyWork ? 'working' : 'idle', style: 'pixel' })),
      h('div', { class: 'swarm-hero-info' },
        h('div', { class: 'swarm-kicker' }, activeTeamMeta ? `CONNECT AI · ${activeTeamMeta.code || activeTeamMeta.short}` : 'CONNECT AI · LIVE CREW'),
        h('div', { class: 'swarm-hero-title' },
          activeTeamMeta ? activeTeamMeta.name : ownerName,
          h('span', { class: `swarm-pill${anyWork ? ' live' : ' gold'}` }, anyWork ? `ACTIVE · ${workingCount} / ${d.employees.length}` : `STANDBY · ${d.employees.length}`)),
        activeTeamMeta
          ? h('div', { class: 'swarm-hero-sub' }, activeTeamMeta.hint)
          : h('div', { class: 'swarm-brain-bar' },
            h('button', { type: 'button', class: 'swarm-brain-pill', title: '클릭해 메인 AI 및 메인 컴퓨터 변경', onclick: openCoordinatorConfigModal },
              '메인 AI ', h('b', null, mainAiEmp ? shortName(mainAiEmp.id) : '미지정'), ' ▾'),
            mainMacObj ? h('button', { type: 'button', class: 'swarm-brain-pill', title: '클릭해 메인 컴퓨터 변경 (RAM 85% 초과 시 자동 우회)', onclick: openCoordinatorConfigModal },
              '메인 컴퓨터 ', h('b', null, mainMacObj.name), mainRam, ' ▾') : null)),
      h('div', { class: 'swarm-hero-acts' },
        activeTeamMeta && !visible.length
          ? h('button', { type: 'button', class: 'swarm-btn gold', onclick: () => openAddEmployee({ pack: 'joseon', team: activeTeamMeta.key, avatar: teamSampleSprite(activeTeamMeta.key) }) }, `+ ${activeTeamMeta.short}팀 추가`)
          : teamPick
            ? h('button', { type: 'button', class: 'swarm-btn gold', onclick: () => assignTo(teamPick) }, `${activeTeamMeta.short}팀에 맡기기 →`)
            : null));
  } else {
    const working = isWorking(selEmp.id);
    const cooling = isEmpCooling(selEmp);
    const wJob = S.working.find((w) => w.emp === selEmp.id);
    const wTask = wJob ? d.tasks.find((t) => t.id === wJob.taskId) : null;
    const tInfo = empTeamInfo(selEmp);
    const preset = (S.options?.avatarPresets || []).find((p) => p.key === selEmp.avatar);
    heroNode = h('div', { class: 'swarm-hero' },
      h('button', {
        type: 'button', class: 'swarm-hero-av', title: '클릭해 캐릭터 · 팀 설정',
        onclick: () => openAvatarModal(selEmp, { tab: isJoseonMode ? 'joseon' : undefined }),
      }, avatarEl(selEmp, { size: 62, onDark: true })),
      h('div', { class: 'swarm-hero-info' },
        h('div', { class: 'swarm-kicker' }, `CONNECT AI · ${tInfo.code || tInfo.short}`),
        h('div', { class: 'swarm-hero-title' },
          `@${shortName(selEmp.id)}`,
          h('span', { class: `swarm-pill team-tag tm-${tInfo.key}` }, tInfo.name),
          h('span', { class: `swarm-pill${working ? ' live' : ''}` }, working ? 'ACTIVE' : cooling ? `COOLDOWN ${empCooldownMin(selEmp)}m` : 'IDLE · Z')),
        h('div', { class: 'swarm-hero-sub' }, working && wTask
          ? `진행 중: ${wTask.title}`
          : [preset?.name, selEmp.role].filter(Boolean).join(' · ') || '클릭해서 바로 일을 맡겨 보세요'),
        skillPillsEl(selEmp, { onDark: true, max: 4 })),
      h('div', { class: 'swarm-hero-acts' },
        h('button', { type: 'button', class: 'swarm-btn gold', onclick: () => assignTo(selEmp) }, '일 맡기기'),
        h('button', { type: 'button', class: 'swarm-btn', onclick: () => openEmployeeSkillsModal(selEmp.id) }, '스킬 · GitHub'),
        h('button', { type: 'button', class: 'swarm-btn', onclick: () => openAvatarModal(selEmp, { tab: 'joseon' }) }, '캐릭터 · 팀')));
  }

  // 3. 하단 워커 타일 스트립 (All 3인 클러스터 + 팀 AI 직원들)
  const clusterKeys = (visible.length ? visible : d.employees).slice(0, 3).map((e) => (px?.SPRITES[e.avatar] ? e.avatar : 'seonbi'));
  const allItem = h('div', { class: `swarm-item${!selEmp ? ' on' : ''}` },
    h('button', {
      type: 'button', class: `swarm-tile${!selEmp ? ' on' : ''}`, title: '전체 보기 (Coordinator)',
      onclick: () => { ui.swarmSelected = 'all'; render(); },
    }, C.swarmAllSvg(clusterKeys, { size: 48 })),
    h('span', { class: 'swarm-lbl' }, 'All'));

  const workerItems = visible.map((e) => {
    const working = isWorking(e.id);
    const on = selEmp && selEmp.id === e.id;
    const tInfo = empTeamInfo(e);
    const tileVisual = e.avatarImage
      ? h('img', { src: e.avatarImage, alt: shortName(e.id), width: 48, height: 48, class: 'swarm-av-img' })
      : (px?.SPRITES[e.avatar] || e.avatarStyle === 'pixel'
        ? C.avatarSvg(e.avatar, { size: 48, state: working ? 'working' : (isEmpCooling(e) ? 'cooling' : 'idle'), style: 'pixel' })
        : avatarEl(e, { size: 48, onDark: true }));
    return h('div', { class: `swarm-item tm-${tInfo.key}${on ? ' on' : ''}` },
      h('button', {
        type: 'button', class: `swarm-tile${on ? ' on' : ''}`,
        title: `${shortName(e.id)} (${tInfo.name}) — 클릭해 선택`,
        onclick: () => {
          ui.swarmSelected = e.id;
          if (ui.route === 'home') ui.taskPick = e.id;
          render();
        },
      },
      tileVisual,
      working ? h('i', { class: 'sw-dot', title: '가동 중' }) : null,
      h('i', { class: 'sw-team' })),
      h('span', { class: 'swarm-lbl' }, `@${shortName(e.id)}`));
  });

  const addTile = h('div', { class: 'swarm-item' },
    h('button', {
      type: 'button', class: 'swarm-tile add-tile',
      title: '새 AI 직원 추가',
      onclick: () => openAddEmployee(activeTeamMeta ? { pack: 'joseon', team: activeTeamMeta.key, avatar: teamSampleSprite(activeTeamMeta.key) } : undefined),
    }, '+'),
    h('span', { class: 'swarm-lbl' }, '추가'));

  return h('section', { class: 'swarm-card', 'aria-label': 'CONNECT AI LIVE CREW' },
    h('div', { class: 'swarm-top' }, h('div', { class: 'swarm-tabs' }, teamTabs), topActions),
    heroNode,
    h('div', { class: 'swarm-strip' }, allItem, workerItems, addTile));
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
    S.health?.delegateRecommended ? h('div', { class: 'health-banner' },
      h('div', null, h('span', { class: 'tag solid', style: 'margin-right:8px' }, `${S.health.levelLabel}${S.health.score != null ? ` · ${S.health.score}점` : ''}`), h('span', { class: 'small' }, S.health.advice)),
      h('button', { type: 'button', class: 'btn link', onclick: () => { location.hash = '#dashboard'; } }, '컨디션 보기 →')) : null,
    joseonSwarmPanel(),
    addBar(),
    h('p', { class: 'rule' }, '결제, 업로드, 게시, 삭제, 메시지 발송이 들어간 일은 대표가 누를 때까지 AI가 시작하지 못합니다.'),
    !d.employees.length ? h('div', { class: 'callout' },
      h('div', null, h('b', null, '먼저 쓰는 AI를 직원으로 추가하세요.'), h('div', { class: 'small muted' }, 'ChatGPT, Claude, Gemini 처럼 이미 쓰는 AI를 고르면, 적은 일을 알맞은 AI에게 나눠 줍니다.')),
      h('button', { class: 'btn dark', onclick: openAddEmployee }, '직원 추가')) : null,
    pendingApprs.length ? h('section', { class: 'sec' }, secHead('대표 확인 대기', `${pendingApprs.length}건 · 승인 전에 내용을 고칠 수 있어요`),
      pendingApprs.map(approvalInlineCard)) : null,
    overdue.length ? h('section', { class: 'sec' }, secHead('지난 날짜, 아직 안 끝남', `${overdue.length}개`), taskList(overdue, { draggable: false, overdue: true })) : null,
    h('section', { class: 'sec' }, secHead(`오늘 할 일 · ${dateK(S.today)}`, `남은 일 ${today.filter((t) => t.status !== '완료').length}건`),
      today.length ? todayOpenSection(today) : h('div', { class: 'empty' }, '오늘 할 일이 없습니다. 위에 적어 보세요.')),
    todayDoneSection(today),
    later.length ? h('section', { class: 'sec' }, secHead('예정', `${later.length}개`), taskList(later, { draggable: false })) : null,
    h('div', { class: 'cols home-foot' }, timeline(), recentTalk()));
}

// ───────── 회사 대시보드 (White & Black SVG 라이브 구조도 · 텔레메트리) ─────────

function buildTopologyModel() {
  const d = S.data;
  const today = d.tasks.filter((t) => t.date === S.today);
  const aiRoutines = d.routines.filter((r) => r.enabled !== false && !r.feature && r.assignee && r.assignee !== 'jay');
  const machines = d.resources.filter((r) => r.kind === '기계');
  const phones = d.resources.filter((r) => r.kind === '스마트폰' && r.status !== '꺼짐');
  const browsers = d.resources.filter((r) => r.kind === '브라우저' && r.status !== '꺼짐');
  const accounts = d.resources.filter((r) => r.kind === '계정' && r.status !== '꺼짐');
  const ossList = d.resources.filter((r) => r.kind === '오픈소스' && r.status !== '꺼짐');
  const designs = d.resources.filter((r) => r.kind === '디자인' && r.status !== '꺼짐');
  const thisMac = machines.find((m) => m.isThisMac) || machines[0] || null;
  const studio = machines.find((m) => /(스튜디오|studio)/i.test(m.name)) || null;
  const H = S.health || {};

  // 왼쪽 열: 대표 본사 + 활성 AI 자동 루틴
  const left = [{
    key: 'ceo', route: 'home', solid: true, dot: 'idle',
    title: `${d.owner.name || '대표'} · 본사`,
    badge: H.score != null ? `컨디션 ${H.score}` : (d.settings.autoOptimize !== false ? '최적화 ON' : '수동'),
    sub: H.score != null
      ? `${H.levelLabel} · 할 일 ${today.filter((t) => t.status !== '완료').length}건`
      : `오늘 할 일 ${today.filter((t) => t.status !== '완료').length}건 · 완료 ${today.filter((t) => t.status === '완료').length}건`,
    tooltip: '오늘 할 일로 이동',
  }];
  for (const r of aiRoutines.slice(0, 4)) {
    const sched = r.intervalMin ? (r.intervalMin === 60 ? '매1h' : `매${r.intervalMin}분`) : (r.time || '매일');
    left.push({
      key: `rt:${r.id}`, route: 'daily',
      title: r.title,
      badge: sched,
      sub: `${shortName(r.assignee)}${(r.steps || []).length ? ` · ${r.steps.length}단계 협업` : ''}`,
      tooltip: `${r.title} (${sched}) · 클릭 시 자동 루틴으로 이동`,
    });
  }
  const adHocAi = today.filter((t) => t.assignee && t.assignee !== 'jay' && !t.routineId && t.status !== '완료');
  if (adHocAi.length || !aiRoutines.length) {
    left.push({
      key: 'adhoc', route: 'home',
      title: adHocAi.length ? `오늘 AI 할 일 (${adHocAi.length}건)` : '자동 루틴 시작하기',
      badge: adHocAi.length ? '진행' : '루틴 팩',
      sub: adHocAi.length ? adHocAi.slice(0, 2).map((x) => x.title).join(', ') : '5분 이메일 · 8시 영상 편집',
      tooltip: adHocAi.length ? '오늘 할 일로 이동' : '자동 루틴에서 1클릭 팩 담기',
    });
  }

  // 가운데 열: AI 직원
  const employees = d.employees.map((e) => {
    const working = isWorking(e.id);
    const cooling = isEmpCooling(e);
    const rem = empCooldownMin(e);
    const cnt = today.filter((t) => t.assignee === e.id && t.status !== '완료').length;
    const fb = e.fallbackTo && emp(e.fallbackTo) ? shortName(e.fallbackTo) : null;
    return {
      key: `emp:${e.id}`, route: 'staff', empId: e.id,
      solid: working,
      cooling,
      highlight: cnt > 0 && !cooling,
      dot: working ? 'working' : cooling ? 'cool' : 'idle',
      title: shortName(e.id),
      badge: working ? '근무 중' : cooling ? `휴식 ${rem}m` : cnt ? `오늘 ${cnt}` : '대기',
      badgeSolid: cnt > 0 && !cooling,
      sub: cooling && fb ? `토큰 휴식 → ${fb} 자동 대체` : (e.role || ENGINE_LABEL[e.engine] || e.engine),
      tooltip: `${e.name}${fb ? ` · 막히면 대체: ${fb}` : ''} · 클릭 시 AI 직원으로 이동`,
    };
  });

  // 오른쪽 열: AI 사무실 (컴퓨터 + 스마트폰 + 브라우저/계정 + 오픈소스/디자인)
  const right = machines.map((m) => {
    const mh = S.machineHealth?.[m.id];
    const ramPct = typeof mh?.ramPct === 'number' ? mh.ramPct : null;
    const lvl = mh?.level || (m.status === '꺼짐' ? 'down' : 'ok');
    const fb = m.fallbackTo && res(m.fallbackTo) ? res(m.fallbackTo).name : null;
    return {
      key: `res:${m.id}`, route: 'resources', resTab: 'office',
      highlight: m.isThisMac || lvl === 'overload',
      cooling: lvl === 'down',
      dot: lvl === 'overload' ? 'over' : lvl === 'down' ? 'cool' : 'idle',
      title: `${m.name}${m.computerUse ? ' · CU' : ''}`,
      badge: healthLabel(lvl),
      badgeSolid: lvl === 'overload',
      ramPct,
      maxRamPct: m.maxRamPct || 85,
      sub: ramPct === null ? [m.sshAlias ? `ssh ${m.sshAlias}` : '대기', m.computerUse ? '화면 조작' : '', fb ? `바쁘면 → ${fb}` : ''].filter(Boolean).join(' · ') : '',
      tooltip: `${m.name}${m.computerUse ? ' · 화면 조작(Computer Use) 켜짐' : ''} · RAM 상한 ${m.maxRamPct || 85}%${fb ? ` · 바쁘면 → ${fb}` : ''} · 클릭 시 AI 사무실로 이동`,
    };
  });
  for (const ph of phones.slice(0, 2)) {
    const modeObj = (S.options.phoneModes || []).find((x) => x.key === ph.phoneMode);
    const host = ph.hostMachine ? res(ph.hostMachine) : null;
    right.push({
      key: `res:${ph.id}`, route: 'resources', resTab: 'mobile',
      highlight: ph.phoneMode === 'iphone-mirror',
      dot: 'idle',
      title: ph.name,
      badge: modeObj?.short || '스마트폰',
      sub: ph.phoneMode === 'mobile-ai'
        ? (ph.assignee ? `${shortName(ph.assignee)} 전담` : '모바일 AI 연결')
        : `${host ? host.name : '이 맥'} · ${ph.phoneMode === 'iphone-mirror' ? 'Computer Use 미러링' : 'adb · scrcpy'}`,
      tooltip: `${ph.name} (${modeObj?.name || '스마트폰'}) · 클릭 시 AI 사무실로 이동`,
    });
  }
  const defBr = browsers.find((b) => b.isDefault) || browsers[0] || null;
  right.push({
    key: 'stack:web', route: 'resources', resTab: 'web',
    title: defBr ? `${defBr.name} · 계정` : '브라우저 · 계정',
    badge: `${accounts.length}개`,
    sub: accounts.slice(0, 3).map((a) => a.name.split(' · ')[0].split(' (')[0]).join(', ') || '계정 연결 전',
    tooltip: 'AI 사무실 (브라우저 · 계정)으로 이동',
  });
  right.push({
    key: 'stack:tools', route: 'resources', resTab: 'tools',
    title: '오픈소스 · 디자인',
    badge: `${ossList.length + designs.length}개`,
    sub: [...designs.map((x) => x.name), ...ossList.map((x) => x.name)].slice(0, 2).join(' · ') || '도구 · 디자인 등록 전',
    tooltip: 'AI 사무실 (오픈소스 · 디자인)으로 이동',
  });

  // 연결선 구성
  const edges = [];
  const edgeSeen = new Set();
  const pushEdge = (ed) => {
    const k = `${ed.from}->${ed.to}:${ed.dashed ? 'd' : 's'}`;
    if (edgeSeen.has(k)) return;
    edgeSeen.add(k);
    edges.push(ed);
  };

  // 왼쪽 → 가운데 (루틴/할 일 → AI 직원)
  for (const r of aiRoutines.slice(0, 4)) {
    pushEdge({ from: `rt:${r.id}`, to: `emp:${r.assignee}`, active: true, label: `${r.title} → ${shortName(r.assignee)}` });
  }
  for (const t of adHocAi) {
    pushEdge({ from: 'adhoc', to: `emp:${t.assignee}`, active: true, label: `${t.title} → ${shortName(t.assignee)}` });
  }
  for (const e of d.employees) {
    const hasLeft = edges.some((x) => x.to === `emp:${e.id}`);
    if (!hasLeft) pushEdge({ from: 'ceo', to: `emp:${e.id}`, active: isWorking(e.id), label: `대표 → ${e.name}` });
  }

  // 가운데 내부: AI 토큰 소진 대체 순위(fallbackTo) 점선 곡선
  for (const e of d.employees) {
    if (e.fallbackTo && d.employees.some((x) => x.id === e.fallbackTo)) {
      pushEdge({
        from: `emp:${e.id}`, to: `emp:${e.fallbackTo}`,
        dashed: true, active: isEmpCooling(e), gutterX: 590,
        label: `토큰 한도 시 대체: ${shortName(e.id)} → ${shortName(e.fallbackTo)}`,
      });
    }
  }

  // 가운데 → 오른쪽 (AI 직원 → 최적 컴퓨터 / 브라우저·도구)
  for (const e of d.employees) {
    const activeTask = today.find((t) => t.assignee === e.id && t.status !== '완료' && t.resource && res(t.resource)?.kind === '기계');
    const isHeavyEmp = /(영상|blender|블렌더|3d|렌더)/i.test(`${e.role} ${(e.tools || []).join(' ')}`);
    const targetMachine = activeTask ? res(activeTask.resource) : (isHeavyEmp && studio ? studio : thisMac);
    if (e.group === 'home-cloud') {
      const mobilePhone = phones.find((p) => p.assignee === e.id || (p.phoneMode === 'mobile-ai' && /스마트폰|피클/.test(`${e.name} ${e.role}`)));
      if (mobilePhone) pushEdge({ from: `emp:${e.id}`, to: `res:${mobilePhone.id}`, active: isWorking(e.id), label: `${shortName(e.id)} → ${mobilePhone.name}` });
      else pushEdge({ from: `emp:${e.id}`, to: 'stack:web', active: isWorking(e.id) || today.some((t) => t.assignee === e.id && t.status !== '완료'), label: `${shortName(e.id)} → 클라우드 · 계정` });
    } else if (targetMachine) {
      pushEdge({ from: `emp:${e.id}`, to: `res:${targetMachine.id}`, active: isWorking(e.id) || Boolean(activeTask), label: `${shortName(e.id)} → ${targetMachine.name}` });
      const cuPhone = phones.find((p) => (p.phoneMode === 'iphone-mirror' || p.phoneMode === 'android-adb') && (p.assignee === e.id || /컴퓨터\s*유즈/.test(e.role || '')));
      if (cuPhone) pushEdge({ from: `emp:${e.id}`, to: `res:${cuPhone.id}`, active: isWorking(e.id), label: `${shortName(e.id)} → ${cuPhone.name} (미러링)` });
    }
    if ((e.tools || []).length || isHeavyEmp) {
      pushEdge({ from: `emp:${e.id}`, to: 'stack:tools', active: false, label: `${shortName(e.id)} → 오픈소스 · 디자인` });
    }
  }

  // 오른쪽 내부: 컴퓨터 RAM 과부하 시 대체 컴퓨터(fallbackTo) 점선 곡선 + 스마트폰↔호스트 맥 연결
  for (const m of machines) {
    if (m.fallbackTo && machines.some((x) => x.id === m.fallbackTo)) {
      const mh = S.machineHealth?.[m.id];
      pushEdge({
        from: `res:${m.id}`, to: `res:${m.fallbackTo}`,
        dashed: true, active: mh?.level === 'overload', gutterX: 912,
        label: `RAM 과부하·혼잡 시 우회: ${m.name} → ${res(m.fallbackTo)?.name || ''}`,
      });
    }
  }
  for (const ph of phones.slice(0, 2)) {
    if (ph.hostMachine && machines.some((m) => m.id === ph.hostMachine)) {
      pushEdge({
        from: `res:${ph.hostMachine}`, to: `res:${ph.id}`,
        dashed: true, active: false, gutterX: 906,
        label: `${res(ph.hostMachine)?.name || '맥'} ↔ ${ph.name} 미러링 연결`,
      });
    }
  }

  return { left, employees, right, edges };
}

function openHealthLogModal() {
  const dlg = document.getElementById('dlg');
  dlg.className = '';
  const H = S.health || {};
  const td = H.today || {};
  const g = H.goals || { steps: 8000, sleepHours: 7.5, exerciseMin: 30, restingHrMax: 75 };
  const steps = h('input', { class: 'in', type: 'number', min: '0', max: '200000', value: td.steps ?? '', placeholder: `예: 6500 (목표 ${g.steps})` });
  const sleep = h('input', { class: 'in', type: 'number', step: '0.1', min: '0', max: '24', value: td.sleepHours ?? '', placeholder: `예: 7.2 (목표 ${g.sleepHours}시간)` });
  const hr = h('input', { class: 'in', type: 'number', min: '30', max: '220', value: td.restingHr ?? td.heartRate ?? '', placeholder: '예: 64 (bpm)' });
  const ex = h('input', { class: 'in', type: 'number', min: '0', max: '600', value: td.exerciseMin ?? '', placeholder: `예: 35 (목표 ${g.exerciseMin}분)` });
  let energyVal = td.energy ?? 4;
  const energyBtns = [1, 2, 3, 4, 5].map((n) => {
    const labels = { 1: '1 매우 피곤', 2: '2 피곤', 3: '3 보통', 4: '4 좋음', 5: '5 최상' };
    const b = h('button', {
      type: 'button', class: `chip${energyVal === n ? ' on' : ''}`,
      onclick: () => { energyVal = n; energyBtns.forEach((x, idx) => x.classList.toggle('on', idx + 1 === n)); },
    }, labels[n]);
    return b;
  });
  const goalSteps = h('input', { class: 'in sm', type: 'number', value: String(g.steps || 8000) });
  const goalSleep = h('input', { class: 'in sm', type: 'number', step: '0.5', value: String(g.sleepHours || 7.5) });
  const goalEx = h('input', { class: 'in sm', type: 'number', value: String(g.exerciseMin || 30) });

  setDlg(dlg,
    h('h3', null, '대표 컨디션 · 5초 기록'),
    h('p', { class: 'small muted', style: 'margin:-8px 0 14px' }, '입력한 건강 기록은 이 컴퓨터에만 저장되며 외부 공유·AI 프롬프트로 나가지 않아요.'),
    h('div', { class: 'grid2' },
      h('label', { class: 'field' }, '오늘 걸음 수', steps),
      h('label', { class: 'field' }, '어젯밤 수면 (시간)', sleep),
      h('label', { class: 'field' }, '안정시 심박수 (bpm)', hr),
      h('label', { class: 'field' }, '오늘 운동 (분)', ex)),
    h('div', { style: 'margin-top:12px' },
      h('div', { class: 'small muted', style: 'margin-bottom:6px' }, '체감 컨디션'),
      h('div', { class: 'picker' }, energyBtns)),
    h('details', { style: 'margin-top:14px' },
      h('summary', null, '일일 목표 변경 (걸음 · 수면 · 운동)'),
      h('div', { class: 'grid2', style: 'margin-top:10px' },
        h('label', { class: 'field' }, '목표 걸음 수', goalSteps),
        h('label', { class: 'field' }, '목표 수면 (시간)', goalSleep),
        h('label', { class: 'field' }, '목표 운동 (분)', goalEx))),
    h('div', { class: 'bar' },
      h('button', { class: 'btn', onclick: () => dlg.close() }, '취소'),
      h('button', {
        class: 'btn dark',
        onclick: () => once('save-health', async () => {
          const payload = {
            source: 'manual',
            steps: steps.value === '' ? undefined : Number(steps.value),
            sleepHours: sleep.value === '' ? undefined : Number(sleep.value),
            restingHr: hr.value === '' ? undefined : Number(hr.value),
            exerciseMin: ex.value === '' ? undefined : Number(ex.value),
            energy: energyVal,
            goals: {
              steps: Number(goalSteps.value) || 8000,
              sleepHours: Number(goalSleep.value) || 7.5,
              exerciseMin: Number(goalEx.value) || 30,
            },
          };
          dlg.close();
          await act('POST', '/api/ui/health', payload, '오늘 컨디션을 기록했어요');
        }),
      }, '저장')));
  dlg.showModal();
  steps.focus();
}

function openHealthConnectModal() {
  const dlg = document.getElementById('dlg');
  dlg.className = 'wide';
  const H = S.health || {};
  const lanOn = Boolean(S.lanInfo?.enabled);
  const url = H.ingestUrls?.[0] || H.localIngestUrl || 'http://127.0.0.1:8790/api/health/ingest';
  const tok = H.token || '(이 맥 화면에서만 표시)';
  const sampleJson = JSON.stringify({ steps: 7200, sleepHours: 7.3, restingHr: 62, exerciseMin: 35, source: 'iphone-shortcut' }, null, 2);

  setDlg(dlg,
    h('h3', null, '아이폰 · 안드로이드 헬스 자동 연동 (로컬 전용)'),
    h('p', { class: 'small muted', style: 'margin:-8px 0 12px' }, '외부 클라우드 서버 없이 집·사무실 와이파이 안에서 내 맥의 CONNECT AI HQ로만 전송됩니다.'),
    !lanOn ? h('div', { class: 'callout', style: 'margin:0 0 12px' },
      h('div', null, h('b', null, '폰에서 전송받으려면 같은 와이파이 수신을 켜 주세요'), h('div', { class: 'small muted' }, '켜면 집·사무실 와이파이의 내 폰에서만 아래 주소로 전송할 수 있어요.')),
      h('button', { type: 'button', class: 'btn sm dark', onclick: () => once('lan-health', async () => { await act('POST', '/api/ui/lan', { on: true }, '와이파이 수신을 켰어요'); openHealthConnectModal(); }) }, '와이파이 수신 켜기')) : null,
    h('div', { class: 'health-cred' },
      h('div', { class: 'small muted' }, '로컬 수신 주소 (POST)'),
      h('div', { class: 'row', style: 'margin-top:4px;justify-content:space-between' },
        h('span', { class: 'mono small' }, url),
        h('button', { type: 'button', class: 'btn sm', onclick: async () => { await copyText(url); toast('수신 주소를 복사했어요'); } }, '주소 복사')),
      h('div', { class: 'small muted', style: 'margin-top:10px' }, '전용 보안 토큰 (헤더: X-AIHQ-Health-Token)'),
      h('div', { class: 'row', style: 'margin-top:4px;justify-content:space-between' },
        h('span', { class: 'mono small' }, tok),
        h('div', { class: 'row' },
          H.token ? h('button', { type: 'button', class: 'btn sm', onclick: async () => { await copyText(tok); toast('토큰을 복사했어요'); } }, '토큰 복사') : null,
          H.token ? h('button', { type: 'button', class: 'btn sm', onclick: () => once('rot-tok', async () => { await act('POST', '/api/ui/health/token', {}, '새 보안 토큰을 발급했어요'); openHealthConnectModal(); }) }, '재발급') : null))),
    h('div', { class: 'grid2', style: 'margin-top:14px' },
      h('div', { class: 'pane-box' },
        h('b', null, '1. 아이폰 · 애플워치 (Apple Health)'),
        h('ol', { class: 'guide-ol' },
          h('li', null, '단축어(Shortcuts) 앱 → 자동화 → 매일 07:30 · 14:00 · 21:00 선택'),
          h('li', null, '"건강 샘플 찾기"로 오늘 걸음 수 · 수면 · 심박수 · 운동 시간 읽기'),
          h('li', null, '"URL의 콘텐츠 가져오기" (POST · JSON)로 위 주소와 토큰 헤더 전송'),
          h('li', null, '또는 Health Auto Export 앱의 REST API Webhook에 위 주소 그대로 입력'))),
      h('div', { class: 'pane-box' },
        h('b', null, '2. 안드로이드 · 갤럭시워치 (Health Connect)'),
        h('ol', { class: 'guide-ol' },
          h('li', null, '삼성 헬스 설정 → Health Connect 동기화 켜기'),
          h('li', null, 'MacroDroid 또는 Tasker에서 일일 트리거(아침/저녁) 생성'),
          h('li', null, 'HTTP POST 요청으로 위 로컬 주소 + X-AIHQ-Health-Token 헤더 전송'),
          h('li', null, '걸음·수면·심박·운동 중 원하는 숫자만 JSON으로 보내면 자동 합산')))),
    h('div', { style: 'margin-top:12px' },
      h('div', { class: 'small muted', style: 'margin-bottom:4px' }, '전송 JSON 예시 (원하는 항목만 보내도 됩니다)'),
      h('pre', { class: 'full', style: 'margin:0' }, sampleJson)),
    h('div', { class: 'bar', style: 'justify-content:space-between' },
      h('button', {
        type: 'button', class: 'btn sm',
        onclick: () => once('test-health', async () => {
          const r = await act('POST', '/api/ui/health', { steps: 6420, sleepHours: 7.4, restingHr: 63, exerciseMin: 35, energy: 4, source: 'test-sync' }, '테스트 헬스 데이터를 반영했어요');
          if (r) dlg.close();
        }),
      }, '샘플 데이터로 테스트'),
      h('button', { class: 'btn dark', onclick: () => dlg.close() }, '닫기')));
  dlg.showModal();
}

function pageDashboard() {
  const d = S.data;
  const today = d.tasks.filter((t) => t.date === S.today);
  const doneCnt = today.filter((t) => t.status === '완료').length;
  const pctDone = today.length ? Math.round((doneCnt / today.length) * 100) : 0;
  const workingCnt = S.working.length;
  const coolCnt = d.employees.filter(isEmpCooling).length;
  const queueCnt = d.tasks.filter((t) => t.queued && t.status !== '완료').length;
  const aiRoutines = d.routines.filter((r) => r.enabled !== false && !r.feature && r.assignee && r.assignee !== 'jay');

  const machines = d.resources.filter((r) => r.kind === '기계');
  const phones = d.resources.filter((r) => r.kind === '스마트폰' && r.status !== '꺼짐');
  const thisMac = machines.find((m) => m.isThisMac) || machines[0] || null;
  const localH = thisMac ? S.machineHealth?.[thisMac.id] : null;
  const T = S.localTelemetry || null;
  const ramPct = T?.ramPct ?? localH?.ramPct ?? null;
  const maxRamPct = thisMac?.maxRamPct || 85;
  const diskPct = T?.diskPct ?? null;
  const cpuLoadFrac = T && T.cpus ? Math.min(1, T.load1 / Math.max(1, T.cpus)) : null;

  const H = S.health || { connected: false, score: null, level: 'none', levelLabel: '연동 대기', advice: '', today: null, goals: { steps: 8000, sleepHours: 7.5, exerciseMin: 30, restingHrMax: 75 }, trend7: [] };
  const tdH = H.today || {};
  const gH = H.goals || { steps: 8000, sleepHours: 7.5, exerciseMin: 30 };
  const stepsFrac = typeof tdH.steps === 'number' ? Math.min(1, tdH.steps / Math.max(1, gH.steps)) : null;
  const sleepFrac = typeof tdH.sleepHours === 'number' ? Math.min(1, tdH.sleepHours / Math.max(1, gH.sleepHours)) : null;
  const hrNow = tdH.restingHr ?? tdH.heartRate ?? null;
  const exFrac = typeof tdH.exerciseMin === 'number' ? Math.min(1, tdH.exerciseMin / Math.max(1, gH.exerciseMin)) : (hrNow != null ? Math.min(1, Math.max(0.15, 1 - Math.max(0, hrNow - 55) / 60)) : null);

  const kpi = (label, val, sub, barPct = null, onClick = null) => h('div', { class: `dash-kpi${onClick ? ' clickable' : ''}`, onclick: onClick || undefined },
    h('span', { class: 'k-lbl' }, label),
    h('div', { class: 'k-val' }, val),
    barPct !== null ? h('div', { class: 'k-bar' }, h('i', { style: `width:${Math.min(100, Math.max(0, barPct))}%` })) : null,
    h('span', { class: 'k-sub' }, sub));

  const topoModel = buildTopologyModel();
  const topoSvg = C.companyGraph(topoModel, {
    onSelect: (node) => {
      if (node.resTab) ui.resTab = node.resTab;
      location.hash = `#${node.route || 'home'}`;
    },
  });

  const barItems = d.employees.map((e) => {
    const list = today.filter((t) => t.assignee === e.id);
    return {
      name: shortName(e.id),
      total: list.length,
      done: list.filter((t) => t.status === '완료').length,
      working: isWorking(e.id),
      cooling: isEmpCooling(e),
    };
  });

  return h('div', null,
    h('div', { class: 'head' },
      h('div', null,
        h('h1', null, h('b', null, '회사 대시보드')),
        h('div', { class: 'sub' }, `${d.settings.companyName || 'CONNECT AI HQ'} · 대표 컨디션 · AI 직원 ${d.employees.length}명 · 컴퓨터 ${machines.length}대${phones.length ? ` · 스마트폰 ${phones.length}대` : ''} · 자동 최적화 ${d.settings.autoOptimize !== false ? '켜짐' : '꺼짐'}`)),
      h('div', { class: 'row' },
        h('button', { class: 'btn sm', onclick: () => { location.hash = '#pocket'; } }, '폰 뷰'),
        h('button', { class: 'btn sm', onclick: openHealthLogModal }, '컨디션 기록'),
        h('button', { class: 'btn sm', onclick: () => load() }, '새로고침'),
        h('button', { class: 'btn sm dark', onclick: openDailyReport }, '오늘 리포트'))),
    h('div', { class: 'dash-kpis' },
      kpi('오늘 완료율', today.length ? `${pctDone}%` : '—', `완료 ${doneCnt} / 전체 ${today.length}건 · 루틴 ${aiRoutines.length}개`, pctDone),
      kpi('대표 컨디션', H.score != null ? `${H.score}점` : '연동 전', H.score != null ? `${H.levelLabel}${tdH.steps != null ? ` · ${tdH.steps.toLocaleString('ko-KR')}보` : ''}` : '클릭해 5초 기록 또는 폰 연동', H.score, openHealthLogModal),
      kpi('AI 직원 가동', `${d.employees.length}명`, workingCnt ? `근무 ${workingCnt} · 휴식 ${coolCnt}` : coolCnt ? `토큰 휴식 ${coolCnt}명` : `전원 대기 · 대기열 ${queueCnt}건`),
      kpi('본사 RAM', ramPct !== null ? `${ramPct}%` : '—', T?.availGB != null ? `여유 ${T.availGB}GB · 상한 ${maxRamPct}%` : `상한 ${maxRamPct}%`, ramPct)),
    joseonSwarmPanel(),
    h('section', { class: 'dash-card' },
      h('div', { class: 'dash-card-h' },
        h('h2', null, 'AI 회사 라이브 구조도'),
        h('span', { class: 'small muted' }, '대표 · 자동 루틴 → AI 직원(대체 순위) → AI 사무실(컴퓨터 · 스마트폰 · 브라우저)')),
      h('div', { class: 'topo-wrap' }, topoSvg)),
    h('div', { class: 'dash-grid' },
      h('section', { class: 'dash-card' },
        h('div', { class: 'dash-card-h' },
          h('div', { class: 'health-doc-badge' },
            h('button', {
              type: 'button', class: 'health-doc-btn',
              title: '클릭해 어의 허준 ↔ 의녀 대장금 전환',
              onclick: () => {
                const nextDoc = d.settings?.healthDoctor === 'daejanggeum' ? 'heojun' : 'daejanggeum';
                once('flip-doc', () => act('PATCH', '/api/ui/settings', { healthDoctor: nextDoc }, nextDoc === 'daejanggeum' ? '의녀 대장금으로 바꿨어요' : '어의 허준으로 바꿨어요'));
              },
            }, C.avatarSvg(d.settings?.healthDoctor === 'daejanggeum' ? 'daejanggeum' : 'heojun', { size: 30, state: H.score != null ? 'working' : 'idle', style: 'pixel' })),
            h('h2', null, '대표 컨디션 · 헬스 최적화')),
          h('div', { class: 'row' },
            h('button', { type: 'button', class: 'btn sm', onclick: openHealthLogModal }, '5초 기록'),
            h('button', { type: 'button', class: 'btn sm', onclick: openHealthConnectModal }, '폰 연동'))),
        h('div', { class: 'gauge-grid' },
          h('div', { class: 'gauge-box' }, C.ring(stepsFrac, { label: '오늘 걸음 수' }),
            h('div', null, h('div', { class: 'g-k' }, '오늘 걸음'), h('div', { class: 'g-v' }, typeof tdH.steps === 'number' ? `${tdH.steps.toLocaleString('ko-KR')}보` : `목표 ${(gH.steps || 8000).toLocaleString('ko-KR')}`))),
          h('div', { class: 'gauge-box' }, C.ring(sleepFrac, { label: '수면 시간' }),
            h('div', null, h('div', { class: 'g-k' }, '수면'), h('div', { class: 'g-v' }, typeof tdH.sleepHours === 'number' ? `${tdH.sleepHours}시간` : `목표 ${gH.sleepHours || 7.5}시간`))),
          h('div', { class: 'gauge-box' }, C.ring(exFrac, { label: '심박 · 운동' }),
            h('div', null, h('div', { class: 'g-k' }, '심박 · 운동'), h('div', { class: 'g-v' }, [hrNow != null ? `${hrNow}bpm` : '', typeof tdH.exerciseMin === 'number' ? `${tdH.exerciseMin}분` : ''].filter(Boolean).join(' · ') || '기록 전')))),
        C.healthChart(H.trend7 || []),
        h('div', { class: 'health-advice' },
          h('span', { class: `tag${H.delegateRecommended ? ' solid' : ''}` }, H.levelLabel),
          h('span', { class: 'small' }, H.advice))),
      h('section', { class: 'dash-card' },
        h('div', { class: 'dash-card-h' },
          h('h2', null, 'AI 사무실 리소스 · RAM 추이'),
          h('span', { class: 'small muted' }, T?.chip || '이 컴퓨터')),
        h('div', { class: 'gauge-grid' },
          h('div', { class: 'gauge-box' }, C.ring(ramPct !== null ? ramPct / 100 : null, { label: 'RAM 사용률', capFrac: maxRamPct / 100 }),
            h('div', null, h('div', { class: 'g-k' }, 'RAM'), h('div', { class: 'g-v' }, T?.availGB != null ? `${T.availGB}GB 여유` : '측정 중'))),
          h('div', { class: 'gauge-box' }, C.ring(diskPct !== null ? diskPct / 100 : null, { label: '디스크 사용률' }),
            h('div', null, h('div', { class: 'g-k' }, '디스크'), h('div', { class: 'g-v' }, T?.diskFreeGB != null ? `${T.diskFreeGB}GB 남음` : '측정 중'))),
          h('div', { class: 'gauge-box' }, C.ring(cpuLoadFrac, { label: 'CPU 부하' }),
            h('div', null, h('div', { class: 'g-k' }, 'CPU 부하'), h('div', { class: 'g-v' }, T ? `${T.load1} / ${T.cpus}코어` : '측정 중')))),
        C.ramChart(S.ramHistory || [], maxRamPct),
        h('div', { class: 'dash-m-list' },
          h('div', { class: 'dash-m-row runtime-strip' },
            h('span', { class: 'small muted' }, `런타임 안정화 · 먹통 감시 ${S.runtime?.hangWatchdogSec || 180}초`),
            h('span', { class: `tag${S.runtime?.active ? ' solid' : ''}` }, S.runtime?.active ? '잠자기 방지 작동 중' : S.runtime?.enabled ? '작업 시 잠자기 방지 대기' : '잠자기 방지 꺼짐')),
          machines.map((m) => {
            const mh = S.machineHealth?.[m.id];
            const fb = m.fallbackTo && res(m.fallbackTo) ? res(m.fallbackTo).name : null;
            return h('div', { class: 'dash-m-row' },
              h('span', null, h('b', null, m.name), m.computerUse ? h('span', { class: 'tag', style: 'margin-left:6px' }, 'CU') : null, fb ? h('span', { class: 'muted' }, ` · 바쁘면 → ${fb}`) : null),
              h('span', { class: 'row' },
                h('span', { class: 'small muted mono' }, typeof mh?.ramPct === 'number' ? `RAM ${mh.ramPct}% / ${mh.maxRamPct}%` : (m.sshAlias || m.status)),
                h('span', { class: `tag${mh?.level === 'overload' ? ' solid' : mh?.level === 'busy' ? ' dash' : ''}` }, healthLabel(mh?.level || (m.status === '꺼짐' ? 'down' : 'ok')))));
          })))),
    h('section', { class: 'dash-card', style: 'margin-top:18px' },
      h('div', { class: 'dash-card-h' },
        h('h2', null, 'AI 직원 업무 · 5시간 토큰 한도 · 근무 타임라인'),
        h('div', { class: 'wbar-legend' },
          h('span', null, h('i', { style: 'background:#111' }), '완료'),
          h('span', null, h('i', { style: 'background:#9a9a9a' }), '진행 · 대기'))),
      h('div', { class: 'dash-staff-grid' },
        h('div', null,
          barItems.length ? C.workloadBars(barItems) : h('div', { class: 'empty' }, 'AI 직원을 추가하면 업무 분포가 표시됩니다'),
          d.employees.length ? h('div', { class: 'dash-usage-list' }, d.employees.map((e) => {
            const u = S.employeeUsage?.[e.id];
            const pct = typeof u?.pct5h === 'number' ? u.pct5h : null;
            const rst = u?.resetInMin ? (u.resetInMin >= 60 ? `${Math.floor(u.resetInMin / 60)}h ${u.resetInMin % 60}m` : `${u.resetInMin}m`) : '';
            return h('div', { class: 'dash-usage-row', onclick: () => openAvatarModal(e), title: '클릭해 캐릭터 설정' },
              h('div', { class: 'row', style: 'gap:8px;min-width:0' },
                avatarEl(e, { size: 28 }),
                h('span', { class: 'u-name' }, shortName(e.id))),
              h('div', { class: 'u-right' },
                pct !== null
                  ? [
                    h('div', { class: 'ram-bar', style: 'width:76px' }, h('div', { class: `ram-fill${pct >= 80 ? ' over' : ''}`, style: `width:${Math.min(100, pct)}%` })),
                    h('span', { class: 'small mono', style: 'min-width:34px;text-align:right' }, `${pct}%`),
                    rst ? h('span', { class: 'small muted', style: 'min-width:44px;text-align:right' }, rst) : null,
                  ]
                  : h('span', { class: 'small muted' }, u?.source || '대기')));
          })) : null),
        h('div', null, timeline()))));
}

// ───────── AI 직원 캐릭터 · 5시간 토큰 바 · 스마트폰 포켓 라이브 뷰 (#pocket) ─────────

function fmtResetMin(m) {
  if (!m) return '';
  return m >= 60 ? `약 ${Math.floor(m / 60)}시간 ${m % 60}분 뒤 리셋` : `약 ${m}분 뒤 리셋`;
}

const LEGACY_AVATAR = { fox: 'dokkaebi', cat: 'haetae', owl: 'kkachi', whale: 'cheongnyong', rabbit: 'dalto', bot: 'jangseung', bear: 'bonghwang', spark: 'horangi' };
function normAvatarKey(k) { return LEGACY_AVATAR[k] || k || 'haetae'; }

function avatarEl(e, { size = 44, clickable = false, stateOverride = null, styleOverride = null, onDark = false } = {}) {
  const working = stateOverride ? stateOverride === 'working' : isWorking(e.id);
  const cooling = stateOverride ? stateOverride === 'cooling' : isEmpCooling(e);
  const state = working ? 'working' : cooling ? 'cooling' : 'idle';
  const key = normAvatarKey(e.avatar);
  const isJoseon = Boolean(window.PixelCrew?.isJoseonKey(key));
  const style = isJoseon ? 'pixel' : (styleOverride || e.avatarStyle || 'studio');
  let inner;
  if (e.avatarImage) {
    inner = h('div', { class: `avatar-img-wrap${working ? ' working' : ''}${cooling ? ' cool' : ''}`, style: `width:${size}px;height:${size}px` },
      h('img', { src: e.avatarImage, alt: `${e.name} 캐릭터`, width: size, height: size }),
      working ? h('i', { class: 'av-dot' }) : null,
      cooling ? h('span', { class: 'av-zz' }, 'zZ') : null);
  } else if (style === 'pixel' || isJoseon) {
    inner = h('div', { class: `av-px-wrap${working ? ' working' : ''}${cooling ? ' cool' : ''}${onDark ? ' on-dark' : ''}`, style: `width:${size}px;height:${size}px` },
      C.avatarSvg(key, { size, state, style: 'pixel' }),
      working ? h('i', { class: 'av-dot' }) : null,
      cooling ? h('span', { class: 'av-cool-badge' }, '휴식') : null);
  } else if (style === 'studio') {
    inner = h('div', { class: `avatar-img-wrap studio${working ? ' working' : ''}${cooling ? ' cool' : ''}`, style: `width:${size}px;height:${size}px` },
      h('img', { src: `/mascots/${key}.jpg`, alt: `${e.name} 캐릭터`, width: size, height: size, loading: 'lazy' }),
      working ? h('i', { class: 'av-dot' }) : null,
      cooling ? h('span', { class: 'av-zz' }, 'zZ') : null);
  } else {
    inner = C.avatarSvg(key, { size, state, style });
  }
  if (!clickable) return inner;
  return h('button', {
    type: 'button', class: 'avatar-btn', title: `${e.name} 캐릭터 스튜디오 열기`,
    onclick: (ev) => { ev.stopPropagation(); openAvatarModal(e); },
  }, inner);
}

function usageBarEl(e) {
  const u = S.employeeUsage?.[e.id];
  if (!u) return null;
  const pct = typeof u.pct5h === 'number' ? u.pct5h : null;
  if (pct === null && u.source === 'HQ 실행 기록') return null;
  return h('div', { class: 'usage-line' },
    pct !== null ? h('div', { class: 'ram-bar', style: 'width:82px', title: `5시간 토큰 사용량 추정 ${pct}%` },
      h('div', { class: `ram-fill${pct >= 80 ? ' over' : ''}`, style: `width:${Math.min(100, pct)}%` })) : null,
    h('span', { class: 'small muted' }, pct !== null
      ? `5시간 한도 ${pct}%${u.resetInMin ? ` · ${fmtResetMin(u.resetInMin)}` : ''}`
      : u.source),
    u.warning80 ? h('span', { class: 'tag solid' }, u.cooling ? '휴식 중' : '한도 주의') : null);
}

function resizeImageToDataUrl(file, grayscale = false) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('파일을 읽을 수 없어요.'));
    reader.onload = () => {
      // GIF 애니메이션은 180KB 이하면 움직임 그대로 유지
      if (file.type === 'image/gif' && !grayscale && String(reader.result).length <= 235000) {
        resolve(String(reader.result));
        return;
      }
      const img = new Image();
      img.onerror = () => reject(new Error('이미지가 아니에요.'));
      img.onload = () => {
        const size = 192;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;
        if (grayscale) ctx.filter = 'grayscale(100%) contrast(108%)';
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.86));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function buildAvatarPrompt(emp, vibe, prop) {
  const vibeDesc = {
    k3d: 'National Museum of Korea MU:DS x Pop Mart style ultra-cute full-color 3D matte clay vinyl toy bust figurine of a Korean traditional heritage guardian character (like baby Haetae, Dokkaebi, Kkachi with Gat, Minhwa tiger, Cheongnyong, or Jangseung), Korean pastel Obangsaek colors',
    '3d': 'Pop Mart x Pixar style ultra-cute full-color 3D matte clay vinyl toy bust figurine, soft pastel studio lighting',
    illust: 'Warm editorial Korean Minhwa & kawaii full-color character illustration, clean soft outlines, rosy cheeks, cheerful pastel palette',
    pixel: 'Cute vibrant 16-bit full-color retro pixel art Korean heritage character portrait, crisp pixel edges, pastel studio background',
  }[vibe] || 'ultra-cute full-color 3D chibi vinyl toy bust portrait';
  const roleHint = emp.role ? `representing the AI role: "${emp.role}"` : 'for a 1-person AI company teammate';
  const propHint = prop ? `, holding or wearing: ${prop}` : '';
  return `1:1 square centered bust portrait for CONNECT AI LAB, ${roleHint}${propHint}. Style: ${vibeDesc}. Joyful big glossy kawaii eyes, rosy cheeks, vibrant harmonious colors, clean solid soft pastel Hanji background with generous padding, zero text, zero watermark.`;
}

function openAvatarModal(e, opts = {}) {
  const dlg = document.getElementById('dlg');
  dlg.className = 'wide';
  const presets = S.options.avatarPresets || [];
  const teams = S.options.teams || [];
  const packs = S.options.avatarPacks || [
    { key: 'joseon', name: '조선 AI 집현전 (남·여 직업군)' },
    { key: 'k-crew', name: 'K-수호 크루 (한국 전통)' },
    { key: 'modern', name: '모던 랩 크루' },
  ];
  const styles = S.options.avatarStyles || [
    { key: 'studio', name: '스튜디오 3D', hint: 'CONNECT AI LAB 컬러 3D 피규어' },
    { key: 'motion', name: '코딩 모션', hint: '눈 깜빡임 · 호흡 · 타자 컬러 모션' },
    { key: 'pixel', name: '픽셀 펫', hint: '16비트 도트 모션 (일함 초록불 · 대기 Z)' },
    { key: 'flat', name: '컬러 미니멀', hint: '깔끔한 컬러 플랫' },
  ];
  let pickedKey = normAvatarKey(e.avatar);
  let pickedStyle = e.avatarStyle || 'studio';
  let pickedTeam = e.team || 'ops';
  let customImg = e.avatarImage || '';
  let pickedTab = opts.tab || (customImg ? 'custom' : (presets.find((p) => p.key === pickedKey)?.pack || 'k-crew'));
  let previewState = 'working';
  let genVibe = 'k3d';
  const avatarNameIn = h('input', { class: 'in', value: e.avatarName || '', placeholder: `예: 장영실 팀장 · 보부상 과장 (비우면 ${e.name})`, maxlength: '40', 'data-k': 'av-name' });
  const personaIn = h('input', { class: 'in', value: e.persona || '', placeholder: '예: 해시계·자동화 담당 · 밤새 갓 쓰고 기획', maxlength: '80', 'data-k': 'av-persona' });
  const teamSel = h('select', { class: 'in', 'aria-label': '소속 팀(부서)' }, teams.map((t) => h('option', { value: t.key, selected: t.key === pickedTeam }, t.name)));
  teamSel.addEventListener('change', () => { pickedTeam = teamSel.value; });
  const propIn = h('input', { class: 'in sm', placeholder: '추가 소품 (선택, 예: 복주머니, 갓, 노트북, 붓)' });
  const grayChk = h('input', { type: 'checkbox', checked: false });
  const previewWrap = h('div', { class: 'av-preview-bar' });
  const packBar = h('div', { class: 'picker' });
  const styleBar = h('div', { class: 'picker' });
  const bodyWrap = h('div');
  const promptPre = h('pre', { class: 'full', style: 'margin:8px 0 0;font-size:11px;max-height:110px' });

  const syncPrompt = () => { promptPre.textContent = buildAvatarPrompt(e, genVibe, propIn.value.trim()); };
  propIn.addEventListener('input', syncPrompt);
  avatarNameIn.addEventListener('input', () => renderPreview());

  const fileIn = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', style: 'display:none' });
  const applyImageFile = async (f, fromPaste = false) => {
    if (!f) return;
    try {
      customImg = await resizeImageToDataUrl(f, grayChk.checked);
      pickedTab = 'custom';
      renderPackBar();
      renderStyleBar();
      renderBody();
      renderPreview();
      toast(fromPaste ? '붙여넣은 이미지를 캐릭터로 적용했어요' : '캐릭터 이미지를 적용했어요');
    } catch (err) {
      toast(err.message || '이미지 처리 오류');
    }
  };
  fileIn.addEventListener('change', () => { const f = fileIn.files?.[0]; fileIn.value = ''; applyImageFile(f, false); });

  const onPaste = (ev) => {
    if (!dlg.open) return;
    const items = ev.clipboardData?.items || [];
    for (const it of items) {
      if (it.kind === 'file' && /^image\/(png|jpeg|webp|gif)$/.test(it.type)) {
        ev.preventDefault();
        applyImageFile(it.getAsFile(), true);
        return;
      }
    }
  };
  window.addEventListener('paste', onPaste);
  const closeDlg = () => {
    window.removeEventListener('paste', onPaste);
    dlg.className = '';
    if (dlg.open) dlg.close();
  };
  dlg.addEventListener('close', () => window.removeEventListener('paste', onPaste), { once: true });

  const vibeBtns = [['k3d', 'K-전통 3D 피규어'], ['3d', '모던 3D 피규어'], ['illust', '한국 민화 일러스트'], ['pixel', '컬러 픽셀']].map(([vk, vl]) => h('button', {
    type: 'button', class: `chip sm${genVibe === vk ? ' on' : ''}`,
    onclick: (ev) => {
      genVibe = vk;
      for (const b of ev.currentTarget.parentElement.children) b.classList.toggle('on', b === ev.currentTarget);
      syncPrompt();
    },
  }, vl));

  const aiPromptBox = h('details', { class: 'pack-box', style: 'margin-top:10px' },
    h('summary', null, 'AI로 나만의 캐릭터 이미지 생성하기 (프롬프트 1클릭 복사 → ⌘V 바로 적용)'),
    h('div', { style: 'margin-top:10px;display:flex;flex-direction:column;gap:8px' },
      h('div', { class: 'picker' }, vibeBtns),
      propIn,
      promptPre,
      h('div', { class: 'row', style: 'justify-content:space-between;flex-wrap:wrap;gap:8px;margin-top:4px' },
        h('div', { class: 'row' },
          h('a', { class: 'btn sm', href: 'https://gemini.google.com/app', target: '_blank', rel: 'noopener noreferrer' }, 'Gemini 열기 ↗'),
          h('a', { class: 'btn sm', href: 'https://chatgpt.com/', target: '_blank', rel: 'noopener noreferrer' }, 'ChatGPT 열기 ↗')),
        h('button', { type: 'button', class: 'btn sm dark', onclick: async () => { await copyText(promptPre.textContent); toast('이미지 생성 프롬프트를 복사했어요'); } }, '프롬프트 복사'))));

  const renderPackBar = () => {
    const tabs = [...packs, { key: 'custom', name: '직접 만들기 (내 이미지)' }];
    packBar.replaceChildren(...tabs.map((pk) => h('button', {
      type: 'button', class: `chip${pickedTab === pk.key ? ' on' : ''}`, 'data-tab': pk.key,
      onclick: () => {
        pickedTab = pk.key;
        if (pk.key !== 'custom') {
          const firstInPack = presets.find((p) => p.pack === pk.key);
          if (firstInPack && presets.find((p) => p.key === pickedKey)?.pack !== pk.key) pickedKey = firstInPack.key;
          if (pk.key === 'joseon') pickedStyle = 'pixel';
          customImg = '';
        }
        renderPackBar();
        renderStyleBar();
        renderBody();
        renderPreview();
      },
    }, pk.name)));
  };

  const renderStyleBar = () => {
    if (pickedTab === 'custom' || pickedTab === 'joseon') { styleBar.replaceChildren(); return; }
    styleBar.replaceChildren(...styles.map((st) => h('button', {
      type: 'button', class: `chip sm${pickedStyle === st.key ? ' on' : ''}`,
      onclick: () => {
        pickedStyle = st.key;
        customImg = '';
        renderStyleBar();
        renderBody();
        renderPreview();
      },
    }, st.name)));
  };

  const renderPreview = () => {
    const customName = avatarNameIn.value.trim();
    const displayName = customName || e.name;
    const fakeEmp = { ...e, name: displayName, avatar: pickedKey, avatarStyle: pickedStyle, avatarImage: customImg };
    const stObj = styles.find((x) => x.key === pickedStyle);
    const prObj = presets.find((x) => x.key === pickedKey);
    const pkObj = packs.find((x) => x.key === pickedTab);
    const stateBtns = [['idle', '대기'], ['working', '근무 중'], ['cooling', '휴식']].map(([sk, sl]) => h('button', {
      type: 'button', class: `chip sm${previewState === sk ? ' on' : ''}`,
      onclick: () => { previewState = sk; renderPreview(); },
    }, sl));
    previewWrap.replaceChildren(
      h('div', { class: 'row', style: 'gap:14px;align-items:center;min-width:0' },
        avatarEl(fakeEmp, { size: 64, stateOverride: previewState, styleOverride: pickedStyle }),
        h('div', { style: 'min-width:0' },
          h('div', { class: 'row', style: 'gap:6px;flex-wrap:wrap' },
            h('span', { style: 'font-weight:600;font-size:15px' }, displayName),
            customName && customName !== e.name ? h('span', { class: 'tag' }, e.name) : null),
          h('div', { class: 'small muted', style: 'margin-top:2px' }, customImg ? '직접 올린 내 캐릭터 이미지 · GIF' : `${prObj?.name || pickedKey} · ${stObj?.name || pickedStyle}`),
          h('div', { class: 'row', style: 'gap:5px;margin-top:6px' }, h('span', { class: 'small muted' }, '모션'), stateBtns))),
      pickedTab !== 'custom' ? h('button', {
        type: 'button', class: 'btn sm',
        title: '모든 AI 직원에게 이 팩과 스타일을 한 번에 적용합니다',
        onclick: () => once('all-av-style', async () => {
          await act('POST', '/api/ui/employees/avatar-style', { avatarStyle: pickedStyle, pack: pickedTab }, `전체 직원을 "${pkObj?.name || pickedTab} · ${stObj?.name || pickedStyle}"로 맞췄어요`);
        }),
      }, '전체 직원 통일') : null);
  };

  const renderBody = () => {
    if (pickedTab !== 'custom') {
      const visible = presets.filter((p) => (p.pack || 'k-crew') === pickedTab);
      const grid = h('div', { class: 'avatar-grid' }, visible.map((p) => {
        const fake = { id: `pre-${p.key}`, name: p.name, avatar: p.key, avatarStyle: pickedStyle, avatarImage: '' };
        return h('button', {
          type: 'button', class: `avatar-opt${!customImg && pickedKey === p.key ? ' on' : ''}`,
          onclick: () => {
            pickedKey = p.key;
            if (p.pack === 'joseon') {
              pickedStyle = 'pixel';
              if (p.team && teams.some((t) => t.key === p.team)) { pickedTeam = p.team; teamSel.value = p.team; }
            }
            customImg = '';
            renderBody();
            renderPreview();
          },
        }, avatarEl(fake, { size: 46, stateOverride: p.pack === 'joseon' ? 'working' : 'idle', styleOverride: p.pack === 'joseon' ? 'pixel' : pickedStyle }), h('b', null, p.name), h('span', { class: 'small muted' }, p.hint));
      }));
      bodyWrap.replaceChildren(
        grid,
        h('div', { class: 'bp-bar' },
          h('span', { class: 'small muted' }, '직접 만든 그림·사진·GIF로 바꾸고 싶다면?'),
          h('button', { type: 'button', class: 'btn sm', onclick: () => { pickedTab = 'custom'; renderPackBar(); renderStyleBar(); renderBody(); renderPreview(); } }, '내 이미지 올리기 →')));
      return;
    }

    const saved = S.data.settings?.customAvatars || [];
    const dropzone = h('div', {
      class: `av-dropzone${customImg ? ' has-img' : ''}`,
      tabindex: '0',
      role: 'button',
      'aria-label': '캐릭터 이미지 올리기 (클릭, 드래그 앤 드롭, 붙여넣기)',
      onclick: () => fileIn.click(),
      onkeydown: (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); fileIn.click(); } },
    },
    customImg
      ? h('img', { src: customImg, alt: '올린 캐릭터 미리보기', class: 'av-drop-thumb' })
      : h('div', { class: 'av-drop-ic', 'aria-hidden': 'true' }, '+'),
    h('div', { class: 'av-drop-txt' },
      h('b', null, customImg ? '이미지 적용됨 · 클릭하거나 새 파일을 끌어다 놓아 교체' : '내 캐릭터 이미지 · GIF 올리기'),
      h('span', { class: 'small muted' }, '클릭, 드래그&드롭, 또는 이미지 복사 후 ⌘V 붙여넣기 (PNG · JPG · WebP · GIF)')));

    dropzone.addEventListener('dragover', (ev) => { ev.preventDefault(); dropzone.classList.add('over'); });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('over'));
    dropzone.addEventListener('drop', (ev) => {
      ev.preventDefault();
      dropzone.classList.remove('over');
      const f = ev.dataTransfer?.files?.[0];
      if (f) applyImageFile(f, false);
    });

    const saveToLibBtn = h('button', {
      type: 'button', class: 'btn sm dark', disabled: !customImg,
      onclick: () => once('save-cav', async () => {
        const nm = avatarNameIn.value.trim();
        if (!nm) { avatarNameIn.focus(); toast('보관함에 저장할 캐릭터 이름을 먼저 적어 주세요'); return; }
        if (!customImg) { toast('먼저 캐릭터 이미지를 올려 주세요'); return; }
        const created = await act('POST', '/api/ui/avatars', { name: nm, image: customImg, hint: personaIn.value.trim() }, `"${nm}"을(를) 내 캐릭터 보관함에 저장했어요`);
        if (created) renderBody();
      }),
    }, '내 보관함에 저장');

    const libSec = saved.length ? h('div', { style: 'margin-top:12px' },
      h('div', { class: 'row', style: 'justify-content:space-between;margin-bottom:6px' },
        h('span', { class: 'small', style: 'font-weight:600' }, `내 캐릭터 보관함 (${saved.length}/16)`),
        h('span', { class: 'small muted' }, '클릭하면 이름과 이미지가 함께 적용돼요')),
      h('div', { class: 'av-custom-grid' }, saved.map((c) => h('div', { class: `av-custom-item${customImg === c.image ? ' on' : ''}` },
        h('button', {
          type: 'button', class: 'av-custom-pick',
          onclick: () => {
            customImg = c.image;
            avatarNameIn.value = c.name;
            if (c.hint && !personaIn.value.trim()) personaIn.value = c.hint;
            renderBody();
            renderPreview();
          },
        },
        h('img', { src: c.image, alt: c.name, width: 44, height: 44 }),
        h('b', null, c.name),
        c.hint ? h('span', { class: 'small muted clamp' }, c.hint) : null),
        h('button', {
          type: 'button', class: 'av-custom-del', title: '보관함에서 삭제', 'aria-label': `${c.name} 삭제`,
          onclick: (ev) => {
            ev.stopPropagation();
            once(`del-cav-${c.id}`, async () => {
              await act('DELETE', `/api/ui/avatars/${c.id}`, undefined, `"${c.name}"을(를) 보관함에서 뺐어요`);
              renderBody();
            });
          },
        }, '×'))))) : null;

    bodyWrap.replaceChildren(
      dropzone,
      h('div', { class: 'bp-bar' },
        h('div', { class: 'row' },
          h('button', { type: 'button', class: 'btn sm', onclick: () => fileIn.click() }, '파일 선택'),
          h('label', { class: 'chk-l small' }, grayChk, '흑백 필터')),
        h('div', { class: 'row' },
          customImg ? h('button', { type: 'button', class: 'btn link', onclick: () => { customImg = ''; renderBody(); renderPreview(); } }, '이미지 비우기') : null,
          saveToLibBtn)),
      libSec,
      aiPromptBox);
  };

  renderPackBar();
  renderStyleBar();
  renderBody();
  renderPreview();
  syncPrompt();

  setDlg(dlg,
    h('h3', null, `${shortName(e.id)} · CONNECT AI LAB 캐릭터 스튜디오`),
    h('p', { class: 'small muted', style: 'margin:-6px 0 10px' }, '한국 전통 K-수호 크루·모던 크루 중에서 고르거나, 직접 이름과 내 이미지를 넣어 나만의 AI 직원을 만드세요.'),
    fileIn,
    previewWrap,
    h('div', { class: 'grid2', style: 'margin-bottom:12px' },
      h('label', { class: 'field' }, '캐릭터 이름 · 호칭 (선택)', avatarNameIn),
      h('label', { class: 'field' }, '소속 팀 (부서)', teamSel)),
    h('div', { style: 'margin-bottom:12px' },
      h('label', { class: 'field' }, '한 줄 소개 (폰 뷰에 표시, 선택)', personaIn)),
    h('div', { class: 'row', style: 'justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:10px' }, packBar, styleBar),
    bodyWrap,
    h('div', { class: 'bar' },
      h('button', { class: 'btn', onclick: closeDlg }, '취소'),
      h('button', { class: 'btn dark', onclick: () => once(`av-${e.id}`, async () => {
        const nextAvatarName = avatarNameIn.value.trim();
        const label = nextAvatarName || e.name;
        closeDlg();
        await act('PATCH', `/api/ui/employees/${e.id}`, {
          avatar: pickedKey,
          avatarStyle: pickedStyle,
          team: pickedTeam,
          avatarName: nextAvatarName,
          avatarImage: customImg,
          persona: personaIn.value.trim(),
        }, `${label} 캐릭터를 저장했어요`);
      }) }, '저장')));
  dlg.showModal();
}

function pagePocket() {
  const d = S.data;
  const today = d.tasks.filter((t) => t.date === S.today);
  const doneCnt = today.filter((t) => t.status === '완료').length;
  const H = S.health || {};
  const thisMac = d.resources.find((r) => r.kind === '기계' && r.isThisMac) || d.resources.find((r) => r.kind === '기계');
  const localH = thisMac ? S.machineHealth?.[thisMac.id] : null;
  const ramPct = S.localTelemetry?.ramPct ?? localH?.ramPct ?? null;
  const pendingApprs = d.approvals.filter((a) => a.status === '대기');
  const pendingGates = today.filter((t) => t.gate && !t.gateApprovedAt && t.status !== '완료' && t.assignee !== 'jay');

  const pickEmpId = ui.pocketPick || (d.employees[0]?.id || 'jay');
  const cmdIn = h('input', { class: 'in', placeholder: '폰에서 바로 일 시키기 (예: 오늘 댓글 요약해 줘)', 'data-k': 'pocket-cmd', 'aria-label': '빠른 지시' });
  const sendCmd = () => submitInput(cmdIn, 'pocket-add', async (v) => {
    const r = await act('POST', '/api/ui/tasks', { title: v, assignee: pickEmpId });
    if (r) {
      toast(r.autoStarted ? `${shortName(r.assignee)}이(가) 바로 작업을 시작했어요` : r.gate ? `${r.gate} 확인이 필요해 승인 대기 중이에요` : `${shortName(r.assignee)}에게 맡겼어요`);
    }
    return r;
  });
  cmdIn.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && !ev.isComposing) sendCmd(); });

  return h('div', { class: 'pocket' },
    h('div', { class: 'pocket-head' },
      h('div', null,
        h('div', { class: 'pocket-title' }, d.settings.companyName || 'CONNECT AI HQ'),
        h('div', { class: 'small muted' }, `${d.owner.name || '대표'}의 삶과 AI 일을 최적화하는 주머니 속 본사 · 완료 ${doneCnt}/${today.length}`)),
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn sm', onclick: () => { location.hash = '#dashboard'; } }, '대시보드'),
        h('button', { type: 'button', class: 'btn sm dark', onclick: openHealthLogModal }, '컨디션'))),
    h('div', { class: 'pocket-pills' },
      h('div', { class: 'pocket-pill', onclick: openHealthLogModal },
        h('span', { class: 'small muted' }, '대표 컨디션'),
        h('b', null, H.score != null ? `${H.score}점` : '기록 전')),
      h('div', { class: 'pocket-pill', onclick: () => { location.hash = '#resources'; } },
        h('span', { class: 'small muted' }, '본사 RAM'),
        h('b', null, ramPct != null ? `${ramPct}%` : '—')),
      h('div', { class: 'pocket-pill' },
        h('span', { class: 'small muted' }, '안정화'),
        h('b', null, S.runtime?.active ? '절전방지 ON' : '감시 ON'))),
    h('section', { class: 'pocket-sec' },
      h('div', { class: 'pocket-sec-h' },
        h('b', null, `내 AI 직원 (${d.employees.length}명)`),
        h('span', { class: 'small muted' }, '캐릭터 탭 · 이름·이미지 자유 설정')),
      h('div', { class: 'picker' },
        (S.options.avatarPacks || []).map((pk) => {
          const packKeys = new Set((S.options.avatarPresets || []).filter((p) => p.pack === pk.key).map((p) => p.key));
          const isPack = d.employees.length > 0 && d.employees.every((x) => !x.avatarImage && packKeys.has(normAvatarKey(x.avatar)));
          return h('button', {
            type: 'button', class: `chip sm${isPack ? ' on' : ''}`,
            onclick: () => once(`ppack-${pk.key}`, () => act('POST', '/api/ui/employees/avatar-style', { pack: pk.key }, `${pk.name}으로 바꿨어요`)),
          }, pk.key === 'k-crew' ? '한국 전통' : '모던 크루');
        }),
        (S.options.avatarStyles || []).map((st) => {
          const allSame = d.employees.length > 0 && d.employees.every((x) => (x.avatarStyle || 'studio') === st.key && !x.avatarImage);
          return h('button', {
            type: 'button', class: `chip sm${allSame ? ' on' : ''}`,
            onclick: () => once(`pstyle-${st.key}`, () => act('POST', '/api/ui/employees/avatar-style', { avatarStyle: st.key }, `캐릭터를 ${st.name} 스타일로 바꿨어요`)),
          }, st.name);
        }),
        d.employees.length ? h('button', {
          type: 'button', class: 'chip sm',
          onclick: () => openAvatarModal(emp(pickEmpId) || d.employees[0], { tab: 'custom' }),
        }, '+ 내 이미지·이름') : null),
      h('div', { class: 'pocket-grid' }, d.employees.map((e) => {
        const w = S.working.find((x) => x.emp === e.id);
        const cooling = isEmpCooling(e);
        const coolMin = empCooldownMin(e);
        const cnt = today.filter((t) => t.assignee === e.id && t.status !== '완료').length;
        const u = S.employeeUsage?.[e.id];
        const pct = typeof u?.pct5h === 'number' ? u.pct5h : null;
        return h('div', { class: `pocket-card${w ? ' working' : ''}${cooling ? ' cool' : ''}` },
          h('div', { class: 'pocket-card-top' },
            avatarEl(e, { size: 52, clickable: true }),
            h('span', { class: `tag${w || cooling ? ' solid' : ''}` }, w ? '근무 중' : cooling ? `휴식 ${coolMin}m` : cnt ? `오늘 ${cnt}` : '대기')),
          h('div', { class: 'pocket-name', title: e.avatarName && e.avatarName !== e.name ? `${e.avatarName} · ${e.name}` : e.name }, shortName(e.id)),
          h('div', { class: 'pocket-sub' }, w?.statusLine || e.persona || e.role || ENGINE_LABEL[e.engine]),
          pct !== null ? h('div', { class: 'pocket-meter' },
            h('div', { class: 'ram-bar', style: 'flex:1;width:auto' }, h('div', { class: `ram-fill${pct >= 80 ? ' over' : ''}`, style: `width:${Math.min(100, pct)}%` })),
            h('span', { class: 'mono', style: 'font-size:10px' }, `${pct}%`)) : null,
          h('div', { class: 'pocket-acts' },
            h('button', { type: 'button', class: `chip sm${pickEmpId === e.id ? ' on' : ''}`, onclick: () => { ui.pocketPick = e.id; render(); cmdIn.focus(); } }, '지시'),
            cooling
              ? h('button', { type: 'button', class: 'chip sm', onclick: () => act('POST', `/api/ui/employees/${e.id}/cooldown`, { minutes: 0 }, `${shortName(e.id)} 복귀`) }, '복귀')
              : h('button', { type: 'button', class: 'chip sm', onclick: () => openCooldownModal(e) }, '휴식')));
      }))),
    (pendingApprs.length || pendingGates.length) ? h('section', { class: 'pocket-sec' },
      h('div', { class: 'pocket-sec-h' }, h('b', null, `대표 확인 대기 (${pendingApprs.length + pendingGates.length}건)`)),
      pendingGates.map((t) => h('div', { class: 'pocket-appr' },
        h('div', null, h('div', { style: 'font-weight:600;font-size:13px' }, t.title), h('div', { class: 'small muted' }, `${shortName(t.assignee)} · ${t.gate} 확인 필요`)),
        h('button', { type: 'button', class: 'btn sm dark', onclick: () => act('POST', `/api/ui/tasks/${t.id}/approve-gate`, {}, '승인했어요') }, '승인'))),
      pendingApprs.map((a) => h('div', { class: 'pocket-appr' },
        h('div', null, h('div', { style: 'font-weight:600;font-size:13px' }, a.title || a.kind), h('div', { class: 'small muted' }, a.summary || a.body || '')),
        h('button', { type: 'button', class: 'btn sm dark', onclick: () => act('POST', `/api/ui/approvals/${a.id}/decide`, { decision: '승인' }, '승인했어요') }, '승인')))) : null,
    h('section', { class: 'pocket-cmd' },
      h('div', { class: 'small muted', style: 'margin-bottom:6px' }, `받는 직원: `, h('b', null, shortName(pickEmpId))),
      h('div', { class: 'row' }, cmdIn, h('button', { type: 'button', class: 'btn dark', onclick: sendCmd }, '보내기'))));
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
        h('span', { class: 'tag' }, `직원 스킬 ${bp.summary?.employeeSkills || 0}개`),
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
      if (a.skills) sum.push(`직원 스킬 ${a.skills}`);
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
  const title = h('input', { class: 'in', placeholder: '예: 이메일 체크, 8시 영상 편집 (아래에서 담당 직접 선택 · 컴퓨터는 자동 최적화)', 'data-k': 'rt-title', 'aria-label': '자동 루틴' });
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
          h('button', { class: 'x', 'aria-label': `${r.title} 지우기`, onclick: () => { if (confirm(`이 루틴을 지울까요?\n${r.title}`)) act('DELETE', `/api/ui/routines/${r.id}`, undefined, '지웠어요'); } }, '×'))),
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
    h('div', { class: 'head' }, h('div', null, h('h1', null, h('b', null, '자동 루틴')),
      h('div', { class: 'sub' }, '정해진 시각 또는 5분~1시간 간격으로 AI가 프롬프트대로 반복 실행합니다.')),
    h('div', { class: 'row' },
      h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: d.settings.alarmsEnabled, onchange: (ev) => act('PATCH', '/api/ui/settings', { alarmsEnabled: ev.target.checked }, ev.target.checked ? '알람을 켰어요' : '알람을 껐어요') }), h('span', { class: 'tr' }), h('b', null, '알람')),
      h('button', { class: 'btn sm', onclick: () => act('POST', '/api/ui/alarms/test', {}, '시험 알림을 보냈어요') }, '알림 시험'),
      h('button', { class: 'btn sm', onclick: openBlueprintExport }, '청사진 공유'))),
    addBarEl,
    whoBar,
    h('div', { style: 'margin-top:10px' }, days),
    packBox,
    h('section', { class: 'sec' }, secHead('AI 자동 루틴', `${ais.length}개 · 시간이나 주기마다 AI가 실행합니다`), ais.length ? h('ul', { class: 'routines' }, ais.map(row)) : h('div', { class: 'empty' }, '없습니다. 위에서 담당 AI를 골라 추가하거나 실습 루틴 팩을 담아 보세요.')),
    h('section', { class: 'sec' }, secHead('대표 루틴 (알람)', `${people.length}개 · 알람은 정한 시각에 이 컴퓨터에 뜹니다`), people.length ? h('ul', { class: 'routines' }, people.map(row)) : h('div', { class: 'empty' }, '없습니다')));
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
    const channels = accessChannelsOf(e);
    const workJob = S.working.find((w) => w.emp === e.id);
    const tInfo = empTeamInfo(e);
    return h('div', { class: 'card' },
      h('div', { class: 'row', style: 'justify-content:space-between;align-items:flex-start' },
        h('div', { class: 'row', style: 'gap:12px;align-items:flex-start;min-width:0' },
          avatarEl(e, { size: 46, clickable: true }),
          h('div', { style: 'min-width:0' },
            h('h3', null,
              e.avatarName || e.name,
              e.avatarName && e.avatarName !== e.name ? h('span', { class: 'tag', style: 'margin-left:6px' }, e.name) : null,
              h('span', { class: `team-pill tm-${tInfo.key}`, title: tInfo.hint }, h('i'), tInfo.short),
              h('span', { class: 'emp-id', title: 'CLI · MCP 직원 아이디' }, e.id)),
            e.persona ? h('div', { class: 'small', style: 'color:var(--ink-2);margin-top:2px' }, e.persona) : null,
            h('div', { class: 'small muted' }, workJob?.statusLine ? `진행 중: ${workJob.statusLine}` : how),
            modelLine(e))),
        cooling ? h('span', { class: 'tag solid', title: e.cooldownReason || '토큰 한도 휴식 중' }, `토큰 휴식 · ${coolMin}분`)
          : workJob ? h('span', { class: 'tag solid' }, '일하는 중') : today.length ? h('span', { class: 'tag' }, `오늘 ${today.length}`) : null),
      usageBarEl(e),
      channels.length ? h('div', { class: 'access-badges' }, channels.map((c) => h('span', { class: 'tag' }, c))) : null,
      h('dl', { class: 'kv' },
        h('dt', null, '역할'), h('dd', null, valOr(e.role, 'role')),
        h('dt', null, '스킬 · GitHub'), h('dd', null, skillPillsEl(e, { max: 5 })),
        h('dt', null, '도구'), h('dd', null, valOr(e.tools.join(', '), 'tools')),
        h('dt', null, '업무 매뉴얼'), h('dd', null, e.manual ? h('span', { class: 'clamp2' }, e.manual) : valOr('', 'manual')),
        h('dt', null, '막히면 대체'), h('dd', null, e.fallbackTo && emp(e.fallbackTo) ? `${shortName(e.fallbackTo)} (토큰 소진 시 자동 전환)` : h('button', { class: 'input-me', onclick: () => openEdit('fallbackTo') }, '자동 선택')),
        h('dt', null, '월급'), h('dd', null, e.salary === null || e.salary === undefined ? valOr('', 'salary') : e.salary === 0 ? '무료' : `월 ${won(e.salary)}`),
        h('dt', null, '리소스'), h('dd', null, e.resources.length ? e.resources.map((id) => res(id)?.name).filter(Boolean).join(', ') : valOr('', 'res')),
        h('dt', null, '근무'), h('dd', null, [e.runsOn, e.command].filter(Boolean).join(' · ') || valOr('', 'runsOn'))),
      h('div', { class: 'foot' },
        ['none', 'web'].includes(e.engine) ? h('span', { class: 'small muted' }, e.engine === 'web' ? '할 일에서 복사해서 맡겨요' : 'MCP, CLI 로 스스로 보고') : runSeg,
        h('div', { class: 'row' },
          h('button', { class: 'btn sm', onclick: () => openEmployeeSkillsModal(e.id) }, `스킬${e.skills?.length ? ` (${e.skills.length})` : ''}`),
          h('button', { class: 'btn sm', onclick: () => openAvatarModal(e) }, '캐릭터'),
          coolBtn,
          h('button', { class: 'btn sm', onclick: () => { ui.editingEmp = e.id; ui.empDraftEngine[e.id] = e.engine; render(); } }, '편집'))));
  }
  const curEng = ui.empDraftEngine[e.id] ?? e.engine;
  if (curEng === 'local') ensureModels();
  const k = (f) => `emp-${f}-${e.id}`;
  const assignableRes = S.data.resources.filter((r) => ['기계', '멤버십', '폴더'].includes(r.kind));
  const resBoxes = assignableRes.map((r) => h('label', { class: 'chk-l' }, h('input', { type: 'checkbox', value: r.id, checked: e.resources.includes(r.id), class: 'res-box', 'data-k': `emp-res-${e.id}-${r.id}` }), `${r.name}`));
  const f = {
    name: h('input', { class: 'in sm', value: e.name, 'data-k': k('name') }),
    avatarName: h('input', { class: 'in sm', value: e.avatarName || '', placeholder: '비우면 AI 이름 그대로 표시', maxlength: '40', 'data-k': k('avatarName') }),
    team: h('select', { class: 'in sm', 'data-k': k('team') }, (S.options.teams || []).map((t) => h('option', { value: t.key, selected: (e.team || 'ops') === t.key }, t.name))),
    role: h('input', { class: 'in sm', value: e.role, 'data-k': k('role') }),
    tools: h('input', { class: 'in sm', value: e.tools.join(', '), placeholder: '쉼표로 구분', 'data-k': k('tools') }),
    runsOn: h('input', { class: 'in sm', value: e.runsOn, 'data-k': k('runsOn') }),
    command: h('input', { class: 'in sm', value: e.command, 'data-k': k('command') }),
    salary: h('input', { class: 'in sm', value: e.salary === null || e.salary === undefined ? '' : String(e.salary), inputmode: 'numeric', placeholder: '원 단위, 무료는 0', 'data-k': k('salary') }),
    fallbackTo: h('select', { class: 'in sm', 'data-k': k('fallbackTo') },
      h('option', { value: '' }, '자동으로 여유 AI 선택'),
      S.data.employees.filter((x) => x.id !== e.id).map((x) => h('option', { value: x.id, selected: e.fallbackTo === x.id }, `${shortName(x.id)} (${x.id})`))),
    engine: h('select', { class: 'in sm', 'data-k': k('engine'), onchange: (ev) => { ui.empDraftEngine[e.id] = ev.target.value; render(); } },
      [['web', '복사해서 맡기기 (ChatGPT, Claude, Gemini, Dots, Muse 등)'], ['local', '로컬 모델 (이 컴퓨터 안에서 바로 답)'],
        ['claude', `Claude Code (${S.runners.claude ? '이 컴퓨터에 설치됨' : '이 컴퓨터에 없음'})`], ['codex', `Codex (${S.runners.codex ? '이 컴퓨터에 설치됨' : '이 컴퓨터에 없음'})`],
        ['gemini', `Gemini CLI (${S.runners.gemini ? '이 컴퓨터에 설치됨' : '이 컴퓨터에 없음'})`],
        ['agy', `Antigravity (agy) (${S.runners.agy ? '이 컴퓨터에 설치됨' : '이 컴퓨터에 없음'})`],
        ['opencode', `OpenCode (${S.runners.opencode ? '이 컴퓨터에 설치됨' : '이 컴퓨터에 없음'})`],
        ['none', '스스로 보고 (MCP, CLI 로 연결한 AI)']].map(([v, t]) => h('option', { value: v, selected: curEng === v }, t))),
    webUrl: h('input', { class: 'in sm', value: e.webUrl || '', placeholder: 'https://', 'data-k': k('webUrl') }),
    model: h('select', { class: 'in sm', 'data-k': k('model') }, h('option', { value: '' }, ui.models && ui.models.length ? '모델 고르기' : '로컬 모델을 찾는 중이거나 없음'),
      (ui.models || []).map((m) => h('option', { value: m.id, selected: e.model === m.id }, `${m.label}${m.size ? ` · ${m.size}` : ''}`))),
    manual: h('textarea', { class: 'in', rows: 6, 'data-k': k('manual'), placeholder: '이 직원이 일하는 방식, 말투, 하지 말아야 할 것' }, e.manual || ''),
  };
  const fld = (label, el) => h('label', { class: 'field' }, label, el);
  const save = async () => {
    const r = await act('PATCH', `/api/ui/employees/${e.id}`, {
      name: f.name.value.trim() || e.name,
      avatarName: f.avatarName.value.trim(),
      team: f.team.value,
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
    h('h3', null, `${shortName(e.id)} 편집`, h('span', { class: 'emp-id' }, e.id)),
    h('div', { class: 'f-grid' }, fld('AI 서비스 이름', f.name), fld('캐릭터 이름 · 호칭 (선택)', f.avatarName), fld('소속 팀 (부서)', f.team), fld('역할', f.role), fld('도구', f.tools), fld('근무 위치', f.runsOn), fld('명령 방법', f.command), fld('월급 (월, 원)', f.salary), fld('막히면 대신할 AI (토큰 소진 시)', f.fallbackTo), fld('일 시키는 방법', f.engine), curEng === 'local' ? fld('로컬 모델', f.model) : null, curEng === 'web' ? fld('열 주소 (선택)', f.webUrl) : null),
    assignableRes.length ? h('div', { style: 'margin-top:16px' }, h('div', { class: 'small', style: 'color:#555;margin-bottom:6px' }, '쓸 수 있는 사무실 · 멤버십 · 폴더'), h('div', { class: 'chk-wrap' }, resBoxes)) : null,
    h('div', { style: 'margin-top:16px' }, fld('업무 매뉴얼', f.manual), h('div', { class: 'warn' }, '비밀번호, 인증 코드, 카드 번호는 여기에 쓰지 마세요. 이 글은 AI에게 그대로 전달됩니다.')),
    CLI_ENGINES.includes(curEng) ? h('p', { class: 'small muted' }, S.runners[curEng] ? `실행을 누르면 ${ENGINE_LABEL[curEng]}를 workspaces/${e.id} 폴더에서 한 번 실행합니다. 권한을 건너뛰는 옵션은 쓰지 않아요.` : `이 컴퓨터에 ${ENGINE_LABEL[curEng]}가 없어요. 그래도 할 일에서 복사해서 맡기기로 같은 일을 시킬 수 있어요.`) : null,
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
  if (CLI_ENGINES.includes(e.engine)) return `${ENGINE_LABEL[e.engine]} · ${S.runners[e.engine] ? '이 컴퓨터에 설치됨' : '이 컴퓨터에 없음, 복사해서 맡기기로 씀'}`;
  return ENGINE_LABEL[e.engine] || e.engine;
}

function openAddEmployee(opts = {}) {
  const cfg = opts && !opts.target ? opts : {};
  const dlg = document.getElementById('dlg');
  dlg.className = 'wide';
  const name = h('input', { class: 'in', 'aria-label': 'AI 이름', placeholder: '예: ChatGPT, Claude, 나만의 AI' });
  const avatarName = h('input', { class: 'in', 'aria-label': '캐릭터 이름', placeholder: '예: 장영실 팀장 · 신사임당 (선택)', maxlength: '40' });
  const role = h('input', { class: 'in', 'aria-label': '역할', placeholder: '예: 글쓰기, 고객 답장, 코딩 자동화' });
  let picked = null;
  let pickedPack = cfg.pack || (S.data.employees.some((e) => window.PixelCrew?.isJoseonKey(e.avatar)) ? 'joseon' : 'k-crew');
  let pickedAvatar = cfg.avatar || (pickedPack === 'joseon' ? 'jangyeongsil' : 'haetae');
  let pickedTeam = cfg.team || 'dev';
  let customImg = '';
  const allPresets = S.options.avatarPresets || [];
  const teams = S.options.teams || [];
  const savedCustom = S.data.settings?.customAvatars || [];
  const have = new Set(S.data.employees.map((e) => e.catalog).filter(Boolean));
  const multi = S.data.groups.length > 1;
  const group = multi ? h('select', { class: 'in', 'aria-label': '근무 형태' }, S.data.groups.map((g) => h('option', { value: g.id }, [g.title, g.subtitle].filter(Boolean).join(' · ')))) : null;
  const teamSel = h('select', { class: 'in', 'aria-label': '소속 팀(부서)' }, teams.map((t) => h('option', { value: t.key, selected: t.key === pickedTeam }, t.name)));
  teamSel.addEventListener('change', () => { pickedTeam = teamSel.value; });
  const avPreview = h('div');
  const avPackRow = h('div', { class: 'picker', style: 'margin-bottom:8px' });
  const avStrip = h('div', { class: 'add-av-strip' });
  const fileIn = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', style: 'display:none' });

  const renderAvPicker = () => {
    const isJ = pickedPack === 'joseon';
    const presets = allPresets.filter((p) => p.pack === pickedPack);
    const fake = { id: 'new-emp', name: avatarName.value.trim() || name.value.trim() || '새 AI 직원', avatar: pickedAvatar, avatarStyle: isJ ? 'pixel' : 'studio', avatarImage: customImg };
    avPreview.replaceChildren(avatarEl(fake, { size: 48, stateOverride: isJ ? 'working' : 'idle', styleOverride: isJ ? 'pixel' : 'studio' }));
    avPackRow.replaceChildren(
      ...[['joseon', 'K-Heritage Pixel (21)'], ['k-crew', 'K-Guardian 3D']].map(([pk, pl]) => h('button', {
        type: 'button', class: `chip sm${pickedPack === pk ? ' on' : ''}`,
        onclick: () => {
          pickedPack = pk;
          const first = allPresets.find((p) => p.pack === pk);
          if (first) pickedAvatar = first.key;
          customImg = '';
          renderAvPicker();
        },
      }, pl)));
    avStrip.replaceChildren(
      ...presets.map((p) => h('button', {
        type: 'button', class: `add-av-btn${!customImg && pickedAvatar === p.key ? ' on' : ''}`, title: `${p.name} — ${p.hint}`,
        onclick: () => {
          pickedAvatar = p.key;
          if (p.team && teams.some((t) => t.key === p.team)) { pickedTeam = p.team; teamSel.value = p.team; }
          customImg = '';
          renderAvPicker();
        },
      },
      isJ ? C.avatarSvg(p.key, { size: 32, state: 'working', style: 'pixel' }) : h('img', { src: `/mascots/${p.key}.jpg`, alt: p.name, width: 32, height: 32 }),
      h('span', null, p.name.split(' ')[0]))),
      ...savedCustom.slice(0, 4).map((c) => h('button', {
        type: 'button', class: `add-av-btn${customImg === c.image ? ' on' : ''}`, title: c.name,
        onclick: () => { customImg = c.image; if (!avatarName.value.trim()) avatarName.value = c.name; renderAvPicker(); },
      }, h('img', { src: c.image, alt: c.name, width: 32, height: 32 }), h('span', null, c.name))),
      h('button', { type: 'button', class: `add-av-btn add-up${customImg && !savedCustom.some((c) => c.image === customImg) ? ' on' : ''}`, onclick: () => fileIn.click() },
        h('b', { style: 'font-size:15px;line-height:32px' }, '+'), h('span', null, '내 이미지')));
  };
  fileIn.addEventListener('change', async () => {
    const f = fileIn.files?.[0];
    fileIn.value = '';
    if (!f) return;
    try {
      customImg = await resizeImageToDataUrl(f, false);
      renderAvPicker();
      toast('내 캐릭터 이미지를 올렸어요');
    } catch (err) { toast(err.message || '이미지 처리 오류'); }
  });
  renderAvPicker();

  const quick = h('div', { class: 'picker' }, S.options.catalog.filter((c) => !have.has(c.key)).map((c) => h('button', {
    type: 'button', class: 'chip', onclick: (ev) => {
      picked = c.key; name.value = c.name; role.value = c.role;
      if (group && c.group) group.value = c.group;
      for (const b of quick.children) b.classList.toggle('on', b === ev.currentTarget);
    },
  }, c.engine === 'local' ? `${c.name} (로컬)` : c.name)));

  const closeAdd = () => { dlg.className = ''; dlg.close(); render(); };
  setDlg(dlg, h('h3', null, 'AI 직원 추가'),
    h('p', { class: 'small muted', style: 'margin:-6px 0 12px' }, '쓰는 AI를 고르고, 원하는 캐릭터를 선택하거나 내 이름·이미지를 바로 넣으세요.'),
    quick,
    fileIn,
    h('div', { class: 'grid2', style: 'margin-top:12px' },
      h('label', { class: 'field' }, 'AI 이름 (필수)', name),
      h('label', { class: 'field' }, '캐릭터 이름 · 호칭 (선택)', avatarName)),
    h('div', { class: 'grid2', style: 'margin-top:10px' },
      h('label', { class: 'field' }, '역할', role),
      h('label', { class: 'field' }, '소속 팀 (부서)', teamSel)),
    multi ? h('label', { class: 'field', style: 'margin-top:10px' }, '근무 형태', group) : null,
    h('div', { class: 'add-av-box', style: 'margin-top:12px' },
      h('div', { class: 'row', style: 'gap:10px;align-items:center;margin-bottom:8px' },
        avPreview,
        h('div', null,
          h('div', { style: 'font-size:13px;font-weight:600' }, '캐릭터 에디션 또는 내 이미지'),
          h('div', { class: 'small muted' }, 'K-Heritage 16비트 픽셀(장영실·선비·신사임당·솜이 등) 또는 3D 피규어를 골라 보세요'))),
      avPackRow,
      avStrip),
    h('div', { class: 'bar' }, h('button', { class: 'btn', onclick: closeAdd }, '취소'),
      h('button', { class: 'btn dark', onclick: () => once('add-emp', async () => {
        if (!name.value.trim()) { name.focus(); return; }
        dlg.className = '';
        dlg.close();
        const r = await act('POST', '/api/ui/employees', {
          name: name.value, role: role.value,
          catalog: picked && name.value === S.options.catalog.find((c) => c.key === picked)?.name ? picked : undefined,
          group: group?.value,
          team: pickedTeam,
          avatar: pickedAvatar,
          avatarStyle: pickedPack === 'joseon' ? 'pixel' : 'studio',
          avatarName: avatarName.value.trim(),
          avatarImage: customImg,
        }, '추가했어요');
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
    h('div', { class: 'head' }, h('div', null, h('h1', null, h('b', null, 'AI 직원')),
      h('div', { class: 'sub' }, `AI 직원 ${d.employees.length}명 · 월급 합계 월 ${won(total)}${unknown ? ` · 미입력 ${unknown}명` : ''} · 토큰 한도 시 대체 직원으로 자동 전환`)),
    h('div', { class: 'row' },
      h('button', { class: 'btn sm', onclick: openJoseonCodexModal }, '크루 에디션 (21)'),
      h('button', { class: 'btn sm', onclick: () => once('staff-joseon', () => act('POST', '/api/ui/employees/avatar-style', { pack: 'joseon', avatarStyle: 'pixel', rebalanceTeams: true }, 'K-Heritage Pixel 에디션을 적용했어요')) }, 'K-픽셀 적용'),
      h('button', { class: 'btn sm', onclick: () => { location.hash = '#pocket'; } }, '폰 라이브 뷰'),
      h('button', { class: 'btn sm', onclick: openConnectModal }, 'AI 도구 연결 (MCP · 스킬)'),
      h('button', { class: 'btn dark sm', onclick: () => openAddEmployee() }, '직원 추가'))),
    !d.employees.length ? h('div', { class: 'empty' }, '아직 직원이 없어요. 직원 추가를 눌러 지금 쓰는 AI를 고르세요.') : null,
    d.groups.length <= 1 ? h('div', { class: 'cards' }, d.employees.map(empCard)) : d.groups.filter((g) => d.employees.some((e) => e.group === g.id)).map((g, i) => {
      const list = d.employees.filter((e) => e.group === g.id);
      return h('section', { class: 'grp' },
        h('div', { class: 'grp-h' }, h('span', { class: 'n0' }, String(i + 1)), h('h2', null, g.title), h('span', null, g.subtitle), h('span', { class: 'n' }, `${list.length}명`)),
        g.detail ? h('div', { class: 'small muted', style: 'margin-top:4px' }, g.detail) : null,
        h('div', { class: 'cards' }, list.map(empCard)));
    }),
    quietLine(),
    h('p', { class: 'small muted', style: 'margin-top:16px' }, '실행: 꺼짐 = 앱이 실행하지 않음 · 누를 때만 = 할 일에서 실행 버튼 · 자동 실행 = 자동 루틴이 시간이 되면 혼자 시작. 복사해서 맡기는 직원은 실행 설정이 필요 없어요.'));
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
    h('label', { class: 'switch', title: '이 컴퓨터에서 AI가 화면을 보며 앱·아이폰 미러링을 클릭·조작할 수 있게 허용' },
      h('input', { type: 'checkbox', checked: Boolean(r.computerUse), onchange: (ev) => act('PATCH', `/api/ui/resources/${r.id}`, { computerUse: ev.target.checked }, ev.target.checked ? `${r.name}: 화면 조작(Computer Use)을 켰어요` : `${r.name}: 화면 조작을 껐어요`) }),
      h('span', { class: 'tr' }),
      h('span', { class: 'small' }, '화면 조작(CU)')),
    r.isThisMac && S.bridges?.orca ? h('span', { class: 'tag', title: 'orca computer CLI 감지됨' }, 'orca computer') : null,
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
    h('button', { type: 'button', class: `chip${host === 'office' ? ' on' : ''}`, 'aria-pressed': host === 'office' ? 'true' : 'false', disabled: !offices.length, title: offices.length ? '' : 'AI 사무실에서 사무실 컴퓨터의 ssh 별칭을 넣으면 고를 수 있어요', onclick: () => host !== 'office' && setHost('office') }, officeLabel));
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

// 내가 쓰는 브라우저 (Ego Lite, Aside, Chrome, Dia, Comet 등) — 1클릭 선택 및 직접 추가
function openAddBrowser() {
  const dlg = document.getElementById('dlg');
  dlg.className = '';
  const name = h('input', { class: 'in', placeholder: '예: Brave, Perplexity Comet, Edge', 'aria-label': '브라우저 이름' });
  const cmd = h('input', { class: 'in', placeholder: 'CLI 명령 (선택, 예: aside 또는 ego-browser)', 'aria-label': 'CLI 명령' });
  const guide = h('input', { class: 'in', placeholder: 'AI 사용법 메모 (선택, 예: 프로필 1번 창 사용)', 'aria-label': '사용법' });
  setDlg(dlg,
    h('h3', null, '브라우저 직접 추가'),
    h('p', { class: 'small muted', style: 'margin:-8px 0 12px' }, '등록하고 기본으로 지정하면 모든 웹 작업과 연결 계정이 이 브라우저를 우선 사용합니다.'),
    h('label', { class: 'field' }, '브라우저 이름', name),
    h('label', { class: 'field', style: 'margin-top:12px' }, '실행 명령 (선택)', cmd),
    h('label', { class: 'field', style: 'margin-top:12px' }, 'AI 안내 메모 (선택)', guide),
    h('div', { class: 'bar' },
      h('button', { class: 'btn', onclick: () => dlg.close() }, '취소'),
      h('button', { class: 'btn dark', onclick: () => once('add-br', async () => {
        if (!name.value.trim()) { name.focus(); return; }
        dlg.close();
        await act('POST', '/api/ui/resources', { kind: '브라우저', name: name.value, command: cmd.value, guide: guide.value, note: guide.value || '직접 추가', isDefault: true }, `${name.value.trim()}을 기본 브라우저로 추가했어요`);
      }) }, '추가')));
  dlg.showModal();
  name.focus();
}

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
  return h('section', { class: 'sec' }, secHead('내가 쓰는 브라우저', 'Ego Lite, Aside, Chrome, Dia, Comet 등 내가 쓰는 브라우저를 1클릭으로 기본 지정하세요', h('button', { class: 'btn sm', onclick: openAddBrowser }, '+ 브라우저 추가')),
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

// 스마트폰 · 아이폰 미러링 (Computer Use) · 안드로이드 (adb/scrcpy) · 모바일 AI
function openAddPhone(defaultMode = 'iphone-mirror') {
  const dlg = document.getElementById('dlg');
  dlg.className = '';
  const modes = S.options.phoneModes || [];
  const machines = S.data.resources.filter((r) => r.kind === '기계');
  const thisMac = machines.find((m) => m.isThisMac) || machines[0] || null;
  let pickedMode = defaultMode;
  const defNames = { 'iphone-mirror': '내 iPhone (미러링)', 'android-adb': '내 Android (adb)', 'mobile-ai': '모바일 AI (피클)' };
  const name = h('input', { class: 'in', value: defNames[defaultMode] || '내 스마트폰', placeholder: '예: Jay iPhone, 갤럭시 S25' });
  const hostSel = h('select', { class: 'in' },
    machines.map((m) => h('option', { value: m.id, selected: m.id === thisMac?.id }, `${m.name}${m.computerUse ? ' (화면 조작 ON)' : ''}`)));
  const empSel = h('select', { class: 'in' },
    h('option', { value: '' }, '자동 선택 (Computer Use / 모바일 가능 AI)'),
    S.data.employees.map((e) => h('option', { value: e.id, selected: defaultMode === 'mobile-ai' && (e.catalog === 'pickle' || /피클/.test(e.name)) }, `${e.name}${e.role ? ` · ${e.role}` : ''}`)));
  const note = h('input', { class: 'in', placeholder: '메모 (선택, 예: 인스타 앱·카톡 확인용)' });
  const hostWrap = h('label', { class: 'field', style: 'margin-top:12px' }, '미러링 · 연결할 컴퓨터', hostSel);
  const modeBtns = [];
  const syncVisibility = () => {
    hostWrap.style.display = pickedMode === 'mobile-ai' ? 'none' : '';
  };
  const modePicker = h('div', { class: 'picker' }, modes.map((m) => {
    const b = h('button', {
      type: 'button', class: `chip${m.key === pickedMode ? ' on' : ''}`,
      onclick: () => {
        const wasDef = Object.values(defNames).includes(name.value.trim());
        pickedMode = m.key;
        if (wasDef || !name.value.trim()) name.value = defNames[m.key] || '';
        modeBtns.forEach((x) => x.classList.toggle('on', x === b));
        syncVisibility();
      },
    }, m.name);
    modeBtns.push(b);
    return b;
  }));
  syncVisibility();

  setDlg(dlg,
    h('h3', null, '스마트폰 연결 추가'),
    h('p', { class: 'small muted', style: 'margin:-8px 0 12px' }, '스마트폰에 직접 못 들어가는 iOS도 맥의 iPhone Mirroring 창을 Computer Use로 조작할 수 있어요.'),
    modePicker,
    h('label', { class: 'field', style: 'margin-top:12px' }, '기기 이름', name),
    hostWrap,
    h('label', { class: 'field', style: 'margin-top:12px' }, '전담 AI 직원 (선택)', empSel),
    h('label', { class: 'field', style: 'margin-top:12px' }, '메모 (선택)', note),
    h('p', { class: 'small muted', style: 'margin:12px 0 0' }, '고정 안전선: 잠금 해제·Touch ID·결제·송금·카톡/문자 실제 전송은 대표님 승인 없이 절대 실행하지 않아요.'),
    h('div', { class: 'bar' },
      h('button', { class: 'btn', onclick: () => dlg.close() }, '취소'),
      h('button', { class: 'btn dark', onclick: () => once('add-phone', async () => {
        if (!name.value.trim()) { name.focus(); return; }
        dlg.close();
        await act('POST', '/api/ui/resources', {
          kind: '스마트폰', name: name.value, phoneMode: pickedMode,
          hostMachine: pickedMode === 'mobile-ai' ? null : (hostSel.value || null),
          assignee: empSel.value || null, note: note.value,
        }, `${name.value.trim()}을 연결했어요`);
      }) }, '연결 추가')));
  dlg.showModal();
  name.focus();
}

function phonePanel() {
  const phones = S.data.resources.filter((r) => r.kind === '스마트폰');
  const modes = S.options.phoneModes || [];
  const br = S.bridges || ui.tools?.bridges || {};
  const modeHintTag = (key) => {
    if (key === 'iphone-mirror') return br.iphoneMirroringApp ? 'iPhone Mirroring 감지됨' : (br.orca ? 'orca computer 감지됨' : 'macOS 미러링');
    if (key === 'android-adb') return br.adb || br.scrcpy ? [br.adb ? 'adb' : '', br.scrcpy ? 'scrcpy' : ''].filter(Boolean).join('·') + ' 감지됨' : 'USB · Wi-Fi';
    return '클라우드';
  };
  const quickCards = modes.map((m) => {
    const existing = phones.find((p) => p.phoneMode === m.key && p.status !== '꺼짐');
    return h('button', {
      type: 'button', class: `tool-card${existing ? ' on' : ''}`,
      onclick: () => openAddPhone(m.key),
    },
    h('div', { class: 'top' }, h('b', null, m.name),
      existing ? h('span', { class: 'tag solid' }, '연결됨') : h('span', { class: 'tag' }, modeHintTag(m.key))),
    h('span', { class: 'small muted' }, m.hint));
  });

  const listEl = phones.length ? h('ul', { class: 'list', style: 'margin-top:12px' }, phones.map((p) => {
    const modeObj = modes.find((m) => m.key === p.phoneMode);
    const host = p.hostMachine ? res(p.hostMachine) : null;
    const pinned = p.assignee ? emp(p.assignee) : null;
    const sub = [
      modeObj?.name || p.phoneMode,
      host ? `연결 컴퓨터: ${host.name}${host.computerUse ? ' (화면 조작 ON)' : ' (화면 조작 꺼짐)'}` : '',
      pinned ? `전담 AI: ${shortName(pinned.id)}` : '',
      p.note,
    ].filter(Boolean).join(' · ');
    return h('li', { class: 'res' },
      h('div', { class: 'main' },
        h('div', { class: 't' }, p.name, h('span', { class: 'tag', style: 'margin-left:8px' }, modeObj?.short || '스마트폰')),
        h('div', { class: 's' }, sub)),
      h('div', { class: 'row' },
        h('button', { class: 'x', 'aria-label': `${p.name} 지우기`, onclick: () => { if (confirm(`${p.name} 연결을 지울까요?`)) act('DELETE', `/api/ui/resources/${p.id}`, undefined, '지웠어요'); } }, '×')));
  })) : null;

  return h('section', { class: 'sec' },
    secHead('스마트폰 · 아이폰 미러링 연결', '아이폰 미러링(Computer Use), 안드로이드(adb/scrcpy), 모바일 AI를 연결하면 스마트폰 작업 지시서에 자동 반영됩니다', h('button', { class: 'btn sm', onclick: () => openAddPhone('iphone-mirror') }, '+ 스마트폰 추가')),
    h('div', { class: 'tool-cards' }, quickCards),
    listEl,
    h('p', { class: 'small muted', style: 'margin-top:10px' }, '안전선: 스마트폰 미러링·조작에서도 잠금 해제·결제·송금·카톡/문자 실제 전송은 대표님 승인 없이 차단됩니다.'));
}

function healthPanel() {
  const H = S.health || {};
  const td = H.today || {};
  const stats = [
    H.score != null ? `컨디션 ${H.score}점 (${H.levelLabel})` : '아직 기록 없음',
    typeof td.steps === 'number' ? `걸음 ${td.steps.toLocaleString('ko-KR')}보` : '',
    typeof td.sleepHours === 'number' ? `수면 ${td.sleepHours}시간` : '',
    (td.restingHr ?? td.heartRate) != null ? `심박 ${td.restingHr ?? td.heartRate}bpm` : '',
    typeof td.exerciseMin === 'number' ? `운동 ${td.exerciseMin}분` : '',
  ].filter(Boolean).join(' · ');
  return h('section', { class: 'sec' },
    secHead('대표 헬스 · 컨디션 연동 (Apple Health · Health Connect)', '아이폰 단축어나 안드로이드 Health Connect로 심박·걸음·수면을 받아 대시보드와 AI 위임을 최적화합니다'),
    h('div', { class: 'lan' },
      h('div', { class: 'row', style: 'justify-content:space-between;flex-wrap:wrap;gap:10px' },
        h('div', null,
          h('div', { style: 'font-weight:600;font-size:14px' }, stats),
          h('div', { class: 'small muted', style: 'margin-top:3px' }, H.advice || '건강 기록은 이 컴퓨터에만 저장되며 외부 공유·청사진·AI 프롬프트로 나가지 않아요.')),
        h('div', { class: 'row' },
          h('button', { type: 'button', class: 'btn sm', onclick: openHealthLogModal }, '5초 기록'),
          h('button', { type: 'button', class: 'btn sm dark', onclick: openHealthConnectModal }, '아이폰 · 안드로이드 연동 가이드')))));
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
  const spaceIn = h('input', { class: 'in', placeholder: '예: 이메일, 네이버, 결제, SNS (선택)', 'aria-label': '프로필 또는 스페이스' });
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
    h('label', { class: 'field', style: 'margin-top:12px' }, '프로필 · 스페이스 (선택)', spaceIn),
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
        const sp = h('input', { class: 'in sm', value: r.spaceName || '', 'data-k': `acc-sp-${r.id}`, placeholder: '예: 이메일, 네이버, 결제, SNS (선택)', style: 'max-width:220px', 'aria-label': '프로필 또는 스페이스' });
        const saveSp = () => act('PATCH', `/api/ui/resources/${r.id}`, { spaceName: sp.value.trim() }, '프로필·스페이스 이름을 저장했어요');
        sp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && !ev.isComposing) saveSp(); });
        return h('div', { class: 'acc-row' }, h('span', { class: 'small muted' }, '프로필·스페이스'), h('div', { class: 'row' }, sp, h('button', { type: 'button', class: 'btn sm', onclick: saveSp }, '저장')));
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
  const genericKinds = S.options.resKinds.filter((k) => !['브라우저', '스마트폰', '오픈소스', '계정', '디자인'].includes(k));
  const webCount = d.resources.filter((r) => ['브라우저', '계정'].includes(r.kind)).length;
  const mobileCount = d.resources.filter((r) => r.kind === '스마트폰').length;
  const toolsCount = d.resources.filter((r) => ['오픈소스', '디자인'].includes(r.kind)).length;
  const officeCount = d.resources.filter((r) => genericKinds.includes(r.kind)).length;
  const tabs = [
    ['all', '전체'],
    ['web', `브라우저 · 계정 (${webCount})`],
    ['mobile', `스마트폰 · 헬스 (${mobileCount})`],
    ['tools', `오픈소스 · 디자인 (${toolsCount})`],
    ['office', `사무실 · 컴퓨터 (${officeCount})`],
  ];
  const name = h('input', { class: 'in', placeholder: '새 리소스 (예: Office 2 맥북, 외장 SSD, 작업 폴더)', 'data-k': 'rs-name', 'aria-label': '리소스 이름' });
  const kind = h('select', { class: 'in', style: 'width:110px', 'data-k': 'rs-kind', 'aria-label': '종류' }, genericKinds.map((k) => h('option', { value: k }, k)));
  const add = () => submitInput(name, 'add-res', (v) => act('POST', '/api/ui/resources', { name: v, kind: kind.value }, '추가했어요'));
  name.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) add(); });
  return h('div', null,
    h('div', { class: 'head' }, h('div', null, h('h1', null, h('b', null, 'AI 사무실')),
      h('div', { class: 'sub' }, '컴퓨터(화면 조작) · 브라우저 · 스마트폰(아이폰 미러링) · 대표 헬스 · 오픈소스를 한 번만 연결하면 모든 할 일과 대시보드에 즉시 적용됩니다.')),
    h('button', { class: 'btn', onclick: () => { loadOffice(); loadTools(); } }, '다시 읽기')),
    h('div', { class: 'picker', style: 'margin-bottom:20px' }, tabs.map(([k, label]) => h('button', {
      type: 'button', class: `chip${tab === k ? ' on' : ''}`, onclick: () => { ui.resTab = k; render(); },
    }, label))),
    show('web') ? browserPanel() : null,
    show('mobile') ? phonePanel() : null,
    show('mobile') ? healthPanel() : null,
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
      if (det.gemini) ui.ob.ais.add('geminicli');
      if (det.agy) ui.ob.ais.add('antigravity');
      if (det.opencode) ui.ob.ais.add('opencode');
      if (det.cursor) ui.ob.ais.add('cursor');
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
    return obShell(1, '삶과 AI 일을 함께 최적화하는 본사를 차려 볼까요?', '인공지능 시대, 내 컨디션과 AI 직원 · 사무실을 한곳에서 최적화합니다. 1분이면 끝나요 — 모든 데이터는 이 컴퓨터 안에만 저장돼요.',
      h('div', { class: 'ob-fields' }, h('label', { class: 'field' }, '대표 이름', name), h('label', { class: 'field' }, '회사 이름 (나중에 정해도 돼요)', company)),
      [skip, h('button', { class: 'btn dark big', 'data-act': 'ob-next', onclick: go }, '시작하기')]);
  }

  if (ob.step === 2) {
    const det = ob.det || {};
    const found = (c) => (c.key === 'claudecode' && det.claude)
      || (c.key === 'codex' && det.codex)
      || (c.key === 'geminicli' && det.gemini)
      || (c.key === 'antigravity' && det.agy)
      || (c.key === 'opencode' && det.opencode)
      || (c.key === 'cursor' && det.cursor)
      || (c.local && det[c.local]);
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
    return obShell(3, '컴퓨터와 도구를 확인해 주세요.', '이 컴퓨터는 본사로 자동 등록돼요. 웹 자동화에 쓸 브라우저와 설치된 도구를 골라 두면 바로 적용됩니다 (나중에 AI 사무실에서 바꿀 수 있어요).',
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
        const foundList = (c.targets || []).filter((t) => t.found);
        if (autoSkip && !foundList.length && ob.step === 5) {
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
        const foundList = (c.targets || []).filter((t) => t.found);
        if (!foundList.length && ob.step === 5) {
          ob.skippedConnect = true;
          ob.step = 6;
        }
        render();
      }).catch(() => { ob.connect = { targets: [] }; render(); });
    }
    const list = (ob.connect.targets || []).filter((t) => t.found);
    const pending = list.filter((t) => !(t.mcp.configured && (!t.skill || t.skill.installed)));
    const oneLineCmd = ob.connect.terminal || 'npx github:wonseokjung/connect-ai-autonomous-company connect --yes';
    const row = (t) => {
      const done = t.mcp.configured && (!t.skill || t.skill.installed);
      const open = ob.open[t.key];
      return h('div', { class: 'ob-conn' },
        h('div', { class: 'row' }, h('div', null, h('b', null, t.name), h('div', { class: 'small muted' }, `직원 아이디 ${t.employee}${t.skill ? ' · 출입증(MCP) + 직원 수첩(스킬)' : ' · 출입증(MCP)'}`)),
          done ? h('span', { class: 'tag solid' }, '이미 연결됨 ✓')
            : h('button', { type: 'button', class: `btn sm${open ? '' : ' dark'}`, 'aria-expanded': open ? 'true' : 'false', onclick: () => { ob.open[t.key] = !open; render(); } }, open ? '접기' : '개별 명령')),
        open && !done ? h('div', { class: 'ob-cmds' },
          !t.mcp.configured ? (t.mcp.line ? copyBlock('터미널에 붙여 넣기 · 출입증(MCP)', t.mcp.line) : copyBlock(`${t.mcp.file} 에 합치기 · 출입증(MCP)`, t.mcp.snippet)) : null,
          t.skill && !t.skill.installed ? copyBlock('터미널에 붙여 넣기 · 직원 수첩(스킬)', t.skill.line) : null) : null);
    };
    return obShell(5, '바이브코딩 툴을 한 번에 연결할까요?', '아직 아무 설정도 바꾸지 않았어요. 아래 터미널 한 줄을 실행하면 감지된 툴 전체에 .bak 백업 후 안전하게 한 번에 연결됩니다.',
      ob.connect.loading ? h('div', { class: 'small muted' }, '이 컴퓨터를 살펴보는 중')
        : list.length ? h('div', null,
          pending.length ? copyBlock(`터미널 한 줄로 감지된 ${pending.length}개 툴 한 번에 연결`, oneLineCmd) : null,
          h('div', { class: 'row', style: 'justify-content:flex-end;margin:8px 0' },
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
  return obShell(6, '돈과 공개는 대표님 손으로만', '결제, 업로드, 게시, 삭제, 메시지 발송이 들어간 일은 대표님이 누를 때까지 AI가 시작하지 못해요. 원하시면 첫 자동 루틴도 하나 골라 바로 시작해 보세요.',
    h('div', null,
      h('div', { class: 'ob-assign' }, h('span', { class: 'who-chip ai' }, 'AI'), h('div', null, h('b', null, '광고비 5만원 결제'), h('div', { class: 'small muted' }, '결제가 들어간 일 → 사람')), h('span', { class: 'btn sm dark', 'aria-hidden': 'true' }, '결제 확인')),
      h('div', { class: 'ob-group' }, h('div', { class: 'small muted' }, '첫 자동 루틴 하나 담아 볼까요? (선택, 프롬프트까지 채워서 들어갑니다)'),
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
