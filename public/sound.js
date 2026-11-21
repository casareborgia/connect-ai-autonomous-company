// CONNECT AI LAB · 시그니처 효과음 엔진 (Web Audio API, 외부 파일·의존성 0)
// 조용하고 세련된 갤러리 감성 하모닉 차임 (연결/착수 · 완료 · 자동 인계 · 결재 낙관 · 주의 · 탭)
(function () {
  'use strict';

  const KEY = 'aihq_sound';
  let ctx = null;

  function enabled() {
    try { return localStorage.getItem(KEY) !== '0'; } catch { return true; }
  }
  function setEnabled(on) {
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* ignore */ }
    return enabled();
  }
  function ensureCtx() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) ctx = new AC();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  // 첫 사용자 상호작용 시 오디오 컨텍스트 자동 활성화
  const unlock = () => { if (enabled()) ensureCtx(); };
  window.addEventListener('pointerdown', unlock, { once: true, passive: true });
  window.addEventListener('keydown', unlock, { once: true, passive: true });

  function tone(c, { freq, start, dur, vol = 0.08, type = 'sine', endFreq = null }) {
    const t0 = c.currentTime + start;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + Math.min(0.014, dur * 0.25));
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function play(kind = 'connect', { force = false } = {}) {
    if (!force && !enabled()) return false;
    const c = ensureCtx();
    if (!c) return false;
    try {
      if (kind === 'connect') {
        // 연결 · AI 착수: 맑은 상승 5도 하모닉 (C5 → G5)
        tone(c, { freq: 523.25, start: 0, dur: 0.16, vol: 0.075, type: 'sine' });
        tone(c, { freq: 1046.5, start: 0, dur: 0.12, vol: 0.02, type: 'triangle' });
        tone(c, { freq: 783.99, start: 0.085, dur: 0.26, vol: 0.08, type: 'sine' });
        tone(c, { freq: 1567.98, start: 0.085, dur: 0.18, vol: 0.018, type: 'triangle' });
      } else if (kind === 'done') {
        // 완료 · 결과물 도착: 은은한 종소리 4화음 (C5 → E5 → G5 → C6)
        tone(c, { freq: 523.25, start: 0, dur: 0.18, vol: 0.065, type: 'sine' });
        tone(c, { freq: 659.25, start: 0.07, dur: 0.2, vol: 0.065, type: 'sine' });
        tone(c, { freq: 783.99, start: 0.14, dur: 0.24, vol: 0.07, type: 'sine' });
        tone(c, { freq: 1046.5, start: 0.21, dur: 0.42, vol: 0.08, type: 'sine' });
        tone(c, { freq: 2093.0, start: 0.21, dur: 0.22, vol: 0.015, type: 'triangle' });
      } else if (kind === 'handoff') {
        // 자동 인계: 부드러운 바통 터치 리듬 (A4 → D5 → E5)
        tone(c, { freq: 440, start: 0, dur: 0.12, vol: 0.06, type: 'triangle' });
        tone(c, { freq: 587.33, start: 0.09, dur: 0.14, vol: 0.07, type: 'sine' });
        tone(c, { freq: 659.25, start: 0.18, dur: 0.24, vol: 0.075, type: 'sine' });
      } else if (kind === 'approve') {
        // 결재 · 印 낙관 승인: 묵직한 도장 쿵 + 맑은 확인음
        tone(c, { freq: 165, endFreq: 58, start: 0, dur: 0.065, vol: 0.11, type: 'triangle' });
        tone(c, { freq: 880, start: 0.055, dur: 0.28, vol: 0.07, type: 'sine' });
        tone(c, { freq: 1318.5, start: 0.095, dur: 0.28, vol: 0.045, type: 'sine' });
      } else if (kind === 'alert') {
        // 결재 요청 · 확인 필요: 차분한 2음 알림 (F5 → D5)
        tone(c, { freq: 698.46, start: 0, dur: 0.18, vol: 0.065, type: 'sine' });
        tone(c, { freq: 587.33, start: 0.14, dur: 0.28, vol: 0.065, type: 'sine' });
      } else {
        // tick: 할 일 추가 · 가벼운 탭
        tone(c, { freq: 620, endFreq: 740, start: 0, dur: 0.048, vol: 0.04, type: 'sine' });
      }
      return true;
    } catch {
      return false;
    }
  }

  window.HQSound = { enabled, setEnabled, play };
})();
