// 연결 계정(YouTube, Instagram, 네이버 블로그·클립, TikTok, 스마트스토어, 결제사 등)별 컴퓨터 유즈 권한 관리.
// 기본값은 항상 안전(읽기만 또는 초안·승인 후)이며, 비밀번호·본인인증·결제는 어떤 설정을 해도 AI에게 열지 않는다.

export const PERM_LEVELS = ['deny', 'approval', 'allow'];
export const PERM_LABELS = { deny: '금지', approval: '승인 후', allow: '자동' };
export const ACCOUNT_PRESETS = [
  { key: 'readonly', label: '읽기만 (안전)' },
  { key: 'approval', label: '초안·승인 후 (추천)' },
  { key: 'draft_auto', label: '임시저장만 자동 (크리에이터)' },
  { key: 'custom', label: '직접 설정' },
];

export const ACCOUNT_CATEGORIES = [
  { key: 'media', label: '영상 · 숏폼 · SNS' },
  { key: 'business', label: '블로그 · 고객 · 커머스' },
  { key: 'ops', label: '개발 · 결제 · 기타' },
];

export const HARD_GUARDRAILS = ['비밀번호 입력', '본인인증', '결제·송금'];

const EDIT_SAFE = /(배경|잡티|잡음|노이즈|워터마크|그림자|얼룩|여백|누끼)\s*(을|를|도)?\s*(지워|지우|제거|없애|빼)/g;
const DRAFT_TEXT_ONLY = /(초안만|초안\s*(만들|작성|써|짜|준비|뽑|정리)|문구만|문구\s*(만들|작성|써|짜|추천|뽑)|아이디어\s*(추천|뽑|정리))/;
const PUBLISH_VERBS = /(등록|업로드|임시\s*저장|게시|올려|올리|포스팅|발행|공유|달아|달기|남겨|남기|보내|발송|전송|푸시|배포|머지|삭제|지워|지우|숨기|수정|바꿔|변경|교체|\bpost\b|\bupload\b|\bpublish\b|\bdelete\b|\bsend\b|\bpush\b)/i;

