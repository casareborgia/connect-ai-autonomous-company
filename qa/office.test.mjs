// 배차 (사무실에서 실행), 모델 기록, Muse 읽기의 안전 규칙 시험. 실행: node --test qa/office.test.mjs
// ssh 는 쓰지 않는다 (순수 함수만).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateJob, buildCommand, safeRelPath, TEMPLATES } from '../lib/jobspec.mjs';
import { dispatchCheck, launchScript, pollScript, cleanScript, stopScript, guessSshAlias, allowedTemplates, parsePoll, validAlias } from '../lib/office.mjs';
import { claudeModel, codexModel, agyModel, recordModels, modelFor, pickFrom } from '../lib/models.mjs';
import { importResult, parseReader, readerScript } from '../lib/muse.mjs';
import { MUST_STOP } from './gates.test.mjs';

const NOW = new Date('2026-11-20T15:00:00');
const studio = { id: 'studio', kind: '기계', name: 'Office 1 (맥 스튜디오)', isThisMac: false, sshAlias: 'office-1', status: '사용 가능' };
const light = { id: 'res1', kind: '기계', name: 'Office 2 (집 맥북 프로)', isThisMac: false, sshAlias: 'office-2', status: '사용 가능' };
const hq = { id: 'mbp', kind: '기계', name: 'HQ', isThisMac: true, sshAlias: '', status: '사용 가능' };
const local = { id: 'writer', name: '글쓰기 AI', engine: 'local', model: 'ollama:qwen3:4b', runMode: 'off', resources: ['studio'] };
const codex = { id: 'codex', name: 'Codex', engine: 'codex', runMode: 'off', resources: [] };
const base = (over = {}) => ({ id: 't1', title: '회의록 한 문장 요약', note: '', status: '대기', runStartedAt: null, resource: 'studio', assignee: 'writer', date: '2026-11-20', time: null, gate: null, gateApprovedAt: null, officeRun: true, officeJob: null, remote: null, ...over });
const data = (tasks, extra = {}) => ({ resources: [studio, light, hq], employees: [local, codex], tasks, ...extra });

test('정해진 일 종류만 받는다', () => {
  assert.ok(validateJob({ template: 'ai-text' }).job);
  assert.ok(validateJob({ template: 'ffmpeg-test', params: { seconds: 1 } }).job);
  assert.ok(validateJob({ template: 'remotion-render', params: { composition: 'Hero-1', frames: '0-29' } }).job);
  assert.ok(validateJob({ template: 'blender-render', params: { blend: 'render-node/blender/scene.blend', frame: 3 } }).job);
  for (const bad of [
    { template: 'shell', params: { cmd: 'ls' } },
    { template: 'bash' },
    { template: '__proto__' },
    { template: 'ffmpeg-test', params: { seconds: 11 } },
    { template: 'ffmpeg-test', params: { seconds: '1; rm -rf ~' } },
    { template: 'remotion-render', params: { composition: 'x; rm -rf ~' } },
    { template: 'remotion-render', params: { composition: '--browser-executable=/bin/sh' } },
    { template: 'remotion-render', params: { composition: 'Hero', frames: '9-1' } },
    { template: 'blender-render', params: { blend: '../.ssh/id.blend' } },
    { template: 'blender-render', params: { blend: '/etc/x.blend' } },
    { template: 'blender-render', params: { blend: 'render-node/-P evil.blend' } },
    { template: 'blender-render', params: { blend: 'render-node/a/../../x.blend' } },
    { template: 'blender-render', params: { blend: 'render-node/$(id).blend' } },
    { template: 'blender-render', params: { blend: 'render-node/scene.py' } },
  ]) assert.ok(validateJob(bad).error, JSON.stringify(bad));
  assert.equal(safeRelPath('render-node/jobs/a b/c.blend', '.blend'), 'render-node/jobs/a b/c.blend');
});

