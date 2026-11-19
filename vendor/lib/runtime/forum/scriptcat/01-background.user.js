// ==UserScript==
// @name         每日签到-论坛后台定时
// @namespace    nj.checkin
// @version      1.0.0
// @description  每小时检查：每日汇总通知、清理旧账本（论坛类专用，与 PT 类互不混用）
// @author       momo
// @crontab      7 * * * *
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_openInTab
// @grant        GM_notification
// @storagename  nj-checkin-forum
// ==/UserScript==

(function () {
  'use strict';

  function bjParts(d) {
    d = d || new Date();
    const b = new Date(d.getTime() + (d.getTimezoneOffset() + 480) * 60000);
    const p = n => String(n).padStart(2, '0');
    return {
      date: b.getFullYear() + '-' + p(b.getMonth() + 1) + '-' + p(b.getDate()),
      hour: b.getHours()
    };
  }
  function get(k, def) { try { const v = GM_getValue(k); return v === undefined ? def : v; } catch (e) { return def; } }
  function set(k, v) { try { GM_setValue(k, v); } catch (e) {} }
  function notify(title, text) {
    try { GM_notification({ title: title, text: text, timeout: 15000 }); } catch (e) {}
  }

  const now = bjParts();
  const today = now.date;

  // 1) 清理 35 天前的账本
  try {
    const ledger = get('ledger', {});
    const days = Object.keys(ledger).sort();
    while (days.length > 35) {
      const old = days.shift();
      delete ledger[old];
    }
    set('ledger', ledger);
  } catch (e) {}

  // 3) 每日汇总通知（22 点这一轮发，每天一次）
  try {
    if (now.hour >= 22 && get('summarySent', '') !== today) {
      const registry = get('registry', {});
      const ledger = get('ledger', {});
      const day = ledger[today] || {};
      const problems = [];
      let okCount = 0, total = 0;
      Object.keys(registry).forEach(siteId => {
        const reg = registry[siteId];
        (reg.tasks || []).forEach(t => {
          total++;
          const r = (day[siteId] || {})[t.id];
          if (r && (r.status === 'success' || r.status === 'done' || r.status === 'notdue' || r.status === 'active')) okCount++;
          else if (r && (r.status === 'failed' || r.status === 'manual')) problems.push(reg.name + '-' + t.name + '：' + (r.status === 'manual' ? '需要手动' : '失败') + (r.detail ? '（' + r.detail + '）' : ''));
          else problems.push(reg.name + '-' + t.name + '：今天还没执行');
        });
      });
      if (total > 0) {
        if (problems.length === 0) notify('今日签到汇总', '今天 ' + total + ' 个任务全部完成。');
        else notify('今日签到汇总', '完成 ' + okCount + '/' + total + '。有问题：\n' + problems.join('\n'));
        set('summarySent', today);
      }
    }
  } catch (e) {}
})();
