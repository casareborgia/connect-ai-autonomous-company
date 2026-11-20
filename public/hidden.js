// 숨긴 기능 화면 (매출, 채널, 사내 메신저, 결재함). 설정의 features 를 켜면 메뉴에 나온다.
'use strict';

function jayUnread() {
  return S.data.messages.filter((m) => (m.to || []).includes('jay') && !(m.readBy || {}).jay);
}
function assigneeOptions(selected, { withJay = true, empty = '담당 미정' } = {}) {
  const opts = [h('option', { value: '' }, empty)];
  for (const e of S.data.employees) opts.push(h('option', { value: e.id, selected: selected === e.id }, e.name));
  if (withJay) opts.push(h('option', { value: 'jay', selected: selected === 'jay' }, `${S.data.owner.name} (대표)`));
  return opts;
}

function openManualRevenue() {
  const dlg = document.getElementById('dlg');
  const amount = h('input', { class: 'in', inputmode: 'numeric', placeholder: '예: 150000', 'aria-label': '금액' });
  const cur = h('select', { class: 'in', 'aria-label': '통화' }, ['KRW', 'USD', 'JPY', 'EUR'].map((c) => h('option', { value: c }, c)));
  const kind = h('select', { class: 'in', 'aria-label': '기간 종류' }, h('option', { value: 'day' }, '하루'), h('option', { value: 'month' }, '한 달 전체'));
  const date = h('input', { class: 'in', type: 'date', value: S.yesterday, 'aria-label': '날짜' });
  const site = h('input', { class: 'in', placeholder: '예: 강의 판매, 협찬', 'aria-label': '어디서' });
  const note = h('input', { class: 'in', placeholder: '메모 (선택)', 'aria-label': '메모' });
  const close = () => { dlg.close(); render(); };
  dlg.replaceChildren(
    h('h3', null, '매출 수기 입력'),
    h('div', { class: 'grid2' },
      h('label', { class: 'field' }, '금액', amount), h('label', { class: 'field' }, '통화', cur),
      h('label', { class: 'field' }, '기간', kind), h('label', { class: 'field' }, '날짜', date)),
    h('label', { class: 'field', style: 'margin-top:12px' }, '어디서', site),
    h('label', { class: 'field', style: 'margin-top:12px' }, '메모', note),
    h('p', { class: 'small muted' }, '수기 입력으로 표시됩니다. 토스페이먼츠, 페이팔은 AI 직원 보고나 API 로 들어옵니다.'),
    h('div', { class: 'bar' },
      h('button', { class: 'btn', onclick: close }, '취소'),
      h('button', { class: 'btn dark', onclick: async () => {
        const period = kind.value === 'month' ? date.value.slice(0, 7) : date.value;
        dlg.close();
        await act('POST', '/api/ui/revenue', { amount: amount.value, currency: cur.value, period, site: site.value, note: note.value }, '수기 입력을 저장했습니다');
      } }, '저장')),
  );
  dlg.showModal();
  amount.focus();
}

function extraCurrencies(bucket) {
  return Object.entries(bucket).filter(([c]) => c !== 'KRW').map(([c, v]) => money(v, c));
}

