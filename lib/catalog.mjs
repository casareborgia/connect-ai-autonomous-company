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

// AI 직원 소속 팀(부서) — 세종대왕 조선 AI 집현전 스웜 & 1인 회사 조직 운영
export const TEAMS = [
  { key: 'exec',      name: '총괄 · 세종실',   short: '총괄',   color: '#F5B93B', hint: '세종대왕 · 소헌왕후 · 일정 총괄 · 옥새 결재' },
  { key: 'dev',       name: '개발 · 장영실방', short: '개발',   color: '#2FD49B', hint: '장영실 · 천문 아씨 · 해시계·자격루 자동화·코딩' },
  { key: 'plan',      name: '기획 · 집현전',   short: '기획',   color: '#A855F7', hint: '갓 선비 · 문인 아씨 · 훈민정음 글쓰기·대본' },
  { key: 'design',    name: '디자인 · 도화서', short: '디자인', color: '#FB923C', hint: '김홍도 · 신사임당 · 안견 · 신윤복 · 추사 김정희' },
  { key: 'marketing', name: '마케팅 · 보부상', short: '마케팅', color: '#F56A42', hint: '패랭이 보부상 · 예인 아씨 · SNS·유튜브·홍보' },
  { key: 'research',  name: '리서치 · 다모방', short: '리서치', color: '#3B82F6', hint: '착호 사냥꾼 · 여수사관 다모 · 트렌드·QA·검증' },
  { key: 'ops',       name: '운영 · 마당쇠방', short: '운영',   color: '#38BDF8', hint: '마당쇠 · 행랑 아씨 · 5분 메일·문의·서버 감시' },
];

export function defaultTeamFor(emp = {}) {
  if (emp.team && TEAMS.some((t) => t.key === emp.team)) return emp.team;
  const s = `${emp.catalog || ''} ${emp.id || ''} ${emp.name || ''} ${emp.role || ''} ${emp.avatarName || ''}`.toLowerCase();
  if (/마케팅|홍보|sns|인스타|유튜브|광고|grok|marketer|보부상|예인/.test(s)) return 'marketing';
  if (/canva|디자인|썸네일|배너|영상|블렌더|blender|화원|도화서|김홍도|사임당|안견|윤복|추사/.test(s)) return 'design';
  if (/codex|claude\s*code|claudecode|cursor|opencode|agy|antigravity|컴퓨터\s*유즈|버그|테스트|스크립트|장영실|천문/.test(s)) return 'dev';
  if (/gemini|제미나이|perplexity|manus|조사|리서치|검색|출처|트렌드|사냥꾼|다모/.test(s)) return 'research';
  if (/muse|dots|닷츠|pickle|피클|이메일|메일|문의|운영|일정|로컬|ollama|lm\s*studio|gemma|상주|스마트폰|모바일|마당쇠|행랑/.test(s)) return 'ops';
  if (/claude|클로드|chatgpt|gpt|기획|대본|글쓰기|요약|번역|선비|문인/.test(s)) return 'plan';
  if (/코딩|코드|개발|자동화/.test(s)) return 'dev';
  return 'ops';
}

