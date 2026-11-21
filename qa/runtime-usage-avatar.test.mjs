import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { createPowerGuard } from '../lib/runtime.mjs';
import { scanClaudeUsage, scanCodexUsage, buildEmployeeUsageMap } from '../lib/usage.mjs';
import { AVATAR_PRESETS, defaultAvatarFor } from '../lib/catalog.mjs';
import { seedData } from '../lib/seed.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('작업 중 맥 잠자기 방지(caffeinate): 실행 중일 때만 켜고 끝나면 즉시 해제', () => {
  const events = [];
  const fakeSpawn = (cmd, args) => {
    const child = new EventEmitter();
    child.killed = false;
    child.kill = (sig) => { child.killed = true; events.push({ ev: 'kill', sig }); child.emit('exit', 0); };
    events.push({ ev: 'spawn', cmd, args });
    return child;
  };
  const pg = createPowerGuard({ platform: 'darwin', pid: 4321, spawnFn: fakeSpawn, disabled: false });
  assert.equal(pg.status().active, false);

  pg.sync(1, true);
  assert.equal(pg.status().active, true);
  assert.equal(events.length, 1);
  assert.equal(events[0].cmd, '/usr/bin/caffeinate');
  assert.deepEqual(events[0].args, ['-i', '-s', '-w', '4321']);

  // 작업이 2개로 늘어도 중복 spawn 하지 않음
  pg.sync(2, true);
  assert.equal(events.length, 1);

  // 작업 0개가 되면 즉시 종료
  pg.sync(0, true);
  assert.equal(pg.status().active, false);
  assert.equal(events[1].ev, 'kill');

  // 비활성화(preventSleep=false) 시 작업이 있어도 켜지 않음
  pg.sync(1, false);
  assert.equal(pg.status().active, false);
  assert.equal(events.length, 2);
});

