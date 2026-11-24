import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateRagFolderPath, validateRagUrl, ragTokens, chunkDocument } from '../lib/rag.mjs';
import { exportBlueprint } from '../lib/blueprint.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STUB = path.join(ROOT, 'qa', 'stub-agent.mjs');

async function startServer() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aihq-rag-test-'));
  const port = 19100 + Math.floor(Math.random() * 350);
  const child = spawn(process.execPath, [path.join(ROOT, 'server.mjs')], {
    cwd: ROOT,
    env: {
      ...process.env,
      AIHQ_PORT: String(port),
      AIHQ_DATA_DIR: path.join(dir, 'data'),
      AIHQ_WORKSPACES: path.join(dir, 'ws'),
      AIHQ_SEED: 'example',
      AIHQ_NO_OPEN: '1',
      AIHQ_DISPATCH: '0',
      AIHQ_AUTO_ENABLE: '1',
      AIHQ_NO_NOTIFY: '1',
      AIHQ_NO_CAFFEINATE: '1',
      AIHQ_NO_BROWSER_PROBE: '1',
      AIHQ_NO_OLLAMA_EMBED: '1',
      AIHQ_LLM_MODEL: '',
      AIHQ_CLAUDE_BIN: STUB,
      AIHQ_CODEX_BIN: STUB,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const origin = `http://127.0.0.1:${port}`;
  const dataDir = path.join(dir, 'data');
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${origin}/api/state`);
      if (r.ok) {
        const secret = (await fs.readFile(path.join(dataDir, '.human-session'), 'utf8')).trim();
        const cookie = `hq_human=${secret}`;
        return {
          origin,
          dir,
          dataDir,
          async ui(method, p, body) {
            const res = await fetch(`${origin}${p}`, {
              method,
              headers: { 'Content-Type': 'application/json', 'X-HQ-UI': '1', 'Sec-Fetch-Site': 'same-origin', Origin: origin, Cookie: cookie },
              body: body === undefined ? undefined : JSON.stringify(body),
            });
            return { status: res.status, body: await res.json().catch(() => null) };
          },
          async agent(method, p, body) {
            const res = await fetch(`${origin}${p}`, {
              method,
              headers: { 'Content-Type': 'application/json', 'User-Agent': 'aihq-mcp/1', 'X-HQ-Agent': '1' },
              body: body === undefined ? undefined : JSON.stringify(body),
            });
            return { status: res.status, body: await res.json().catch(() => null) };
          },
          async close() {
            child.kill('SIGTERM');
            await new Promise((res) => child.once('exit', res));
            await fs.rm(dir, { recursive: true, force: true });
          },
        };
      }
    } catch { /* wait */ }
    await new Promise((r) => setTimeout(r, 80));
  }
  child.kill('SIGKILL');
  throw new Error('RAG 테스트 서버 기동 시간 초과');
}

function startMockRagApi() {
  return new Promise((resolve) => {
    let lastAuth = '';
    const srv = http.createServer(async (req, res) => {
      lastAuth = req.headers.authorization || '';
      let raw = '';
      for await (const c of req) raw += c;
      let parsed = {};
      try { parsed = JSON.parse(raw); } catch { /* ignore */ }
      if (lastAuth !== 'Bearer rag-secret-token-123') {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'unauthorized' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        results: [
          {
            source: 'external-vector-db/pricing-2026.md',
            heading: 'VIP 부트캠프 안내',
            text: `외부 RAG API 응답: "${parsed.query || ''}" 관련 공식 기준은 매트 블랙 샴페인 골드 톤과 실전 자동화 중심입니다.`,
            score: 0.92,
          },
        ],
      }));
    });
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      resolve({
        url: `http://127.0.0.1:${addr.port}/query`,
        close: () => new Promise((r) => srv.close(r)),
      });
    });
  });
}