function moneySection() {
  const R = S.revenue;
  const yK = (R.yesterday.confirmed.KRW || 0) + (R.yesterday.estimated.KRW || 0);
  const hasY = R.yesterday.lines.length > 0;
  const mConf = R.monthSum.confirmed.KRW || 0;
  const mEst = R.monthSum.estimated.KRW || 0;
  const hasM = R.bySite.length > 0;

  const foot = (conf, est, extras) => {
    const parts = [];
    parts.push(h('span', null, '확정 ', h('b', null, won(conf))));
    if (est) parts.push(h('span', null, ' · 예상 ', h('b', null, won(est))));
    for (const x of extras) parts.push(h('span', null, ` · ${x} 별도`));
    return parts;
  };
  const yStat = h('div', { class: 'stat' },
    h('div', { class: 'lbl' }, '어제 매출', h('span', { class: 'muted' }, dateK(R.yesterdayDate))),
    h('div', { class: `val${hasY ? '' : ' none'}` }, hasY ? bigMoney(yK) : '-'),
    h('div', { class: 'foot' }, hasY ? foot(R.yesterday.confirmed.KRW || 0, R.yesterday.estimated.KRW || 0, extraCurrencies({ ...R.yesterday.confirmed, ...R.yesterday.estimated })) : '보고 없음'));
  const mStat = h('div', { class: 'stat' },
    h('div', { class: 'lbl' }, '이번 달 매출', mEst ? h('span', { class: 'tag' }, '예상 포함') : null),
    h('div', { class: `val${hasM ? '' : ' none'}` }, hasM ? bigMoney(mConf + mEst) : '-'),
    C.spark(R.daily30),
    h('div', { class: 'foot' }, hasM ? foot(mConf, mEst, extraCurrencies({ ...R.monthSum.confirmed, ...R.monthSum.estimated })) : '보고 없음 · 최근 30일 선은 보고가 들어오면 그려집니다'));
  const nStat = h('div', { class: 'stat' },
    h('div', { class: 'lbl' }, '순수익', h('span', { class: 'muted' }, '매출 − AI 월급')),
    h('div', { class: `val${R.net.hasData ? '' : ' none'}` }, R.net.hasData ? bigMoney(R.net.KRW) : '-'),
    h('div', { class: 'foot' }, `AI 월급 합계 월 ${won(R.salaries.total)}`, R.salaries.unknown ? ` · 미입력 ${R.salaries.unknown}명` : '', R.net.includesEstimate ? ' · 예상 수익 포함' : ''));

  const revenue = hasM ? mConf + mEst : null;
  const net = hasM ? revenue - R.salaries.total : null;
  const bar = h('div', { class: 'paybar' },
    h('div', { class: 'row', style: 'justify-content:space-between;margin-bottom:10px' },
      h('span', { class: 'small', style: 'font-weight:600' }, '이번 달 급여명세서'),
      h('span', { class: 'small muted' }, hasM ? `매출 ${won(revenue)}` : '매출 보고가 들어오면 채워집니다')),
    C.paybar(revenue, R.salaries.total),
    h('div', { class: 'legend' },
      h('span', null, h('i', { style: 'background:#c9c9c9' }), `AI 월급 ${won(R.salaries.total)}${R.salaries.unknown ? ` (미입력 ${R.salaries.unknown}명)` : ''}`),
      h('span', null, h('i', { style: 'background:#111' }), `순수익 ${net === null ? '-' : won(net)}`)));

  const reports = S.data.revenue.entries.filter((e) => e.source === 'AI 직원 보고').length + S.data.metrics.filter((m) => m.name === '예상 수익').length;
  const sources = h('div', { class: 'sources' },
    h('span', { class: 'src' }, h('b', null, 'AI 직원 보고'), ` ${reports}건`),
    ...R.connectors.map((c) => h('span', { class: 'src' }, h('b', null, `${c.site} API`), ` ${c.state}`)),
    h('span', { class: 'src' }, h('b', null, '수기 입력'), ` ${S.data.revenue.entries.filter((e) => e.source === '수기 입력').length}건`),
    h('button', { class: 'btn sm', onclick: openManualRevenue }, '수기 입력'),
  );
  return h('section', { class: 'sec' }, h('div', { class: 'cols3' }, yStat, mStat, nStat), bar, sources);
}

function latestMetric(name, period) {
  return S.data.metrics.filter((m) => m.name === name && m.period === period).sort((a, b) => String(b.readAt).localeCompare(String(a.readAt)))[0] || null;
}

