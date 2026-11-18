// ==UserScript==
// @name         每日签到-BTSCHOOL
// @namespace    nj.checkin
// @version      1.0.1
// @description  BTSCHOOL 每日签到 + 趣味盒投票，结果写入共享账本（总面板可看）
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
  if (window.top !== window.self) return; // 只在最外层页面运行，避免在站内小框（趣味盒/群聊区）里重复运行
  const SITE = { id: 'btschool', name: 'BTSCHOOL', tasks: [{ id: 'checkin', name: '每日签到' }, { id: 'funbox', name: '趣味盒投票' }] };
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
  function pause() { return sleep(600 + Math.random() * 900); }
  function docText(doc) { return (doc && doc.body) ? (doc.body.innerText || '') : ''; }
  function findBtn(root, texts) { const els = root.querySelectorAll('a,button,input[type="button"],input[type="submit"],[role="button"]'); for (const el of els) { const t = (el.textContent || el.value || '').trim(); if (texts.indexOf(t) >= 0) return el; } return null; }
  async function waitFor(fn, timeout, step) { timeout = timeout || 12000; step = step || 400; const t0 = Date.now(); while (Date.now() - t0 < timeout) { try { const v = fn(); if (v) return v; } catch (e) {} await sleep(step); } return null; }
  function finished(task) { const r = todayRec(task); return r && (r.status === 'success' || r.status === 'done'); }

  function signBtn() { return document.querySelector('a[href*="addbonus"]') || findBtn(document, ['每日签到']); }

  async function doCheckin() {
    if (!signBtn()) { rec('checkin', 'done', '首页没有“每日签到”按钮，说明今天已签到'); return; }
    rec('checkin', 'running', '点击每日签到');
    await pause();
    signBtn().click();
    const gone = await waitFor(() => !signBtn(), 12000);
    if (gone) rec('checkin', 'success', '点击后“每日签到”按钮消失');
    else rec('checkin', 'failed', '点完后按钮还在，签到可能没成功');
  }

  function funboxDoc() {
    const frames = document.querySelectorAll('iframe');
    for (const f of frames) {
      try { const d = f.contentDocument; if (d && docText(d).indexOf('趣味') >= 0) return d; } catch (e) {}
    }
    return null;
  }

  async function doFunbox() {
    // 实测确认（2026-11-19）：投票按钮在主页面里，不在趣味盒小框内；小框里只有内容图片
    let btn = await waitFor(() => findBtn(document, ['有趣']), 12000);
    if (!btn) {
      const doc = funboxDoc();
      if (doc) btn = findBtn(doc, ['有趣']);
    }
    if (!btn) {
      if (docText(document).indexOf('认为它有趣') >= 0) { rec('funbox', 'done', '趣味盒没有投票按钮，说明已投过'); return; }
      rec('funbox', 'failed', '没找到趣味盒投票按钮');
      return;
    }
    rec('funbox', 'running', '点击有趣');
    await pause();
    btn.click();
    const ok = await waitFor(() => !findBtn(document, ['有趣']) || docText(document).indexOf('谢谢！你的投票已提交') >= 0 || docText(document).indexOf('你觉得呢') < 0, 12000);
    if (ok) rec('funbox', 'success', '点“有趣”后按钮消失/出现谢谢提示');
    else rec('funbox', 'failed', '点完后按钮还在，投票可能没成功');
  }

  const runners = { checkin: doCheckin, funbox: doFunbox };
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
