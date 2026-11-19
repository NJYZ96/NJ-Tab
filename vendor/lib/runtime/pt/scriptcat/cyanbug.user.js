// ==UserScript==
// @name         每日签到-大青虫CyanBug
// @namespace    nj.checkin
// @version      1.0.6
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
  const SITE = { id: 'cyanbug', name: 'CyanBug-大青虫', tasks: [{ id: 'funbox', name: '趣味盒投票' }, { id: 'chatup', name: '每日群聊（求上传）' }, { id: 'chatmagic', name: '每日群聊（求魔力）' }, { id: 'mrainbow', name: '月度群聊（求彩虹ID）' }, { id: 'mvip', name: '月度群聊（求vip）' }] };
  const HOME_URL = 'https://cyanbug.net/index.php';
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
  const ATT_URL = 'https://cyanbug.net/attendance.php';
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
      if (allText(rootDoc).indexOf('认为它有趣') >= 0) { rec('funbox', 'novote', ''); return; }
      rec('funbox', 'failed', '没找到趣味盒投票按钮');
      return;
    }
    rec('funbox', 'running', '点击有趣');
    await pause();
    found.btn.click();
    const ok = await waitFor(() => !findBtn(found.doc, ['有趣']) || docText(found.doc).indexOf('谢谢！你的投票已提交') >= 0 || allText(rootDoc).indexOf('谢谢！你的投票已提交') >= 0, 12000);
    if (ok) rec('funbox', 'success', '');
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
  /* ---------- 每日群聊：拆成两条独立任务，状态存 cyanbugChat（按日期记账） ----------
     只认存储状态：未发送才发送；已发送只核实回复、绝不重复发送；已确认直接跳过。 */
  function chatState() { const all = get('cyanbugChat', {}); return all[bjDate()] || { up: 'none', magic: 'none', upTs: 0 }; }
  function setChat(patch) { const all = get('cyanbugChat', {}); const cur = all[bjDate()] || { up: 'none', magic: 'none', upTs: 0 }; for (const k in patch) cur[k] = patch[k]; all[bjDate()] = cur; set('cyanbugChat', all); }
  function seedChatFromLedger() {
    const st = chatState();
    if (st.up !== 'none' || st.magic !== 'none') return;
    const old = todayRec('daily'); // 旧版合并任务今天已成功/完成时，直接认定两条都确认，避免升级当天重复发送
    if (old && (old.status === 'success' || old.status === 'done')) setChat({ up: 'confirmed', magic: 'confirmed' });
  }
  async function waitReply(rootDoc, before, timeout) {
    return waitFor(() => {
      const now = replyState(rootDoc);
      if (now.reward > before.reward) return 'reward';
      if (now.dup > before.dup) return 'dup';
      return null;
    }, timeout, 3000);
  }
  async function chatOne(rootDoc, taskId, key, msg) {
    seedChatFromLedger();
    let st = chatState();
    if (st[key] === 'confirmed') { rec(taskId, 'done', ''); return; }
    if (key === 'magic' && st.up !== 'confirmed') { rec(taskId, 'waiting', '等第一条（求上传）确认后再发'); return; }
    if (st[key] === 'sent' && replyState(rootDoc).dup > 0) { setChat({ up: 'confirmed', magic: 'confirmed' }); rec(taskId, 'done', ''); return; }
    if (st[key] === 'sent') {
      rec(taskId, 'running', '已发送过，只等回复确认，不重复发送');
      const got = await waitReply(rootDoc, replyState(rootDoc), 90000);
      if (got === 'reward') { const p = {}; p[key] = 'confirmed'; setChat(p); rec(taskId, 'success', ''); return; }
      if (got === 'dup') { setChat({ up: 'confirmed', magic: 'confirmed' }); rec(taskId, 'done', ''); return; }
      rec(taskId, 'waiting', '已发送，等青虫娘回复（不重复发送）');
      return;
    }
    if (key === 'magic' && st.upTs && Date.now() - st.upTs < 70000) {
      rec(taskId, 'waiting', '等够70秒间隔再发第二条');
      await sleep(70000 - (Date.now() - st.upTs));
      st = chatState();
      if (st.magic === 'confirmed') { rec(taskId, 'done', ''); return; }
    }
    const input = chatInputIn(rootDoc);
    const btn = chatSendBtn(input);
    if (!input || !btn) { rec(taskId, 'failed', '没找到群聊输入框或发送按钮（需要校准）'); return; }
    const lastChat = get('cyanbugLastChatTs', 0);
    if (lastChat && Date.now() - lastChat < 70000) { rec(taskId, 'waiting', '等聊天框70秒间隔（每日与月度群聊共用一个聊天框）'); await sleep(70000 - (Date.now() - lastChat)); }
    const before = replyState(rootDoc);
    const patch = {}; patch[key] = 'sent'; patch[key + 'Ts'] = Date.now(); setChat(patch); // 先落状态再发送，刷新/重开也不会重复发送
    rec(taskId, 'running', '发送：' + msg);
    setValue(input, msg);
    await pause();
    btn.click();
    set('cyanbugLastChatTs', Date.now());
    const got = await waitReply(rootDoc, before, 300000);
    if (got === 'reward') { const p = {}; p[key] = 'confirmed'; setChat(p); rec(taskId, 'success', ''); return; }
    if (got === 'dup') { setChat({ up: 'confirmed', magic: 'confirmed' }); rec(taskId, 'done', ''); return; }
    rec(taskId, 'waiting', '已发送，等了5分钟没等到回复，没有重发');
  }
  async function chatUpIn(rootDoc) { await chatOne(rootDoc, 'chatup', 'up', '青虫娘，求上传'); }
  async function chatMagicIn(rootDoc) { await chatOne(rootDoc, 'chatmagic', 'magic', '青虫娘，求魔力'); }
  /* ---------- 月度群聊：拆两条，状态直接读用户详情页，不靠推算记时间 ----------
     详情页“等级”栏有“贵宾资格结束时间: 2026-11-23 00:00:00”（贵宾即 VIP）；“道具”栏有“[彩虹 ID](截止时间: 2026-12-19 00:00:00)”。
     两者结束时间各自独立：结束时间在未来 = 生效中（面板绿色“生效中”）；已过期或没有 = 到期，走群聊申请。
     申请流程与每日群聊相同：只认存储状态（cyanbugMonthlyChat，按各自结束时间分期）、发送前先落状态、绝不重复发送。 */
  function monthlyDue() { const m = get('monthly', {}); if (!m.cyanbug || !m.cyanbug.due) { m.cyanbug = { due: '2026-11-23T00:00:00+08:00' }; set('monthly', m); } return m.cyanbug.due; }
  function findDetailsUrl(doc) { const a = doc.querySelector('a[href*="userdetails.php?id="]'); return a ? a.href : ''; }
  async function readMonthlyStatus() {
    const url = findDetailsUrl(document);
    if (!url) return null;
    const ifr = await openRemote(url);
    try {
      const t = ifr.contentDocument ? docText(ifr.contentDocument) : '';
      if (!t) return null;
      const vm = t.match(/贵宾资格结束时间[:：]\s*(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/);
      const rm = t.match(/彩虹\s*ID[\s\S]{0,16}?截止时间[:：]\s*(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/);
      return { vipEnd: vm ? vm[1] + 'T' + vm[2] + '+08:00' : '', rainbowEnd: rm ? rm[1] + 'T' + rm[2] + '+08:00' : '' };
    } catch (e) { return null; } finally { try { ifr.remove(); } catch (e) {} }
  }
  function daysLeft(endIso) { const a = new Date(bjDate() + 'T00:00:00+08:00').getTime(); const b = new Date(bjDate(new Date(endIso)) + 'T00:00:00+08:00').getTime(); return Math.round((b - a) / 86400000); }
  /* 读到的结束时间同步给后台脚本的开页判断（取两者较早的一个当到期日） */
  function syncDueFromStatus(st) { const ends = [st.vipEnd, st.rainbowEnd].filter(Boolean).sort(); if (!ends.length) return; const m = get('monthly', {}); m.cyanbug = { due: ends[0] }; set('monthly', m); }
  function mState(key, endStr) { const all = get('cyanbugMonthlyChat', {}); if (all[key + 'End'] !== endStr) { all[key] = 'none'; all[key + 'End'] = endStr; all[key + 'Ts'] = 0; set('cyanbugMonthlyChat', all); } return all; }
  function setMState(patch) { const cur = get('cyanbugMonthlyChat', {}); for (const k in patch) cur[k] = patch[k]; set('cyanbugMonthlyChat', cur); }
  async function monthlyOne(rootDoc, taskId, key, msg, endStr) {
    let st = mState(key, endStr);
    if (st[key] === 'confirmed') { rec(taskId, 'done', ''); return; }
    if (key === 'vip' && st.rainbow !== 'confirmed' && !(st.rainbowEnd && new Date(st.rainbowEnd).getTime() > Date.now())) { rec(taskId, 'waiting', '等第一条（求彩虹ID）处理完再发'); return; }
    if (st[key] === 'sent' && replyState(rootDoc).dup > 0) { setMState({ rainbow: 'confirmed', vip: 'confirmed' }); rec(taskId, 'done', ''); return; }
    if (st[key] === 'sent') {
      rec(taskId, 'running', '已发送过，只等回复确认，不重复发送');
      const got = await waitReply(rootDoc, replyState(rootDoc), 90000);
      if (got === 'reward') { const p = {}; p[key] = 'confirmed'; setMState(p); rec(taskId, 'success', ''); return; }
      if (got === 'dup') { setMState({ rainbow: 'confirmed', vip: 'confirmed' }); rec(taskId, 'done', ''); return; }
      rec(taskId, 'waiting', '已发送，等青虫娘回复（不重复发送）');
      return;
    }
    const input = chatInputIn(rootDoc);
    const btn = chatSendBtn(input);
    if (!input || !btn) { rec(taskId, 'failed', '没找到群聊输入框或发送按钮（需要校准）'); return; }
    const lastChat2 = get('cyanbugLastChatTs', 0);
    if (lastChat2 && Date.now() - lastChat2 < 70000) { rec(taskId, 'waiting', '等聊天框70秒间隔（每日与月度群聊共用一个聊天框）'); await sleep(70000 - (Date.now() - lastChat2)); }
    const before = replyState(rootDoc);
    const patch = {}; patch[key] = 'sent'; patch[key + 'Ts'] = Date.now(); setMState(patch); // 先落状态再发送
    rec(taskId, 'running', '发送：' + msg);
    setValue(input, msg);
    await pause();
    btn.click();
    set('cyanbugLastChatTs', Date.now());
    const got = await waitReply(rootDoc, before, 300000);
    if (got === 'reward') { const p = {}; p[key] = 'confirmed'; setMState(p); rec(taskId, 'success', ''); return; }
    if (got === 'dup') { setMState({ rainbow: 'confirmed', vip: 'confirmed' }); rec(taskId, 'done', ''); return; }
    rec(taskId, 'waiting', '已发送，等了5分钟没等到回复，没有重发');
  }
  async function doMonthlyTask(taskId, key, msg) {
    const st = await readMonthlyStatus();
    if (st) {
      syncDueFromStatus(st);
      const end = key === 'rainbow' ? st.rainbowEnd : st.vipEnd;
      if (end && new Date(end).getTime() > Date.now()) { rec(taskId, 'active', daysLeft(end) + '天过期'); return; }
      await withHome(d => monthlyOne(d, taskId, key, msg, end || 'none'));
      return;
    }
    /* 读不到详情页时退回存着的到期日判断，不盲目发送 */
    const due = monthlyDue();
    if (Date.now() < new Date(due).getTime()) { rec(taskId, 'notdue', '还没到期，下次到期 ' + bjDate(new Date(due)) + '（暂时读不到详情页，按存着的到期日判断）'); return; }
    await withHome(d => monthlyOne(d, taskId, key, msg, 'due:' + due));
  }
  async function doMRainbow() { await doMonthlyTask('mrainbow', 'rainbow', '青虫娘，求彩虹ID'); }
  async function doMVip() { await doMonthlyTask('mvip', 'vip', '青虫娘，求vip'); }
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
  async function doChatUp() { await withHome(chatUpIn); }
  async function doChatMagic() { await withHome(chatMagicIn); }
  async function doMonthlyTask(taskId, fn) {
    /* 未到期只记账、不必打开首页 */
    if (Date.now() < new Date(monthlyDue()).getTime()) {
      rec(taskId, 'notdue', '还没到期，下次到期 ' + bjDate(new Date(monthlyDue())) + '，到期后打开本站任意页自动执行');
      return;
    }
    await withHome(fn);
  }
  async function doMRainbow() { await doMonthlyTask('mrainbow', mRainbowIn); }
  async function doMVip() { await doMonthlyTask('mvip', mVipIn); }

  function isMonthlyTask(task) { return task === 'mrainbow' || task === 'mvip'; }
  const runners = { funbox: doFunbox, chatup: doChatUp, chatmagic: doChatMagic, mrainbow: doMRainbow, mvip: doMVip };
  async function run(task, force) {
    if (isPaused()) return;
    if (finished(task)) return; // 已成功/已完成的任务绝不重复执行（包括自动重试与手动重试触发时）
    if (!isMonthlyTask(task) && !force && attempts(task) >= 3) return;
    if (!claim()) return;
    const n = isMonthlyTask(task) ? 1 : bumpAttempt(task);
    try { await runners[task](); } catch (e) { rec(task, 'failed', '脚本出错：' + (e && e.message ? e.message : e)); }
    const r = todayRec(task);
    if (r && r.status === 'failed' && n < 3 && !isMonthlyTask(task)) {
      if (n === 1) setTimeout(() => run(task, true), 20000 + Math.random() * 15000);
      else setTimeout(() => { try { location.reload(); } catch (e) {} }, 15000 + Math.random() * 15000);
    }
  }
  async function main() {
    register();
    if (isPaused()) return;
    await run('funbox', false);
    await run('chatup', false);
    await run('chatmagic', false);
    await run('mrainbow', false);
    await run('mvip', false);
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