function channelSection() {
  const ch = S.data.business.channels[0];
  const cell = (name, fmt) => {
    const m = latestMetric(name, S.yesterday);
    return h('div', { class: 'stat' },
      h('div', { class: 'lbl' }, name, name === '예상 수익' ? h('span', { class: 'tag' }, '예상') : null),
      h('div', { class: `val${m ? '' : ' none'}` }, m ? fmt(m) : '-'),
      h('div', { class: 'foot' }, m ? [`${stamp(m.readAt)} 읽음 · `, evidenceLink(m.evidence)] : '보고 없음'));
  };
  return h('section', { class: 'sec' },
    secHead('채널', `${ch ? ch.name : 'CONNECT AI LAB'} · YouTube Studio · 어제`, h('a', { class: 'btn link', href: '#daily' }, '유튜브 확인 업무')),
    h('div', { class: 'chan' },
      cell('조회수', (m) => Number(m.value).toLocaleString('ko-KR')),
      cell('구독자 증감', (m) => `${m.value > 0 ? '+' : ''}${Number(m.value).toLocaleString('ko-KR')}`),
      cell('예상 수익', (m) => money(m.value, m.currency || 'KRW'))));
}

function threadName(th) {
  if (th === 'all') return '전체 방';
  if (th.startsWith('dm:')) return `${nameOf(th.slice(3))} · 1:1`;
  if (th.startsWith('task:')) {
    const t = S.data.tasks.find((x) => x.id === th.slice(5));
    return t ? `할 일 · ${t.title}` : th;
  }
  return th;
}

