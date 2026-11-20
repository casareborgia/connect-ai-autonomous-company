// 첫 사용 시뮬레이션 (11-20) 의 세 사람: 직원 구성과 할 일 15개씩, 맞는 담당 (| 는 둘 다 맞음)
const emp = (id, name, role, engine = 'web') => ({ id, name, role, tools: [], engine, model: '', runMode: 'off', manual: '', resources: [] });
const mac = (id, name, isThisMac) => ({ id, kind: '기계', name, isThisMac, status: '사용 가능', hostname: '', port: 22 });

export const PERSONAS = {
  minji: {
    owner: '민지',
    employees: [emp('chatgpt', 'ChatGPT', '상세페이지 문구, 인스타 글, 고객 답장'), emp('canva', 'Canva', '배너, 썸네일, 카드뉴스 디자인')],
    resources: [mac('res1', '맥북 에어', true), { id: 'res2', kind: '멤버십', name: 'ChatGPT Plus', status: '사용 가능' }, { id: 'res3', kind: '계정', name: 'Canva', status: '사용 가능' }, { id: 'res4', kind: '계정', name: '스마트스토어', status: '사용 가능' }],
    tasks: [
      ['신상 원피스 상세페이지 문구 써줘', 'chatgpt'], ['인스타 카드뉴스 5장 만들어줘', 'canva'], ['고객 문의 답장 초안 작성', 'chatgpt'],
      ['반품 요청 고객에게 사과 문자 보내기', 'chatgpt|jay'], ['스마트스토어 메인 배너 만들어줘', 'canva'], ['경쟁사 원피스 가격 조사해줘', 'chatgpt'],
      ['이번 달 매출 엑셀 정리', 'chatgpt|jay'], ['동대문 원단 시장 가기', 'jay'], ['택배 송장 출력하고 포장', 'jay'],
      ['신상품 사진 촬영', 'jay'], ['상품 썸네일 배경 지워줘', 'canva'], ['인스타에 신상 사진 올려줘', 'chatgpt|jay'],
      ['다음 주 할인 이벤트 공지 글 써줘', 'chatgpt'], ['품절 상품 상세페이지 내리기', 'jay'], ['원단 샘플 10만원어치 주문해줘', 'jay'],
    ],
  },
  junho: {
    owner: '준호',
    employees: [emp('claude', 'Claude', '유튜브 대본, 기획, 제목, 설명란 글쓰기', 'claude'), emp('gemini', 'Gemini', '자료 조사, 트렌드 검색, 요약')],
    resources: [mac('res1', '맥북 프로', true), mac('res2', '아이폰', false), { id: 'res3', kind: '멤버십', name: 'Claude Pro', status: '사용 가능' }, { id: 'res4', kind: '멤버십', name: 'Gemini', status: '사용 가능' }, { id: 'res5', kind: '계정', name: 'YouTube 채널', status: '사용 가능' }, { id: 'res6', kind: '계정', name: 'CapCut', status: '사용 가능' }],
    tasks: [
      ['다음 영상 대본 초안 써줘', 'claude'], ['쇼츠 제목 10개 뽑아줘', 'claude'], ['요즘 AI 트렌드 조사해줘', 'gemini'],
      ['영상 설명란이랑 태그 작성', 'claude'], ['경쟁 채널 인기 영상 분석', 'gemini'], ['구독자 댓글 요약해줘', 'gemini'],
      ['썸네일 문구 3안', 'claude'], ['CapCut으로 브이로그 컷편집', 'jay'], ['아이폰으로 B롤 촬영', 'jay'],
      ['저녁 9시 라이브 방송', 'jay'], ['유튜브에 쇼츠 올려줘', 'jay'], ['협찬 광고주에게 답장 메일 보내기', 'claude|jay'],
      ['다음 달 콘텐츠 캘린더 짜줘', 'claude'], ['오래된 비공개 영상 지워줘', 'jay'], ['새 마이크 구매', 'jay'],
    ],
  },
  seoyeon: {
    owner: '서연',
    employees: [emp('claudecode', 'Claude Code', '코딩, 코드 리뷰, 리팩터링', 'claude'), emp('codex', 'Codex', '테스트, 버그 수정, 스크립트', 'codex'), { ...emp('qwen', 'Qwen 로컬', '요약, 번역, 문서 정리', 'local'), model: 'ollama:qwen3:4b' }],
    resources: [mac('res1', '맥북 프로', true), mac('res2', 'Mac mini 서버', false)],
    tasks: [
      ['README 영어로 번역해줘', 'qwen'], ['로그인 버그 고쳐줘', 'codex'], ['결제 모듈 리팩터링', 'claudecode'],
      ['PR 42번 코드 리뷰', 'claudecode'], ['회원가입 단위 테스트 추가', 'codex'], ['오늘 회의록 요약', 'qwen'],
      ['배포 스크립트 작성', 'codex'], ['Mac mini 서버 재부팅', 'jay'], ['투자자 미팅', 'jay'],
      ['API 문서 정리', 'qwen'], ['새 기능 랜딩페이지 만들어줘', 'claudecode'], ['npm 패키지 새 버전 배포', 'claudecode|codex'],
      ['오래된 git 브랜치 삭제', 'claudecode|codex'], ['클라우드 서버 요금 결제', 'jay'], ['에러 로그 분석해줘', 'codex|claudecode'],
    ],
  },
};