export const ACCOUNT_PLATFORMS = [
  {
    key: 'youtube',
    category: 'media',
    name: 'YouTube',
    url: 'https://studio.youtube.com',
    hint: '채널 통계, 댓글, 영상·쇼츠',
    supportsDraftAuto: true,
    match: /(youtube|유튜브|유투브|쇼츠|shorts|youtube\s*studio|유튜브\s*스튜디오)/i,
    actions: [
      { key: 'read', short: '통계·댓글 읽기', label: '통계·댓글 읽기', gate: null, def: { readonly: 'allow', approval: 'allow', draft_auto: 'allow' }, match: /(확인|조회|읽기|읽어|분석|통계|조회수|구독자|수익|리포트|브리핑|캡처|댓글\s*(확인|정리|요약|모아|읽))/i },
      { key: 'comment', short: '댓글', label: '댓글 달기·답글', gate: '게시', def: { readonly: 'deny', approval: 'approval', draft_auto: 'approval' }, match: /(댓글|답글|코멘트)[^.\n]{0,14}(달|남기|올려|올리|등록|게시|작성|reply|comment)/i },
      { key: 'draft_upload', short: '비공개 등록', label: '영상·쇼츠 비공개·초안 등록', gate: '업로드', def: { readonly: 'deny', approval: 'approval', draft_auto: 'allow' }, match: /(비공개|일부\s*공개|임시\s*저장|초안)[^.\n]{0,14}(업로드|등록|올려|올리|저장)|(업로드|등록|올려|올리)[^.\n]{0,14}(비공개|일부\s*공개|임시\s*저장|초안)/i },
      { key: 'publish', short: '공개 게시', label: '영상·쇼츠 공개 게시', gate: '게시', def: { readonly: 'deny', approval: 'approval', draft_auto: 'approval' }, match: /(영상|쇼츠|shorts|동영상|유튜브에?)[^.\n]{0,16}(공개|게시|업로드|등록|발행|올려|올리)|(공개\s*(게시|발행|전환|해|하)|\bupload\b|\bpublish\b)/i },
      { key: 'edit', short: '제목·썸네일', label: '제목·설명·썸네일 수정', gate: '게시', def: { readonly: 'deny', approval: 'approval', draft_auto: 'approval' }, match: /(썸네일|제목|설명란|태그|고정\s*댓글)[^.\n]{0,14}(수정|바꿔|변경|교체|등록|올려|올리|고정)/i },
      { key: 'delete', short: '삭제', label: '삭제·채널 설정 변경', gate: '삭제', def: { readonly: 'deny', approval: 'deny', draft_auto: 'deny' }, match: /(삭제|지워|지우|숨기|내리|내려|채널\s*설정|설정\s*변경|\bdelete\b|\bremove\b)/i },
    ],
  },
  {
    key: 'instagram',
    category: 'media',
    name: 'Instagram',
    url: 'https://www.instagram.com',
    hint: '인사이트, 댓글, 이미지·릴스, DM',
    supportsDraftAuto: true,
    match: /(instagram|인스타그램|인스타|릴스|reels)/i,
    actions: [
      { key: 'read', short: '인사이트 읽기', label: '인사이트·댓글 읽기', gate: null, def: { readonly: 'allow', approval: 'allow', draft_auto: 'allow' }, match: /(확인|조회|읽기|읽어|분석|인사이트|통계|팔로워|리포트|브리핑|캡처|정리|요약)/i },
      { key: 'comment', short: '댓글', label: '댓글 달기·답글', gate: '게시', def: { readonly: 'deny', approval: 'approval', draft_auto: 'approval' }, match: /(댓글|답글|코멘트)[^.\n]{0,14}(달|남기|올려|올리|등록|게시|작성|reply|comment)/i },
      { key: 'draft_upload', short: '임시저장', label: '이미지·릴스 임시저장', gate: '업로드', def: { readonly: 'deny', approval: 'approval', draft_auto: 'allow' }, match: /(임시\s*저장|초안|비공개)[^.\n]{0,14}(업로드|등록|올려|올리|저장)|(이미지|카드\s*뉴스|릴스|피드)[^.\n]{0,14}(임시\s*저장)/i },
      { key: 'upload', short: '이미지·릴스 게시', label: '이미지·릴스 공개 게시', gate: '업로드', def: { readonly: 'deny', approval: 'approval', draft_auto: 'approval' }, match: /(이미지|사진|카드\s*뉴스|피드|릴스|스토리|게시물|포스트|인스타(?:그램)?에?)[^.\n]{0,16}(등록|업로드|게시|올려|올리|포스팅|발행|공유|\bpost\b|\bupload\b)/i },
      { key: 'dm', short: 'DM', label: 'DM 답장·발송', gate: '발송', def: { readonly: 'deny', approval: 'deny', draft_auto: 'deny' }, match: /(dm|디엠|쪽지|다이렉트|메시지|메세지)[^.\n]{0,14}(답장|보내|발송|전송|회신|reply|send)/i },
      { key: 'delete', short: '삭제', label: '삭제·계정 설정 변경', gate: '삭제', def: { readonly: 'deny', approval: 'deny', draft_auto: 'deny' }, match: /(삭제|지워|지우|숨기|내리|내려|계정\s*설정|설정\s*변경|\bdelete\b|\bremove\b)/i },
    ],
  },
  {
    key: 'naver_clip',
    category: 'media',
    name: '네이버 클립',
    url: 'https://creator.naver.com',
    hint: '네이버 숏폼 영상, 임시저장, 댓글',
    supportsDraftAuto: true,
    match: /(네이버\s*클립|naver\s*clip|클립\s*(영상|채널|업로드|등록|게시|임시\s*저장|통계|조회수|댓글|올려|올리))/i,
    actions: [
      { key: 'read', short: '조회수·댓글 읽기', label: '조회수·댓글 읽기', gate: null, def: { readonly: 'allow', approval: 'allow', draft_auto: 'allow' }, match: /(확인|조회|읽기|읽어|분석|통계|조회수|리포트|브리핑|캡처|정리|요약)/i },
      { key: 'comment', short: '댓글', label: '댓글 달기·답글', gate: '게시', def: { readonly: 'deny', approval: 'approval', draft_auto: 'approval' }, match: /(댓글|답글|코멘트)[^.\n]{0,14}(달|남기|올려|올리|등록|게시|작성|reply)/i },
      { key: 'draft_upload', short: '임시저장', label: '클립 영상 임시저장·비공개 등록', gate: '업로드', def: { readonly: 'deny', approval: 'approval', draft_auto: 'allow' }, match: /(임시\s*저장|비공개|초안)[^.\n]{0,14}(업로드|등록|올려|올리|저장)|(클립|영상)[^.\n]{0,14}(임시\s*저장|비공개)/i },
      { key: 'publish', short: '공개 게시', label: '클립 영상 공개 게시', gate: '게시', def: { readonly: 'deny', approval: 'approval', draft_auto: 'approval' }, match: /(클립|영상|숏폼)[^.\n]{0,16}(공개|게시|업로드|등록|발행|올려|올리)|\bupload\b|\bpublish\b/i },
      { key: 'delete', short: '삭제', label: '삭제·채널 설정 변경', gate: '삭제', def: { readonly: 'deny', approval: 'deny', draft_auto: 'deny' }, match: /(삭제|지워|지우|숨기|내리|내려|설정\s*변경|\bdelete\b)/i },
    ],
  },
  {
    key: 'tiktok',
    category: 'media',
    name: 'TikTok',
    url: 'https://www.tiktok.com/tiktokstudio',
    hint: '틱톡 숏폼, 초안 등록, 댓글, DM',
    supportsDraftAuto: true,
    match: /(tiktok|틱톡)/i,
    actions: [
      { key: 'read', short: '통계·댓글 읽기', label: '통계·댓글 읽기', gate: null, def: { readonly: 'allow', approval: 'allow', draft_auto: 'allow' }, match: /(확인|조회|읽기|읽어|분석|통계|조회수|팔로워|리포트|캡처|정리|요약)/i },
      { key: 'comment', short: '댓글', label: '댓글 달기·답글', gate: '게시', def: { readonly: 'deny', approval: 'approval', draft_auto: 'approval' }, match: /(댓글|답글|코멘트)[^.\n]{0,14}(달|남기|올려|올리|등록|게시|작성|reply)/i },
      { key: 'draft_upload', short: '비공개 등록', label: '영상 초안·비공개 등록', gate: '업로드', def: { readonly: 'deny', approval: 'approval', draft_auto: 'allow' }, match: /(비공개|임시\s*저장|초안)[^.\n]{0,14}(업로드|등록|올려|올리|저장)|(영상|틱톡)[^.\n]{0,14}(비공개|임시\s*저장)/i },
      { key: 'publish', short: '공개 게시', label: '영상 공개 게시', gate: '게시', def: { readonly: 'deny', approval: 'approval', draft_auto: 'approval' }, match: /(영상|숏폼|틱톡에?)[^.\n]{0,16}(공개|게시|업로드|등록|발행|올려|올리)|\bupload\b|\bpublish\b/i },
      { key: 'dm', short: 'DM', label: 'DM 답장·발송', gate: '발송', def: { readonly: 'deny', approval: 'deny', draft_auto: 'deny' }, match: /(dm|디엠|쪽지|메시지)[^.\n]{0,14}(답장|보내|발송|전송|reply|send)/i },
      { key: 'delete', short: '삭제', label: '삭제·계정 설정 변경', gate: '삭제', def: { readonly: 'deny', approval: 'deny', draft_auto: 'deny' }, match: /(삭제|지워|지우|숨기|내리|내려|설정\s*변경|\bdelete\b)/i },
    ],
  },
  {
    key: 'threads',
    category: 'media',
    name: 'Threads',
    url: 'https://www.threads.net',
    hint: '스레드 피드, 글·이미지 게시, 답글',
    match: /(threads|스레드|쓰레드)/i,
    actions: [
      { key: 'read', short: '피드 읽기', label: '피드·반응 읽기', gate: null, def: { readonly: 'allow', approval: 'allow' }, match: /(확인|조회|읽기|읽어|분석|반응|통계|캡처|정리|요약)/i },
      { key: 'post', short: '게시', label: '글·이미지 게시', gate: '게시', def: { readonly: 'deny', approval: 'approval' }, match: /(글|이미지|사진|카드\s*뉴스|게시물|포스트|스레드에?|쓰레드에?)[^.\n]{0,16}(등록|업로드|게시|올려|올리|포스팅|발행|공유|\bpost\b)/i },
      { key: 'comment', short: '답글', label: '댓글·답글 달기', gate: '게시', def: { readonly: 'deny', approval: 'approval' }, match: /(댓글|답글|코멘트)[^.\n]{0,14}(달|남기|올려|올리|등록|게시|작성|reply)/i },
      { key: 'delete', short: '삭제', label: '삭제·계정 설정 변경', gate: '삭제', def: { readonly: 'deny', approval: 'deny' }, match: /(삭제|지워|지우|숨기|내리|내려|설정\s*변경|\bdelete\b)/i },
    ],
  },
  {
    key: 'x',
    category: 'media',
    name: 'X (Twitter)',
    url: 'https://x.com',
    hint: '트윗 게시, 답글, 트렌드 읽기',
    match: /(twitter|트위터|\bx\.com\b|트윗|리트윗|(?<![a-z0-9])x\s*(계정|포스팅|게시|올려|트윗|피드))/i,
    actions: [
      { key: 'read', short: '피드 읽기', label: '피드·반응 읽기', gate: null, def: { readonly: 'allow', approval: 'allow' }, match: /(확인|조회|읽기|읽어|분석|반응|트렌드|통계|캡처|정리|요약)/i },
      { key: 'post', short: '게시', label: '트윗·이미지 게시', gate: '게시', def: { readonly: 'deny', approval: 'approval' }, match: /(트윗|글|이미지|사진|게시물|포스트|스레드)[^.\n]{0,16}(등록|업로드|게시|올려|올리|포스팅|발행|트윗|\btweet\b|\bpost\b)/i },
      { key: 'comment', short: '답글', label: '답글·인용 달기', gate: '게시', def: { readonly: 'deny', approval: 'approval' }, match: /(답글|댓글|리트윗|인용)[^.\n]{0,14}(달|남기|올려|올리|해|하|reply)/i },
      { key: 'delete', short: '삭제', label: '삭제·계정 설정 변경', gate: '삭제', def: { readonly: 'deny', approval: 'deny' }, match: /(삭제|지워|지우|내리|내려|설정\s*변경|\bdelete\b)/i },
    ],
  },
  {
    key: 'linkedin',
    category: 'media',
    name: 'LinkedIn',
    url: 'https://www.linkedin.com',
    hint: '링크드인 글 게시, 댓글, 메시지',
    match: /(linkedin|링크드인)/i,
    actions: [
      { key: 'read', short: '피드 읽기', label: '피드·반응 읽기', gate: null, def: { readonly: 'allow', approval: 'allow' }, match: /(확인|조회|읽기|읽어|분석|반응|통계|캡처|정리|요약)/i },
      { key: 'post', short: '게시', label: '글·이미지 게시', gate: '게시', def: { readonly: 'deny', approval: 'approval' }, match: /(글|이미지|카드\s*뉴스|게시물|포스트|링크드인에?)[^.\n]{0,16}(등록|업로드|게시|올려|올리|포스팅|발행|공유|\bpost\b)/i },
      { key: 'comment', short: '댓글', label: '댓글 달기', gate: '게시', def: { readonly: 'deny', approval: 'approval' }, match: /(댓글|답글)[^.\n]{0,14}(달|남기|올려|올리|등록|작성|reply)/i },
      { key: 'dm', short: '메시지', label: '메시지 답장·발송', gate: '발송', def: { readonly: 'deny', approval: 'deny' }, match: /(dm|디엠|메시지|메세지|쪽지)[^.\n]{0,14}(답장|보내|발송|전송|reply|send)/i },
      { key: 'delete', short: '삭제', label: '삭제·계정 설정 변경', gate: '삭제', def: { readonly: 'deny', approval: 'deny' }, match: /(삭제|지워|지우|내리|내려|설정\s*변경|\bdelete\b)/i },
    ],
  },
  {
    key: 'email',
    category: 'business',
    name: '이메일 (Gmail · Hotmail)',
    url: 'https://mail.google.com',
    hint: '새 메일 확인, 답장 초안 임시저장, 발송 승인',
    supportsDraftAuto: true,
    match: /(이메일|메일|gmail|지메일|hotmail|핫메일|아웃룩|outlook|수신함|영수증\s*요청)/i,
    actions: [
      { key: 'read', short: '메일 읽기', label: '새 메일·문의 읽기', gate: null, def: { readonly: 'allow', approval: 'allow', draft_auto: 'allow' }, match: /(확인|체크|조회|읽기|읽어|정리|요약|분류|찾아|영수증)/i },
      { key: 'draft', short: '답장 초안 저장', label: '답장 초안 임시저장', gate: '업로드', def: { readonly: 'deny', approval: 'approval', draft_auto: 'allow' }, match: /(임시\s*보관|임시\s*저장|초안)[^.\n]{0,14}(저장|작성|만들|올려)/i },
      { key: 'send', short: '메일 발송', label: '답장·메일 실제 발송', gate: '발송', def: { readonly: 'deny', approval: 'approval', draft_auto: 'approval' }, match: /(답장|회신|메일|이메일)[^.\n]{0,14}(보내|발송|전송|쏴|reply|send)/i },
      { key: 'delete', short: '삭제', label: '메일 삭제·계정 설정 변경', gate: '삭제', def: { readonly: 'deny', approval: 'deny', draft_auto: 'deny' }, match: /(삭제|지워|지우|휴지통|비워|설정\s*변경|\bdelete\b)/i },
    ],
  },
  {
    key: 'naver_blog',
    category: 'business',
    name: '네이버 블로그',
    url: 'https://blog.naver.com',
    hint: '방문자·댓글, 글 임시저장, 포스트 발행',
    supportsDraftAuto: true,
    match: /(네이버\s*블로그|naver\s*blog|블로그\s*(포스팅|포스트|글|발행|임시\s*저장|댓글|통계|방문자|이웃|안부)|티스토리)/i,
    actions: [
      { key: 'read', short: '방문자·댓글 읽기', label: '방문자·댓글 읽기', gate: null, def: { readonly: 'allow', approval: 'allow', draft_auto: 'allow' }, match: /(확인|조회|읽기|읽어|분석|통계|방문자|유입|검색어|리포트|캡처|정리|요약)/i },
      { key: 'draft', short: '임시저장', label: '글·이미지 임시저장', gate: '업로드', def: { readonly: 'deny', approval: 'approval', draft_auto: 'allow' }, match: /(임시\s*저장|비공개|초안)[^.\n]{0,14}(저장|등록|올려|올리|업로드|쓰|써)|(글|포스트|포스팅|이미지)[^.\n]{0,14}(임시\s*저장|비공개)/i },
      { key: 'publish', short: '공개 발행', label: '포스트 공개 발행', gate: '게시', def: { readonly: 'deny', approval: 'approval', draft_auto: 'approval' }, match: /(글|포스트|포스팅|게시물|블로그에?)[^.\n]{0,16}(발행|공개|게시|등록|업로드|올려|올리|\bpublish\b|\bpost\b)/i },
      { key: 'comment', short: '댓글·안부글', label: '댓글·안부글 답글', gate: '게시', def: { readonly: 'deny', approval: 'approval', draft_auto: 'approval' }, match: /(댓글|답글|안부글|이웃)[^.\n]{0,14}(달|남기|올려|올리|등록|작성|reply)/i },
      { key: 'delete', short: '삭제', label: '삭제·블로그 설정 변경', gate: '삭제', def: { readonly: 'deny', approval: 'deny', draft_auto: 'deny' }, match: /(삭제|지워|지우|비공개\s*전환|내리|내려|설정\s*변경|\bdelete\b)/i },
    ],
  },
  {
    key: 'kakao',
    category: 'business',
    name: '카카오톡 채널',
    url: 'https://center-pf.kakao.com',
    hint: '친구·문의 읽기, 소식 등록, 메시지 발송',
    match: /(카카오톡\s*채널|카카오\s*채널|카톡\s*채널|플러스\s*친구)/i,
    actions: [
      { key: 'read', short: '문의·통계 읽기', label: '친구 수·문의 읽기', gate: null, def: { readonly: 'allow', approval: 'allow' }, match: /(확인|조회|읽기|읽어|분석|통계|친구|문의|채팅\s*확인|캡처|정리|요약)/i },
      { key: 'post', short: '소식 등록', label: '채널 소식 글·이미지 등록', gate: '게시', def: { readonly: 'deny', approval: 'approval' }, match: /(소식|포스트|공지|이미지)[^.\n]{0,14}(등록|게시|올려|올리|발행|업로드)/i },
      { key: 'message', short: '전체 발송', label: '전체·타깃 메시지 발송', gate: '발송', def: { readonly: 'deny', approval: 'deny' }, match: /(전체|타깃|광고|공지|알림톡|메시지|메세지)[^.\n]{0,14}(발송|보내|전송|쏴)/i },
      { key: 'chat', short: '1:1 답장', label: '1:1 채팅 답장', gate: '발송', def: { readonly: 'deny', approval: 'deny' }, match: /(1:1|채팅|상담|문의)[^.\n]{0,14}(답장|답변|회신|보내)/i },
      { key: 'delete', short: '삭제', label: '삭제·채널 설정 변경', gate: '삭제', def: { readonly: 'deny', approval: 'deny' }, match: /(삭제|지워|지우|내리|내려|설정\s*변경|\bdelete\b)/i },
    ],
  },
  {
    key: 'smartstore',
    category: 'business',
    name: '스마트스토어 · 쇼핑몰',
    url: 'https://sell.smartstore.naver.com',
    hint: '주문·문의 읽기, Q&A 답글, 상품 등록 (환불·정산 금지)',
    match: /(스마트\s*스토어|smartstore|네이버\s*쇼핑|쿠팡\s*윙|아임웹|카페24|쇼피파이|shopify|쇼핑몰)/i,
    actions: [
      { key: 'read', short: '주문·문의 읽기', label: '주문·매출·문의 읽기', gate: null, def: { readonly: 'allow', approval: 'allow' }, match: /(확인|조회|읽기|읽어|분석|매출|주문\s*확인|문의\s*확인|리뷰\s*확인|통계|캡처|정리|요약)/i },
      { key: 'qna', short: '문의·리뷰 답글', label: '상품 문의·리뷰 답글', gate: '게시', def: { readonly: 'deny', approval: 'approval' }, match: /(문의|리뷰|후기|q&a|qna)[^.\n]{0,14}(답글|답장|답변|달|남기|등록|올려|올리)/i },
      { key: 'product', short: '상품 등록·수정', label: '상품 등록·정보 수정', gate: '업로드', def: { readonly: 'deny', approval: 'approval' }, match: /(상품|신상|신제품|제품|상세페이지|옵션|재고|품절)[^.\n]{0,14}(등록|수정|변경|업로드|올려|올리)/i },
      { key: 'order_money', short: '환불·정산', label: '환불·취소·정산 처리', gate: '결제', locked: 'deny', def: { readonly: 'deny', approval: 'deny' }, match: /(환불|주문\s*취소|반품\s*승인|정산|송금|출금|\brefund\b)/i },
      { key: 'delete', short: '삭제', label: '상품 삭제·스토어 설정', gate: '삭제', def: { readonly: 'deny', approval: 'deny' }, match: /(삭제|지워|지우|내리|내려|설정\s*변경|\bdelete\b)/i },
    ],
  },
  {
    key: 'blog',
    category: 'business',
    name: '뉴스레터 · 브런치',
    url: 'https://brunch.co.kr',
    hint: '브런치, 서브스택, 스티비, 메일리',
    supportsDraftAuto: true,
    match: /(뉴스레터|브런치|서브스택|substack|스티비|메일리)/i,
    actions: [
      { key: 'read', short: '구독자·통계 읽기', label: '구독자·오픈율 읽기', gate: null, def: { readonly: 'allow', approval: 'allow', draft_auto: 'allow' }, match: /(확인|조회|읽기|읽어|분석|통계|구독자|오픈율|캡처|정리|요약)/i },
      { key: 'draft', short: '임시저장', label: '원고 임시저장', gate: '업로드', def: { readonly: 'deny', approval: 'approval', draft_auto: 'allow' }, match: /(임시\s*저장|초안|비공개)[^.\n]{0,14}(저장|등록|올려|올리)|(원고|뉴스레터)[^.\n]{0,14}(임시\s*저장)/i },
      { key: 'post', short: '발행·발송', label: '글 발행·뉴스레터 발송', gate: '발송', def: { readonly: 'deny', approval: 'approval', draft_auto: 'approval' }, match: /(글|포스트|뉴스레터|브런치에?)[^.\n]{0,16}(발행|발송|보내|게시|등록|올려|올리|\bpublish\b|\bsend\b)/i },
      { key: 'comment', short: '댓글', label: '댓글 답글', gate: '게시', def: { readonly: 'deny', approval: 'approval', draft_auto: 'approval' }, match: /(댓글|답글)[^.\n]{0,14}(달|남기|올려|올리|등록|작성|reply)/i },
      { key: 'delete', short: '삭제', label: '삭제·설정 변경', gate: '삭제', def: { readonly: 'deny', approval: 'deny', draft_auto: 'deny' }, match: /(삭제|지워|지우|내리|내려|설정\s*변경|\bdelete\b)/i },
    ],
  },
  {
    key: 'github',
    category: 'ops',
    name: 'GitHub',
    url: 'https://github.com',
    hint: '코드·이슈 읽기, PR 초안, 배포',
    match: /(github|깃허브|깃헙|저장소|레포)/i,
    actions: [
      { key: 'read', short: '코드·이슈 읽기', label: '코드·이슈·PR 읽기', gate: null, def: { readonly: 'allow', approval: 'allow' }, match: /(확인|조회|읽기|읽어|분석|리뷰|이슈|상태|정리|요약)/i },
      { key: 'commit', short: '커밋·PR', label: '브랜치 커밋·PR 초안', gate: '게시', def: { readonly: 'deny', approval: 'approval' }, match: /(커밋|commit|\bpr\b|풀\s*리퀘스트|pull\s*request|브랜치)/i },
      { key: 'publish', short: '푸시·배포', label: '메인 푸시·릴리스·배포', gate: '게시', def: { readonly: 'deny', approval: 'deny' }, match: /(푸시|push|릴리스|release|배포|deploy|머지|merge|병합)/i },
      { key: 'delete', short: '삭제', label: '저장소·브랜치 삭제', gate: '삭제', def: { readonly: 'deny', approval: 'deny' }, match: /(삭제|지워|지우|force[\s-]?push|--force|\bdelete\b)/i },
    ],
  },
  {
    key: 'payment',
    category: 'ops',
    name: '결제 · 정산',
    url: 'https://app.tosspayments.com',
    hint: '토스페이먼츠, PayPal, Stripe 등 (읽기만 허용)',
    match: /(토스페이먼츠|토스\s*상점|페이팔|paypal|stripe|스트라이프|정산|결제사|매출\s*대시보드|은행|계좌)/i,
    actions: [
      { key: 'read', short: '매출 읽기', label: '매출·내역 읽기', gate: null, def: { readonly: 'allow', approval: 'allow' }, match: /(확인|조회|읽기|읽어|매출|내역|통계|리포트|캡처|정리|요약)/i },
      { key: 'money', short: '환불·송금', label: '환불·송금·정산 실행', gate: '결제', locked: 'deny', def: { readonly: 'deny', approval: 'deny' }, match: /(환불|송금|이체|출금|정산\s*(요청|실행|신청)|결제\s*(취소|실행|해|하)|\brefund\b|\btransfer\b|\bpayout\b)/i },
      { key: 'settings', short: '계좌 설정', label: '계좌·결제 설정 변경', gate: '삭제', locked: 'deny', def: { readonly: 'deny', approval: 'deny' }, match: /(설정\s*(변경|수정|바꿔)|계좌\s*(변경|수정|등록)|키\s*(재발급|변경)|삭제)/i },
    ],
  },
  {
    key: 'generic',
    category: 'ops',
    name: '기타 계정',
    url: '',
    hint: '그 밖의 웹사이트·서비스 계정',
    match: /$^/,
    actions: [
      { key: 'read', short: '읽기', label: '화면·내용 읽기', gate: null, def: { readonly: 'allow', approval: 'allow' }, match: /(확인|조회|읽기|읽어|분석|통계|캡처|정리|요약)/i },
      { key: 'write', short: '등록·댓글', label: '글·이미지 등록·댓글', gate: '게시', def: { readonly: 'deny', approval: 'approval' }, match: /(등록|업로드|게시|올려|올리|포스팅|발행|댓글|답글|작성|\bpost\b|\bupload\b)/i },
      { key: 'send', short: '발송', label: '메시지 발송', gate: '발송', def: { readonly: 'deny', approval: 'deny' }, match: /(보내|발송|전송|답장|dm|디엠|메일|문자|\bsend\b)/i },
      { key: 'delete', short: '삭제', label: '삭제·계정 설정 변경', gate: '삭제', def: { readonly: 'deny', approval: 'deny' }, match: /(삭제|지워|지우|내리|내려|설정\s*변경|탈퇴|해지|\bdelete\b)/i },
    ],
  },
];