function pageMessenger() {
  const d = S.data;
  const thread = ui.param || 'all';
  const unreadBy = {};
  for (const m of jayUnread()) unreadBy[m.thread] = (unreadBy[m.thread] || 0) + 1;
  const taskThreads = [...new Set(d.messages.filter((m) => m.thread.startsWith('task:')).reverse().map((m) => m.thread))].slice(0, 20);
  if (thread.startsWith('task:') && !taskThreads.includes(thread)) taskThreads.unshift(thread);
  const link = (th, label) => h('a', { href: `#messenger/${th}`, class: th === thread ? 'on' : '' }, h('span', null, label), unreadBy[th] ? h('i', { class: 'dot', 'aria-label': '안 읽음' }) : null);

  const threads = h('nav', { class: 'threads', 'aria-label': '대화방' },
    link('all', '전체 방'),
    h('div', { class: 'th-h' }, '1:1 대화'),
    d.employees.map((e) => link(`dm:${e.id}`, e.name)),
    taskThreads.length ? h('div', { class: 'th-h' }, '할 일 스레드') : null,
    taskThreads.map((th) => link(th, threadName(th).replace(/^할 일 · /, ''))));

  const select = h('div', { class: 'thread-select' }, h('select', { class: 'in', 'aria-label': '대화방 고르기', onchange: (e) => { location.hash = `#messenger/${e.target.value}`; } },
    h('option', { value: 'all', selected: thread === 'all' }, `전체 방${unreadBy.all ? ' (새 글)' : ''}`),
    d.employees.map((e) => h('option', { value: `dm:${e.id}`, selected: thread === `dm:${e.id}` }, `1:1 · ${e.name}${unreadBy[`dm:${e.id}`] ? ' (새 글)' : ''}`)),
    taskThreads.map((th) => h('option', { value: th, selected: thread === th }, threadName(th)))));

  const list = d.messages.filter((m) => m.thread === thread).slice(-200);
  const msgs = h('div', { class: 'msgs' }, list.length ? list.map((m) => {
    if (m.fromKind === 'system') return h('div', { class: 'msg sys' }, h('div', { class: 'bubble' }, `${m.text} · ${stamp(m.at)}`));
    const me = m.from === 'jay';
    const acts = [];
    if (me) {
      for (const id of m.to || []) {
        const e = emp(id);
        if (!e) continue;
        acts.push(h('span', { class: 'small muted' }, `${shortName(id)} ${(m.readBy || {})[id] ? '읽음' : '안 읽음'}`));
      }
    }
    return h('div', { class: `msg${me ? ' me' : ''}` },
      h('div', { class: 'by' }, me ? null : h('b', { style: 'color:#111;font-weight:600' }, nameOf(m.from)), kindBadge(m.fromKind), h('span', null, stamp(m.at)), m.run ? h('span', null, `· ${m.run.label}`) : null),
      h('div', { class: 'bubble' }, m.text),
      acts.length ? h('div', { class: 'acts' }, acts) : null);
  }) : h('div', { class: 'empty' }, '아직 메시지가 없습니다'));

  const typing = S.working.filter((w) => w.thread === thread).map((w) => `${nameOf(w.emp)} ${w.kind === 'local' ? '답장 쓰는 중' : '일하는 중'}`);

  // 머리: 1:1 이면 그 직원이 어떻게 답하는지 보여 준다
  let info = null;
  if (thread.startsWith('dm:')) {
    const e = emp(thread.slice(3));
    if (e) {
      if (e.engine === 'local') info = e.model ? `로컬 모델 ${e.model.replace(/^(ollama|lmstudio):/, '')} 이 바로 답합니다` : '로컬 모델을 아직 고르지 않았습니다';
      else if (e.engine === 'claude' || e.engine === 'codex') info = e.runMode && e.runMode !== 'off' ? '메시지 아래 일 시키기를 눌러야 실행됩니다' : '일 시키기 꺼짐 · 에이전트가 hq inbox 로 받아 갑니다';
      else info = '에이전트가 hq inbox 로 받아 가서 hq reply 로 답합니다';
    }
  } else if (thread === 'all') info = '@이름 으로 부르면 그 직원의 받은 메시지함에 들어갑니다';

  const ta = h('textarea', { class: 'in', rows: 2, placeholder: thread.startsWith('dm:') ? `${nameOf(thread.slice(3))} 에게 메시지` : '메시지 (@이름 으로 부르기)', 'data-k': `compose-${thread}`, 'aria-label': '메시지 입력' });
  const sendMsg = async () => {
    if (!ta.value.trim()) return;
    const r = await act('POST', '/api/ui/messages', { text: ta.value, thread });
    if (r) { ta.value = ''; ta.dataset.fresh = '1'; render(); document.querySelector(`[data-k="compose-${thread}"]`)?.focus(); }
  };
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) sendMsg(); });
  const mention = thread.startsWith('dm:') ? null : h('div', { class: 'mention' }, d.employees.map((e) => h('button', { type: 'button', onclick: () => {
    const tag = `@${e.name.split(/\s/)[0]} `;
    ta.value = ta.value + (ta.value && !ta.value.endsWith(' ') ? ' ' : '') + tag;
    ta.focus();
  } }, `@${e.name.split(/\s/)[0]}`)));

  // 열면 읽음 처리
  if (unreadBy[thread]) setTimeout(() => api('POST', '/api/ui/messages/read', { thread }).then(load).catch(() => {}), 400);

  return h('div', null,
    h('div', { class: 'head' }, h('div', null, h('h1', null, h('b', null, '사내 메신저')),
      h('div', { class: 'sub' }, '사람과 AI 직원이 함께 쓰는 방. AI 가 쓴 글은 글자로만 보여 주고 실행하지 않습니다.'))),
    h('div', { class: 'msgr' }, threads,
      h('div', { class: 'conv' }, select,
        h('div', { class: 'conv-h' }, h('b', null, threadName(thread)), info ? h('span', { class: 'small muted' }, info) : null),
        msgs,
        typing.length ? h('div', { class: 'typing' }, typing.join(' · ')) : null,
        h('div', { class: 'compose' }, ta, h('div', { class: 'row', style: 'justify-content:space-between' }, mention || h('span', { class: 'small muted' }, '⌘ + Enter 로 보내기'), h('button', { class: 'btn dark', onclick: sendMsg }, '보내기'))))));
}

