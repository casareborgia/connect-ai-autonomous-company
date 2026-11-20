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
