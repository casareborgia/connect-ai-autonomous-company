// 처음 사용하는 대표(신규 사용자) 전체 여정 E2E 시뮬레이션:
// 1) 빈 홈에 깔린 9종 바이브코딩 툴 감지 → connect --dry-run → connect --yes (.bak 백업 + 기존 MCP 보존 + 깨진 JSON 보호)
// 2) 빈 회사로 본사 서버 첫 실행 → 1분 시작하기 온보딩 (Antigravity agy · OpenCode 자동 감지·채용)
// 3) 자동 실행 직원에게 할 일 추가(Add) 즉시 agy -p / opencode run 착수·완료·알림 + 위험 작업(발행/결제) 게이트 안전 정지
// 4) disconnect --yes 로 aihq 만 깔끔하게 제거 (기존 다른 MCP 서버 100% 유지)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { extractKoreanTime } from '../lib/util.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BIN = path.join(ROOT, 'bin', 'connect-ai-hq.mjs');

function makeMockBin(dir, name, script) {
  const p = path.join(dir, name);
  fs.writeFileSync(p, `#!/bin/sh\n${script}\n`, { mode: 0o755 });
  return p;
}

test('처음 사용자 E2E 시뮬레이션: 9종 툴 connect(--dry-run/--yes/disconnect) → 빈 회사 온보딩 → agy·opencode 추가 즉시 자동 착수 → 게이트 안전 정지', async () => {
  const rootTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aihq-sim-'));
  const fakeHome = path.join(rootTmp, 'home');
  const fakeBin = path.join(rootTmp, 'bin');
  const dataDir = path.join(rootTmp, 'data');
  const wsDir = path.join(rootTmp, 'ws');
  const cliLog = path.join(rootTmp, 'cli-calls.log');

  fs.mkdirSync(fakeHome, { recursive: true });
  fs.mkdirSync(fakeBin, { recursive: true });

  // 1) 신규 사용자 맥에 여러 바이브코딩 툴이 깔려 있는 환경 구성
  const mockClaude = makeMockBin(fakeBin, 'claude', `echo "claude $*" >> "${cliLog}"\nif [ "$1" = "mcp" ]; then echo '{"mcpServers":{"aihq":{}}}' > "${fakeHome}/.claude.json"; fi\necho "Claude mock OK"`);
  const mockCodex = makeMockBin(fakeBin, 'codex', `echo "codex $*" >> "${cliLog}"\nif [ "$1" = "mcp" ]; then mkdir -p "${fakeHome}/.codex"; printf '[mcp_servers.aihq]\\ncommand = "node"\\n' > "${fakeHome}/.codex/config.toml"; fi\necho "Codex mock OK"`);
  const mockAgy = makeMockBin(fakeBin, 'agy', `echo "agy $*" >> "${cliLog}"\nif [ "$1" = "mcp" ]; then mkdir -p "${fakeHome}/.gemini/antigravity"; echo '{"mcpServers":{"aihq":{}}}' > "${fakeHome}/.gemini/antigravity/mcp_config.json"; exit 0; fi\necho "Antigravity(agy) 가 작업을 완료했습니다: $2"`);
  const mockOpenCode = makeMockBin(fakeBin, 'opencode', `echo "opencode $*" >> "${cliLog}"\necho "OpenCode 가 작업을 완료했습니다: $2"`);
  const mockGemini = makeMockBin(fakeBin, 'gemini', `echo "gemini $*" >> "${cliLog}"\necho "Gemini mock OK"`);

  // 기존 사용자가 쓰던 Cursor / Windsurf / Claude Desktop / LM Studio 폴더 & 기존 MCP 서버 세팅
  fs.mkdirSync(path.join(fakeHome, '.cursor'), { recursive: true });
  fs.writeFileSync(path.join(fakeHome, '.cursor', 'mcp.json'), JSON.stringify({
    mcpServers: { github: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'] } },
  }, null, 2));
  fs.mkdirSync(path.join(fakeHome, '.codeium', 'windsurf'), { recursive: true });
  const cdDir = process.platform === 'darwin'
    ? path.join(fakeHome, 'Library', 'Application Support', 'Claude')
    : path.join(fakeHome, '.config', 'Claude');
  fs.mkdirSync(cdDir, { recursive: true });
  fs.writeFileSync(path.join(cdDir, 'claude_desktop_config.json'), JSON.stringify({
    mcpServers: { filesystem: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem'] } },
  }, null, 2));
  // LM Studio 에는 일부러 깨진 JSON 을 넣어 덮어쓰지 않고 안전하게 보호하는지 검증
  fs.mkdirSync(path.join(fakeHome, '.lmstudio'), { recursive: true });
  fs.writeFileSync(path.join(fakeHome, '.lmstudio', 'mcp.json'), '{ broken json not valid');

  const baseEnv = {
    ...process.env,
    HOME: fakeHome,
    PATH: `${fakeBin}:${process.env.PATH || ''}`,
    AIHQ_CLAUDE_BIN: mockClaude,
    AIHQ_CODEX_BIN: mockCodex,
    AIHQ_AGY_BIN: mockAgy,
    AIHQ_OPENCODE_BIN: mockOpenCode,
    AIHQ_GEMINI_BIN: mockGemini,
    AIHQ_CURSOR_BIN: '',
    AIHQ_WINDSURF_BIN: '',
    AIHQ_NO_NOTIFY: '1',
    AIHQ_NO_CAFFEINATE: '1',
  };

  let child = null;
  try {
    // STEP 1A: connect --dry-run (아무 파일도 수정하면 안 됨)
    const dry = spawnSync(process.execPath, [BIN, 'connect', '--dry-run'], { env: baseEnv, encoding: 'utf8' });
    assert.equal(dry.status, 0, dry.stderr);
    assert.match(dry.stdout, /미리보기/);
    assert.ok(!fs.existsSync(path.join(fakeHome, '.agents', 'skills', 'aihq-employee', 'SKILL.md')), 'dry-run 은 스킬을 쓰면 안 됨');
    assert.ok(!fs.existsSync(path.join(fakeHome, '.cursor', 'mcp.json.bak')), 'dry-run 은 백업을 만들면 안 됨');

    // STEP 1B: connect --yes (감지된 모든 바이브코딩 툴 한 번에 안전 연결)
    const conn = spawnSync(process.execPath, [BIN, 'connect', '--yes'], { env: baseEnv, encoding: 'utf8' });
    assert.equal(conn.status, 0, conn.stderr);
    assert.match(conn.stdout, /완료!/);

    // Cursor 기존 github MCP 보존 + aihq 추가 + .bak 백업 생성
    const cursorCfg = JSON.parse(fs.readFileSync(path.join(fakeHome, '.cursor', 'mcp.json'), 'utf8'));
    assert.ok(cursorCfg.mcpServers.github, '기존 Cursor github MCP 가 100% 유지되어야 함');
    assert.ok(cursorCfg.mcpServers.aihq, 'Cursor 에 aihq MCP 가 추가되어야 함');
    assert.ok(fs.existsSync(path.join(fakeHome, '.cursor', 'mcp.json.bak')), 'Cursor 설정 .bak 백업 생성');

    // Claude Desktop 기존 filesystem 보존 + aihq 추가
    const cdCfg = JSON.parse(fs.readFileSync(path.join(cdDir, 'claude_desktop_config.json'), 'utf8'));
    assert.ok(cdCfg.mcpServers.filesystem, '기존 Claude Desktop filesystem MCP 보존');
    assert.ok(cdCfg.mcpServers.aihq, 'Claude Desktop aihq MCP 추가');

    // Gemini CLI, OpenCode, Windsurf JSON 안전 병합 검증
    const gemCfg = JSON.parse(fs.readFileSync(path.join(fakeHome, '.gemini', 'settings.json'), 'utf8'));
    assert.equal(gemCfg.mcpServers.aihq.env.HQ_EMPLOYEE, 'gemini');
    const ocCfg = JSON.parse(fs.readFileSync(path.join(fakeHome, '.config', 'opencode', 'opencode.json'), 'utf8'));
    assert.equal(ocCfg.mcp.aihq.type, 'local');
    assert.equal(ocCfg.mcp.aihq.environment.HQ_EMPLOYEE, 'opencode');
    const wsCfg = JSON.parse(fs.readFileSync(path.join(fakeHome, '.codeium', 'windsurf', 'mcp_config.json'), 'utf8'));
    assert.ok(wsCfg.mcpServers.aihq);

    // 깨진 LM Studio JSON 은 덮어쓰지 않고 그대로 보호
    assert.equal(fs.readFileSync(path.join(fakeHome, '.lmstudio', 'mcp.json'), 'utf8'), '{ broken json not valid');

    // 스킬 설치 확인 (공용 + Claude + Codex + Antigravity + Cursor + OpenCode)
    for (const rel of [
      '.agents/skills/aihq-employee/SKILL.md',
      '.claude/skills/aihq-employee/SKILL.md',
      '.codex/skills/aihq-employee/SKILL.md',
      '.gemini/config/skills/aihq-employee/SKILL.md',
      '.cursor/skills/aihq-employee/SKILL.md',
      '.config/opencode/skills/aihq-employee/SKILL.md',
    ]) {
      assert.ok(fs.existsSync(path.join(fakeHome, rel)), `스킬 설치 누락: ${rel}`);
    }

    // STEP 2: 완전 빈 회사(시드 없음)로 본사 서버 첫 실행 → 1분 시작하기 온보딩
    const port = 19650 + Math.floor(Math.random() * 250);
    child = spawn(process.execPath, [path.join(ROOT, 'server.mjs')], {
      env: {
        ...baseEnv,
        AIHQ_PORT: String(port),
        AIHQ_DATA_DIR: dataDir,
        AIHQ_WORKSPACES: wsDir,
        AIHQ_NO_OPEN: '1',
        AIHQ_DISPATCH: '0',
        AIHQ_TEST_RAM_PCT: '40',
        AIHQ_LLM_MODEL: '',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const origin = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 60; i++) {
      try { const r = await fetch(`${origin}/api/state`); if (r.ok) break; } catch { /* wait */ }
      await new Promise((r) => setTimeout(r, 80));
    }
    const secret = fs.readFileSync(path.join(dataDir, '.human-session'), 'utf8').trim();
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

    const st0 = await (await fetch(`${origin}/api/state`)).json();
    assert.equal(st0.data.settings.onboarded, false, '처음 사용자는 1분 시작하기 화면으로 진입해야 함');
    assert.equal(st0.runners.agy, true, 'Antigravity(agy) 실행기 자동 감지');
    assert.equal(st0.runners.opencode, true, 'OpenCode 실행기 자동 감지');

    const det = await (await fetch(`${origin}/api/onboard/detect`)).json();
    assert.equal(det.claude, true);
    assert.equal(det.codex, true);
    assert.equal(det.agy, true);
    assert.equal(det.opencode, true);
    assert.equal(det.cursor, true);

    // 1분 시작하기 완료: 김민수 대표, 민수 스튜디오, 4개 AI 직원 채용
    const ob = await ui('POST', '/api/ui/onboard', {
      name: '김민수',
      company: '민수 스튜디오',
      ais: ['antigravity', 'opencode', 'claudecode', 'codex'],
      browsers: ['egolite'],
      quiet: { from: '23:00', to: '07:00' },
    });
    assert.equal(ob.status, 200);
    await ui('PATCH', '/api/ui/settings', { onboarded: true });

    const st1 = await (await fetch(`${origin}/api/state`)).json();
    const agyEmp = st1.data.employees.find((e) => e.engine === 'agy');
    const ocEmp = st1.data.employees.find((e) => e.engine === 'opencode');
    assert.ok(agyEmp && ocEmp, 'Antigravity 와 OpenCode 직원이 CLI 엔진으로 채용되어야 함');
    assert.equal(agyEmp.id, 'antigravity', 'connect --yes 를 온보딩 전에 먼저 실행해도 직원 ID 가 정확히 일치해야 함');
    assert.equal(ocEmp.id, 'opencode');
    assert.equal(agyEmp.runMode, 'auto', '온보딩 시 설치된 CLI AI 는 바로 자동 실행(auto) 상태로 시작해야 함');
    // MCP 출근(whoami)이 별칭(agy / claude)으로도 끊김 없이 연결되는지 확인
    const whoAgy = await fetch(`${origin}/api/agent/whoami?emp=antigravity`, { headers: { 'X-HQ-Agent': '1' } });
    assert.equal(whoAgy.status, 200);
    const whoClaudeAlias = await fetch(`${origin}/api/agent/whoami?emp=claude`, { headers: { 'X-HQ-Agent': '1' } });
    assert.equal(whoClaudeAlias.status, 200);

    // STEP 3: 자동 실행(auto) 켜고 할 일 추가(Add) → 즉시 최적 컴퓨터에서 착수 & 완료 & 알림 기록
    await ui('PATCH', `/api/ui/employees/${agyEmp.id}`, { runMode: 'auto', avatarName: '해태 에이전트' });
    await ui('PATCH', `/api/ui/employees/${ocEmp.id}`, { runMode: 'auto', avatarName: '청룡 코더' });

    const addAgy = await ui('POST', '/api/ui/tasks', { title: '랜딩페이지 카피 초안 써줘', assignee: agyEmp.id });
    assert.equal(addAgy.status, 200);
    assert.equal(addAgy.body.autoStarted, true, '자동 실행 AI 에게 일반 할 일을 추가하면 즉시 자동 착수해야 함');

    const addOc = await ui('POST', '/api/ui/tasks', { title: '테스트 스크립트 정리해줘', assignee: ocEmp.id });
    assert.equal(addOc.status, 200);
    assert.equal(addOc.body.autoStarted, true, 'OpenCode 도 추가 즉시 자동 착수해야 함');

    // 위험 게이트(발행)가 걸린 할 일은 자동 실행 직원이라도 절대 자동 출발하면 안 됨!
    const addRisky = await ui('POST', '/api/ui/tasks', { title: '네이버 블로그에 최종 글 발행해줘', assignee: agyEmp.id });
    assert.equal(addRisky.status, 200);
    assert.equal(addRisky.body.gate, '게시');
    assert.equal(addRisky.body.autoStarted, false, '위험 게이트 작업은 추가 즉시 자동 실행되면 안 됨');

    // 두 자동 착수 작업이 모두 완료될 때까지 대기
    let stDone = null;
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 120));
      stDone = await (await fetch(`${origin}/api/state`)).json();
      const t1 = stDone.data.tasks.find((t) => t.id === addAgy.body.id);
      const t2 = stDone.data.tasks.find((t) => t.id === addOc.body.id);
      if (t1?.status === '완료' && t2?.status === '완료') break;
    }
    const tAgy = stDone.data.tasks.find((t) => t.id === addAgy.body.id);
    const tOc = stDone.data.tasks.find((t) => t.id === addOc.body.id);
    const tRisky = stDone.data.tasks.find((t) => t.id === addRisky.body.id);
    assert.equal(tAgy?.status, '완료');
    assert.equal(tOc?.status, '완료');
    assert.equal(tRisky?.status, '대기', '위험 작업은 승인 전까지 대기로 안전하게 멈춰 있어야 함');
    assert.ok(stDone.recentNotifications.some((n) => n.title.includes('해태 에이전트') && n.title.includes('완료')), '완료 데스크탑 알림이 기록되어야 함');

    // MCP 결재 요청 시 알림 기록 검증
    const apprRes = await fetch(`${origin}/api/agent/approvals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-HQ-Agent': '1' },
      body: JSON.stringify({ from: agyEmp.id, kind: '게시', what: '블로그 초안 발행 승인 부탁드립니다' }),
    });
    assert.equal(apprRes.status, 200);
    const stAppr = await (await fetch(`${origin}/api/state`)).json();
    assert.ok(stAppr.recentNotifications.some((n) => n.title.includes('결재 요청')));

    // STEP 4: disconnect --yes 로 깔끔하게 제거 (기존 github / filesystem MCP 100% 보존)
    const disc = spawnSync(process.execPath, [BIN, 'disconnect', '--yes'], { env: baseEnv, encoding: 'utf8' });
    assert.equal(disc.status, 0, disc.stderr);
    const cursorAfter = JSON.parse(fs.readFileSync(path.join(fakeHome, '.cursor', 'mcp.json'), 'utf8'));
    assert.ok(cursorAfter.mcpServers.github, 'disconnect 후에도 기존 github MCP 보존');
    assert.equal(cursorAfter.mcpServers.aihq, undefined, 'disconnect 후 aihq MCP 제거');
    const cdAfter = JSON.parse(fs.readFileSync(path.join(cdDir, 'claude_desktop_config.json'), 'utf8'));
    assert.ok(cdAfter.mcpServers.filesystem, 'disconnect 후에도 기존 filesystem MCP 보존');
    assert.equal(cdAfter.mcpServers.aihq, undefined);
    assert.ok(!fs.existsSync(path.join(fakeHome, '.agents', 'skills', 'aihq-employee')), '공용 스킬 제거 완료');
  } finally {
    if (child) {
      child.kill('SIGTERM');
      await new Promise((r) => child.once('exit', r));
    }
    fs.rmSync(rootTmp, { recursive: true, force: true });
  }
});

test('한국어 시각 자동 추출 + 일반 실행 실패 시 다른 AI 자동 인계(failoverTrail) + 완료 결과물 요약(resultSummary) + 웹→로컬 1클릭 전환 실행', async () => {
  const fixedNow = new Date(2026, 10, 21, 17, 30, 0);
  assert.equal(extractKoreanTime('10분 뒤 이메일 체크', fixedNow), '17:40');
  assert.equal(extractKoreanTime('1시간 반 후 리포트 확인', fixedNow), '19:00');
  assert.equal(extractKoreanTime('오후 5:11 이메일 체크'), '17:11');
  assert.equal(extractKoreanTime('저녁 7:30 댓글 확인'), '19:30');
  assert.equal(extractKoreanTime('오전 12:15 새벽 점검'), '00:15');
  assert.equal(extractKoreanTime('오후 4시 30분 egolite로 들어가서 이메일 전부 체크'), '16:30');
  assert.equal(extractKoreanTime('오전 9시 반 회의 준비'), '09:30');
  assert.equal(extractKoreanTime('저녁 8시 라이브 방송'), '20:00');
  assert.equal(extractKoreanTime('아침 7시 산책'), '07:00');
  assert.equal(extractKoreanTime('16:45 메일 정리'), '16:45');
  assert.equal(extractKoreanTime('5분마다 이메일 체크'), null, '반복 주기는 시각으로 오인하면 안 됨');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aihq-failover-'));
  const binDir = path.join(dir, 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  const failClaude = makeMockBin(binDir, 'mock-claude-fail', 'echo "임시 오류 발생" >&2\nexit 1');
  const okCodex = makeMockBin(binDir, 'mock-codex-ok', 'echo "이메일 3건 확인 완료: 영수증 요청 1건 초안 저장됨"');

  const port = 19820 + Math.floor(Math.random() * 150);
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
      AIHQ_NO_NOTIFY: '1',
      AIHQ_NO_CAFFEINATE: '1',
      AIHQ_LLM_MODEL: '',
      AIHQ_CLAUDE_BIN: failClaude,
      AIHQ_CODEX_BIN: okCodex,
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
        headers: { Origin: origin, 'X-HQ-UI': '1', Cookie: `hq_human=${secret}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      return { status: r.status, body: await r.json().catch(() => null) };
    };

    // 1) "오후 4시 30분 ..." 추가 시 time="16:30" 자동 추출 확인
    const timed = await ui('POST', '/api/ui/tasks', { title: '오후 4시 30분 egolite로 들어가서 이메일 전부 체크', assignee: 'gemini' });
    assert.equal(timed.status, 200);
    assert.equal(timed.body.time, '16:30', '제목 속 한국어 시각이 time 필드에 자동 추출되어야 함');

    // 2) 웹 전용 Gemini 에 배정된 일을 1클릭 전환(switchTo=claude, enableAuto=true)으로 실행 →
    //    claude 가 일반 exit 1 로 실패 → codex 가 자동으로 이어받아 완료 & resultSummary + failoverTrail 기록!
    await ui('PATCH', '/api/ui/employees/codex', { runMode: 'auto' });
    await ui('PATCH', '/api/ui/employees/claude', { fallbackTo: 'codex' });
    const runRes = await ui('POST', `/api/ui/tasks/${timed.body.id}/run`, { switchTo: 'claude', enableAuto: true });
    assert.equal(runRes.status, 200);

    let doneTask = null;
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 120));
      const st = await (await fetch(`${origin}/api/state`)).json();
      doneTask = st.data.tasks.find((t) => t.id === timed.body.id);
      if (doneTask?.status === '완료') break;
    }
    assert.equal(doneTask?.status, '완료', 'claude 실패 후 codex 가 자동으로 이어받아 완료해야 함');
    assert.equal(doneTask?.completedBy, 'codex');
    assert.ok(doneTask?.completedAt, '완료 시각이 기록되어야 함');
    assert.match(doneTask?.resultSummary || '', /이메일 3건 확인 완료/, '완료 결과물 요약이 카드에 남아야 함');
    assert.equal(doneTask?.failoverTrail?.length, 1, '실패 자동 인계 기록이 남아야 함');
    assert.equal(doneTask.failoverTrail[0].from, 'claude');
    assert.equal(doneTask.failoverTrail[0].to, 'codex');
  } finally {
    child.kill('SIGTERM');
    await new Promise((r) => child.once('exit', r));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
