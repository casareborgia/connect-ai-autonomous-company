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
import { AVATAR_PRESETS, TEAMS, SWARM_MISSIONS, defaultTeamFor, defaultAvatarFor } from '../lib/catalog.mjs';
import { ruleAssign } from '../lib/assign.mjs';
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
    assert.equal(AVATAR_PRESETS.length, 37);
    assert.ok(AVATAR_PRESETS.some((p) => p.key === 'som'), '공식 사모예드 마스코트 솜이(som)가 포함되어야 함');
    assert.equal(TEAMS.length, 7);
    assert.equal(SWARM_MISSIONS.length, 4);
    assert.equal(defaultTeamFor({ name: 'Codex', role: '코딩, 테스트' }), 'dev');
    assert.equal(defaultTeamFor({ name: 'Claude 멤버십', role: '글쓰기, 기획, 대본' }), 'plan');
    assert.equal(defaultTeamFor({ name: 'Canva AI', role: '썸네일 디자인' }), 'design');
    assert.equal(defaultTeamFor({ name: '마케팅 AI', role: 'SNS 홍보' }), 'marketing');
    assert.equal(defaultAvatarFor({ name: 'Codex', role: '코딩' }, 'joseon', 0), 'jangyeongsil');
    assert.equal(defaultAvatarFor({ name: 'Codex', role: '코딩' }, 'joseon', 1), 'cheomseong');
    assert.equal(defaultAvatarFor({ name: 'Canva', role: '디자인' }, 'joseon', 0), 'hwawon');
    assert.equal(defaultAvatarFor({ name: 'Canva', role: '디자인' }, 'joseon', 1), 'saimdang');
    assert.equal(defaultAvatarFor({ name: 'Canva', role: '디자인' }, 'joseon', 2), 'angyeon');
    assert.equal(defaultAvatarFor({ name: 'Canva', role: '디자인' }, 'joseon', 3), 'yunbok');
    assert.equal(defaultAvatarFor({ name: 'Canva', role: '디자인' }, 'joseon', 4), 'chusa');
    assert.equal(defaultAvatarFor({ name: '마케팅 AI', role: 'SNS 홍보' }, 'joseon', 0), 'bobusang');
    assert.equal(defaultAvatarFor({ name: '마케팅 AI', role: 'SNS 홍보' }, 'joseon', 1), 'yein');
    assert.equal(defaultAvatarFor({ name: 'Claude 멤버십' }), 'dokkaebi');
    assert.equal(defaultAvatarFor({ name: 'Codex 멤버십' }), 'haetae');
    assert.equal(defaultAvatarFor({ name: 'Claude 멤버십' }, 'modern'), 'nova');
    assert.equal(defaultAvatarFor({ avatar: 'fox' }), 'dokkaebi');
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

    // 1) 캐릭터 프리셋 + 직접 이름 지정(avatarName) + 스타일 선택 + 안전한 PNG 업로드 허용, SVG XSS 차단
    const safePng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const avOk = await ui('PATCH', '/api/ui/employees/claude', {
      avatar: 'momo',
      avatarStyle: 'motion',
      avatarName: '도깨비 팀장',
      persona: '새벽에도 안 자는 기획자',
      avatarImage: safePng,
      runMode: 'manual',
    });
    assert.equal(avOk.status, 200);
    assert.equal(avOk.body.avatar, 'momo');
    assert.equal(avOk.body.avatarStyle, 'motion');
    assert.equal(avOk.body.avatarName, '도깨비 팀장');
    assert.equal(avOk.body.persona, '새벽에도 안 자는 기획자');

    // 직접 정한 캐릭터 이름(호칭)으로 할 일을 부르면 해당 직원에게 배분된다
    const stAfterName = await (await fetch(`${origin}/api/state`)).json();
    const byNick = ruleAssign('도깨비 팀장 오늘 회의록 요약해줘', '', stAfterName.data.employees, stAfterName.data.resources);
    assert.equal(byNick.assignee, 'claude');

    // 내 캐릭터 보관함 저장 · 삭제 + 잘못된 이미지 차단
    const cavBad = await ui('POST', '/api/ui/avatars', { name: '해커', image: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' });
    assert.equal(cavBad.status, 400);
    const cavOk = await ui('POST', '/api/ui/avatars', { name: '우리집 몽이', image: safePng, hint: '귀여운 비서' });
    assert.equal(cavOk.status, 200);
    assert.equal(cavOk.body.name, '우리집 몽이');
    assert.ok(cavOk.body.id);

    // 새 AI 직원 추가 시 캐릭터 이름 + 커스텀 이미지 바로 지정
    const newEmp = await ui('POST', '/api/ui/employees', {
      name: 'ChatGPT',
      role: '고객 답장',
      avatarName: '우리집 몽이',
      avatarImage: safePng,
    });
    assert.equal(newEmp.status, 200);
    assert.equal(newEmp.body.avatarName, '우리집 몽이');
    assert.equal(newEmp.body.avatarImage, safePng);

    // 청사진 내보내기에는 개인 캐릭터 이미지·보관함이 절대 유출되지 않는다
    const bp = await ui('GET', '/api/ui/blueprint/export');
    assert.equal(bp.status, 200);
    assert.ok(!JSON.stringify(bp.body).includes(safePng), '청사진에 커스텀 이미지가 포함되면 안 됨');

    const cavDel = await ui('DELETE', `/api/ui/avatars/${cavOk.body.id}`);
    assert.equal(cavDel.status, 200);

    const bulkStyle = await ui('POST', '/api/ui/employees/avatar-style', { avatarStyle: 'pixel', pack: 'k-crew' });
    assert.equal(bulkStyle.status, 200);
    assert.equal(bulkStyle.body.avatarStyle, 'pixel');
    assert.equal(bulkStyle.body.pack, 'k-crew');

    // 조선 AI 집현전 (20종 남·여 직업군) 일괄 전환 + 소속 팀/세종·소헌왕후/허준·대장금 + 합동 출동 검증
    const bulkJoseon = await ui('POST', '/api/ui/employees/avatar-style', { pack: 'joseon', rebalanceTeams: true });
    assert.equal(bulkJoseon.status, 200);
    assert.equal(bulkJoseon.body.avatarStyle, 'pixel');
    const teamPatch = await ui('PATCH', '/api/ui/employees/codex', { team: 'dev', avatar: 'jangyeongsil' });
    assert.equal(teamPatch.status, 200);
    assert.equal(teamPatch.body.team, 'dev');
    assert.equal(teamPatch.body.avatar, 'jangyeongsil');
    const royalSet = await ui('PATCH', '/api/ui/settings', { ownerAvatar: 'som', healthDoctor: 'daejanggeum' });
    assert.equal(royalSet.status, 200);
    assert.equal(royalSet.body.ownerAvatar, 'som');
    assert.equal(royalSet.body.healthDoctor, 'daejanggeum');
    const pxScript = await fetch(`${origin}/pixel-crew.js`);
    assert.equal(pxScript.status, 200);
    const dispatchRelay = await ui('POST', '/api/ui/swarm/dispatch', { missionKey: 'youtube', topic: 'CONNECT AI HQ v2 출시' });
    assert.equal(dispatchRelay.status, 200);
    assert.equal(dispatchRelay.body.stepMode, 'serial');
    assert.equal(dispatchRelay.body.steps.length, 3);
    assert.ok(dispatchRelay.body.title.includes('CONNECT AI HQ v2 출시'));
    const dispatchPar = await ui('POST', '/api/ui/swarm/dispatch', { missionKey: 'morning', topic: '아침 점검' });
    assert.equal(dispatchPar.status, 200);
    assert.equal(dispatchPar.body.stepMode, 'parallel');
    assert.equal(dispatchPar.body.steps.length, 3);

    const mascotRes = await fetch(`${origin}/mascots/haetae.jpg`);
    assert.equal(mascotRes.status, 200);
    assert.match(mascotRes.headers.get('content-type') || '', /image\/jpeg/);

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
