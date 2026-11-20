// 말로 정한 오늘 일을 사람 할 일과 AI 할 일로 나눈다.
// 1순위 Ollama (localhost:11434), 2순위 LM Studio (localhost:1234), 둘 다 안 되면 간단 규칙.
import { timeOrNull } from './util.mjs';

const OLLAMA = process.env.AIHQ_OLLAMA_URL || 'http://127.0.0.1:11434';
const LMSTUDIO = process.env.AIHQ_LMSTUDIO_URL || 'http://127.0.0.1:1234';
const PREFERRED = ['qwen3:8b', 'qwen3:4b', 'qwen3-vl:8b', 'qwen2.5:7b', 'gemma3:4b', 'llama3.1:8b'];

async function getJson(url, opts = {}, ms = 2500) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function sizeOf(m) {
  const p = String(m.details?.parameter_size || '').toUpperCase();
  const n = parseFloat(p);
  if (!Number.isFinite(n)) return 0;
  return p.endsWith('M') ? n / 1000 : n;
}

// 글을 쓸 수 있는 모델 고르기: 환경변수 지정 > 선호 목록 > completion 기능이 있는 1B 이상 중 가장 큰 것
export async function pickOllamaModel() {
  const tags = await getJson(`${OLLAMA}/api/tags`);
  const models = (tags.models || []).filter((m) => {
    const caps = m.capabilities;
    if (Array.isArray(caps) && !caps.includes('completion')) return false;
    return !/embed/i.test(m.name);
  });
  if (process.env.AIHQ_LLM_MODEL && models.some((m) => m.name === process.env.AIHQ_LLM_MODEL)) return process.env.AIHQ_LLM_MODEL;
  for (const p of PREFERRED) if (models.some((m) => m.name === p)) return p;
  const big = models.filter((m) => sizeOf(m) >= 1).sort((a, b) => sizeOf(b) - sizeOf(a));
  return big[0]?.name || models[0]?.name || null;
}

function buildPrompt(utterance, employees, today) {
  const staff = employees.map((e) => `- ${e.id}: ${e.name}${e.role ? ` (역할: ${e.role})` : ''}${e.tools?.length ? ` (도구: ${e.tools.join(', ')})` : ''}`).join('\n');
  return `너는 회사 비서다. 대표가 말로 오늘 할 일을 정했다. 이것을 대표 본인이 직접 할 일(human)과 AI 직원에게 맡길 일(ai)로 나눠라.
오늘 날짜: ${today}

AI 직원 목록:
${staff}

규칙
- 대표가 몸으로 직접 가야 하거나 촬영, 운동, 병원, 만남처럼 사람이 해야 하는 일은 human.
- 찾기, 비교, 조사, 정리, 만들기, 편집, 코딩, 보고처럼 컴퓨터로 대신할 수 있는 일은 ai.
- 시간은 24시간제 "HH:MM". 말하지 않았으면 null. 오후 5시는 "17:00".
- ai 일에는 employee 에 가장 맞는 직원 아이디를 하나 넣어라. 맞는 직원이 없으면 null.
- 제목은 대표가 한 말을 짧게 그대로 써라. 새로운 일을 지어내지 마라.
- 결제, 업로드, 게시, 메시지 발송, 삭제가 필요한 ai 일은 needsApproval 을 true 로.

JSON 으로만 답하라:
{"human":[{"title":"...","time":"HH:MM 또는 null"}],"ai":[{"title":"...","time":null,"employee":"아이디 또는 null","needsApproval":false}]}

대표의 말:
${utterance}`;
}

function clean(parsed, employees) {
  const ids = new Set(employees.map((e) => e.id));
  const human = (Array.isArray(parsed?.human) ? parsed.human : [])
    .map((x) => ({ title: String(x?.title || '').trim().slice(0, 200), time: timeOrNull(x?.time) }))
    .filter((x) => x.title);
  const ai = (Array.isArray(parsed?.ai) ? parsed.ai : [])
    .map((x) => ({
      title: String(x?.title || '').trim().slice(0, 200),
      time: timeOrNull(x?.time),
      employee: ids.has(x?.employee) ? x.employee : null,
      needsApproval: Boolean(x?.needsApproval),
    }))
    .filter((x) => x.title);
  return { human, ai };
}