test('명령은 인자 배열이고 할 일 글은 들어가지 않는다', () => {
  const ctx = { home: '/Users/x', jobDir: '/Users/x/render-node/jobs/t1' };
  for (const job of [{ template: 'ffmpeg-test', params: { seconds: 2 } }, { template: 'remotion-render', params: { composition: 'Hero' } }, { template: 'blender-render', params: { blend: 'render-node/a.blend', frame: 1 } }]) {
    const c = buildCommand(job, ctx);
    assert.ok(Array.isArray(c.args));
    assert.ok(!c.args.some((a) => /sudo|;|&&|\|/.test(a)), c.args.join(' '));
  }
  assert.equal(buildCommand({ template: 'ai-text' }, ctx), null);
  const b = buildCommand({ template: 'blender-render', params: { blend: 'render-node/a.blend', frame: 1 } }, ctx);
  assert.ok(b.args.includes('-Y'), '.blend 안 파이썬 자동 실행 끔');
  assert.ok(b.args.includes('-b'));
  assert.throws(() => buildCommand({ template: 'nope' }, ctx));
});

test('위험한 말 47가지는 사무실로 보내지 않는다 (확인 전)', () => {
  for (const [title] of MUST_STOP) {
    const t = base({ title, officeJob: { template: 'ai-text' } });
    const c = dispatchCheck(data([t]), t, NOW);
    assert.equal(c.go, false, title);
    // 저장된 확인 종류가 있어도 마찬가지, 대표 확인 뒤에만 간다
    const g = base({ title, gate: '결제', gateApprovedAt: null });
    assert.equal(dispatchCheck(data([g]), g, NOW).go, false, title);
    const ok = base({ title, gate: '결제', gateApprovedAt: '2026-11-20T05:00:00Z' });
    assert.equal(dispatchCheck(data([ok]), ok, NOW).go, true, title);
  }
});

test('보낼 수 있는 일과 없는 일', () => {
  const t = base();
  assert.equal(dispatchCheck(data([t]), t, NOW).go, true);
  // 셸 명령처럼 생긴 제목도 글 일의 지시문으로만 쓰인다 (명령 아님)
  const sh = base({ title: '$(whoami) 와 `ls ~` 결과 한 문장 요약' });
  const c = dispatchCheck(data([sh]), sh, NOW);
  assert.equal(c.go, true);
  assert.equal(c.job.template, 'ai-text');
  const no = (over, extra) => { const x = base(over); return dispatchCheck(data([x], extra), x, NOW); };
  assert.equal(no({ officeRun: false }).go, false, '스위치 꺼짐');
  assert.equal(no({ resource: 'mbp' }).go, false, '이 맥');
  assert.equal(no({ resource: null }).go, false, '리소스 없음');
  assert.equal(no({ status: '진행' }).go, false, '대기 아님');
  assert.equal(no({ assignee: 'jay' }).go, false, '사람 일');
  assert.equal(no({ date: '2026-11-21' }).go, false, '내일 일');
  assert.equal(no({ time: '16:00' }).go, false, '아직 시간 전');
  assert.equal(no({ time: '14:00' }).go, true, '시간 지남');
  const blocked = no({ assignee: 'codex' });
  assert.equal(blocked.go, false);
  assert.equal(blocked.block, true, '글 일은 로컬 모델 직원만');
  const heavy = no({ resource: 'res1', officeJob: { template: 'blender-render', params: { blend: 'render-node/a.blend' } } });
  assert.equal(heavy.go, false);
  assert.equal(heavy.block, true, 'Office 2 는 가벼운 일만');
  assert.equal(no({ resource: 'res1', officeJob: { template: 'ffmpeg-test', params: { seconds: 1 } } }).go, true);
  const badJob = no({ officeJob: { template: 'shell', params: {} } });
  assert.equal(badJob.block, true);
  assert.equal(no({}, { resources: [{ ...studio, status: '꺼짐' }, light, hq] }).go, false, '꺼진 기계');
  // 사무실마다 한 번에 하나
  const running = base({ id: 't2', status: '진행', remote: { state: 'running', res: 'studio' } });
  const t3 = base({ id: 't3' });
  assert.equal(dispatchCheck(data([running, t3]), t3, NOW).go, false);
  const t4 = base({ id: 't4', resource: 'res1', officeJob: { template: 'ffmpeg-test' } });
  assert.equal(dispatchCheck(data([running, t4]), t4, NOW).go, true, '다른 사무실은 따로');
  // 닿지 않으면 정해진 시간까지 다시 보내지 않는다
  const retry = base({ remote: { state: 'retry', retryAt: '2026-11-20T06:30:00Z' } });
  assert.equal(dispatchCheck(data([retry]), retry, new Date('2026-11-20T06:00:00Z')).go, false);
  const hosts = new Map([['studio', { ok: false, retryAt: NOW.getTime() + 60000 }]]);
  assert.equal(dispatchCheck(data([t]), t, NOW, hosts).go, false);
  // 자동 실행 직원의 매일 할 일은 스위치 없이도 간다
  const auto = { ...local, runMode: 'auto' };
  const rt = base({ officeRun: false, routineId: 'r1' });
  assert.equal(dispatchCheck({ ...data([rt]), employees: [auto] }, rt, NOW).go, true);
});

