import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { exportBlueprint } from '../lib/blueprint.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STUB = path.join(ROOT, 'qa', 'stub-agent.mjs');

async function startServer() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aihq-collab-rl-'));
  const port = 19650 + Math.floor(Math.random() * 250);
  const child = spawn(process.execPath, [path.join(ROOT, 'server.mjs')], {
    cwd: ROOT,
    env: {
      ...process.env,
      AIHQ_PORT: String(port),
      AIHQ_DATA_DIR: path.join(dir, 'data'),
      AIHQ_WORKSPACES: path.join(dir, 'ws'),
      AIHQ_SEED: 'example',
      AIHQ_NO_OPEN: '1',
      AIHQ_DISPATCH: '0',
      AIHQ_AUTO_ENABLE: '1',
      AIHQ_NO_NOTIFY: '1',
      AIHQ_NO_CAFFEINATE: '1',
      AIHQ_NO_BROWSER_PROBE: '1',
      AIHQ_NO_OLLAMA_EMBED: '1',
      AIHQ_TEST_RAM_PCT: '35',
      AIHQ_LLM_MODEL: '',
      AIHQ_CLAUDE_BIN: STUB,
      AIHQ_CODEX_BIN: STUB,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const origin = `http://127.0.0.1:${port}`;
  const dataDir = path.join(dir, 'data');
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${origin}/api/state`);
      if (r.ok) {
        const secret = (await fs.readFile(path.join(dataDir, '.human-session'), 'utf8')).trim();
        const cookie = `hq_human=${secret}`;
        return {
          origin,
          cookie,
          dataDir,
          async ui(method, p, body) {
            const res = await fetch(`${origin}${p}`, {
              method,
              headers: { 'Content-Type': 'application/json', 'X-HQ-UI': '1', 'Sec-Fetch-Site': 'same-origin', Origin: origin, Cookie: cookie },
              body: body === undefined ? undefined : JSON.stringify(body),
            });
            return { status: res.status, body: await res.json().catch(() => null) };
          },
          async agent(method, p, body) {
            const res = await fetch(`${origin}${p}`, {
              method,
              headers: { 'Content-Type': 'application/json', 'User-Agent': 'aihq-mcp/1', 'X-HQ-Agent': '1' },
              body: body === undefined ? undefined : JSON.stringify(body),
            });
            return { status: res.status, body: await res.json().catch(() => null) };
          },
          async close() {
            child.kill('SIGTERM');
            await new Promise((res) => child.once('exit', res));
            await fs.rm(dir, { recursive: true, force: true });
          },
        };
      }
    } catch { /* wait */ }
    await new Promise((r) => setTimeout(r, 80));
  }
  child.kill('SIGKILL');
  throw new Error('collab-rl 테스트 서버 기동 시간 초과');
}

async function waitForTaskDone(srv, taskId, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const st = await srv.ui('GET', '/api/state');
    const t = st.body?.data?.tasks?.find((x) => x.id === taskId);
    if (t && t.status === '완료') return t;
    await new Promise((r) => setTimeout(r, 120));
  }
  const st = await srv.ui('GET', '/api/state');
  return st.body?.data?.tasks?.find((x) => x.id === taskId) || null;
}

test('AI 직원 멀티 협업(자동 릴레이 바통 터치 + 진짜 병렬 동시 실행) + 대표 의사결정 강화학습(RL·DPO) E2E 검증', async () => {
  const srv = await startServer();
  try {
    // 1) 단일 요청 + collab=true (릴레이): 서로 다른 AI 직원 2명이 1단계 완료 즉시 2단계 자동 바통 터치하여 끝까지 완료!
    const relayRes = await srv.ui('POST', '/api/ui/coordinator/delegate', {
      title: '12월 AI 부트캠프 랜딩페이지 핵심 카피 3줄 작성',
      collab: true,
      collabMode: 'serial',
    });
    assert.equal(relayRes.status, 200);
    assert.equal(relayRes.body.steps.length, 2, 'collab=true 시 2단계 협업으로 편성되어야 함');
    assert.notEqual(relayRes.body.steps[0].assignee, relayRes.body.steps[1].assignee, '서로 다른 AI 직원 2명이 협업해야 함');
    assert.equal(relayRes.body.autoStarted, true);

    const relayDone = await waitForTaskDone(srv, relayRes.body.id);
    assert.equal(relayDone?.status, '완료', '1단계 종료 후 2단계가 수동 조작 없이 자동 바통 터치로 완료되어야 함');
    assert.equal(relayDone.steps.every((s) => s.status === '완료' && Boolean(s.output)), true);
    assert.ok(relayDone.resultSummary.length > 0);

    // 2) 동시(병렬) 협업(collabMode='parallel'): 두 AI 직원이 실제로 동시 실행되어 모두 완료되고 결과 합산!
    const parRes = await srv.ui('POST', '/api/ui/coordinator/delegate', {
      title: '유튜브 채널 리브랜딩 방향성 제안',
      collab: true,
      collabMode: 'parallel',
    });
    assert.equal(parRes.status, 200);
    assert.equal(parRes.body.stepMode, 'parallel');
    assert.equal(parRes.body.steps.length, 2);
    assert.notEqual(parRes.body.steps[0].assignee, parRes.body.steps[1].assignee);

    const parDone = await waitForTaskDone(srv, parRes.body.id);
    assert.equal(parDone?.status, '완료', '병렬 협업 2단계가 모두 자동 완료되어야 함');
    assert.equal(parDone.steps.every((s) => s.status === '완료'), true);

    // 3) 대표 의사결정 기억 + 강화학습(DPO 선호쌍 · 반려 기준) 자동 주입 & JSONL 내보내기 검증
    const appr1 = await srv.agent('POST', '/api/agent/approvals', {
      from: 'codex',
      kind: '댓글 답글',
      what: '유튜브 커뮤니티 민감 댓글 답글',
      draft: '에헴~ 농담 반 진담 반으로 답글 달아드립니다!',
    });
    assert.equal(appr1.status, 200);

    // 대표가 초안을 진중하게 수정해 승인 → reward +0.6 & DPO chosen/rejected 쌍 생성!
    const dec1 = await srv.ui('POST', `/api/ui/approvals/${appr1.body.id}/decide`, {
      decision: '승인',
      finalText: '소중한 의견 감사합니다. 진심으로 귀 기울여 개선하겠습니다.',
      note: '민감한 지적 댓글엔 장난기 빼고 정중하게',
    });
    assert.equal(dec1.status, 200);
    assert.equal(dec1.body.rl.outcome, 'edited');
    assert.equal(dec1.body.rl.reward, 0.6);
    assert.equal(dec1.body.rl.hasPair, true);

    // 대표가 두 번째 요청을 반려 + 사유 기록 → reward -1.0
    const appr2 = await srv.agent('POST', '/api/agent/approvals', {
      from: 'codex',
      kind: '댓글 답글',
      what: '과장된 홍보 댓글 초안',
      draft: '무조건 100% 대박 나는 AI 비밀 공개!',
    });
    const dec2 = await srv.ui('POST', `/api/ui/approvals/${appr2.body.id}/decide`, {
      decision: '반려',
      note: '과장 표현 금지',
    });
    assert.equal(dec2.status, 200);
    assert.equal(dec2.body.rl.outcome, 'rejected');
    assert.equal(dec2.body.rl.reward, -1.0);

    // 4) 다음 유사 작업의 프롬프트에 대표의 수정 선호 & 반려 기준이 자동 주입되는지 검증!
    const nextCommentTask = await srv.ui('POST', '/api/ui/tasks', {
      title: '유튜브 커뮤니티 새 댓글에 답글 초안 작성',
      assignee: 'codex',
    });
    assert.equal(nextCommentTask.status, 200);
    const prev = await srv.ui('GET', `/api/ui/tasks/${nextCommentTask.body.id}/prompt-preview`);
    assert.equal(prev.status, 200);
    assert.match(prev.body.prompt, /대표의 과거 의사결정 기준/);
    assert.match(prev.body.prompt, /진심으로 귀 기울여 개선하겠습니다/);
    assert.match(prev.body.prompt, /과장 표현 금지/);

    // 5) RL DPO JSONL 내보내기 (브라우저 동일 출처 GET은 Origin 없음 포함) + 에이전트/외부 차단 검증
    const browserGet = await fetch(`${srv.origin}/api/ui/rl/export`, {
      headers: { 'X-HQ-UI': '1', 'Sec-Fetch-Site': 'same-origin', Cookie: srv.cookie },
    });
    assert.equal(browserGet.status, 200, '브라우저 동일 출처 GET(Origin 미포함)에서 DPO 내보내기가 200이어야 함');
    const agentBlocked = await srv.agent('GET', '/api/ui/rl/export');
    assert.equal(agentBlocked.status, 403, 'AI 직원은 대표 RL 내보내기에 접근할 수 없어야 함');
    const evilOriginBlocked = await fetch(`${srv.origin}/api/ui/rl/export`, {
      headers: { 'X-HQ-UI': '1', Origin: 'http://evil.example', Cookie: srv.cookie },
    });
    assert.equal(evilOriginBlocked.status, 403, '외부 Origin은 차단되어야 함');

    const rlExp = await srv.ui('GET', '/api/ui/rl/export');
    assert.equal(rlExp.status, 200);
    assert.equal(rlExp.body.total, 2);
    assert.equal(rlExp.body.dpoPairs, 1);
    assert.equal(rlExp.body.rows.length, 2);
    assert.equal(rlExp.body.rows[0].chosen, '소중한 의견 감사합니다. 진심으로 귀 기울여 개선하겠습니다.');
    assert.equal(rlExp.body.rows[0].rejected, '에헴~ 농담 반 진담 반으로 답글 달아드립니다!');

    // 결제는 3번 연속 그대로 승인해도 절대 autoPromote 제안이 나오면 안 됨!
    for (let i = 0; i < 3; i++) {
      const pAp = await srv.agent('POST', '/api/agent/approvals', { from: 'codex', kind: '결제', what: `클라우드 결제 ${i + 1}`, amount: 10000 });
      const pDec = await srv.ui('POST', `/api/ui/approvals/${pAp.body.id}/decide`, { decision: '승인' });
      assert.equal(pDec.body.autoPromote, null, '결제는 몇 번 승인해도 자동 승격 제안되면 안 됨');
    }

    // 비위험 '댓글 답글'을 3번 연속 무수정 승인하면 autoPromote 제안이 나와야 함
    let promoted = null;
    for (let i = 0; i < 3; i++) {
      const cAp = await srv.agent('POST', '/api/agent/approvals', { from: 'codex', kind: '댓글 답글', what: `감사 댓글 ${i + 1}`, draft: '감사합니다!' });
      const cDec = await srv.ui('POST', `/api/ui/approvals/${cAp.body.id}/decide`, { decision: '승인', finalText: '감사합니다!' });
      if (cDec.body.autoPromote) promoted = cDec.body.autoPromote;
    }
    assert.ok(promoted && promoted.streak >= 3, '비위험 댓글 3연속 무수정 승인 시 자동 승격 제안이 나와야 함');

    // 청사진 내보내기 시 비공개 의사결정 기록이 포함되지 않는지 확인
    const stNow = await srv.ui('GET', '/api/state');
    assert.ok(stNow.body.rl.total >= 5);
    const bp = exportBlueprint(stNow.body.data);
    assert.equal(bp.decisionMemory, undefined);
  } finally {
    await srv.close();
  }
});
