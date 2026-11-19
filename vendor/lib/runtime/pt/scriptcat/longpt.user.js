// ==UserScript==
// @name         每日签到-LongPT
// @namespace    nj.checkin
// @version      1.0.6
// @description  LongPT 每日抽奖（核获奖记录最新一条：须今天创建且“等待开奖”）+ 喊话“求上传”（只认自己存的状态防重复提交；页面提示“已经喊过”即记已完成）。本站任意页打开都会补做。失败自动重试（原地→刷新，一天最多3次）。结果写入共享账本
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
  const SITE = { id: 'longpt', name: 'LongPT-龙站', tasks: [{ id: 'lottery', name: '每日抽奖' }, { id: 'shout', name: '喊话求上传' }] };
  const PLUGINS_URL = 'https://longpt.org/plugins/index';
  function tabId() { try { let t = sessionStorage.getItem('nj-tab-id'); if (!t) { t = Math.random().toString(36).slice(2); sessionStorage.setItem('nj-tab-id', t); } return t; } catch (e) { return 'x' + Math.random().toString(36).slice(2); } }
  const TAB = tabId();
  function bjDate(d) { d = d || new Date(); const b = new Date(d.getTime() + (d.getTimezoneOffset() + 480) * 60000); const p = n => String(n).padStart(2, '0'); return b.getFullYear() + '-' + p(b.getMonth() + 1) + '-' + p(b.getDate()); }
  function bjTime(d) { d = d || new Date(); const b = new Date(d.getTime() + (d.getTimezoneOffset() + 480) * 60000); const p = n => String(n).padStart(2, '0'); return p(b.getHours()) + ':' + p(b.getMinutes()) + ':' + p(b.getSeconds()); }
  function bjHour() { const d = new Date(); const b = new Date(d.getTime() + (d.getTimezoneOffset() + 480) * 60000); return b.getHours() * 60 + b.getMinutes(); }
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
  const ATT_URL = 'https://longpt.org/attendance.php';
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

  /* ---------- 抽奖：核获奖记录最新一条——创建时间必须是今天、状态必须是“等待开奖”（或已开奖结果） ---------- */
  function latestRecordOk(text) {
    if (!text) return false;
    const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
      if (!m) continue;
      /* 找到第一条带日期的记录（即最新一条），只看这一条及其紧邻几行 */
      const seg = lines.slice(i, i + 5).join(' ');
      const recDate = m[1] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[3]).padStart(2, '0');
      if (recDate !== bjDate()) return false;
      return /等待开奖|恭喜您|未中奖/.test(seg);
    }
    return false;
  }
  async function fetchPageText(url) {
    const res = await fetch(url, { credentials: 'include' });
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return doc.body ? (doc.body.textContent || '') : '';
  }
  async function doLotteryIn(doc) {
    if (latestRecordOk(docText(doc))) { rec('lottery', 'done', '获奖记录最新一条是今天创建、状态“等待开奖”，今天已参与'); return; }
    const btn = await waitFor(() => findBtn(doc, ['立即参与']), 12000);
    if (!btn) { rec('lottery', 'failed', '没找到“立即参与”按钮'); return; }
    if (bjHour() >= 23 * 60 + 29) { rec('lottery', 'failed', '已过今天参与时间（23:29 截止）且记录里没有今天的条目'); return; }
    rec('lottery', 'running', '点击立即参与');
    await pause();
    btn.click();
    const ok = await waitFor(async () => {
      const t = await fetchPageText(PLUGINS_URL);
      return latestRecordOk(t);
    }, 90000, 15000);
    if (ok) rec('lottery', 'success', '参与后获奖记录最新一条为今天的“等待开奖”，今晚23:30开奖');
    else rec('lottery', 'failed', '点完后90秒内获奖记录里没出现今天的条目');
  }

  /* ---------- 喊话：页面不显示“已喊过”，只能靠自己存的状态防重复提交 ----------
     规则：提交前先落“已提交”标记；带标记进来时只核实结果、绝不再提交。
     页面提示“你已经喊过了”＝今天已喊过，记已完成并停手。 */
  async function verifyShoutByHome() {
    try {
      const home = await fetchPageText('https://longpt.org/');
      const b = new Date(Date.now() + (new Date().getTimezoneOffset() + 480) * 60000);
      const stamp = '[' + String(b.getMonth() + 1).padStart(2, '0') + '.' + String(b.getDate()).padStart(2, '0');
      const lines = home.split('\n').filter(l => l.indexOf('龙宝') >= 0 && l.indexOf('响应了你的请求') >= 0 && l.indexOf(stamp) >= 0);
      if (lines.length) return lines[lines.length - 1].trim();
    } catch (e) {}
    return '';
  }
  async function doShoutIn(doc) {
    const sentAlready = get('longptShoutSent', '') === bjDate();
    const input = Array.from(doc.querySelectorAll('input[type="text"], textarea')).find(el => /喊话内容需包含/.test(el.placeholder || ''));
    const btn = findBtn(doc, ['喊话']);
    if (!input || !btn) {
      if (sentAlready) {
        const v = await verifyShoutByHome();
        if (v) { rec('shout', 'success', '群聊区龙宝回复：' + v); return; }
        rec('shout', 'waiting', '今天已提交过喊话（页面上找不到喊话框，只核实不重提）');
        return;
      }
      rec('shout', 'failed', '没找到喊话框或喊话按钮');
      return;
    }
    let toastText = '', alreadyText = '';
    const MO = (doc.defaultView && doc.defaultView.MutationObserver) || MutationObserver;
    const ob = new MO(muts => {
      for (const m of muts) {
        for (const node of m.addedNodes) {
          if (node.nodeType === 1) {
            const t = (node.innerText || node.textContent || '').trim();
            if (t && t.length < 300) {
              if (/已经喊过/.test(t)) alreadyText = t;
              else if (/龙宝/.test(t) || /获得上传量/.test(t) || /响应了你的请求/.test(t)) toastText = t;
            }
          }
        }
      }
    });
    try { ob.observe(doc.body, { childList: true, subtree: true }); } catch (e) {}
    if (!sentAlready) {
      set('longptShoutSent', bjDate()); // 先落标记再提交，任何重试都不会重复提交
      rec('shout', 'running', '发送“求上传”');
      const w = doc.defaultView || window;
      const proto = input.tagName === 'TEXTAREA' ? w.HTMLTextAreaElement.prototype : w.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setter.call(input, '求上传');
      input.dispatchEvent(new w.Event('input', { bubbles: true }));
      input.dispatchEvent(new w.Event('change', { bubbles: true }));
      await pause();
      btn.click();
    } else {
      rec('shout', 'running', '今天已提交过喊话，只核实结果，不再重复提交');
    }
    const got = await waitFor(() => alreadyText || toastText || (docText(doc).indexOf('已经喊过') >= 0 ? 'PAGE_ALREADY' : ''), 20000, 300);
    try { ob.disconnect(); } catch (e) {}
    if (alreadyText || got === 'PAGE_ALREADY') { rec('shout', 'done', '页面提示今天已经喊过（龙宝不想理你），说明今天已喊过，不再重复'); return; }
    if (toastText) { rec('shout', 'success', '抓到页面提示：' + toastText); return; }
    const v = await verifyShoutByHome();
    if (v) { rec('shout', 'success', '群聊区龙宝回复：' + v); return; }
    if (sentAlready) rec('shout', 'waiting', '今天已提交过喊话，但没核实到龙宝回复；已停手，不会重复提交');
    else rec('shout', 'failed', '没抓到页面提示，群聊区也没找到龙宝今天的回复（已落“已提交”标记，重试只核实不重提）');
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
