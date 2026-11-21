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
  { key: 'claudecode', name: 'Claude Code', group: 'office-bigco', role: '코딩, 코드 리뷰, 리팩터링, 웹페이지', hint: '코딩, 리뷰 · 로컬 CLI', engine: 'claude', url: 'https://claude.ai/code' },
  { key: 'codex', name: 'Codex', group: 'office-bigco', role: '코딩, 버그 수정, 테스트, 스크립트', hint: '버그 수정 · 로컬 CLI', engine: 'codex', url: 'https://chatgpt.com/codex' },
  { key: 'geminicli', name: 'Gemini CLI', group: 'office-bigco', role: '자료 조사, 코딩, 터미널 자동화, 요약', hint: '조사, 코딩 · 로컬 CLI', engine: 'gemini', url: 'https://gemini.google.com/app' },
  { key: 'antigravity', name: 'Antigravity (agy)', group: 'office-bigco', role: '복합 코딩, 브라우저·컴퓨터 유즈, 리서치', hint: '에이전트 · 로컬 CLI', engine: 'agy', url: 'https://antigravity.google/' },
  { key: 'opencode', name: 'OpenCode', group: 'office-bigco', role: '코딩, 리팩터링, 터미널 자동화', hint: '코딩 · 오픈소스 CLI', engine: 'opencode', url: 'https://opencode.ai/' },
  { key: 'cursor', name: 'Cursor', group: 'office-bigco', role: '코드 편집, 버그 수정, 리팩터링', hint: '코드 편집 · IDE MCP', engine: 'web', url: 'https://cursor.com/' },
  { key: 'muse', name: 'Muse', group: 'home-cloud', role: '클라우드 작업, 리서치, 정리', hint: '클라우드 · 데스크탑 명령', engine: 'web', url: 'https://muse.ai/' },
  { key: 'dots', name: 'Dots (닷츠)', group: 'home-cloud', role: '클라우드 AI 에이전트, 리서치, 문서·일정 자동화', hint: '클라우드 · 에이전트', engine: 'web', url: '' },
  { key: 'manus', name: 'Manus', group: 'home-cloud', role: '자율 웹 리서치, 보고서 작성, 슬라이드', hint: '클라우드 · 자율 리서치', engine: 'web', url: 'https://manus.im/' },
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
  if (/manus|마누스/.test(n)) return 'https://manus.im/';
  if (/cursor|커서/.test(n)) return 'https://cursor.com/';
  if (/antigravity|agy/.test(n)) return 'https://antigravity.google/';
  if (/opencode/.test(n)) return 'https://opencode.ai/';
  return '';
}

// 아무 글이나 맡길 수 있는 대화형 AI 인가 (코딩 전용 제외)
export function isGeneral(e) {
  if (e.general) return true;
  const n = String(e.name || '').toLowerCase();
  if (/code|codex|canva|gemma|로컬|local/.test(n)) return false;
  return /chatgpt|gpt|claude|클로드|gemini|제미나이|grok|perplexity/.test(n);
}

// AI 직원 캐릭터 팩 (기본: 한국 전통 K-수호 크루, 선택: 모던 랩 크루)
export const AVATAR_PACKS = [
  { key: 'k-crew', name: 'K-수호 크루 (한국 전통)', hint: '해태 · 도깨비 · 까치 · 민화 호랑이 · 청룡 · 달토끼 · 장승 · 봉황' },
  { key: 'modern', name: '모던 랩 크루', hint: '노바 · 볼트 · 루미 · 모모 · 코코 · 보보 · 핍 · 징' },
];

// AI 직원 캐릭터 표현 방식 (직원마다 또는 전체 한 번에 선택)
export const AVATAR_STYLES = [
  { key: 'studio', name: '스튜디오 3D', hint: 'CONNECT AI LAB 컬러 3D 피규어' },
  { key: 'motion', name: '코딩 모션', hint: '눈 깜빡임 · 호흡 · 타자 컬러 모션그래픽' },
  { key: 'pixel', name: '픽셀 펫', hint: '귀여운 컬러 도트 모션 캐릭터' },
  { key: 'flat', name: '컬러 미니멀', hint: '깔끔한 컬러 플랫 일러스트' },
];

