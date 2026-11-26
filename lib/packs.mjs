// THE FOUNDER 시리즈 실습용 1클릭 루틴 팩 & 오늘의 자율 회사 리포트 (민감정보 제외)
import { ymd, addDays } from './util.mjs';

export const ROUTINE_PACKS = [
  {
    key: 'creator-daily-os',
    badge: '실전 OS',
    title: '1인 AI 회사 데일리 운영 팩',
    summary: '5분마다 Ego Lite 이메일·영수증 확인 + 아침 8시 영상 편집(블렌더·모션그래픽·디자인)을 1클릭으로 세팅합니다.',
    routines: [
      {
        title: '이메일 · 수강생 문의 체크',
        intervalMin: 5,
        days: [0, 1, 2, 3, 4, 5, 6],
        instruction: [
          '5분마다 Ego Lite 이메일 스페이스에서 새 메일과 수강생 문의를 읽고 긴급도를 분류합니다.',
          '답장이 필요한 메일은 초안만 작성해 스레드에 정리해 두고, 대표 확인을 기다립니다.',
        ].join('\n'),
      },
      {
        title: '8시 영상 편집 · 모션그래픽',
        time: '08:00',
        days: [1, 2, 3, 4, 5],
        stepTemplate: 'video-edit',
        instruction: [
          '모션 그래픽은 Hyperframes 오픈소스로 CONNECT AI 흑백 미니멀 스타일을 적용하고, 3D 씬은 Blender로 제작합니다.',
          '최종 편집본과 썸네일 3컷을 공유 폴더에 저장하고, 유튜브 제목·설명·태그 초안을 스레드에 보고합니다.',
        ].join('\n'),
      },
    ],
  },
  {
    key: 'ep2-briefing',
    badge: 'EP.2 노동력',
    title: '아침 회사 브리핑 팩',
    summary: '컴퓨터 유즈 브라우저로 채널·매출 숫자를 읽기만 하고, 댓글은 초안만 결재함에 올립니다.',
    routines: [
      {
        title: '아침 유튜브 채널 브리핑 (읽기·댓글 초안)',
        time: '08:00',
        days: [0, 1, 2, 3, 4, 5, 6],
        instruction: [
          '목표: 연결된 브라우저(Ego Lite 등)에서 YouTube Studio의 어제 조회수·시청시간·구독자·새 댓글을 읽고 요약 보고합니다.',
          '규칙:',
          '1. 연결 계정의 권한을 먼저 확인합니다. 통계·댓글 읽기만 수행하고, 댓글 답글 초안은 결재함에 제안합니다.',
          '2. 로그인이 풀려 있으면 바로 멈추고 대표에게 알립니다.',
          '3. 숫자마다 근거 캡처를 남기고 대표가 아침에 10초 만에 볼 수 있게 3줄로 요약합니다.',
        ].join('\n'),
      },
      {
        title: '아침 매출 숫자 확인 (읽기만)',
        time: '08:30',
        days: [1, 2, 3, 4, 5],
        instruction: [
          '목표: 이미 로그인된 브라우저에서 토스페이먼츠·PayPal 어제 매출과 이번 달 누적 매출을 읽기만 합니다.',
          '규칙:',
          '1. 매출 대시보드 조회와 3줄 요약만 수행합니다.',
          '2. 로그인이 필요하면 멈추고 대표에게 인수인계합니다.',
        ].join('\n'),
      },
    ],
  },
  {
    key: 'ep3-reverse',
    badge: 'EP.3 경영',
    title: '리버스 비즈니스 1일 1해부 팩',
    summary: '매일 참고할 서비스 1개를 해부하고, 끝나면 콘텐츠·기획 담당 AI에게 자동으로 넘깁니다.',
    routines: [
      {
        title: '리버스 비즈니스 1일 1해부 (경쟁사 구조·수익 분석)',
        time: '09:00',
        days: [1, 2, 3, 4, 5],
        relayHint: 'marketing',
        instruction: [
          '목표: 오늘의 참고 사업 서비스 주소 1개를 Reverse Business 도구와 브라우저로 해부합니다.',
          '순서:',
          '1. 문제·고객·수익 구조·유입 경로·기술 뼈대 6칸으로 해부합니다.',
          '2. 원본을 복제하지 않고 구조만 뽑아 내 서비스·교육에 적용할 1가지 아이디어를 적습니다.',
          '3. 완료 후 결과를 요약해 다음 담당 직원(또는 대표)이 바로 콘텐츠·기획에 쓸 수 있게 남깁니다.',
        ].join('\n'),
      },
      {
        title: '오늘 실험·해부 1줄 회고',
        time: '22:00',
        days: [0, 1, 2, 3, 4, 5, 6],
        human: true,
        instruction: '',
      },
    ],
  },
  {
    key: 'unit-sns6',
    badge: '유닛 홍보',
    title: '1서비스 멀티채널 홍보 초안 팩',
    summary: '오늘의 영상·제품 하나로 유튜브·인스타·네이버 블로그·네이버 클립·스레드·X 초안을 뽑아 결재함에 모읍니다.',
    routines: [
      {
        title: '멀티채널 홍보 초안 만들기 (유튜브·인스타·네이버 블로그·클립·스레드·X)',
        time: '18:00',
        days: [1, 2, 3, 4, 5],
        instruction: [
          '목표: 오늘 진행한 작업·영상·해부 결과를 바탕으로 멀티채널 홍보 초안을 만듭니다.',
          '채널: 1) 유튜브 쇼츠·네이버 클립·릴스·틱톡 숏폼 대본 2) 네이버 블로그 SEO 글+이미지 구성 3) 인스타 카드뉴스 4) 스레드·X 3줄 5) 링크드인 인사이트 6) 커뮤니티 공유글',
          '규칙: 연결 계정의 권한이 "임시저장만 자동"이면 임시저장까지만 진행하고, 공개 발행은 대표 결재함 승인을 기다립니다.',
        ].join('\n'),
      },
      {
        title: '야간 숏폼·영상 렌더 및 자막 준비 (자는 시간 작업)',
        time: '22:30',
        days: [1, 2, 3, 4, 5],
        instruction: [
          '목표: 대표 자는 시간 동안 ffmpeg·Blender·Whisper로 유튜브 쇼츠·인스타 릴스·네이버 클립용 9:16 세로 클립과 자막을 준비합니다.',
          '규칙: 대표를 깨우지 않고 결과 파일 경로와 요약만 남겨 두면 아침 보고에 올라갑니다.',
        ].join('\n'),
      },
    ],
  },
];