test('RAG 보안 경계 + 한국어 토크나이저/청킹 단위 검증', () => {
  assert.equal(validateRagFolderPath('/etc').ok, false);
  assert.equal(validateRagFolderPath('~/.ssh').ok, false);
  assert.equal(validateRagFolderPath('~/.aws').ok, false);
  assert.equal(validateRagFolderPath('~/.connect-ai-hq').ok, false);
  assert.equal(validateRagUrl('javascript:alert(1)').ok, false);
  assert.equal(validateRagUrl('file:///etc/passwd').ok, false);
  assert.equal(validateRagUrl('http://insecure.example.com', false).ok, false);
  assert.equal(validateRagUrl('https://notebooklm.google.com/notebook/abc', false).ok, true);

  const toks = ragTokens('유튜브에서 쇼츠의 훅을 모션그래픽으로 만들기');
  assert.ok(toks.includes('유튜브'));
  assert.ok(toks.includes('쇼츠'));
  assert.ok(toks.includes('모션'));

  const chunks = chunkDocument('guide.md', '# 첫 섹션\n짧은 본문입니다.\n\n## 두 번째 섹션\n두 번째 내용입니다.');
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].heading, '첫 섹션');
  assert.equal(chunks[1].heading, '두 번째 섹션');
});

test('통합 내 RAG 허브 E2E: 로컬 폴더 인덱싱(.env 차단) · HTTP RAG API(토큰 비공개) · MCP/웹 RAG · 하이브리드 프롬프트 자동 주입 · MCP search_rag · 청사진 격리', async () => {
  const srv = await startServer();
  const mockApi = await startMockRagApi();
  const vaultDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aihq-vault-'));
  try {
    await fs.writeFile(path.join(vaultDir, 'shorts-playbook.md'), [
      '# 유튜브 쇼츠 훅 3초 공식',
      '첫 1.5초 안에 구체적인 숫자나 반전 질문을 던져야 이탈률이 줄어듭니다.',
      '예: AI 직원 5명으로 월 30시간 아낀 실제 화면을 바로 보여줍니다.',
    ].join('\n'));
    await fs.writeFile(path.join(vaultDir, 'course-curriculum.md'), [
      '# 12월 CONNECT AI 강의 커리큘럼',
      '1주차: 나만의 AI 회사 본사 세팅과 에고라이트 연결',
      '2주차: 옵시디언 로컬 RAG와 MCP 자동화 연결',
    ].join('\n'));
    // 민감 파일은 인덱싱에서 자동 제외되어야 함
    await fs.writeFile(path.join(vaultDir, '.env'), 'SECRET_API_KEY=DO_NOT_INDEX_THIS_TOKEN_999\n');
    await fs.writeFile(path.join(vaultDir, 'private.key'), 'PRIVATE_KEY_DO_NOT_INDEX_888\n');

    // 1) 위험 폴더 차단 확인
    const badFolder = await srv.ui('POST', '/api/ui/rag', { name: '금지', type: 'folder', folderPath: '~/.ssh' });
    assert.equal(badFolder.status, 400);

    // 2) 로컬 폴더 RAG 연결 + 자동 인덱싱 검증 (.env, private.key 제외)
    const folderRes = await srv.ui('POST', '/api/ui/rag', {
      name: '옵시디언 강의 노트',
      type: 'folder',
      folderPath: vaultDir,
      useOllamaEmbed: false,
    });
    assert.equal(folderRes.status, 200);
    assert.equal(folderRes.body.stats.files, 2, '마크다운 2개만 인덱싱하고 .env / .key는 제외해야 함');
    assert.ok(folderRes.body.stats.chunks >= 2);
    const folderRagId = folderRes.body.id;

    const secretCheck = await srv.ui('POST', '/api/ui/rag/query', { query: 'DO_NOT_INDEX_THIS_TOKEN_999' });
    assert.equal(secretCheck.status, 200);
    assert.equal(secretCheck.body.hits.length, 0, '.env 내용은 절대 검색되면 안 됨');

    // 3) HTTP API RAG 연결 + 토큰 마스킹 + 연결 테스트
    const httpRes = await srv.ui('POST', '/api/ui/rag', {
      name: '외부 벡터 RAG API',
      type: 'http',
      endpoint: mockApi.url,
      method: 'POST',
      authHeader: 'Authorization',
      authToken: 'Bearer rag-secret-token-123',
      queryField: 'query',
    });
    assert.equal(httpRes.status, 200);
    assert.equal(httpRes.body.hasAuth, true);
    assert.equal(httpRes.body.authToken, '', '클라이언트 응답에 authToken 원문이 노출되면 안 됨');
    const httpRagId = httpRes.body.id;

    const syncHttp = await srv.ui('POST', `/api/ui/rag/${httpRagId}/sync`, { query: '유튜브 쇼츠' });
    assert.equal(syncHttp.status, 200);
    assert.equal(syncHttp.body.stats.ok, true);
    assert.equal(syncHttp.body.stats.sampleCount, 1);

    // 4) MCP RAG + 웹 지식 RAG (NotebookLM) 등록
    const mcpRes = await srv.ui('POST', '/api/ui/rag', {
      name: 'QMD 마크다운 검색 MCP',
      type: 'mcp',
      mcpServer: 'qmd',
      mcpTool: 'search',
      note: '전체 로컬 프로젝트 문서 검색',
    });
    assert.equal(mcpRes.status, 200);

    const webRes = await srv.ui('POST', '/api/ui/rag', {
      name: 'NotebookLM 강의 리서치',
      type: 'web',
      webUrl: 'https://notebooklm.google.com/notebook/connect-ai-demo',
      spaceName: '리서치',
    });
    assert.equal(webRes.status, 200);

    // 5) /api/state 마스킹 + 청사진(Blueprint) 프라이버시 격리 검증
    const st = await srv.ui('GET', '/api/state');
    assert.equal(st.status, 200);
    const httpState = st.body.data.ragSources.find((r) => r.id === httpRagId);
    assert.equal(httpState.hasAuth, true);
    assert.equal(httpState.authToken, '');
    const bp = exportBlueprint(st.body.data);
    assert.equal(bp.ragSources, undefined, '비공개 RAG 소스와 토큰은 청사진에 포함되면 안 됨');

    // 6) AI 직원에 RAG 연결 → 할 일 프롬프트에 자동 주입(폴더+HTTP 결과 + MCP/웹 지시 + search_rag 안내) 검증
    const empPatch = await srv.ui('PATCH', '/api/ui/employees/codex', { ragIds: [folderRagId] });
    assert.equal(empPatch.status, 200);
    assert.deepEqual(empPatch.body.ragIds, [folderRagId]);

    const taskRes = await srv.ui('POST', '/api/ui/tasks', {
      title: '유튜브 쇼츠 훅 3초 공식으로 대본 초안 써줘',
      assignee: 'codex',
    });
    assert.equal(taskRes.status, 200);
    const prev = await srv.ui('GET', `/api/ui/tasks/${taskRes.body.id}/prompt-preview`);
    assert.equal(prev.status, 200);
    assert.match(prev.body.prompt, /내 RAG 자동 검색 결과/);
    assert.match(prev.body.prompt, /첫 1\.5초 안에 구체적인 숫자/);
    assert.match(prev.body.prompt, /외부 RAG API 응답/);
    assert.match(prev.body.prompt, /QMD 마크다운 검색 MCP/);
    assert.match(prev.body.prompt, /notebooklm\.google\.com\/notebook\/connect-ai-demo/);
    assert.match(prev.body.prompt, /search_rag/);

    // 7) Agent/MCP search_rag 엔드포인트 검증
    const agentSearch = await srv.agent('POST', '/api/agent/rag/search', {
      from: 'codex',
      query: '옵시디언 로컬 RAG 강의 커리큘럼',
      topK: 5,
    });
    assert.equal(agentSearch.status, 200);
    assert.ok(agentSearch.body.hits.some((h) => h.file === 'course-curriculum.md'));
    assert.ok(agentSearch.body.directives.some((d) => d.mcpServer === 'qmd'));

    // 8) RAG 삭제 시 직원 ragIds 정리 + 인덱스 파일 삭제 확인
    const delRes = await srv.ui('DELETE', `/api/ui/rag/${folderRagId}`);
    assert.equal(delRes.status, 200);
    const stAfter = await srv.ui('GET', '/api/state');
    const codexAfter = stAfter.body.data.employees.find((e) => e.id === 'codex');
    assert.deepEqual(codexAfter.ragIds, []);
  } finally {
    await srv.close();
    await mockApi.close();
    await fs.rm(vaultDir, { recursive: true, force: true });
  }
});