// CONNECT AI LAB 오리지널 컬러 캐릭터 16종 (한국 전통 K-수호 크루 8종 + 모던 랩 크루 8종)
export const AVATAR_PRESETS = [
  // 한국 전통 K-수호 크루 (기본)
  { key: 'haetae', pack: 'k-crew', name: '해태 (수호·자동화)', hint: '코딩 · 안전 · 화면 조작', color: '#14B8A6', bg: '#F0FDFA' },
  { key: 'dokkaebi', pack: 'k-crew', name: '도깨비 (기획·글쓰기)', hint: '아이디어 · 대본 · 전략', color: '#EF4444', bg: '#FFF5F2' },
  { key: 'kkachi', pack: 'k-crew', name: '까치 (소식·리서치)', hint: '트렌드 · 조사 · 아침 소식', color: '#3B82F6', bg: '#F0F6FF' },
  { key: 'horangi', pack: 'k-crew', name: '민화 호랑이 (마케팅)', hint: '홍보 · SNS · 시선 강탈', color: '#F59E0B', bg: '#FFFBEB' },
  { key: 'cheongnyong', pack: 'k-crew', name: '청룡 (클라우드 총괄)', hint: '클라우드 · 메일 · 연결', color: '#06B6D4', bg: '#ECFEFF' },
  { key: 'dalto', pack: 'k-crew', name: '달토끼 (스마트폰)', hint: '모바일 · 빠른 응답', color: '#EC4899', bg: '#FDF2F8' },
  { key: 'jangseung', pack: 'k-crew', name: '꼬마 장승 (로컬 상주)', hint: '로컬 수호 · 요약 · 번역', color: '#D97706', bg: '#FEF9EE' },
  { key: 'bonghwang', pack: 'k-crew', name: '아기 봉황 (스튜디오)', hint: '영상 · 디자인 · 콘텐츠', color: '#FB923C', bg: '#FFF7ED' },
  // 모던 랩 크루 (선택)
  { key: 'nova', pack: 'modern', name: '노바 (기획 크루)', hint: '글쓰기 · 기획 · 전략', color: '#FF7A59', bg: '#FFF3EE' },
  { key: 'volt', pack: 'modern', name: '볼트 (테크 크루)', hint: '코딩 · 자동화 · 화면 조작', color: '#38BDF8', bg: '#EFF9FF' },
  { key: 'lumi', pack: 'modern', name: '루미 (리서치 크루)', hint: '조사 · 트렌드 · 영상', color: '#8B5CF6', bg: '#F4F0FF' },
  { key: 'momo', pack: 'modern', name: '모모 (구름 요정)', hint: '클라우드 · 메일 · 정리', color: '#F472B6', bg: '#FFF0F7' },
  { key: 'coco', pack: 'modern', name: '코코 (모바일 크루)', hint: '스마트폰 · 빠른 응답', color: '#10B981', bg: '#ECFDF5' },
  { key: 'bobo', pack: 'modern', name: '보보 (새싹 봇)', hint: '로컬 상주 · 요약 · 번역', color: '#F59E0B', bg: '#FFFBEB' },
  { key: 'pip', pack: 'modern', name: '핍 (스튜디오 디렉터)', hint: '디자인 · 3D · 콘텐츠', color: '#FB923C', bg: '#FFF5EB' },
  { key: 'zing', pack: 'modern', name: '징 (스파크 스타)', hint: '마케팅 · SNS · 홍보', color: '#F43F5E', bg: '#FFF0F3' },
];

export const LEGACY_AVATAR_MAP = {
  fox: 'dokkaebi', cat: 'haetae', owl: 'kkachi', whale: 'cheongnyong',
  rabbit: 'dalto', bot: 'jangseung', bear: 'bonghwang', spark: 'horangi',
};

export function defaultAvatarFor(emp = {}, pack = 'k-crew') {
  if (pack === 'k-crew' && emp.avatar && LEGACY_AVATAR_MAP[emp.avatar]) return LEGACY_AVATAR_MAP[emp.avatar];
  const s = `${emp.catalog || ''} ${emp.id || ''} ${emp.name || ''} ${emp.role || ''}`.toLowerCase();
  if (pack === 'modern') {
    if (/claude|클로드|기획|대본/.test(s)) return 'nova';
    if (/codex|cursor|컴퓨터\s*유즈|버그/.test(s)) return 'volt';
    if (/muse|dots|닷츠|manus/.test(s)) return 'momo';
    if (/pickle|피클|스마트폰|모바일/.test(s)) return 'coco';
    if (/gemini|제미나이|perplexity|조사|리서치/.test(s)) return 'lumi';
    if (/마케팅|홍보|sns|grok/.test(s)) return 'zing';
    if (/canva|디자인|영상|블렌더|blender/.test(s)) return 'pip';
    return 'bobo';
  }
  if (/claude|클로드|기획|대본/.test(s)) return 'dokkaebi';
  if (/codex|cursor|컴퓨터\s*유즈|버그/.test(s)) return 'haetae';
  if (/muse|dots|닷츠|manus/.test(s)) return 'cheongnyong';
  if (/pickle|피클|스마트폰|모바일/.test(s)) return 'dalto';
  if (/gemini|제미나이|perplexity|조사|리서치/.test(s)) return 'kkachi';
  if (/마케팅|홍보|sns|grok/.test(s)) return 'horangi';
  if (/canva|디자인|영상|블렌더|blender/.test(s)) return 'bonghwang';
  return 'jangseung';
}
