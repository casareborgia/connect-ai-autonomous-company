// 매출 계산과 결제사 API 어댑터.
// 주 경로: AI 직원이 로그인된 대시보드를 읽고 hq report 로 보고한 숫자 (근거 캡처 포함).
// 보조 경로: 환경변수 키가 있을 때만 결제사 API를 부른다. 키가 없으면 "연결 필요".
// 샘플 숫자는 절대 만들지 않는다.
import { ymd, ym, addDays } from './util.mjs';

export function normalizeSite(s) {
  const v = String(s || '').trim();
  const low = v.toLowerCase().replace(/\s+/g, '');
  if (['toss', 'tosspayments', '토스', '토스페이먼츠'].includes(low)) return '토스페이먼츠';
  if (['paypal', '페이팔'].includes(low)) return 'PayPal';
  if (['youtube', 'youtubestudio', '유튜브', '유튜브스튜디오'].includes(low)) return 'YouTube Studio';
  return v || '기타';
}

// ───────── 결제사 API 어댑터 (보조) ─────────

const TIMEOUT_MS = 10000;
const CACHE_MS = 10 * 60 * 1000;
const cache = new Map();

async function fetchJson(url, opts = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    const body = await res.text();
    let json = null;
    try { json = JSON.parse(body); } catch { /* 그대로 둠 */ }
    if (!res.ok) {
      const msg = (json && (json.message || json.error_description || json.name)) || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

const tossAdapter = {
  id: 'toss',
  site: '토스페이먼츠',
  envKeys: ['TOSS_SECRET_KEY'],
  configured: () => Boolean(process.env.TOSS_SECRET_KEY),
  // 이번 달 1일부터 지금까지 거래를 날짜별로 합산한다.
  async fetchDaily(from, to) {
    // TODO(오프라인 검증 불가): 토스페이먼츠 거래 조회 API
    //   GET https://api.tosspayments.com/v1/transactions?startDate=...&endDate=...&startingAfter=...&limit=...
    //   인증: Basic base64(시크릿키 + ':')
    //   응답 필드(transactionAt, status, amount, currency, transactionKey)와 취소 거래의 금액 부호는
    //   실제 키로 한 번 확인해야 한다. 지금은 status 가 DONE 인 거래만 더한다.
    const auth = 'Basic ' + Buffer.from(`${process.env.TOSS_SECRET_KEY}:`).toString('base64');
    const daily = {};
    let after = null;
    for (let page = 0; page < 20; page++) {
      const q = new URLSearchParams({ startDate: `${from}T00:00:00`, endDate: `${to}T23:59:59`, limit: '5000' });
      if (after) q.set('startingAfter', after);
      const list = await fetchJson(`https://api.tosspayments.com/v1/transactions?${q}`, { headers: { Authorization: auth } });
      if (!Array.isArray(list) || list.length === 0) break;
      for (const tx of list) {
        if (tx.status !== 'DONE') continue;
        const day = String(tx.transactionAt || '').slice(0, 10);
        const cur = tx.currency || 'KRW';
        const k = `${day}|${cur}`;
        daily[k] = (daily[k] || 0) + Number(tx.amount || 0);
      }
      after = list[list.length - 1].transactionKey;
      if (list.length < 5000) break;
    }
    return daily;
  },
};

const paypalAdapter = {
  id: 'paypal',
  site: 'PayPal',
  envKeys: ['PAYPAL_CLIENT_ID', 'PAYPAL_SECRET'],
  configured: () => Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_SECRET),
  async fetchDaily(from, to) {
    // TODO(오프라인 검증 불가): PayPal Transaction Search API
    //   POST {base}/v1/oauth2/token (grant_type=client_credentials, Basic client_id:secret)
    //   GET  {base}/v1/reporting/transactions?start_date=...&end_date=...&fields=transaction_info&page_size=500&page=N
    //   한 번에 최대 31일, 반영까지 몇 시간 지연. 계정에 Transaction Search 권한이 켜져 있어야 한다.
    //   지금은 transaction_status 가 S 이고 금액이 양수인 거래만 더한다 (수수료, 환불 처리는 실제 응답으로 확인 필요).
    const base = process.env.PAYPAL_ENV === 'sandbox' ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';
    const basic = 'Basic ' + Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_SECRET}`).toString('base64');
    const tok = await fetchJson(`${base}/v1/oauth2/token`, {
      method: 'POST',
      headers: { Authorization: basic, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
    });
    const bearer = `Bearer ${tok.access_token}`;
    const daily = {};
    for (let page = 1; page <= 20; page++) {
      const q = new URLSearchParams({
        start_date: `${from}T00:00:00Z`, end_date: `${to}T23:59:59Z`,
        fields: 'transaction_info', page_size: '500', page: String(page),
      });
      const res = await fetchJson(`${base}/v1/reporting/transactions?${q}`, { headers: { Authorization: bearer } });
      for (const d of res.transaction_details || []) {
        const ti = d.transaction_info || {};
        const amt = Number(ti.transaction_amount?.value || 0);
        if (ti.transaction_status !== 'S' || !(amt > 0)) continue;
        const day = String(ti.transaction_initiation_date || '').slice(0, 10);
        const cur = ti.transaction_amount?.currency_code || 'USD';
        const k = `${day}|${cur}`;
        daily[k] = (daily[k] || 0) + amt;
      }
      if (!res.total_pages || page >= res.total_pages) break;
    }
    return daily;
  },
};

export const ADAPTERS = [tossAdapter, paypalAdapter];

export async function readConnectors({ force = false, now = new Date() } = {}) {
  const from = `${ym(now)}-01`;
  const to = ymd(now);
  const out = [];
  for (const a of ADAPTERS) {
    if (!a.configured()) {
      out.push({ id: a.id, site: a.site, state: '연결 필요', envKeys: a.envKeys, message: `환경변수 ${a.envKeys.join(', ')} 없음`, lines: [] });
      continue;
    }
    const hit = cache.get(a.id);
    if (!force && hit && Date.now() - hit.at < CACHE_MS && hit.from === from) {
      out.push(hit.value);
      continue;
    }
    let value;
    try {
      const daily = await a.fetchDaily(from, to);
      const readAt = new Date().toISOString();
      const lines = Object.entries(daily).map(([k, amount]) => {
        const [period, currency] = k.split('|');
        return { id: `api-${a.id}-${k}`, source: 'API', site: a.site, period, currency, amount, estimated: false, by: 'api', readAt, evidence: null };
      });
      value = { id: a.id, site: a.site, state: '연결됨', envKeys: a.envKeys, message: '', fetchedAt: readAt, lines };
    } catch (e) {
      value = { id: a.id, site: a.site, state: '오류', envKeys: a.envKeys, message: String(e.message || e).slice(0, 200), lines: [] };
    }
    cache.set(a.id, { at: Date.now(), from, value });
    out.push(value);
  }
  return out;
}

// ───────── 매출 요약 ─────────

function allLines(data, connectors) {
  const lines = [];
  for (const e of data.revenue.entries) {
    lines.push({ ...e, site: e.source === '수기 입력' ? (e.site || '수기 입력') : normalizeSite(e.site) });
  }
  // 유튜브 예상 수익 지표는 매출 줄로도 보여 준다 (예상, 확정 결제와 분리)
  for (const m of data.metrics) {
    if (m.name !== '예상 수익') continue;
    lines.push({
      id: m.id, source: 'AI 직원 보고', site: 'YouTube Studio', amount: m.value, currency: m.currency || 'KRW',
      period: m.period, estimated: true, by: m.by, readAt: m.readAt, evidence: m.evidence, fromMetric: true,
    });
  }
  for (const c of connectors) lines.push(...c.lines);
  return lines;
}

// 같은 사이트, 같은 기간, 같은 통화의 보고가 여러 번이면 가장 최근에 읽은 것 하나만 쓴다.
// 수기 입력은 한 건 한 건이 따로 더해진다.
function dedupe(lines) {
  const map = new Map();
  for (const l of lines) {
    const key = l.source === '수기 입력' ? `manual|${l.id}` : `${l.site}|${l.period}|${l.currency}|${l.estimated ? 1 : 0}`;
    const prev = map.get(key);
    if (!prev || String(l.readAt || '') > String(prev.readAt || '')) map.set(key, l);
  }
  return [...map.values()];
}

function addTo(bucket, cur, amt) {
  bucket[cur] = (bucket[cur] || 0) + amt;
}

export function summarize(data, connectors, now = new Date()) {
  const yday = ymd(addDays(now, -1));
  const month = ym(now);
  const lines = dedupe(allLines(data, connectors));

  // 어제
  const yLines = lines.filter((l) => l.period === yday);
  const yesterday = { confirmed: {}, estimated: {}, lines: yLines };
  for (const l of yLines) addTo(l.estimated ? yesterday.estimated : yesterday.confirmed, l.currency, l.amount);

  // 이번 달: 사이트마다 월 합계 보고가 있으면 그것, 없으면 일별 합
  const groups = new Map();
  for (const l of lines) {
    if (!(l.period === month || l.period.startsWith(`${month}-`))) continue;
    const key = l.source === '수기 입력' ? `수기 입력|${l.currency}` : `${l.site}|${l.currency}|${l.estimated ? 1 : 0}`;
    if (!groups.has(key)) groups.set(key, { site: l.source === '수기 입력' ? '수기 입력' : l.site, source: l.source, currency: l.currency, estimated: Boolean(l.estimated), monthLines: [], dayLines: [] });
    const g = groups.get(key);
    (l.period === month ? g.monthLines : g.dayLines).push(l);
  }
  const bySite = [];
  const monthSum = { confirmed: {}, estimated: {} };
  for (const g of groups.values()) {
    let amount;
    let basis;
    let used;
    if (g.source === '수기 입력') {
      used = [...g.monthLines, ...g.dayLines];
      amount = used.reduce((s, l) => s + l.amount, 0);
      basis = `수기 입력 ${used.length}건`;
    } else if (g.monthLines.length) {
      used = [g.monthLines.sort((a, b) => String(b.readAt).localeCompare(String(a.readAt)))[0]];
      amount = used[0].amount;
      basis = '이번 달 합계 보고';
    } else {
      used = g.dayLines;
      amount = used.reduce((s, l) => s + l.amount, 0);
      basis = `일별 보고 ${used.length}일 합`;
    }
    bySite.push({ site: g.site, source: g.source, currency: g.currency, estimated: g.estimated, amount, basis, lines: used });
    addTo(g.estimated ? monthSum.estimated : monthSum.confirmed, g.currency, amount);
  }
  bySite.sort((a, b) => Number(a.estimated) - Number(b.estimated) || a.site.localeCompare(b.site));

  // AI 월급
  let salaryTotal = 0;
  let unknown = 0;
  for (const e of data.employees) {
    if (e.salary === null || e.salary === undefined) unknown++;
    else salaryTotal += Number(e.salary) || 0;
  }

  const hasMonth = bySite.length > 0;
  const krwConfirmed = monthSum.confirmed.KRW || 0;
  const krwEstimated = monthSum.estimated.KRW || 0;
  const net = hasMonth
    ? { KRW: krwConfirmed + krwEstimated - salaryTotal, includesEstimate: krwEstimated !== 0, hasData: true }
    : { KRW: null, includesEstimate: false, hasData: false };

  // 최근 30일 일별 매출 (원화, 확정 + 예상). 보고가 없는 날은 null (0 으로 채우지 않는다)
  const daily30 = [];
  for (let i = 29; i >= 0; i--) {
    const day = ymd(addDays(now, -i));
    const ls = lines.filter((l) => l.period === day && l.currency === 'KRW');
    daily30.push({ date: day, amount: ls.length ? ls.reduce((s, l) => s + l.amount, 0) : null });
  }

  return {
    daily30,
    yesterdayDate: yday,
    month,
    yesterday,
    monthSum,
    bySite,
    salaries: { total: salaryTotal, unknown, count: data.employees.length },
    net,
    connectors: connectors.map(({ lines: _l, ...c }) => c),
  };
}
