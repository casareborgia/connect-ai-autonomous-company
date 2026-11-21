import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  detectQuotaError, parseCooldownMinutes, pickFallbackEmployee,
  evaluateMachineHealth, pickOptimalMachine, isCoolingDown,
} from '../lib/optimizer.mjs';
import { seedData } from '../lib/seed.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('토큰·한도 오류 감지 및 복귀 시간 파싱 (429 · 5시간 한도 · 한국어)', () => {
  const q1 = detectQuotaError('Error 429: rate limit exceeded, try again in 45 minutes');
  assert.ok(q1);
  assert.equal(q1.minutes, 45);

  const q2 = detectQuotaError('You have hit your 5-hour usage limit. Retry after 2 hours.');
  assert.ok(q2);
  assert.equal(q2.minutes, 120);

  const q3 = detectQuotaError('멤버십 토큰 소진되었습니다. 30분 뒤 다시 시도해 주세요.');
  assert.ok(q3);
  assert.equal(q3.minutes, 30);

  const q4 = detectQuotaError('API server overloaded (529)');
  assert.ok(q4);
  assert.equal(q4.minutes, 15);

  assert.equal(detectQuotaError('정상적으로 파일 3개를 저장했습니다.'), null);
  assert.equal(parseCooldownMinutes('try again in 1 hour 20 minutes', 60), 80);
});

test('대체 AI 직원 체인 탐색 (순환 방지 · 쿨다운 건너뛰기 · 민감 로컬 작업 클라우드 유출 차단)', () => {
  const d = seedData();
  const future = new Date(Date.now() + 60 * 60000).toISOString();
  // claude → codex → gemma 체인
  d.employees.find((e) => e.id === 'claude').fallbackTo = 'codex';
  d.employees.find((e) => e.id === 'codex').fallbackTo = 'gemma';
  d.employees.find((e) => e.id === 'gemma').fallbackTo = 'claude'; // 순환 고리

  // codex 도 쿨다운 중이면 체인을 따라 gemma 로 우회
  d.employees.find((e) => e.id === 'codex').cooldownUntil = future;
  const fb1 = pickFallbackEmployee(d, 'claude', { requireRunnable: false });
  assert.ok(fb1);
  assert.equal(fb1.emp.id, 'gemma');
  assert.equal(fb1.viaChain, true);

  // 민감한 로컬 전용 작업(매출 원본)은 gemma(로컬)가 막혀도 클라우드(claude/codex)로 절대 우회하지 않음
  d.employees.find((e) => e.id === 'marketing').cooldownUntil = future; // 다른 로컬 AI도 휴식 중
  const fbSensitive = pickFallbackEmployee(d, 'gemma', {
    task: { title: '매출 원본 세금 신고 정리', localOnly: true },
    requireRunnable: false,
  });
  assert.equal(fbSensitive, null, '민감한 로컬 전용 작업은 외부 클라우드 AI로 우회하지 않아야 함');
});

test('컴퓨터 RAM 85% 상한 · 부하 신호등 · 대체 컴퓨터 우회 및 대기열 보호', () => {
  const d = seedData();
  const mbp = d.resources.find((r) => r.id === 'mbp');
  const studio = d.resources.find((r) => r.id === 'studio');
  const mba = d.resources.find((r) => r.id === 'mba');
  mbp.maxRamPct = 85;
  mbp.fallbackTo = 'studio';
  studio.status = '사용 가능';
  studio.health = { ramPct: 42, availGB: 36, totalGB: 64 };
  mba.status = '꺼짐';

  const makeLocal = (ramPct) => ({
    cpus: 8, load: [2.0, 1.8, 1.5],
    memory: { total: 32 * 1024 ** 3, available: Math.round(32 * 1024 ** 3 * ((100 - ramPct) / 100)) },
    disk: { total: 500 * 1024 ** 3, free: 200 * 1024 ** 3 },
  });

  // 1) RAM 60% → 여유(ok) → 맥북 프로 그대로 선택
  const hOk = evaluateMachineHealth(mbp, { localStat: makeLocal(60) });
  assert.equal(hOk.level, 'ok');
  const optOk = pickOptimalMachine(d, { title: '이메일 요약' }, d.employees.find((e) => e.id === 'claude'), { localStat: makeLocal(60) });
  assert.equal(optOk.resource.id, 'mbp');
  assert.equal(optOk.rerouted, false);
  assert.equal(optOk.queued, false);

  // 2) RAM 89% (상한 85% 초과) → 과부하(overload) → 대체 컴퓨터(맥 스튜디오)로 자동 우회
  const hOver = evaluateMachineHealth(mbp, { localStat: makeLocal(89) });
  assert.equal(hOver.level, 'overload');
  const optReroute = pickOptimalMachine(d, { title: '이메일 요약' }, d.employees.find((e) => e.id === 'claude'), { localStat: makeLocal(89) });
  assert.equal(optReroute.resource.id, 'studio');
  assert.equal(optReroute.rerouted, true);
  assert.equal(optReroute.queued, false);

  // 3) 대체 컴퓨터(스튜디오)까지 RAM 91% 과부하 → 뻗지 않도록 대기열(queued: true)
  studio.health = { ramPct: 91, availGB: 5, totalGB: 64 };
  const optQueue = pickOptimalMachine(d, { title: '블렌더 3D 렌더' }, d.employees.find((e) => e.id === 'gemini'), { localStat: makeLocal(89) });
  assert.equal(optQueue.queued, true);
});