// 여러 조선 AI 일꾼단이 릴레이 또는 동시 합동 출동하는 원클릭 어명 템플릿
export const SWARM_MISSIONS = [
  {
    key: 'youtube',
    title: '유튜브 · 콘텐츠 풀코스 출동',
    mode: 'serial',
    badge: '릴레이 3팀',
    hint: '기획(집현전 선비) → 디자인(김홍도·신사임당) → 마케팅(보부상)',
    placeholder: '예: CONNECT AI HQ v2 출시 소개 영상',
    steps: [
      { team: 'plan', title: '영상 기획 · 대본 초안 (집현전 선비)', note: '후킹 15초 인트로 + 핵심 3포인트 + 시청자 CTA 대본을 작성해 줘.' },
      { team: 'design', title: '썸네일 · 비주얼 시안 기획 (도화서 김홍도·신사임당)', note: '클릭률 높은 썸네일 구도 3안(카피 5단어 이내, 색감·배치)을 설계해 줘.' },
      { team: 'marketing', title: '제목 · 설명란 · 태그 · SNS 홍보 초안 (보부상)', note: '유튜브 제목 후보 5개, 설명란, 해시태그, X·스레드 홍보글 초안을 만들어 줘.' },
    ],
  },
  {
    key: 'product',
    title: '신기능 개발 · 검증 · 출시 출동',
    mode: 'serial',
    badge: '릴레이 3팀',
    hint: '개발(장영실) → 리서치(다모 수사관) → 기획(집현전 선비)',
    placeholder: '예: 모바일 푸시 알림 기능 추가',
    steps: [
      { team: 'dev', title: '설계 · 구현 · 테스트 (장영실방)', note: '핵심 구조를 설계하고 최소 변경으로 구현·테스트 계획을 정리해 줘.' },
      { team: 'research', title: '엣지케이스 · 보안 · QA 검증 (다모 수사관)', note: '보안 경계, 실패 복구, 초보자 막힘 지점을 체크리스트로 검증해 줘.' },
      { team: 'plan', title: '사용자 안내 · 릴리즈 노트 (집현전 선비)', note: '초보자도 10초 만에 이해하는 쉬운 한글 릴리즈 노트를 써 줘.' },
    ],
  },
  {
    key: 'viral',
    title: '팔도 바이럴 마케팅 총공세',
    mode: 'serial',
    badge: '릴레이 4팀',
    hint: '리서치(사냥꾼) → 기획(문인) → 디자인(혜원·추사) → 마케팅(보부상)',
    placeholder: '예: 1인 AI 자율회사 무료 오픈소스 홍보',
    steps: [
      { team: 'research', title: '최신 트렌드 · 경쟁 키워드 사냥 (착호 사냥꾼)', note: '지금 반응 터지는 핵심 키워드·관점 3가지를 조사해 줘.' },
      { team: 'plan', title: '공감 훅 · 스토리 카피 (문인 아씨)', note: '읽자마자 저장·공유하고 싶은 핵심 카피 3버전을 써 줘.' },
      { team: 'design', title: '카드뉴스 · 배너 비주얼 가이드 (혜원·추사)', note: '시선 강탈 배너 문구·타이포·색상 구성을 설계해 줘.' },
      { team: 'marketing', title: 'X · 스레드 · 인스타 · 블로그 배포 초안 (보부상)', note: '채널별 톤에 맞춘 게시 초안을 정리해 줘 (게시는 대표 승인 전 임시저장만).' },
    ],
  },
  {
    key: 'morning',
    title: '아침 본사 일제 점검 (동시 출동)',
    mode: 'parallel',
    badge: '동시 3팀',
    hint: '운영(마당쇠) + 리서치(사냥꾼) + 기획(집현전 선비) 동시 착수',
    placeholder: '예: 오늘 오전 본사 브리핑',
    steps: [
      { team: 'ops', title: '이메일 · 수강생 문의 · 일정 점검 (마당쇠)', note: '새 메일과 급한 문의, 오늘 일정 충돌 여부를 정리해 줘.' },
      { team: 'research', title: '아침 업계 핵심 소식 3줄 사냥 (착호 사냥꾼)', note: '오늘 AI·자동화·크리에이터 핵심 뉴스 3가지와 내 사업 적용점을 요약해 줘.' },
      { team: 'plan', title: '대표 집중 TOP 3 우선순위 정리 (집현전 선비)', note: '대표님이 직접 할 핵심 3가지와 AI에 위임할 일을 나눠 제안해 줘.' },
    ],
  },
];