// 최근 7일 루틴 완료율 계산
function recentRoutineRate(routines, todayStr) {
  const active = routines.filter((r) => r.enabled !== false && !r.feature);
  if (!active.length) return { active: 0, done: 0, scheduled: 0, pct: 0 };
  const base = new Date(`${todayStr}T12:00:00`);
  let done = 0;
  let scheduled = 0;
  for (let i = 0; i < 7; i++) {
    const dt = addDays(base, -i);
    const key = ymd(dt);
    const wd = dt.getDay();
    for (const r of active) {
      if (!(r.days || []).includes(wd)) continue;
      scheduled++;
      if (r.log?.[key] === '완료') done++;
    }
  }
  return { active: active.length, done, scheduled, pct: scheduled ? Math.round((done / scheduled) * 100) : 0 };
}

// 방송 오프닝·커뮤니티 공유용 오늘의 자율 회사 리포트 (매출 금액·계정 비번 등 민감정보 자동 제외)
export function buildDailyReport(d, today = ymd()) {
  const company = d.settings?.companyName || '나의 AI 자율 회사';
  const todayTasks = (d.tasks || []).filter((t) => t.date === today);
  const doneAll = todayTasks.filter((t) => t.status === '완료');
  const doneAi = doneAll.filter((t) => t.assignee && t.assignee !== 'jay');
  const doneHuman = doneAll.filter((t) => t.assignee === 'jay');
  const waitingGate = todayTasks.filter((t) => t.gate && !t.gateApprovedAt && t.status !== '완료');
  const stuck = todayTasks.filter((t) => t.status === '막힘');
  const handoffsToday = (d.handoffs || []).filter((h) => String(h.createdAt || '').startsWith(today));
  const approvedToday = (d.approvals || []).filter((a) => a.status === '승인' && String(a.decidedAt || '').startsWith(today));
  const pendingAppr = (d.approvals || []).filter((a) => a.status === '대기');
  const rate = recentRoutineRate(d.routines || [], today);
  const offices = (d.resources || []).filter((r) => r.kind === '기계' && r.status !== '꺼짐');
  const browsers = (d.resources || []).filter((r) => r.kind === '브라우저' && r.status !== '꺼짐');
  const oss = (d.resources || []).filter((r) => r.kind === '오픈소스' && r.status !== '꺼짐');
  const empName = (id) => (id === 'jay' ? '대표' : (d.employees || []).find((e) => e.id === id)?.name || 'AI');

  const lines = [
    `[${company} · ${today} 자율 운영 리포트]`,
    '',
    `- 오늘 완료: 총 ${doneAll.length}/${todayTasks.length}건 (AI 직원 ${doneAi.length}건 · 대표 ${doneHuman.length}건)`,
    `- 인수인계: ${handoffsToday.length}건 · 대표 결재: 승인 ${approvedToday.length}건 / 대기 ${pendingAppr.length + waitingGate.length}건${stuck.length ? ` · 막힘 ${stuck.length}건` : ''}`,
    `- 매일 루프: ${rate.active}개 가동 중 (최근 7일 달성률 ${rate.pct}%, ${rate.done}/${rate.scheduled})`,
    `- 회사 구성: AI 직원 ${(d.employees || []).length}명 · 사무실 ${offices.length}곳${browsers.length ? ` · 브라우저 ${browsers.map((b) => b.name).join(', ')}` : ''}${oss.length ? ` · 오픈소스 ${oss.length}개` : ''}`,
  ];
  if (doneAi.length) {
    lines.push('', 'AI 직원이 끝낸 일:');
    for (const t of doneAi.slice(0, 8)) lines.push(`- ${t.title} (${empName(t.assignee)})`);
  }
  if (handoffsToday.length) {
    lines.push('', '오늘 인수인계:');
    for (const h of handoffsToday.slice(0, 5)) lines.push(`- ${empName(h.from)} → ${h.to ? empName(h.to) : '대기'}: ${h.stuck || h.why || h.done}`);
  }
  lines.push('', '#CONNECTAIHQ #AI자율회사 #THEFOUNDER');
  return {
    date: today,
    company,
    counts: { total: todayTasks.length, done: doneAll.length, doneAi: doneAi.length, doneHuman: doneHuman.length, handoffs: handoffsToday.length, approvalsPending: pendingAppr.length + waitingGate.length, approvalsApproved: approvedToday.length, stuck: stuck.length },
    routineRate: rate,
    text: lines.join('\n'),
  };
}
