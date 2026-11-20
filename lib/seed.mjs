// 처음 실행할 때 만드는 회사 데이터. 예시 회사는 Jay 가 쓴 구조 그대로이고 (사적인 일정은 뺌),
// 말하지 않은 가격, 매출, 시간은 비워 둔다 (화면에서 입력).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ymd, nowIso } from './util.mjs';
import { DEFAULT_GROUPS } from './catalog.mjs';
import { presetPermissions } from './accounts.mjs';

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HQ = /[\\/]_npx[\\/]/.test(PKG)
  ? 'npx -y github:wonseokjung/connect-ai-autonomous-company'
  : `node ${path.join(PKG, 'bin', 'hq.mjs')}`;

export const REVENUE_JOB_INSTRUCTION = `아침 매출 확인 (경리 담당)

목표: 어제와 이번 달의 매출을 읽어서 본사에 보고합니다.

규칙
1. 읽기만 합니다. 어떤 버튼도 눌러서 바꾸지 않습니다 (환불, 취소, 정산 요청, 설정 변경 금지).
2. 비밀번호, 인증 코드, 카드 번호는 절대 입력하지 않습니다. 로그인이 풀려 있으면 그 자리에서 멈추고 아래 메시지로 대표에게 알립니다.
3. 숫자마다 화면 캡처를 남기고, 캡처 파일 경로를 --evidence 로 붙입니다.

순서
1. 이미 로그인된 브라우저에서 토스페이먼츠 상점관리자를 열고 어제 매출과 이번 달 매출을 읽습니다.
2. 이미 로그인된 브라우저에서 PayPal 대시보드를 열고 어제와 이번 달 매출을 읽습니다 (통화 그대로).
3. 사이트마다 보고합니다.
   ${HQ} report revenue --from <내 아이디> --source 토스페이먼츠 --amount <금액> --currency KRW --period <어제 날짜 YYYY-MM-DD> --evidence <캡처.png>
   ${HQ} report revenue --from <내 아이디> --source 토스페이먼츠 --amount <금액> --currency KRW --period <이번 달 YYYY-MM> --evidence <캡처.png>
   ${HQ} report revenue --from <내 아이디> --source PayPal --amount <금액> --currency USD --period <어제 날짜> --evidence <캡처.png>
4. 끝나면 ${HQ} task done <이 할 일 아이디> --note "보고 완료"
5. 로그인이 필요하거나 화면이 다르면 ${HQ} task stuck <이 할 일 아이디> --note "이유" 후 ${HQ} msg "무엇이 필요한지" --from <내 아이디> --task <이 할 일 아이디>`;

export const YOUTUBE_JOB_INSTRUCTION = `유튜브 확인 (채널 담당)

목표: CONNECT AI LAB 채널의 어제와 이번 달 숫자를 읽고, 답글이 필요한 새 댓글을 정리합니다.

규칙
1. 읽기만 합니다. 댓글 답글, 삭제, 숨기기, 고정, 하트, 설정 변경을 직접 하지 않습니다.
2. 비밀번호, 인증 코드는 절대 입력하지 않습니다. 로그인이 풀려 있으면 그 자리에서 멈추고 대표에게 알립니다.
3. 숫자마다 화면 캡처를 남기고 --evidence 로 붙입니다.
4. 답글은 초안만 만듭니다. 초안은 결재함으로 가고, 대표가 화면에서 승인하기 전에는 절대 게시하지 않습니다.

순서
1. 이미 로그인된 브라우저에서 YouTube Studio 분석 개요를 엽니다.
2. 기간을 어제로 두고 조회수, 시청 시간, 구독자 증감, 예상 수익, 멤버십을 읽어 하나씩 보고합니다.
   ${HQ} report metric --from <내 아이디> --source youtube --name 조회수 --value <숫자> --period <어제 날짜 YYYY-MM-DD> --evidence <캡처.png>
   ${HQ} report metric --from <내 아이디> --source youtube --name "시청 시간" --value <시간> --unit 시간 --period <어제 날짜> --evidence <캡처.png>
   ${HQ} report metric --from <내 아이디> --source youtube --name "구독자 증감" --value <숫자> --period <어제 날짜> --evidence <캡처.png>
   ${HQ} report metric --from <내 아이디> --source youtube --name "예상 수익" --value <금액> --currency KRW --period <어제 날짜> --evidence <캡처.png>
   ${HQ} report metric --from <내 아이디> --source youtube --name 멤버십 --value <숫자> --period <어제 날짜> --evidence <캡처.png>
3. 기간을 이번 달로 바꾸고 같은 다섯 가지를 --period <이번 달 YYYY-MM> 으로 보고합니다.
4. 댓글 탭에서 답하지 않은 새 댓글 중 답이 필요한 것을 고릅니다. 하나마다 답글 초안을 결재함에 올립니다.
   ${HQ} draft comment-reply --from <내 아이디> --video "<영상 제목>" --author "<댓글 쓴 사람>" --comment "<원래 댓글 그대로>" --reply "<답글 초안>" --url "<댓글 링크>"
5. 승인된 초안만, 승인된 문장 그대로 게시합니다. 승인 여부는 ${HQ} approval list --from <내 아이디> 로 확인하고, 게시한 뒤 ${HQ} approval executed <결재 아이디> --from <내 아이디> 를 남깁니다.
6. 끝나면 ${HQ} task done <이 할 일 아이디> --note "보고 완료". 막히면 task stuck 과 msg 로 알립니다.`;

