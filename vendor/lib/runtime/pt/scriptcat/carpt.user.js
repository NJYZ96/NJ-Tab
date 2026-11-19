// ==UserScript==
// @name         每日签到-CarPT
// @namespace    nj.checkin
// @version      1.0.5
// @description  CarPT 天天快乐任务领取（24小时循环）：页面有任务进行状态就不领，没有就去任务页领取。签到是网站自动的，本脚本不管签到。失败自动重试（原地→刷新，一天最多3次）。结果写入共享账本
// @author       momo
// @match        *://carpt.net/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addValueChangeListener
// @storagename  nj-checkin
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';
  if (window.top !== window.self) return; // 只在最外层页面运行，避免在站内小框里重复运行
  const SITE = { id: 'carpt', name: 'CarPT-车站', tasks: [{ id: 'task', name: '天天快乐领取' }] };
  const TASK_URL = 'https://carpt.net/task.php';
  function tabId() { try { let t = sessionStorage.getItem('nj-tab-id'); if (!t) { t = Math.random().toString(36).slice(2); sessionStorage.setItem('nj-tab-id', t); } return t; } catch (e) { return 'x' + Math.random().toString(36).slice(2); } }
  const TAB = tabId();
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
  function pause() { return sleep(600 + Math.random() * 900); }
  function docText(doc) { return (doc && doc.body) ? (doc.body.innerText || '') : ''; }
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
  const ATT_URL = 'https://carpt.net/attendance.php';
  /* 签到天数：从页面文字读连续/累计，存共享区供面板在站名后显示 */
  function saveStreak(cont, total) { if (cont == null && total == null) return; const info = get('siteInfo', {}); const cur = info[SITE.id] || {}; if (cont != null) cur.cont = cont; if (total != null) cur.total = total; info[SITE.id] = cur; set('siteInfo', info); }
  function streakFromText(t) { if (!t) return; const cm = t.match(/连续签到\s*(\d+)\s*天/) || t.match(/已连续\s*(\d+)\s*天/) || t.match(/连续\s*(\d+)\s*天/) || t.match(/(\d+)\s*天\s*连续签到/); const tm = t.match(/累计签到\s*(\d+)\s*天/) || t.match(/累计\s*(\d+)\s*天/) || t.match(/第\s*(\d+)\s*次签到/) || t.match(/(\d+)\s*次\s*累计签到/); saveStreak(cm ? parseInt(cm[1], 10) : null, tm ? parseInt(tm[1], 10) : null); }
  async function fetchText(url) { try { const r = await fetch(url, { credentials: 'same-origin' }); const h = await r.text(); const dp = new DOMParser().parseFromString(h, 'text/html'); return dp.body ? (dp.body.textContent || '') : ''; } catch (e) { return ''; } }
  async function captureStreak() { try { streakFromText(await fetchText(ATT_URL)); } catch (e) {} }
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

  /* 任务进行状态（领取后页面上会出现）：含“天天快乐任务”“做种积分增量”“结果：”，并带起止时间 */
  function activeInfo(doc) {
    const t = docText(doc);
    if (t.indexOf('天天快乐任务') < 0 || t.indexOf('做种积分增量') < 0 || t.indexOf('结果：') < 0) return null;
    const m = t.match(/(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})\s*~\s*(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})/);
    return { until: m ? (m[3] + 'T' + m[4] + '+08:00') : null, untilText: m ? (m[3] + ' ' + m[4]) : '' };
  }
  function saveUntil(untilIso) { if (untilIso) set('carptTask', { until: untilIso }); }
  function taskRow(doc) {
    const rows = Array.from(doc.querySelectorAll('tr'));
    const tr = rows.find(r => (r.textContent || '').indexOf('天天快乐') >= 0);
    if (tr) return tr;
    const btns = Array.from(doc.querySelectorAll('a,button,[role="button"]')).filter(b => ['领取', '已经认领'].indexOf((b.textContent || '').trim()) >= 0);
    for (const b of btns) {
      let box = b;
      for (let i = 0; i < 6 && box; i++) { box = box.parentElement; if (box && (box.textContent || '').indexOf('天天快乐') >= 0) return box; }
    }
    return null;
  }
  async function claimIn(doc) {
    const info = activeInfo(doc);
    if (info) { saveUntil(info.until); rec('task', 'done', '任务：进行中（天天快乐，到期时间 ' + (info.untilText || '见页面') + '）'); return; }
    const row = await waitFor(() => taskRow(doc), 12000);
    if (!row) { rec('task', 'failed', '任务页没找到“天天快乐任务”这一行（需要校准）'); return; }
    const rowText = row.textContent || '';
    const claimedBtn = findBtn(row, ['已经认领']);
    if (claimedBtn) {
      const stored = get('carptTask', {});
      if (!stored.until) saveUntil(new Date(Date.now() + 24 * 3600 * 1000).toISOString());
      rec('task', 'done', '任务已认领（进行中）');
      return;
    }
    const btn = findBtn(row, ['领取']);
    if (!btn || btn.disabled) { rec('task', 'failed', '没找到可点的“领取”按钮（需要校准）'); return; }
    const cm = rowText.match(/(\d+)\s*\/\s*(\d+)/);
    if (cm && parseInt(cm[1], 10) >= parseInt(cm[2], 10)) { rec('task', 'waiting', '天天快乐名额已满（' + cm[1] + '/' + cm[2] + '），今天没领到'); return; }
    rec('task', 'running', '点击领取天天快乐');
    await pause();
    btn.click();
    /* 领取确认框：点“确定” */
    const confirmBtn = await waitFor(() => {
      if (docText(doc).indexOf('确定要认领吗') < 0) return null;
      return doc.querySelector('.layui-layer-btn0') || findBtn(doc, ['确定']);
    }, 6000);
    if (confirmBtn) { await pause(); confirmBtn.click(); }
    const ok = await waitFor(() => {
      const inf = activeInfo(doc);
      if (inf) { saveUntil(inf.until); return inf; }
      const r2 = taskRow(doc);
      if (r2 && findBtn(r2, ['已经认领'])) return { until: null };
      return null;
    }, 12000);
    if (ok) {
      if (!ok.until) saveUntil(new Date(Date.now() + 24 * 3600 * 1000).toISOString());
      rec('task', 'success', '已认领天天快乐，24小时内做种积分增量需达 240');
    } else rec('task', 'failed', '点领取后没看到认领成功的变化');
  }
  async function doTask() {
    const info = activeInfo(document);
    if (info) { saveUntil(info.until); rec('task', 'done', '任务：进行中（天天快乐，到期时间 ' + (info.untilText || '见页面') + '）'); return; }
    if (location.pathname.indexOf('task.php') >= 0) { await claimIn(document); return; }
    const ifr = await openRemote(TASK_URL);
    try {
      const d = ifr.contentDocument;
      if (d) await claimIn(d); else rec('task', 'failed', '跨页打开任务页失败');
    } finally { closeRemote(ifr); }
  }

  const runners = { task: doTask };
  async function run(task, force) {
    if (isPaused()) return;
    if (finished(task)) return; // 已成功/已完成的任务绝不重复执行（包括自动重试与手动重试触发时）
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
