// ==UserScript==
// @name         每日签到-总面板
// @namespace    nj.checkin
// @version      1.0.1
// @description  汇总显示所有站点脚本今天的执行情况（只读账本，不执行站点动作）
// @author       momo
// @match        *://pt.btschool.club/*
// @match        *://kp.m-team.cc/*
// @match        *://www.nicept.net/*
// @match        *://hdbao.cc/*
// @match        *://www.haidan.cc/*
// @match        *://rousi.pro/*
// @match        *://cyanbug.net/*
// @match        *://longpt.org/*
// @match        *://pt.0ff.cc/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addValueChangeListener
// @grant        GM_registerMenuCommand
// @storagename  nj-checkin
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';
  if (window.top !== window.self) return; // 只在最外层页面运行，避免在站内小框（趣味盒/群聊区）里重复运行

  function bjDate(d) {
    d = d || new Date();
    const b = new Date(d.getTime() + (d.getTimezoneOffset() + 480) * 60000);
    const p = n => String(n).padStart(2, '0');
    return b.getFullYear() + '-' + p(b.getMonth() + 1) + '-' + p(b.getDate());
  }
  function get(k, def) { try { const v = GM_getValue(k); return v === undefined ? def : v; } catch (e) { return def; } }
  function set(k, v) { try { GM_setValue(k, v); } catch (e) {} }

  const STATUS = {
    success: ['成功', '#2e9e4f'],
    done: ['已完成', '#2e9e4f'],
    failed: ['失败', '#d33'],
    manual: ['需要手动', '#d33'],
    running: ['执行中', '#e69500'],
    waiting: ['等待中', '#e69500'],
    notdue: ['未到期', '#888'],
    none: ['未执行', '#888']
  };

  function siteSummary(siteId, reg, dayLedger) {
    const tasks = (reg && reg.tasks) || [];
    const recs = (dayLedger && dayLedger[siteId]) || {};
    let ok = 0, bad = 0, pending = 0;
    const rows = tasks.map(t => {
      const r = recs[t.id];
      const st = r ? r.status : 'none';
      if (st === 'success' || st === 'done' || st === 'notdue') ok++;
      else if (st === 'failed' || st === 'manual') bad++;
      else pending++;
      return { task: t, rec: r, status: st };
    });
    let level;
    if (tasks.length && bad === 0 && pending === 0) level = ['全部成功', '#2e9e4f'];
    else if (tasks.length && ok === 0 && bad > 0 && pending === 0) level = ['全部失败', '#d33'];
    else if (tasks.length === 0 || (ok === 0 && bad === 0)) level = ['未执行', '#888'];
    else level = ['部分有问题', '#e69500'];
    return { rows, level };
  }

  let panelEl = null;

  function render() {
    if (!panelEl) return;
    const registry = get('registry', {});
    const ledger = get('ledger', {});
    const paused = get('paused', {});
    const monthly = get('monthly', {});
    const today = bjDate();
    const dayLedger = ledger[today] || {};
    const siteIds = Object.keys(registry);
    let nAll = 0, nPart = 0, nFail = 0, nNone = 0;
    let html = '<div style="font-weight:bold;font-size:15px;margin-bottom:6px;">今日总览（' + today + '）</div>';
    let sitesHtml = '';
    siteIds.sort().forEach(id => {
      const reg = registry[id];
      const sum = siteSummary(id, reg, dayLedger);
      if (sum.level[0] === '全部成功') nAll++;
      else if (sum.level[0] === '全部失败') nFail++;
      else if (sum.level[0] === '未执行') nNone++;
      else nPart++;
      const isPaused = !!paused[id];
      sitesHtml += '<div style="border-top:1px solid #ddd;padding:6px 0;">' +
        '<div><b>' + reg.name + '</b> <span style="color:' + sum.level[1] + ';font-weight:bold;">' + sum.level[0] + '</span>' +
        (isPaused ? ' <span style="color:#888;">（已暂停）</span>' : '') +
        ' <button data-act="pause" data-site="' + id + '" style="float:right;">' + (isPaused ? '恢复' : '暂停') + '</button></div>';
      sum.rows.forEach(row => {
        const st = STATUS[row.status] || STATUS.none;
        sitesHtml += '<div style="margin-left:12px;font-size:12px;">· ' + row.task.name +
          '：<span style="color:' + st[1] + ';">' + st[0] + '</span>' +
          (row.rec ? ' <span style="color:#666;">' + (row.rec.time || '') + ' ' + (row.rec.detail || '') + '</span>' : '') +
          ((row.status === 'failed' || row.status === 'manual') ? ' <button data-act="retry" data-site="' + id + '" data-task="' + row.task.id + '">重试</button>' : '') +
          '</div>';
      });
      sitesHtml += '</div>';
    });
    html += '<div style="margin-bottom:4px;">共 ' + siteIds.length + ' 个网站：全部成功 ' + nAll + '，部分有问题 ' + nPart + '，全部失败 ' + nFail + '，未执行 ' + nNone + '</div>';
    html += sitesHtml || '<div style="color:#888;">还没有任何站点脚本登记过。先打开各个网站，脚本运行后这里就会有内容。</div>';
    const due = monthly && monthly.cyanbug && monthly.cyanbug.due;
    html += '<div style="border-top:1px solid #ddd;padding-top:6px;margin-top:4px;font-size:12px;">月度任务：大青虫求彩虹ID/求vip，下次到期 ' + (due ? String(due).slice(0, 10) : '未设置') + '</div>';
    html += '<div style="margin-top:8px;"><button data-act="export">导出账本数据</button> <button data-act="close">关闭</button></div>' +
      '<div style="font-size:11px;color:#999;margin-top:4px;">整份数据备份请用脚本猫自带的备份功能（可走 WebDAV）。</div>';
    panelEl.innerHTML = html;
  }

  function openPanel() {
    if (panelEl) { panelEl.style.display = 'block'; render(); return; }
    panelEl = document.createElement('div');
    panelEl.style.cssText = 'position:fixed;top:60px;right:16px;width:360px;max-height:75vh;overflow:auto;background:#fff;color:#222;border:1px solid #bbb;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.25);z-index:2147483647;padding:12px;font-size:13px;line-height:1.5;';
    document.body.appendChild(panelEl);
    panelEl.addEventListener('click', e => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const act = btn.getAttribute('data-act');
      if (act === 'close') { panelEl.style.display = 'none'; }
      if (act === 'pause') {
        const site = btn.getAttribute('data-site');
        const paused = get('paused', {});
        paused[site] = !paused[site];
        set('paused', paused);
        render();
      }
      if (act === 'retry') {
        const req = get('retryReq', {});
        req[btn.getAttribute('data-site')] = { task: btn.getAttribute('data-task'), ts: Date.now() };
        set('retryReq', req);
        btn.textContent = '已请求，打开该站页面时执行';
        btn.disabled = true;
      }
      if (act === 'export') {
        const data = { registry: get('registry', {}), ledger: get('ledger', {}), monthly: get('monthly', {}), paused: get('paused', {}) };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = '签到账本-' + bjDate() + '.json';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      }
    });
    render();
  }

  const btn = document.createElement('div');
  btn.textContent = '签到面板';
  btn.style.cssText = 'position:fixed;right:16px;bottom:16px;background:#2e9e4f;color:#fff;padding:8px 12px;border-radius:20px;cursor:pointer;z-index:2147483646;font-size:13px;box-shadow:0 3px 10px rgba(0,0,0,.3);';
  btn.addEventListener('click', openPanel);
  document.body.appendChild(btn);

  try { GM_registerMenuCommand('打开签到面板', openPanel); } catch (e) {}
  try { GM_addValueChangeListener('ledger', () => { if (panelEl && panelEl.style.display !== 'none') render(); }); } catch (e) {}
})();