export function platformByKey(key) {
  return ACCOUNT_PLATFORMS.find((p) => p.key === key) || ACCOUNT_PLATFORMS[ACCOUNT_PLATFORMS.length - 1];
}

export function inferPlatform(name = '', note = '') {
  const s = `${name} ${note}`;
  for (const p of ACCOUNT_PLATFORMS) {
    if (p.key !== 'generic' && p.match.test(s)) return p.key;
  }
  return 'generic';
}

export function presetPermissions(platformKey, preset = 'approval') {
  const p = platformByKey(platformKey);
  const mode = preset === 'readonly' ? 'readonly' : (preset === 'draft_auto' && p.supportsDraftAuto ? 'draft_auto' : 'approval');
  const out = {};
  for (const a of p.actions) {
    out[a.key] = a.locked || a.def[mode] || a.def.approval || 'deny';
  }
  return out;
}

export function normalizePermissions(platformKey, raw = null, preset = 'approval') {
  const p = platformByKey(platformKey);
  const base = presetPermissions(p.key, ['readonly', 'draft_auto'].includes(preset) ? preset : 'approval');
  if (!raw || typeof raw !== 'object') return base;
  const out = { ...base };
  for (const a of p.actions) {
    if (a.locked) { out[a.key] = a.locked; continue; }
    if (PERM_LEVELS.includes(raw[a.key])) out[a.key] = raw[a.key];
  }
  return out;
}

