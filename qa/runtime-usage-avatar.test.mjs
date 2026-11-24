import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { createPowerGuard } from '../lib/runtime.mjs';
import { scanClaudeUsage, scanCodexUsage, buildEmployeeUsageMap, detectClaudePlanTier } from '../lib/usage.mjs';
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
      AIHQ_TEST_RAM_PCT: '40',
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
    // 실제 DOM createElementNS 모의로 29종 스프라이트 전원 working/idle 렌더링 크래시 없음 검증
    const pxCode = await pxScript.text();
    const mockNode = (tag) => ({ tag, attrs: {}, kids: [], setAttribute(k, v) { this.attrs[k] = v; }, appendChild(c) { this.kids.push(c); return c; } });
    const win = {};
    new Function('window', 'document', pxCode)(win, { createElementNS: (_ns, tag) => mockNode(tag), createTextNode: (t) => ({ text: t }) });
    for (const key of Object.keys(win.PixelCrew.SPRITES)) {
      const a = win.PixelCrew.renderSvg(key, { size: 48, state: 'working' });
      const b = win.PixelCrew.renderSvg(key, { size: 48, state: 'idle' });
      assert.equal(a.tag, 'svg');
      assert.equal(b.tag, 'svg');
    }
    const cl = win.PixelCrew.renderAllClusterSvg(['som', 'jangyeongsil', 'seonbi'], { size: 48 });
    assert.equal(cl.tag, 'svg');
    const dispatchRelay = await ui('POST', '/api/ui/swarm/dispatch', { missionKey: 'youtube', topic: 'CONNECT AI HQ v2 출시' });
    assert.equal(dispatchRelay.status, 200);
    assert.equal(dispatchRelay.body.stepMode, 'serial');
    assert.equal(dispatchRelay.body.steps.length, 3);
    assert.ok(dispatchRelay.body.title.includes('CONNECT AI HQ v2 출시'));
    const dispatchPar = await ui('POST', '/api/ui/swarm/dispatch', { missionKey: 'morning', topic: '아침 점검' });
    assert.equal(dispatchPar.status, 200);
    assert.equal(dispatchPar.body.stepMode, 'parallel');
    assert.equal(dispatchPar.body.steps.length, 3);

    // 메인 AI · 메인 컴퓨터 설정 + Coordinator 자동 배분(단일 / 복합 릴레이 / 병렬+위험게이트) 검증
    const badCoord = await ui('PATCH', '/api/ui/settings', { mainAi: 'nonexistent_ai' });
    assert.equal(badCoord.status, 400);
    const badMac = await ui('PATCH', '/api/ui/settings', { mainMachine: 'nonexistent_mac' });
    assert.equal(badMac.status, 400);
    const st0 = await (await fetch(`${origin}/api/state`)).json();
    const firstMac = st0.data.resources.find((r) => r.kind === '기계');
    assert.ok(firstMac, '테스트 환경에 기계 리소스가 있어야 함');
    const coordSet = await ui('PATCH', '/api/ui/settings', { mainAi: 'claude', mainMachine: firstMac.id });
    assert.equal(coordSet.status, 200);
    assert.equal(coordSet.body.mainAi, 'claude');
    assert.equal(coordSet.body.mainMachine, firstMac.id);

    const delSingle = await ui('POST', '/api/ui/coordinator/delegate', { title: '로고 시안 만들어줘' });
    assert.equal(delSingle.status, 200);
    assert.equal(delSingle.body.delegated, true);
    assert.equal(delSingle.body.steps.length, 0, '명사 끝 "로고" 는 잘못 분할되면 안 됨');
    assert.equal(delSingle.body.resource, firstMac.id);
    assert.ok(delSingle.body.reason.includes('자동 배분'));

    const delMulti = await ui('POST', '/api/ui/coordinator/delegate', {
      title: '유튜브 대본 쓰고 썸네일 기획하고 인스타 홍보글 초안 만들어줘',
    });
    assert.equal(delMulti.status, 200);
    assert.equal(delMulti.body.delegated, true);
    assert.equal(delMulti.body.stepMode, 'serial');
    assert.equal(delMulti.body.steps.length, 3, '복합 목표는 3단계로 정확히 분할되어야 함');
    assert.equal(delMulti.body.steps[0].resource, firstMac.id);

    const delRisky = await ui('POST', '/api/ui/coordinator/delegate', {
      title: '경쟁사 트렌드 조사하고 결제 내역 바로 삭제해줘 동시에',
    });
    assert.equal(delRisky.status, 200);
    assert.equal(delRisky.body.stepMode, 'parallel');
    assert.ok(delRisky.body.gate, '결제/삭제 키워드가 포함된 복합 자동 배분도 승인 게이트가 걸려야 함');
    assert.equal(delRisky.body.autoStarted, false);

    // 직원별 스킬 · GitHub 오픈소스 연결 (1클릭 프리셋, 커스텀 모노레포 URL, 보안 차단, 자동 배분, 프롬프트 주입, 청사진 내보내기)
    const badSkill = await ui('POST', '/api/ui/employees/codex/skills', { name: '악성', repo: 'javascript:alert(1)' });
    assert.equal(badSkill.status, 400, 'https 이외의 스킬 주소는 거부해야 함');

    const addRemotion = await ui('POST', '/api/ui/employees/codex/skills', { presetKey: 'remotion' });
    assert.equal(addRemotion.status, 200);
    assert.equal(addRemotion.body.skill.name, 'Remotion');
    assert.equal(addRemotion.body.skill.repo, 'https://github.com/remotion-dev/remotion');
    assert.equal(addRemotion.body.skill.command, 'npx remotion');

    const addCustomGh = await ui('POST', '/api/ui/employees/codex/skills', {
      sourceInput: 'https://github.com/connect-ai-lab/creator-skills/tree/main/skills/shorts-edit',
      when: '숏폼 컷편집, 인트로 자막',
      skillPath: '/Users/secret/private/SKILL.md',
    });
    assert.equal(addCustomGh.status, 200);
    assert.equal(addCustomGh.body.skill.name, 'shorts-edit');
    assert.equal(addCustomGh.body.skill.repo, 'https://github.com/connect-ai-lab/creator-skills/tree/main/skills/shorts-edit');

    const delBySkill = await ui('POST', '/api/ui/coordinator/delegate', {
      title: '유튜브 인트로 모션그래픽 리모션으로 만들어줘',
    });
    assert.equal(delBySkill.status, 200);
    assert.equal(delBySkill.body.assignee, 'codex', 'Remotion 스킬을 장착한 직원에게 우선 배분되어야 함');
    assert.ok(delBySkill.body.reason.includes('Remotion'));

    const pr = await ui('GET', `/api/ui/tasks/${delBySkill.body.id}/prompt-preview`);
    assert.equal(pr.status, 200);
    assert.ok(pr.body.prompt.includes('https://github.com/remotion-dev/remotion'), '실행 프롬프트에 직원의 GitHub 스킬 주소가 자동 주입되어야 함');

    const bp2 = await ui('GET', '/api/ui/blueprint/export');
    assert.equal(bp2.status, 200);
    assert.ok(bp2.body.summary.employeeSkills >= 2);
    assert.ok(JSON.stringify(bp2.body.employeeSkills).includes('https://github.com/remotion-dev/remotion'));
    assert.ok(!JSON.stringify(bp2.body).includes('/Users/secret/private'), '청사진에 로컬 스킬 경로가 유출되면 안 됨');

    const patchSk = await ui('PATCH', `/api/ui/employees/codex/skills/${addCustomGh.body.skill.id}`, {
      name: '쇼츠 자동 편집',
      note: '9:16 세로 포맷',
    });
    assert.equal(patchSk.status, 200);
    assert.equal(patchSk.body.skill.name, '쇼츠 자동 편집');

    const delSk = await ui('DELETE', `/api/ui/employees/codex/skills/${addCustomGh.body.skill.id}`);
    assert.equal(delSk.status, 200);
    const delRem = await ui('DELETE', `/api/ui/employees/codex/skills/${addRemotion.body.skill.id}`);
    assert.equal(delRem.status, 200);

    // 청사진 가져오기로 수강생 회사에 직원 스킬이 자동 장착되는지 검증
    const bpImp = await ui('POST', '/api/ui/blueprint/import', { blueprint: bp2.body });
    assert.equal(bpImp.status, 200);
    assert.ok(bpImp.body.added.skills >= 2, '청사진 가져오기 시 직원 스킬이 자동 장착되어야 함');

    // Ego Lite 검색 요청은 미연결 직원(피클 등)이나 대표(jay)가 아닌 실제 연결된 실행 가능 AI에게, 운동 일정은 대표(jay)로 정확히 자동 분류
    const delEgo = await ui('POST', '/api/ui/coordinator/delegate', { title: 'ego lite 연결해서 구글에 호놀룰루 검색', time: '23:59' });
    assert.equal(delEgo.status, 200);
    assert.notEqual(delEgo.body.assignee, 'jay', 'Ego Lite 브라우저 검색은 AI 직원에게 자동 배분되어야 함');
    assert.equal(delEgo.body.assigneeRunnable, true, '실제 연결·실행 가능한 AI 직원에게 배분되어야 함');
    const delOps = await ui('POST', '/api/ui/coordinator/delegate', { title: '이메일 정리 및 점검해줘', time: '23:59' });
    assert.equal(delOps.status, 200);
    assert.equal(delOps.body.assigneeRunnable, true, 'ops 팀에 미연결 직원만 있어도 실제 연결된 AI 직원에게 배분되어야 함');
    const delGym = await ui('POST', '/api/ui/coordinator/delegate', { title: '오늘 오후 7시 운동' });
    assert.equal(delGym.status, 200);
    assert.equal(delGym.body.assignee, 'jay', '몸/현장이 필요한 운동 일정은 대표(jay)로 분류되어야 함');

    // 초 단위 예약("10초 뒤") · 후치 오전/오후("9시 30분 오전") · 개인 알람 예약 검증
    const del10s = await ui('POST', '/api/ui/coordinator/delegate', { title: '지금부터 10초 뒤에 이메일 체크' });
    assert.equal(del10s.status, 200);
    assert.equal(del10s.body.delaySec, 10);
    assert.ok(del10s.body.runAt, '10초 뒤 예약 시각(runAt)이 설정되어야 함');
    assert.equal(del10s.body.autoStarted, false, '10초 뒤 예약 작업은 즉시 착수하지 않고 10초 뒤 실행되어야 함');
    assert.equal(del10s.body.assigneeRunnable, true, '미연결 피클이 아닌 실제 연결 AI에게 배분되어야 함');

    const delAlarm = await ui('POST', '/api/ui/coordinator/delegate', { title: '11시 30분 오후 나한테 알람줘' });
    assert.equal(delAlarm.status, 200);
    assert.equal(delAlarm.body.isAlarm, true);
    assert.equal(delAlarm.body.time, '23:30');
    assert.equal(delAlarm.body.assignee, 'jay');

    // Orca 스타일 기본 에이전트(defaultEngine) 1클릭 전환 검증
    const defSwitch = await ui('PATCH', '/api/ui/settings', { defaultEngine: 'codex' });
    assert.equal(defSwitch.status, 200);
    assert.equal(defSwitch.body.mainAi, 'codex');

    // 오토메이션 1클릭 즉시 실행 검증
    const newAuto = await ui('POST', '/api/ui/routines', { title: '매일 아침 브리핑 오토메이션', time: '23:55', assignee: 'jay' });
    assert.equal(newAuto.status, 200);
    const runAuto = await ui('POST', `/api/ui/routines/${newAuto.body.id}/run-now`, {});
    assert.equal(runAuto.status, 200);
    assert.equal(runAuto.body.ok, true);
    assert.equal(runAuto.body.notified, true);
    assert.ok(runAuto.body.task?.id);

    // Orca 스타일 새 AI 직원(Bot) 생성: Computer + Agent + Model + Effort + Skill 한 번에 생성 검증
    const botRes = await ui('POST', '/api/ui/employees', {
      name: '영상편집 문어봇',
      role: '유튜브 모션그래픽 제작',
      manual: 'Remotion으로 9:16 세로 쇼츠 인트로를 제작합니다.',
      engine: 'claude',
      model: 'sonnet',
      effort: 'high',
      machineId: firstMac.id,
      team: 'design',
      avatar: 'hwawon',
      skills: [{ preset: 'remotion' }],
    });
    assert.equal(botRes.status, 200);
    assert.equal(botRes.body.model, 'sonnet');
    assert.equal(botRes.body.effort, 'high');
    assert.ok(botRes.body.resources.includes(firstMac.id));
    assert.equal(botRes.body.skills.length, 1);
    assert.equal(botRes.body.skills[0].repo, 'https://github.com/remotion-dev/remotion');
    await ui('DELETE', `/api/ui/employees/${botRes.body.id}`);

    const mascotRes = await fetch(`${origin}/mascots/haetae.jpg`);
    assert.equal(mascotRes.status, 200);
    assert.match(mascotRes.headers.get('content-type') || '', /image\/jpeg/);

    const avBadSvg = await ui('PATCH', '/api/ui/employees/claude', {
      avatarImage: 'data:image/svg+xml;base64,PHN2Zz48c2NyaXB0Pjwvc2NyaXB0Pjwvc3ZnPg==',
    });
    assert.equal(avBadSvg.status, 400, 'SVG data URI 는 보안상 거부해야 함');

    // 2) 절전 방지 + 에헴 말투(조선 집현전·야학) 설정 변경 확인
    const setOff = await ui('PATCH', '/api/ui/settings', { preventSleep: false, joseonVoice: false });
    assert.equal(setOff.status, 200);
    assert.equal(setOff.body.preventSleep, false);
    assert.equal(setOff.body.joseonVoice, false);

    const setJoseonOn = await ui('PATCH', '/api/ui/settings', { joseonVoice: true });
    assert.equal(setJoseonOn.status, 200);
    assert.equal(setJoseonOn.body.joseonVoice, true);

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

    // 4) 게이트 승인(approve-gate) 시 프롬프트에 "대표 승인 완료"가 주입되고, auto 직원은 즉시 실행까지 자동 착수
    await ui('PATCH', '/api/ui/employees/codex', { runMode: 'auto' });
    const gated = await ui('POST', '/api/ui/tasks', { title: '유튜브 커뮤니티 테스트 포스팅 게시해줘', assignee: 'codex' });
    assert.equal(gated.status, 200);
    assert.equal(gated.body.gate, '게시');
    assert.equal(gated.body.status, '대기');

    const beforePreview = await (await fetch(`${origin}/api/ui/tasks/${gated.body.id}/prompt-preview`)).json();
    assert.match(beforePreview.prompt, /결제, 업로드, 게시, 삭제, 메시지 발송은 직접 하지 않는다/);

    const approved = await ui('POST', `/api/ui/tasks/${gated.body.id}/approve-gate`, {});
    assert.equal(approved.status, 200);
    assert.ok(approved.body.gateApprovedAt);

    const afterPreview = await (await fetch(`${origin}/api/ui/tasks/${gated.body.id}/prompt-preview`)).json();
    assert.match(afterPreview.prompt, /대표 승인 완료: 게시/);
    assert.doesNotMatch(afterPreview.prompt, /결제, 업로드, 게시, 삭제, 메시지 발송은 직접 하지 않는다/);

    let gatedFinal = null;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 120));
      const st = await (await fetch(`${origin}/api/state`)).json();
      gatedFinal = st.data.tasks.find((t) => t.id === gated.body.id);
      if (gatedFinal?.status === '완료') break;
    }
    assert.equal(gatedFinal?.status, '완료', '대표 승인 1클릭만으로 추가 클릭 없이 즉시 실행·완료되어야 함');

    // 5) 실행 중인 AI 작업 1클릭 즉시 중단(POST /api/ui/tasks/:id/stop) → 대체 AI 인계 없이 즉시 종료·대기 복귀
    const slowTask = await ui('POST', '/api/ui/tasks', { title: '중단 테스트용 긴 작업', assignee: 'claude' });
    assert.equal(slowTask.status, 200);
    const slowRun = await ui('POST', `/api/ui/tasks/${slowTask.body.id}/run`, {});
    assert.equal(slowRun.status, 200);
    await new Promise((r) => setTimeout(r, 150));
    const stopRes = await ui('POST', `/api/ui/tasks/${slowTask.body.id}/stop`, {});
    assert.equal(stopRes.status, 200);
    assert.equal(stopRes.body.stopped, true);
    await new Promise((r) => setTimeout(r, 350));
    const stAfterStop = await (await fetch(`${origin}/api/state`)).json();
    const stoppedTask = stAfterStop.data.tasks.find((t) => t.id === slowTask.body.id);
    assert.equal(stoppedTask?.status, '대기', '대표가 중단한 작업은 대기 상태로 돌아가야 함');
    assert.equal(stoppedTask?.assignee, 'claude', '대표가 중단한 작업은 대체 AI로 자동 인계되면 안 됨');
    assert.equal(stAfterStop.working.some((w) => w.taskId === slowTask.body.id), false, '실행 목록에서 즉시 제거되어야 함');
  } finally {
    child.kill('SIGTERM');
    await new Promise((r) => child.once('exit', r));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Claude 플랜 티어 자동 감지: Ultra/Max 20x(50M) · Max 5x(16M) · Pro(4M) 정확 분리', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aihq-claude-tier-'));
  const prevEnv = process.env.AIHQ_CLAUDE_5H_BUDGET;
  delete process.env.AIHQ_CLAUDE_5H_BUDGET;
  try {
    // 기본값(파일 없음) → Pro 4M
    const defTier = detectClaudePlanTier(dir);
    assert.equal(defTier.tier, 'pro');
    assert.equal(defTier.budget5h, 4_000_000);

    // Claude Ultra / Max 20x → 50M
    fs.writeFileSync(path.join(dir, '.claude.json'), JSON.stringify({
      oauthAccount: { organizationType: 'claude_max', organizationRateLimitTier: 'default_claude_max_20x' },
    }));
    const ultraTier = detectClaudePlanTier(dir);
    assert.equal(ultraTier.tier, 'max_20x');
    assert.equal(ultraTier.budget5h, 50_000_000);
    assert.match(ultraTier.label, /Ultra|20x/);

    // Claude Max 5x → 16M
    fs.writeFileSync(path.join(dir, '.claude.json'), JSON.stringify({
      oauthAccount: { organizationType: 'claude_max', organizationRateLimitTier: 'default_claude_max_5x' },
    }));
    const max5Tier = detectClaudePlanTier(dir);
    assert.equal(max5Tier.tier, 'max_5x');
    assert.equal(max5Tier.budget5h, 16_000_000);
  } finally {
    if (prevEnv !== undefined) process.env.AIHQ_CLAUDE_5H_BUDGET = prevEnv;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
