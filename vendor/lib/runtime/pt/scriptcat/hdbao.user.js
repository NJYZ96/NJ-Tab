// ==UserScript==
// @name         每日签到-HDBao
// @namespace    nj.checkin
// @version      1.0.2
// @description  HDBao 签到（隐藏框打开签到页点立即签到）+ 趣味盒投票。本站任意页打开都会补做。失败自动重试（原地→刷新，一天最多3次）。结果写入共享账本
// @author       momo
// @match        *://hdbao.cc/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addValueChangeListener
// @storagename  nj-checkin
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';
  if (window.top !== window.self) return; // 只在最外层页面运行，避免在站内小框里重复运行
  const SITE = { id: 'hdbao', name: 'HDBao', tasks: [{ id: 'checkin', name: '每日签到' }, { id: 'funbox', name: '趣味盒投票' }] };
  const HOME_URL = 'https://hdbao.cc/index.php';
  function tabId() { try { let t = sessionStorage.getItem('nj-tab-id'); if (!t) { t = Math.random().toString(36).slice(2); sessionStorage.setItem('nj-tab-id', t); } return t; } catch (e) { return 'x' + Math.random().toString(36).slice(2); } }
  const TAB = tabId();
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
  function pause() { return sleep(600 + Math.random() * 900); }
  function docText(doc) { return (doc && doc.body) ? (doc.body.innerText || '') : ''; }
  function pageText() { return docText(document); }
  function findBtn(root, texts) {
    const els = root.querySelectorAll('a,button,input[type="button"],input[type="submit"],[role="button"]');
    for (const el of els) { const t = (el.textContent || el.value || '').trim(); if (texts.indexOf(t) >= 0) return el; }
    const hits = Array.from(root.querySelectorAll('div,span,li')).filter(el => texts.indexOf((el.textContent || '').trim()) >= 0 && el.offsetWidth > 0 && el.offsetWidth < 400);
    hits.sort((a, b) => (a.offsetWidth * a.offsetHeight) - (b.offsetWidth * b.offsetHeight));
    return hits[0] || null;
  }
  async function waitFor(fn, timeout, step) { timeout = timeout || 12000; step = step || 400; const t0 = Date.now(); while (Date.now() - t0 < timeout) { try { const v = fn(); if (v) return v; } catch (e) {} await sleep(step); } return null; }
  function finished(task) { const r = todayRec(task); return r && (r.status === 'success' || r.status === 'done'); }
  function attempts(task) { const a = get('attempts', {}); const d = a[bjDate()] || {}; const s = d[SITE.id] || {}; return s[task] || 0; }
  function bumpAttempt(task) { const a = get('attempts', {}); const day = bjDate(); if (!a[day]) a[day] = {}; if (!a[day][SITE.id]) a[day][SITE.id] = {}; a[day][SITE.id][task] = (a[day][SITE.id][task] || 0) + 1; set('attempts', a); return a[day][SITE.id][task]; }
  function resetAttempts(task) { const a = get('attempts', {}); const day = bjDate(); if (a[day] && a[day][SITE.id]) { a[day][SITE.id][task] = 0; set('attempts', a); } }
  function openRemote(url) {
    return new Promise(resolve => {
      const ifr = document.createElement('iframe');
      ifr.style.cssText = 'position:fixed;left:-9999px;top:0;width:1280px;height:900px;visibility:hidden;border:0;';
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(ifr); } };
      ifr.addEventListener('load', () => setTimeout(finish, 900));
      setTimeout(finish, 20000);
      ifr.src = url;
      document.body.appendChild(ifr);
    });
  }
  function closeRemote(ifr) { try { ifr.remove(); } catch (e) {} }

  async function doCheckin() {
    if (pageText().indexOf('[签到已得') >= 0) { rec('checkin', 'done', '页面顶部已显示“[签到已得”，今天已签到'); return; }
    /* 人正在签到页上就直接在本页点 */
    if (location.pathname.indexOf('attendance') >= 0) {
      if (pageText().indexOf('签到成功') >= 0) { rec('checkin', 'done', '签到页显示签到成功，今天已签到'); return; }
      const selfBtn = findBtn(document, ['立即签到']);
      if (selfBtn) {
        rec('checkin', 'running', '在签到页点击立即签到');
        await pause();
        selfBtn.click();
        const okSelf = await waitFor(() => pageText().indexOf('签到成功') >= 0, 15000);
        if (okSelf) { rec('checkin', 'success', '点“立即签到”后页面显示签到成功'); return; }
        rec('checkin', 'failed', '点完后没看到签到成功字样');
        return;
      }
    }
    rec('checkin', 'running', '打开签到页签到');
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:absolute;width:10px;height:10px;left:-9999px;top:-9999px;';
    frame.src = '/attendance.php';
    document.body.appendChild(frame);
    try {
      const doc = await waitFor(() => {
        try { const d = frame.contentDocument; return d && d.body && docText(d).length > 0 ? d : null; } catch (e) { return null; }
      }, 15000);
      if (!doc) { rec('checkin', 'failed', '签到页打不开'); return; }
      if (docText(doc).indexOf('签到成功') >= 0) { rec('checkin', 'done', '签到页显示签到成功，今天已签到'); return; }
      const btn = findBtn(doc, ['立即签到']);
      if (!btn) { rec('checkin', 'failed', '签到页没找到“立即签到”按钮'); return; }
      await pause();
      btn.click();
      const ok = await waitFor(() => {
        try { return docText(frame.contentDocument).indexOf('签到成功') >= 0; } catch (e) { return false; }
      }, 15000);
      if (ok) rec('checkin', 'success', '点“立即签到”后签到页显示签到成功');
      else rec('checkin', 'failed', '点完后没看到签到成功字样');
    } finally {
      setTimeout(() => { try { frame.remove(); } catch (e) {} }, 1000);
    }
  }

  function funboxDocIn(rootDoc) {
    const frames = rootDoc.querySelectorAll('iframe');
    for (const f of frames) {
      try { const d = f.contentDocument; if (d && docText(d).indexOf('趣味') >= 0) return d; } catch (e) {}
    }
    return null;
  }
  async function funboxIn(doc) {
    // 同类站点实测（BTSCHOOL，2026-11-19）：投票按钮在主页面里，不在趣味盒小框内，先找主页面
    let btn = await waitFor(() => findBtn(doc, ['有趣']), 12000);
    if (!btn) {
      const inner = funboxDocIn(doc);
      if (inner) btn = findBtn(inner, ['有趣']);
    }
    if (!btn) {
      if (docText(doc).indexOf('认为它有趣') >= 0) { rec('funbox', 'done', '趣味盒没有投票按钮，说明已投过'); return; }
      rec('funbox', 'failed', '没找到趣味盒投票按钮');
      return;
    }
    rec('funbox', 'running', '点击有趣');
    await pause();
    btn.click();
    const ok = await waitFor(() => !findBtn(doc, ['有趣']) || docText(doc).indexOf('谢谢！你的投票已提交') >= 0 || docText(doc).indexOf('你觉得呢') < 0, 12000);
    if (ok) rec('funbox', 'success', '点“有趣”后按钮消失/出现谢谢提示');
    else rec('funbox', 'failed', '点完后按钮还在，投票可能没成功');
  }
  async function doFunbox() {
    const p = location.pathname;
    if (p === '/' || p.indexOf('index.php') >= 0) { await funboxIn(document); return; }
    const ifr = await openRemote(HOME_URL);
    try {
      const d = ifr.contentDocument;
      if (d) await funboxIn(d); else rec('funbox', 'failed', '跨页打开首页失败');
    } finally { closeRemote(ifr); }
  }

  const runners = { checkin: doCheckin, funbox: doFunbox };
  async function run(task, force) {
    if (isPaused()) return;
    if (!force && finished(task)) return;
    if (!force && attempts(task) >= 3) return;
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
