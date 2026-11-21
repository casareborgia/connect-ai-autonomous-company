// 자동화 직원: 등록된 명령만 실행한다는 안전 규칙 시험. 실행: node --test qa/automations.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseAutomations, loadAutomations, findAutomation, automationsFile, automationEnv, runAutomation, resultText } from '../lib/automations.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aihq-auto-'));
function script(name, body) {
  const p = path.join(tmp, name);
  fs.writeFileSync(p, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  return p;
}
const OK = script('ok.sh', 'echo "수집 3건"');
const yes = () => true;

test('등록 파일은 데이터 폴더 옆에 둔다 (환경변수로 바꿀 수 있음)', () => {
  assert.equal(automationsFile('/home/me/.connect-ai-hq/data', {}), '/home/me/.connect-ai-hq/automations.json');
  assert.equal(automationsFile('/x/data', { AIHQ_AUTOMATIONS: '/etc/a.json' }), '/etc/a.json');
});

test('올바른 등록은 그대로 읽는다', () => {
  const { list, problems } = parseAutomations({ automations: [
    { id: 'listen', title: '마케팅 리스닝', command: ['/usr/bin/python3', '/a/b.py', 'daily'], cwd: '/a', timeoutMinutes: 20 },
    { id: 'collect', command: ['/bin/sh', '/a/c.sh'] },
  ] }, { executable: yes, directory: yes });
  assert.deepEqual(problems, []);
  assert.deepEqual(list[0], { id: 'listen', title: '마케팅 리스닝', command: ['/usr/bin/python3', '/a/b.py', 'daily'], cwd: '/a', timeoutMinutes: 20 });
  assert.equal(list[1].title, 'collect', '제목이 없으면 아이디를 쓴다');
  assert.equal(list[1].timeoutMinutes, 15);
  assert.equal(findAutomation(list, 'collect').id, 'collect');
  assert.equal(findAutomation(list, 'nope'), null);
  assert.equal(findAutomation(list, ''), null);
});

test('위험하거나 모호한 등록은 받지 않고 이유를 남긴다', () => {
  const bad = [
    { id: 'Bad Id', command: ['/bin/sh'] },
    { id: '../x', command: ['/bin/sh'] },
    { id: '__proto__', command: ['/bin/sh'] },
    { id: 'str', command: '/bin/sh -c "rm -rf ~"' },
    { id: 'empty', command: [] },
    { id: 'rel', command: ['python3', 'a.py'] },
    { id: 'nonstr', command: ['/bin/sh', 3] },
    { id: 'gone', command: ['/없는/파일'] },
    { id: 'cwd', command: ['/bin/sh'], cwd: 'relative/dir' },
    { id: 'slow', command: ['/bin/sh'], timeoutMinutes: 100000 },
    { id: 'zero', command: ['/bin/sh'], timeoutMinutes: 0 },
    'not-an-object',
  ];
  const { list, problems } = parseAutomations({ automations: bad }, { executable: (p) => p === '/bin/sh', directory: yes });
  assert.deepEqual(list, []);
  assert.equal(problems.length, bad.length);
  assert.ok(problems.every((p) => typeof p === 'string' && p.length > 5));
});

test('같은 아이디가 두 번 나오면 뒤의 것은 버린다', () => {
  const { list, problems } = parseAutomations({ automations: [
    { id: 'a', command: ['/bin/sh', '1'] }, { id: 'a', command: ['/bin/sh', '2'] },
  ] }, { executable: yes, directory: yes });
  assert.equal(list.length, 1);
  assert.deepEqual(list[0].command, ['/bin/sh', '1']);
  assert.equal(problems.length, 1);
});

test('모양이 틀린 파일은 빈 목록과 이유', () => {
  for (const raw of [null, [], { automations: 'x' }, 'text', 7]) {
    const r = parseAutomations(raw, { executable: yes, directory: yes });
    assert.deepEqual(r.list, []);
    assert.equal(r.problems.length, 1);
  }
});

test('파일이 없으면 조용히 빈 목록, 깨진 JSON 은 이유', () => {
  assert.deepEqual(loadAutomations(path.join(tmp, 'none.json')), { list: [], problems: [] });
  const broken = path.join(tmp, 'broken.json');
  fs.writeFileSync(broken, '{ 깨짐', { mode: 0o600 });
  const r = loadAutomations(broken);
  assert.deepEqual(r.list, []);
  assert.equal(r.problems.length, 1);
});

test('다른 사용자가 고칠 수 있는 등록 파일은 쓰지 않는다', { skip: process.platform === 'win32' }, () => {
  const file = path.join(tmp, 'open.json');
  fs.writeFileSync(file, JSON.stringify({ automations: [{ id: 'a', command: [OK] }] }));
  fs.chmodSync(file, 0o666);
  const open = loadAutomations(file);
  assert.deepEqual(open.list, []);
  assert.match(open.problems[0], /권한/);
  fs.chmodSync(file, 0o600);
  assert.equal(loadAutomations(file).list.length, 1);
});

test('고친 등록 파일은 다시 읽는다', () => {
  const file = path.join(tmp, 'live.json');
  fs.writeFileSync(file, JSON.stringify({ automations: [{ id: 'a', command: [OK] }] }), { mode: 0o600 });
  assert.equal(loadAutomations(file).list.length, 1);
  fs.writeFileSync(file, JSON.stringify({ automations: [{ id: 'a', command: [OK] }, { id: 'b', command: [OK] }] }), { mode: 0o600 });
  fs.utimesSync(file, new Date(), new Date(Date.now() + 5000));
  assert.equal(loadAutomations(file).list.length, 2);
});

test('할 일의 글은 환경에도 명령에도 들어가지 않는다 (아이디만 준다)', () => {
  const env = automationEnv({ PATH: '/bin', HOME: '/h' }, { id: 't7', title: '$(rm -rf ~); 리스닝', note: '`id`' }, { id: 'e1', name: '리스닝 "봇"' });
  assert.deepEqual(env, { PATH: '/bin', HOME: '/h', AIHQ_TASK_ID: 't7', AIHQ_EMPLOYEE: 'e1', AIHQ_TRIGGERED_BY_HQ: '1' });
});

test('성공: 출력과 종료 코드 0', async () => {
  const r = await runAutomation({ id: 'ok', command: [OK], timeoutMinutes: 1 }, { env: process.env });
  assert.equal(r.code, 0);
  assert.equal(r.timedOut, false);
  assert.equal(r.out, '수집 3건');
});

test('실패: 종료 코드와 오류 출력을 그대로 돌려준다', async () => {
  const fail = script('fail.sh', 'echo "로그인 풀림" >&2; exit 3');
  const r = await runAutomation({ id: 'f', command: [fail], timeoutMinutes: 1 }, { env: process.env });
  assert.equal(r.code, 3);
  assert.equal(r.err, '로그인 풀림');
});

test('인자는 셸을 거치지 않는다', async () => {
  const echo = script('args.sh', 'printf "%s|" "$@"');
  const marker = path.join(tmp, 'pwned');
  const r = await runAutomation({ id: 'a', command: [echo, `$(touch ${marker})`, '; rm -rf x', 'a b'], timeoutMinutes: 1 }, { env: process.env });
  assert.equal(r.out, `$(touch ${marker})|; rm -rf x|a b|`);
  assert.equal(fs.existsSync(marker), false);
});

test('환경과 작업 폴더가 전달된다', async () => {
  const show = script('env.sh', 'echo "$AIHQ_TASK_ID $AIHQ_TRIGGERED_BY_HQ $(pwd -P)"');
  const real = fs.realpathSync(tmp);
  const r = await runAutomation({ id: 'e', command: [show], cwd: tmp, timeoutMinutes: 1 }, { env: automationEnv(process.env, { id: 't9' }, { id: 'e2' }) });
  assert.equal(r.out, `t9 1 ${real}`);
});

test('시간이 넘으면 하위 프로세스까지 멈추고 바로 알린다', async () => {
  const slow = script('slow.sh', 'sleep 30');
  const t0 = Date.now();
  const r = await runAutomation({ id: 's', command: [slow], timeoutMinutes: 1 }, { env: process.env, timeoutMs: 300 });
  assert.equal(r.timedOut, true);
  assert.notEqual(r.code, 0);
  assert.ok(Date.now() - t0 < 5000, '스크립트가 띄운 sleep 이 끝나기를 기다리지 않는다');
});

test('실행 파일이 사라졌으면 예외 대신 실패 결과', async () => {
  const r = await runAutomation({ id: 'g', command: [path.join(tmp, 'gone.sh')], timeoutMinutes: 1 }, { env: process.env });
  assert.notEqual(r.code, 0);
  assert.ok(r.err.length > 0);
});

test('스레드에 남길 글: 출력이 없으면 그렇다고 쓰고, 시간 초과를 덧붙인다', () => {
  assert.equal(resultText({ code: 0, out: '끝', err: '', timedOut: false }), '끝');
  assert.equal(resultText({ code: 2, out: '', err: '오류', timedOut: false }), '오류');
  assert.equal(resultText({ code: 0, out: '', err: '', timedOut: false }), '(출력 없음)');
  assert.match(resultText({ code: null, out: '중간', err: '', timedOut: true }, 15), /중간[\s\S]*15분/);
});
