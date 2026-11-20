// 1분 시작하기와 마무리 묶음: AI 도구 연결 명령 (보여 주기만), ssh 설정에서 컴퓨터 찾기, 자는 시간, Muse 읽는 곳 (이 맥 / 사무실)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { connectTargets, mcpLaunch, sshHosts, shellLine } from '../lib/connect.mjs';
import { isQuiet } from '../lib/scheduler.mjs';
import { runMuseOnce, MUSE_DEFAULTS } from '../lib/muse.mjs';

test('MCP 명령: 패키지 폴더면 node 경로, npx 임시 폴더면 npx', () => {
  assert.deepEqual(mcpLaunch('/opt/hq'), { command: 'node', args: ['/opt/hq/mcp/server.mjs'] });
  assert.deepEqual(mcpLaunch('/Users/a/.npm/_npx/abc/node_modules/connect-ai-hq'), { command: 'npx', args: ['-y', 'connect-ai-hq', 'mcp'] });
  assert.equal(shellLine(['node', '/a b/c.mjs', "it's"]), "node '/a b/c.mjs' 'it'\\''s'");
});

test('AI 도구 연결: 찾고 명령만 만든다, 이미 들어 있으면 알아본다', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aihq-home-'));
  try {
    const t0 = connectTargets({ home, root: '/opt/hq', employees: [{ id: 'cc', name: 'Claude Code', engine: 'claude' }] });
    const claude = t0.find((t) => t.key === 'claude');
    assert.equal(claude.employee, 'cc');
    assert.deepEqual(claude.mcp.cli.slice(0, 6), ['claude', 'mcp', 'add', '-s', 'user', 'aihq']);
    assert.ok(claude.mcp.cli.includes('HQ_EMPLOYEE=cc'));
    assert.equal(claude.mcp.configured, false);
    assert.equal(claude.skill.installed, false);
    assert.equal(claude.skill.to, path.join(home, '.claude', 'skills', 'aihq-employee'));
    const gemini = t0.find((t) => t.key === 'gemini');
    assert.equal(gemini.mcp.cli, undefined, 'Gemini 설정 파일은 직접 고치지 않고 보여 주기만');
    assert.equal(JSON.parse(gemini.mcp.snippet).mcpServers.aihq.env.HQ_EMPLOYEE, 'gemini');
    fs.mkdirSync(path.join(home, '.codex'));
    fs.writeFileSync(path.join(home, '.codex', 'config.toml'), 'model = "x"\n\n[mcp_servers.aihq]\ncommand = "node"\n');
    fs.writeFileSync(path.join(home, '.claude.json'), '{"mcpServers":{"aihq":{}}}');
    const t1 = connectTargets({ home, root: '/opt/hq' });
    assert.equal(t1.find((t) => t.key === 'codex').mcp.configured, true);
    assert.equal(t1.find((t) => t.key === 'claude').mcp.configured, true);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('ssh 설정에서 컴퓨터 찾기: 별칭만, 코드 저장소 호스트와 와일드카드는 뺀다', () => {
  const cfg = 'Host github.com\n  HostName github.com\nHost box mini-2 office-3\n  HostName 10.0.0.7\nHost render\n  HostName render.local\nHost *\n  ServerAliveInterval 30\nHost gl\n  HostName gitlab.com\n';
  assert.deepEqual(sshHosts(cfg), ['office-3', 'render']);
  assert.deepEqual(sshHosts(''), []);
});

test('자는 시간: 자정을 넘겨도 맞게 본다', () => {
  const at = (h, m) => new Date(2026, 10, 20, h, m);
  const q = { from: '23:00', to: '07:00' };
  assert.equal(isQuiet(q, at(23, 30)), true);
  assert.equal(isQuiet(q, at(3, 0)), true);
  assert.equal(isQuiet(q, at(7, 0)), false);
  assert.equal(isQuiet(q, at(12, 0)), false);
  assert.equal(isQuiet({ from: '13:00', to: '14:00' }, at(13, 30)), true);
  assert.equal(isQuiet(null, at(3, 0)), false);
});

function fakeStore(muse, resources = []) {
  const store = { data: { owner: { name: '대표' }, settings: { muse: { ...MUSE_DEFAULTS, ...muse, seen: {} } }, resources, tasks: [], employees: [], messages: [] } };
  store.mutate = async (fn) => fn(store.data);
  return store;
}
const helpers = (msgs) => ({
  addMsg: (d, m) => msgs.push(m),
  makeEmployee: (d) => { const e = { id: 'muse', name: 'Muse' }; d.employees.push(e); return e; },
  makeInbox: (d) => { const t = { id: 't1', title: 'Muse 대화', museInbox: true, status: '대기' }; d.tasks.push(t); return t; },
  summarize: (s) => s.slice(0, 10),
  log: () => {},
});

test('Muse 읽는 곳 = 이 맥: ssh 없이 이 맥의 ego lite 로 읽는다', async () => {
  assert.equal(MUSE_DEFAULTS.host, 'local');
  assert.equal(MUSE_DEFAULTS.enabled, false, '기본 꺼짐');
  const store = fakeStore({ host: 'local', enabled: true });
  const msgs = [];
  let ran = null;
  const out = { status: 'ok', conversations: [{ key: 'c1', title: '가짜', messages: [{ role: 'muse', text: '안녕하세요' }] }] };
  const n = await runMuseOnce(store, { ...helpers(msgs), findEgo: () => '/fake/ego-browser', runEgo: async (bin, input) => { ran = { bin, input }; return { code: 0, out: `x\nAIHQ_JSON ${JSON.stringify(out)}\n`, err: '' }; } });
  assert.equal(n, 1);
  assert.equal(ran.bin, '/fake/ego-browser');
  assert.ok(ran.input.includes('"url":"https://muse.ai/"'));
  assert.equal(store.data.settings.muse.status, 'ok');
  assert.equal(msgs[0].via, 'muse-reader');
});

test('Muse 읽는 곳 = 이 맥: ego lite 가 없거나 로그인 전이면 이 맥 기준으로 알린다', async () => {
  const s1 = fakeStore({ host: 'local', enabled: true });
  await runMuseOnce(s1, { ...helpers([]), findEgo: () => null, runEgo: async () => { throw new Error('실행하면 안 됨'); } });
  assert.equal(s1.data.settings.muse.status, 'noego');
  assert.match(s1.data.settings.muse.statusText, /이 맥/);
  const s2 = fakeStore({ host: 'local', enabled: true });
  await runMuseOnce(s2, { ...helpers([]), findEgo: () => '/fake', runEgo: async () => ({ code: 0, out: 'AIHQ_JSON {"status":"login_required","conversations":[]}', err: '' }) });
  assert.equal(s2.data.settings.muse.status, 'login');
  assert.match(s2.data.settings.muse.statusText, /이 맥에서 ego lite 로 Muse 에 한 번 로그인/);
});

test('Muse 읽는 곳 = 사무실: 사무실 기계가 없으면 이 맥으로 대신 읽지 않는다', async () => {
  const store = fakeStore({ host: 'office', enabled: true, res: null });
  await runMuseOnce(store, { ...helpers([]), findEgo: () => { throw new Error('이 맥을 쓰면 안 됨'); } });
  assert.equal(store.data.settings.muse.status, 'error');
  assert.match(store.data.settings.muse.statusText, /사무실/);
});
