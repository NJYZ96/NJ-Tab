// ==UserScript==
// @name         每日签到-Farmm
// @namespace    nj.checkin
// @version      1.0.2
// @description  Farmm 滑块签到：脚本先按真人节奏试拖最多3次，过不了记“需要手动”并通知。失败自动重试（原地→刷新，一天最多3次）。结果写入共享账本
// @author       momo
// @match        *://pt.0ff.cc/attendance.php*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addValueChangeListener
// @grant        GM_notification
// @storagename  nj-checkin
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';
  if (window.top !== window.self) return; // 只在最外层页面运行，避免在站内小框里重复运行
  const SITE = { id: 'farmm', name: 'Farmm', tasks: [{ id: 'checkin', name: '滑块签到' }] };
  function tabId() { try { let t = sessionStorage.getItem('nj-tab-id'); if (!t) { t = Math.random().toString(36).slice(2); sessionStorage.setItem('nj-tab-id', t); } return t; } catch (e) { return 'x' + Math.random().toString(36).slice(2); } }
  const TAB = tabId(); // 同一标签刷新后保持不变（自动刷新重试靠它认领自己的锁）
  function bjDate(d) { d = d || new Date(); const b = new Date(d.getTime() + (d.getTimezoneOffset() + 480) * 60000); const p = n => String(n).padStart(2, '0'); return b.getFullYear() + '-' + p(b.getMonth() + 1) + '-' + p(b.getDate()); }
  function bjTime(d) { d = d || new Date(); const b = new Date(d.getTime() + (d.getTimezoneOffset() + 480) * 60000); const p = n => String(n).padStart(2, '0'); return p(b.getHours()) + ':' + p(b.getMinutes()) + ':' + p(b.getSeconds()); }
  function get(k, def) { try { const v = GM_getValue(k); return v === undefined ? def : v; } catch (e) { return def; } }
  function set(k, v) { try { GM_setValue(k, v); } catch (e) {} }
  function rec(task, status, detail) { const L = get('ledger', {}); const day = bjDate(); if (!L[day]) L[day] = {}; if (!L[day][SITE.id]) L[day][SITE.id] = {}; L[day][SITE.id][task] = { status: status, time: bjTime(), detail: detail || '' }; set('ledger', L); }
  function todayRec(task) { const L = get('ledger', {}); const d = L[bjDate()] || {}; const s = d[SITE.id] || {}; return s[task] || null; }
  function register() { const r = get('registry', {}); r[SITE.id] = { name: SITE.name, tasks: SITE.tasks }; set('registry', r); }
  function isPaused() { return !!get('paused', {})[SITE.id]; }
  function claim() { const locks = get('locks', {}); const cur = locks[SITE.id]; const now = Date.now(); if (cur && now - cur.ts < 600000 && cur.owner !== TAB) return false; locks[SITE.id] = { ts: now, owner: TAB }; set('locks', locks); return true; }
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  function pageText() { return document.body ? (document.body.innerText || '') : ''; }
  function finished(task) { const r = todayRec(task); return r && (r.status === 'success' || r.status === 'done'); }
  /* 失败自动重试：一天最多 3 次（第一次失败原地重试，第二次失败刷新页面重试），次数记账跨刷新不清零 */
  function attempts(task) { const a = get('attempts', {}); const d = a[bjDate()] || {}; const s = d[SITE.id] || {}; return s[task] || 0; }
  function bumpAttempt(task) { const a = get('attempts', {}); const day = bjDate(); if (!a[day]) a[day] = {}; if (!a[day][SITE.id]) a[day][SITE.id] = {}; a[day][SITE.id][task] = (a[day][SITE.id][task] || 0) + 1; set('attempts', a); return a[day][SITE.id][task]; }
  function resetAttempts(task) { const a = get('attempts', {}); const day = bjDate(); if (a[day] && a[day][SITE.id]) { a[day][SITE.id][task] = 0; set('attempts', a); } }

  function findSlider() {
    // 主找法（2026-11-19 实测校准）：手柄就是显示“»”的小方块（约39×38），轨道是它上方明显更宽的容器
    const cands = Array.from(document.querySelectorAll('div,span,a,button,p')).filter(el => (el.textContent || '').trim() === '»' && el.offsetWidth >= 10 && el.offsetWidth <= 90 && el.offsetHeight >= 10 && el.offsetHeight <= 90);
    cands.sort((a, b) => (a.offsetWidth * a.offsetHeight) - (b.offsetWidth * b.offsetHeight));
    const handle = cands[0];
    if (handle) {
      let box = handle.parentElement;
      while (box && box !== document.body && box.offsetWidth < handle.offsetWidth * 3) box = box.parentElement;
      if (box && box.offsetWidth >= handle.offsetWidth * 3) return { box: box, handle: handle };
      if (handle.parentElement) return { box: handle.parentElement, handle: handle };
    }
    // 兜底找法：顺着“拖动滑块验证”文字往上找
    const label = Array.from(document.querySelectorAll('div,span,p')).find(el => (el.textContent || '').trim() === '拖动滑块验证');
    if (!label) return null;
    let box2 = label;
    for (let i = 0; i < 4 && box2.parentElement; i++) {
      box2 = box2.parentElement;
      const h = box2.querySelector('[class*="btn"],[class*="handle"],[class*="block"],[id*="btn"],[id*="handle"]');
      if (h && h !== label) return { box: box2, handle: h };
      const kids = Array.from(box2.children).filter(c => c !== label && c.offsetWidth > 0 && c.offsetWidth < 80);
      if (kids.length) return { box: box2, handle: kids[0] };
    }
    return null;
  }
  function fireMouse(el, type, x, y) {
    el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window }));
  }
  async function dragOnce(handle, box) {
    const hr = handle.getBoundingClientRect();
    const br = box.getBoundingClientRect();
    const startX = hr.left + hr.width / 2;
    const startY = hr.top + hr.height / 2;
    const endX = br.right - hr.width / 2 - 2;
    fireMouse(handle, 'mousedown', startX, startY);
    const steps = 14 + Math.floor(Math.random() * 6);
    for (let i = 1; i <= steps; i++) {
      const x = startX + (endX - startX) * (i / steps);
      fireMouse(document, 'mousemove', x, startY + (Math.random() * 4 - 2));
      await sleep(30 + Math.random() * 50);
    }
    fireMouse(document, 'mouseup', endX, startY);
  }

  async function doCheckin() {
    if (pageText().indexOf('签到成功') >= 0) { rec('checkin', 'success', '页面显示“签到成功”'); return; }
    const text = pageText();
    if (/拼图|点选|点击图片|短信/.test(text)) {
      rec('checkin', 'manual', '验证形式变了（出现拼图/点选/短信字样），脚本不尝试，请手动完成');
      try { GM_notification({ title: 'Farmm 需要手动', text: '签到验证形式变了，请打开签到页手动完成。', timeout: 15000 }); } catch (e) {}
      return;
    }
    const found = findSlider();
    if (!found) { rec('checkin', 'failed', '没找到滑块（页面结构可能变了，需要校准）'); return; }
    for (let i = 1; i <= 3; i++) {
      rec('checkin', 'running', '第 ' + i + ' 次尝试拖动滑块');
      await dragOnce(found.handle, found.box);
      await sleep(1800);
      if (pageText().indexOf('签到成功') >= 0) { rec('checkin', 'success', '第 ' + i + ' 次拖动通过，页面显示签到成功'); return; }
      const again = findSlider();
      if (again) { found.handle = again.handle; found.box = again.box; }
    }
    rec('checkin', 'manual', '滑块试了3次没过，已停手，请打开签到页手动拖一下');
    try { GM_notification({ title: 'Farmm 需要手动', text: '滑块试了3次没过，请打开签到页手动拖一下就签完到了。', timeout: 15000 }); } catch (e) {}
  }

  const runners = { checkin: doCheckin };
  async function run(task, force) {
    if (isPaused()) return;
    if (!force && finished(task)) return;
    if (!force && attempts(task) >= 3) return; // 今天已试满3次，面板手动重试可重置后再跑
    if (!claim()) return;
    const n = bumpAttempt(task);
    try { await runners[task](); } catch (e) { rec(task, 'failed', '脚本出错：' + (e && e.message ? e.message : e)); }
    const r = todayRec(task);
    if (r && r.status === 'failed' && n < 3) {
      if (n === 1) setTimeout(() => run(task, true), 20000 + Math.random() * 15000);
      else setTimeout(() => { try { location.reload(); } catch (e) {} }, 15000 + Math.random() * 15000);
    }
  }
  async function main() {
    register();
    if (isPaused()) return;
    for (const t of SITE.tasks) await run(t.id, false);
  }
  try {
    GM_addValueChangeListener('retryReq', function (name, oldV, newV) {
      const req = newV && newV[SITE.id];
      if (req && Date.now() - req.ts < 300000 && runners[req.task]) { resetAttempts(req.task); run(req.task, true); }
    });
  } catch (e) {}
  main();
})();
