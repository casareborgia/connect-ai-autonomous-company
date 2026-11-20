// 자동 배분: 누가 (사람 또는 AI 직원), 어떤 리소스로, 왜.
// 1) 간단 규칙 (늘 동작, 한국어 어미를 떼고 비교)  2) 로컬 AI 가 있으면 다시 본다 (규칙보다 나쁠 때는 규칙 유지)
import { detectGate } from './gates.mjs';
import { pickOllamaModel } from './llm.mjs';
import { isGeneral } from './catalog.mjs';

const OLLAMA = process.env.AIHQ_OLLAMA_URL || 'http://127.0.0.1:11434';
const LMSTUDIO = process.env.AIHQ_LMSTUDIO_URL || 'http://127.0.0.1:1234';

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

// 몸이나 현장, 내 얼굴과 목소리가 필요한 일
const HUMAN_STRONG = /(촬영|병원|치과|운동|헬스|하키|미팅|약속|방문|출근|퇴근|여행|재부팅|전원|포장|택배|송장\s*출력|컷\s*편집|capcut|캡컷|프리미어로|파이널\s*컷|라이브\s*방송|라이브\s*촬영|시장\s*가|은행\s*가|만나|식사|점심|저녁\s*먹|면접|상담|강의하기|출장)/i;
const HUMAN_WEAK = /(가기|전화|라이브|강의|은행|아버지|어머니|가족|친구)/;
// 결과물이 글이나 자료면 AI 일
const OUTPUT_WORDS = /(문구|글|대본|요약|정리|초안|계획|리스트|목록|조사|아이디어|제목|카피|번역|분석|기획|캘린더|체크리스트)/;
const AI_VERBS = /(찾기|찾아|검색|비교|조사|정리|요약|작성|만들기|만들어|문구|카피|편집|코딩|분석|번역|리서치|초안|써\s*줘|써줘|쓰기|뽑아|짜\s*줘|고쳐|수정|리뷰|테스트|기획|디자인|알아봐|추천)/;
const HEAVY_WORDS = /(blender|블렌더|렌더|3d|모션|애니메이션|시뮬)/i;

// 할 일 종류 (할 일 말 ↔ 직원 프로필 말). why 는 화면에 보이는 이유
const CATS = [
  { why: '글쓰기', task: /(문구|카피|대본|설명란|캡션|제목|태그|공지|초안|답장|블로그|상세페이지|기획|캘린더|아이디어|써\s*줘|써줘|쓰기|작성|뽑아|짜\s*줘|소개\s*글|보도자료|멘트|문장|다듬|교정|퇴고|맞춤법|글\s*(써|쓰|작성))/, emp: /(글|문구|카피|대본|기획|제목|답장|마케팅|작성|콘텐츠|블로그|상세페이지|설명란)/ },
  { why: '자료 조사', task: /(조사|검색|트렌드|리서치|찾아|찾기|비교|분석|알아봐|시장|경쟁)/, emp: /(조사|검색|트렌드|리서치|분석|찾기|비교|출처)/ },
  { why: '요약, 정리', task: /(요약|정리|회의록|번역|영어로|한국어로|일본어로|문서)/, emp: /(요약|정리|번역|문서)/ },
  { why: '디자인', task: /(배너|썸네일|카드\s*뉴스|디자인|포스터|로고|이미지|그림|일러스트)/, emp: /(디자인|배너|썸네일|카드\s*뉴스|이미지|그림)/ },
  { why: '코딩', task: /(코드|코딩|개발|버그|테스트|스크립트|리팩터|리뷰|\bpr\b|랜딩\s*페이지|웹사이트|홈페이지|웹페이지|api|배포|git|깃|브랜치|에러|함수|npm|db|서버\s*설정|쿼리|sql|의존성|라이브러리|패키지|빌드|린트|lint|타입\s*에러|\bci\b|커버리지|엔드포인트|백엔드|프론트엔드|리팩토링|성능\s*개선)/i, emp: /(코딩|개발|버그|테스트|스크립트|리뷰|리팩터|코드|프로그래밍|웹페이지)/ },
  { why: 'Blender 작업', task: /(blender|블렌더|3d|렌더|모션|애니메이션|바이브코딩)/i, emp: /(영상|blender|바이브코딩|3d|모션)/i },
  { why: '컴퓨터 작업', task: /(예약|예매|사이트|브라우저|클릭|항공|비행기|표\s*찾)/, emp: /(컴퓨터\s*유즈|브라우저)/ },
  { why: '홍보', task: /(마케팅|홍보|광고\s*문구|sns)/i, emp: /(마케팅|홍보)/ },
];
const CODE_CAT = CATS.find((c) => c.why === '코딩');
// 확인이 필요한 일 중 코딩 직원이 맡아도 되는 것 (저장소, 패키지, 서버 일)
const CODE_GATE = /(git|깃|브랜치|npm|pypi|배포|\bdb\b|데이터베이스|\bpr\b|코드|스크립트|서버|캐시|패키지|레포|저장소|테이블)/i;
const FIND_WORDS = /(찾아|찾기|검색|알아봐|추천|비교)/;