// AI 직원 캐릭터 팩 (조선 AI 집현전 직업군 남/여 · K-수호 크루 · 모던 랩 크루)
export const AVATAR_PACKS = [
  { key: 'joseon', name: '조선 AI 집현전 (20종 남·여)', hint: '세종대왕 · 장영실 · 갓 선비 · 김홍도 · 신사임당 · 안견 · 신윤복 · 추사 · 보부상 · 사냥꾼 · 다모 · 마당쇠 · 허준 · 수문장' },
  { key: 'k-crew', name: 'K-수호 크루 (한국 전통)', hint: '해태 · 도깨비 · 까치 · 민화 호랑이 · 청룡 · 달토끼 · 장승 · 봉황' },
  { key: 'modern', name: '모던 랩 크루', hint: '노바 · 볼트 · 루미 · 모모 · 코코 · 보보 · 핍 · 징' },
];

// AI 직원 캐릭터 표현 방식 (직원마다 또는 전체 한 번에 선택)
export const AVATAR_STYLES = [
  { key: 'studio', name: '스튜디오 3D', hint: 'CONNECT AI LAB 컬러 3D 피규어' },
  { key: 'motion', name: '코딩 모션', hint: '눈 깜빡임 · 호흡 · 타자 컬러 모션그래픽' },
  { key: 'pixel', name: '픽셀 펫', hint: '16비트 도트 모션 (일할 땐 모션+초록불 · 대기 땐 갓 내려쓰고 Z)' },
  { key: 'flat', name: '컬러 미니멀', hint: '깔끔한 컬러 플랫 일러스트' },
];