export function detectPreset(platformKey, perms) {
  const p = platformByKey(platformKey);
  const ro = presetPermissions(p.key, 'readonly');
  if (p.actions.every((a) => perms[a.key] === ro[a.key])) return 'readonly';
  const ap = presetPermissions(p.key, 'approval');
  if (p.actions.every((a) => perms[a.key] === ap[a.key])) return 'approval';
  if (p.supportsDraftAuto) {
    const da = presetPermissions(p.key, 'draft_auto');
    if (p.actions.every((a) => perms[a.key] === da[a.key])) return 'draft_auto';
  }
  return 'custom';
}

// 기존 데이터(hq.json)에 permissions 필드가 없더라도 안전 기본값으로 정규화해 돌려준다
export function accountConfig(resource) {
  if (!resource || resource.kind !== '계정') return null;
  const platformKey = ACCOUNT_PLATFORMS.some((p) => p.key === resource.platform) ? resource.platform : inferPlatform(resource.name, resource.note);
  const defaultPreset = platformKey === 'payment' ? 'readonly' : 'approval';
  const preset = resource.preset && ['readonly', 'approval', 'draft_auto', 'custom'].includes(resource.preset) ? resource.preset : defaultPreset;
  const permissions = normalizePermissions(platformKey, resource.permissions, preset);
  return {
    platform: platformKey,
    platformName: platformByKey(platformKey).name,
    preset: detectPreset(platformKey, permissions),
    browser: resource.browser || null,
    spaceName: String(resource.spaceName || '').trim(),
    assignee: resource.assignee || null,
    permissions,
  };
}

