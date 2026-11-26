// 자동화 직원을 본사 서버째로 시험한다: 임시 데이터 폴더로 서버를 띄우고 화면 요청으로 직원, 할 일, 실행까지.
// 실행: node --test qa/automation-server.test.mjs  (진짜 본사와 섞이지 않게 포트와 폴더를 따로 쓴다)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aihq-srv-'));
const marker = path.join(tmp, 'pwned');
const script = (name, body) => { const p = path.join(tmp, name); fs.writeFileSync(p, `#!/bin/sh\n${body}\n`, { mode: 0o755 }); return p; };
const autoFile = path.join(tmp, 'automations.json');
fs.writeFileSync(autoFile, JSON.stringify({ automations: [
  { id: 'listen', title: '리스닝', command: [script('ok.sh', 'echo "수집 3건 (할 일 $AIHQ_TASK_ID)"')] },
  { id: 'broken', title: '고장', command: [script('fail.sh', 'echo "로그인 풀림" >&2; exit 4')] },
  { id: 'slow', title: '느림', command: [script('slow.sh', 'sleep 30')] },
] }), { mode: 0o600 });

let port; let server; let cookie = '';
const freePort = () => new Promise((resolve) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });

function request(method, p, { body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const req = http.request({ host: '127.0.0.1', port, path: p, method, headers: { ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}), ...headers } }, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => { let json = null; try { json = JSON.parse(buf); } catch { /* html */ } resolve({ status: res.statusCode, json, headers: res.headers }); });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}
// 대표가 본사 화면에서 누른 요청
const ui = (method, p, body) => request(method, p, { body, headers: { Origin: `http://127.0.0.1:${port}`, 'X-HQ-UI': '1', Cookie: cookie } });
// AI 직원(CLI, MCP)이 보낸 요청
const agent = (method, p, body) => request(method, p, { body, headers: { 'X-HQ-Agent': '1' } });

async function waitStatus(taskId, want) {
  for (let i = 0; i < 80; i++) {
    const t = (await agent('GET', `/api/agent/tasks/${taskId}`)).json;
    if (want.includes(t.status)) return t;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`할 일 ${taskId} 가 ${want} 로 바뀌지 않음`);
}

