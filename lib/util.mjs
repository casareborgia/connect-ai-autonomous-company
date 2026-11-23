// 공용 도우미: 날짜, 아이디, 입력 정리

export const STATUSES = ['대기', '진행', '완료', '막힘'];
export const APPROVAL_KINDS = ['결제', '업로드', '게시', '메시지 발송', '댓글 답글', '삭제', '기타'];
export const METRIC_NAMES = ['조회수', '시청 시간', '구독자 증감', '구독자', '예상 수익', '멤버십', '댓글'];
export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

const pad = (n) => String(n).padStart(2, '0');

// 이 맥의 현지 시간 기준 날짜 문자열
export function ymd(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function ym(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
export function hm(d = new Date()) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
export function nowIso() {
  return new Date().toISOString();
}

export function nextId(data, prefix) {
  data.meta.seq[prefix] = (data.meta.seq[prefix] || 0) + 1;
  return `${prefix}${data.meta.seq[prefix]}`;
}

// 텍스트 입력 정리: 문자열만, 길이 제한, 제어문자 제거 (줄바꿈과 탭은 유지)
export function text(v, max = 2000) {
  if (v === undefined || v === null) return '';
  const s = String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  return s.trim().slice(0, max);
}

export function optText(v, max = 2000) {
  const s = text(v, max);
  return s === '' ? null : s;
}

// "HH:MM" 형식만 허용
export function timeOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(v).trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return `${pad(h)}:${pad(mi)}`;
}

// 초 단위 상대 시각 추출 ("10초 뒤", "30초 후에" → 10, 30; 최대 600초)
export function extractKoreanDelaySec(raw) {
  const s = String(raw || '');
  const m = /(\d{1,3})\s*초\s*(?:뒤|후)(?:에)?/.exec(s);
  if (!m) return null;
  const sec = Number(m[1]);
  return Number.isFinite(sec) && sec >= 1 && sec <= 600 ? sec : null;
}

// 한국어/24시 자연어 시각 추출 ("10초 뒤", "10분 뒤", "1시간 뒤", "오후 5:11", "9시 30분 오전", "9시에", "16:30" 등)
export function extractKoreanTime(raw, now = new Date()) {
  const s = String(raw || '');
  if (!s) return null;
  // -1) 초 단위 상대 시각 ("10초 뒤", "30초 후")
  const delaySec = extractKoreanDelaySec(s);
  if (delaySec) {
    const target = new Date(now.getTime() + delaySec * 1000);
    return `${pad(target.getHours())}:${pad(target.getMinutes())}`;
  }
  // 0) 상대 시각 ("5분 뒤", "10분 후", "1시간 뒤", "1시간 30분 뒤", "1시간 반 후")
  const mRel = /(?:(\d{1,2})\s*시간(?:\s*(\d{1,2})\s*분|\s*(반))?|(\d{1,3})\s*분)\s*(?:뒤|후)(?:에)?/.exec(s);
  if (mRel) {
    const addH = mRel[1] ? Number(mRel[1]) : 0;
    const addM = mRel[3] ? 30 : mRel[2] ? Number(mRel[2]) : mRel[4] ? Number(mRel[4]) : 0;
    const totalMin = addH * 60 + addM;
    if (totalMin >= 1 && totalMin <= 720) {
      const target = new Date(now.getTime() + totalMin * 60000);
      return `${pad(target.getHours())}:${pad(target.getMinutes())}`;
    }
  }
  const adjustMer = (mer, h) => {
    if (['오후', '저녁', '밤'].includes(mer) && h >= 1 && h <= 11) return h + 12;
    if (mer === '낮' && h >= 1 && h <= 6) return h + 12;
    if (['오전', '새벽'].includes(mer) && h === 12) return 0;
    return h;
  };
  // 1) 오전/오후/아침/저녁/밤/낮/새벽 + HH:MM (예: "오후 5:11", "저녁 7:30")
  const m0 = /(오전|오후|아침|점심|낮|저녁|밤|새벽)\s*(\d{1,2}):([0-5]\d)(?!\d)/.exec(s);
  if (m0) {
    const h = adjustMer(m0[1], Number(m0[2]));
    const mi = Number(m0[3]);
    if (h >= 0 && h <= 23) return `${pad(h)}:${pad(mi)}`;
  }
  // 2) 오전/오후/아침/저녁/밤/낮/새벽 + N시 (M분 | 반)
  const m1 = /(오전|오후|아침|점심|낮|저녁|밤|새벽)\s*(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분|\s*(반))?/.exec(s);
  if (m1) {
    const h = adjustMer(m1[1], Number(m1[2]));
    const mi = m1[4] ? 30 : m1[3] ? Number(m1[3]) : 0;
    if (h >= 0 && h <= 23 && mi >= 0 && mi <= 59) return `${pad(h)}:${pad(mi)}`;
  }
  // 2-b) 후치 오전/오후 ("9시 30분 오전", "7시 오후", "8시 반 저녁")
  const mPost = /(?<!\d)(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분|\s*(반))?\s*(오전|오후|아침|점심|낮|저녁|밤|새벽)/.exec(s);
  if (mPost) {
    const h = adjustMer(mPost[4], Number(mPost[1]));
    const mi = mPost[3] ? 30 : mPost[2] ? Number(mPost[2]) : 0;
    if (h >= 0 && h <= 23 && mi >= 0 && mi <= 59) return `${pad(h)}:${pad(mi)}`;
  }
  // 3) "16시 30분", "4시 반", "9시 00분" ("분마다" 주기 표현 제외)
  const m2 = /(?<!\d)(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분(?!마다)|\s*(반))/.exec(s);
  if (m2) {
    let h = Number(m2[1]);
    const mi = m2[3] ? 30 : Number(m2[2]);
    if (h >= 0 && h <= 23 && mi >= 0 && mi <= 59) {
      if (h >= 1 && h <= 6) h += 12;
      return `${pad(h)}:${pad(mi)}`;
    }
  }
  // 3-b) 단독 "9시에", "14시까지" ("1시간", "시안", "시작" 등 제외)
  const mBare = /(?<!\d)(\d{1,2})\s*시(?:에|까지|부터)(?!\d)/.exec(s);
  if (mBare) {
    let h = Number(mBare[1]);
    if (h >= 0 && h <= 23) {
      if (h >= 1 && h <= 6) h += 12;
      return `${pad(h)}:00`;
    }
  }
  // 4) 명시적 "HH:MM" (예: "16:30 이메일 체크")
  const m3 = /(?<!\d)([01]?\d|2[0-3]):([0-5]\d)(?!\d)/.exec(s);
  if (m3) return `${pad(Number(m3[1]))}:${pad(Number(m3[2]))}`;
  return null;
}

export function dateOrNull(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

// 기간: 하루(YYYY-MM-DD) 또는 한 달(YYYY-MM)
export function periodOrNull(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s) || /^\d{4}-\d{2}$/.test(s)) return s;
  return null;
}

export function numberOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(String(v).replace(/[,\s원₩$]/g, ''));
  return Number.isFinite(n) ? n : null;
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// 새 할 일을 같은 날 할 일 중 시간 순서에 맞는 자리에 넣는다
export function orderFor(d, t) {
  const peers = d.tasks.filter((x) => x.date === t.date).sort((a, b) => a.order - b.order);
  const maxAll = d.tasks.reduce((m, x) => Math.max(m, x.order || 0), 0);
  if (!t.time || !peers.length) return maxAll + 1;
  const next = peers.find((x) => x.time && x.time > t.time);
  if (!next) return maxAll + 1;
  const i = peers.indexOf(next);
  const prev = i > 0 ? peers[i - 1].order : next.order - 1;
  return (prev + next.order) / 2;
}