// 계정에 따로 지정한 브라우저가 없으면 기본 브라우저(예: Ego Lite)를 자동으로 쓴다
export function resolveAccountBrowser(account, browsers = []) {
  const active = (browsers || []).filter((b) => b.kind === '브라우저' && b.status !== '꺼짐');
  if (!active.length) return null;
  if (account?.browser) {
    const exact = active.find((b) => b.id === account.browser);
    if (exact) return exact;
  }
  return active.find((b) => b.isDefault) || active[0];
}

export function accountSummary(resource, browsers = [], employees = []) {
  const cfg = accountConfig(resource);
  if (!cfg) return '';
  const p = platformByKey(cfg.platform);
  const br = resolveAccountBrowser(resource, browsers);
  const emp = cfg.assignee ? employees.find((e) => e.id === cfg.assignee) : null;
  const allow = [];
  const approval = [];
  const deny = [];
  for (const a of p.actions) {
    const lv = cfg.permissions[a.key];
    const short = a.short || a.label.split(' ')[0].replace(/·.+/, '');
    if (lv === 'allow') allow.push(short);
    else if (lv === 'approval') approval.push(short);
    else deny.push(short);
  }
  const parts = [];
  if (br) parts.push(cfg.spaceName ? `${br.name} (${cfg.spaceName})` : br.name);
  else if (cfg.spaceName) parts.push(`스페이스: ${cfg.spaceName}`);
  if (emp) parts.push(emp.name);
  if (cfg.preset === 'readonly') {
    parts.push('읽기만 (안전)');
  } else {
    if (allow.length) parts.push(`${allow.join('·')} 자동`);
    if (approval.length) parts.push(`${approval.join('·')} 승인 후`);
    if (deny.length) parts.push(`${deny.join('·')} 금지`);
  }
  return parts.join(' · ');
}