// 한국어 어미와 조사를 뗀다 (번역해줘 → 번역)
const ENDINGS = ['해주세요', '해줘요', '해줘', '해봐', '해보기', '하기', '하고', '해서', '하는', '했던', '하자', '시켜', '해', '줘', '좀', '이랑', '에게', '에서', '으로', '들', '를', '을', '이', '가', '은', '는', '의', '에', '로', '와', '과', '랑', '도', '만'];
function stem(w) {
  let s = w;
  for (let i = 0; i < 3; i++) {
    const e = ENDINGS.find((x) => s.length > x.length + 1 && s.endsWith(x));
    if (!e) break;
    s = s.slice(0, -e.length);
  }
  return s;
}
export function tokens(s) {
  return String(s || '').toLowerCase().split(/[\s,./·()!?'"]+/).map(stem).filter((w) => w.length >= 2);
}
function tokenHit(taskTokens, profileTokens) {
  for (const t of taskTokens) for (const p of profileTokens) if (t === p || (p.length >= 2 && t.includes(p)) || (t.length >= 2 && p.includes(t))) return t;
  return null;
}

function availableResource(resources, id) {
  const r = resources.find((x) => x.id === id);
  return r && r.status !== '꺼짐' ? r : null;
}

// 리소스: 할 일에 이름이 나온 계정 > 무거운 일은 맥 스튜디오 > 직원의 기계 > 이 맥
export function pickResource(title, emp, resources) {
  const low = String(title).toLowerCase();
  const named = resources.find((r) => r.status !== '꺼짐' && r.kind !== '기계' && r.kind !== '폴더' && tokens(r.name).some((w) => w.length >= 3 && low.includes(w)));
  if (named) return named;
  if (HEAVY_WORDS.test(title)) {
    const studio = resources.find((r) => r.kind === '기계' && /스튜디오|studio/i.test(r.name) && r.status !== '꺼짐');
    if (studio) return studio;
  }
  for (const id of emp?.resources || []) {
    const r = availableResource(resources, id);
    if (r && r.kind === '기계') return r;
  }
  return resources.find((r) => r.kind === '기계' && r.isThisMac && r.status !== '꺼짐') || null;
}

const result = (assignee, emp, resources, text, gate, why, extra = {}) => {
  const r = assignee && assignee !== 'jay' ? pickResource(text, emp, resources) : null;
  const who = assignee === 'jay' ? '사람' : emp ? emp.name : '맞는 직원 없음';
  return { assignee, resource: r?.id || null, gate, reason: `${why} → ${who}${r ? `, ${r.name}` : ''}`, engine: '간단 규칙', ...extra };
};

function scoreEmployees(text, employees) {
  const tt = tokens(text);
  let best = null;
  for (const e of employees) {
    const profile = `${e.role || ''} ${(e.tools || []).join(' ')} ${(e.manual || '').slice(0, 300)}`;
    let score = 0;
    let why = '';
    for (const c of CATS) if (c.task.test(text) && c.emp.test(profile)) { score += 3; why = why || c.why; }
    const hit = tokenHit(tt, tokens(profile));
    if (hit) { score += 2; why = why || `${hit} 작업`; }
    if (score > 0 && (!best || score > best.score)) best = { e, score, why };
  }
  return best;
}

export function ruleAssign(title, note, employees, resources) {
  const text = `${title} ${note || ''}`;
  const gate = detectGate(text);
  const ai = employees.filter(Boolean);
  // 이름을 부르면 그 직원
  for (const e of ai) {
    const short = e.name.split(/\s/)[0].toLowerCase();
    if (short.length >= 2 && text.toLowerCase().includes(short) && !/^(로컬|내가)$/.test(short)) {
      return result(e.id, e, resources, text, gate, '이름을 불러서');
    }
  }
  const isCode = CODE_GATE.test(text) && ai.some((e) => CODE_CAT.emp.test(`${e.role || ''} ${(e.tools || []).join(' ')}`));
  // 결제는 늘 사람. 다른 확인 일은 코딩 일이 아니면 사람 (로그인과 계정이 필요한 일)
  if (gate === '결제') return result('jay', null, resources, text, gate, '결제가 들어간 일');
  if (gate && !isCode) return result('jay', null, resources, text, gate, `${gate}가 들어간 일`);
  if (HUMAN_STRONG.test(text) && !OUTPUT_WORDS.test(text) && !FIND_WORDS.test(text)) return result('jay', null, resources, text, gate, '몸이나 현장이 필요한 일');
  const best = scoreEmployees(text, ai);
  if (best) return result(best.e.id, best.e, resources, text, gate, best.why);
  if (HUMAN_WEAK.test(text) && !AI_VERBS.test(text)) return result('jay', null, resources, text, gate, '직접 하는 일');
  if (AI_VERBS.test(text)) {
    const cat = CATS.find((c) => c.task.test(text));
    const general = ai.find((e) => isGeneral(e));
    if (general && cat?.why !== '코딩') return result(general.id, general, resources, text, gate, `${cat ? cat.why : 'AI 일'} (가장 가까운 직원)`);
    return { assignee: null, resource: null, gate, reason: ai.length ? 'AI 일 같지만 맞는 직원이 없음 · 담당을 골라 주세요' : 'AI 일 같아요 · 먼저 내 직원에서 쓰는 AI 를 추가해 주세요', engine: '간단 규칙', noMatch: true };
  }
  return { ...result('jay', null, resources, text, gate, ai.length ? '맞는 AI 직원이 없어서' : '아직 AI 직원이 없어서'), noMatch: true };
}

function assignPrompt(title, note, employees, hint) {
  const staff = employees.map((e) => `- ${e.id}: ${e.name} | 역할: ${e.role || '없음'} | 도구: ${(e.tools || []).join(', ') || '없음'}`).join('\n');
  return `너는 회사의 일 배분 담당이다. 새 할 일을 누가 할지 하나만 고른다.
선택지: "jay" (대표 본인) 또는 아래 AI 직원 아이디.

판단 기준
- 글쓰기, 문구, 대본, 요약, 번역, 정리, 조사, 분석, 기획, 코딩처럼 화면 안에서 끝나는 일은 몸이 필요 없다. 역할이 가장 가까운 AI 직원에게 준다.
- 사람에게는 몸, 현장, 대표의 얼굴과 목소리가 꼭 필요한 일만 준다 (촬영, 방문, 미팅, 운동, 라이브 방송, 포장).
- 결제는 늘 "jay".
- 역할이 딱 맞는 직원이 없어도 화면 안에서 끝나는 일이면 가장 가까운 AI 직원을 고른다.

예시
- "다음 영상 대본 써줘" → 글을 쓰는 AI 직원
- "경쟁 채널 영상 분석" → 조사나 분석을 하는 AI 직원
- "썸네일 문구 3안" → 글을 쓰는 AI 직원
- "아이폰으로 B롤 촬영" → "jay"
- "원단 샘플 주문해줘" → "jay"

AI 직원:
${staff}
${hint.assignee ? `\n간단 규칙의 추천 (참고만): ${hint.assignee} (${hint.reason})\n` : ''}
할 일: ${title}
메모: ${note || '없음'}

JSON 으로만 답하라. why 는 일의 핵심을 2~4 단어로 (예: "대본 쓰기", "항공권 비교").
{"assignee":"jay 또는 아이디","why":"..."}`;
}

export async function aiAssign(title, note, employees, resources) {
  const hint = ruleAssign(title, note, employees, resources);
  // 규칙이 확실한 경우 (결제 등 확인 일, 몸이 필요한 일, 이름을 부른 일) 는 로컬 AI 에 묻지 않는다
  if (hint.assignee === 'jay' && !hint.noMatch) return { ...hint, engine: '간단 규칙' };
  if (/^이름을 불러서/.test(hint.reason)) return hint;
  if (!employees.length) return hint;
  const prompt = assignPrompt(title, note, employees, hint);
  let content = null;
  let engine = '';
  try {
    const model = await pickOllamaModel();
    if (!model) throw new Error('no model');
    const res = await getJson(`${OLLAMA}/api/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, stream: false, format: 'json', think: false, options: { temperature: 0 }, messages: [{ role: 'user', content: prompt }] }),
    }, 90000);
    content = res.message?.content;
    engine = `로컬 AI · ${model}`;
  } catch {
    const list = await getJson(`${LMSTUDIO}/v1/models`);
    const model = list.data?.find((m) => !/embed/i.test(m.id))?.id;
    if (!model) throw new Error('로컬 AI 없음');
    const res = await getJson(`${LMSTUDIO}/v1/chat/completions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, temperature: 0, messages: [{ role: 'user', content: prompt }] }),
    }, 90000);
    content = res.choices?.[0]?.message?.content;
    engine = `로컬 AI · ${model}`;
  }
  let body = String(content || '').replace(/<think>[\s\S]*?<\/think>/g, '');
  if (body.includes('</think>')) body = body.split('</think>').pop();
  const m = body.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('JSON 없음');
  const p = JSON.parse(m[0]);
  const byId = new Map(employees.map((e) => [e.id, e]));
  let assignee = p.assignee === 'jay' ? 'jay' : byId.has(p.assignee) ? p.assignee : null;
  const text = `${title} ${note || ''}`;
  // 글쓰기나 분석처럼 화면 안에서 끝나는 일을 사람에게 돌리면 규칙을 따른다
  if ((assignee === 'jay' || assignee === null) && hint.assignee && hint.assignee !== 'jay') return { ...hint, engine: `${engine} (규칙 유지)` };
  if (!assignee) return { ...hint, engine };
  const emp = byId.get(assignee);
  const profile = (e) => `${e?.role || ''} ${(e?.tools || []).join(' ')}`;
  // 코딩 일을 규칙이 코딩 직원에게 줬는데 로컬 AI 가 코딩 직원이 아닌 쪽을 고르면 규칙을 따른다
  const hintEmp = byId.get(hint.assignee);
  if (emp && hintEmp && CODE_CAT.task.test(text) && CODE_CAT.emp.test(profile(hintEmp)) && !CODE_CAT.emp.test(profile(emp))) return { ...hint, engine: `${engine} (규칙 유지)` };
  let why = String(p.why || '').replace(/[\s→]+/g, ' ').trim().slice(0, 30) || '로컬 AI 판단';
  // 사람에게 주면서 앞뒤가 안 맞는 긴 설명을 붙이면 짧은 말로 바꾼다
  if (assignee === 'jay' && (why.length > 16 || /ai|화면/i.test(why))) why = '직접 하는 일로 판단';
  return { ...result(assignee, emp, resources, text, hint.gate, why), engine };
}