test('무거운 일은 스튜디오만', () => {
  assert.ok(allowedTemplates(studio).includes('blender-render'));
  assert.ok(!allowedTemplates(light).includes('blender-render'));
  assert.ok(!allowedTemplates(light).includes('remotion-render'));
  assert.deepEqual(Object.keys(TEMPLATES).sort(), ['ai-text', 'blender-render', 'ffmpeg-test', 'remotion-render']);
});

test('원격 스크립트: 값 검사, sudo 없음, rm 은 ${J:?} 로만', () => {
  const inst = 'a1b2c3d4e5f60708';
  for (const s of [launchScript('t12', inst), pollScript('t12'), cleanScript('t12', inst), stopScript('t12', inst)]) {
    assert.ok(!/sudo/.test(s));
    assert.ok(!/pkill|pgrep|killall/.test(s));
    for (const m of s.matchAll(/rm -rf ([^;]+);/g)) assert.equal(m[1].trim(), '"${J:?}"');
  }
  assert.throws(() => launchScript('t1; rm -rf ~', inst));
  assert.throws(() => launchScript('t1', 'not hex'));
  assert.throws(() => pollScript('$(id)'));
  assert.ok(!validAlias('-oProxyCommand=sh'));
  assert.ok(validAlias('office-1'));
  const p = parsePoll('AIHQ_DONE\n{"ok":true,"files":[]}\nAIHQ_LOG\nline1\nline2');
  assert.equal(p.tag, 'AIHQ_DONE');
  assert.equal(p.result.ok, true);
});

test('ssh 별칭 찾기 (~/.ssh/config 읽기만)', () => {
  const cfg = 'Host laptop office-2\n  HostName 10.0.0.5\n  User me\n\nHost studio office-1\n  HostName 10.0.0.6\nHost *\n  ServerAliveInterval 30\n';
  assert.equal(guessSshAlias('office-1.local', cfg), 'office-1');
  assert.equal(guessSshAlias('10.0.0.5', cfg), 'office-2');
  assert.equal(guessSshAlias('unknown.local', cfg), '');
  assert.equal(guessSshAlias('', cfg), '');
});