function pageApprovals() {
  const d = S.data;
  const wait = d.approvals.filter((a) => a.status === '대기').sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  const done = d.approvals.filter((a) => a.status !== '대기').sort((a, b) => String(b.decidedAt).localeCompare(String(a.decidedAt))).slice(0, 40);

  const card = (a) => {
    const isWait = a.status === '대기';
    const fin = a.draft !== null && a.draft !== undefined
      ? h('textarea', { class: 'in', rows: 4, 'data-k': `fin-${a.id}`, disabled: !isWait, 'aria-label': '보낼 글 (고칠 수 있음)' }, isWait ? a.draft : (a.finalText || a.draft))
      : null;
    const note = h('input', { class: 'in sm', placeholder: '메모 (선택)', 'data-k': `note-${a.id}`, style: 'max-width:280px', 'aria-label': '결재 메모' });
    const decide = (decision) => act('POST', `/api/ui/approvals/${a.id}/decide`, { decision, note: note.value, finalText: fin ? fin.value : undefined }, `${decision}했습니다`);
    let content;
    if (a.original) {
      content = h('div', { class: 'side2' },
        h('div', { class: 'pane' }, h('div', { class: 'k' }, '원래 댓글'),
          h('div', { class: 'small', style: 'font-weight:600;margin-bottom:4px' }, a.original.author || '작성자 미상'),
          h('div', { class: 'v' }, a.original.text),
          h('div', { class: 'small muted', style: 'margin-top:8px;overflow-wrap:anywhere' }, [a.original.video, a.original.url].filter(Boolean).join(' · '))),
        h('div', { class: 'pane' }, h('div', { class: 'k' }, isWait ? '답글 초안 · 고쳐서 승인할 수 있습니다' : '승인된 답글'), fin));
    } else if (fin) {
      content = h('div', { class: 'pane', style: 'margin-top:16px' }, h('div', { class: 'k' }, isWait ? '보낼 글 초안' : '승인된 글'), fin);
    }
    return h('div', { class: `appr${isWait ? ' wait' : ''}` },
      h('div', { class: 'top' },
        h('span', { class: `tag${isWait ? ' solid' : ''}` }, isWait ? `${a.kind} · 결재 대기` : `${a.kind} · ${a.status}`),
        h('span', { class: 'who' }, kindBadge('ai'), nameOf(a.from)),
        h('span', { class: 'small muted' }, `${a.id} · ${stamp(a.requestedAt)} 요청`),
        a.taskId ? h('a', { class: 'evi', href: `#home/${a.taskId}` }, `할 일 ${a.taskId}`) : null),
      h('div', { class: 'what' }, a.what),
      a.amount !== null && a.amount !== undefined ? h('div', { style: 'font-size:28px;font-weight:200;margin-top:8px' }, money(a.amount, a.currency || 'KRW')) : null,
      content,
      isWait
        ? h('div', { class: 'decide' }, note, h('div', { class: 'grow' }),
          h('button', { class: 'btn', onclick: () => decide('반려') }, '반려'),
          h('button', { class: 'btn dark', onclick: () => decide('승인') }, '승인'))
        : h('div', { class: 'decide small muted' }, `${stamp(a.decidedAt)} 대표 ${a.status}${a.decisionNote ? ` · ${a.decisionNote}` : ''}${a.executedAt ? ` · ${stamp(a.executedAt)} 실행됨` : a.status === '승인' ? ' · 아직 실행 안 됨' : ''}`));
  };

  return h('div', null,
    h('div', { class: 'head' }, h('div', null, h('h1', null, h('b', null, '결재함')),
      h('div', { class: 'sub' }, 'AI 직원은 요청만 합니다. 결제, 업로드, 게시, 발송, 삭제는 대표가 여기서 눌러야 진행됩니다.'))),
    h('section', { class: 'sec' }, secHead('결재 대기', `${wait.length}건`), wait.length ? wait.map(card) : h('div', { class: 'empty' }, '기다리는 결재가 없습니다')),
    h('section', { class: 'sec' }, secHead('처리한 결재', done.length ? `최근 ${done.length}건` : ''), done.length ? done.map(card) : h('div', { class: 'empty' }, '아직 없습니다')));
}