// CONNECT AI LAB 오리지널 컬러 캐릭터 (조선 AI 집현전 20종 + K-수호 크루 8종 + 모던 랩 크루 8종)
export const AVATAR_PRESETS = [
  // 조선 AI 집현전 (20종 남·여 직업군 16비트 픽셀)
  { key: 'sejong',       pack: 'joseon', team: 'exec',      gender: 'm', name: '세종대왕 (남 · 총괄)',      hint: '익선관 · 곤룡포 · 훈민정음(AI 대중화)', color: '#F5B93B', bg: '#1F1C18' },
  { key: 'queen',        pack: 'joseon', team: 'exec',      gender: 'f', name: '소헌왕후 (여 · 총괄)',      hint: '금빛 화관 · 황금 당의 · 본사 총괄', color: '#F5B93B', bg: '#211C17' },
  { key: 'jangyeongsil', pack: 'joseon', team: 'dev',       gender: 'm', name: '장영실 (남 · 개발팀)',      hint: '공방 두건 · 해시계(앙부일구) · 코딩·자동화', color: '#2FD49B', bg: '#162C24' },
  { key: 'cheomseong',   pack: 'joseon', team: 'dev',       gender: 'f', name: '천문 아씨 (여 · 개발팀)',   hint: '옥비녀 · 혼천의 · 스크립트·디버깅', color: '#2FD49B', bg: '#162C24' },
  { key: 'seonbi',       pack: 'joseon', team: 'plan',      gender: 'm', name: '집현전 선비 (남 · 기획팀)', hint: '흑갓 · 붓 · 낮잠 시 갓 푹 내려씀', color: '#A855F7', bg: '#241835' },
  { key: 'munin',        pack: 'joseon', team: 'plan',      gender: 'f', name: '문인 아씨 (여 · 기획팀)',   hint: '진주 족두리 · 화선지·대본·글쓰기', color: '#C084FC', bg: '#241835' },
  { key: 'hwawon',       pack: 'joseon', team: 'design',    gender: 'm', name: '단원 김홍도 (남 · 디자인)', hint: '도화서 수석 · 오방색 팔레트 · UI·스토리보드', color: '#FB923C', bg: '#2D1E17' },
  { key: 'saimdang',     pack: 'joseon', team: 'design',    gender: 'f', name: '신사임당 (여 · 디자인)',    hint: '초충도 팔랑 나비 · 브랜드·세밀화 일러스트', color: '#F6A887', bg: '#2B1D1B' },
  { key: 'angyeon',      pack: 'joseon', team: 'design',    gender: 'm', name: '안견 (남 · 3D/AI 이미지)',  hint: '세종 직속 · 《몽유도원도》 족자 · 3D·영상', color: '#14B8A6', bg: '#14262B' },
  { key: 'yunbok',       pack: 'joseon', team: 'design',    gender: 'f', name: '혜원 화원 (여 · 썸네일)',   hint: '신윤복 모티브 · 색동 소매 · SNS 색감 디렉터', color: '#EC4899', bg: '#2D1526' },
  { key: 'chusa',        pack: 'joseon', team: 'design',    gender: 'm', name: '추사 김정희 (남 · 타이포)', hint: '추사체 먹붓 · 주홍 낙관(印) · 로고·폰트', color: '#8A94B0', bg: '#181A22' },
  { key: 'bobusang',     pack: 'joseon', team: 'marketing', gender: 'm', name: '보부상 (남 · 마케팅팀)',    hint: '목화 패랭이 · 방울 · 팔도 바이럴·SNS 홍보', color: '#F56A42', bg: '#331E16' },
  { key: 'yein',         pack: 'joseon', team: 'marketing', gender: 'f', name: '예인 아씨 (여 · 마케팅팀)', hint: '붉은 댕기 · 접부채 · 유튜브·댓글·홍보', color: '#F77FB0', bg: '#2E1926' },
  { key: 'hunter',       pack: 'joseon', team: 'research',  gender: 'm', name: '착호 사냥꾼 (남 · 리서치)', hint: '털전립 · 활 · 트렌드·경쟁사·자료 사냥', color: '#B56B38', bg: '#261D17' },
  { key: 'damo',         pack: 'joseon', team: 'research',  gender: 'f', name: '다모 수사관 (여 · 리서치)', hint: '전복 조끼 · 황금 마패 · QA·이슈 추적', color: '#3B82F6', bg: '#18233A' },
  { key: 'madangsoe',    pack: 'joseon', team: 'ops',       gender: 'm', name: '마당쇠 (남 · 운영팀)',      hint: '상투 머리띠 · 빗자루 · 5분 루틴·잡무 자동화', color: '#608BE0', bg: '#1B2436' },
  { key: 'haengrang',    pack: 'joseon', team: 'ops',       gender: 'f', name: '행랑 아씨 (여 · 운영팀)',   hint: '흰 머리수건 · 황금 열쇠 · 메일·일정 살림', color: '#38BDF8', bg: '#152636' },
  { key: 'heojun',       pack: 'joseon', team: 'ops',       gender: 'm', name: '어의 허준 (남 · 헬스)',     hint: '의관모 · 약첩 · 대표 컨디션·수면·심박', color: '#14B8A6', bg: '#132927' },
  { key: 'daejanggeum',  pack: 'joseon', team: 'ops',       gender: 'f', name: '의녀 대장금 (여 · 헬스)',   hint: '가리마 · 옥색 한복 · 대표 건강 최적화', color: '#2DD4BF', bg: '#132927' },
  { key: 'sumunjang',    pack: 'joseon', team: 'exec',      gender: 'm', name: '궁궐 수문장 (남 · 보안)',   hint: '황금 투구 · 창 · 결제·게시·삭제 차단', color: '#DC2626', bg: '#2D1414' },
  // 한국 전통 K-수호 크루 (3D 피규어 + 16비트 도트)
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

const JOSEON_TEAM_PAIR = {
  exec:      ['sejong', 'queen'],
  dev:       ['jangyeongsil', 'cheomseong'],
  plan:      ['seonbi', 'munin'],
  design:    ['hwawon', 'saimdang', 'angyeon', 'yunbok', 'chusa'],
  marketing: ['bobusang', 'yein'],
  research:  ['hunter', 'damo'],
  ops:       ['madangsoe', 'haengrang'],
};

export function defaultAvatarFor(emp = {}, pack = 'k-crew', idx = 0) {
  if (pack === 'joseon' || pack === 'seonbi') {
    const team = defaultTeamFor(emp);
    const pair = JOSEON_TEAM_PAIR[team] || JOSEON_TEAM_PAIR.ops;
    return pair[Math.abs(Number(idx) || 0) % pair.length];
  }
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