before(async () => {
  port = await freePort();
  server = spawn(process.execPath, [path.join(ROOT, 'server.mjs')], {
    env: { ...process.env, AIHQ_PORT: String(port), AIHQ_DATA_DIR: path.join(tmp, 'data'), AIHQ_WORKSPACES: path.join(tmp, 'workspaces'), AIHQ_AUTOMATIONS: autoFile, AIHQ_DISPATCH: '0', AIHQ_SEED: '' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 100; i++) {
    try { await request('GET', '/api/state'); break; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  // 브라우저로 직접 연 사람에게만 주는 세션 쿠키를 받는다
  const page = await request('GET', '/', { headers: { 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'document' } });
  cookie = String(page.headers['set-cookie'] || '').split(';')[0];
  assert.match(cookie, /^hq_human=/);
});

after(() => { if (server) server.kill('SIGTERM'); fs.rmSync(tmp, { recursive: true, force: true }); });

let empId;

test('화면에 등록된 자동화 목록이 나온다 (명령은 내보내지 않는다)', async () => {
  const s = (await request('GET', '/api/state')).json;
  assert.deepEqual(s.automations.list, [{ id: 'listen', title: '리스닝' }, { id: 'broken', title: '고장' }, { id: 'slow', title: '느림' }]);
  assert.ok(s.options.engines.includes('script'));
  assert.ok(!JSON.stringify(s.automations).includes('ok.sh'));
});

test('자동화 직원을 만들고 등록된 자동화만 고를 수 있다', async () => {
  const made = await ui('POST', '/api/ui/employees', { name: '리스닝 봇', engine: 'script' });
  assert.equal(made.status, 200);
  empId = made.json.id;
  assert.equal(made.json.engine, 'script');
  assert.equal((await ui('PATCH', `/api/ui/employees/${empId}`, { automation: 'nope' })).status, 400);
  const ok = await ui('PATCH', `/api/ui/employees/${empId}`, { automation: 'listen', runMode: 'manual' });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.automation, 'listen');
  assert.equal(ok.json.runMode, 'manual');
});

test('AI 직원 경로로는 자동화를 바꾸거나 실행할 수 없다', async () => {
  assert.equal((await agent('PATCH', `/api/ui/employees/${empId}`, { automation: 'broken' })).status, 403);
  const t = (await ui('POST', '/api/ui/tasks', { title: '리스닝 한 번', assignee: empId })).json;
  assert.equal((await agent('POST', `/api/ui/tasks/${t.id}/run`, {})).status, 403);
});

test('실행하면 등록된 명령이 돌고 결과가 스레드에 남는다. 할 일의 글은 실행되지 않는다', async () => {
  const t = (await ui('POST', '/api/ui/tasks', { title: `리스닝 $(touch ${marker}); echo`, note: '`touch ' + marker + '`', assignee: empId })).json;
  assert.equal(t.assignee, empId);
  const run = await ui('POST', `/api/ui/tasks/${t.id}/run`, {});
  assert.equal(run.status, 200);
  assert.equal(run.json.label, '자동화 · 리스닝');
  const done = await waitStatus(t.id, ['완료', '막힘']);
  assert.equal(done.status, '완료');
  const result = done.thread.find((m) => m.kind === 'result');
  assert.equal(result.text, `수집 3건 (할 일 ${t.id})`);
  assert.equal(fs.existsSync(marker), false);
});

test('명령이 실패하면 막힘으로 남고 오류 출력이 보인다', async () => {
  await ui('PATCH', `/api/ui/employees/${empId}`, { automation: 'broken' });
  const t = (await ui('POST', '/api/ui/tasks', { title: '고장 난 일', assignee: empId })).json;
  await ui('POST', `/api/ui/tasks/${t.id}/run`, {});
  const done = await waitStatus(t.id, ['완료', '막힘']);
  assert.equal(done.status, '막힘');
  assert.equal(done.thread.find((m) => m.kind === 'result').text, '로그인 풀림');
});

test('안전 정지에 걸리는 제목은 대표가 확인하기 전에는 실행되지 않는다', async () => {
  await ui('PATCH', `/api/ui/employees/${empId}`, { automation: 'listen' });
  const t = (await ui('POST', '/api/ui/tasks', { title: '영상 업로드', assignee: empId })).json;
  assert.equal(t.gate, '업로드');
  assert.equal((await ui('POST', `/api/ui/tasks/${t.id}/run`, {})).status, 403);
  await ui('POST', `/api/ui/tasks/${t.id}/approve-gate`, {});
  assert.equal((await ui('POST', `/api/ui/tasks/${t.id}/run`, {})).status, 200);
  assert.equal((await waitStatus(t.id, ['완료', '막힘'])).status, '완료');
});

test('자동화를 고르지 않았거나 등록에서 빠지면 실행하지 않는다', async () => {
  await ui('PATCH', `/api/ui/employees/${empId}`, { automation: '' });
  const t = (await ui('POST', '/api/ui/tasks', { title: '주인 없는 일', assignee: empId })).json;
  const r = await ui('POST', `/api/ui/tasks/${t.id}/run`, {});
  assert.equal(r.status, 400);
  assert.match(r.json.error, /등록된 자동화/);
});

test('실행이 꺼진 직원은 돌지 않는다', async () => {
  await ui('PATCH', `/api/ui/employees/${empId}`, { automation: 'listen', runMode: 'off' });
  const t = (await ui('POST', '/api/ui/tasks', { title: '꺼 둔 일', assignee: empId })).json;
  assert.equal((await ui('POST', `/api/ui/tasks/${t.id}/run`, {})).status, 403);
});

test('실행 중인 자동화를 대표가 중단하면 멈추고 할 일은 대기로 돌아간다', async () => {
  await ui('PATCH', `/api/ui/employees/${empId}`, { automation: 'slow', runMode: 'manual' });
  const t = (await ui('POST', '/api/ui/tasks', { title: '오래 걸리는 수집', assignee: empId })).json;
  assert.equal((await ui('POST', `/api/ui/tasks/${t.id}/run`, {})).status, 200);
  await waitStatus(t.id, ['진행']);
  const stop = await ui('POST', `/api/ui/tasks/${t.id}/stop`, {});
  assert.equal(stop.status, 200);
  assert.equal(stop.json.emp, empId);
  const after = await waitStatus(t.id, ['대기']);
  assert.equal(after.thread.some((m) => m.kind === 'result'), false);
  // 멈춘 뒤에는 직원이 비어서 다시 시킬 수 있다
  for (let i = 0; i < 50; i++) {
    const s = (await request('GET', '/api/state')).json;
    if (!(s.working || []).some((w) => w.emp === empId)) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  await ui('PATCH', `/api/ui/employees/${empId}`, { automation: 'listen' });
  assert.equal((await ui('POST', `/api/ui/tasks/${t.id}/run`, {})).status, 200);
  assert.equal((await waitStatus(t.id, ['완료', '막힘'])).status, '완료');
});

test('자동화 직원은 AI 직원의 대체(인계) 후보가 되지 않는다', async () => {
  const { pickFallbackEmployee, autoWireEmployeeFallbacks } = await import('../lib/optimizer.mjs');
  const d = { employees: [
    { id: 'ai', name: 'AI', engine: 'claude', runMode: 'auto' },
    { id: 'bot', name: '봇', engine: 'script', runMode: 'auto', automation: 'listen' },
  ] };
  assert.equal(pickFallbackEmployee(d, 'ai', { task: { title: '글쓰기' }, requireRunnable: false }), null);
  autoWireEmployeeFallbacks(d);
  assert.ok(!d.employees[0].fallbackTo);
  assert.ok(!d.employees[1].fallbackTo);
});