function simpleList(key, title, items, placeholder) {
  const name = h('input', { class: 'in sm', placeholder, 'data-k': `biz-${key}`, 'aria-label': `${title} 추가` });
  const add = async () => {
    if (!name.value.trim()) { name.focus(); return; }
    const r = await act('POST', `/api/ui/business/${key}`, { name: name.value }, '추가했습니다');
    if (r) { name.value = ''; name.dataset.fresh = '1'; render(); }
  };
  name.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) add(); });
  return h('div', null, secHead(title, `${items.length}개`),
    items.length ? h('ul', { class: 'list' }, items.map((x) => h('li', null, h('div', { class: 'main' }, h('div', { class: 't' }, x.name), x.where ? h('div', { class: 's' }, x.where) : null),
      h('button', { class: 'x', 'aria-label': `${x.name} 지우기`, onclick: () => { if (confirm(`"${x.name}" 을 지울까요?`)) act('DELETE', `/api/ui/business/${key}/${x.id}`, undefined, '지웠습니다'); } }, '×'))))
      : h('div', { class: 'empty' }, '아직 없습니다'),
    h('div', { class: 'row', style: 'margin-top:12px' }, h('div', { class: 'grow' }, name), h('button', { class: 'btn sm', onclick: add }, '추가')));
}

