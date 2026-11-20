// Muse 읽기 (읽기만). 본사가 ssh 로 사무실의 `ego-browser nodejs` 에 이 글을 넣어 실행한다.
// - 대표가 미리 로그인해 둔 ego lite 에서 Muse 대화 목록과 최근 메시지를 읽어 JSON 한 줄로 출력한다.
// - 아무것도 누르지 않는다 (보내기, 승인, 결제 버튼 포함). 글자를 입력하지 않는다. 대화 링크로 이동(읽기)만 한다.
// - 로그인 화면이면 바로 멈추고 login_required 를 알린다. 비밀번호나 코드는 절대 넣지 않는다.
// - 파일로 남기지 않는다 (표준 출력으로만 본사에 돌려준다).
// 아래 INPUT 자리에 본사가 JSON 을 넣는다: { url, maxConversations, maxMessages }
const INPUT = __AIHQ_INPUT__;

// ── 페이지 안에서 도는 함수 (Muse 화면 구조를 모르므로 흔한 모양을 차례로 본다) ──
function pageScan(opts) {
  const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const bodyText = (document.body && document.body.innerText) || '';
  const pwd = [...document.querySelectorAll('input[type=password]')].some(vis);
  const loginUrl = /(^|\/)(login|log-in|signin|sign-in|auth|accounts?)(\/|$|\?)/i.test(location.pathname);
  const here = location.href;
  const sameSite = (u) => { try { const x = new URL(u, here); return location.protocol === 'file:' ? x.protocol === 'file:' : x.origin === location.origin; } catch { return false; } };
  const convSel = ['nav a[href*="/chat"]', 'aside a[href*="/chat"]', '[role="navigation"] a[href*="/chat"]', 'a[href*="/conversation"]', 'a[href*="/c/"]', 'a[href*="/t/"]', '[data-testid*="conversation"] a[href]', 'nav a[href]', 'aside a[href]'];
  let convs = [];
  for (const sel of convSel) {
    const list = [...document.querySelectorAll(sel)].filter((a) => vis(a) && sameSite(a.href) && a.href.split('#')[0] !== here.split('#')[0]);
    if (list.length) {
      convs = list.map((a) => ({ href: a.href, title: ((a.getAttribute('aria-label') || a.innerText || '').split('\n').map((x) => x.trim()).filter(Boolean)[0] || '').slice(0, 120) }))
        .filter((c) => c.title && !/^(new chat|새 대화|settings|설정|help|도움말|log ?out|로그아웃)$/i.test(c.title));
      if (convs.length) break;
    }
  }
  const seen = new Set();
  convs = convs.filter((c) => (seen.has(c.href) ? false : seen.add(c.href))).slice(0, opts.maxConversations);
  const msgSel = ['[data-message-id]', '[data-message-author-role]', '[data-testid*="message"]', 'main [role="article"]', 'main article', '[role="log"] [role="listitem"]', 'main [role="listitem"]'];
  let nodes = [];
  for (const sel of msgSel) { nodes = [...document.querySelectorAll(sel)].filter(vis); if (nodes.length) break; }
  nodes = nodes.filter((n) => !nodes.some((o) => o !== n && o.contains(n)));
  const roleOf = (n) => {
    const a = (n.getAttribute('data-message-author-role') || n.getAttribute('data-author') || n.getAttribute('data-role') || n.getAttribute('aria-label') || n.className || '').toString().toLowerCase();
    if (/(^|\b|_|-)(user|me|you|human|self|outgoing|sent)(\b|_|-|$)/.test(a)) return 'user';
    if (/(assistant|bot|muse|agent|incoming|received)|(^|[\s_-])ai([\s_-]|$)/.test(a)) return 'muse';
    return 'unknown';
  };
  const messages = nodes.slice(-opts.maxMessages).map((n) => {
    const t = n.querySelector('time');
    const clone = n.cloneNode(true);
    clone.querySelectorAll('button, time, [aria-hidden="true"], script, style').forEach((x) => x.remove());
    return {
      id: n.getAttribute('data-message-id') || null,
      role: roleOf(n),
      at: t ? (t.getAttribute('datetime') || t.innerText || '').trim().slice(0, 40) : null,
      text: (clone.innerText || '').replace(/\n{3,}/g, '\n\n').trim().slice(0, 4000),
    };
  }).filter((m) => m.text);
  const title = ((document.querySelector('main h1, main h2, header h1') || {}).innerText || document.title || '').trim().slice(0, 120);
  const loginWords = /(log in|sign in|continue with (google|facebook|meta|apple)|로그인)/i.test(bodyText);
  const login = pwd || (loginUrl && !convs.length && !messages.length) || (loginWords && !convs.length && !messages.length && bodyText.length < 3000);
  return { login, url: here, title, conversations: convs, messages };
}

const out = { status: 'ok', readAt: new Date().toISOString(), conversations: [] };
let task = null;
try {
  task = await taskSpace(`aihq muse reader ${Date.now()}`);
  const page = task.page('p1');
  await page.goto(INPUT.url, { timeout: 45000 });
  await page.waitForLoadState('load').catch(() => {});
  await page.waitForTimeout(2500);
  const opts = { maxConversations: INPUT.maxConversations || 8, maxMessages: INPUT.maxMessages || 40 };
  const first = await page.evaluate(pageScan, opts);
  if (first.login) {
    out.status = 'login_required';
  } else if (!first.conversations.length) {
    // 목록이 없으면 지금 화면을 대화 하나로 본다
    if (first.messages.length) out.conversations.push({ key: first.url, url: first.url, title: first.title || 'Muse', messages: first.messages });
    else out.status = 'nothing_found';
  } else {
    for (const c of first.conversations) {
      await page.goto(c.href, { timeout: 45000 });
      await page.waitForLoadState('load').catch(() => {});
      await page.waitForTimeout(1500);
      const s = await page.evaluate(pageScan, opts);
      if (s.login) { out.status = 'login_required'; break; }
      out.conversations.push({ key: c.href, url: c.href, title: c.title || s.title || 'Muse', messages: s.messages });
    }
  }
} catch (e) {
  out.status = 'error';
  out.error = String((e && e.message) || e).slice(0, 300);
}
if (task) { try { await task.finish({ keep: [] }); } catch { /* 이미 닫힘 */ } }
console.log(`AIHQ_JSON ${JSON.stringify(out)}`);