export function pickAccount(text, resources) {
  const accounts = (resources || []).filter((r) => r.kind === '계정' && r.status !== '꺼짐');
  if (!accounts.length) return null;
  const raw = String(text || '');
  const low = raw.toLowerCase();
  // 1) 계정 이름이 직접 들어가면 최우선 (긴 이름부터 매칭해 '네이버 클립'과 '네이버 블로그' 혼동 방지)
  const byLen = [...accounts].sort((a, b) => String(b.name || '').length - String(a.name || '').length);
  for (const acc of byLen) {
    const full = String(acc.name || '').toLowerCase().trim();
    if (full.length >= 2 && low.includes(full)) return acc;
  }
  // 2) 플랫폼 키워드 매칭 (구체적인 플랫폼부터)
  for (const acc of accounts) {
    const cfg = accountConfig(acc);
    const plat = platformByKey(cfg.platform);
    if (plat.key !== 'generic' && plat.match.test(raw)) return acc;
  }
  // 3) 계정 이름 토큰 부분 매칭 (네이버 같은 공통 접두어는 제외)
  const common = new Set(['네이버', 'naver', '카카오', 'kakao', '계정', '채널']);
  for (const acc of byLen) {
    const parts = String(acc.name || '').toLowerCase().split(/[\s·,/()-]+/).filter((w) => w.length >= 2 && !common.has(w));
    if (parts.some((w) => low.includes(w))) return acc;
  }
  return null;
}

