// ==UserScript==
// @name         每日签到-BTSCHOOL
// @namespace    nj.checkin
// @version      1.0.6
// @description  BTSCHOOL 每日签到 + 趣味盒投票。本站任意页打开都会补做。失败自动重试（原地→刷新，一天最多3次）。结果写入共享账本（总面板可看）
// @author       momo
// @match        *://pt.btschool.club/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addValueChangeListener
// @storagename  nj-checkin
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';
  if (window.top !== window.self) return; // 只在最外层页面运行，避免在站内小框里重复运行
  const SITE = { id: 'btschool', name: 'BTSCHOOL-学校', tasks: [{ id: 'checkin', name: '每日签到' }, { id: 'funbox', name: '趣味盒投票' }] };
  const HOME_URL = 'https://pt.btschool.club/index.php';
  function tabId() { try { let t = sessionStorage.getItem('nj-tab-id'); if (!t) { t = Math.random().toString(36).slice(2); sessionStorage.setItem('nj-tab-id', t); } return t; } catch (e) { return 'x' + Math.random().toString(36).slice(2); } }
  const TAB = tabId();
  function bjDate(d) { d = d || new Date(); const b = new Date(d.getTime() + (d.getTimezoneOffset() + 480) * 60000); const p = n => String(n).padStart(2, '0'); return b.getFullYear() + '-' + p(b.getMonth() + 1) + '-' + p(b.getDate()); }
  function bjTime(d) { d = d || new Date(); const b = new Date(d.getTime() + (d.getTimezoneOffset() + 480) * 60000); const p = n => String(n).padStart(2, '0'); return p(b.getHours()) + ':' + p(b.getMinutes()) + ':' + p(b.getSeconds()); }
  function get(k, def) { try { const v = GM_getValue(k); return v === undefined ? def : v; } catch (e) { return def; } }
  function set(k, v) { try { GM_setValue(k, v); } catch (e) {} }
  function rec(task, status, detail) {
    const day = bjDate();
    const mine = { status: status, time: bjTime(), detail: detail || '' };
    const writeMine = () => {
      const L = get('ledger', {});
      if (!L[day]) L[day] = {};
      if (!L[day][SITE.id]) L[day][SITE.id] = {};
      const cur = L[day][SITE.id][task];
      /* 写前复查：今天已是完成态（成功/已完成/无需投票）的记录，不许被未完成状态盖掉——防旧流程或重复运行把好记录冲成失败 */
      if (cur && (cur.status === 'success' || cur.status === 'done' || cur.status === 'novote') && mine.status !== 'success' && mine.status !== 'done' && mine.status !== 'novote') return false;
      L[day][SITE.id][task] = mine;
      set('ledger', L);
      return true;
    };
    if (!writeMine()) return;
    /* 写后核对：批量打开时别的脚本可能拿旧账本整份覆盖、把刚写的记录冲掉。
       隔一小会儿重读：记录不见了、或被更早时间的旧记录顶替了，就补写回来，最多 2 轮。 */
    let rounds = 0;
    const verify = () => {
      const L = get('ledger', {});
      const cur = L[day] && L[day][SITE.id] && L[day][SITE.id][task];
      const done = cur && (cur.status === 'success' || cur.status === 'done' || cur.status === 'novote');
      if (!cur || (!done && cur.time < mine.time)) { if (writeMine() && ++rounds < 2) setTimeout(verify, 600 + Math.random() * 800); }
    };
    setTimeout(verify, 500 + Math.random() * 700);
  }
  function todayRec(task) { const L = get('ledger', {}); const d = L[bjDate()] || {}; const s = d[SITE.id] || {}; return s[task] || null; }
  function register() {
    const entry = { name: SITE.name, tasks: SITE.tasks, version: (typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version) || '' };
    const merge = () => { const r = get('registry', {}); r[SITE.id] = entry; set('registry', r); };
    merge();
    /* 写后核对：批量打开时多个脚本会在同一瞬间写登记表、互相把对方的登记冲掉。
       隔一小会儿重读，自己的登记不在了就合并补写（只加自己的、不动别人的），最多 3 轮。 */
    let rounds = 0;
    const verify = () => {
      const cur = get('registry', {});
      if (!cur[SITE.id]) { merge(); if (++rounds < 3) setTimeout(verify, 500 + Math.random() * 700); }
    };
    setTimeout(verify, 400 + Math.random() * 600);
  }
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
  const ATT_URL = 'https://pt.btschool.club/attendance.php';
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

  function rewardDetail(t) { const m = (t || '').match(/获得\s*([\d,]+)\s*点?魔力/); return m ? '获得 ' + m[1] + ' 魔力' : ''; }
  function signBtn(doc) { return doc.querySelector('a[href*="addbonus"]') || findBtn(doc, ['每日签到']); }
  async function checkinIn(doc) {
    if (!signBtn(doc)) { rec('checkin', 'done', rewardDetail(docText(doc))); return; }
    rec('checkin', 'running', '点击每日签到');
    await pause();
    signBtn(doc).click();
    const gone = await waitFor(() => !signBtn(doc), 12000);
    if (gone) rec('checkin', 'success', rewardDetail(docText(doc)));
    else rec('checkin', 'failed', '点完后按钮还在，签到可能没成功');
  }
  function funboxDocIn(rootDoc) {
    const frames = rootDoc.querySelectorAll('iframe');
    for (const f of frames) {
      try { const d = f.contentDocument; if (d && docText(d).indexOf('趣味') >= 0) return d; } catch (e) {}
    }
    return null;
  }
  async function funboxIn(doc) {
    // 实测确认（2026-11-19）：投票按钮在主页面里，不在趣味盒小框内；小框里只有内容图片
    let btn = await waitFor(() => findBtn(doc, ['有趣']), 12000);
    if (!btn) {
      const inner = funboxDocIn(doc);
      if (inner) btn = findBtn(inner, ['有趣']);
    }
    if (!btn) {
      if (docText(doc).indexOf('认为它有趣') >= 0) { rec('funbox', 'novote', ''); return; }
      rec('funbox', 'failed', '没找到趣味盒投票按钮');
      return;
    }
    rec('funbox', 'running', '点击有趣');
    await pause();
    btn.click();
    const ok = await waitFor(() => !findBtn(doc, ['有趣']) || docText(doc).indexOf('谢谢！你的投票已提交') >= 0 || docText(doc).indexOf('你觉得呢') < 0, 12000);
    if (ok) rec('funbox', 'success', '');
    else rec('funbox', 'failed', '点完后按钮还在，投票可能没成功');
  }
  async function withHome(fn) {
    const p = location.pathname;
    if (p === '/' || p.indexOf('index.php') >= 0) { await fn(document); return; }
    const ifr = await openRemote(HOME_URL);
    try {
      const d = ifr.contentDocument;
      if (d) await fn(d); else rec('checkin', 'failed', '跨页打开首页失败');
    } finally { closeRemote(ifr); }
  }
  async function doCheckin() { await withHome(checkinIn); }
  async function doFunbox() { await withHome(funboxIn); }

  const runners = { checkin: doCheckin, funbox: doFunbox };
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