function pageBusiness() {
  const d = S.data;
  const R = S.revenue;
  const entries = [
    ...d.revenue.entries.map((e) => ({ ...e, label: e.site })),
    ...d.metrics.filter((m) => m.name === '예상 수익').map((m) => ({ id: m.id, period: m.period, label: 'YouTube Studio', amount: m.value, currency: m.currency || 'KRW', source: 'AI 직원 보고', by: m.by, readAt: m.readAt, evidence: m.evidence, estimated: true })),
  ].sort((a, b) => String(b.readAt).localeCompare(String(a.readAt))).slice(0, 100);
  const metrics = d.metrics.filter((m) => m.name !== '예상 수익').sort((a, b) => String(b.readAt).localeCompare(String(a.readAt))).slice(0, 60);

  return h('div', null,
    h('div', { class: 'head' }, h('div', null, h('h1', null, h('b', null, '사업')),
      h('div', { class: 'sub' }, '숫자는 주로 AI 직원이 로그인된 대시보드를 읽어 캡처와 함께 보고합니다. API 는 보조입니다.')),
    h('button', { class: 'btn', onclick: openManualRevenue }, '수기 입력')),
    h('section', { class: 'sec' }, secHead(`이번 달 매출 · ${Number(R.month.slice(5))}월`, R.bySite.length ? '' : '보고 없음'),
      R.bySite.length ? h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' },
        h('thead', null, h('tr', null, h('th', null, '출처'), h('th', null, '계산'), h('th', null, '구분'), h('th', { class: 'r' }, '금액'))),
        h('tbody', null, R.bySite.map((g) => h('tr', null, h('td', null, g.site), h('td', { class: 'muted' }, g.basis),
          h('td', null, g.estimated ? h('span', { class: 'tag' }, '예상') : h('span', { class: 'tag solid' }, '확정')),
          h('td', { class: 'r num' }, money(g.amount, g.currency))))))) : h('div', { class: 'empty' }, '경리 담당 AI 의 아침 매출 확인을 켜거나, 수기 입력으로 시작하세요.')),
    h('section', { class: 'sec' }, secHead('매출 기록', `${entries.length}건`),
      entries.length ? h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' },
        h('thead', null, h('tr', null, h('th', null, '기간'), h('th', null, '어디'), h('th', null, '입력'), h('th', null, '읽은 때'), h('th', { class: 'r' }, '금액'), h('th', null, ''))),
        h('tbody', null, entries.map((e) => h('tr', null,
          h('td', null, periodK(e.period)),
          h('td', null, e.label, e.estimated ? h('span', { class: 'tag', style: 'margin-left:6px' }, '예상') : null),
          h('td', null, e.source === '수기 입력' ? h('span', { class: 'tag ghost' }, '수기 입력') : h('span', { class: 'who' }, kindBadge('ai'), `${shortName(e.by)} 보고`)),
          h('td', { class: 'muted' }, stamp(e.readAt), e.evidence ? [' · ', evidenceLink(e.evidence)] : null),
          h('td', { class: 'r num' }, money(e.amount, e.currency)),
          h('td', null, h('button', { class: 'x', 'aria-label': '지우기', onclick: () => { if (confirm('이 기록을 지울까요?')) act('DELETE', `/api/ui/revenue/${e.id}`, undefined, '지웠습니다'); } }, '×'))))))) : h('div', { class: 'empty' }, '아직 매출 기록이 없습니다')),
    h('section', { class: 'sec' }, secHead('채널 지표', 'YouTube Studio · 채널 담당 AI 보고'),
      metrics.length ? h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' },
        h('thead', null, h('tr', null, h('th', null, '기간'), h('th', null, '지표'), h('th', null, '보고'), h('th', null, '읽은 때'), h('th', { class: 'r' }, '값'), h('th', null, ''))),
        h('tbody', null, metrics.map((m) => h('tr', null, h('td', null, periodK(m.period)), h('td', null, m.name), h('td', null, shortName(m.by)),
          h('td', { class: 'muted' }, stamp(m.readAt), ' · ', evidenceLink(m.evidence)),
          h('td', { class: 'r num' }, `${Number(m.value).toLocaleString('ko-KR')}${m.unit ? ` ${m.unit}` : ''}`),
          h('td', null, h('button', { class: 'x', 'aria-label': '지우기', onclick: () => { if (confirm('이 지표를 지울까요?')) act('DELETE', `/api/ui/revenue/${m.id}`, undefined, '지웠습니다'); } }, '×'))))))) : h('div', { class: 'empty' }, '아직 지표 보고가 없습니다')),
    h('section', { class: 'sec' }, secHead('결제사'),
      h('ul', { class: 'list' }, d.business.payments.map((p) => {
        const c = R.connectors.find((x) => x.id === p.id);
        return h('li', null, h('div', { class: 'main' }, h('div', { class: 't' }, `${p.region} · ${p.name}`),
          h('div', { class: 's' }, `주 경로: 경리 담당 AI 가 대시보드를 읽어 보고 · 보조 API: ${c ? c.state : '연결 필요'}${c && c.message ? ` (${c.message})` : ''}`)),
        h('span', { class: `tag${c && c.state === '연결됨' ? ' solid' : ' ghost'}` }, c ? `API ${c.state}` : 'API 연결 필요'));
      })),
      h('div', { class: 'row', style: 'margin-top:12px' }, h('button', { class: 'btn sm', onclick: () => act('POST', '/api/ui/revenue/refresh', {}, 'API 를 다시 읽었습니다') }, 'API 다시 읽기'),
        h('span', { class: 'small muted' }, '키는 환경변수로만 받습니다: TOSS_SECRET_KEY, PAYPAL_CLIENT_ID, PAYPAL_SECRET'))),
    h('section', { class: 'sec' }, h('div', { class: 'cols' },
      simpleList('channels', '콘텐츠 채널', d.business.channels, '채널 이름'),
      simpleList('code', '공유 코드', d.business.code, '예: GitHub'))),
    h('section', { class: 'sec' }, simpleList('services', '운영 사업 서비스', d.business.services, '서비스 이름')));
}


window.HIDDEN = [
  { id: 'business', flag: 'revenue', label: '사업', fn: () => pageBusiness() },
  { id: 'messenger', flag: 'messenger', label: '사내 메신저', fn: () => pageMessenger() },
  { id: 'approvals', flag: 'approvals', label: '결재함', fn: () => pageApprovals() },
];
