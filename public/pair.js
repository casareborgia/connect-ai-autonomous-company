'use strict';
// 폰 연결: 맥 화면에 뜬 6자리 코드를 한 번 넣는다
document.getElementById('pair-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('msg');
  const code = document.getElementById('code').value.replace(/\s/g, '');
  if (!/^\d{6}$/.test(code)) { msg.textContent = '숫자 6자리를 넣어 주세요.'; return; }
  msg.textContent = '확인하는 중';
  try {
    const r = await fetch('/api/pair', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-HQ-UI': '1' }, body: JSON.stringify({ code }) });
    const j = await r.json().catch(() => ({}));
    if (r.ok) { msg.textContent = '연결했어요. 본사를 엽니다.'; location.href = '/'; } else msg.textContent = j.error || '연결하지 못했어요.';
  } catch {
    msg.textContent = '맥에 닿지 않아요. 같은 와이파이인지 확인해 주세요.';
  }
});