test('로컬 세션 기반 Claude · Codex 5시간 토큰 사용량 스캔 (중복 제거 · 한도 주의 · 리셋 추정)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aihq-usage-'));
  try {
    const now = Date.now();
    const t1 = new Date(now - 90 * 60000).toISOString(); // 1시간 30분 전
    const t2 = new Date(now - 10 * 60000).toISOString(); // 10분 전

    // Claude JSONL (같은 message.id 중복 줄은 1회만 합산)
    const cProj = path.join(dir, 'claude', 'proj1');
    fs.mkdirSync(cProj, { recursive: true });
    fs.writeFileSync(path.join(cProj, 's1.jsonl'), [
      JSON.stringify({ type: 'assistant', timestamp: t1, message: { id: 'm1', usage: { input_tokens: 1000, output_tokens: 400000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } }),
      JSON.stringify({ type: 'assistant', timestamp: t1, message: { id: 'm1', usage: { input_tokens: 1000, output_tokens: 400000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } }),
      JSON.stringify({ type: 'assistant', timestamp: t2, message: { id: 'm2', usage: { input_tokens: 2000, output_tokens: 300000, cache_read_input_tokens: 10000, cache_creation_input_tokens: 0 } } }),
    ].join('\n') + '\n');

    const cu = scanClaudeUsage(path.join(dir, 'claude'), now, 4_000_000);
    assert.equal(cu.detected, true);
    assert.equal(cu.turns5h, 2, '같은 message.id 는 중복 합산되면 안 됨');
    // (1000 + 400000*5) + (2000 + 300000*5 + 1000) = 3,504,000 / 4,000,000 = 88%
    assert.equal(cu.pct5h, 88);
    assert.equal(cu.warning80, true);
    assert.ok(cu.resetInMin > 180 && cu.resetInMin <= 215);

    // Codex JSONL (명시적 rate_limits.primary.used_percent 우선 적용)
    const xDir = path.join(dir, 'codex', '2026');
    fs.mkdirSync(xDir, { recursive: true });
    fs.writeFileSync(path.join(xDir, 'rollout-1.jsonl'), [
      JSON.stringify({
        type: 'event_msg', timestamp: t2,
        payload: {
          type: 'token_count',
          info: { last_token_usage: { total_tokens: 250000 } },
          rate_limits: { primary: { used_percent: 64, resets_at: Math.floor((now + 120 * 60000) / 1000) } },
        },
      }),
    ].join('\n') + '\n');

    const xu = scanCodexUsage(path.join(dir, 'codex'), now);
    assert.equal(xu.detected, true);
    assert.equal(xu.pct5h, 64);
    assert.equal(xu.exactRateLimit, true);
    assert.ok(xu.resetInMin >= 118 && xu.resetInMin <= 122);

    const d = seedData();
    const map = buildEmployeeUsageMap(d, { claude: cu, codex: xu }, '2026-11-21', now);
    assert.equal(map.claude.pct5h, 88);
    assert.equal(map.codex.pct5h, 64);
    assert.equal(AVATAR_PRESETS.length, 8);
    assert.equal(defaultAvatarFor({ name: 'Claude 멤버십' }), 'fox');
    assert.equal(defaultAvatarFor({ name: 'Codex 멤버십' }), 'cat');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('서버 통합: 먹통 감시(hang-watchdog) 자동 인계 + AI 직원 캐릭터·이미지 보안 검증 + 절전 방지 설정', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aihq-rt-'));
  const binDir = path.join(dir, 'bin');
  fs.mkdirSync(binDir, { recursive: true });

  // Claude mock: 출력 없이 10초 동안 먹통(hang) 시뮬레이션
  const hangBin = path.join(binDir, 'mock-claude-hang');
  fs.writeFileSync(hangBin, '#!/bin/sh\nsleep 10\n', { mode: 0o755 });
  // Codex mock: 즉시 정상 완료
  const okBin = path.join(binDir, 'mock-codex-ok');
  fs.writeFileSync(okBin, '#!/bin/sh\necho "대체 직원이 먹통 작업을 정상 완료했습니다."\nexit 0\n', { mode: 0o755 });

  const port = 19980 + Math.floor(Math.random() * 400);
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
      AIHQ_HANG_MS: '1000', // 1초 무응답 시 먹통 감지
      AIHQ_NO_CAFFEINATE: '1',
      AIHQ_CLAUDE_BIN: hangBin,
      AIHQ_CODEX_BIN: okBin,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const origin = `http://127.0.0.1:${port}`;
  try {
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

    // 1) 캐릭터 프리셋 + 안전한 PNG 업로드 허용, SVG XSS data URI 차단
    const avOk = await ui('PATCH', '/api/ui/employees/claude', {
      avatar: 'whale',
      persona: '새벽에도 안 자는 기획자',
      avatarImage: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      runMode: 'manual',
    });
    assert.equal(avOk.status, 200);
    assert.equal(avOk.body.avatar, 'whale');
    assert.equal(avOk.body.persona, '새벽에도 안 자는 기획자');

    const avBadSvg = await ui('PATCH', '/api/ui/employees/claude', {
      avatarImage: 'data:image/svg+xml;base64,PHN2Zz48c2NyaXB0Pjwvc2NyaXB0Pjwvc3ZnPg==',
    });
    assert.equal(avBadSvg.status, 400, 'SVG data URI 는 보안상 거부해야 함');

    // 2) 절전 방지 설정 변경 확인
    const setOff = await ui('PATCH', '/api/ui/settings', { preventSleep: false });
    assert.equal(setOff.status, 200);
    assert.equal(setOff.body.preventSleep, false);

    // 3) 먹통 감시(1초) → claude(먹통) 자동 종료 후 fallbackTo(codex)가 이어받아 완료
    await ui('PATCH', '/api/ui/employees/codex', { runMode: 'manual' });
    const added = await ui('POST', '/api/ui/tasks', { title: '먹통 감시 자동 인계 테스트', assignee: 'claude' });
    assert.equal(added.status, 200);
    const tid = added.body.id;

    const started = await ui('POST', `/api/ui/tasks/${tid}/run`, {});
    assert.equal(started.status, 200);

    let finalTask = null;
    let msgs = [];
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 150));
      const st = await (await fetch(`${origin}/api/state`)).json();
      finalTask = st.data.tasks.find((t) => t.id === tid);
      msgs = st.data.messages.filter((m) => m.thread === `task:${tid}`);
      if (finalTask?.status === '완료') break;
    }
    assert.equal(finalTask?.status, '완료', '먹통 감지 후 대체 직원 codex 가 이어받아 완료해야 함');
    assert.equal(finalTask?.assignee, 'codex');
    assert.ok(msgs.some((m) => /무응답\(먹통\) 감지/.test(m.text)), '먹통 감지 시스템 로그가 남아야 함');
  } finally {
    child.kill('SIGTERM');
    await new Promise((r) => child.once('exit', r));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