test('모델: 설정 파일에서 모델 줄만', () => {
  assert.equal(claudeModel('{"model":"fable[1m]","env":{"SECRET":"x"}}'), 'fable[1m]');
  assert.equal(claudeModel('{"permissions":{}}'), 'Claude Code 기본값');
  const toml = 'model = "gpt-6.1-terra"\nmodel_reasoning_effort = "medium"\napi_key = "sk-xxx"\n[profiles.fast]\nmodel = "other"\n';
  assert.equal(codexModel(toml), 'gpt-6.1-terra (medium)');
  assert.equal(codexModel('[desktop]\nmodel = "x"\n'), 'Codex 기본값');
  assert.equal(agyModel('last_selected_agent_model: MODEL_PLACEHOLDER_M535\n'), '확인 필요');
  assert.equal(agyModel('last_selected_agent_model: gemini-3-pro\n'), 'gemini-3-pro');
  assert.equal(agyModel(null), '확인 필요');
  assert.equal(pickFrom(['qwen3-vl:8b', 'qwen3:4b'], 'qwen3:4b'), 'qwen3:4b');
  assert.equal(pickFrom(['qwen3-vl:8b', 'qwen3:4b'], 'gemma:2b'), 'qwen3:4b');
  assert.equal(pickFrom(['x:1b'], ''), 'x:1b');
  const files = { claude: '{"model":"fable[1m]"}', codex: toml, agy: null };
  assert.equal(modelFor({ engine: 'claude' }, { files }).name, 'fable[1m]');
  assert.equal(modelFor({ engine: 'web', name: 'Muse' }, { files }), null);
  assert.equal(modelFor(local, { resources: [studio], officeModels: { studio: ['qwen3-vl:8b', 'qwen3:4b'] } }).name, 'qwen3:4b');
  const d = { employees: [{ id: 'claude', modelNow: { name: 'opus' } }, { id: 'codex' }] };
  recordModels(d, { claude: { name: 'fable[1m]', source: 's' }, codex: { name: 'gpt-6.1-terra (medium)', source: 's' } }, '2026-11-20T05:00:00Z');
  assert.equal(d.employees[0].modelNow.name, 'fable[1m]');
  assert.deepEqual(d.employees[0].modelHistory[0], { from: 'opus', to: 'fable[1m]', at: '2026-11-20T05:00:00Z' });
  assert.equal(d.employees[1].modelHistory, undefined, '처음 읽은 것은 바뀜이 아님');
  recordModels(d, { claude: { name: '확인 필요', source: 's' } });
  assert.equal(d.employees[0].modelNow.name, 'fable[1m]', '못 읽은 것으로 덮지 않음');
});

test('Muse 읽기 스크립트는 읽기만 한다', () => {
  const src = readerScript({ url: 'https://muse.ai/' });
  for (const verb of ['.click(', '.dblclick(', '.fill(', '.type(', '.press(', '.insertText(', '.paste(', 'setInputFiles', 'selectOption', 'acceptDialog', 'mouse.', 'keyboard.', 'writeFile']) {
    assert.ok(!src.includes(verb), `읽기 스크립트에 ${verb} 이 있음`);
  }
  assert.ok(src.includes('"url":"https://muse.ai/"'));
  assert.ok(!src.includes('__AIHQ_INPUT__'));
  assert.equal(parseReader('noise\nAIHQ_JSON {"status":"ok","conversations":[]}\n').status, 'ok');
  assert.equal(parseReader('Failed to start ego lite.'), null);
});

test('Muse 가져오기: 새 메시지만, 한 번만', () => {
  const msgs = [];
  const d = { owner: { name: 'Jay' }, settings: { muse: { seen: {} } }, tasks: [], employees: [] };
  const emp = { id: 'muse', name: 'Muse' };
  let made = 0;
  const helpers = {
    emp,
    addMsg: (x, m) => msgs.push(m),
    makeInbox: (x) => { made++; const t = { id: 'tm', title: 'Muse 대화', museInbox: true, status: '대기', date: '2026-11-19' }; x.tasks.push(t); return t; },
    summarize: (s) => s.slice(0, 20),
  };
  const out = { conversations: [{ key: 'c1', url: 'https://muse.ai/chat/c1', title: '가짜 대화', messages: [{ role: 'user', text: '안녕' }, { role: 'muse', text: '네 안녕하세요', at: '10:00' }] }] };
  assert.equal(importResult(d, out, helpers), 2);
  assert.equal(importResult(d, out, helpers), 0, '같은 메시지는 다시 안 가져옴');
  out.conversations[0].messages.push({ role: 'muse', text: '새 소식' });
  assert.equal(importResult(d, out, helpers), 1);
  assert.equal(made, 1, '받은 편지함 할 일은 하나');
  assert.equal(msgs.length, 2);
  assert.equal(msgs[0].kind, 'imported');
  assert.equal(msgs[0].imported, true);
  assert.equal(msgs[0].from, 'muse');
  assert.match(msgs[1].text, /새 메시지 1개/);
});

test('실행기 파일에 sudo, 셸 실행이 없다', () => {
  const src = fs.readFileSync(new URL('../remote/aihq-runner.mjs', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
  assert.ok(!/sudo/.test(src));
  assert.ok(!/shell:\s*true|execSync|exec\(/.test(src));
});