export function detectAccountAction(text, platformKey) {
  const plat = platformByKey(platformKey);
  const cleaned = String(text || '').replace(EDIT_SAFE, ' ');
  // 글 초안 텍스트만 요청하고 게시·임시저장·업로드 동사가 없으면 읽기로 본다
  const isDraftTextOnly = DRAFT_TEXT_ONLY.test(cleaned) && !PUBLISH_VERBS.test(cleaned.replace(/초안\s*작성/g, ''));
  if (isDraftTextOnly) return plat.actions.find((a) => a.key === 'read') || null;
  // 위험한 행동(삭제·송금·설정)과 구체적 행동(임시저장·비공개)부터 먼저 검사한다
  const priority = ['delete', 'money', 'order_money', 'settings', 'message', 'chat', 'dm', 'draft_upload', 'draft', 'qna', 'comment', 'edit', 'product', 'publish', 'upload', 'post', 'commit', 'send', 'write', 'read'];
  const ordered = [...plat.actions].sort((a, b) => {
    const ia = priority.indexOf(a.key);
    const ib = priority.indexOf(b.key);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  for (const a of ordered) {
    if (a.key === 'read') continue;
    if (a.match && a.match.test(cleaned)) return a;
  }
  const readAct = plat.actions.find((a) => a.key === 'read');
  if (readAct && readAct.match && readAct.match.test(cleaned)) return readAct;
  return null;
}

export function evaluateAccountPolicy(account, text) {
  if (!account || account.kind !== '계정') return null;
  const cfg = accountConfig(account);
  const action = detectAccountAction(text, cfg.platform);
  if (!action) return { account, config: cfg, action: null, level: null, blocked: false, message: '' };
  const level = cfg.permissions[action.key] || 'deny';
  const blocked = level === 'deny';
  const message = blocked
    ? `${account.name} 계정의 "${action.label}" 권한이 금지되어 있어요. 내 리소스에서 권한을 열어야 진행할 수 있어요.`
    : level === 'approval'
      ? `${account.name} 계정의 "${action.label}"은 대표 승인 후에만 실행할 수 있어요.`
      : `${account.name} · ${action.label} 자동 허용`;
  return { account, config: cfg, action, level, gate: action.gate, blocked, message };
}

export function accountPromptBlock(account, browsers = []) {
  const cfg = accountConfig(account);
  if (!cfg) return '';
  const p = platformByKey(cfg.platform);
  const br = resolveAccountBrowser(account, browsers);
  const url = account.url || p.url || '';
  const allow = [];
  const approval = [];
  const deny = [...HARD_GUARDRAILS];
  for (const a of p.actions) {
    const lv = cfg.permissions[a.key];
    if (lv === 'allow') allow.push(a.label);
    else if (lv === 'approval') approval.push(a.label);
    else deny.unshift(a.label);
  }
  return [
    `연결 계정 권한: ${account.name} (${p.name}${br ? ` · 브라우저: ${br.name}` : ''}${cfg.spaceName ? ` · 스페이스: ${cfg.spaceName}` : ''}${url ? ` · 주소: ${url}` : ''})`,
    allow.length ? `- 자동 허용: ${allow.join(', ')}` : '',
    approval.length ? `- 대표 승인 후에만 실행 (초안 올리고 대기): ${approval.join(', ')}` : '',
    `- 절대 금지 (클릭·입력 금지): ${[...new Set(deny)].join(', ')}`,
  ].filter(Boolean).join('\n');
}

export function publicAccountCatalog() {
  return ACCOUNT_PLATFORMS.map((p) => ({
    key: p.key,
    category: p.category,
    name: p.name,
    url: p.url || '',
    hint: p.hint,
    supportsDraftAuto: Boolean(p.supportsDraftAuto),
    actions: p.actions.map((a) => ({ key: a.key, short: a.short || '', label: a.label, locked: a.locked || null, def: a.def })),
  }));
}
