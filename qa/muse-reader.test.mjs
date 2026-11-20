// Muse 읽기 스크립트를 가짜 화면 (qa/fixtures/muse, 실제 데이터 없음) 으로 시험한다. 실행: node --test qa/muse-reader.test.mjs
// ego lite 대신 가짜 taskSpace 를 쓰고, page.evaluate 는 진짜 헤드리스 크롬에서 돌린다 (빈 임시 프로필).
// 가짜 page 에는 click, fill, type 같은 손대는 함수가 없다: 스크립트가 누르거나 입력하려 하면 바로 실패한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readerScript, parseReader } from '../lib/muse.mjs';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'muse');
const CHROMES = [
  process.env.AIHQ_TEST_CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
const CHROME = CHROMES.find((p) => fs.existsSync(p));

let pending = null; // { fn, arg }
function startServer() {
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const file = path.normalize(path.join(FIX, decodeURIComponent(u.pathname)));
    if (!file.startsWith(FIX) || !fs.existsSync(file)) { res.writeHead(404); return res.end('없음'); }
    let html = fs.readFileSync(file, 'utf8');
    if (u.searchParams.has('aihq_eval') && pending) {
      const code = `(${pending.fn})(${JSON.stringify(pending.arg)})`;
      html = html.replace('</body>', `<script>window.addEventListener('load',()=>{let r;try{r={ok:true,v:${code}}}catch(e){r={ok:false,e:String(e)}}const p=document.createElement('pre');p.id='aihqout';p.textContent=JSON.stringify(r);document.body.appendChild(p);});</script></body>`);
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  });
  return new Promise((resolve) => srv.listen(0, '127.0.0.1', () => resolve(srv)));
}

function chromeEval(url, fn, arg) {
  pending = { fn: fn.toString(), arg };
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'aihq-chrome-'));
  const u = `${url}${url.includes('?') ? '&' : '?'}aihq_eval=1`;
  return new Promise((resolve, reject) => {
    execFile(CHROME, ['--headless', `--user-data-dir=${profile}`, '--no-first-run', '--disable-gpu', '--virtual-time-budget=3000', '--window-size=1280,900', '--dump-dom', u], { timeout: 60000, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
      fs.rmSync(profile, { recursive: true, force: true });
      if (err) return reject(err);
      const m = /<pre id="aihqout">([\s\S]*?)<\/pre>/.exec(stdout);
      if (!m) return reject(new Error('결과 없음'));
      const txt = m[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
      const r = JSON.parse(txt);
      return r.ok ? resolve(r.v) : reject(new Error(r.e));
    });
  });
}

// ego-browser 의 작은 흉내: 읽는 함수만 있다
function fakeEgo(log) {
  let finished = 0;
  const page = {
    url: null,
    async goto(u) { log.push(`goto ${u}`); this.url = u; },
    async waitForLoadState() {},
    async waitForTimeout() {},
    async evaluate(fn, arg) { return chromeEval(this.url, fn, arg); },
  };
  const taskSpace = async () => ({ spaceId: 1, page: () => page, finish: async ({ keep }) => { assert.deepEqual(keep, []); finished++; } });
  return { taskSpace, finished: () => finished };
}

async function runReader(url) {
  const src = readerScript({ url, maxConversations: 8, maxMessages: 40 });
  const lines = [];
  const log = [];
  const ego = fakeEgo(log);
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
  await new AsyncFunction('taskSpace', 'console', src)(ego.taskSpace, { log: (s) => lines.push(String(s)) });
  return { out: parseReader(lines.join('\n')), log, finished: ego.finished() };
}

test('가짜 Muse 화면에서 대화와 메시지를 읽는다 (읽기만)', { skip: !CHROME && '헤드리스 크롬 없음' }, async () => {
  const srv = await startServer();
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const r = await runReader(`${base}/index.html`);
    assert.equal(r.finished, 1, '스페이스를 닫음');
    assert.equal(r.out.status, 'ok');
    assert.equal(r.out.conversations.length, 2);
    const [c1, c2] = r.out.conversations;
    assert.equal(c1.title, '주말 계획 (가짜)');
    assert.deepEqual(c1.messages.map((m) => m.role), ['user', 'muse', 'user']);
    assert.equal(c1.messages[0].id, 'm1');
    assert.equal(c1.messages[1].at, '2026-11-20T09:01');
    assert.ok(!c1.messages[1].text.includes('예약하기'), '버튼 글자는 빼고 읽음');
    assert.equal(c2.messages.length, 2);
    assert.ok(!r.log.some((x) => /new\.html/.test(x)), '새 대화 링크로 가지 않음');
    console.log('읽은 결과 (가짜 데이터):', JSON.stringify(r.out.conversations.map((c) => ({ title: c.title, n: c.messages.length, roles: c.messages.map((m) => m.role) }))));

    const login = await runReader(`${base}/login.html`);
    assert.equal(login.out.status, 'login_required');
    assert.equal(login.out.conversations.length, 0);
    assert.equal(login.finished, 1);
    console.log('로그인 화면:', login.out.status);
  } finally {
    srv.close();
  }
});
