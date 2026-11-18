// ==UserScript==
// @name         每日签到-LongPT
// @namespace    nj.checkin
// @version      1.0.2
// @description  LongPT 每日抽奖（靠记录列表判断）+ 喊话“求上传”（抓一闪而过的提示/看龙宝回复）。本站任意页打开都会补做。失败自动重试（原地→刷新，一天最多3次）。结果写入共享账本
// @author       momo
// @match        *://longpt.org/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addValueChangeListener
// @storagename  nj-checkin
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';
  if (window.top !== window.self) return; // 只在最外层页面运行，避免在站内小框里重复运行
  const SITE = { id: 'longpt', name: 'LongPT', tasks: [{ id: 'lottery', name: '每日抽奖' }, { id: 'shout', name: '喊话求上传' }] };
  const PLUGINS_URL = 'https://longpt.org/plugins/index';
  function tabId() { try { let t = sessionStorage.getItem('nj-tab-id'); if (!t) { t = Math.random().toString(36).slice(2); sessionStorage.setItem('nj-tab-id', t); } return t; } catch (e) { return 'x' + Math.random().toString(36).slice(2); } }
  const TAB = tabId();
  function bjDate(d) { d = d || new Date(); const b = new Date(d.getTime() + (d.getTimezoneOffset() + 480) * 60000); const p = n => String(n).padStart(2, '0'); return b.getFullYear() + '-' + p(b.getMonth() + 1) + '-' + p(b.getDate()); }
  function bjTime(d) { d = d || new Date(); const b = new Date(d.getTime() + (d.getTimezoneOffset() + 480) * 60000); const p = n => String(n).padStart(2, '0'); return p(b.getHours()) + ':' + p(b.getMinutes()) + ':' + p(b.getSeconds()); }
  function bjHour() { const d = new Date(); const b = new Date(d.getTime() + (d.getTimezoneOffset() + 480) * 60000); return b.getHours() * 60 + b.getMinutes(); }
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
  /* 找按钮：先认标准按钮，再认文字完全一致的可点区块（2026-11-19 实测本站按钮不是标准标签） */
  function findBtn(root, texts) {
    const els = root.querySelectorAll('a,button,input[type="button"],input[type="submit"],[role="button"]');
    for (const el of els) { const t = (el.textContent || el.value || '').trim(); if (texts.indexOf(t) >= 0) return el; }
    const hits = Array.from(root.querySelectorAll('div,span,li')).filter(el => texts.indexOf((el.textContent || '').trim()) >= 0 && el.offsetWidth > 0 && el.offsetWidth < 400);
    hits.sort((a, b) => (a.offsetWidth * a.offsetHeight) - (b.offsetWidth * b.offsetHeight));
    return hits[0] || null;
  }
  async function waitFor(fn, timeout, step) { timeout = timeout || 12000; step = step || 500; const t0 = Date.now(); while (Date.now() - t0 < timeout) { try { const v = await fn(); if (v) return v; } catch (e) {} await sleep(step); } return null; }
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

  /* ---------- 抽奖：靠记录里有没有今天的条目判断 ---------- */
  function hasTodayRecord(text) {
    return text.indexOf(bjDate()) >= 0 && (text.indexOf('等待开奖') >= 0 || text.indexOf('恭喜您') >= 0 || text.indexOf('未中奖') >= 0);
  }
  async function fetchPageText(url) {
    const res = await fetch(url, { credentials: 'include' });
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return doc.body ? (doc.body.innerText || '') : '';
  }
  async function doLotteryIn(doc) {
    if (hasTodayRecord(docText(doc))) { rec('lottery', 'done', '记录里已有今天的条目，今天已参与'); return; }
    const btn = await waitFor(() => findBtn(doc, ['立即参与']), 12000);
    if (!btn) { rec('lottery', 'failed', '没找到“立即参与”按钮'); return; }
    if (bjHour() >= 23 * 60 + 29) { rec('lottery', 'failed', '已过今天参与时间（23:29 截止）且记录里没有今天的条目'); return; }
    rec('lottery', 'running', '点击立即参与');
    await pause();
    btn.click();
    const ok = await waitFor(async () => {
      const t = await fetchPageText(PLUGINS_URL);
      return hasTodayRecord(t);
    }, 90000, 15000);
    if (ok) rec('lottery', 'success', '参与后记录里出现今天的“等待开奖”条目，今晚23:30开奖');
    else rec('lottery', 'failed', '点完后90秒内记录里没出现今天的条目');
  }

  /* ---------- 喊话：先挂监听抓一闪而过的提示 ---------- */
  async function doShoutIn(doc) {
    const input = Array.from(doc.querySelectorAll('input[type="text"], textarea')).find(el => /喊话内容需包含/.test(el.placeholder || ''));
    const btn = findBtn(doc, ['喊话']);
    if (!input || !btn) { rec('shout', 'failed', '没找到喊话框或喊话按钮'); return; }
    let toastText = '';
    const MO = (doc.defaultView && doc.defaultView.MutationObserver) || MutationObserver;
    const ob = new MO(muts => {
      for (const m of muts) {
        for (const node of m.addedNodes) {
          if (node.nodeType === 1) {
            const t = (node.innerText || node.textContent || '').trim();
            if (t && t.length < 300 && (/龙宝/.test(t) || /获得上传量/.test(t) || /响应了你的请求/.test(t))) { toastText = t; }
          }
        }
      }
    });
    try { ob.observe(doc.body, { childList: true, subtree: true }); } catch (e) {}
    rec('shout', 'running', '发送“求上传”');
    const w = doc.defaultView || window;
    const proto = input.tagName === 'TEXTAREA' ? w.HTMLTextAreaElement.prototype : w.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(input, '求上传');
    input.dispatchEvent(new w.Event('input', { bubbles: true }));
    input.dispatchEvent(new w.Event('change', { bubbles: true }));
    await pause();
    btn.click();
    const got = await waitFor(() => toastText, 20000, 300);
    if (got) { try { ob.disconnect(); } catch (e) {} rec('shout', 'success', '抓到页面提示：' + got); return; }
    try {
      const home = await fetchPageText('https://longpt.org/');
      const b = new Date(Date.now() + (new Date().getTimezoneOffset() + 480) * 60000);
      const stamp = '[' + String(b.getMonth() + 1).padStart(2, '0') + '.' + String(b.getDate()).padStart(2, '0');
      const lines = home.split('\n').filter(l => l.indexOf('龙宝') >= 0 && l.indexOf('响应了你的请求') >= 0 && l.indexOf(stamp) >= 0);
      if (lines.length) { try { ob.disconnect(); } catch (e) {} rec('shout', 'success', '群聊区龙宝回复：' + lines[lines.length - 1].trim()); return; }
    } catch (e) {}
    try { ob.disconnect(); } catch (e) {}
    rec('shout', 'failed', '没抓到页面提示，群聊区也没找到龙宝今天的回复');
  }

  async function withPluginsDoc(fn) {
    if (location.pathname.indexOf('/plugins') >= 0) { await fn(document); return; }
    const ifr = await openRemote(PLUGINS_URL);
    try {
      const d = ifr.contentDocument;
      if (d) await fn(d); else rec('lottery', 'failed', '跨页打开插件页失败');
    } finally { closeRemote(ifr); }
  }
  async function doLottery() { await withPluginsDoc(doLotteryIn); }
  async function doShout() { await withPluginsDoc(doShoutIn); }

  const runners = { lottery: doLottery, shout: doShout };
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
