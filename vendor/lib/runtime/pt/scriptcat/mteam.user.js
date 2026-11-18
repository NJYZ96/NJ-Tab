// ==UserScript==
// @name         每日签到-M-Team
// @namespace    nj.checkin
// @version      1.0.0
// @description  M-Team 趣味盒点赞投票（成功标志：点赞点踩都变不可点），结果写入共享账本
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
  const SITE = { id: 'mteam', name: 'M-Team', tasks: [{ id: 'funbox', name: '趣味盒点赞' }] };
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
  async function waitFor(fn, timeout, step) { timeout = timeout || 15000; step = step || 400; const t0 = Date.now(); while (Date.now() - t0 < timeout) { try { const v = fn(); if (v) return v; } catch (e) {} await sleep(step); } return null; }
  function finished(task) { const r = todayRec(task); return r && (r.status === 'success' || r.status === 'done'); }

  // 在趣味盒区域里找点赞/点踩按钮：优先按类的关键词，其次找带 svg 图标且成对出现的按钮
  function findVoteButtons() {
    const all = Array.from(document.querySelectorAll('button, a, [role="button"]'));
    const like = all.find(el => /like|zan|thumb-up|thumbs-up|upvote/i.test(el.className || '') || /like|zan/i.test(el.getAttribute('data-action') || ''));
    const dislike = all.find(el => /dislike|cai|thumb-down|thumbs-down|downvote/i.test(el.className || '') || /dislike|cai/i.test(el.getAttribute('data-action') || ''));
    if (like) return { like: like, dislike: dislike || null };
    // 兜底：找标题含“趣味”的区块，在里面找前两个带图标的按钮
    const heads = Array.from(document.querySelectorAll('div,section,td,h1,h2,h3,h4'));
    const head = heads.find(el => (el.textContent || '').indexOf('趣味') >= 0 && el.querySelectorAll('button').length >= 2);
    if (head) {
      const btns = Array.from(head.querySelectorAll('button')).filter(b => b.querySelector('svg') || (b.textContent || '').trim().length <= 6);
      if (btns.length >= 1) return { like: btns[0], dislike: btns[1] || null };
    }
    return null;
  }
  function isDisabled(el) { return el && (el.disabled || el.getAttribute('disabled') !== null || el.classList.contains('disabled')); }

  async function doFunbox() {
    const found = await waitFor(findVoteButtons, 15000);
    if (!found) { rec('funbox', 'failed', '没找到趣味盒点赞按钮（页面结构可能变了，需要校准）'); return; }
    if (isDisabled(found.like)) { rec('funbox', 'done', '点赞按钮已是不可点状态，说明今天已投过'); return; }
    rec('funbox', 'running', '点击点赞按钮');
    await pause();
    found.like.click();
    const ok = await waitFor(() => {
      const f2 = findVoteButtons();
      if (!f2) return false;
      return isDisabled(f2.like) && (!f2.dislike || isDisabled(f2.dislike));
    }, 12000);
    if (ok) rec('funbox', 'success', '点后点赞和点踩都变成不可点');
    else rec('funbox', 'failed', '点完后按钮没有变成不可点，投票可能没成功（需要校准）');
  }

  const runners = { funbox: doFunbox };
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
