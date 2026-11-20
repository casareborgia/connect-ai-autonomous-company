// 서버 HTTP 보안 경계, 인수인계 게이트 방어, 매일 할 일 완료 기록, MCP 서버 통합 시험.
// 실행: node --test qa/server.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { detectGate } from '../lib/gates.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
    s.on('error', reject);
  });
}

async function startServer() {
  const port = await freePort();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aihq-srv-'));
  const child = spawn(process.execPath, [path.join(ROOT, 'server.mjs')], {
    env: { ...process.env, AIHQ_PORT: String(port), AIHQ_DATA_DIR: dir, AIHQ_WORKSPACES: path.join(dir, 'ws'), AIHQ_SEED: 'example', AIHQ_DISPATCH: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`${base}/api/state`); if (r.ok) break; } catch { /* 대기 */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  const secret = fs.readFileSync(path.join(dir, '.human-session'), 'utf8').trim();
  const stop = async () => {
    child.kill('SIGTERM');
    await new Promise((r) => child.once('close', r));
    fs.rmSync(dir, { recursive: true, force: true });
  };
  const ui = async (method, p, body) => {
    const r = await fetch(base + p, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Origin: base,
        'Sec-Fetch-Site': 'same-origin',
        'X-HQ-UI': '1',
        Cookie: `hq_human=${secret}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const agent = async (method, p, body) => {
    const r = await fetch(base + p, {
      method,
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'aihq-cli/1', 'X-HQ-Agent': '1' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  return { base, ui, agent, stop };
}

function mcpCall(base, employee, messages) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'mcp', 'server.mjs')], {
      env: { ...process.env, AIHQ_URL: base, HQ_EMPLOYEE: employee },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const out = [];
    let buf = '';
    child.stdout.on('data', (c) => {
      buf += c.toString('utf8');
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const l of lines) if (l.trim()) out.push(JSON.parse(l));
    });
    child.on('error', reject);
    child.on('close', () => resolve(out));
    for (const m of messages) child.stdin.write(`${JSON.stringify(m)}\n`);
    child.stdin.end();
  });
}

test('한국어 구독/멤버십 취소도 삭제 게이트에 걸린다', () => {
  assert.equal(detectGate('넷플릭스 구독 취소해줘'), '삭제');
  assert.equal(detectGate('멤버십 취소'), '삭제');
  assert.equal(detectGate('계정 취소 요청'), '삭제');
});

test('서버 보안 경계: 인수인계로 대표 일 탈취 및 게이트 우회 차단 + 잘못된 경로 400', async () => {
  const srv = await startServer();
  try {
    // 1. 대표(jay)의 할 일(t1)을 AI가 인수인계하려 하면 409 거절
    const hijack = await srv.agent('POST', '/api/agent/handoffs', { taskId: 't1', from: 'codex', to: 'claude', done: 'x', stuck: 'y', why: 'z' });
    assert.equal(hijack.status, 409);

    // 2. 게이트가 걸린 AI 할 일 생성 (광고비 결제 + 담당 codex)
    const created = await srv.ui('POST', '/api/ui/tasks', { title: '광고비 5만원 결제해줘', assignee: 'codex' });
    assert.equal(created.status, 200);
    assert.equal(created.body.gate, '결제');
    const tid = created.body.id;

    // 3. 다른 AI(claude)가 남의 할 일(codex)을 인수인계하려 하면 409 거절
    const other = await srv.agent('POST', '/api/agent/handoffs', { taskId: tid, from: 'claude', done: 'x', stuck: 'y', why: 'z' });
    assert.equal(other.status, 409);

    // 4. 담당자(codex)가 인수인계를 남긴 뒤, 다른 AI(claude)가 pickup 으로 게이트 우회 시도 → 403 차단!
    const hf = await srv.agent('POST', '/api/agent/handoffs', { taskId: tid, from: 'codex', done: '비교 완료', stuck: '결제 화면', why: '대표 확인 필요' });
    assert.equal(hf.status, 200);
    const bypass = await srv.agent('POST', `/api/agent/handoffs/${hf.body.id}/pickup`, { from: 'claude' });
    assert.equal(bypass.status, 403);

    // 5. 대표가 게이트 확인을 누른 뒤에는 pickup 성공
    const okGate = await srv.ui('POST', `/api/ui/tasks/${tid}/approve-gate`, {});
    assert.equal(okGate.status, 200);
    const picked = await srv.agent('POST', `/api/agent/handoffs/${hf.body.id}/pickup`, { from: 'claude' });
    assert.equal(picked.status, 200);

    // 6. 잘못된 퍼센트 인코딩 경로는 500이 아닌 400
    const badUri = await srv.agent('GET', '/api/agent/tasks/%E0%A4%A');
    assert.equal(badUri.status, 400);
  } finally {
    await srv.stop();
  }
});

test('매일 할 일: 지시서 수정 시 게이트 재검사 + AI 완료 시 routine.log 반영', async () => {
  const srv = await startServer();
  try {
    const rt = await srv.ui('POST', '/api/ui/routines', { title: '매일 시장 리포트 정리', assignee: 'codex' });
    assert.equal(rt.status, 200);
    assert.equal(rt.body.gate, null);

    // 지시서에 위험 단어 추가 시 게이트 감지
    const upd = await srv.ui('PATCH', `/api/ui/routines/${rt.body.id}`, { instruction: '리포트를 작성하고 뉴스레터 발송해줘' });
    assert.equal(upd.status, 200);
    assert.equal(upd.body.gate, '발송');

    // 일반 AI 루틴은 AI가 done 처리 시 routine.log 에 기록됨
    const rt2 = await srv.ui('POST', '/api/ui/routines', { title: '매일 뉴스 요약', assignee: 'codex' });
    await srv.ui('PATCH', `/api/ui/routines/${rt2.body.id}`, { enabled: true });
    const st = await srv.ui('GET', '/api/state');
    const task = st.body.data.tasks.find((t) => t.routineId === rt2.body.id);
    assert.ok(task, '오늘 할 일 생성됨');

    const done = await srv.agent('POST', `/api/agent/tasks/${task.id}/status`, { from: 'codex', status: 'done', result: '요약 끝' });
    assert.equal(done.status, 200);
    const st2 = await srv.ui('GET', '/api/state');
    const rAfter = st2.body.data.routines.find((r) => r.id === rt2.body.id);
    assert.equal(rAfter.log[task.date], '완료');
  } finally {
    await srv.stop();
  }
});

test('MCP 서버: 승인 요청 → 상태 확인 → 실행 기록 + 수신함 데이터 인용 + 금지 도구 없음', async () => {
  const srv = await startServer();
  try {
    const listRes = await mcpCall(srv.base, 'codex', [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    ]);
    const tools = listRes.find((m) => m.id === 2).result.tools.map((t) => t.name);
    assert.ok(tools.includes('list_approvals'));
    assert.ok(tools.includes('mark_approval_executed'));
    assert.ok(tools.includes('check_inbox'));
    assert.ok(!tools.some((n) => /approve_task|approve_request|edit_employee|delete_employee/i.test(n)));

    // MCP 로 승인 요청 후 list_approvals 확인
    const reqRes = await mcpCall(srv.base, 'codex', [
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'request_approval', arguments: { what: '댓글 답글 게시', kind: '게시', draft: '감사합니다!' } } },
      { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'list_approvals', arguments: {} } },
    ]);
    const appr = JSON.parse(reqRes.find((m) => m.id === 3).result.content[0].text);
    const list = JSON.parse(reqRes.find((m) => m.id === 4).result.content[0].text);
    assert.equal(list.find((a) => a.id === appr.id).status, '대기');

    // 대표가 UI 에서 승인
    const dec = await srv.ui('POST', `/api/ui/approvals/${appr.id}/decide`, { decision: '승인', finalText: '감사합니다, 대표님!' });
    assert.equal(dec.status, 200);

    // MCP 로 승인 문장 확인 및 실행 기록 + 수신함 데이터 인용 확인
    await srv.ui('POST', '/api/ui/messages', { thread: 'dm:codex', text: '안부 인사' });
    const afterRes = await mcpCall(srv.base, 'codex', [
      { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'list_approvals', arguments: {} } },
      { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'mark_approval_executed', arguments: { approval_id: appr.id } } },
      { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'check_inbox', arguments: { peek: true } } },
    ]);
    const list2 = JSON.parse(afterRes.find((m) => m.id === 5).result.content[0].text);
    assert.equal(list2.find((a) => a.id === appr.id).finalText, '감사합니다, 대표님!');
    assert.equal(afterRes.find((m) => m.id === 6).result.isError, false);
    const inboxText = afterRes.find((m) => m.id === 7).result.content[0].text;
    assert.match(inboxText, /\[데이터 시작/);
    assert.match(inboxText, /안부 인사/);
  } finally {
    await srv.stop();
  }
});

test('브라우저·오픈소스 자동 매칭 + 할 일→루틴 승격 + 루틴 릴레이 + MCP 도구 주입', async () => {
  const srv = await startServer();
  try {
    // 1. 기본 브라우저 Ego Lite 와 Aside, 오픈소스 Reverse Business 등록
    const b1 = await srv.ui('POST', '/api/ui/resources', { kind: '브라우저', name: 'Ego Lite', preset: 'ego-lite', isDefault: true });
    assert.equal(b1.status, 200);
    const b2 = await srv.ui('POST', '/api/ui/resources', { kind: '브라우저', name: 'Aside', preset: 'aside', isDefault: false });
    assert.equal(b2.status, 200);
    const o1 = await srv.ui('POST', '/api/ui/resources', { kind: '오픈소스', name: 'Reverse Business', preset: 'reversebusiness', when: '사업 분석, 경쟁사, 가격 분석' });
    assert.equal(o1.status, 200);

    // 2. 할 일 등록 시 기본 브라우저(Ego Lite) + 오픈소스(Reverse Business) 자동 매칭
    const t1 = await srv.ui('POST', '/api/ui/tasks', { title: '경쟁사 SaaS 사이트 가격 분석해줘' });
    assert.equal(t1.status, 200);
    assert.equal(t1.body.browser, b1.body.id);
    assert.ok(t1.body.tools.includes(o1.body.id));
    assert.match(t1.body.reason, /Ego Lite/);
    assert.match(t1.body.reason, /Reverse Business/);

    // 3. 어사이드를 직접 언급하면 Aside 로 매칭
    const t2 = await srv.ui('POST', '/api/ui/tasks', { title: 'Aside 브라우저로 새 웹페이지 QA 확인해줘' });
    assert.equal(t2.status, 200);
    assert.equal(t2.body.browser, b2.body.id);

    // 4. MCP get_task 와 whoami 에 브라우저·오픈소스 정보 포함
    const mcpRes = await mcpCall(srv.base, 'codex', [
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'whoami', arguments: {} } },
      { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'get_task', arguments: { task_id: t1.body.id } } },
    ]);
    const who = JSON.parse(mcpRes.find((m) => m.id === 1).result.content[0].text);
    assert.equal(who.defaultBrowser.name, 'Ego Lite');
    assert.ok(who.openSourceTools.some((x) => x.name === 'Reverse Business'));
    const taskTxt = mcpRes.find((m) => m.id === 2).result.content[0].text;
    assert.match(taskTxt, /Ego Lite/);
    assert.match(taskTxt, /Reverse Business/);

    // 5. 할 일을 1클릭으로 매일 루틴으로 승격 + 끝나면 넘기기(릴레이) 검증
    const promo = await srv.ui('POST', `/api/ui/tasks/${t1.body.id}/to-routine`, {});
    assert.equal(promo.status, 200);
    const rid = promo.body.routine.id;
    assert.equal(promo.body.routine.browser, b1.body.id);
    assert.ok(promo.body.routine.tools.includes(o1.body.id));

    await srv.ui('PATCH', `/api/ui/routines/${rid}`, { assignee: 'codex', nextAssignee: 'claude' });
    const done = await srv.agent('POST', `/api/agent/tasks/${t1.body.id}/status`, { from: 'codex', status: 'done', result: '경쟁사 3곳 가격표 분석 완료' });
    assert.equal(done.status, 200);

    const st = await srv.ui('GET', '/api/state');
    const follow = st.body.data.tasks.find((x) => x.title.includes('이어받기') && x.assignee === 'claude');
    assert.ok(follow, '루틴 완료 후 다음 담당(claude)에게 자동 이어받기 할 일 생성됨');
  } finally {
    await srv.stop();
  }
});

test('계정별 컴퓨터 유즈 권한 (금지 차단 · 승인 후 · 명시적 자동 허용 · 결제사 잠금 · MCP 노출)', async () => {
  const srv = await startServer({ seed: 'example' });
  try {
    // 1. Ego Lite 브라우저 켜고 Instagram · YouTube · 토스페이먼츠에 연결
    const br = await srv.ui('POST', '/api/ui/resources', { kind: '브라우저', name: 'Ego Lite', preset: 'ego-lite', isDefault: true });
    assert.equal(br.status, 200);
    await srv.ui('PATCH', '/api/ui/resources/a-instagram', { browser: br.body.id });
    await srv.ui('PATCH', '/api/ui/resources/a-youtube', { browser: br.body.id });

    // 2. 결제 계정은 환불/송금을 allow 로 바꾸려 해도 서버가 항상 deny 로 잠금
    const payPatch = await srv.ui('PATCH', '/api/ui/resources/a-toss', { permissions: { money: 'allow', settings: 'approval' } });
    assert.equal(payPatch.status, 200);
    assert.equal(payPatch.body.permissions.money, 'deny');
    assert.equal(payPatch.body.permissions.settings, 'deny');

    // 3. Instagram DM(금지)은 승인 요청도 차단되고, 수동 배정 후 AI claim 도 차단됨
    const blockedAppr = await srv.agent('POST', '/api/agent/approvals', { from: 'codex', what: '인스타그램 고객 DM 답장 보내기', kind: '발송' });
    assert.equal(blockedAppr.status, 403);
    assert.match(blockedAppr.body.error, /금지/);

    const dmTask = await srv.ui('POST', '/api/ui/tasks', { title: '인스타그램 DM 답장 보내줘' });
    assert.equal(dmTask.status, 200);
    assert.equal(dmTask.body.assignee, 'jay');
    await srv.ui('PATCH', `/api/ui/tasks/${dmTask.body.id}`, { assignee: 'codex' });
    const claimBlocked = await srv.agent('POST', `/api/agent/tasks/${dmTask.body.id}/claim`, { from: 'codex' });
    assert.equal(claimBlocked.status, 403);

    // 4. Instagram 이미지 등록(승인 후)은 승인 요청 가능하며 계정/행동 라벨이 붙음
    const okAppr = await srv.agent('POST', '/api/agent/approvals', { from: 'codex', what: '인스타그램에 오늘 카드뉴스 이미지 등록', kind: '업로드', draft: '캡션 초안' });
    assert.equal(okAppr.status, 200);
    assert.equal(okAppr.body.accountName, 'Instagram');
    assert.match(okAppr.body.accountAction, /이미지/);

    // 5. YouTube 비공개·초안 등록을 명시적으로 "자동"으로 열면 draft_auto 프리셋으로 인식 + AI 자동 배정 + Ego Lite 연결
    const ytPatch = await srv.ui('PATCH', '/api/ui/resources/a-youtube', { permissions: { draft_upload: 'allow' } });
    assert.equal(ytPatch.status, 200);
    assert.equal(ytPatch.body.preset, 'draft_auto');

    const ytDraft = await srv.ui('POST', '/api/ui/tasks', { title: '유튜브 쇼츠 영상 비공개로 업로드해줘' });
    assert.equal(ytDraft.status, 200);
    assert.notEqual(ytDraft.body.assignee, 'jay');
    assert.equal(ytDraft.body.gate, null);
    assert.equal(ytDraft.body.browser, br.body.id);
    assert.equal(ytDraft.body.account, 'a-youtube');

    // 하지만 YouTube 삭제는 여전히 금지되어 사람에게 남음
    const ytDel = await srv.ui('POST', '/api/ui/tasks', { title: '유튜브 예전 영상 삭제해줘' });
    assert.equal(ytDel.status, 200);
    assert.equal(ytDel.body.assignee, 'jay');

    // 6. whoami 및 get_task 에 계정 권한 정보가 정확히 노출됨
    const who = await srv.agent('GET', '/api/agent/whoami?emp=codex');
    assert.equal(who.status, 200);
    const ytAcc = who.body.accounts.find((a) => a.id === 'a-youtube');
    assert.ok(ytAcc);
    assert.equal(ytAcc.browser, 'Ego Lite');
    assert.equal(ytAcc.permissions.draft_upload, 'allow');

    const gt = await srv.agent('GET', `/api/agent/tasks/${ytDraft.body.id}`);
    assert.equal(gt.status, 200);
    assert.equal(gt.body.account.id, 'a-youtube');
    assert.equal(gt.body.account.permissions.draft_upload, 'allow');
  } finally {
    await srv.stop();
  }
});

test('THE FOUNDER 루틴 팩 (1클릭 담기 · 중복 방지 · 릴레이), 3종 직원 구분, 오늘의 리포트 민감정보 제외', async () => {
  const srv = await startServer({ seed: 'example' });
  try {
    // 1. 오픈소스 Reverse Business + Ego Lite 추가 후 EP.3 팩 담기
    await srv.ui('POST', '/api/ui/resources', { kind: '브라우저', name: 'Ego Lite', preset: 'ego-lite', isDefault: true });
    await srv.ui('POST', '/api/ui/resources', { kind: '오픈소스', name: 'Reverse Business', preset: 'reversebusiness' });

    const p1 = await srv.ui('POST', '/api/ui/routines/pack', { key: 'ep3-reverse' });
    assert.equal(p1.status, 200);
    assert.equal(p1.body.added, 2);
    assert.equal(p1.body.skipped, 0);
    const rbRoutine = p1.body.routines.find((r) => r.title.includes('리버스 비즈니스'));
    assert.ok(rbRoutine);
    assert.ok(rbRoutine.nextAssignee, 'EP.3 리버스 비즈니스 루틴은 다음 담당 릴레이가 자동 연결됨');

    // 같은 팩을 두 번 담아도 중복 생성되지 않음
    const p1Again = await srv.ui('POST', '/api/ui/routines/pack', { key: 'ep3-reverse' });
    assert.equal(p1Again.status, 200);
    assert.equal(p1Again.body.added, 0);
    assert.equal(p1Again.body.skipped, 2);

    // 2. 클라우드 직원(Muse) 카탈로그 추가 시 home-cloud 그룹으로 분류
    const emptySrv = await startServer({});
    try {
      const empRes = await emptySrv.ui('POST', '/api/ui/employees', { name: 'Muse', catalog: 'muse' });
      assert.equal(empRes.status, 200);
      assert.equal(empRes.body.group, 'home-cloud');
    } finally {
      await emptySrv.stop();
    }

    // 3. 오늘의 자율 회사 리포트: AI 완료 건수는 포함하되 매출 원금액은 절대 노출하지 않음
    await srv.ui('POST', '/api/ui/revenue', { source: '토스페이먼츠', amount: 9876543, currency: 'KRW', period: '2026-11' });
    const t = await srv.ui('POST', '/api/ui/tasks', { title: '오늘 영상 대본 초안 써줘', assignee: 'claude' });
    await srv.agent('POST', `/api/agent/tasks/${t.body.id}/status`, { from: 'claude', status: 'done', result: '대본 완성' });

    const rep = await srv.ui('GET', '/api/ui/report/daily');
    assert.equal(rep.status, 200);
    assert.ok(rep.body.counts.doneAi >= 1);
    assert.match(rep.body.text, /#CONNECTAIHQ/);
    assert.doesNotMatch(rep.body.text, /9876543|9,876,543/);
  } finally {
    await srv.stop();
  }
});

test('한국 크리에이터·비즈니스 채널 (네이버 블로그 · 네이버 클립 · 스마트스토어 · 카카오톡 채널) 및 임시저장만 자동 프리셋', async () => {
  const srv = await startServer({ seed: 'example' });
  try {
    // Ego Lite 를 기본 브라우저로 한 번만 켜 두면, 계정마다 브라우저를 따로 지정하지 않아도 자동 연결됨
    const br = await srv.ui('POST', '/api/ui/resources', { kind: '브라우저', name: 'Ego Lite', preset: 'ego-lite', isDefault: true });

    // 1. 네이버 블로그에 Claude 전담 AI 연결 후, 네이버 블로그 vs 네이버 클립 정확히 구분 + 기본 브라우저(Ego Lite) 자동 상속
    await srv.ui('PATCH', '/api/ui/resources/a-naver-blog', { assignee: 'claude' });
    const blogDraft = await srv.ui('POST', '/api/ui/tasks', { title: '네이버 블로그에 AI 교육 글 임시저장 등록해줘' });
    assert.equal(blogDraft.status, 200);
    assert.equal(blogDraft.body.account, 'a-naver-blog');
    assert.equal(blogDraft.body.assignee, 'claude');
    assert.equal(blogDraft.body.browser, br.body.id);
    assert.equal(blogDraft.body.gate, null);
    const gtBlog = await srv.agent('GET', `/api/agent/tasks/${blogDraft.body.id}`);
    assert.equal(gtBlog.body.account.browser, 'Ego Lite');
    assert.equal(gtBlog.body.account.assignee, 'claude');
    assert.equal(gtBlog.body.account.url, 'https://blog.naver.com');

    const blogPub = await srv.ui('POST', '/api/ui/tasks', { title: '네이버 블로그 포스트 공개 발행해줘' });
    assert.equal(blogPub.status, 200);
    assert.equal(blogPub.body.account, 'a-naver-blog');
    assert.equal(blogPub.body.assignee, 'jay');

    const clipDraft = await srv.ui('POST', '/api/ui/tasks', { title: '네이버 클립 영상 임시저장 등록해줘' });
    assert.equal(clipDraft.status, 200);
    assert.equal(clipDraft.body.account, 'a-naver-clip');
    assert.equal(clipDraft.body.browser, br.body.id);
    assert.notEqual(clipDraft.body.assignee, 'jay');
    assert.equal(clipDraft.body.gate, null);

    const clipDel = await srv.ui('POST', '/api/ui/tasks', { title: '네이버 클립 예전 영상 삭제해줘' });
    assert.equal(clipDel.status, 200);
    assert.equal(clipDel.body.account, 'a-naver-clip');
    assert.equal(clipDel.body.assignee, 'jay');

    // 2. YouTube 에 'draft_auto' 프리셋 적용 시 비공개 등록만 allow, 공개 게시는 approval, 삭제는 deny
    const ytAuto = await srv.ui('PATCH', '/api/ui/resources/a-youtube', { preset: 'draft_auto' });
    assert.equal(ytAuto.status, 200);
    assert.equal(ytAuto.body.preset, 'draft_auto');
    assert.equal(ytAuto.body.permissions.draft_upload, 'allow');
    assert.equal(ytAuto.body.permissions.publish, 'approval');
    assert.equal(ytAuto.body.permissions.delete, 'deny');

    // 3. 스마트스토어 환불·정산 영구 잠금 + 카카오톡 채널 전체 메시지 금지 차단
    const storeAcc = await srv.ui('POST', '/api/ui/resources', { kind: '계정', name: '스마트스토어', platform: 'smartstore' });
    assert.equal(storeAcc.status, 200);
    const unlockTry = await srv.ui('PATCH', `/api/ui/resources/${storeAcc.body.id}`, { permissions: { order_money: 'allow' } });
    assert.equal(unlockTry.body.permissions.order_money, 'deny');

    const kakaoAcc = await srv.ui('POST', '/api/ui/resources', { kind: '계정', name: '카카오톡 채널', platform: 'kakao' });
    assert.equal(kakaoAcc.status, 200);
    const kakaoBlast = await srv.agent('POST', '/api/agent/approvals', { from: 'codex', what: '카카오톡 채널 전체 공지 메시지 발송', kind: '발송' });
    assert.equal(kakaoBlast.status, 403);
  } finally {
    await srv.stop();
  }
});

test('팀 분업 워크플로우 (단계별 AI·사무실·도구 지정 · 순서대로 바통 터치 · 동시 병렬 협업 · MCP update_step)', async () => {
  const srv = await startServer({ seed: 'example' });
  try {
    const blender = await srv.ui('POST', '/api/ui/resources', { kind: '오픈소스', name: 'Blender', preset: 'blender' });
    const whisper = await srv.ui('POST', '/api/ui/resources', { kind: '오픈소스', name: 'Whisper', preset: 'whisper' });

    // 1. "영상 편집" 루틴 1개 생성 → 예시 4단계 채우기 + 공유 폴더 설정
    const rt = await srv.ui('POST', '/api/ui/routines', { title: '영상 편집', assignee: 'gemini' });
    assert.equal(rt.status, 200);
    await srv.ui('PATCH', `/api/ui/routines/${rt.body.id}`, { sharedFolder: '~/iCloud/영상편집' });
    const tpl = await srv.ui('POST', `/api/ui/routines/${rt.body.id}/steps/template`, { key: 'video-edit' });
    assert.equal(tpl.status, 200);
    assert.equal(tpl.body.routine.steps.length, 4);

    // 1단계 Claude(HQ·Whisper), 2단계 Gemini(맥 스튜디오·Blender), 3단계 Codex(맥북 에어), 4단계 대표
    const [s1, s2, s3, s4] = tpl.body.routine.steps;
    assert.equal(s2.assignee, 'gemini');
    assert.equal(s2.resource, 'studio');
    assert.ok(s2.tools.includes(blender.body.id));
    await srv.ui('PATCH', `/api/ui/routines/${rt.body.id}/steps/${s1.id}`, { assignee: 'claude', resource: 'mbp', tools: [whisper.body.id] });
    await srv.ui('PATCH', `/api/ui/routines/${rt.body.id}/steps/${s3.id}`, { assignee: 'codex', resource: 'mba' });
    await srv.ui('PATCH', `/api/ui/routines/${rt.body.id}/steps/${s4.id}`, { assignee: 'jay', resource: 'mbp' });

    // 오늘 자동 생성된 "영상 편집" 할 일에도 4단계 + 공유 폴더가 그대로 동기화됨
    const st0 = await srv.ui('GET', '/api/state');
    const task = st0.body.data.tasks.find((x) => x.routineId === rt.body.id);
    assert.ok(task);
    assert.equal(task.sharedFolder, '~/iCloud/영상편집');
    assert.equal(task.steps.length, 4);
    assert.equal(task.assignee, 'claude');

    // 2. 순서대로(serial) 모드: 앞 단계가 안 끝났는데 2단계(gemini)가 먼저 완료 시도하면 409 거절
    const early = await srv.agent('POST', `/api/agent/tasks/${task.id}/steps/${s2.id}/status`, { from: 'gemini', status: 'done', output: '미리 완료' });
    assert.equal(early.status, 409);

    // MCP update_step 으로 1단계(claude) 완료 → 자동으로 2단계(gemini · 맥 스튜디오)로 바통 터치!
    const mcpRes = await mcpCall(srv.base, 'claude', [
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'update_step', arguments: { task_id: task.id, step_id: s1.id, status: 'done', output: '~/iCloud/영상편집/cuts.json' } } },
    ]);
    assert.equal(mcpRes[0].result.isError, false);
    const afterS1 = await srv.agent('GET', `/api/agent/tasks/${task.id}`);
    assert.equal(afterS1.body.assignee, 'gemini');
    assert.equal(afterS1.body.resource, '맥 스튜디오');
    assert.equal(afterS1.body.steps[0].output, '~/iCloud/영상편집/cuts.json');

    // 3. 동시에 함께(parallel) 모드로 전환 → Office 1(gemini)과 Office 2(codex) 모두 본인 할 일 목록에서 동시 확인 및 병렬 완료!
    await srv.ui('PATCH', `/api/ui/tasks/${task.id}`, { stepMode: 'parallel' });
    const gemMine = await srv.agent('GET', '/api/agent/tasks?mine=gemini');
    const codexMine = await srv.agent('GET', '/api/agent/tasks?mine=codex');
    assert.ok(gemMine.body.some((x) => x.id === task.id));
    assert.ok(codexMine.body.some((x) => x.id === task.id));

    const d2 = await srv.agent('POST', `/api/agent/tasks/${task.id}/steps/${s2.id}/status`, { from: 'gemini', status: 'done', output: '3d_scene.mp4' });
    assert.equal(d2.status, 200);
    const d3 = await srv.agent('POST', `/api/agent/tasks/${task.id}/steps/${s3.id}/status`, { from: 'codex', status: 'done', output: 'motion_overlay.mov' });
    assert.equal(d3.status, 200);

    // 4단계(대표)까지 완료 체크하면 큰 일 전체가 자동 완료 + 루틴 오늘 기록 완료!
    const d4 = await srv.ui('PATCH', `/api/ui/tasks/${task.id}/steps/${s4.id}`, { status: '완료' });
    assert.equal(d4.status, 200);
    assert.equal(d4.body.task.status, '완료');
    const stFinal = await srv.ui('GET', '/api/state');
    const rFinal = stFinal.body.data.routines.find((x) => x.id === rt.body.id);
    assert.equal(rFinal.log[stFinal.body.today], '완료');
  } finally {
    await srv.stop();
  }
});
