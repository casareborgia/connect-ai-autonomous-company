// 처음 켤 때 고르는 AI 목록. 고르면 역할, 3종 직원 구분, 연결 방식이 미리 채워진 직원이 된다.
// engine: web = 복사해서 맡기기 (환경변수, 설치 없이 동작), local = 이 맥의 로컬 모델, claude / codex = 이 맥의 CLI
export const DEFAULT_GROUPS = [
  { id: 'office-bigco', title: '내 사무실에서 근무', subtitle: '대기업 AI · 월급 = 구독료', detail: '내 데스크탑·웹에서 부리는 대기업 AI 직원' },
  { id: 'home-cloud', title: '자기 집에서 근무', subtitle: '클라우드 AI', detail: '클라우드에서 명령을 받아 따로 일하는 AI 직원' },
  { id: 'office-own', title: '내 컴퓨터 상주', subtitle: '로컬 AI · 내 사무실 직원', detail: '이 컴퓨터 안에서 직접 돌아가는 상주 AI 직원' },
];

export const AI_CATALOG = [
  { key: 'chatgpt', name: 'ChatGPT', group: 'office-bigco', role: '글쓰기, 문구, 답장, 요약, 번역, 자료 조사', hint: '글, 답장, 문구', engine: 'web', url: 'https://chatgpt.com/', general: true },
  { key: 'claude', name: 'Claude', group: 'office-bigco', role: '긴 글, 대본, 기획, 분석, 요약', hint: '긴 글, 대본, 분석', engine: 'web', url: 'https://claude.ai/new', general: true },
  { key: 'gemini', name: 'Gemini', group: 'office-bigco', role: '자료 조사, 검색, 트렌드, 요약', hint: '조사, 검색, 요약', engine: 'web', url: 'https://gemini.google.com/app', general: true },
  { key: 'perplexity', name: 'Perplexity', group: 'office-bigco', role: '자료 조사, 출처 찾기, 비교', hint: '검색, 출처', engine: 'web', url: 'https://www.perplexity.ai/', general: true },
  { key: 'grok', name: 'Grok', group: 'office-bigco', role: '실시간 소식, 트렌드, 아이디어', hint: '실시간 소식, 아이디어', engine: 'web', url: 'https://grok.com/', general: true },
  { key: 'canva', name: 'Canva AI', group: 'office-bigco', role: '디자인, 배너, 썸네일, 카드뉴스', hint: '배너, 썸네일', engine: 'web', url: 'https://www.canva.com/' },
  { key: 'claudecode', name: 'Claude Code', group: 'office-bigco', role: '코딩, 코드 리뷰, 리팩터링, 웹페이지', hint: '코딩, 리뷰', engine: 'claude', url: 'https://claude.ai/code' },
  { key: 'codex', name: 'Codex', group: 'office-bigco', role: '코딩, 버그 수정, 테스트, 스크립트', hint: '버그 수정, 테스트', engine: 'codex', url: 'https://chatgpt.com/codex' },
  { key: 'muse', name: 'Muse', group: 'home-cloud', role: '클라우드 작업, 리서치, 정리', hint: '클라우드 · 데스크탑 명령', engine: 'web', url: '' },
  { key: 'pickle', name: '피클', group: 'home-cloud', role: '스마트폰 작업, 이동 중 요청', hint: '클라우드 · 스마트폰 명령', engine: 'web', url: '' },
  { key: 'ollama', name: '로컬 AI (Ollama)', group: 'office-own', role: '요약, 번역, 문서 정리', hint: '이 컴퓨터 안에서 바로 답', engine: 'local', local: 'ollama' },
  { key: 'lmstudio', name: '로컬 AI (LM Studio)', group: 'office-own', role: '요약, 번역, 문서 정리', hint: '이 컴퓨터 안에서 바로 답', engine: 'local', local: 'lmstudio' },
];

// 웹 앱 주소 (직원 이름으로 찾기, 예전 데이터용)
export function webUrlFor(name) {
  const n = String(name || '').toLowerCase();
  if (/codex/.test(n)) return 'https://chatgpt.com/codex';
  if (/claude\s*code/.test(n)) return 'https://claude.ai/code';
  if (/chatgpt|gpt|챗지피티/.test(n)) return 'https://chatgpt.com/';
  if (/claude|클로드/.test(n)) return 'https://claude.ai/new';
  if (/gemini|제미나이/.test(n)) return 'https://gemini.google.com/app';
  if (/perplexity|퍼플렉시티/.test(n)) return 'https://www.perplexity.ai/';
  if (/grok|그록/.test(n)) return 'https://grok.com/';
  if (/canva|캔바/.test(n)) return 'https://www.canva.com/';
  return '';
}

// 아무 글이나 맡길 수 있는 대화형 AI 인가 (코딩 전용 제외)
export function isGeneral(e) {
  if (e.general) return true;
  const n = String(e.name || '').toLowerCase();
  if (/code|codex|canva|gemma|로컬|local/.test(n)) return false;
  return /chatgpt|gpt|claude|클로드|gemini|제미나이|grok|perplexity/.test(n);
}