// 새 사용자: 빈 회사로 시작하고 첫 화면에서 3분 시작하기를 띄운다
export function emptyData() {
  const t = nowIso();
  return {
    version: 2,
    meta: { createdAt: t, seq: { t: 0, h: 0, m: 0, a: 0, r: 0, j: 0, e: 0, x: 0, s: 0, res: 0 } },
    owner: { id: 'jay', name: '', title: '대표' },
    groups: DEFAULT_GROUPS.map((g) => ({ ...g })),
    employees: [], resources: [], tasks: [], routines: [], handoffs: [], messages: [], approvals: [], worklog: [],
    revenue: { entries: [] }, metrics: [],
    business: { services: [], channels: [], code: [], payments: [] },
    settings: { alarmsEnabled: false, onboarded: false, companyName: '', lanEnabled: false, quietHours: null, features: { revenue: false, channel: false, news: false, messenger: false, approvals: false, charts: false } },
  };
}

// 예시 회사 (AIHQ_SEED=jay 또는 example 일 때만). 직원과 리소스 구조는 Jay 의 회사, 일정은 일반 예시.
export function seedData(now = new Date()) {
  const today = ymd(now);
  const t = nowIso();
  const emp = (id, name, group, role, tools, runsOn, command, salary, engine, resources) => ({
    id, name, group, role, tools, runsOn, command, salary, engine, model: '', runMode: 'off', manual: '', resources, abilities: [],
  });
  const task = (id, order, title, kind, assignee, time, note = '', reason = '') => ({
    id, order, title, kind, assignee, date: today, time, status: '대기', note, resource: null, gate: null, gateApprovedAt: null,
    reason, assignSource: 'jay', routineId: null, jobId: null, createdAt: t, createdBy: 'jay', history: [], runStartedAt: null,
  });
  return {
    version: 2,
    meta: { createdAt: t, seq: { t: 5, h: 0, m: 1, a: 0, r: 5, j: 0, e: 0, x: 0, s: 0, res: 0 } },
    owner: { id: 'jay', name: 'Jay', title: '대표' },
    groups: [
      { id: 'office-bigco', title: '내 사무실에서 근무', subtitle: 'AI는 대기업 소속', detail: '내 데스크탑에서 실행, AI는 대기업 소속' },
      { id: 'home-cloud', title: '자기 집에서 근무', subtitle: '클라우드', detail: '' },
      { id: 'office-own', title: '내 사무실', subtitle: '내 컴퓨터에서 운영', detail: '' },
    ],
    employees: [
      emp('gemini', 'Gemini 멤버십 Ultra', 'office-bigco', '영상 바이브코딩', ['Blender', '오픈소스'], '내 데스크탑', '', null, 'none', ['m-gemini']),
      emp('codex', 'Codex 멤버십', 'office-bigco', '컴퓨터 유즈', [], '내 데스크탑', '', null, 'codex', ['m-codex']),
      emp('claude', 'Claude 멤버십', 'office-bigco', '', [], '내 데스크탑', '', null, 'claude', ['m-claude']),
      emp('muse', 'Muse', 'home-cloud', '', [], '클라우드', '데스크탑에서 명령', 0, 'none', []),
      emp('pickle', '피클', 'home-cloud', '', [], '클라우드', '스마트폰으로 명령', 0, 'none', []),
      emp('gemma', 'Gemma 4 E2B', 'office-own', '', [], '내 컴퓨터', '', null, 'local', []),
      emp('marketing', '내가 학습시킨 마케팅 AI', 'office-own', '마케팅', [], '내 컴퓨터', '', null, 'local', []),
    ],
    resources: [
      { id: 'mbp', kind: '기계', name: '맥북 프로', hostname: '', port: 22, isThisMac: true, status: '사용 가능', note: '' },
      { id: 'mba', kind: '기계', name: '맥북 에어', hostname: '', port: 22, isThisMac: false, status: '확인 필요', note: '' },
      { id: 'studio', kind: '기계', name: '맥 스튜디오', hostname: '', port: 22, isThisMac: false, status: '확인 필요', note: '' },
      { id: 'm-gemini', kind: '멤버십', name: 'Gemini 멤버십 Ultra', status: '사용 가능', note: '' },
      { id: 'm-codex', kind: '멤버십', name: 'Codex 멤버십', status: '사용 가능', note: '' },
      { id: 'm-claude', kind: '멤버십', name: 'Claude 멤버십', status: '사용 가능', note: '' },
      { id: 'a-github', kind: '계정', platform: 'github', preset: 'approval', permissions: presetPermissions('github', 'approval'), browser: null, name: 'GitHub', status: '사용 가능', note: '공유 코드' },
      { id: 'a-youtube', kind: '계정', platform: 'youtube', preset: 'approval', permissions: presetPermissions('youtube', 'approval'), browser: null, name: 'YouTube · CONNECT AI LAB', status: '사용 가능', note: '콘텐츠 채널' },
      { id: 'a-instagram', kind: '계정', platform: 'instagram', preset: 'approval', permissions: presetPermissions('instagram', 'approval'), browser: null, name: 'Instagram', status: '사용 가능', note: 'SNS 홍보 채널' },
      { id: 'a-naver-blog', kind: '계정', platform: 'naver_blog', preset: 'draft_auto', permissions: presetPermissions('naver_blog', 'draft_auto'), browser: null, name: '네이버 블로그', status: '사용 가능', note: '검색 유입·아티클' },
      { id: 'a-naver-clip', kind: '계정', platform: 'naver_clip', preset: 'draft_auto', permissions: presetPermissions('naver_clip', 'draft_auto'), browser: null, name: '네이버 클립', status: '사용 가능', note: '네이버 숏폼 채널' },
      { id: 'a-toss', kind: '계정', platform: 'payment', preset: 'readonly', permissions: presetPermissions('payment', 'readonly'), browser: null, name: '토스페이먼츠', status: '사용 가능', note: '한국 결제사' },
      { id: 'a-paypal', kind: '계정', platform: 'payment', preset: 'readonly', permissions: presetPermissions('payment', 'readonly'), browser: null, name: '페이팔', status: '사용 가능', note: '글로벌 결제사' },
      { id: 'f-work', kind: '폴더', name: 'AI 직원 작업 폴더', path: 'workspaces', status: '사용 가능', note: 'Claude Code, Codex 를 실행하는 곳 (직원마다 하위 폴더)' },
    ],
    tasks: [
      task('t1', 1, '거래처 미팅', 'human', 'jay', '10:00'),
      task('t2', 2, '강의 촬영', 'human', 'jay', '17:00'),
      task('t3', 3, '컨텐츠 촬영', 'human', 'jay', '19:00'),
      task('t4', 4, '라이브 촬영', 'human', 'jay', '20:00'),
      task('t5', 5, '다음 주 출장 비행기표 찾기', 'ai', null, null, '검색과 비교만. 결제는 대표 승인 필요.', '대표가 정한 AI 일 · 담당을 골라 주세요'),
    ],
    routines: [
      { id: 'r1', title: 'AI 라이브 방송', where: 'YouTube', days: [1, 2, 3, 4, 5], time: '20:00', assignee: 'jay', resource: null, alarm: true, enabled: true, instruction: '', gate: null, feature: null, log: {}, reason: '' },
      { id: 'r2', title: '운동', where: '', days: [0, 1, 2, 3, 4, 5, 6], time: '07:00', assignee: 'jay', resource: null, alarm: true, enabled: true, instruction: '', gate: null, feature: null, log: {}, reason: '' },
      { id: 'r3', title: '하루 마무리 메모', where: '', days: [0, 1, 2, 3, 4, 5, 6], time: '22:30', assignee: 'jay', resource: null, alarm: true, enabled: true, instruction: '', gate: null, feature: null, log: {}, reason: '' },
      // 숨김 기능(매출, 채널)용 AI 매일 할 일. 기능을 켜면 보인다.
      { id: 'r4', title: '아침 매출 확인 (경리 담당)', where: '', days: [0, 1, 2, 3, 4, 5, 6], time: null, assignee: null, resource: null, alarm: false, enabled: false, instruction: REVENUE_JOB_INSTRUCTION, gate: null, feature: 'revenue', log: {}, reason: '' },
      { id: 'r5', title: '유튜브 확인 (채널 담당)', where: '', days: [0, 1, 2, 3, 4, 5, 6], time: null, assignee: null, resource: null, alarm: false, enabled: false, instruction: YOUTUBE_JOB_INSTRUCTION, gate: null, feature: 'channel', log: {}, reason: '' },
    ],
    handoffs: [],
    messages: [],
    approvals: [],
    worklog: [],
    revenue: { entries: [] },
    metrics: [],
    business: {
      services: [],
      channels: [{ id: 'c1', name: 'CONNECT AI LAB', where: 'YouTube', note: '' }],
      code: [{ id: 'g1', name: 'GitHub', where: '', note: '' }],
      payments: [
        { id: 'toss', name: '토스페이먼츠', region: '한국' },
        { id: 'paypal', name: '페이팔', region: '글로벌' },
      ],
    },
    // 숨긴 기능은 코드를 남기고 여기서 끈다 (화면 메뉴에 안 보임)
    settings: { alarmsEnabled: false, onboarded: true, companyName: 'CONNECT AI LAB', lanEnabled: false, quietHours: { from: '23:30', to: '07:00' }, features: { revenue: false, channel: false, news: false, messenger: false, approvals: false, charts: false } },
  };
}
