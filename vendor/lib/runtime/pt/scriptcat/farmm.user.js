// ==UserScript==
// @name         每日签到-Farmm
// @namespace    nj.checkin
// @version      1.0.5
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
  const SITE = { id: 'farmm', name: 'Farmm-农场', tasks: [{ id: 'checkin', name: '滑块签到' }] };
  function tabId() { try { let t = sessionStorage.getItem('nj-tab-id'); if (!t) { t = Math.random().toString(36).slice(2); sessionStorage.setItem('nj-tab-id', t); } return t; } catch (e) { return 'x' + Math.random().toString(36).slice(2); } }
  const TAB = tabId(); // 同一标签刷新后保持不变（自动刷新重试靠它认领自己的锁）
  function bjDate(d) { d = d || new Date(); const b = new Date(d.getTime() + (d.getTimezoneOffset() + 480) * 60000); const p = n => String(n).padStart(2, '0'); return b.getFullYear() + '-' + p(b.getMonth() + 1) + '-' + p(b.getDate()); }
  function bjTime(d) { d = d || new Date(); const b = new Date(d.getTime() + (d.getTimezoneOffset() + 480) * 60000); const p = n => String(n).padStart(2, '0'); return p(b.getHours()) + ':' + p(b.getMinutes()) + ':' + p(b.getSeconds()); }
  function get(k, def) { try { const v = GM_getValue(k); return v === undefined ? def : v; } catch (e) { return def; } }
  function set(k, v) { try { GM_setValue(k, v); } catch (e) {} }
  function rec(task, status, detail) { const L = get('ledger', {}); const day = bjDate(); if (!L[day]) L[day] = {}; if (!L[day][SITE.id]) L[day][SITE.id] = {}; const cur = L[day][SITE.id][task]; /* 写前复查：今天已是完成态（成功/已完成/无需投票）的记录，不许被未完成状态盖掉——防旧流程或重复运行把好记录冲成失败 */ if (cur && (cur.status === 'success' || cur.status === 'done' || cur.status === 'novote') && status !== 'success' && status !== 'done' && status !== 'novote') return; L[day][SITE.id][task] = { status: status, time: bjTime(), detail: detail || '' }; set('ledger', L); }
  function todayRec(task) { const L = get('ledger', {}); const d = L[bjDate()] || {}; const s = d[SITE.id] || {}; return s[task] || null; }
  function register() { const r = get('registry', {}); r[SITE.id] = { name: SITE.name, tasks: SITE.tasks, version: (typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version) || '' }; set('registry', r); }
  function isPaused() { return !!get('paused', {})[SITE.id]; }
  function claim() { const locks = get('locks', {}); const cur = locks[SITE.id]; const now = Date.now(); if (cur && now - cur.ts < 600000 && cur.owner !== TAB) return false; locks[SITE.id] = { ts: now, owner: TAB }; set('locks', locks); return true; }
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  async function waitFor(fn, timeout, step) { timeout = timeout || 12000; step = step || 500; const t0 = Date.now(); while (Date.now() - t0 < timeout) { try { const v = await fn(); if (v) return v; } catch (e) {} await sleep(step); } return null; }
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
  function firePointer(el, type, x, y) {
    try { el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', isPrimary: true, buttons: type === 'pointerup' ? 0 : 1, view: window })); } catch (e) {}
  }
  async function dragOnce(handle, box) {
    const hr = handle.getBoundingClientRect();
    const br = box.getBoundingClientRect();
    const startX = hr.left + hr.width / 2;
    const startY = hr.top + hr.height / 2;
    const endX = br.right - hr.width / 2 - 2;
    firePointer(handle, 'pointerdown', startX, startY);
    fireMouse(handle, 'mousedown', startX, startY);
    const steps = 16 + Math.floor(Math.random() * 6);
    for (let i = 1; i <= steps; i++) {
      const p = i / steps;
      const ease = 1 - Math.pow(1 - p, 2); // 先快后慢，接近真人
      const x = startX + (endX - startX) * ease;
      const y = startY + (Math.random() * 4 - 2);
      firePointer(document, 'pointermove', x, y);
      fireMouse(document, 'mousemove', x, y);
      await sleep(20 + Math.random() * 30);
    }
    await sleep(250 + Math.random() * 200); // 到头后稍停一下再松手
    firePointer(document, 'pointerup', endX, startY);
    fireMouse(document, 'mouseup', endX, startY);
    firePointer(handle, 'pointerup', endX, startY);
    fireMouse(handle, 'mouseup', endX, startY);
  }

  const ATT_URL = 'https://pt.0ff.cc/attendance.php';
  /* 签到天数：从页面文字读连续/累计，存共享区供面板在站名后显示 */
  function saveStreak(cont, total) { if (cont == null && total == null) return; const info = get('siteInfo', {}); const cur = info[SITE.id] || {}; if (cont != null) cur.cont = cont; if (total != null) cur.total = total; info[SITE.id] = cur; set('siteInfo', info); }
  function streakFromText(t) { if (!t) return; const cm = t.match(/连续签到\s*(\d+)\s*天/) || t.match(/已连续\s*(\d+)\s*天/) || t.match(/连续\s*(\d+)\s*天/) || t.match(/(\d+)\s*天\s*连续签到/); const tm = t.match(/累计签到\s*(\d+)\s*天/) || t.match(/累计\s*(\d+)\s*天/) || t.match(/第\s*(\d+)\s*次签到/) || t.match(/(\d+)\s*次\s*累计签到/); saveStreak(cm ? parseInt(cm[1], 10) : null, tm ? parseInt(tm[1], 10) : null); }
  async function fetchText(url) { try { const r = await fetch(url, { credentials: 'same-origin' }); const h = await r.text(); const dp = new DOMParser().parseFromString(h, 'text/html'); return dp.body ? (dp.body.textContent || '') : ''; } catch (e) { return ''; } }
  async function captureStreak() { try { streakFromText(await fetchText(ATT_URL)); } catch (e) {} }

  /* 已签到页的可靠标志：有“签到成功”且滑块已经不在了。
     教训（2026-11-19）：未签到时页面里也藏着“签到成功”字样，只看文字会误判成功，其实根本没拖。 */
  function isSignedPage() {
    const t = pageText();
    if (t.indexOf('签到成功') < 0) return false;
    if (t.indexOf('拖动滑块验证') >= 0) return false;
    return !findSlider();
  }
  function signedDetail() {
    const t = pageText();
    const m = t.match(/\+([\d,]+)\s*魔力值\s*本次获得/);
    return m ? ('获得 ' + m[1] + ' 魔力') : '';
  }
  async function doCheckin() {
    if (isSignedPage()) { streakFromText(pageText()); rec('checkin', 'success', signedDetail()); return; }
    const text = pageText();
    if (/拼图|点选|点击图片|短信/.test(text)) {
      rec('checkin', 'manual', '验证形式变了（出现拼图/点选/短信字样），脚本不尝试，请手动完成');
      try { GM_notification({ title: 'Farmm 需要手动', text: '签到验证形式变了，请打开签到页手动完成。', timeout: 15000 }); } catch (e) {}
      return;
    }
    const drags = get('farmmDrags', {});
    const used = drags[bjDate()] || 0;
    if (used >= 3) {
      rec('checkin', 'manual', '今天已自动拖了3次仍没跳转成功，已停手，请打开签到页手动拖一下');
      try { GM_notification({ title: 'Farmm 需要手动', text: '滑块自动拖了3次没过，请打开签到页手动拖一下就签完到了。', timeout: 15000 }); } catch (e) {}
      return;
    }
    const found = await waitFor(() => findSlider(), 10000);
    if (!found) { rec('checkin', 'failed', '没找到滑块（页面结构可能变了，需要校准）'); return; }
    drags[bjDate()] = used + 1;
    set('farmmDrags', drags);
    rec('checkin', 'running', '第 ' + (used + 1) + ' 次拖动滑块（今天最多3次）');
    await dragOnce(found.handle, found.box);
    /* 验证通过后页面会自己跳转到签到成功页（实测约10秒内），最多等15秒 */
    const ok = await waitFor(() => isSignedPage(), 15000, 500);
    if (ok) { streakFromText(pageText()); rec('checkin', 'success', signedDetail()); return; }
    if (used + 1 < 3) {
      rec('checkin', 'waiting', '第 ' + (used + 1) + ' 次拖动后页面没跳转，刷新页面再确认');
      try { location.reload(); } catch (e) {}
      return;
    }
    rec('checkin', 'manual', '滑块拖了3次都没跳转到签到成功页，已停手，请打开签到页手动拖一下');
    try { GM_notification({ title: 'Farmm 需要手动', text: '滑块自动拖了3次没过，请打开签到页手动拖一下就签完到了。', timeout: 15000 }); } catch (e) {}
  }

  const runners = { checkin: doCheckin };
  async function run(task, force) {
    if (isPaused()) return;
    if (finished(task)) return; // 已成功/已完成的任务绝不重复执行（包括自动重试与手动重试触发时）
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
    captureStreak();
  }
  try {
    let lastRetryTs = 0;
    GM_addValueChangeListener('retryReq', function (name, oldV, newV) {
      const req = newV && newV[SITE.id];
      if (req && req.ts > lastRetryTs && Date.now() - req.ts < 300000 && runners[req.task]) {
        lastRetryTs = req.ts;
        /* 先落“今天重试过”章再执行，并删掉自己的请求条目：防任何后续存储变化把它重复触发（重复执行可能被网站限流） */
        const rd = get('retryDone', {}); const dd = bjDate(); if (!rd[dd]) rd[dd] = {}; rd[dd][SITE.id + '/' + req.task] = 1; set('retryDone', rd);
        const rq = get('retryReq', {}); delete rq[SITE.id]; set('retryReq', rq);
        resetAttempts(req.task); run(req.task, true);
      }
    });
  } catch (e) {}
  main();
})();
