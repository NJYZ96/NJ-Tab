// ==UserScript==
// @name         每日签到-RousiPro
// @namespace    nj.checkin
// @version      1.0.5
// @description  RousiPro 每日签到：先选“随机”并验证选中，再点立即签到；成功说明记页面上的真实奖励句。本站任意页打开都会补做。失败自动重试（原地→刷新，一天最多3次）。结果写入共享账本
// @author       momo
// @match        *://rousi.pro/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addValueChangeListener
// @storagename  nj-checkin
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';
  if (window.top !== window.self) return; // 只在最外层页面运行，避免在站内小框里重复运行
  const SITE = { id: 'rousipro', name: 'Rousi-肉丝', tasks: [{ id: 'checkin', name: '每日签到（随机）' }] };
  const SIGN_URL = 'https://rousi.pro/account/economy?tab=attendance';
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
  /* 跨页干活：在本站其他页面时，用隐藏小框打开签到页在后台完成 */
  /* 签到天数：从页面文字读连续/累计，存共享区供面板在站名后显示 */
  function saveStreak(cont, total) { if (cont == null && total == null) return; const info = get('siteInfo', {}); const cur = info[SITE.id] || {}; if (cont != null) cur.cont = cont; if (total != null) cur.total = total; info[SITE.id] = cur; set('siteInfo', info); }
  function streakFromText(t) { if (!t) return; const cm = t.match(/连续签到\s*(\d+)\s*天/) || t.match(/已连续\s*(\d+)\s*天/) || t.match(/连续\s*(\d+)\s*天/) || t.match(/(\d+)\s*天\s*连续签到/); const tm = t.match(/累计签到\s*(\d+)\s*天/) || t.match(/累计\s*(\d+)\s*天/) || t.match(/第\s*(\d+)\s*次签到/) || t.match(/(\d+)\s*次\s*累计签到/); saveStreak(cm ? parseInt(cm[1], 10) : null, tm ? parseInt(tm[1], 10) : null); }
  /* 页面上的真实奖励句，如“今日获得 212 魔力值，基础奖励 212，并获得 1 经验。” */
  function rewardText(doc) { const t = docText(doc); const mm = t.match(/今日获得\s*([\d,]+)\s*魔力值/) || t.match(/基础奖励\s*([\d,]+)/); const em = t.match(/并获得\s*([\d,]+)\s*经验/); if (mm && em) return '获得 ' + mm[1] + ' 魔力，并获得 ' + em[1] + ' 经验'; if (mm) return '获得 ' + mm[1] + ' 魔力'; return ''; }
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

  /* 奖励方式选项：实测（2026-11-19）是可切换按钮，不是单选圈。按文字找含“随机/固定”的小元素 */
  function findOptBtn(doc, keyword) {
    const hits = Array.from(doc.querySelectorAll('button,[role="button"],a,label,div,span')).filter(el => {
      const t = (el.textContent || '').trim();
      return t.indexOf(keyword) >= 0 && t.length <= 14 && el.offsetWidth > 0;
    });
    hits.sort((a, b) => (a.offsetWidth * a.offsetHeight) - (b.offsetWidth * b.offsetHeight));
    return hits[0] || null;
  }
  /* 选中态判断：true=已选中，false=未选中，null=看不出来 */
  function optSelected(el) {
    if (!el) return null;
    const p = el.getAttribute && el.getAttribute('aria-pressed');
    if (p !== null && p !== undefined) return p === 'true';
    const cls = (typeof el.className === 'string' ? el.className : '') + ' ' + ((el.getAttribute && el.getAttribute('class')) || '');
    if (/(^|\s)(active|selected|checked|current|on)(\s|$)/i.test(cls)) return true;
    if (/(^|\s)(inactive|unselected|off)(\s|$)/i.test(cls)) return false;
    return null;
  }
  function optBg(doc, el) { try { return doc.defaultView.getComputedStyle(el).backgroundColor; } catch (e) { return ''; } }

  async function doCheckinIn(doc) {
    const already = await waitFor(() => docText(doc).indexOf('今日已签到') >= 0, 4000);
    if (already) { streakFromText(docText(doc)); const rw0 = rewardText(doc); rec('checkin', 'done', rw0 || ''); return; }
    const signBtn = findBtn(doc, ['立即签到']);
    /* 路线一：真单选圈（旧结构兜底） */
    const randomRadio = doc.querySelector('input[type="radio"][value="random"]');
    const fixedRadio = doc.querySelector('input[type="radio"][value="fixed"]');
    if (randomRadio) {
      if (!signBtn) { rec('checkin', 'failed', '没找到立即签到按钮'); return; }
      rec('checkin', 'running', '先选随机再签到');
      await pause();
      randomRadio.click();
      await sleep(300);
      if (!randomRadio.checked || (fixedRadio && fixedRadio.checked)) { rec('checkin', 'failed', '随机选项没有选中成功，已停下，没有点签到'); return; }
      await pause();
      signBtn.click();
      const ok = await waitFor(() => docText(doc).indexOf('今日已签到') >= 0 || docText(doc).indexOf('今日获得') >= 0, 12000);
      if (ok) { streakFromText(docText(doc)); const rw = rewardText(doc); rec('checkin', 'success', rw || ''); }
      else rec('checkin', 'failed', '点完后没看到已签到字样');
      return;
    }
    /* 路线二：按钮式选项（2026-11-19 实测结构） */
    const randomBtn = findOptBtn(doc, '随机');
    const fixedBtn = findOptBtn(doc, '固定');
    if (!randomBtn || !signBtn) { rec('checkin', 'failed', '没找到随机选项或立即签到按钮（可能未登录或页面改版）'); return; }
    rec('checkin', 'running', '先选随机再签到');
    const bgBefore = optBg(doc, randomBtn);
    if (!(optSelected(randomBtn) === true && optSelected(fixedBtn) === false)) {
      await pause();
      randomBtn.click();
      /* 关键验证：随机必须真的选中、固定必须未选中，验证不过绝不点签到 */
      const verified = await waitFor(() => {
        const rs = optSelected(randomBtn), fs = optSelected(fixedBtn);
        if (rs !== null || fs !== null) return rs === true && fs === false;
        /* 没有明确标记时，用背景色变化兜底：随机按钮变色且与固定不同 */
        const bg = optBg(doc, randomBtn);
        return bg && bg !== bgBefore && bg !== optBg(doc, fixedBtn);
      }, 4000);
      if (!verified) { rec('checkin', 'failed', '随机选项没有选中成功，已停下，没有点签到'); return; }
    }
    await pause();
    signBtn.click();
    const ok = await waitFor(() => docText(doc).indexOf('今日已签到') >= 0 || docText(doc).indexOf('今日获得') >= 0, 12000);
    if (ok) { streakFromText(docText(doc)); const rw2 = rewardText(doc); rec('checkin', 'success', rw2 || ''); }
    else rec('checkin', 'failed', '点完后没看到已签到字样');
  }

  async function doCheckin() {
    if (location.pathname.indexOf('/account/economy') >= 0) { await doCheckinIn(document); return; }
    const ifr = await openRemote(SIGN_URL);
    try {
      const d = ifr.contentDocument;
      if (d) await doCheckinIn(d); else rec('checkin', 'failed', '跨页打开签到页失败');
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
