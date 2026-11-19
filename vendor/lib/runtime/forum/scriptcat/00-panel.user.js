// ==UserScript==
// @name         每日签到-论坛总面板
// @namespace    nj.checkin
// @version      1.0.1
// @description  汇总显示论坛类站点脚本今天的执行情况（只读账本，不执行站点动作）。面板可点按钮开关、点面板外自动关闭；主题为右上角图标按钮（自动/白天/暗黑，默认自动），面板按钮跟随主题配色；在哪个站打开面板，哪个站置顶显示
// @author       momo
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addValueChangeListener
// @match        *://xsijishe.net/*
// @match        *://ycoo.net/*
// @grant        GM_registerMenuCommand
// @storagename  nj-checkin-forum
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';
  if (window.top !== window.self) return; // 只在最外层页面运行，避免在站内小框里重复运行

  function retryDoneMap() { return get('retryDone', {}); }
  function bjDate(d) {
    d = d || new Date();
    const b = new Date(d.getTime() + (d.getTimezoneOffset() + 480) * 60000);
    const p = n => String(n).padStart(2, '0');
    return b.getFullYear() + '-' + p(b.getMonth() + 1) + '-' + p(b.getDate());
  }
  function get(k, def) { try { const v = GM_getValue(k); return v === undefined ? def : v; } catch (e) { return def; } }
  function set(k, v) { try { GM_setValue(k, v); } catch (e) {} }

  /* ---------- 主题：自动/白天/暗黑，默认自动（跟随系统），选择记在共享账本里全站通用 ---------- */
  const THEME_NAME = { auto: '自动', light: '白天', dark: '暗黑' };
  const THEME_ICON = { auto: '◐', light: '☀', dark: '☾' };
  function themeMode() {
    const m = get('panelTheme', 'auto');
    return (m === 'light' || m === 'dark' || m === 'auto') ? m : 'auto';
  }
  function effDark() {
    const m = themeMode();
    if (m === 'dark') return true;
    if (m === 'light') return false;
    try { return window.matchMedia('(prefers-color-scheme: dark)').matches; } catch (e) { return false; }
  }
  function palette() {
    return effDark()
      ? { bg: '#1f2226', fg: '#e8e8e8', border: '#4a4f55', hr: '#3a3f45', sub: '#aaaaaa', faint: '#888888', btnBg: '#2e3237' }
      : { bg: '#ffffff', fg: '#222222', border: '#bbbbbb', hr: '#dddddd', sub: '#666666', faint: '#999999', btnBg: '#f0f0f0' };
  }
  /* 当前页面是哪个站（在哪个站打开面板，哪个站置顶） */
  const HOST2SITE = {
    'xsijishe.net': 'sijishe', 'ycoo.net': 'ycoo'
  };

  const PANEL_VER = (typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version) || '';
  /* 点网站名跳该站首页 */
  const SITE_HOME = { sijishe: 'https://xsijishe.net/', ycoo: 'https://ycoo.net/' };
  const STATUS = {
    success: ['已完成', '#2e9e4f'],
    novote: ['无需投票', '#2e9e4f'],
    done: ['已完成', '#2e9e4f'],
    failed: ['未完成', '#d33'],
    manual: ['需要手动', '#d33'],
    running: ['执行中', '#e69500'],
    waiting: ['等待中', '#e69500'],
    notdue: ['未到期', '#888'],
    active: ['生效中', '#2e9e4f'],
    none: ['未执行', '#888']
  };

  function siteSummary(siteId, reg, dayLedger) {
    const tasks = (reg && reg.tasks) || [];
    const recs = (dayLedger && dayLedger[siteId]) || {};
    let ok = 0, bad = 0, pending = 0;
    const rows = tasks.map(t => {
      const r = recs[t.id];
      const st = r ? r.status : 'none';
      if (st === 'success' || st === 'done' || st === 'notdue' || st === 'novote' || st === 'active') ok++;
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
  let panelOpen = false;

  function applyTheme() {
    if (!panelEl) return;
    const P = palette();
    panelEl.style.background = P.bg;
    panelEl.style.color = P.fg;
    panelEl.style.borderColor = P.border;
  }

  function render() {
    if (!panelEl) return;
    const P = palette();
    const registry = get('registry', {});
    const ledger = get('ledger', {});
    const siteInfo = get('siteInfo', {});
    const paused = get('paused', {});
    const monthly = get('monthly', {});
    const today = bjDate();
    const dayLedger = ledger[today] || {};
    const siteIds = Object.keys(registry);
    const curId = HOST2SITE[location.hostname] || '';
    const BS = 'background:' + P.btnBg + ';color:' + P.fg + ';border:1px solid ' + P.border + ';border-radius:6px;padding:2px 10px;cursor:pointer;font-size:12px;';
    let nAll = 0, nPart = 0, nFail = 0, nNone = 0;
    let html = '<div style="font-weight:bold;font-size:15px;margin-bottom:6px;">今日总览（' + today + '）' + (PANEL_VER ? ' <span style="font-size:11px;font-weight:normal;color:' + P.faint + ';">面板 v' + PANEL_VER + '</span>' : '') +
      '<button data-act="theme" title="主题：' + THEME_NAME[themeMode()] + '（点按切换）" style="float:right;font-weight:normal;font-size:14px;' + BS + '">' + THEME_ICON[themeMode()] + '</button></div>';
    let sitesHtml = '';
    siteIds.sort((a, b) => (a === curId ? -1 : (b === curId ? 1 : (a < b ? -1 : 1)))).forEach(id => {
      const reg = registry[id];
      const sum = siteSummary(id, reg, dayLedger);
      if (sum.level[0] === '全部成功') nAll++;
      else if (sum.level[0] === '全部失败') nFail++;
      else if (sum.level[0] === '未执行') nNone++;
      else nPart++;
      const isPaused = !!paused[id];
      const info = siteInfo[id] || {};
      const streakTxt = (info.cont != null || info.total != null) ? '：连续/累计签到（' + (info.cont != null ? info.cont : '-') + ' / ' + (info.total != null ? info.total : '-') + '）' : '';
      const nameHtml = SITE_HOME[id] ? '<a href="' + SITE_HOME[id] + '" target="_blank" rel="noopener" style="color:' + P.fg + ';text-decoration:none;border-bottom:1px dashed ' + P.sub + ';">' + reg.name + '</a>' : reg.name;
      sitesHtml += '<div style="border-top:1px solid ' + P.hr + ';padding:6px 0;">' +
        '<div><b>' + nameHtml + '</b>' + (reg.version ? ' <span style="font-size:11px;color:' + P.faint + ';">v' + reg.version + '</span>' : '') + (id === curId ? ' <span style="color:#2e9e4f;font-weight:bold;">（本站）</span>' : '') + streakTxt + ' <span style="color:' + sum.level[1] + ';font-weight:bold;">' + sum.level[0] + '</span>' +
        (isPaused ? ' <span style="color:' + P.faint + ';">（已暂停）</span>' : '') +
        ' <button data-act="pause" data-site="' + id + '" style="float:right;' + BS + '">' + (isPaused ? '恢复' : '暂停') + '</button></div>';
      sum.rows.forEach(row => {
        const st = STATUS[row.status] || STATUS.none;
        /* 成功类状态不显示说明文字（只有“获得 N 魔力”和 CarPT 进行中这类有用信息例外）；失败/等待才显示原因 */
        let detail = row.rec ? (row.rec.detail || '') : '';
        if (row.status === 'success' || row.status === 'done' || row.status === 'novote') {
          if (!/^(获得 [\d,]+ 魔力|任务：进行中)/.test(detail)) detail = '';
        }
        sitesHtml += '<div style="margin-left:12px;font-size:12px;">· ' + row.task.name +
          '：<span style="color:' + st[1] + ';">' + st[0] + '</span>' +
          (row.rec ? ' <span style="color:' + P.sub + ';">' + (row.rec.time || '') + (detail ? ' ' + detail : '') + '</span>' : '') +
          ((row.status === 'failed' || row.status === 'manual') ? ' <button data-act="retry" data-site="' + id + '" data-task="' + row.task.id + '" style="' + BS + '">' + ((retryDoneMap()[today] || {})[id + '/' + row.task.id] ? '今天已重试' : '重试') + '</button>' : '') +
          '</div>';
      });
      sitesHtml += '</div>';
    });
    html += '<div style="margin-bottom:4px;">共 ' + siteIds.length + ' 个网站：全部成功 ' + nAll + '，部分有问题 ' + nPart + '，全部失败 ' + nFail + '，未执行 ' + nNone + '</div>';
    html += sitesHtml || '<div style="color:' + P.faint + ';">还没有任何站点脚本登记过。先打开各个网站，脚本运行后这里就会有内容。</div>';
    html += '<div style="margin-top:8px;"><button data-act="export" style="' + BS + '">导出账本数据</button></div>' +
      '<div style="font-size:11px;color:' + P.faint + ';margin-top:4px;">整份数据备份请用脚本猫自带的备份功能（可走 WebDAV）。</div>';
    panelEl.innerHTML = html;
  }

  function showPanel() {
    if (!panelEl) {
      panelEl = document.createElement('div');
      panelEl.style.cssText = 'position:fixed;top:60px;right:16px;width:360px;max-height:75vh;overflow:auto;border:1px solid #bbb;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.25);z-index:2147483647;padding:12px;font-size:13px;line-height:1.5;';
      document.body.appendChild(panelEl);
  panelEl.addEventListener('click', e => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const act = btn.getAttribute('data-act');
        if (act === 'close') { hidePanel(); }
        if (act === 'theme') {
          const order = ['auto', 'light', 'dark'];
          const next = order[(order.indexOf(themeMode()) + 1) % order.length];
          set('panelTheme', next);
          applyTheme();
          render();
        }
        if (act === 'pause') {
          const site = btn.getAttribute('data-site');
          const paused = get('paused', {});
          paused[site] = !paused[site];
          set('paused', paused);
          render();
        }
        if (act === 'retry') {
          const rkey = btn.getAttribute('data-site') + '/' + btn.getAttribute('data-task');
          if ((retryDoneMap()[bjDate()] || {})[rkey]) { btn.textContent = '今天已重试'; btn.disabled = true; return; } // 今天已重试过就不再发（防重复执行）
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
    }
    panelEl.style.display = 'block';
    panelOpen = true;
    applyTheme();
    render();
  }
  function hidePanel() {
    if (panelEl) panelEl.style.display = 'none';
    panelOpen = false;
  }

  const btn = document.createElement('div');
  btn.textContent = '签到面板';
  btn.style.cssText = 'position:fixed;right:16px;bottom:16px;background:#2e9e4f;color:#fff;padding:8px 12px;border-radius:20px;cursor:pointer;z-index:2147483646;font-size:13px;box-shadow:0 3px 10px rgba(0,0,0,.3);';
  btn.addEventListener('click', () => { if (panelOpen) hidePanel(); else showPanel(); });
  document.body.appendChild(btn);

  /* 点面板以外的地方自动关闭 */
  document.addEventListener('mousedown', e => {
    if (!panelOpen || !panelEl) return;
    if (panelEl.contains(e.target) || btn.contains(e.target)) return;
    hidePanel();
  }, true);

  /* 系统主题变化时，若面板开着且模式为自动，跟着变 */
  try {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => { if (panelOpen && themeMode() === 'auto') { applyTheme(); render(); } };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  } catch (e) {}

  try { GM_registerMenuCommand('打开签到面板', showPanel); } catch (e) {}
  try { GM_addValueChangeListener('ledger', () => { if (panelOpen) render(); }); } catch (e) {}
  try { GM_addValueChangeListener('panelTheme', () => { if (panelOpen) { applyTheme(); render(); } }); } catch (e) {}
})();