async function viaOllama(utterance, employees, today) {
  const model = await pickOllamaModel();
  if (!model) throw new Error('Ollama 모델 없음');
  const body = {
    model,
    stream: false,
    format: 'json',
    think: false,
    options: { temperature: 0.1 },
    messages: [{ role: 'user', content: buildPrompt(utterance, employees, today) }],
  };
  const res = await getJson(`${OLLAMA}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 90000);
  const content = String(res.message?.content || '').replace(/<think>[\s\S]*?<\/think>/g, '');
  const m = content.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('JSON 없음');
  return { engine: `로컬 AI · Ollama ${model}`, ...clean(JSON.parse(m[0]), employees) };
}

async function viaLmStudio(utterance, employees, today) {
  const list = await getJson(`${LMSTUDIO}/v1/models`);
  const model = list.data?.find((m) => !/embed/i.test(m.id))?.id;
  if (!model) throw new Error('LM Studio 모델 없음');
  const res = await getJson(`${LMSTUDIO}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, temperature: 0.1, messages: [{ role: 'user', content: buildPrompt(utterance, employees, today) }] }),
  }, 90000);
  const content = String(res.choices?.[0]?.message?.content || '').replace(/<think>[\s\S]*?<\/think>/g, '');
  const m = content.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('JSON 없음');
  return { engine: `로컬 AI · LM Studio ${model}`, ...clean(JSON.parse(m[0]), employees) };
}

// ───────── 간단 규칙 (로컬 AI가 없을 때) ─────────

const KO_NUM = { 한: 1, 두: 2, 세: 3, 네: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10, 열한: 11, 열두: 12 };

export function parseTime(s) {
  const re = /(오전|오후|아침|낮|저녁|밤|새벽)?\s*(\d{1,2}|열한|열두|한|두|세|네|다섯|여섯|일곱|여덟|아홉|열)\s*시\s*(?:(\d{1,2})\s*분|(반))?/;
  const m = re.exec(s);
  if (m) {
    let h = /^\d+$/.test(m[2]) ? Number(m[2]) : KO_NUM[m[2]];
    const mi = m[4] ? 30 : m[3] ? Number(m[3]) : 0;
    const p = m[1];
    if ((p === '오후' || p === '저녁' || p === '밤') && h < 12) h += 12;
    if (p === '낮' && h < 6) h += 12;
    if ((p === '아침' || p === '오전' || p === '새벽') && h === 12) h = 0;
    if (!p && h >= 1 && h <= 6) h += 12; // "5시 촬영" 은 보통 오후
    return { time: timeOrNull(`${h}:${mi}`), matched: m[0] };
  }
  const c = /(\d{1,2}):(\d{2})/.exec(s);
  if (c) return { time: timeOrNull(c[0]), matched: c[0] };
  return { time: null, matched: '' };
}

const AI_WORDS = /(찾기|찾아|검색|비교|조사|알아봐|알아보|정리|요약|만들어|만들기|작성|편집|코딩|개발|번역|보고서|분석|리서치|예약 알아|예매 알아|AI|에이전트)/i;
const APPROVAL_WORDS = /(결제|구매|예매|예약|업로드|게시|올려|보내|발송|삭제|송금)/;

function suggestEmployee(title, employees) {
  for (const e of employees) {
    const short = e.name.split(/\s/)[0];
    if (short && title.toLowerCase().includes(short.toLowerCase())) return e.id;
  }
  const byRole = (re) => employees.find((e) => re.test(`${e.role} ${(e.tools || []).join(' ')}`))?.id || null;
  if (/(영상|블렌더|blender|3d|렌더|모션)/i.test(title)) return byRole(/영상|blender/i);
  if (/(마케팅|홍보|광고)/.test(title)) return byRole(/마케팅/);
  if (/(찾기|찾아|검색|비교|비행기|예약|예매|사이트|브라우저|조사)/.test(title)) return byRole(/컴퓨터 유즈/);
  return null;
}

export function ruleSplit(utterance, employees) {
  const parts = utterance
    .split(/[\n,.。·]|그리고|그 다음에|그다음에|다음에|하고 나서|그리고 나서/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1);
  const human = [];
  const ai = [];
  for (const raw of parts) {
    const { time, matched } = parseTime(raw);
    let title = raw.replace(matched, '').replace(/\s{2,}/g, ' ').replace(/^(에|에는|은|는)\s*/, '').trim();
    title = title.replace(/(해야 ?(해|돼|됨|함)|해줘|해 줘|할 거야|있어|있음|갈 거야|가야 ?(해|돼))$/, '').trim() || raw;
    const isAi = AI_WORDS.test(raw);
    if (isAi) ai.push({ title, time, employee: suggestEmployee(title, employees), needsApproval: APPROVAL_WORDS.test(raw) });
    else human.push({ title, time });
  }
  return { engine: '간단 규칙 (로컬 AI 응답 없음)', human, ai };
}

export async function splitUtterance(utterance, employees, today) {
  const errors = [];
  try {
    return await viaOllama(utterance, employees, today);
  } catch (e) {
    errors.push(`Ollama: ${e.message}`);
  }
  try {
    return await viaLmStudio(utterance, employees, today);
  } catch (e) {
    errors.push(`LM Studio: ${e.message}`);
  }
  return { ...ruleSplit(utterance, employees), errors };
}

// 자동 배분은 assign.mjs, 안전 정지 단어는 gates.mjs
