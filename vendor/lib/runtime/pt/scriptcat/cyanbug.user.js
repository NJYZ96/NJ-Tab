// ==UserScript==
// @name         每日签到-大青虫CyanBug
// @namespace    nj.checkin
// @version      1.0.2
// @description  大青虫：趣味盒投票 + 每日群聊两条（间隔70秒、等青虫娘回复）+ 月度群聊两条（到期才发）。本站任意页打开都会补做（后台打开首页完成）。失败自动重试（原地→刷新，一天最多3次）。结果写入共享账本
// @author       momo
// @match        *://cyanbug.net/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addValueChangeListener
// @grant        GM_notification
// @storagename  nj-checkin
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';
  if (window.top !== window.self) return; // 只在最外层页面运行，避免在站内小框里重复运行（小框内容由主脚本跨框查找处理）
  const SITE = { id: 'cyanbug', name: '大青虫 CyanBug', tasks: [{ id: 'funbox', name: '趣味盒投票' }, { id: 'daily', name: '每日群聊（求上传+求魔力）' }, { id: 'monthly', name: '月度群聊（求彩虹ID+求vip）' }] };
  const HOME_URL = 'https://cyanbug.net/index.php';
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
  function claim() { const locks = get('locks', {}); const cur = locks[SITE.id]; const now = Date.now(); if (cur && now - cur.ts < 1500000 && cur.owner !== TAB) return false; locks[SITE.id] = { ts: now, owner: TAB }; set('locks', locks); return true; }
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
  async function waitFor(fn, timeout, step) { timeout = timeout || 12000; step = step || 500; const t0 = Date.now(); while (Date.now() - t0 < timeout) { try { const v = fn(); if (v) return v; } catch (e) {} await sleep(step); } return null; }
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
  /* 收集根文档及其所有同源小框文档（群聊区/趣味盒可能在小框里） */
  function allDocs(rootDoc) {
    const docs = [];
    const walk = d => {
      if (!d || docs.indexOf(d) >= 0) return;
      docs.push(d);
      try { d.querySelectorAll('iframe').forEach(f => { try { walk(f.contentDocument); } catch (e) {} }); } catch (e) {}
    };
    walk(rootDoc);
    return docs;
  }
  function allText(rootDoc) { return allDocs(rootDoc).map(d => docText(d)).join('\n'); }

  /* ---------- 趣味盒（主文档与小框都找） ---------- */
  async function funboxIn(rootDoc) {
    const found = await waitFor(() => {
      for (const d of allDocs(rootDoc)) { const b = findBtn(d, ['有趣']); if (b) return { btn: b, doc: d }; }
      return null;
    }, 10000);
    if (!found) {
      if (allText(rootDoc).indexOf('认为它有趣') >= 0) { rec('funbox', 'done', '趣味盒没有投票按钮，说明已投过'); return; }
      rec('funbox', 'failed', '没找到趣味盒投票按钮');
      return;
    }
    rec('funbox', 'running', '点击有趣');
    await pause();
    found.btn.click();
    const ok = await waitFor(() => !findBtn(found.doc, ['有趣']) || docText(found.doc).indexOf('谢谢！你的投票已提交') >= 0 || allText(rootDoc).indexOf('谢谢！你的投票已提交') >= 0, 12000);
    if (ok) rec('funbox', 'success', '点“有趣”后按钮消失/出现谢谢提示');
    else rec('funbox', 'failed', '点完后按钮还在，投票可能没成功');
  }

  /* ---------- 群聊（输入框可能在小框里，跨框查找） ---------- */
  function chatInputIn(rootDoc) {
    const docs = allDocs(rootDoc);
    for (const d of docs) {
      const inputs = Array.from(d.querySelectorAll('input[type="text"], textarea'));
      const hit = inputs.find(el => /shbox|shout|chat|msg/i.test((el.name || '') + ' ' + (el.id || ''))) ||
        inputs.find(el => /喊话|聊天|消息|说点/.test(el.placeholder || ''));
      if (hit) return hit;
    }
    return null;
  }
  function chatSendBtn(input) {
    if (!input) return null;
    const doc = input.ownerDocument;
    let box = input;
    for (let i = 0; i < 5 && box; i++) {
      box = box.parentElement;
      if (!box) break;
      const b = findBtn(box, ['喊话', '发送', '我喊', '提交']);
      if (b) return b;
    }
    return findBtn(doc, ['喊话', '发送', '我喊']);
  }
  function setValue(el, val) {
    const w = el.ownerDocument.defaultView || window;
    const proto = el.tagName === 'TEXTAREA' ? w.HTMLTextAreaElement.prototype : w.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, val);
    el.dispatchEvent(new w.Event('input', { bubbles: true }));
    el.dispatchEvent(new w.Event('change', { bubbles: true }));
  }
  function replyState(rootDoc) {
    const lines = allText(rootDoc).split('\n').filter(l => l.indexOf('青虫娘') >= 0);
    return {
      reward: lines.filter(l => l.indexOf('响应了你的召唤') >= 0).length,
      dup: lines.filter(l => l.indexOf('今日已经获得') >= 0).length,
      lines: lines
    };
  }
  async function sendAndWait(rootDoc, msg) {
    const input = chatInputIn(rootDoc);
    const btn = chatSendBtn(input);
    if (!input || !btn) return { kind: 'error', line: '没找到群聊输入框或发送按钮（需要校准）' };
    const before = replyState(rootDoc);
    setValue(input, msg);
    await pause();
    btn.click();
    const sentAt = Date.now();
    const got = await waitFor(() => {
      const now = replyState(rootDoc);
      if (now.reward > before.reward) return { kind: 'reward', line: now.lines.filter(l => l.indexOf('响应了你的召唤') >= 0).pop() || '' };
      if (now.dup > before.dup) return { kind: 'dup', line: now.lines.filter(l => l.indexOf('今日已经获得') >= 0).pop() || '' };
      return null;
    }, 300000, 3000);
    if (!got) return { kind: 'none', line: '等了5分钟没等到青虫娘回复，没有重发', sentAt: sentAt };
    got.sentAt = sentAt;
    return got;
  }
  async function runPair(rootDoc, taskId, msg1, msg2) {
    rec(taskId, 'running', '发送第一条：' + msg1);
    const r1 = await sendAndWait(rootDoc, msg1);
    if (r1.kind === 'error') { rec(taskId, 'failed', r1.line); return null; }
    if (r1.kind === 'none') { rec(taskId, 'failed', '第一条没等到回复：' + r1.line); return null; }
    const elapsed = Date.now() - r1.sentAt;
    if (elapsed < 70000) {
      rec(taskId, 'waiting', '第一条已确认，等够70秒间隔再发第二条');
      await sleep(70000 - elapsed);
    }
    rec(taskId, 'running', '发送第二条：' + msg2);
    const r2 = await sendAndWait(rootDoc, msg2);
    if (r2.kind === 'error') { rec(taskId, 'failed', r2.line); return null; }
    if (r2.kind === 'none') { rec(taskId, 'failed', '第二条没等到回复：' + r2.line); return null; }
    const allDup = r1.kind === 'dup' && r2.kind === 'dup';
    return { allDup: allDup, detail: '第一条：' + r1.line + '；第二条：' + r2.line };
  }
  async function dailyIn(rootDoc) {
    const res = await runPair(rootDoc, 'daily', '青虫娘，求上传', '青虫娘，求魔力');
    if (!res) return;
    if (res.allDup) rec('daily', 'done', '两条机器人都回复今日已获得，说明今天已领过。' + res.detail);
    else rec('daily', 'success', res.detail);
  }
  async function monthlyIn(rootDoc) {
    const monthly = get('monthly', {});
    if (!monthly.cyanbug) { monthly.cyanbug = { due: '2026-11-23T00:00:00+08:00' }; set('monthly', monthly); }
    const due = new Date(monthly.cyanbug.due);
    if (Date.now() < due.getTime()) {
      rec('monthly', 'notdue', '还没到期，下次到期 ' + bjDate(due) + '，到期后打开本站任意页自动执行');
      return;
    }
    const res = await runPair(rootDoc, 'monthly', '青虫娘，求彩虹ID', '青虫娘，求vip');
    if (!res) return;
    const nd = new Date(due.getTime());
    nd.setMonth(nd.getMonth() + 1);
    if (nd.getTime() <= Date.now()) nd.setTime(Date.now() + 30 * 24 * 3600 * 1000);
    monthly.cyanbug.due = nd.toISOString();
    set('monthly', monthly);
    if (res.allDup) rec('monthly', 'done', '机器人回复已领过类提示，按已处理记账；下次到期已推算为 ' + bjDate(nd) + '（推算值）。' + res.detail);
    else rec('monthly', 'success', res.detail + '；下次到期已推算为 ' + bjDate(nd) + '（推算值，待官方时间校正）');
  }
  async function withHome(fn) {
    const p = location.pathname;
    if (p === '/' || p.indexOf('index.php') >= 0) { await fn(document); return; }
    const ifr = await openRemote(HOME_URL);
    try {
      const d = ifr.contentDocument;
      if (d) await fn(d); else rec('funbox', 'failed', '跨页打开首页失败');
    } finally { closeRemote(ifr); }
  }
  async function doFunbox() { await withHome(funboxIn); }
  async function doDaily() { await withHome(dailyIn); }
  async function doMonthly() {
    /* 未到期只记账、不必打开首页 */
    const monthly = get('monthly', {});
    const dueStr = (monthly.cyanbug && monthly.cyanbug.due) || '2026-11-23T00:00:00+08:00';
    if (Date.now() < new Date(dueStr).getTime()) {
      if (!monthly.cyanbug) { monthly.cyanbug = { due: dueStr }; set('monthly', monthly); }
      rec('monthly', 'notdue', '还没到期，下次到期 ' + bjDate(new Date(dueStr)) + '，到期后打开本站任意页自动执行');
      return;
    }
    await withHome(monthlyIn);
  }

  const runners = { funbox: doFunbox, daily: doDaily, monthly: doMonthly };
  async function run(task, force) {
    if (isPaused()) return;
    if (!force && finished(task)) return;
    if (task !== 'monthly' && !force && attempts(task) >= 3) return;
    if (!claim()) return;
    const n = task === 'monthly' ? 1 : bumpAttempt(task);
    try { await runners[task](); } catch (e) { rec(task, 'failed', '脚本出错：' + (e && e.message ? e.message : e)); }
    const r = todayRec(task);
    if (r && r.status === 'failed' && n < 3 && task !== 'monthly') {
      if (n === 1) setTimeout(() => run(task, true), 20000 + Math.random() * 15000);
      else setTimeout(() => { try { location.reload(); } catch (e) {} }, 15000 + Math.random() * 15000);
    }
  }
  async function main() {
    register();
    if (isPaused()) return;
    await run('funbox', false);
    await run('daily', false);
    await run('monthly', false);
  }
  try {
    GM_addValueChangeListener('retryReq', function (name, oldV, newV) {
      const req = newV && newV[SITE.id];
      if (req && Date.now() - req.ts < 300000 && runners[req.task]) { resetAttempts(req.task); run(req.task, true); }
    });
  } catch (e) {}
  main();
})();
