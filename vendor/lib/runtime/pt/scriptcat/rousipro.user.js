// ==UserScript==
// @name         每日签到-RousiPro
// @namespace    nj.checkin
// @version      1.0.0
// @description  RousiPro 每日签到：先选“随机”并验证选中，再点立即签到。结果写入共享账本
// @author       momo
// @match        *://rousi.pro/account/economy*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addValueChangeListener
// @storagename  nj-checkin
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';
  const SITE = { id: 'rousipro', name: 'RousiPro', tasks: [{ id: 'checkin', name: '每日签到（随机）' }] };
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
  function pageText() { return document.body ? (document.body.innerText || '') : ''; }
  function findBtn(texts) { const els = document.querySelectorAll('a,button,input[type="button"],input[type="submit"]'); for (const el of els) { const t = (el.textContent || el.value || '').trim(); if (texts.indexOf(t) >= 0) return el; } return null; }
  async function waitFor(fn, timeout, step) { timeout = timeout || 12000; step = step || 400; const t0 = Date.now(); while (Date.now() - t0 < timeout) { try { const v = fn(); if (v) return v; } catch (e) {} await sleep(step); } return null; }
  function finished(task) { const r = todayRec(task); return r && (r.status === 'success' || r.status === 'done'); }

  async function doCheckin() {
    const already = await waitFor(() => pageText().indexOf('今日已签到') >= 0, 4000);
    if (already) { rec('checkin', 'done', '页面已显示“今日已签到”'); return; }
    const randomRadio = document.querySelector('input[type="radio"][value="random"]');
    const fixedRadio = document.querySelector('input[type="radio"][value="fixed"]');
    const signBtn = findBtn(['立即签到']);
    if (!randomRadio || !signBtn) { rec('checkin', 'failed', '没找到随机选项或立即签到按钮（可能未登录或页面改版）'); return; }
    rec('checkin', 'running', '先选随机再签到');
    await pause();
    randomRadio.click();
    await sleep(300);
    // 关键验证：随机必须真的选中、固定必须未选中，验证不过绝不点签到
    if (!randomRadio.checked || (fixedRadio && fixedRadio.checked)) {
      rec('checkin', 'failed', '随机选项没有选中成功，已停下，没有点签到');
      return;
    }
    await pause();
    signBtn.click();
    const ok = await waitFor(() => pageText().indexOf('今日已签到') >= 0 || pageText().indexOf('今日获得') >= 0, 12000);
    if (ok) rec('checkin', 'success', '以随机方式签到，页面出现“今日已签到/今日获得”');
    else rec('checkin', 'failed', '点完后没看到已签到字样');
  }

  const runners = { checkin: doCheckin };
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
