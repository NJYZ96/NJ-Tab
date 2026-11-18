// ==UserScript==
// @name         每日签到-Farmm
// @namespace    nj.checkin
// @version      1.0.0
// @description  Farmm 滑块签到：脚本先按真人节奏试拖最多3次，过不了记“需要手动”并通知。结果写入共享账本
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
  const SITE = { id: 'farmm', name: 'Farmm', tasks: [{ id: 'checkin', name: '滑块签到' }] };
  const TAB = Math.random().toString(36).slice(2);
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

  function findSlider() {
    const label = Array.from(document.querySelectorAll('div,span,p')).find(el => (el.textContent || '').trim() === '拖动滑块验证');
    if (!label) return null;
    let box = label;
    for (let i = 0; i < 4 && box.parentElement; i++) {
      box = box.parentElement;
      const handle = box.querySelector('[class*="btn"],[class*="handle"],[class*="block"],[id*="btn"],[id*="handle"]');
      if (handle && handle !== label) return { box: box, handle: handle };
      const kids = Array.from(box.children).filter(c => c !== label && c.offsetWidth > 0 && c.offsetWidth < 80);
      if (kids.length) return { box: box, handle: kids[0] };
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
      if (pageText().indexOf('签到成功') >= 0 || !document.contains(found.handle)) {
        if (pageText().indexOf('签到成功') >= 0) { rec('checkin', 'success', '第 ' + i + ' 次拖动通过，页面显示签到成功'); return; }
      }
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
    if (!claim()) return;
    try { await runners[task](); } catch (e) { rec(task, 'failed', '脚本出错：' + (e && e.message ? e.message : e)); }
  }
  async function main() {
    register();
    if (isPaused()) return;
    for (const t of SITE.tasks) await run(t.id, false);
  }
  try {
    GM_addValueChangeListener('retryReq', function (name, oldV, newV) {
      const req = newV && newV[SITE.id];
      if (req && Date.now() - req.ts < 300000 && runners[req.task]) run(req.task, true);
    });
  } catch (e) {}
  main();
})();
