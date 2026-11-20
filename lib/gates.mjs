// 안전 정지: 결제, 업로드, 게시, 삭제, 발송이 들어간 일은 대표가 누를 때까지 AI 가 시작하지 못한다.
// 한국어는 어미가 다양해서 "동사로 쓰였는가" 를 본다. 명사로만 쓰인 말 (카드뉴스, 게시판, 결제 모듈) 은 먼저 지운다.
// 시험: node --test qa/gates.test.mjs

export const GATES = ['결제', '업로드', '게시', '삭제', '발송'];

// 위험하지 않은 명사 합성어와 편집 표현. 감지 전에 지운다.
const MODIFIER = '(모듈|페이지|화면|시스템|기능|로직|코드|버그|테스트|api|연동|플로우|흐름|스크립트|서버|환경|파이프라인|설정|문서|자동화|로그|내역|정책|규정|안내문?|버튼|폼|ui|ux|디자인|방법|절차|조사|리서치|분석|통계|현황|데이터|조회|사이트|일정|정보|툴|도구|서비스 비교|용)';
const SAFE = [
  /카드\s*뉴스/g,
  /게시판/g,
  /게시물\s*(아이디어|기획|초안|문구)/g,
  /내려\s*받/g,
  new RegExp(`(결제|결재|업로드|배포|삭제|송금|주문|환불|발송|이체|구매|예매|입금|게시|전송|탈퇴|해지|구독|가입|로그인)\\s*${MODIFIER}`, 'g'),
  /(배경|잡티|잡음|노이즈|워터마크|그림자|얼룩|주름|여백|누끼|빨간\s*눈|모공)\s*(을|를|도)?\s*(지워|지우|제거|없애|빼)/g,
  /(가격|값|단가|금액|견적|볼륨|소리|음량|속도|순위|점수|해상도|밝기|채도|대비|텐션|퀄리티|품질|커버리지|버전|성능|전환율|매출|조회수|구독자|팔로워|레벨|등급|한도|비율)\s*(을|를|도)?\s*(올려|올리|내려|내리)/g,
  /올려\s*잡/g,
  /\b(payment|checkout|upload|delete|deploy|order|refund)\s+(page|module|screen|button|flow|form|api|feature|system|ui|ux|history|records|report|policy|logic|tests?|docs?)\b/g,
  /\b(remove|erase|delete)\s+(the\s+)?(background|noise|watermark|shadow|blemish(es)?)\b/g,
];

const RULES = [
  ['결제', [
    /결제|구매|구입|송금|이체|환불|예매/,
    /결재\s*(해|하|좀|부탁|진행)/,
    /입금\s*(해|하|시켜|좀|부탁|진행)/,
    /카드로|카드\s*결제|계좌로\s*(보내|넣)/,
    /주문\s*(해|하|좀|넣|부탁|할|진행)|주문\s*$/,
    /(^|[^가-힣])사\s?(줘|주세요|주라|와|오기|다\s*줘|다\s*주세요)/,
    /(표|티켓|승차권|항공권|기차표)\s*(을|를)?\s*(끊|사|예약)/,
    /(구독|멤버십|요금제|플랜|유료|프로|플러스|plus|pro|premium)[^.\n]{0,10}(갱신|업그레이드|가입|신청|연장|전환)/i,
    /\b(pay|paying|purchase|buy|checkout|refund|subscribe|renew)\b/i,
    /\border\s+(\d+|this|it|the|a|an|some|more|new)\b|\bplace\s+an?\s+order\b|\bmake\s+a\s+payment\b/i,
    /\b(transfer|wire|send)\s+(\$|₩|\d|money|funds|the\s+money|payment)/i,
    /\bbook\s+(a\s+|the\s+|two\s+)?(flight|ticket|hotel|train)s?\b/i,
    /\bupgrade\s+(to\s+)?(the\s+|my\s+|our\s+|a\s+)?(paid|pro|plus|premium|plan|subscription)/i,
  ]],
  ['삭제', [
    /삭제|지워|지우|없애|비워|비우|제거|탈퇴|해지|드롭/,
    /(구독|멤버십|요금제|플랜|계정)\s*(을|를)?\s*취소/,
    /내리(기|고|어|자|세요)|내려\s*(줘|주세요|놔|두)/,
    /\bdrop\b|\btruncate\b|rm\s+-rf|--force\b|push\s+-f\b|force[\s-]?push/i,
    /\b(delete|remove|erase|wipe|purge|unsubscribe)\b/i,
    /\bcancel\s+(my\s+|the\s+|our\s+)?(subscription|account|plan|membership)\b/i,
    /\b(empty|clear)\s+(the\s+)?(trash|bin|cache|recycle)/i,
  ]],
  ['발송', [
    /(메일|이메일|문자|메시지|메세지|카톡|카카오톡|dm|디엠|공지|뉴스레터|답장|알림톡|sms|초대장|안내문|편지|팩스|쪽지)[^.\n]{0,15}(보내|발송|전송|쏴|돌려)/i,
    /발송|전송\s*(해|하|좀)/,
    /\bsend\s+(an?\s+|the\s+|out\s+)?(e-?mail|message|text|dm|newsletter|invite|invitation|sms|reply)s?\b/i,
    /\b(e-?mail|text|message|dm)\s+(them|him|her|the\s+\w+|all|everyone|our)\b/i,
  ]],
  ['게시', [
    /게시|포스팅|발행|트윗|리트윗|배포|머지/,
    /(댓글|답글|리뷰|후기)\s*(을|를)?\s*(달|남기|올려|올리)/,
    /공개\s*(해|하|로|전환|처리)/,
    /병합\s*(해|하)/,
    /\b(publish|deploy|release|merge|tweet|go\s+live)\b/i,
    /\bpost\s+(it|this|that|the|a|an|on|to)\b/i,
  ]],
  ['업로드', [
    /업로드|올려|올리기|올리고|올릴|올립/,
    /(상품|신상|신제품|제품|쿠팡|스마트스토어|스토어|마켓|앱스토어|플레이스토어|오픈마켓)[^.\n]{0,12}등록/,
    /\bupload\b/i,
  ]],
];

function clean(text) {
  let s = ` ${String(text || '').toLowerCase().replace(/\s+/g, ' ')} `;
  for (const re of SAFE) s = s.replace(re, ' ');
  return s;
}

export function detectGate(text) {
  const s = clean(text);
  for (const [gate, list] of RULES) if (list.some((re) => re.test(s))) return gate;
  return null;
}
