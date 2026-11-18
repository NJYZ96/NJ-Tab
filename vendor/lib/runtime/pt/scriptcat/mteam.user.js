// ==UserScript==
// @name         每日签到-M-Team
// @namespace    nj.checkin
// @version      1.0.2
// @description  M-Team 趣味盒点赞投票（两个数字按钮：第一个是点赞、第二个是点踩；成功标志：点赞数+1且两个按钮都变不可点），结果写入共享账本。失败自动重试（原地→刷新，一天最多3次）；不在首页时后台打开首页完成
// @author       momo
// @match        *://kp.m-team.cc/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addValueChangeListener
// @storagename  nj-checkin
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';
  if (window.top !== window.self) return; // 只在最外层页面运行，避免在站内小框里重复运行
  const SITE = { id: 'mteam', name: 'M-Team', tasks: [{ id: 'funbox', name: '趣味盒点赞' }] };
  const HOME_URL = 'https://kp.m-team.cc/index';
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
  async function waitFor(fn, timeout, step) { timeout = timeout || 15000; step = step || 400; const t0 = Date.now(); while (Date.now() - t0 < timeout) { try { const v = fn(); if (v) return v; } catch (e) {} await sleep(step); } return null; }
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
  function isDisabled(el) { return el && (el.disabled || el.getAttribute('disabled') !== null || el.classList.contains('disabled')); }
  function nearFunbox(el) {
    let box = el;
    for (let i = 0; i < 8 && box; i++) { box = box.parentElement; if (box && (box.textContent || '').indexOf('趣味') >= 0) return true; }
    return false;
  }
  /* 投票按钮是两个“纯数字”按钮挨在一起：第一个点赞、第二个点踩（2026-11-19 实测确认） */
  function votePair(doc) {
    const nums = Array.from(doc.querySelectorAll('button')).filter(b => /^\d+$/.test((b.textContent || '').trim()));
    if (nums.length < 2) return null;
    for (let i = 0; i + 1 < nums.length; i++) {
      if (nearFunbox(nums[i])) return { like: nums[i], dislike: nums[i + 1] };
    }
    return { like: nums[0], dislike: nums[1] };
  }
  async function voteIn(doc) {
    const pair = await waitFor(() => votePair(doc), 15000);
    if (!pair) { rec('funbox', 'failed', '没找到趣味盒投票按钮（需要校准）'); return; }
    if (isDisabled(pair.like) && isDisabled(pair.dislike)) { rec('funbox', 'done', '两个投票按钮已是不可点，说明今天已投过'); return; }
    if (isDisabled(pair.like)) { rec('funbox', 'done', '点赞按钮已是不可点，说明今天已投过'); return; }
    const before = parseInt((pair.like.textContent || '').trim(), 10);
    rec('funbox', 'running', '点击点赞按钮（当前点赞数 ' + before + '）');
    await pause();
    pair.like.click();
    /* 点完卡片会整体刷新，按钮元素会被替换，所以每次都重新查 */
    const ok = await waitFor(() => {
      const p2 = votePair(doc);
      if (!p2) return false;
      const now = parseInt((p2.like.textContent || '').trim(), 10);
      if (isDisabled(p2.like) && isDisabled(p2.dislike)) return { now: now };
      if (!isNaN(before) && now === before + 1) return { now: now };
      return false;
    }, 15000);
    if (ok) rec('funbox', 'success', '点赞成功（点赞数 ' + before + '→' + ok.now + '，按钮已变不可点）');
    else rec('funbox', 'failed', '点完后按钮没有变成不可点，投票可能没成功');
  }
  async function doFunbox() {
    if (/\/index/.test(location.pathname) || location.pathname === '/' || location.pathname === '') { await voteIn(document); return; }
    const ifr = await openRemote(HOME_URL);
    try {
      const d = ifr.contentDocument;
      if (d) await voteIn(d); else rec('funbox', 'failed', '跨页打开首页失败');
    } finally { closeRemote(ifr); }
  }

  const runners = { funbox: doFunbox };
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
