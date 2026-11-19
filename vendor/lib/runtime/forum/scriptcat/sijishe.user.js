// ==UserScript==
// @name         每日签到-Sijishe司机社
// @namespace    nj.checkin
// @version      1.0.5
// @description  司机社（论坛类）每日签到。本站任意页打开都会补做。失败自动重试（原地→刷新，一天最多3次）。结果写入共享账本（总面板可看）
// @author       momo
// @match        *://xsijishe.net/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addValueChangeListener
// @storagename  nj-checkin-forum
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';
  if (window.top !== window.self) return; // 只在最外层页面运行，避免在站内小框里重复运行
  const SITE = { id: 'sijishe', name: 'Sijishe-司机社', tasks: [{ id: 'checkin', name: '每日签到' }] };
  const SIGN_URL = 'https://xsijishe.net/plugin.php?id=k_misign:sign&mobile=no';
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

  /* 签到天数：页面卡片有“连续签到 N 天 / 总天数 N 天”，存共享区供面板显示 */
  function saveStreak(cont, total) { if (cont == null && total == null) return; const info = get('siteInfo', {}); const cur = info[SITE.id] || {}; if (cont != null) cur.cont = cont; if (total != null) cur.total = total; info[SITE.id] = cur; set('siteInfo', info); }
  function streakFromText(t) { if (!t) return; const cm = t.match(/连续签到\s*([\d,]+)\s*天/); const tm = t.match(/总天数\s*([\d,]+)\s*天/); saveStreak(cm ? parseInt(cm[1].replace(/,/g, ''), 10) : null, tm ? parseInt(tm[1].replace(/,/g, ''), 10) : null); }
  function rewardDetail(t) { const m = (t || '').match(/积分奖励\s*([\d,]+)/); return m ? '获得 ' + m[1] + ' 车票' : ''; }
  function myName(doc) {
    const a = doc.querySelector('.vwmy a, a[href*="home.php?mod=space&uid="]');
    return (a && a.textContent) ? a.textContent.trim() : '';
  }
  /* 奖励读法（用户定）：奖励位置不固定，去排行榜里找带自己用户名那一行，读行尾的“上次奖励” */
  function rewardFromRow(doc) {
    const name = myName(doc);
    if (!name) return '';
    const rows = Array.from(doc.querySelectorAll('tr'));
    for (const r of rows) {
      const t = (r.textContent || '').replace(/\s+/g, ' ').trim();
      if (t.indexOf(name) < 0 || t.length > 120) continue;
      const m = t.match(/([\d,]+)\s*(车票|星币)\s*$/);
      if (m) return '获得 ' + m[1] + ' ' + m[2];
    }
    return '';
  }
  function bestDetail(doc, t) { return rewardFromRow(doc) || rewardDetail(t); }
  function notSigned(t) { return (t || '').indexOf('您今天还没有签到') >= 0; }
  /* 找签到按钮（实测 2026-11-19）：按钮文字就是“签到”，不在顶部导航里；
     顶部导航也有一个“签到”链接（指向签到页本身），必须排除：链接地址带 k_misign 的、导航/头部区域里的都不算。
     优先在“您今天还没有签到”所在的卡片附近找。 */
  function signCandidates(root) {
    const els = Array.from(root.querySelectorAll('a,button,[role="button"],div,span'));
    return els.filter(el => {
      if ((el.textContent || '').trim() !== '签到') return false;
      const href = el.getAttribute && el.getAttribute('href') || '';
      if (href.indexOf('k_misign') >= 0 && href.indexOf('operation=') < 0) return false; // 只排除跳到签到页本身的导航链接；带 operation 的是签到动作链接，必须留
      if (el.closest && el.closest('header,nav')) return false;
      return el.offsetWidth > 0;
    }).sort((a, b) => {
      const ao = ((a.getAttribute && a.getAttribute('href') || '').indexOf('operation=qiandao') >= 0) ? 0 : 1;
      const bo = ((b.getAttribute && b.getAttribute('href') || '').indexOf('operation=qiandao') >= 0) ? 0 : 1;
      if (ao !== bo) return ao - bo;
      return (a.offsetWidth * a.offsetHeight) - (b.offsetWidth * b.offsetHeight);
    });
  }
  function signBtn(doc) {
    /* 首选按代码特征找（2026-11-19 用户用开发者工具复制真实代码确认）：签到按钮是
       <a id="JD_sign" href="plugin.php?id=k_misign:sign&operation=qiandao&formhash=…&format=empty">，
       里面没有任何文字（“签到”二字是背景图），靠文字永远找不到，必须按 id / 链接特征找。 */
    const byId = doc.getElementById ? doc.getElementById('JD_sign') : null;
    if (byId) return byId;
    const byHref = Array.from(doc.querySelectorAll('a[href*="operation=qiandao"]'));
    if (byHref.length) return byHref[0];
    // 兜底：老办法按文字在状态文字附近找
    // 先在状态文字附近找
    const all = Array.from(doc.querySelectorAll('div,td,span,p'));
    const holder = all.find(el => (el.textContent || '').indexOf('您今天还没有签到') >= 0 && (el.textContent || '').length < 3000);
    if (holder) {
      let scope = holder;
      for (let i = 0; i < 4 && scope; i++) {
        const c = signCandidates(scope);
        if (c.length) return c[0];
        scope = scope.parentElement;
      }
    }
    const c = signCandidates(doc);
    return c.length ? c[0] : null;
  }
  function nearMiss(doc) {
    const out = [];
    const els = Array.from(doc.querySelectorAll('a,button,div,span'));
    for (const el of els) {
      const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (t && t.indexOf('签到') >= 0 && t.length <= 40 && out.indexOf(t) < 0) out.push(t);
      if (out.length >= 3) break;
    }
    return out.join(' / ');
  }
  async function checkinIn(doc, getDoc) {
    getDoc = getDoc || (() => doc);
    const t0 = docText(doc);
    streakFromText(t0);
    if (!notSigned(t0)) { rec('checkin', 'done', bestDetail(doc, t0)); return; } // 没有“您今天还没有签到”＝今天已签到
    const btn = signBtn(doc);
    if (!btn) { rec('checkin', 'failed', '没找到签到按钮；页面上带“签到”的文字：' + nearMiss(doc)); return; }
    rec('checkin', 'running', '点击签到');
    await pause();
    btn.click();
    const ok = await waitFor(() => { const t = docText(getDoc() || doc); return !notSigned(t) || t.indexOf('签到成功') >= 0; }, 15000);
    if (ok) { const d1 = getDoc() || doc; const t1 = docText(d1); streakFromText(t1); rec('checkin', 'success', bestDetail(d1, t1)); }
    else rec('checkin', 'failed', '点完后页面仍显示“您今天还没有签到”');
  }
  async function doCheckin() {
    if (location.href.indexOf('k_misign') >= 0) { await checkinIn(document); return; }
    const ifr = await openRemote(SIGN_URL);
    try {
      const d = ifr.contentDocument;
      if (d) await checkinIn(d, () => ifr.contentDocument); else rec('checkin', 'failed', '跨页打开签到页失败');
    } finally { closeRemote(ifr); }
  }

  const runners = { checkin: doCheckin };
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