async function startTestServer(extraEnv = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aihq-opt-'));
  const port = 19100 + Math.floor(Math.random() * 800);
  const child = spawn(process.execPath, [path.join(ROOT, 'server.mjs')], {
    env: {
      ...process.env,
      AIHQ_PORT: String(port),
      AIHQ_DATA_DIR: dir,
      AIHQ_WORKSPACES: path.join(dir, 'ws'),
      AIHQ_SEED: 'example',
      AIHQ_NO_OPEN: '1',
      AIHQ_DISPATCH: '0',
      AIHQ_LLM_MODEL: '',
      ...extraEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', (c) => { out += c; });
  child.stderr.on('data', (c) => { out += c; });
  const origin = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`${origin}/api/state`); if (r.ok) break; } catch { /* wait */ }
    await new Promise((r) => setTimeout(r, 80));
  }
  const secret = fs.readFileSync(path.join(dir, '.human-session'), 'utf8').trim();
  const ui = async (method, url, body) => {
    const r = await fetch(`${origin}${url}`, {
      method,
      headers: {
        Origin: origin,
        'X-HQ-UI': '1',
        Cookie: `hq_human=${secret}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const stop = async () => {
    child.kill('SIGTERM');
    await new Promise((r) => child.once('close', r));
    fs.rmSync(dir, { recursive: true, force: true });
  };
  return { dir, origin, ui, stop, logs: () => out };
}

test('실시간 실행 중 토큰 한도(429) 발생 → 자동 쿨다운 + 대체 AI 즉시 이어받아 완료', async () => {
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aihq-bins-'));
  const claudeBin = path.join(binDir, 'mock-claude');
  const codexBin = path.join(binDir, 'mock-codex');
  fs.writeFileSync(claudeBin, '#!/bin/sh\necho "Error 429: usage limit reached, try again in 45 minutes" >&2\nexit 1\n', { mode: 0o755 });
  fs.writeFileSync(codexBin, '#!/bin/sh\necho "Codex가 멈춘 지점부터 이어서 완료했습니다."\nexit 0\n', { mode: 0o755 });

  const srv = await startTestServer({
    AIHQ_CLAUDE_BIN: claudeBin,
    AIHQ_CODEX_BIN: codexBin,
    AIHQ_TEST_RAM_PCT: '45',
  });
  try {
    // claude(1순위) → codex(2순위) 모두 수동 실행 켜기
    await srv.ui('PATCH', '/api/ui/employees/claude', { runMode: 'manual', fallbackTo: 'codex' });
    await srv.ui('PATCH', '/api/ui/employees/codex', { runMode: 'manual' });

    // 대표가 Claude 직접 지정 + 컴퓨터는 자동 배정 확인
    const created = await srv.ui('POST', '/api/ui/tasks', { title: '강의 커리큘럼 초안 작성', assignee: 'claude' });
    assert.equal(created.status, 200);
    assert.equal(created.body.assignee, 'claude');
    assert.equal(created.body.resource, 'mbp', '직접 지정 시에도 컴퓨터는 최적 컴퓨터(mbp)로 자동 배정됨');

    // 실행 시작 → Claude 가 429 로 실패하고 자동으로 Codex 로 넘겨 완료해야 함
    const runRes = await srv.ui('POST', `/api/ui/tasks/${created.body.id}/run`, {});
    assert.equal(runRes.status, 200);
    assert.equal(runRes.body.started, true);

    let finalTask = null;
    let finalState = null;
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 120));
      const st = await srv.ui('GET', '/api/state');
      finalState = st.body;
      finalTask = st.body.data.tasks.find((x) => x.id === created.body.id);
      if (finalTask?.status === '완료' && finalTask.assignee === 'codex') break;
    }
    assert.equal(finalTask.assignee, 'codex', '토큰 소진 후 대체 직원(codex)으로 자동 인계됨');
    assert.equal(finalTask.status, '완료', '대체 직원(codex)이 멈춘 지점부터 이어받아 완료함');

    const claudeEmp = finalState.data.employees.find((e) => e.id === 'claude');
    assert.equal(isCoolingDown(claudeEmp), true, 'Claude 에 자동 쿨다운이 설정됨');

    // 수동 쿨다운 해제 API 확인
    const clear = await srv.ui('POST', '/api/ui/employees/claude/cooldown', { minutes: 0 });
    assert.equal(clear.status, 200);
    assert.equal(clear.body.cooldownUntil, null);
  } finally {
    await srv.stop();
    fs.rmSync(binDir, { recursive: true, force: true });
  }
});

test('컴퓨터 RAM 85% 초과 과부하 시 실행 차단 및 대기열(queued) 보호 + 실시간 추천 경고', async () => {
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aihq-bins-ram-'));
  const claudeBin = path.join(binDir, 'mock-claude');
  fs.writeFileSync(claudeBin, '#!/bin/sh\necho "should not run"\nexit 0\n', { mode: 0o755 });

  const srv = await startTestServer({
    AIHQ_CLAUDE_BIN: claudeBin,
    AIHQ_TEST_RAM_PCT: '91',
  });
  try {
    await srv.ui('PATCH', '/api/ui/employees/claude', { runMode: 'manual' });
    await srv.ui('PATCH', '/api/ui/resources/mbp', { maxRamPct: 85 });
    await srv.ui('PATCH', '/api/ui/resources/studio', { status: '꺼짐' });
    await srv.ui('PATCH', '/api/ui/resources/mba', { status: '꺼짐' });

    // 1. /api/state 에 실시간 machineHealth (overload · RAM 91%) 와 rev 포함
    const st = await srv.ui('GET', '/api/state');
    assert.equal(st.status, 200);
    assert.equal(st.body.machineHealth.mbp.level, 'overload');
    assert.equal(st.body.machineHealth.mbp.ramPct, 91);
    assert.ok(st.body.rev >= 1);

    // 2. /api/ui/assign/suggest 에서 직접 지정 + 과부하 대기열 미리보기 확인
    const sug = await srv.ui('POST', '/api/ui/assign/suggest', { title: '보고서 초안', assignee: 'claude' });
    assert.equal(sug.status, 200);
    assert.equal(sug.body.machineQueued, true);

    // 3. 실행 시도 → RAM 91% (상한 85%) 이므로 실행하지 않고 대기열 등록
    const created = await srv.ui('POST', '/api/ui/tasks', { title: '보고서 초안', assignee: 'claude' });
    const runRes = await srv.ui('POST', `/api/ui/tasks/${created.body.id}/run`, {});
    assert.equal(runRes.status, 200);
    assert.equal(runRes.body.started, false);
    assert.equal(runRes.body.queued, true);
    assert.match(runRes.body.reason, /91%|과부하|대기열/);

    const st2 = await srv.ui('GET', '/api/state');
    const queuedTask = st2.body.data.tasks.find((x) => x.id === created.body.id);
    assert.equal(queuedTask.queued, true);
    assert.equal(queuedTask.status, '대기');
  } finally {
    await srv.stop();
    fs.rmSync(binDir, { recursive: true, force: true });
  }
});

test('처음 시작(빈 상태 온보딩) 시 AI 직원·사무실 대체 순위 및 RAM 85% 상한 자동 연결', async () => {
  const srv = await startTestServer({ AIHQ_SEED: '' });
  try {
    const ob1 = await srv.ui('POST', '/api/ui/onboard', {
      name: '민지',
      company: '민지 스튜디오',
      ais: ['chatgpt', 'claude'],
      machines: ['Mac Studio'],
      browsers: ['egolite'],
    });
    assert.equal(ob1.status, 200);
    const st = await srv.ui('GET', '/api/state');
    assert.equal(st.body.data.employees.length, 2);
    assert.ok(st.body.data.employees.every((e) => Boolean(e.fallbackTo) && e.fallbackTo !== e.id), '온보딩으로 채용한 AI 직원 간 대체 순위가 자동 연결됨');
    const machines = st.body.data.resources.filter((r) => r.kind === '기계');
    assert.equal(machines.length, 2);
    assert.ok(machines.every((m) => m.maxRamPct === 85 && Boolean(m.fallbackTo) && m.fallbackTo !== m.id), '이 컴퓨터 ↔ Mac Studio 간 RAM 85% 상한 및 대체 컴퓨터가 자동 연결됨');
  } finally {
    await srv.stop();
  }
});
