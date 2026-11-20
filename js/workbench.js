;(function (m) {
    'use strict';
    let githubGistToken;
    let giteeGistToken;
    let githubGistId;
    let giteeGistId;
    let gitHubApiUrl = "https://api.github.com";
    let giteeApiUrl = "https://gitee.com/api/v5";
    let pushToGithubGistStatus;
    let pullFromGithubGistStatus;
    let pushToGiteeGistStatus;
    let pullFromGiteeGistStatus;
    let handleGistLog = [];
    let sortableTitle;
    let sortableTabList = [];
    let sortableDelTitle;
    let sortableDelTabList = [];
    // 定义一个n次循环定时器
    let intervalId;
    let usedSeconds;
    let emojiReg = /[\uD83C|\uD83D|\uD83E][\uDC00-\uDFFF][\u200D|\uFE0F]|[\uD83C|\uD83D|\uD83E][\uDC00-\uDFFF]|[0-9|*|#]\uFE0F\u20E3|[0-9|#]\u20E3|[\u203C-\u3299]\uFE0F\u200D|[\u203C-\u3299]\uFE0F|[\u2122-\u2B55]|\u303D|[\A9|\AE]\u3030|\uA9|\uAE|\u3030/gi;
    let startTime;
    let endTime;
    // 定义一个桌面通知框id
    let notificationId;
    // 定义2种已使用状态标识变量
    let isStateOne = true;

    // ===== 主题（阶段B：暗黑模式） =====
    // themeMode 三档：light（浅色）/ dark（深色）/ auto（跟随系统，默认）
    let themeMode = "auto";
    let darkMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    // 由 themeMode 和系统是否深色算出实际主题（纯函数，方便单独测试）
    function resolveTheme(mode, systemDark) {
        if (mode === "light" || mode === "dark") {
            return mode;
        }
        return systemDark ? "dark" : "light";
    }

    function themeModeText(mode) {
        if (mode === "light") {
            return chrome.i18n.getMessage("themeLight");
        }
        if (mode === "dark") {
            return chrome.i18n.getMessage("themeDark");
        }
        return chrome.i18n.getMessage("themeAuto");
    }

    // 应用主题：给 <html> 设置 data-theme（css/workbench.css 靠它切换变量），
    // 同步 localStorage 镜像 themeModeMirror（供 nj-workbench.html 内联脚本下次打开时尽早读到，减少闪白），
    // 并更新导航菜单上显示的当前档位文案
    function applyTheme(mode) {
        themeMode = (mode === "light" || mode === "dark") ? mode : "auto";
        document.documentElement.setAttribute("data-theme", resolveTheme(themeMode, darkMediaQuery.matches));
        try {
            localStorage.setItem("themeModeMirror", themeMode);
        } catch (e) {
        }
        let themeBtn = document.getElementById("themeCycleBtn");
        if (themeBtn) {
            themeBtn.innerHTML = themeIcon(themeMode);
            let tip = chrome.i18n.getMessage("themeMode") + "：" + themeModeText(themeMode);
            themeBtn.title = tip;
            themeBtn.setAttribute("aria-label", tip);
        }
    }

    // 4.2 需求二：主题按钮只显示图标（太阳=白天、月亮=晚上、日月各半=自动），不要文字
    function themeIcon(mode) {
        if (mode === "dark") {
            return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
        }
        if (mode === "auto") {
            return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none"/></svg>';
        }
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
    }

    // 轮换顺序：白天 → 晚上 → 自动 → 白天（4.2 需求二）
    function nextThemeMode(mode) {
        if (mode === "light") {
            return "dark";
        }
        if (mode === "dark") {
            return "auto";
        }
        return "light";
    }

    function cycleThemeMode() {
        setThemeMode(nextThemeMode(themeMode));
    }

    // 用户在菜单里选了某一档：应用 + 存 chrome.storage.local（正式设置，键 themeMode）
    function setThemeMode(mode) {
        applyTheme(mode);
        chrome.storage.local.set({"themeMode": themeMode});
    }

    // auto 档下，系统深/浅色变化时实时跟着变
    function onSystemThemeChange() {
        if (themeMode === "auto") {
            applyTheme("auto");
        }
    }

    if (darkMediaQuery.addEventListener) {
        darkMediaQuery.addEventListener("change", onSystemThemeChange);
    } else if (darkMediaQuery.addListener) {
        darkMediaQuery.addListener(onSystemThemeChange);
    }

    // ===== 拖拽后 DOM 同步（阶段B：拖拽流畅度） =====
    // Sortable 在 onEnd 时已经把 DOM 节点移到了正确位置，所以 onEnd 只更新数据并保存、不再全量重渲染。
    // 但有两类按渲染序号写死的信息，拖完必须同步，否则后续操作会找错组/删错标签：
    // 1) 组容器的 id、组内 ul 的 id、组名 span/input 的 id —— moveTab 靠 evt.from/to.parentNode.id（组容器 id）判断来源/目标组；
    // 2) 组内标签数文案（跨组拖标签后出组 -1、入组 +1）。
    // 另外，视图事件处理里闭包捕获的序号 i/ii 在拖动后会过期，改为点击时按元素当前 DOM 位置现算
    // （见 currentGroupIndex/currentTabIndex 以及各处理函数里的 ci/cii）。
    // containerId：组列表容器 id（普通列表 tabGroups / 回收站 tabGroupsBak）
    // prefix：组内元素 id 前缀（普通列表 "" / 回收站 "del_"），ul 的 id 形如 prefix + "tabs_" + 序号
    function syncDragDomOrder(containerId, prefix) {
        let container = document.getElementById(containerId);
        if (!container) {
            return;
        }
        let groups = container.querySelectorAll(":scope > div.tabs");
        for (let k = 0; k < groups.length; k += 1) {
            let g = groups[k];
            g.id = k;
            let ul = g.querySelector("ul");
            if (ul) {
                ul.id = prefix + "tabs_" + k;
            }
            let nameSpan = g.querySelector(".group-name");
            if (nameSpan) {
                nameSpan.id = prefix + "groupTitle" + k;
            }
            let nameInput = g.querySelector(".group-title-input");
            if (nameInput) {
                nameInput.id = prefix + "groupTitleInput" + k;
            }
            // 备注的展示/编辑元素 id 同样写死了序号，一并重编号（回收站没有备注元素，查不到就跳过）
            let noteSpan = g.querySelector(".group-note");
            if (noteSpan) {
                noteSpan.id = prefix + "groupNote" + k;
            }
            let noteInput = g.querySelector(".group-note-input");
            if (noteInput) {
                noteInput.id = prefix + "groupNoteInput" + k;
            }
            let amount = g.querySelector(".group-amount");
            if (amount && ul) {
                amount.textContent = ul.children.length + chrome.i18n.getMessage("tabsNo");
            }
        }
    }

    // 点击时现算组序号：从被点击元素向上找到组容器（其父节点即组列表容器），返回它在同级组中的位置；找不到时回退到闭包旧序号
    function currentGroupIndex(el, fallback) {
        let node = el;
        while (node && node.parentNode && node.parentNode.id !== "tabGroups" && node.parentNode.id !== "tabGroupsBak") {
            node = node.parentNode;
        }
        if (!node || !node.parentNode) {
            return fallback;
        }
        let groups = node.parentNode.querySelectorAll(":scope > div.tabs");
        for (let k = 0; k < groups.length; k += 1) {
            if (groups[k] === node) {
                return k;
            }
        }
        return fallback;
    }

    // 点击时现算标签序号：被点击元素所在的 li 在其 ul 中的位置；找不到时回退到闭包旧序号
    function currentTabIndex(el, fallback) {
        let li = el;
        while (li && li.tagName !== "LI") {
            li = li.parentNode;
        }
        if (!li || !li.parentNode) {
            return fallback;
        }
        let items = li.parentNode.children;
        for (let k = 0; k < items.length; k += 1) {
            if (items[k] === li) {
                return k;
            }
        }
        return fallback;
    }

    // ===== 阶段C：单文件导出 / 完整备份导入 / WebDAV =====
    // 下面几个是尽量不依赖 DOM 和 chrome 的纯函数，方便用 Node 单独测试：
    // escapeHtml（HTML 转义）、isSafeExportUrl（导出链接协议白名单）、
    // buildBackupObject（构建完整备份对象）、sanitizeBackupObject（清洗备份对象）、
    // buildExportHtml（构建导出网页文件的内容）、buildWebDavFileUrl / buildBasicAuthHeader（WebDAV 辅助）。

    // HTML 转义：标签标题、组名等都是用户数据，直接拼进导出文件会变成 XSS 载体，必须先转义
    function escapeHtml(text) {
        if (text === null || typeof text === "undefined") {
            return "";
        }
        return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }

    // 只有这几种协议的网址才能在导出文件里做成可点链接，其余（如 javascript:、data:）只显示为纯文本
    function isSafeExportUrl(url) {
        if (typeof url !== "string") {
            return false;
        }
        return /^(https?|ftp|file):/i.test(url.trim());
    }

    // 构建完整备份对象：tabGroups / delTabGroups 原样放入，一个字段都不改，
    // 保证 date、id、isLock、isPined、groupTitle、deletedAt 无损往返
    function buildBackupObject(items, exportedAt, settings) {
        items = items || {};
        let backup = {
            app: "NJ-Tab",
            formatVersion: 1,
            appVersion: chrome.runtime.getManifest().version,
            exportedAt: exportedAt || new Date().toISOString(),
            tabGroups: Array.isArray(items.tabGroups) ? items.tabGroups : [],
            delTabGroups: Array.isArray(items.delTabGroups) ? items.delTabGroups : []
        };
        // 4.2 需求三：备份包含配置（只放白名单挑出的设置，见 pickBackupSettings；导出网页单文件不走这里、不受影响）
        if (settings && typeof settings === "object" && Object.keys(settings).length > 0) {
            backup.settings = settings;
        }
        return backup;
    }

    // 清洗备份对象（4.3 需求十四改版）：结构性问题（不是本插件备份、版本不对、主体不是数组）才整份拒绝（fatal）；
    // 单条标签/单个分组的毛病不再废掉整份——坏的跳过并逐条记录到 skipped（哪一组、哪一条、什么问题），
    // 其余照常导入/恢复。顺带给缺 addTime 的标签用分组时间补齐（老备份转换口径）。
    // 返回 {fatal, appVersion, tabGroups, delTabGroups, skipped}，tabGroups/delTabGroups 是清洗后的新数组。
    function sanitizeBackupObject(obj) {
        let result = {fatal: null, appVersion: null, tabGroups: [], delTabGroups: [], skipped: []};
        if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
            result.fatal = "notObject";
            return result;
        }
        if (obj.app !== "NJ-Tab") {
            result.fatal = "appMismatch";
            return result;
        }
        if (obj.formatVersion !== 1) {
            result.fatal = "versionMismatch";
            return result;
        }
        if (!Array.isArray(obj.tabGroups)) {
            result.fatal = "tabGroupsNotArray";
            return result;
        }
        if (typeof obj.delTabGroups !== "undefined" && !Array.isArray(obj.delTabGroups)) {
            result.fatal = "delTabGroupsNotArray";
            return result;
        }
        result.appVersion = typeof obj.appVersion === "string" ? obj.appVersion : null;
        function cleanList(list, listName) {
            let out = [];
            list.forEach(function (group, gi) {
                if (!group || typeof group !== "object" || Array.isArray(group) || !Array.isArray(group.tabs)) {
                    result.skipped.push({list: listName, groupIndex: gi, groupTitle: (group && typeof group.groupTitle === "string") ? group.groupTitle : "", tabIndex: -1, tabTitle: "", tabUrl: "", reason: "groupInvalid"});
                    return;
                }
                let keptTabs = [];
                group.tabs.forEach(function (tab, ti) {
                    if (!tab || typeof tab !== "object" || Array.isArray(tab)) {
                        result.skipped.push({list: listName, groupIndex: gi, groupTitle: group.groupTitle || "", tabIndex: ti, tabTitle: "", tabUrl: "", reason: "tabNotObject"});
                        return;
                    }
                    if (typeof tab.url !== "string" || tab.url.length === 0) {
                        result.skipped.push({list: listName, groupIndex: gi, groupTitle: group.groupTitle || "", tabIndex: ti, tabTitle: (typeof tab.title === "string" ? tab.title : ""), tabUrl: "", reason: "tabUrlMissing"});
                        return;
                    }
                    if ((typeof tab.addTime !== "string" || !tab.addTime) && typeof group.date === "string" && group.date) {
                        tab.addTime = group.date;
                    }
                    keptTabs.push(tab);
                });
                if (group.tabs.length > 0 && keptTabs.length === 0) {
                    // 整组的标签都坏了：组也不进（坏条目已逐条记进 skipped）
                    return;
                }
                out.push(Object.assign({}, group, {tabs: keptTabs}));
            });
            return out;
        }
        result.tabGroups = cleanList(obj.tabGroups, "tabGroups");
        result.delTabGroups = cleanList(Array.isArray(obj.delTabGroups) ? obj.delTabGroups : [], "delTabGroups");
        return result;
    }

    // 跳过原因代号 → 人话：日志里不许再出现 tabUrlMissing 这类英文代号（审查第四项）
    const NJ_SKIP_REASON_TEXT = {
        groupInvalid: "这一组的结构不对（不是正常分组，或没有标签列表）",
        tabNotObject: "这条标签的格式不对",
        tabUrlMissing: "这条标签没有有效网址（网址为空）",
        notObject: "文件内容不是有效的备份数据",
        appMismatch: "这不是 NJ-Tab 的备份文件",
        versionMismatch: "备份文件的格式版本不对",
        tabGroupsNotArray: "备份文件里的标签组列表坏了",
        delTabGroupsNotArray: "备份文件里的回收站列表坏了"
    };
    function njReasonText(reason) {
        return NJ_SKIP_REASON_TEXT[reason] || reason;
    }

    // 一条被跳过数据的日志说明：写清哪一组、哪一条、什么问题（4.3 需求十四：出错要给明确日志）
    function njSkippedDetail(s) {
        let where = (s.list === "delTabGroups" ? "回收站 " : "") + "第" + (s.groupIndex + 1) + "组" + (s.groupTitle ? "「" + s.groupTitle + "」" : "");
        if (s.tabIndex < 0) {
            return where + " 整组被跳过：" + njReasonText(s.reason);
        }
        let tabName = s.tabTitle ? "「" + s.tabTitle + "」" : "（无标题）";
        return where + " 第" + (s.tabIndex + 1) + "条" + tabName + "：" + njReasonText(s.reason);
    }

    // ===== 4.2 需求三：备份包含配置 =====
    // 进备份的配置键白名单：主题、各项开关、自动备份与保留规则、日志清理设置等用户配置。
    // 红线：WebDAV 地址/账号/密码、GitHub/Gitee 令牌、加密密钥、Gist 编号、日志内容、运行状态一律不进备份。
    const BACKUP_SETTING_KEYS = ["themeMode", "options", "dragType", "autoSync", "delRetentionDays", "restoreDiscarded", "discardedThreshold", "webdavAutoBackup", "webdavIntervalHours", "webdavKeepDays", "webdavKeepCount", "gistAutoEnabled", "gistAutoIntervalMinutes", "logAutoCleanEnabled", "logKeepDays", "logKeepCount"];

    // 只挑白名单键（source 里有才带上），备份和恢复两边都用它把关
    function pickBackupSettings(source) {
        let out = {};
        if (!source || typeof source !== "object") {
            return out;
        }
        BACKUP_SETTING_KEYS.forEach(function (key) {
            if (typeof source[key] !== "undefined") {
                out[key] = source[key];
            }
        });
        return out;
    }

    function collectBackupSettings(callback) {
        chrome.storage.local.get(BACKUP_SETTING_KEYS, function (items) {
            callback(pickBackupSettings(items || {}));
        });
    }

    // 恢复备份时一并恢复配置：只写白名单键；主题立即生效，其余设置在下次读取时生效
    function applyBackupSettings(settings) {
        let clean = pickBackupSettings(settings);
        if (!Object.keys(clean).length) {
            return false;
        }
        chrome.storage.local.set(clean);
        if (clean.themeMode) {
            applyTheme(clean.themeMode);
        }
        return true;
    }

    // Gist 推送前把配置挂到内容对象上（内容为空数组等异常情况原样放行）
    function withBackupSettings(content, fn) {
        if (!content || typeof content !== "object" || Array.isArray(content)) {
            fn(content);
            return;
        }
        collectBackupSettings(function (settings) {
            if (Object.keys(settings).length) {
                content.settings = settings;
            }
            fn(content);
        });
    }

    // ===== 4.4 需求八：导入去重 =====
    // 判重口径（用户拍板）：逐条比对，网址和标题都和已有标签完全一样才算重复，跨组也算重复；
    // 只用在备份文件导入与文本导入（追加合并型）；WebDAV 恢复与 Gist 拉取是覆盖式，不走这里。
    function njTabDupKey(tab) {
        return (tab && typeof tab.url === "string" ? tab.url : "") + "\n" + (tab && typeof tab.title === "string" ? tab.title : "");
    }

    function njBuildDupSet(groups) {
        let set = new Set();
        (Array.isArray(groups) ? groups : []).forEach(function (g) {
            (g && Array.isArray(g.tabs) ? g.tabs : []).forEach(function (t) {
                set.add(njTabDupKey(t));
            });
        });
        return set;
    }

    // 从一批待导入标签里滤掉重复的，返回 {kept, dupCount}；kept 的键同时加进 set，
    // 所以同一批导入里后出现的重复也会被跳过（先到先得，与"本地已有就跳过"同一口径）
    function njFilterDupTabs(tabs, set) {
        let kept = [];
        let dupCount = 0;
        (Array.isArray(tabs) ? tabs : []).forEach(function (t) {
            let k = njTabDupKey(t);
            if (set.has(k)) {
                dupCount += 1;
            } else {
                set.add(k);
                kept.push(t);
            }
        });
        return {kept: kept, dupCount: dupCount};
    }

    // ===== 4.2 需求四：统一操作日志 =====
    // 存 chrome.storage.local 的 njLogs 数组：{t: 时间戳, action: 动作, ok: 成功与否, detail: 简短说明}
    // 绝不记密码/令牌原文。自动清理：logAutoCleanEnabled（默认开）、logKeepDays（默认 30 天）、logKeepCount（默认 500 条），与 background.js 同一套规则
    function njLogEvent(action, ok, detail, steps) {
        chrome.storage.local.get(["njLogs", "logAutoCleanEnabled", "logKeepDays", "logKeepCount"], function (st) {
            let logs = Array.isArray(st.njLogs) ? st.njLogs : [];
            let njEntry = {t: Date.now(), action: String(action), ok: !!ok, detail: detail ? String(detail).slice(0, 200) : ""};
            if (Array.isArray(steps) && steps.length) {
                njEntry.steps = steps.map(function (s) { return String(s).slice(0, 300); });
            }
            logs.push(njEntry);
            if (st.logAutoCleanEnabled !== false) {
                let keepDays = parseInt(st.logKeepDays, 10) || 30;
                let keepCount = parseInt(st.logKeepCount, 10) || 500;
                let cutoff = Date.now() - keepDays * 86400000;
                logs = logs.filter(function (e) { return e && e.t >= cutoff; });
                if (logs.length > keepCount) {
                    logs = logs.slice(logs.length - keepCount);
                }
            }
            chrome.storage.local.set({njLogs: logs});
        });
    }

    function njLogActionText(action) {
        return chrome.i18n.getMessage("logAction_" + action) || action;
    }

    // ===== 4.3 需求六：日志页改版（四分区） =====
    // 分区：Gist 备份 / WebDAV / 导入导出 / 操作日志（其余动作都进操作日志）。
    // 过程日志（gistLog，一次推送/拉取一组、每步一行）整体并入 Gist 区：一次操作算一条，步骤收进详情点开看。
    // 每区默认只显示最近 5 条，「查看更多」展开全区；每条一行（时间 · 动作 · 结果），点条目展开详情。
    const NJ_LOG_SECTIONS = [
        {key: "gist", titleKey: "logSectionGist", actions: ["gistPush", "gistPull", "gistAutoBackup", "gistRateLimited", "gistAutoBackupRateLimited", "gistAutoBackupSkipped"]},
        {key: "webdav", titleKey: "logSectionWebdav", actions: ["webdavUpload", "webdavRestore", "webdavForceBackup", "webdavAutoBackup", "webdavCleanup", "webdavTest"]},
        {key: "impexp", titleKey: "logSectionImportExport", actions: ["importBackup", "importText", "exportBackup", "exportPage"]},
        {key: "ops", titleKey: "logSectionOps", actions: null}
    ];
    const NJ_LOG_PROCESS_LABELS = {push_github: "clickPushGithub", pull_github: "clickPullGithub", push_gitee: "clickPushGitee", pull_gitee: "clickPullGitee"};
    let njLogExpandedSections = {};
    let njLogExpandedEntries = {};

    function njLogSectionOf(action) {
        for (let i = 0; i < NJ_LOG_SECTIONS.length; i++) {
            let s = NJ_LOG_SECTIONS[i];
            if (s.actions && s.actions.indexOf(action) >= 0) {
                return s.key;
            }
        }
        return "ops";
    }

    // 销毁拖拽实例的安全包装：列表重绘后旧实例绑定的容器可能已被换掉，Sortable 库内部
    // 解绑事件会对空对象报错（错误页的 removeEventListener 那条），统一在这里兜住（审查第八项）
    function njSafeDestroySortable(inst) {
        try { if (inst) { inst.destroy(); } } catch (e) {}
        return undefined;
    }

    function renderNjLogs() {
        let panel = document.getElementById("njLogsPanel");
        if (!panel) {
            return;
        }
        chrome.storage.local.get(["njLogs", "gistLog", "logAutoCleanEnabled", "logKeepDays", "logKeepCount"], function (st) {
            // 汇总成统一条目：{t, label, ok(true/false/null), detail, steps[]}
            let bySection = {gist: [], webdav: [], impexp: [], ops: []};
            let opLogs = Array.isArray(st.njLogs) ? st.njLogs : [];
            opLogs.forEach(function (e) {
                if (!e || typeof e.t !== "number") { return; }
                bySection[njLogSectionOf(e.action)].push({
                    t: e.t, label: njLogActionText(e.action), ok: !!e.ok,
                    detail: e.detail || "", steps: Array.isArray(e.steps) ? e.steps : null
                });
            });
            let processLogs = Array.isArray(st.gistLog) ? st.gistLog : [];
            processLogs.forEach(function (g) {
                if (!g) { return; }
                let labelKey = NJ_LOG_PROCESS_LABELS[g.handleGistType];
                // 时间：新条目自带 t；老条目没有 t，就从编号前 8 位（生成那一刻的时间戳）还原，都是真时间、不造假
                let gt = typeof g.t === "number" ? g.t : 0;
                if (!gt && typeof g.id === "string" && /^[0-9a-f]{8}/i.test(g.id)) {
                    gt = parseInt(g.id.slice(0, 8), 16) * 1000;
                }
                if (!gt && typeof g.id === "number" && g.id > 1000000000000) {
                    gt = g.id;
                }
                // 结果：新条目自带 ok；老条目按步骤里有没有「失败」字样推断
                let gSteps = Array.isArray(g.handleGistLogs) ? g.handleGistLogs : [];
                let gOk = typeof g.ok === "boolean" ? g.ok : (gSteps.length ? !gSteps.some(function (line) { return /失败|Failed|failed/.test(String(line)); }) : null);
                bySection.gist.push({
                    t: gt,
                    label: labelKey ? chrome.i18n.getMessage(labelKey) : (g.handleGistType || ""),
                    ok: gOk,
                    detail: "",
                    steps: gSteps
                });
            });
            // 顶栏状态改成日志口径（4.3 需求十三）：文字与悬停都说日志总条数
            let totalCount = opLogs.length + processLogs.length;
            let totalsEl = document.getElementById("totals");
            if (totalsEl) {
                totalsEl.innerHTML = `${totalCount}${chrome.i18n.getMessage("totals")}`;
                totalsEl.title = `${chrome.i18n.getMessage("showLog")}：${totalCount}${chrome.i18n.getMessage("totals")}`;
            }
            let sectionsHtml = NJ_LOG_SECTIONS.map(function (s) {
                let entries = bySection[s.key].slice().sort(function (a, b) { return b.t - a.t; });
                let expanded = !!njLogExpandedSections[s.key];
                let shown = expanded ? entries : entries.slice(0, 5);
                let rows = shown.map(function (e, idx) {
                    let eid = s.key + "_" + idx;
                    let time = e.t ? new Date(e.t).toLocaleString() : "";
                    let state = e.ok === null ? "" : (e.ok
                        ? ` · <span style="color:green;">${chrome.i18n.getMessage("logSuccess")}</span>`
                        : ` · <span style="color:red;">${chrome.i18n.getMessage("logFailed")}</span>`);
                    let hasDetail = (e.steps && e.steps.length > 0) || !!e.detail;
                    let detailShort = "";
                    if (e.detail) {
                        let d = e.detail.length > 80 ? e.detail.slice(0, 80) + "…" : e.detail;
                        detailShort = " · " + escapeHtml(d);
                    }
                    let detailHtml = "";
                    if (hasDetail && njLogExpandedEntries[eid]) {
                        let body = e.steps && e.steps.length > 0
                            ? e.steps.map(function (line) { return escapeHtml(String(line)); }).join("<br>")
                            : escapeHtml(e.detail);
                        detailHtml = `<div style="padding:6px 10px;margin:2px 0 6px;background:rgba(127,127,127,.08);border-radius:4px;font-size:92%;">${body}</div>`;
                    }
                    let cursor = hasDetail ? "cursor:pointer;" : "";
                    let arrow = hasDetail ? (njLogExpandedEntries[eid] ? " ▾" : " ▸") : "";
                    return `<div data-njlog-entry="${hasDetail ? eid : ""}" style="padding:4px 0;border-bottom:1px solid #eee;${cursor}">${time} · ${escapeHtml(e.label)}${state}${detailShort}${arrow}</div>${detailHtml}`;
                }).join("");
                let moreHtml = "";
                if (entries.length > 5) {
                    moreHtml = `<div style="padding:4px 0;"><button type="button" class="btn btn-link btn-sm" style="padding:0;" data-njlog-more="${s.key}">${chrome.i18n.getMessage(expanded ? "logCollapse" : "logShowMore")}（${entries.length}）</button></div>`;
                }
                return `<h4 style="margin-top:18px;">${chrome.i18n.getMessage(s.titleKey)}</h4><div>${rows || chrome.i18n.getMessage("logEmpty")}</div>${moreHtml}`;
            }).join("");
            panel.innerHTML = `
                <h4>${chrome.i18n.getMessage("logPanelTitle")}</h4>
                <div class="form-inline" style="margin-bottom:10px;">
                    <label style="margin-right:12px;"><input type="checkbox" id="logAutoCleanEnabled" ${st.logAutoCleanEnabled !== false ? "checked" : ""}> ${chrome.i18n.getMessage("logAutoClean")}</label>
                    <label style="margin-right:12px;">${chrome.i18n.getMessage("logKeepDays")} <input type="number" id="logKeepDays" class="form-control" style="width:90px;display:inline-block;" min="1" value="${parseInt(st.logKeepDays, 10) || 30}"></label>
                    <label>${chrome.i18n.getMessage("logKeepCount")} <input type="number" id="logKeepCount" class="form-control" style="width:100px;display:inline-block;" min="1" value="${parseInt(st.logKeepCount, 10) || 500}"></label>
                </div>
                ${sectionsHtml}`;
            document.getElementById("logAutoCleanEnabled").addEventListener("change", function () {
                chrome.storage.local.set({logAutoCleanEnabled: this.checked});
            });
            document.getElementById("logKeepDays").addEventListener("change", function () {
                chrome.storage.local.set({logKeepDays: Math.max(1, parseInt(this.value, 10) || 30)});
            });
            document.getElementById("logKeepCount").addEventListener("change", function () {
                chrome.storage.local.set({logKeepCount: Math.max(1, parseInt(this.value, 10) || 500)});
            });
            // 分区展开/条目详情：事件委托，点完重渲染（展开状态记在模块变量里）
            panel.querySelectorAll("[data-njlog-more]").forEach(function (el) {
                el.addEventListener("click", function () {
                    let key = el.getAttribute("data-njlog-more");
                    njLogExpandedSections[key] = !njLogExpandedSections[key];
                    renderNjLogs();
                });
            });
            panel.querySelectorAll("[data-njlog-entry]").forEach(function (el) {
                let eid = el.getAttribute("data-njlog-entry");
                if (!eid) { return; }
                el.addEventListener("click", function () {
                    njLogExpandedEntries[eid] = !njLogExpandedEntries[eid];
                    renderNjLogs();
                });
            });
        });
    }

    // 构建导出网页文件（单个 .html）的全部内容。
    // options 里传文案（标题、导出时间标签、锁定/置顶文案），不传时用默认英文，方便单独测试。
    function buildExportHtml(tabGroups, options) {
        options = options || {};
        let pageTitle = options.title || "NJ-Tab";
        let exportedAtText = options.exportedAtText || "Exported at";
        let exportedAt = options.exportedAt || "";
        let lockedText = options.lockedText || "Locked";
        let pinnedText = options.pinnedText || "Pinned";
        let groups = Array.isArray(tabGroups) ? tabGroups : [];
        let parts = [];
        parts.push("<!DOCTYPE html>");
        parts.push("<html><head><meta charset=\"utf-8\">");
        parts.push("<title>" + escapeHtml(pageTitle) + "</title>");
        parts.push("<style>body{font-family:-apple-system,'Segoe UI',Arial,sans-serif;margin:2em auto;max-width:960px;padding:0 1em;line-height:1.7;color:#222;background:#fff}a{color:#234da7;text-decoration:none}a:hover{text-decoration:underline}.meta{color:#888;font-size:.9em}h2{margin-top:1.4em;border-bottom:1px solid #ddd;padding-bottom:.2em}@media (prefers-color-scheme: dark){body{background:#1e1e1e;color:#ddd}a{color:#7aa5ff}h2{border-bottom-color:#444}}</style>");
        parts.push("</head><body>");
        parts.push("<h1>" + escapeHtml(pageTitle) + "</h1>");
        if (exportedAt) {
            parts.push("<p class=\"meta\">" + escapeHtml(exportedAtText) + ": " + escapeHtml(exportedAt) + "</p>");
        }
        for (let i = 0; i < groups.length; i++) {
            let group = groups[i] || {};
            let groupTitle = (typeof group.groupTitle === "string" && group.groupTitle !== "undefined") ? group.groupTitle : "";
            let heading = groupTitle || group.date || "";
            parts.push("<h2>" + escapeHtml(heading) + "</h2>");
            let marks = [];
            if (group.date) {
                marks.push(escapeHtml(group.date));
            }
            if (group.isLock) {
                marks.push(escapeHtml(lockedText));
            }
            if (group.isPined) {
                marks.push(escapeHtml(pinnedText));
            }
            if (marks.length > 0) {
                parts.push("<p class=\"meta\">" + marks.join(" · ") + "</p>");
            }
            parts.push("<ul>");
            let tabs = Array.isArray(group.tabs) ? group.tabs : [];
            for (let j = 0; j < tabs.length; j++) {
                let tab = tabs[j] || {};
                let tabTitle = (typeof tab.title === "string" && tab.title.trim()) ? tab.title : tab.url;
                if (isSafeExportUrl(tab.url)) {
                    parts.push("<li><a href=\"" + escapeHtml(tab.url.trim()) + "\" target=\"_blank\" rel=\"noopener noreferrer\">" + escapeHtml(tabTitle) + "</a></li>");
                } else {
                    // 危险/未知协议：标题和网址都只显示为纯文本，绝不进 href
                    let line = escapeHtml(tabTitle);
                    if (tab.url && tab.url !== tabTitle) {
                        line += " (" + escapeHtml(tab.url) + ")";
                    }
                    parts.push("<li>" + line + "</li>");
                }
            }
            parts.push("</ul>");
        }
        parts.push("</body></html>");
        return parts.join("\n");
    }

    // 拼 WebDAV 文件的完整地址：服务器地址末尾斜杠和文件名开头斜杠都先去掉，避免双斜杠；文件名按段做 URL 编码
    function buildWebDavFileUrl(baseUrl, fileName) {
        let base = String(baseUrl || "").trim().replace(/\/+$/, "");
        let file = String(fileName || "").trim().replace(/^\/+/, "") || "NJ-Tab-Backup.json";
        let encodedFile = file.split("/").map(function (seg) {
            return encodeURIComponent(seg);
        }).join("/");
        return base + "/" + encodedFile;
    }

    // 生成 HTTP Basic 认证头。密码可能含中文等非 ASCII 字符，不能直接 btoa（会抛错或乱码）：
    // 先用 TextEncoder 把 "账号:密码" 编成 UTF-8 字节，再逐字节转成二进制字符串后 btoa；没有 TextEncoder 时用 encodeURIComponent+unescape 兜底，效果相同。
    function buildBasicAuthHeader(user, password) {
        let raw = String(user || "") + ":" + String(password || "");
        let binary;
        if (typeof TextEncoder !== "undefined") {
            let bytes = new TextEncoder().encode(raw);
            binary = "";
            for (let i = 0; i < bytes.length; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
        } else {
            binary = unescape(encodeURIComponent(raw));
        }
        return "Basic " + btoa(binary);
    }

    // ===== 阶段D：全局搜索 / 标签组备注 / 恢复时休眠打开 =====
    // 全局搜索（纯函数，可单测）：给定标签组数组和关键词，返回命中的组与标签。
    // 匹配规则（不区分大小写）：
    // - 组名命中 → 该组全部标签计入结果；
    // - 否则，标签标题或网址命中 → 该标签计入结果。
    // 返回 {groups: [{groupTitle, date, note, tabs: [{title, url}]}], groupCount, tabCount}；
    // 关键词为空（或只有空白）时返回空结果。结果只用于只读展示，里面的序号不参与任何数据操作。
    function searchTabGroups(tabGroups, keyword) {
        let result = {groups: [], groupCount: 0, tabCount: 0};
        let kw = (keyword === null || typeof keyword === "undefined") ? "" : String(keyword).trim().toLowerCase();
        if (!kw || !Array.isArray(tabGroups)) {
            return result;
        }
        for (let i = 0; i < tabGroups.length; i++) {
            let group = tabGroups[i] || {};
            // groupTitle 的历史怪值 "undefined"（字符串）按空处理，与导出代码保持一致
            let groupTitle = (typeof group.groupTitle === "string" && group.groupTitle !== "undefined") ? group.groupTitle : "";
            let tabs = Array.isArray(group.tabs) ? group.tabs : [];
            let matchedTabs;
            if (groupTitle.toLowerCase().indexOf(kw) !== -1) {
                // 组名命中：整组标签都算命中
                matchedTabs = tabs.slice();
            } else {
                matchedTabs = tabs.filter(function (tab) {
                    if (!tab) {
                        return false;
                    }
                    let titleHit = typeof tab.title === "string" && tab.title.toLowerCase().indexOf(kw) !== -1;
                    let urlHit = typeof tab.url === "string" && tab.url.toLowerCase().indexOf(kw) !== -1;
                    return titleHit || urlHit;
                });
            }
            if (matchedTabs.length > 0) {
                // 4.4 需求二：带上真实序号（组 gi、每条的 ti）与锁定状态，搜索页才能安全地删对条、跳对组
                result.groups.push({
                    groupTitle: groupTitle,
                    date: group.date || "",
                    note: (typeof group.note === "string") ? group.note : "",
                    isLock: !!group.isLock,
                    gi: i,
                    tabs: matchedTabs,
                    tabIndices: matchedTabs.map(function (t) { return tabs.indexOf(t); })
                });
                result.groupCount += 1;
                result.tabCount += matchedTabs.length;
            }
        }
        return result;
    }

    // 批量恢复时打开一个标签：
    // useDiscarded 为 false 时与原行为完全一致（chrome.tabs.create({url})）；
    // 为 true 时先以未激活方式打开，再立刻 discard 成休眠状态（点开才真正加载，省内存），
    // discard 失败只吞掉错误，不影响其他标签继续打开。
    // 打开一个恢复的标签。休眠方式（4.4 需求五修 Bug）：旧做法是建完立刻 discard，
    // 标签页还没提交导航就被冻结，网址会丢、激活后是空白页。改成等加载完成（网址已提交）再 discard；
    // 加载卡住时 15 秒兜底（此时网址早已提交）。tabs.create 本身不支持直接建休眠标签（实测报错）。
    function openRestoredTab(url, useDiscarded) {
        if (!useDiscarded) {
            chrome.tabs.create({
                url: url
            });
            return;
        }
        chrome.tabs.create({
            url: url, active: false
        }, function (tab) {
            if (!tab || !tab.id) {
                return;
            }
            let tabId = tab.id;
            let done = false;
            function doDiscard() {
                if (done) return;
                done = true;
                chrome.tabs.onUpdated.removeListener(listener);
                chrome.tabs.discard(tabId, function () {
                    void chrome.runtime.lastError;
                });
            }
            function listener(id, changeInfo) {
                if (id === tabId && changeInfo.status === 'complete') {
                    doDiscard();
                }
            }
            chrome.tabs.onUpdated.addListener(listener);
            setTimeout(doDiscard, 15000);
            if (tab.status === 'complete') {
                doDiscard();
            }
        });
    }

    // 渲染搜索结果到独立的只读结果区 #searchResults（阶段D，全局搜索）。
    // 安全设计：结果区只展示组名/日期/备注和标签链接，点击标签只打开它，
    // 不放任何删除/拖拽/改名按钮——过滤后的序号永远不会被拿去操作数据，杜绝删错。
    // 所有文字都用 textContent 写入（等价于 mithril 文本节点），不存在 HTML 注入。
    // 关键词为空时隐藏结果区并恢复原列表；有关键词时隐藏原列表、只显示结果区。
    // ===== 4.4 需求七：搜索改成独立页面；需求二：搜索结果可管理（删除/跳转/锁定组小锁） =====
    // 在搜索框输词按回车，整页切换到搜索页（#search）：首页发起搜主列表、回收站发起搜回收站，两边不混。
    // 结果按 50 组一段分段（搜索范围仍是全量）；每条标签行首有删除与跳转两个图标，间距拉开防误点；
    // 锁定组的删除图标先显示为小锁，点小锁单条解锁（只当次有效）后才出现删除图标；删单条不确认。
    let njSearchState = {keyword: "", source: "home", limit: 50, unlocked: {}, scrollY: null};
    // 4.4 需求三补强：首页锁定组单条解锁的内存标记（组id|网址+标题）。只在页面内存里、绝不落盘、页面重载即清；
    // 有了它，对账重渲染也不会把刚解锁的删除叉打回小锁（解锁仍只当次有效，关掉/刷新页面即恢复小锁）
    let njHomeUnlockedTabs = new Set();

    function njGoSearch() {
        let input = document.getElementById("searchInput");
        if (!input) {
            return;
        }
        let keyword = input.value.trim();
        if (!keyword) {
            return;
        }
        // 4.4.1 审查问题二：在搜索页里再按回车时沿用已有来源（从回收站进来就一直只搜回收站），不能掉回主页
        let njSearchSource = njCurrentPage === "#baks" ? "baks" : (njCurrentPage === "#search" ? njSearchState.source : "home");
        njSearchState = {keyword: keyword, source: njSearchSource, limit: 50, unlocked: {}, scrollY: null};
        window.location.hash = "#search";
    }

    function njMakeSearchDeleteBtn(gi, ti) {
        let delEl = document.createElement("span");
        delEl.className = "nj-search-delete";
        delEl.title = chrome.i18n.getMessage("deleteThisTab");
        delEl.textContent = "\u2716";
        delEl.addEventListener("click", function () {
            njSearchDeleteTab(gi, ti);
        });
        return delEl;
    }

    // 在搜索页删掉一条：主列表来源与主列表删单条同口径（移进回收站）；回收站来源就是彻底删除。删后清掉单条解锁标记（序号会变）
    function njSearchDeleteTab(gi, ti) {
        let source = njSearchState.source;
        njLoadData(function (items) {
            if (!items) {
                return;
            }
            if (source === "baks") {
                let dg = items.delTabGroups;
                if (!dg[gi] || !dg[gi].tabs || !dg[gi].tabs[ti]) {
                    return;
                }
                dg[gi].tabs.splice(ti, 1);
                njSaveAll("del", dg);
            } else {
                let tg = items.tabGroups;
                if (!tg[gi] || !tg[gi].tabs || !tg[gi].tabs[ti]) {
                    return;
                }
                let removed = tg[gi].tabs.splice(ti, 1);
                njSaveAll("object", tg);
                if (removed.length) {
                    saveDelTabGroup(makeTabGroup(removed), "del");
                }
            }
            njSearchState.unlocked = {};
            njSearchState.scrollY = window.scrollY;
            showSearchPage();
        });
    }

    // 跳转到所在组：回来源页，必要时先把分段上限扩到能含住该组，渲染后滚动定位并高亮一下
    function njJumpToGroup(source, gi) {
        if (source === "baks") {
            if (gi >= njBaksRenderLimit) {
                njBaksRenderLimit = (Math.floor(gi / 50) + 1) * 50;
            }
            window.location.hash = "#baks";
        } else {
            if (gi >= njHomeRenderLimit) {
                njHomeRenderLimit = (Math.floor(gi / 50) + 1) * 50;
            }
            window.location.hash = "#home";
        }
        let tries = 0;
        let timer = setInterval(function () {
            tries += 1;
            let container = document.getElementById(source === "baks" ? "tabGroupsBak" : "tabGroups");
            let el = container ? container.querySelectorAll(".tabs")[gi] : null;
            if (el) {
                clearInterval(timer);
                el.scrollIntoView({block: "center"});
                el.classList.add("nj-jump-highlight");
                setTimeout(function () {
                    el.classList.remove("nj-jump-highlight");
                }, 2200);
            } else if (tries > 14) {
                clearInterval(timer);
            }
        }, 160);
    }

    function showSearchPage() {
        njCurrentPage = "#search";
        $("#logs").addClass("hide");
        $("#njLogsPanel").addClass("hide");
        $("#gistPage").addClass("hide");
        $("#webdavPage").addClass("hide");
        $("#options").addClass("hide");
        $("#importOneTab").addClass("hide");
        $("#tabGroups").addClass("hide");
        $("#tabGroupsBak").addClass("hide");
        $("#importDefault").addClass("hide");
        $("#exportDefault").addClass("hide");
        $("#searchArea").removeClass("hide");
        let pageEl = document.getElementById("searchPage");
        if (!pageEl) {
            return;
        }
        pageEl.classList.remove("hide");
        let keyword = njSearchState.keyword;
        let source = njSearchState.source;
        njLoadData(function (items) {
            // 异步读数期间用户可能已换词或离开搜索页，过期结果直接丢弃
            if (njCurrentPage !== "#search" || njSearchState.keyword !== keyword || njSearchState.source !== source) {
                return;
            }
            let arr = items ? (source === "baks" ? items.delTabGroups : items.tabGroups) : [];
            let res = searchTabGroups(arr, keyword);
            pageEl.innerHTML = "";
            let countEl = document.createElement("div");
            countEl.className = "search-result-count";
            countEl.textContent = chrome.i18n.getMessage("searchResults") + res.groupCount + chrome.i18n.getMessage("group") + " / " + res.tabCount + chrome.i18n.getMessage("tabsNo") + (source === "baks" ? chrome.i18n.getMessage("searchInTrash") : "");
            pageEl.appendChild(countEl);
            if (res.groupCount === 0) {
                let emptyEl = document.createElement("div");
                emptyEl.className = "search-no-results";
                emptyEl.textContent = chrome.i18n.getMessage("searchNoResults");
                pageEl.appendChild(emptyEl);
            }
            let shown = 0;
            res.groups.forEach(function (group) {
                if (shown >= njSearchState.limit) {
                    return;
                }
                shown += 1;
                let groupEl = document.createElement("div");
                groupEl.className = "search-result-group tabs";
                let titleEl = document.createElement("div");
                let nameEl = document.createElement("span");
                nameEl.className = "group-name";
                nameEl.textContent = group.groupTitle || group.date || "";
                titleEl.appendChild(nameEl);
                groupEl.appendChild(titleEl);
                if (group.note) {
                    let noteEl = document.createElement("div");
                    noteEl.className = "group-note";
                    noteEl.textContent = group.note;
                    groupEl.appendChild(noteEl);
                }
                let ulEl = document.createElement("ul");
                group.tabs.forEach(function (tab, idx) {
                    let ti = group.tabIndices[idx];
                    let liEl = document.createElement("li");
                    liEl.className = source === "baks" ? "li-hover li-standard strikethrough" : "li-hover li-standard";
                    let lockedHere = source === "home" && group.isLock && !njSearchState.unlocked[group.gi + ":" + ti];
                    if (lockedHere) {
                        let lockEl = document.createElement("span");
                        lockEl.className = "nj-search-lock";
                        lockEl.title = chrome.i18n.getMessage("unlockThisTab");
                        let lockImg = document.createElement("img");
                        lockImg.src = "/images/lock.png";
                        lockImg.className = "nj-search-lock-img";
                        lockEl.appendChild(lockImg);
                        lockEl.addEventListener("click", function () {
                            njSearchState.unlocked[group.gi + ":" + ti] = true;
                            lockEl.replaceWith(njMakeSearchDeleteBtn(group.gi, ti));
                        });
                        liEl.appendChild(lockEl);
                    } else {
                        liEl.appendChild(njMakeSearchDeleteBtn(group.gi, ti));
                    }
                    let jumpEl = document.createElement("span");
                    jumpEl.className = "nj-search-jump";
                    jumpEl.title = chrome.i18n.getMessage("jumpToGroup");
                    jumpEl.textContent = "\u279c";
                    jumpEl.addEventListener("click", function () {
                        njJumpToGroup(source, group.gi);
                    });
                    liEl.appendChild(jumpEl);
                    let linkEl = document.createElement("span");
                    linkEl.className = "link";
                    linkEl.title = (tab.title || "") + "\n" + (tab.url || "");
                    linkEl.textContent = tab.title || tab.url || "";
                    linkEl.addEventListener("click", function () {
                        chrome.tabs.create({
                            url: tab.url, active: false
                        });
                    });
                    linkEl.addEventListener("mousedown", function (e) {
                        if (e.button === 1) {
                            e.preventDefault();
                        }
                    });
                    linkEl.addEventListener("auxclick", function (e) {
                        if (e.button === 1) {
                            e.preventDefault();
                            chrome.tabs.create({
                                url: tab.url, active: false
                            });
                        }
                    });
                    liEl.appendChild(linkEl);
                    let timeEl = document.createElement("span");
                    timeEl.className = "tab-add-time";
                    timeEl.textContent = njTabTimeText(tab, group.date);
                    liEl.appendChild(timeEl);
                    ulEl.appendChild(liEl);
                });
                groupEl.appendChild(ulEl);
                pageEl.appendChild(groupEl);
            });
            if (res.groupCount > njSearchState.limit) {
                let moreWrap = document.createElement("div");
                moreWrap.className = "nj-more-wrap";
                let moreBtn = document.createElement("button");
                moreBtn.className = "btn btn-default";
                moreBtn.textContent = chrome.i18n.getMessage("logShowMore") + "\uff08" + (res.groupCount - njSearchState.limit) + "\uff09";
                moreBtn.addEventListener("click", function () {
                    njSearchState.limit += 50;
                    njSearchState.scrollY = window.scrollY;
                    showSearchPage();
                });
                moreWrap.appendChild(moreBtn);
                pageEl.appendChild(moreWrap);
            }
            if (njSearchState.scrollY !== null && njSearchState.scrollY !== undefined) {
                window.scrollTo(0, njSearchState.scrollY);
                njSearchState.scrollY = null;
            }
        });
    }

    // 备份文件名里的时间戳，精确到秒，如 20261118-093015（4.2 需求三：统一命名 NJ-Tab-Backup-YYYYMMDD-HHmmss）
    function formatBackupTimestamp(date) {
        date = date || new Date();
        function pad(n) {
            return (n < 10 ? "0" : "") + n;
        }

        return "" + date.getFullYear() + pad(date.getMonth() + 1) + pad(date.getDate()) + "-" + pad(date.getHours()) + pad(date.getMinutes()) + pad(date.getSeconds());
    }

    document.addEventListener('DOMContentLoaded', function () {
        console.log("load完workbench了");

        // 获取本机storage
        chrome.storage.local.get(function (storage) {
            console.log(storage);
        });

        // 获取可同步storage
        chrome.storage.sync.get(function (storage) {
            console.log(storage);
        });

        // 获取全部定时任务alarm
        chrome.alarms.getAll(function (alarms) {
            console.log(alarms)
        });

        // 动态加载菜单
        // 4.3 需求十一：顶栏不再套 Bootstrap .container 定宽——整行通栏：品牌固定最左、菜单固定最右、
        // 中间全给搜索框自适应伸缩；主题按钮移到第一行最末端（右上角）；品牌旁加 GitHub 仓库图标。
        document.querySelector(".navbar").innerHTML = `
                <div class="nj-topbar">
                    <span class="nj-brand-wrap">
                        <span class="nj-brand-col">
                            <a class="nj-brand" href="#home">NJ-Tab</a>
                            <a class="nj-version" href="https://github.com/NJYZ96/NJ-Tab/releases" target="_blank" rel="noopener" title="${chrome.i18n.getMessage("versionReleasesTitle")}">v${chrome.runtime.getManifest().version}</a>
                        </span>
                        <a class="nj-repo-link" href="https://github.com/NJYZ96/NJ-Tab" target="_blank" rel="noopener" title="GitHub"><svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg></a>
                    </span>
                    <div class="nj-search">
                        <div id="searchArea">
                            <input type="text" id="searchInput" placeholder="${chrome.i18n.getMessage("searchPlaceholder")}">
                            <button type="button" id="searchClearBtn" class="nj-search-clear hide" title="×">×</button>
                        </div>
                    </div>
                    <div class="nj-menu">
                        <div class="nj-menu-row">
                            <a href="#home">${chrome.i18n.getMessage("home")}</a>
                            <a href="#gist">${chrome.i18n.getMessage("navGistBackup")}</a>
                            <a href="#webdav">${chrome.i18n.getMessage("navWebdav")}</a>
                            <a href="#importExport">${chrome.i18n.getMessage("importExport")}</a>
                            <a href="#baks"><span id="showBaks">${chrome.i18n.getMessage("showBaks")}</span></a>
                            <button type="button" id="themeCycleBtn" class="nj-theme-btn"></button>
                        </div>
                        <div class="nj-menu-row nj-menu-row2">
                            <a href="#options">${chrome.i18n.getMessage("optionsValue")}</a>
                            <a href="#logs">${chrome.i18n.getMessage("showLog")}</a>
                            <span id="totals" class="nj-status"></span>
                            <span id="usage" class="nj-status"></span>
                        </div>
                    </div>
                </div>
        `;

        // 动态加载内容
        document.getElementById("body").innerHTML = `
        <div>
                <div id="exportDefault" class="hide">
                    <div class="nj-section-title">${chrome.i18n.getMessage("hideShowExportFunction")}</div>
                    <textarea id="exportTextarea" style="width: 100%; height: 200px; margin-top:5px"></textarea>
                    <div style="margin-bottom:5px">
                        <button id="export" type="button" class="btn btn-default">${chrome.i18n.getMessage("exportToLocal")}</button>
                    </div>
                    <div class="nj-hint">${chrome.i18n.getMessage("exportWarn")}</div>
                    <div style="margin:10px 0 5px">
                        <button id="exportHtml" type="button" class="btn btn-default">${chrome.i18n.getMessage("exportHtmlFile")}</button>
                        <button id="exportBackup" type="button" class="btn btn-default">${chrome.i18n.getMessage("exportBackupFile")}</button>
                    </div>
                    <div class="nj-hint">${chrome.i18n.getMessage("exportFileTip")}</div>
                    <div style="margin:14px 0 5px">
                        <label for="importBackupFile" class="btn btn-default" style="font-weight:normal;margin-bottom:0;">${chrome.i18n.getMessage("importBackupFile")}</label>
                        <input type="file" id="importBackupFile" accept=".json" class="hide">
                        <span id="importBackupFileName" class="nj-file-name"></span>
                    </div>
                    <div class="nj-hint">${chrome.i18n.getMessage("importBackupTip")}</div>
                    <div class="nj-hint">${chrome.i18n.getMessage("importDedupHint")}</div>
                </div>
                <div id="importOneTab"  class="hide">
                    <div class="nj-section-title">${chrome.i18n.getMessage("hideShowImportOnetabFunction")}</div>
                    <textarea id="importOnetabTextarea" style="width: 100%; height: 200px; margin-top:5px">
https://www.baidu.com | BaiDu
https://www.google.com | Google

https://www.baidu.com | BaiDu
https://www.google.com | Google
</textarea>
                    <div style="margin-bottom:5px">
                        <button id="importOnetabMode" type="button"
                            class="btn btn-default">${chrome.i18n.getMessage("importToLocal")}</button>
                    </div>
                    <div class="nj-hint">${chrome.i18n.getMessage("importWarn")}</div>
                    <div class="nj-hint">${chrome.i18n.getMessage("importDedupHint")}</div>
                </div>
                <div id="importDefault" class="hide">
                    <div class="nj-section-title">${chrome.i18n.getMessage("hideShowImportDefaultFunction")}</div>
                    <textarea id="importDefaultTextarea" style="width: 100%; height: 200px; margin-top:5px">
标签组名 | 锁定 | 置顶
https://www.baidu.com | BaiDu
https://www.google.com | Google

 | 解锁 | 不置顶
https://www.baidu.com | BaiDu
https://www.google.com | Google
</textarea>
                    <div style="margin-bottom:5px">
                        <button id="importDefaultMode" type="button"
                            class="btn btn-default">${chrome.i18n.getMessage("importToLocal")}</button>
                    </div>
                    <div class="nj-hint">${chrome.i18n.getMessage("importWarnDefault")}</div>
                    <div class="nj-hint">${chrome.i18n.getMessage("importDedupHint")}</div>
                </div>
                <div id="tabGroups"></div>
                <div id="logs"></div>
                <div id="njLogsPanel" class="hide" style="margin-top:20px;"></div>
                <div id="tabGroupsBak"></div>
                <div id="searchPage" class="hide"></div>
                <div id="options" class="div-top"></div>
                <div id="gistPage" class="div-top hide"></div>
                <div id="webdavPage" class="div-top hide"></div>
            </div>
            <a href="#top" class="btn btn-primary fixed-bottom-right">${chrome.i18n.getMessage("backToTop")}</a>
            <hr>
            <div class="blog-footer">
            <p>${chrome.i18n.getMessage("sourceCode")}<a
                    href="https://github.com/NJYZ96/NJ-Tab">GitHub</a>.</p>
            <p>${chrome.i18n.getMessage("contract")}</p>
            <hr>
            </div>
        </div>

        `;

        // 控制导航阴影

        // 主题按钮点击：轮换一档（4.2 需求二）
        document.getElementById('themeCycleBtn').addEventListener('click', function () {
            cycleThemeMode();
        });

        // 先按 localStorage 镜像立即应用一次主题（正式值随后在 storage 初始化时校正）
        try {
            applyTheme(localStorage.getItem("themeModeMirror") || "auto");
        } catch (e) {
            applyTheme("auto");
        }
        $("#navbar ul li").click(function () {
            $(this).addClass("active").siblings().removeClass("active");
        })

        // 初始化界面
        chrome.storage.local.get(null, function (items) {
            // 一load完就算一下storage占用了多少空间
            chrome.storage.local.getBytesInUse(null, function (bytes) {
                isStateOne = false
                console.log("total is " + (bytes / 1024 / 1024).toFixed(3) + "mb");
                let usageEl = document.getElementById('usage');
                usageEl.innerHTML = `${chrome.i18n.getMessage("usedSpace")}${(bytes / 1024 / 1024).toFixed(3)}mb`;
                usageEl.title = `${((bytes / 1024 / 1024) / 10 * 100).toFixed(2)} %${chrome.i18n.getMessage("usageOfRef")}`;
            });

            // 应用保存的主题设置（没保存过时为 undefined，applyTheme 按 auto 跟随系统处理）
            applyTheme(items.themeMode);
        });

        // 先读回收站保留天数设置，再按它清理一遍过期的标签组（设置为0时不自动清理，只补deletedAt）
        chrome.storage.local.get("delRetentionDays", function (retentionItems) {
            cleanupExpiredDelTabGroups(retentionItems ? retentionItems.delRetentionDays : undefined);
        });

        // 展示所有标签
        showAllTabs();

        // 全局搜索（4.4 需求七）：输词后按回车，整页切换到独立搜索页；不再边打字边内嵌出结果
        document.getElementById('searchInput').addEventListener('keydown', function (e) {
            if (e.key === "Enter" || e.keyCode === 13) {
                e.preventDefault();
                njGoSearch();
            }
        });

        // 4.3 需求十七：搜索框清空 × 按钮——框里有字时才显示，点一下清空搜索词并恢复完整列表
        let searchClearBtn = document.getElementById('searchClearBtn');
        if (searchClearBtn) {
            document.getElementById('searchInput').addEventListener('input', function () {
                searchClearBtn.classList.toggle('hide', !this.value);
            });
            searchClearBtn.addEventListener('click', function () {
                let input = document.getElementById('searchInput');
                input.value = "";
                input.dispatchEvent(new Event('input', {bubbles: true}));
                input.focus();
                // 在搜索页点清空：回到发起搜索的那个列表页
                if (njCurrentPage === "#search") {
                    window.location.hash = njSearchState.source === "baks" ? "#baks" : "#home";
                }
            });
        }

        // 把从onetab导出的数据导入，不管插件原先是否有数据，有置顶，全部追加到最后
        document.getElementById('importOnetabMode').addEventListener('click', function () {
            chrome.storage.local.get(null, function (items) {
                let tabGroupsStr = "";
                let tabGroups = [];
                if (items.tabGroups_num >= 1) {
                    // 把分片数据组成字符串
                    for (let i = 0; i < items.tabGroups_num; i++) {
                        tabGroupsStr += items["tabGroups_" + i];
                    }
                    tabGroups = JSON.parse(tabGroupsStr);
                }
                // 4.4 需求八：去重参照集＝现有全部标签（跨组），导入过程中先到先得
                let dupSet = njBuildDupSet(tabGroups);
                let dupSkipped = 0;
                let importedGroups = 0;
                let importedTabs = 0;
                let importOnetabTextarea = $('#importOnetabTextarea').val();
                console.log(importOnetabTextarea)
                if (!importOnetabTextarea) {
                    alert(`${chrome.i18n.getMessage("importTextareaTip")}`)
                    return;
                }
                let content = importOnetabTextarea.split("\n");
                let tabsArr = [];
                // i <= content.length：最后多跑一趟“虚拟空行”——4.3 需求二：文本末尾没有空行时最后一组也要收进来
                for (let i = 0; i <= content.length; i++) {
                    // 空行说明是一组标签的结束
                    if (i === content.length || content[i] === "") {
                        if (i === content.length && tabsArr.length === 0) {
                            break;
                        }
                        // 4.4 需求八：逐条去重；整组都被去重掉时不再追加空组（源文本里本就空组的情况保持原样）
                        let parsedCount = tabsArr.length;
                        let filtered = njFilterDupTabs(tabsArr, dupSet);
                        dupSkipped += filtered.dupCount;
                        if (parsedCount === 0 || filtered.kept.length > 0) {
                            tabGroups.push(makeTabGroup(filtered.kept));
                            importedGroups += 1;
                            importedTabs += filtered.kept.length;
                        }
                        tabsArr.length = 0;
                        continue;
                    }
                    let lineList = content[i].split(" | ");
                    let title = lineList[1];
                    if (title && typeof (title) !== undefined) {
                        title = title.replace(emojiReg, "");
                    }
                    let tab = {"title": title, "url": lineList[0]}
                    tabsArr.push(tab);
                }
                saveShardings(tabGroups, "object");
                njLogEvent("importText", true, "OneTab 导入 " + importedGroups + " 组 / " + importedTabs + " 条" + (dupSkipped > 0 ? "，去重跳过 " + dupSkipped + " 条" : ""));
                alert(`${chrome.i18n.getMessage("backupImportSuccess")}` + (dupSkipped > 0 ? `\n${dupSkipped}${chrome.i18n.getMessage("dedupSkipped")}` : ""));
                refresh()
            });
        });

        // 把从本插件导出的数据导入，假如导入数据有置顶，就置顶到最上，其他数据追加到最后
        document.getElementById('importDefaultMode').addEventListener('click', function () {
            chrome.storage.local.get(null, function (items) {
                let tabGroupsStr = "";
                let tabGroups = [];
                if (items.tabGroups_num >= 1) {
                    // 把分片数据组成字符串
                    for (let i = 0; i < items.tabGroups_num; i++) {
                        tabGroupsStr += items["tabGroups_" + i];
                    }
                    tabGroups = JSON.parse(tabGroupsStr);
                }
                // 4.4 需求八：去重参照集＝现有全部标签（跨组），导入过程中先到先得
                let dupSet = njBuildDupSet(tabGroups);
                let dupSkipped = 0;
                let importedGroups = 0;
                let importedTabs = 0;
                let importDefaultTextarea = $('#importDefaultTextarea').val();
                console.log(importDefaultTextarea)
                if (!importDefaultTextarea) {
                    alert(`${chrome.i18n.getMessage("importTextareaTip")}`)
                    return;
                }
                let content = importDefaultTextarea.split("\n");
                let tabsArr = [];
                let _isPined = '不置顶'
                // i <= content.length：最后多跑一趟“虚拟空行”，让末尾没有空行结尾的最后一组也能成组（与需求二同理）
                for (let i = 0; i <= content.length; i++) {
                    if (i === content.length || content[i] === "") {
                        if (i === content.length && tabsArr.length === 0) {
                            break;
                        }
                        console.log(tabsArr[0])
                        let isLock = false
                        let isPined = false
                        let groupTitle = ""
                        if (tabsArr[0] !== undefined) {
                            let _isLock = tabsArr[0].title
                            if (_isLock === '锁定') {
                                isLock = true
                            }
                            if (_isLock === '解锁') {
                                isLock = false
                            }
                            if (_isPined === '置顶') {
                                isPined = true
                            }
                            if (_isPined === '不置顶') {
                                isPined = false
                            }
                            groupTitle = tabsArr[0].url
                        }
                        tabsArr.splice(0, 1)
                        // 4.4 需求八：逐条去重（组头行已摘掉，不参与判重）；整组都被去重掉时不再追加空组
                        let parsedCount = tabsArr.length;
                        let filtered = njFilterDupTabs(tabsArr, dupSet);
                        dupSkipped += filtered.dupCount;
                        if (parsedCount === 0 || filtered.kept.length > 0) {
                            // 判断导入的数据是否有置顶，有置顶的话，要置顶到最上面，其他数据追加到最后
                            if (isPined) {
                                tabGroups.splice(0, 0, makeTabGroup(filtered.kept, isLock, groupTitle, isPined));
                            } else {
                                tabGroups.push(makeTabGroup(filtered.kept, isLock, groupTitle, isPined));
                            }
                            importedGroups += 1;
                            importedTabs += filtered.kept.length;
                        }
                        tabsArr.length = 0;
                        continue;
                    }
                    let lineList = content[i].split(" | ");
                    let title = lineList[1];
                    if (title && typeof (title) !== undefined) {
                        title = title.replace(emojiReg, "");
                    }
                    let tab = {"title": title, "url": lineList[0]}
                    if (tabsArr.length === 0) {
                        // 组头行：第 3 段是置顶标记（只认组头行，避免标签行的时间段干扰）
                        if (lineList.length > 2) {
                            _isPined = lineList[2]
                        }
                    } else if (lineList.length > 2 && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(lineList[2])) {
                        // 4.3 需求四：标签行第 3 段是添加时间，读回来；老文本没这段、互不影响
                        tab.addTime = lineList[2];
                    }
                    tabsArr.push(tab);
                }
                saveShardings(tabGroups, "object");
                njLogEvent("importText", true, "默认格式导入 " + importedGroups + " 组 / " + importedTabs + " 条" + (dupSkipped > 0 ? "，去重跳过 " + dupSkipped + " 条" : ""));
                alert(`${chrome.i18n.getMessage("backupImportSuccess")}` + (dupSkipped > 0 ? `\n${dupSkipped}${chrome.i18n.getMessage("dedupSkipped")}` : ""));
                refresh()
            });
        });

        // 导出本插件内容功能
        document.getElementById('export').addEventListener('click', function () {
            chrome.storage.local.get(null, function (items) {
                let tabGroupsStr = "";
                let tabGroups = [];
                if (items.tabGroups_num >= 1) {
                    // 把分片数据组成字符串
                    for (let i = 0; i < items.tabGroups_num; i++) {
                        tabGroupsStr += items["tabGroups_" + i];
                    }
                    tabGroups = JSON.parse(tabGroupsStr);
                }
                $('#exportTextarea').val();
                let exportTextarea = "";
                for (let i = 0; i < tabGroups.length; i++) {
                    let isLock = tabGroups[i].isLock ? "锁定" : "解锁"
                    let isPined = "不置顶"
                    if (tabGroups[i].isPined !== undefined) {
                        isPined = tabGroups[i].isPined ? "置顶" : "不置顶"
                    }
                    let groupTitle = tabGroups[i].groupTitle
                    console.log(typeof (groupTitle))
                    console.log(groupTitle)
                    if (groupTitle === "undefined" || typeof (groupTitle) === "undefined") {
                        groupTitle = ""
                    }
                    let groupInfo = groupTitle + " | " + isLock + " | " + isPined + "\n"
                    exportTextarea += groupInfo
                    for (let j = 0; j < tabGroups[i].tabs.length; j++) {
                        // 4.3 需求四：导出文本带上每条标签的添加时间（第 3 段）；没有的用分组时间顶上
                        let tabJ = tabGroups[i].tabs[j];
                        let addTimeJ = (typeof tabJ.addTime === "string" && tabJ.addTime) ? tabJ.addTime : tabGroups[i].date;
                        let line = tabJ.url + " | " + tabJ.title + " | " + addTimeJ + "\n"
                        exportTextarea += line;
                    }
                    exportTextarea += "\n"
                }
                $('#exportTextarea').val(exportTextarea)
            });
        });

        // 把一段文本下载成文件（阶段C：单文件导出共用）
        function downloadTextFile(fileName, text, mimeType) {
            let blob = new Blob([text], {type: mimeType + ";charset=utf-8"});
            let url = URL.createObjectURL(blob);
            let a = document.createElement("a");
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(function () {
                URL.revokeObjectURL(url);
            }, 1000);
        }

        // 导出为网页文件：一个 .html 单文件，双击就能打开看、点开链接，含组名/收集时间/锁定置顶标记
        document.getElementById('exportHtml').addEventListener('click', function () {
            getShardings(function (items) {
                let now = new Date();
                let html = buildExportHtml(items.tabGroups || [], {
                    title: `${chrome.i18n.getMessage("htmlExportTitle")}`,
                    exportedAt: now.toLocaleString(),
                    exportedAtText: `${chrome.i18n.getMessage("htmlExportedAt")}`,
                    lockedText: `${chrome.i18n.getMessage("htmlLocked")}`,
                    pinnedText: `${chrome.i18n.getMessage("htmlPinned")}`
                });
                downloadTextFile("NJ-Tab-Backup-" + formatBackupTimestamp(now) + ".html", html, "text/html");
                njLogEvent("exportPage", true, "");
            });
        });

        // 导出完整备份：一个 .json 单文件，含全部字段（含回收站），可原样导入恢复
        document.getElementById('exportBackup').addEventListener('click', function () {
            getShardings(function (items) {
                collectBackupSettings(function (settings) {
                    let backup = buildBackupObject(items, undefined, settings);
                    downloadTextFile("NJ-Tab-Backup-" + formatBackupTimestamp(new Date()) + ".json", JSON.stringify(backup, null, 2), "application/json");
                    njLogEvent("exportBackup", true, "");
                });
            });
        });

        // 从备份文件导入：严格校验通过才写数据；追加合并，不覆盖现有标签，备份里的原始字段（含 date）原样并入，不走 makeTabGroup 重建
        document.getElementById('importBackupFile').addEventListener('change', function (event) {
            let file = event.target.files && event.target.files[0];
            if (!file) {
                return;
            }
            let reader = new FileReader();
            reader.onload = function () {
                let backup;
                try {
                    backup = JSON.parse(reader.result);
                } catch (e) {
                    njLogEvent("importBackup", false, "文件读不出来（不是有效的备份文件）");
                    alert(`${chrome.i18n.getMessage("backupInvalid")}`);
                    event.target.value = "";
                    return;
                }
                // 4.3 需求十四：逐条宽容清洗——结构性问题才整份拒绝；单条坏数据跳过并逐条记日志，不再整份报废
                let check = sanitizeBackupObject(backup);
                if (check.fatal) {
                    njLogEvent("importBackup", false, njReasonText(check.fatal));
                    alert(`${chrome.i18n.getMessage("backupInvalid")}`);
                    event.target.value = "";
                    return;
                }
                if (check.skipped.length > 0) {
                    // 跳过明细汇总成一条日志、逐条放进详情（审查第四项：不再一条坏数据刷一条、还翻不全）
                    njLogEvent("importBackup", false, "共跳过 " + check.skipped.length + " 条，明细点开看", check.skipped.map(function (s) { return njSkippedDetail(s); }));
                }
                let skippedNote = check.skipped.length > 0 ? `\n${check.skipped.length}${chrome.i18n.getMessage("backupImportSkipped")}` : "";
                let tabCount = 0;
                for (let i = 0; i < check.tabGroups.length; i++) {
                    tabCount += check.tabGroups[i].tabs.length;
                }
                if (!confirm(`${chrome.i18n.getMessage("backupImportConfirm")}（${check.tabGroups.length}${chrome.i18n.getMessage("group")} / ${tabCount}${chrome.i18n.getMessage("totals")}）${skippedNote}`)) {
                    event.target.value = "";
                    return;
                }
                getShardings(function (items) {
                    // 4.4 需求八：追加合并前逐条去重——主列表对主列表、回收站对回收站，跨组也算；
                    // 整组都被去重掉的组不再追加（不留空组），原有数据一条不动
                    let mainSet = njBuildDupSet(items.tabGroups);
                    let dupSkipped = 0;
                    let keptMain = [];
                    check.tabGroups.forEach(function (g) {
                        let f = njFilterDupTabs(g.tabs, mainSet);
                        dupSkipped += f.dupCount;
                        if (f.kept.length > 0) {
                            g.tabs = f.kept;
                            keptMain.push(g);
                        }
                    });
                    // 统一追加到现有数据末尾（包括备份里的置顶组，不调整顺序）
                    let merged = (Array.isArray(items.tabGroups) ? items.tabGroups : []).concat(keptMain);
                    saveShardings(merged, "object");
                    let keptDel = [];
                    if (check.delTabGroups.length > 0) {
                        let delSet = njBuildDupSet(items.delTabGroups);
                        check.delTabGroups.forEach(function (g) {
                            let f = njFilterDupTabs(g.tabs, delSet);
                            dupSkipped += f.dupCount;
                            if (f.kept.length > 0) {
                                g.tabs = f.kept;
                                keptDel.push(g);
                            }
                        });
                        if (keptDel.length > 0) {
                            let mergedDel = (Array.isArray(items.delTabGroups) ? items.delTabGroups : []).concat(keptDel);
                            saveShardings(mergedDel, "del");
                        }
                    }
                    let settingsRestored = applyBackupSettings(backup.settings);
                    let dupNote = dupSkipped > 0 ? `\n${dupSkipped}${chrome.i18n.getMessage("dedupSkipped")}` : "";
                    njLogEvent("importBackup", true, "导入 " + keptMain.length + " 组" + (keptDel.length > 0 ? "、回收站 " + keptDel.length + " 组" : "") + (check.skipped.length > 0 ? "，跳过 " + check.skipped.length + " 条" : "") + (dupSkipped > 0 ? "，去重跳过 " + dupSkipped + " 条" : ""));
                    if (settingsRestored) {
                        alert(`${chrome.i18n.getMessage("backupImportSuccess")}${chrome.i18n.getMessage("settingsAlsoRestored")}${skippedNote}${dupNote}`);
                    } else {
                        alert(`${chrome.i18n.getMessage("backupImportSuccess")}${skippedNote}${dupNote}`);
                    }
                    setTimeout(refresh, 300);
                });
                event.target.value = "";
            };
            reader.onerror = function () {
                alert(`${chrome.i18n.getMessage("backupInvalid")}`);
                event.target.value = "";
            };
            reader.readAsText(file);
        });

        // 选好备份文件后把文件名显示在按钮旁边（按钮已换成与其它按钮一致的样式，4.4 需求十三）
        document.getElementById('importBackupFile').addEventListener('change', function (event) {
            let nameEl = document.getElementById('importBackupFileName');
            if (nameEl) {
                nameEl.textContent = (event.target.files && event.target.files[0]) ? event.target.files[0].name : "";
            }
        });

        // 持续监听通知框的按钮点击事件，点了就清除通知框
        chrome.notifications.onButtonClicked.addListener(function callback(notificationId, buttonIndex) {
            chrome.notifications.clear(notificationId, function callback() {
            });
        });

        // 弹窗开始关闭时，先把还停在弹窗里的焦点移走（不然 Chrome 会报 aria-hidden 焦点警告，扩展错误页里那两条就是它）
        // 弹窗关闭前把焦点移出弹窗（4.3 需求十八强化）：Chrome 会对“aria-hidden 时焦点还在弹窗里”报警。
        // 两道保险：① hide.bs.modal 触发时立即 blur；② 再挂一个一次性的 bsTransitionEnd，
        // 在 Bootstrap 真正给弹窗加 aria-hidden（hideModal）之前再 blur 一次——hide() 是先触发
        // hide.bs.modal 再注册它自己的 bsTransitionEnd，所以这里注册的必定先执行，
        // 覆盖过渡动画期间焦点被任何代码拉回弹窗的情况。
        $(document).on('hide.bs.modal', '.modal', function () {
            let modalEl = this;
            let blurIfInside = function () {
                let active = document.activeElement;
                if (active && (active === modalEl || modalEl.contains(active))) {
                    active.blur();
                }
            };
            blurIfInside();
            $(modalEl).one('bsTransitionEnd', blurIfInside);
        });

        // 再加一道前置保险（审查第八项）：关闭动作一开始（点关闭/确认类按钮、点遮罩、按 Esc）
        // 就先把焦点移出弹窗，赶在 Bootstrap 开始隐藏之前，免得个别关闭路径下前两道保险来不及
        let njBlurIfInsideModal = function (modalEl) {
            let active = document.activeElement;
            if (active && (active === modalEl || modalEl.contains(active))) {
                active.blur();
            }
        };
        document.addEventListener('mousedown', function (e) {
            let t = e.target;
            if (!t || !t.closest) { return; }
            let modalEl = t.closest('.modal');
            if (!modalEl) { return; }
            if (t === modalEl || t.closest('[data-dismiss="modal"]') || t.closest('#confirmButton') || t.closest('#njSecretSaveBtn')) {
                njBlurIfInsideModal(modalEl);
            }
        }, true);
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' || e.keyCode === 27) {
                let active = document.activeElement;
                let modalEl = active && active.closest ? active.closest('.modal') : null;
                if (modalEl) { njBlurIfInsideModal(modalEl); }
            }
        }, true);

        // 监听 Bootstrap Modal 的 hidden.bs.modal 事件，不然会导致数据不更新，一直只显示第一次的数据
        $(document).on('hidden.bs.modal', '#alertModal', function (e) {
            // 获取 Modal 元素
            const modal = document.getElementById('alertModal');

            // 移除 Modal 元素
            if (modal) {
                modal.remove();
            }
        });

        // 监听 Bootstrap Modal 的 hidden.bs.modal 事件，不然会导致数据不更新，一直只显示第一次的数据
        $(document).on('hidden.bs.modal', '#confirmationModal', function (e) {
            // 获取 Modal 元素
            const modal = document.getElementById('confirmationModal');

            // 移除 Modal 元素
            if (modal) {
                modal.remove();
            }
        });

        // 监听 hash 的变化事件
        window.addEventListener("hashchange", function () {
            // 获取当前 hash
            const currentHash = window.location.hash;
            // 路由读完就把 hash 清空（见下一行），location.hash 平时恒为 ""，
            // 需要判断"当前在哪一页"的地方统一看 njCurrentPage（4.3 需求十六）
            if (currentHash) {
                njCurrentPage = currentHash;
            }
            // 把当前 hash 清空，才可以再次触发 hashchange 事件，实现多次点击刷新的效果
            window.location.hash = ""
            // 「已存多少组」只在首页/回收站/日志页出现且各显各页口径；其它页隐藏它、只留容量（审查第五项）
            let njTotalsEl = document.getElementById("totals");
            if (njTotalsEl && currentHash) {
                // 4.4 需求十一：隐藏时只让文字不可见、保留它占的位置，下面的菜单（查看日志等）位置不再上下跳动
                njTotalsEl.style.visibility = ["#options", "#gist", "#webdav", "#importExport", "#importOnetab", "#importDefault", "#export", "#search"].indexOf(currentHash) >= 0 ? "hidden" : "";
            }
            // 搜索页默认隐藏，只有 #search 路由会显示它（showSearchPage 里去掉 hide）；
            // 路由清空 hash 触发的那次空 hashchange 不能隐藏它，故只在真实导航到别的页时才藏
            if (currentHash && currentHash !== "#search") {
                $("#searchPage").addClass("hide");
            }
            // 根据不同的 hash 值显示对应的内容
            switch (currentHash) {
                case "#home": //打开 首页
                    $("#logs").addClass("hide");
                    $("#njLogsPanel").addClass("hide");
                    $("#gistPage").addClass("hide");
                    $("#webdavPage").addClass("hide");
                    $("#options").addClass("hide");
                    $("#importOneTab").addClass("hide")
                    $("#tabGroupsBak").addClass("hide")
                    $("#importDefault").addClass("hide")
                    $("#exportDefault").addClass("hide")
                    $("#searchArea").removeClass("hide");
                    $("#tabGroups").removeClass("hide");
                    // 展示所有标签
                    showAllTabs();
                    break;
                case "#search": //打开 搜索页（4.4 需求七）
                    showSearchPage();
                    break;
                case "#logs": //打开 日志页
                    $("#searchArea").addClass("hide");
                    $("#tabGroups").addClass("hide")
                    $("#tabGroupsBak").addClass("hide")
                    $("#options").addClass("hide")
                    $("#gistPage").addClass("hide")
                    $("#webdavPage").addClass("hide")
                    $("#importOneTab").addClass("hide")
                    $("#importDefault").addClass("hide")
                    $("#exportDefault").addClass("hide")
                    // 4.3 需求六：旧的过程日志 Mithril 区不再单独显示——过程日志已并入新四分区面板的 Gist 区
                    $("#logs").addClass("hide")
                    $("#njLogsPanel").removeClass("hide");
                    // 展示Log（四分区统一渲染，顶栏条数也由它一并更新）
                    renderNjLogs();
                    break;
                case "#options": //打开 配置页
                    $("#searchArea").addClass("hide");
                    $("#logs").addClass("hide");
                    $("#njLogsPanel").addClass("hide");
                    $("#gistPage").addClass("hide");
                    $("#webdavPage").addClass("hide");
                    $("#tabGroups").addClass("hide");
                    $("#tabGroupsBak").addClass("hide");
                    $("#importOneTab").addClass("hide")
                    $("#importDefault").addClass("hide")
                    $("#exportDefault").addClass("hide")
                    $("#options").removeClass("hide");
                    // 展示配置
                    showOptions();
                    break;
                case "#importOnetab": //打开 导入oneTab的url功能（4.2 起与导入/导出合并为一页）
                    $("#searchArea").addClass("hide");
                    $("#logs").addClass("hide");
                    $("#njLogsPanel").addClass("hide");
                    $("#gistPage").addClass("hide");
                    $("#webdavPage").addClass("hide");
                    $("#tabGroups").addClass("hide");
                    $("#tabGroupsBak").addClass("hide");
                    $("#options").addClass("hide");
                    $("#importDefault").removeClass("hide")
                    $("#exportDefault").removeClass("hide")
                    $("#importOneTab").removeClass("hide")
                    break;
                case "#importDefault": //打开 导入默认格式的url功能（4.2 起与导入/导出合并为一页）
                    $("#searchArea").addClass("hide");
                    $("#logs").addClass("hide");
                    $("#njLogsPanel").addClass("hide");
                    $("#gistPage").addClass("hide");
                    $("#webdavPage").addClass("hide");
                    $("#tabGroups").addClass("hide");
                    $("#tabGroupsBak").addClass("hide");
                    $("#options").addClass("hide");
                    $("#importOneTab").removeClass("hide")
                    $("#exportDefault").removeClass("hide")
                    $("#importDefault").removeClass("hide")
                    break;
                case "#export": //打开 导出默认格式的url功能（4.2 起与导入/导出合并为一页）
                    $("#searchArea").addClass("hide");
                    $("#logs").addClass("hide");
                    $("#njLogsPanel").addClass("hide");
                    $("#gistPage").addClass("hide");
                    $("#webdavPage").addClass("hide");
                    $("#tabGroups").addClass("hide");
                    $("#tabGroupsBak").addClass("hide");
                    $("#options").addClass("hide");
                    $("#importOneTab").removeClass("hide")
                    $("#importDefault").removeClass("hide")
                    $("#exportDefault").removeClass("hide")
                    $('#exportTextarea').val("");
                    break;
                case "#gist": //打开 Gist 备份页
                    $("#searchArea").addClass("hide");
                    $("#logs").addClass("hide");
                    $("#njLogsPanel").addClass("hide");
                    $("#tabGroups").addClass("hide");
                    $("#tabGroupsBak").addClass("hide");
                    $("#options").addClass("hide");
                    $("#webdavPage").addClass("hide");
                    $("#importOneTab").addClass("hide")
                    $("#importDefault").addClass("hide")
                    $("#exportDefault").addClass("hide")
                    $("#gistPage").removeClass("hide");
                    // 展示 Gist 备份页
                    showGistPage();
                    break;
                case "#webdav": //打开 WebDAV 页
                    $("#searchArea").addClass("hide");
                    $("#logs").addClass("hide");
                    $("#njLogsPanel").addClass("hide");
                    $("#tabGroups").addClass("hide");
                    $("#tabGroupsBak").addClass("hide");
                    $("#options").addClass("hide");
                    $("#gistPage").addClass("hide");
                    $("#importOneTab").addClass("hide")
                    $("#importDefault").addClass("hide")
                    $("#exportDefault").addClass("hide")
                    $("#webdavPage").removeClass("hide");
                    // 展示 WebDAV 页
                    showWebdavPage();
                    break;
                case "#importExport": //打开 导入/导出页（三种格式一页办完）
                    $("#searchArea").addClass("hide");
                    $("#logs").addClass("hide");
                    $("#njLogsPanel").addClass("hide");
                    $("#tabGroups").addClass("hide");
                    $("#tabGroupsBak").addClass("hide");
                    $("#options").addClass("hide");
                    $("#gistPage").addClass("hide");
                    $("#webdavPage").addClass("hide");
                    $("#importOneTab").removeClass("hide")
                    $("#importDefault").removeClass("hide")
                    $("#exportDefault").removeClass("hide")
                    $('#exportTextarea').val("");
                    break;
                case "#baks": //打开 回收站
                    // 展示回收站页
                    showAllDelTabs();
                    break;
            }
        });

    });

    // 从github的gist拉取
    function pullFromGithubGist() {
        startTime = moment();
        setHandleGistStatus(`${chrome.i18n.getMessage("pullFromGithubGistIng")}`, "github");
        handleGistLog.length = 0;
        usedSeconds = 0;
        handleGistLog.push(`${chrome.i18n.getMessage("start")}${moment().format('YYYY-MM-DD HH:mm:ss')}`);
        handleGistLog.push(`${chrome.i18n.getMessage("clickPullFromGithubGist")}`)
        console.log(pullFromGithubGistStatus);
        pullFromGithubGistStatus = `${chrome.i18n.getMessage("startPullFromGithubGistTask")}`;
        console.log("开始pull从github的gist的任务");
        handleGistLog.push(`${chrome.i18n.getMessage("startPullFromGithubGistTask")}`)
        if (typeof (pullFromGithubGistStatus) != "undefined") {
            console.log("开始工作");
            intervalId = setInterval(function () {
                if (typeof (pullFromGithubGistStatus) != "undefined") {
                    console.log("秒等待");
                    usedSeconds++;
                } else {
                    clearInterval(intervalId);
                    endTime = moment();
                    const duration = moment.duration(moment(endTime).diff(moment(startTime)));
                    notificationId = genObjectId();
                    chrome.notifications.create(notificationId, {
                        type: 'basic',
                        iconUrl: 'images/128.png',
                        title: `${chrome.i18n.getMessage("endPullFromGithubGistTask")}`,
                        message: `${chrome.i18n.getMessage("usedTime")}${duration.hours()}${chrome.i18n.getMessage("hours")}${duration.minutes()}${chrome.i18n.getMessage("minutes")}${duration.seconds()}${chrome.i18n.getMessage("seconds")}`,
                        buttons: [{"title": `${chrome.i18n.getMessage("close")}`}],
                        requireInteraction: true
                    });
                    handleGistLog.push(`${usedSeconds}${chrome.i18n.getMessage("secondWait")}`)
                    handleGistLog.push(`${chrome.i18n.getMessage("endPullFromGithubGistTask")}`)
                    handleGistLog.push(`${chrome.i18n.getMessage("end")}${moment().format('YYYY-MM-DD HH:mm:ss')}`);
                    setHandleGistStatus("IDLE", "github");
                    setHandleGistLog(`${chrome.i18n.getMessage("clickPullGithub")}`, true);
                    console.log("pull从github的gist的任务完成");
                }
            }, 1000);
            isStoredGithubTokenLocal("pull_github");
        }
    }

    // 从gitee的gist拉取
    function pullFromGiteeGist() {
        startTime = moment();
        setHandleGistStatus(`${chrome.i18n.getMessage("pullFromGiteeGistIng")}`, "gitee");
        handleGistLog.length = 0;
        usedSeconds = 0;
        handleGistLog.push(`${chrome.i18n.getMessage("start")}${moment().format('YYYY-MM-DD HH:mm:ss')}`);
        handleGistLog.push(`${chrome.i18n.getMessage("clickPullFromGiteeGist")}`)
        console.log(pullFromGiteeGistStatus);
        pullFromGiteeGistStatus = `${chrome.i18n.getMessage("startPullFromGiteeGistTask")}`;
        console.log("开始pull从gitee的gist的任务");
        handleGistLog.push(`${chrome.i18n.getMessage("startPullFromGiteeGistTask")}`)
        if (typeof (pullFromGiteeGistStatus) != "undefined") {
            console.log("开始工作");
            intervalId = setInterval(function () {
                if (typeof (pullFromGiteeGistStatus) != "undefined") {
                    console.log("秒等待");
                    usedSeconds++;
                } else {
                    clearInterval(intervalId);
                    endTime = moment();
                    const duration = moment.duration(moment(endTime).diff(moment(startTime)));
                    notificationId = genObjectId();
                    chrome.notifications.create(notificationId, {
                        type: 'basic',
                        iconUrl: 'images/128.png',
                        title: `${chrome.i18n.getMessage("endPullFromGiteeGistTask")}`,
                        message: `${chrome.i18n.getMessage("usedTime")}${duration.hours()}${chrome.i18n.getMessage("hours")}${duration.minutes()}${chrome.i18n.getMessage("minutes")}${duration.seconds()}${chrome.i18n.getMessage("seconds")}`,
                        buttons: [{"title": `${chrome.i18n.getMessage("close")}`}],
                        requireInteraction: true
                    });
                    handleGistLog.push(`${usedSeconds}${chrome.i18n.getMessage("secondWait")}`)
                    handleGistLog.push(`${chrome.i18n.getMessage("endPullFromGiteeGistTask")}`)
                    handleGistLog.push(`${chrome.i18n.getMessage("end")}${moment().format('YYYY-MM-DD HH:mm:ss')}`);
                    setHandleGistStatus("IDLE", "gitee");
                    setHandleGistLog(`${chrome.i18n.getMessage("clickPullGitee")}`, true);
                    console.log("pull从gitee的gist的任务完成");
                }
            }, 1000);
            isStoredGiteeTokenLocal("pull_gitee");
        }
    }

    // 推送到github的gist
    function pushToGithubGist() {
        startTime = moment();
        setHandleGistStatus(`${chrome.i18n.getMessage("pushToGithubGistIng")}`, "github");
        handleGistLog.length = 0;
        usedSeconds = 0;
        handleGistLog.push(`${chrome.i18n.getMessage("start")}${moment().format('YYYY-MM-DD HH:mm:ss')}`);
        handleGistLog.push(`${chrome.i18n.getMessage("clickPushToGithubGist")}`)
        console.log(pushToGithubGistStatus);
        pushToGithubGistStatus = `${chrome.i18n.getMessage("startPushToGithubGistTask")}`;
        console.log(pushToGithubGistStatus);
        console.log("开始push到github的gist的任务");
        handleGistLog.push(`${chrome.i18n.getMessage("startPushToGithubGistTask")}`)
        if (typeof (pushToGithubGistStatus) != "undefined") {
            console.log("开始工作");
            intervalId = setInterval(function () {
                if (typeof (pushToGithubGistStatus) != "undefined") {
                    console.log("秒等待");
                    usedSeconds++;
                } else {
                    clearInterval(intervalId);
                    endTime = moment();
                    const duration = moment.duration(moment(endTime).diff(moment(startTime)));
                    notificationId = genObjectId();
                    chrome.notifications.create(notificationId, {
                        type: 'basic',
                        iconUrl: 'images/128.png',
                        title: `${chrome.i18n.getMessage("endPushToGithubGistTask")}`,
                        message: `${chrome.i18n.getMessage("usedTime")}${duration.hours()}${chrome.i18n.getMessage("hours")}${duration.minutes()}${chrome.i18n.getMessage("minutes")}${duration.seconds()}${chrome.i18n.getMessage("seconds")}`,
                        buttons: [{"title": `${chrome.i18n.getMessage("close")}`}],
                        requireInteraction: true
                    });
                    handleGistLog.push(`${usedSeconds}${chrome.i18n.getMessage("secondWait")}`)
                    handleGistLog.push(`${chrome.i18n.getMessage("endPushToGithubGistTask")}`)
                    handleGistLog.push(`${chrome.i18n.getMessage("end")}${moment().format('YYYY-MM-DD HH:mm:ss')}`);
                    setHandleGistStatus("IDLE", "github");
                    setHandleGistLog(`${chrome.i18n.getMessage("clickPushGithub")}`, false);
                    console.log("push到github的gist的任务完成");
                }
            }, 1000);
            isStoredGithubTokenLocal("push_github");
        }
    }

    // 推送到gitee的gist
    function pushToGiteeGist() {
        startTime = moment();
        setHandleGistStatus(`${chrome.i18n.getMessage("pushToGiteeGistIng")}`, "gitee");
        handleGistLog.length = 0;
        usedSeconds = 0;
        handleGistLog.push(`${chrome.i18n.getMessage("start")}${moment().format('YYYY-MM-DD HH:mm:ss')}`);
        handleGistLog.push(`${chrome.i18n.getMessage("clickPushToGiteeGist")}`)
        console.log(pushToGiteeGistStatus);
        pushToGiteeGistStatus = `${chrome.i18n.getMessage("startPushToGiteeGistTask")}`;
        console.log(pushToGiteeGistStatus);
        console.log("开始push到gitee的gist的任务");
        handleGistLog.push(`${chrome.i18n.getMessage("startPushToGiteeGistTask")}`)
        if (typeof (pushToGiteeGistStatus) != "undefined") {
            console.log("开始工作");
            intervalId = setInterval(function () {
                if (typeof (pushToGiteeGistStatus) != "undefined") {
                    console.log("秒等待");
                    usedSeconds++;
                } else {
                    clearInterval(intervalId);
                    endTime = moment();
                    const duration = moment.duration(moment(endTime).diff(moment(startTime)));
                    notificationId = genObjectId();
                    chrome.notifications.create(notificationId, {
                        type: 'basic',
                        iconUrl: 'images/128.png',
                        title: `${chrome.i18n.getMessage("endPushToGiteeGistTask")}`,
                        message: `${chrome.i18n.getMessage("usedTime")}${duration.hours()}${chrome.i18n.getMessage("hours")}${duration.minutes()}${chrome.i18n.getMessage("minutes")}${duration.seconds()}${chrome.i18n.getMessage("seconds")}`,
                        buttons: [{"title": `${chrome.i18n.getMessage("close")}`}],
                        requireInteraction: true
                    });
                    handleGistLog.push(`${usedSeconds}${chrome.i18n.getMessage("secondWait")}`)
                    handleGistLog.push(`${chrome.i18n.getMessage("endPushToGiteeGistTask")}`)
                    handleGistLog.push(`${chrome.i18n.getMessage("end")}${moment().format('YYYY-MM-DD HH:mm:ss')}`);
                    setHandleGistStatus("IDLE", "gitee");
                    setHandleGistLog(`${chrome.i18n.getMessage("clickPushGitee")}`, false);
                    console.log("push到gitee的gist的任务完成");
                }
            }, 1000);
            isStoredGiteeTokenLocal("push_gitee");
        }
    }

    // 构造操作gist的日志结构
    function setHandleGistLog(type, isReload) {
        // 补上时间和成败（审查第二项）：日志页 Gist 区的行标题要和其它区一样有时间和结果；
        // 成败按步骤里有没有「失败」字样判定（步骤是当时语言的现成文案，中英文都覆盖）
        let gistOk = !handleGistLog.some(function (line) { return /失败|Failed|failed/.test(String(line)); });
        let handleGistLogMap = {id: genObjectId(), t: Date.now(), ok: gistOk, handleGistType: type, handleGistLogs: handleGistLog};
        chrome.storage.local.get(null, function (storage) {
            if (storage.gistLog) {
                console.log("gistLog有值");
                if (storage.gistLog.length >= 100) {
                    let newArr = storage.gistLog;
                    newArr.splice(-1, 1)
                    newArr.unshift(handleGistLogMap);
                    chrome.storage.local.set({gistLog: newArr});
                    if (isReload) {
                        refresh()
                    }
                } else {
                    let newArr = storage.gistLog;
                    newArr.unshift(handleGistLogMap);
                    chrome.storage.local.set({gistLog: newArr});
                    if (isReload) {
                        refresh()
                    }
                }
            } else {
                console.log("gistLog没有值，第一次");
                chrome.storage.local.set({gistLog: [handleGistLogMap]});
                if (isReload) {
                    refresh()
                }
            }
        });
    }

    // 操作gist的全局状态
    // 4.4 附带修复：忙碌标记按平台分开存（与 background.js 同口径），GitHub 与 Gitee 互不挡道
    function setHandleGistStatus(status, platform) {
        let expireTime = moment().add(1, 'minutes').format('YYYY-MM-DD HH:mm:ss');
        let gistStatusMap = {type: status, expireTime: expireTime};
        let obj = {};
        obj[platform === "gitee" ? "handleGiteeGistStatus" : "handleGithubGistStatus"] = gistStatusMap;
        chrome.storage.local.set(obj);
    }

    // 关闭当前tab
    function closeCurrentTab() {
        chrome.tabs.query({active: true, currentWindow: true}, function (tabsArr) {
            chrome.tabs.remove(tabsArr[0].id, function () {
            });
        });
    }

    // 更新github的gist
    // 一次性迁移：先读回这个 Gist 确认旧文件在不在；同一次更新里写新文件、改新描述、删旧文件（先读到旧数据才改名，顺序不能反）
    // 4.4 需求一：推送只更新新版自己的 Gist（描述 NJ-Tab / 文件 NJ-Tab_Tabs.json）；旧版 Gist 永不写入。
    // 调用前已由 isStored/isHadCreate 核对过目标带新版标识，这里不再做任何改名、删旧文件的迁移动作。
    function updateGithubGist(content) {
        pushToGithubGistStatus = `${chrome.i18n.getMessage("directUpdate")}`;
        handleGistLog.push(`${chrome.i18n.getMessage("directUpdate")}`)
        console.log("已经创建了gist，直接开始更新");
        let _content = JSON.stringify(content);
        patchGithubGist({"NJ-Tab_Tabs.json": {"content": _content}});
    }

    // 判断一个 Gist 是不是新版自己的（描述 NJ-Tab 或含新版文件）；旧版（描述 myCloudSkyMonster / 只有 brower_Tabs.json）返回 false
    function njGistIsNew(data) {
        if (!data) return false;
        if (data.description === "NJ-Tab") return true;
        return !!(data.files && data.files["NJ-Tab_Tabs.json"]);
    }

    function patchGithubGist(files) {
        let data = {
            "description": "NJ-Tab", "public": false, "files": files
        }
        $.ajax({
            type: "PATCH",
            headers: {"Authorization": "token " + githubGistToken},
            url: gitHubApiUrl + "/gists/" + githubGistId,
            data: JSON.stringify(data),
            success: function (data, status) {
                if (status === "success") {
                    console.log("更新成功！");
                    handleGistLog.push(`${chrome.i18n.getMessage("updateSuccess")}`)
                    njLogEvent("gistPush", true, "GitHub");
                } else {
                    console.log("更新失败！");
                    handleGistLog.push(`${chrome.i18n.getMessage("updateFailed")}`)
                }
            },
            error: function (xhr, errorText, errorType) {
                console.log(xhr);
                console.log(errorText);
                console.log(errorType);
                console.log("报错了！");
                handleGistLog.push(`${chrome.i18n.getMessage("updateFailed")}-->${xhr.responseText}`)
                    if (xhr.status === 403 || xhr.status === 429) {
                        njLogEvent("gistRateLimited", false, "GitHub HTTP " + xhr.status);
                    } else {
                        njLogEvent("gistPush", false, "GitHub HTTP " + xhr.status);
                    }
            },
            complete: function () {
                //do something
                pushToGithubGistStatus = undefined;
            }
        })
    }

    // 更新gitee的gist
    function updateGiteeGist(content) {
        pushToGiteeGistStatus = `${chrome.i18n.getMessage("directUpdate")}`;
        handleGistLog.push(`${chrome.i18n.getMessage("directUpdate")}`)
        console.log("已经创建了gist，直接开始更新");
        let _content = JSON.stringify(content);
        let data = {
            "description": "NJ-Tab", "public": false, "files": {
                "NJ-Tab_Tabs.json": {"content": _content}
            }
        }
        $.ajax({
            type: "PATCH",
            headers: {"Authorization": "token " + giteeGistToken},
            url: giteeApiUrl + "/gists/" + giteeGistId,
            data: data,
            success: function (data, status) {
                if (status === "success") {
                    console.log("更新成功！");
                    handleGistLog.push(`${chrome.i18n.getMessage("updateSuccess")}`)
                    njLogEvent("gistPush", true, "Gitee");
                } else {
                    console.log("更新失败！");
                    handleGistLog.push(`${chrome.i18n.getMessage("updateFailed")}`)
                }
            },
            error: function (xhr, errorText, errorType) {
                console.log(xhr);
                console.log(errorText);
                console.log(errorType);
                console.log("报错了！");
                handleGistLog.push(`${chrome.i18n.getMessage("updateFailed")}-->${xhr.responseText}`)
                    if (xhr.status === 403 || xhr.status === 429) {
                        njLogEvent("gistRateLimited", false, "Gitee HTTP " + xhr.status);
                    } else {
                        njLogEvent("gistPush", false, "Gitee HTTP " + xhr.status);
                    }
            },
            complete: function () {
                //do something
                pushToGiteeGistStatus = undefined;
            }
        })
    }

    // 判断是否已经保存了github的gistId
    function isStoredGithubGistIdLocal(action) {
        console.log("开始检查gistId有没有保存");
        handleGistLog.push(`${chrome.i18n.getMessage("startCheckGistIdSaved")}`)
        if (action === "push_github") {
            pushToGithubGistStatus = `${chrome.i18n.getMessage("startCheckGistIdSaved")}`;
        } else if (action === "pull_github") {
            pullFromGithubGistStatus = `${chrome.i18n.getMessage("startCheckGistIdSaved")}`;
        }
        chrome.storage.local.get("githubGistId", function (storage) {
            console.log(storage.githubGistId);
            if (storage.githubGistId) {
                console.log("gistId有保存");
                handleGistLog.push(`${chrome.i18n.getMessage("gistIdSaved")}`)
                githubGistId = storage.githubGistId;
                if (action === "push_github") {
                    // 4.4 需求一：本地存的编号可能还是 3.1 旧 Gist 的——推送前先读回核对标识，是旧版的绝不更新，转去找新版的或新建
                    $.ajax({
                        type: "GET",
                        headers: {"Authorization": "token " + githubGistToken},
                        url: gitHubApiUrl + "/gists/" + githubGistId,
                        success: function (gistData) {
                            if (njGistIsNew(gistData)) {
                                getShardings(function (callback) {
                                    if (!callback || typeof callback == 'undefined') {
                                        console.log("本地storage里没有内容");
                                        updateGithubGist([]);
                                    } else {
                                        withBackupSettings(callback, updateGithubGist);
                                    }
                                })
                            } else {
                                handleGistLog.push(`${chrome.i18n.getMessage("gistOldReadOnly")}`)
                                isHadCreateGithubGist(action);
                            }
                        },
                        error: function () {
                            isHadCreateGithubGist(action);
                        }
                    })
                } else if (action === "pull_github") {
                    getGithubGistById();
                }
            } else {
                console.log("gistId没有保存");
                handleGistLog.push(`${chrome.i18n.getMessage("gistIdNoSaved")}`)
                isHadCreateGithubGist(action);
            }
        });
    }

    // 判断是否已经保存了gitee的gistId
    function isStoredGiteeGistIdLocal(action) {
        console.log("开始检查gistId有没有保存");
        handleGistLog.push(`${chrome.i18n.getMessage("startCheckGistIdSaved")}`)
        if (action === "push_gitee") {
            pushToGiteeGistStatus = `${chrome.i18n.getMessage("startCheckGistIdSaved")}`;
        } else if (action === "pull_gitee") {
            pullFromGiteeGistStatus = `${chrome.i18n.getMessage("startCheckGistIdSaved")}`;
        }
        chrome.storage.local.get("giteeGistId", function (storage) {
            console.log(storage.giteeGistId);
            if (storage.giteeGistId) {
                console.log("gistId有保存");
                handleGistLog.push(`${chrome.i18n.getMessage("gistIdSaved")}`)
                giteeGistId = storage.giteeGistId;
                if (action === "push_gitee") {
                    // 4.4 需求一：同 GitHub——先核对编号对应的是不是新版 Gist，是旧版的绝不更新
                    $.ajax({
                        type: "GET",
                        headers: {"Authorization": "token " + giteeGistToken},
                        url: giteeApiUrl + "/gists/" + giteeGistId,
                        success: function (gistData) {
                            if (njGistIsNew(gistData)) {
                                getShardings(function (callback) {
                                    if (!callback || typeof callback == 'undefined') {
                                        console.log("本地storage里没有内容");
                                        updateGiteeGist([]);
                                    } else {
                                        withBackupSettings(callback, updateGiteeGist);
                                    }
                                })
                            } else {
                                handleGistLog.push(`${chrome.i18n.getMessage("gistOldReadOnly")}`)
                                isHadCreateGiteeGist(action);
                            }
                        },
                        error: function () {
                            isHadCreateGiteeGist(action);
                        }
                    })
                } else if (action === "pull_gitee") {
                    getGiteeGistById();
                }
            } else {
                console.log("gistId没有保存");
                handleGistLog.push(`${chrome.i18n.getMessage("gistIdNoSaved")}`)
                isHadCreateGiteeGist(action);
            }
        });
    }

    // 通过gistId获取github gist
    function getGithubGistById() {
        console.log("根据gistId拉取gist");
        handleGistLog.push(`${chrome.i18n.getMessage("getGithubGistById")}`)
        pullFromGithubGistStatus = `${chrome.i18n.getMessage("getGithubGistById")}`;
        $.ajax({
            type: "GET",
            headers: {"Authorization": "token " + githubGistToken},
            url: gitHubApiUrl + "/gists/" + githubGistId,
            success: function (data, status) {
                if (status === "success") {
                    // 新文件名优先；旧文件名是 3.1 的备份文件，正是一次性迁移要读到的数据
                    let gistFile = data.files['NJ-Tab_Tabs.json'] || data.files['brower_Tabs.json'];
                    if (!gistFile) {
                        handleGistLog.push(`${chrome.i18n.getMessage("pullFailed")}`)
                        pullFromGithubGistStatus = undefined;
                        return;
                    }
                    if (gistFile.truncated) {
                        let rawUrl = gistFile.raw_url;
                        console.log(rawUrl)
                        getGithubGistByRawUrl(rawUrl);
                    } else {
                        let content = gistFile.content
                        let _content = JSON.parse(content)
                        njFillTabAddTimes(_content.tabGroups);
                        njFillTabAddTimes(_content.delTabGroups);
                        saveShardings(_content.tabGroups, "object");
                        saveShardings(_content.delTabGroups, "del");
                        applyBackupSettings(_content.settings);
                        njLogEvent("gistPull", true, "GitHub");
                        handleGistLog.push(`${chrome.i18n.getMessage("pullSuccess")}`);
                        pullFromGithubGistStatus = undefined;
                    }
                } else {
                    alert("根据gistId拉取gist失败了");
                    handleGistLog.push(`${chrome.i18n.getMessage("pullFailed")}`)
                    pullFromGithubGistStatus = undefined;
                }
            },
            error: function (xhr, errorText, errorType) {
                alert("根据gistId拉取gist报错了");
                handleGistLog.push(`${chrome.i18n.getMessage("pullFailed")}-->${xhr.responseText}`)
                pullFromGithubGistStatus = undefined;
            },
            complete: function () {
                //do something
            }
        })
    }

    // 被截断了，根据raw_url拉取github的gist
    function getGithubGistByRawUrl(rawUrl) {
        console.log("根据raw_url拉取gist");
        handleGistLog.push(`${chrome.i18n.getMessage("getGithubGistByRawUrl")}`)
        pullFromGithubGistStatus = `${chrome.i18n.getMessage("getGithubGistByRawUrl")}`;
        $.ajax({
            type: "GET",
            headers: {"Authorization": "token " + githubGistToken},
            url: rawUrl,
            success: function (data, status) {
                if (status === "success") {
                    let _content = JSON.parse(data)
                    njFillTabAddTimes(_content.tabGroups);
                    njFillTabAddTimes(_content.delTabGroups);
                    saveShardings(_content.tabGroups, "object");
                    saveShardings(_content.delTabGroups, "del");
                    applyBackupSettings(_content.settings);
                    njLogEvent("gistPull", true, "GitHub");
                    handleGistLog.push(`${chrome.i18n.getMessage("pullSuccess")}`);
                } else {
                    alert("根据rawUrl拉取gist失败了");
                    handleGistLog.push(`${chrome.i18n.getMessage("pullFailed")}`)
                }
            },
            error: function (xhr, errorText, errorType) {
                alert("根据rawUrl拉取gist报错了");
                handleGistLog.push(`${chrome.i18n.getMessage("pullFailed")}-->${xhr.responseText}`)
            },
            complete: function () {
                //do something
                pullFromGithubGistStatus = undefined;
            }
        })
    }

    // 通过gistId获取gitee gist
    function getGiteeGistById() {
        console.log("根据gistId拉取gist");
        handleGistLog.push(`${chrome.i18n.getMessage("getGiteeGistById")}`)
        pullFromGiteeGistStatus = `${chrome.i18n.getMessage("getGiteeGistById")}`;
        $.ajax({
            type: "GET",
            headers: {"Authorization": "token " + giteeGistToken},
            url: giteeApiUrl + "/gists/" + giteeGistId,
            success: function (data, status) {
                if (status === "success") {
                    let gistFile = data.files['NJ-Tab_Tabs.json'] || data.files['brower_Tabs.json'];
                    if (!gistFile) {
                        handleGistLog.push(`${chrome.i18n.getMessage("pullFailed")}`)
                        pullFromGiteeGistStatus = undefined;
                        return;
                    }
                    let content = gistFile.content
                    let _content = JSON.parse(content)
                    njFillTabAddTimes(_content.tabGroups);
                    njFillTabAddTimes(_content.delTabGroups);
                    saveShardings(_content.tabGroups, "object");
                    saveShardings(_content.delTabGroups, "del");
                    applyBackupSettings(_content.settings);
                    handleGistLog.push(`${chrome.i18n.getMessage("pullSuccess")}`)
                } else {
                    alert("根据gistId拉取gist失败了");
                    handleGistLog.push(`${chrome.i18n.getMessage("pullFailed")}`)
                }
            },
            error: function (xhr, errorText, errorType) {
                alert("根据gistId拉取gist报错了");
                handleGistLog.push(`${chrome.i18n.getMessage("pullFailed")}-->${xhr.responseText}`)
            },
            complete: function () {
                //do something
                pullFromGiteeGistStatus = undefined;
            }
        })
    }

    // 判断是否已经创建了gitee的gist
    function isHadCreateGiteeGist(action) {
        console.log("检查是否已经创建了gist");
        handleGistLog.push(`${chrome.i18n.getMessage("startCheckGistCreated")}`)
        if (action === "push_gitee") {
            pushToGiteeGistStatus = `${chrome.i18n.getMessage("startCheckGistCreated")}`;
        } else if (action === "pull_gitee") {
            pullFromGiteeGistStatus = `${chrome.i18n.getMessage("startCheckGistCreated")}`;
        }
        $.ajax({
            type: "GET",
            headers: {"Authorization": "token " + giteeGistToken},
            url: giteeApiUrl + "/gists",
            success: function (data, status) {
                if (status === "success") {
                    console.log("查到所有gists！");
                    let i;
                    let flag;
                    // 4.4 需求一：推送只认新标识 NJ-Tab（列表里没有就新建，绝不写旧版）；拉取才兜底认旧标识（只读迁移来源）
                    let targetDesc = "NJ-Tab";
                    if (action === "pull_github" || action === "pull_gitee") {
                        targetDesc = data.some(function (g) { return g.description === "NJ-Tab"; }) ? "NJ-Tab" : "myCloudSkyMonster";
                    }
                    for (i = 0; i < data.length; i += 1) {
                        if (data[i].description === targetDesc) {
                            console.log("已经创建了gist");
                            handleGistLog.push(`${chrome.i18n.getMessage("gistCreated")}`)
                            giteeGistId = data[i].id;
                            chrome.storage.local.set({giteeGistId: data[i].id});
                            handleGistLog.push(`${chrome.i18n.getMessage("getGistIdAndSaved")}`)
                            console.log("获取gistId并保存完毕");
                            console.log(giteeGistId);
                            flag = true;
                            break
                        } else {
                            console.log("还没有创建gist");
                            flag = false;
                        }
                    }
                    if (!flag) {
                        handleGistLog.push(`${chrome.i18n.getMessage("gistNoCreated")}`)
                        if (action === "push_gitee") {
                            getShardings(function (callback) {
                                if (!callback || typeof callback == 'undefined') {
                                    console.log("本地storage里没有内容");
                                    createGiteeGist([]);
                                } else {
                                    withBackupSettings(callback, createGiteeGist);
                                }
                            })
                        } else if (action === "pull_gitee") {
                            console.log("还没有创建gist,没有内容可以拉,结束任务");
                            handleGistLog.push(`${chrome.i18n.getMessage("noGistCreatedAndOver")}`)
                            pullFromGiteeGistStatus = undefined;
                        }
                    } else {
                        if (action === "push_gitee") {
                            getShardings(function (callback) {
                                if (!callback || typeof callback == 'undefined') {
                                    console.log("本地storage里没有内容");
                                    updateGiteeGist([]);
                                } else {
                                    withBackupSettings(callback, updateGiteeGist);
                                }
                            })
                        } else if (action === "pull_gitee") {
                            getGiteeGistById();
                        }
                    }
                } else {
                    alert("获取所有gists时失败了");
                    handleGistLog.push(`${chrome.i18n.getMessage("pullFailed")}`)
                }
            },
            error: function (xhr, errorText, errorType) {
                alert("获取所有gists时报错了");
                handleGistLog.push(`${chrome.i18n.getMessage("pullFailed")}-->${xhr.responseText}`)
            },
            complete: function () {
                //do something
            }
        })
    }

    // 判断是否已经创建了github的gist
    function isHadCreateGithubGist(action) {
        console.log("检查是否已经创建了gist");
        handleGistLog.push(`${chrome.i18n.getMessage("startCheckGistCreated")}`)
        if (action === "push_github") {
            pushToGithubGistStatus = `${chrome.i18n.getMessage("startCheckGistCreated")}`;
        } else if (action === "pull_github") {
            pullFromGithubGistStatus = `${chrome.i18n.getMessage("startCheckGistCreated")}`;
        }
        $.ajax({
            type: "GET",
            headers: {"Authorization": "token " + githubGistToken},
            url: gitHubApiUrl + "/gists",
            success: function (data, status) {
                if (status === "success") {
                    console.log("查到所有gists！");
                    let i;
                    let flag;
                    // 4.4 需求一：推送只认新标识 NJ-Tab（列表里没有就新建，绝不写旧版）；拉取才兜底认旧标识（只读迁移来源）
                    let targetDesc = "NJ-Tab";
                    if (action === "pull_github" || action === "pull_gitee") {
                        targetDesc = data.some(function (g) { return g.description === "NJ-Tab"; }) ? "NJ-Tab" : "myCloudSkyMonster";
                    }
                    for (i = 0; i < data.length; i += 1) {
                        if (data[i].description === targetDesc) {
                            console.log("已经创建了gist");
                            handleGistLog.push(`${chrome.i18n.getMessage("gistCreated")}`)
                            githubGistId = data[i].id;
                            chrome.storage.local.set({githubGistId: data[i].id});
                            handleGistLog.push(`${chrome.i18n.getMessage("getGistIdAndSaved")}`)
                            console.log("获取gistId并保存完毕");
                            console.log(githubGistId);
                            flag = true;
                            break
                        } else {
                            console.log("还没有创建gist");
                            flag = false;
                        }
                    }
                    if (!flag) {
                        handleGistLog.push(`${chrome.i18n.getMessage("gistNoCreated")}`)
                        if (action === "push_github") {
                            getShardings(function (callback) {
                                if (!callback || typeof callback == 'undefined') {
                                    console.log("本地storage里没有内容");
                                    createGithubGist([]);
                                } else {
                                    withBackupSettings(callback, createGithubGist);
                                }
                            })
                        } else if (action === "pull_github") {
                            console.log("还没有创建gist,没有内容可以拉,结束任务");
                            handleGistLog.push(`${chrome.i18n.getMessage("noGistCreatedAndOver")}`)
                            pullFromGithubGistStatus = undefined;
                        }
                    } else {
                        if (action === "push_github") {
                            getShardings(function (callback) {
                                if (!callback || typeof callback == 'undefined') {
                                    console.log("本地storage里没有内容");
                                    updateGithubGist([]);
                                } else {
                                    withBackupSettings(callback, updateGithubGist);
                                }
                            })
                        } else if (action === "pull_github") {
                            getGithubGistById();
                        }
                    }
                } else {
                    alert("获取所有gists时失败了");
                    handleGistLog.push(`${chrome.i18n.getMessage("pullFailed")}`)
                }
            },
            error: function (xhr, errorText, errorType) {
                alert("获取所有gists时报错了");
                handleGistLog.push(`${chrome.i18n.getMessage("pullFailed")}-->${xhr.responseText}`)
            },
            complete: function () {
                //do something
            }
        })
    }

    // ===== 密码/token 本机加密（阶段3）=====
    // 存储格式 {__njEnc:1, iv, ct}（AES-GCM 加密）；密钥单独存 njSecretKeyJwk，只留在本机、与密文分开
    // 老版本存的明文在首次读到时自动改存为密文（一次性迁移）；密码/token 绝不打印到日志
    let njKeyPromise = null;
    let njWebdavPassCache = "";

    function njB64encode(buf) {
        let bytes = new Uint8Array(buf);
        let s = "";
        for (let i = 0; i < bytes.length; i++) { s += String.fromCharCode(bytes[i]); }
        return btoa(s);
    }

    function njB64decode(str) {
        let bin = atob(str);
        let bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) { bytes[i] = bin.charCodeAt(i); }
        return bytes;
    }

    function njGetKey() {
        if (njKeyPromise) { return njKeyPromise; }
        njKeyPromise = new Promise(function (resolve, reject) {
            chrome.storage.local.get("njSecretKeyJwk", function (items) {
                if (items.njSecretKeyJwk) {
                    crypto.subtle.importKey("jwk", items.njSecretKeyJwk, {name: "AES-GCM"}, true, ["encrypt", "decrypt"]).then(resolve, reject);
                } else {
                    crypto.subtle.generateKey({name: "AES-GCM", length: 256}, true, ["encrypt", "decrypt"]).then(function (key) {
                        crypto.subtle.exportKey("jwk", key).then(function (jwk) {
                            chrome.storage.local.set({njSecretKeyJwk: jwk}, function () { resolve(key); });
                        }, reject);
                    }, reject);
                }
            });
        });
        return njKeyPromise;
    }

    function njEncryptSecret(plain) {
        return njGetKey().then(function (key) {
            let iv = crypto.getRandomValues(new Uint8Array(12));
            return crypto.subtle.encrypt({name: "AES-GCM", iv: iv}, key, new TextEncoder().encode(plain)).then(function (ct) {
                return {__njEnc: 1, iv: njB64encode(iv), ct: njB64encode(ct)};
            });
        });
    }

    function njIsEncryptedSecret(v) {
        return !!v && typeof v === "object" && v.__njEnc === 1 && typeof v.iv === "string" && typeof v.ct === "string";
    }

    // 返回明文：老明文（字符串）原样返回；密文解密；解密失败返回空串
    function njDecryptSecret(v) {
        if (v === undefined || v === null || v === "") { return Promise.resolve(""); }
        if (typeof v === "string") { return Promise.resolve(v); }
        if (!njIsEncryptedSecret(v)) { return Promise.resolve(""); }
        function njTryDecrypt(key) {
            return crypto.subtle.decrypt({name: "AES-GCM", iv: njB64decode(v.iv)}, key, njB64decode(v.ct)).then(function (buf) {
                return new TextDecoder().decode(buf);
            });
        }
        return njGetKey().then(function (key) {
            return njTryDecrypt(key).catch(function () {
                // 4.4 附带修复：同 background.js——缓存钥匙与密文脱钩时废缓存、重读存储里的钥匙再试一次
                njKeyPromise = null;
                return njGetKey().then(function (freshKey) {
                    return njTryDecrypt(freshKey).catch(function () { return ""; });
                });
            });
        });
    }

    // 读一个密钥字段并回调明文；若存的是老明文，顺手改存为密文（一次性迁移）
    function njLoadSecretField(field, cb) {
        chrome.storage.local.get(field, function (items) {
            let v = items[field];
            if (typeof v === "string" && v !== "") {
                njEncryptSecret(v).then(function (enc) {
                    let obj = {};
                    obj[field] = enc;
                    chrome.storage.local.set(obj);
                });
                cb(v);
                return;
            }
            njDecryptSecret(v).then(function (plain) { cb(plain || ""); });
        });
    }

    // 页面内密码输入弹窗（替代原生 prompt 输入 token）：密码样式输入，保存后不回显
    function showSecretPrompt(title, onSubmit) {
        let modalHtml = `
        <div class="modal fade" id="secretPromptModal" tabindex="-1" role="dialog" aria-hidden="true">
          <div class="modal-dialog" role="document">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title">${title}</h5>
                <button type="button" class="close" data-dismiss="modal" aria-label="Close">
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
              <div class="modal-body">
                <p>${chrome.i18n.getMessage("saveTokenKey")}</p>
                <input type="password" class="form-control" id="njSecretInput" autocomplete="off">
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-dismiss="modal">${chrome.i18n.getMessage("njCancel")}</button>
                <button type="button" class="btn btn-primary" id="njSecretSaveBtn" disabled>${chrome.i18n.getMessage("njSave")}</button>
              </div>
            </div>
          </div>
        </div>
            `;

        let modalContainer = document.createElement('div');
        modalContainer.innerHTML = modalHtml;
        document.body.appendChild(modalContainer);

        $('#secretPromptModal').modal('show');
        $('#secretPromptModal').on('hidden.bs.modal', function () { modalContainer.remove(); });

        $('#njSecretInput').on('input', function () {
            $('#njSecretSaveBtn').prop('disabled', $(this).val().trim().length === 0);
        });
        $('#njSecretInput').on('keydown', function (e) {
            if (e.key === 'Enter' && !$('#njSecretSaveBtn').prop('disabled')) {
                $('#njSecretSaveBtn').click();
            }
        });
        $('#njSecretSaveBtn').on('click', function () {
            let val = $('#njSecretInput').val().trim();
            $('#secretPromptModal').modal('hide');
            if (val) { onSubmit(val); }
        });
        setTimeout(function () { $('#njSecretInput').focus(); }, 300);
    }

    // 只做第 2 步的输 Y 确认弹窗：第 1 步确认与中间步骤由调用方串联（用于恢复前强制备份流程）
    function showYConfirm(title, message, onConfirm) {
        let modalHtml = `
        <div class="modal fade" id="confirmationModal" tabindex="-1" role="dialog" aria-labelledby="confirmationModalLabel" aria-hidden="true">
          <div class="modal-dialog" role="document">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title" id="confirmationModalLabel">${title}</h5>
                <button type="button" class="close" data-dismiss="modal" aria-label="Close">
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
              <div class="modal-body">
                <p>${message}</p>
                <p>${chrome.i18n.getMessage("njTypeYHint")}</p>
                <input type="text" class="form-control" id="njConfirmYInput" maxlength="1" autocomplete="off" placeholder="Y">
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-dismiss="modal">${chrome.i18n.getMessage("njCancel")}</button>
                <button type="button" class="btn btn-danger" id="njConfirmExecBtn" disabled>${chrome.i18n.getMessage("njExecute")}</button>
              </div>
            </div>
          </div>
        </div>
            `;

        let modalContainer = document.createElement('div');
        modalContainer.innerHTML = modalHtml;
        document.body.appendChild(modalContainer);

        $('#confirmationModal').modal('show');

        $('#njConfirmYInput').on('input', function () {
            let ok = $(this).val().trim().toUpperCase() === 'Y';
            $('#njConfirmExecBtn').prop('disabled', !ok);
        });

        $('#njConfirmYInput').on('keydown', function (e) {
            if (e.key === 'Enter' && !$('#njConfirmExecBtn').prop('disabled')) {
                $('#njConfirmExecBtn').click();
            }
        });

        $('#njConfirmExecBtn').on('click', function () {
            $('#confirmationModal').modal('hide');
            onConfirm();
        });

        setTimeout(function () { $('#njConfirmYInput').focus(); }, 300);
    }

    // 版本号比较：a 比 b 新返回正数，旧返回负数，相同返回 0
    function njVersionCompare(a, b) {
        let pa = String(a).split(".").map(function (x) { return parseInt(x, 10) || 0; });
        let pb = String(b).split(".").map(function (x) { return parseInt(x, 10) || 0; });
        for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
            let d = (pa[i] || 0) - (pb[i] || 0);
            if (d !== 0) { return d; }
        }
        return 0;
    }

    // 本地旧数据一次性转换（阶段3）：3.1 的标签组缺 note/deletedAt 字段时补默认值并写回，只加字段不改已有值
    // 4.3 需求四：一条标签要显示的添加时间（自己的 addTime 优先，老数据未补齐时用分组时间顶上）
    function njTabTimeText(tab, groupDateStr) {
        if (tab && typeof tab.addTime === "string" && tab.addTime) { return tab.addTime; }
        return groupDateStr || "";
    }

    // 4.3 需求四：回收站分组栏显示的时间——删除时间 deletedAt（毫秒数）优先，没有时回退分组创建时间
    function njDelGroupTimeText(group) {
        let d = (group && typeof group.deletedAt === "function") ? group.deletedAt() : null;
        let dn = (typeof d === "number") ? d : ((typeof d === "string" && /^\d+$/.test(d)) ? parseInt(d, 10) : 0);
        if (dn > 0) { return moment(dn).format('YYYY-MM-DD HH:mm:ss'); }
        return moment(group.date()).format('YYYY-MM-DD HH:mm:ss');
    }

    // 4.3 需求四：给缺失的标签补添加时间——用所在分组的时间复制填充（老记录转换口径，用户 2026-11-18 定）。
    // 只补没有 addTime 的标签、只加新字段；返回补上的条数。
    function njFillTabAddTimes(list) {
        let changed = 0;
        if (!Array.isArray(list)) { return 0; }
        list.forEach(function (g) {
            if (!g || !Array.isArray(g.tabs)) { return; }
            let gd = (typeof g.date === "string" && g.date) ? g.date : null;
            if (!gd) { return; }
            g.tabs.forEach(function (t) {
                if (t && typeof t === "object" && (typeof t.addTime !== "string" || !t.addTime)) {
                    t.addTime = gd;
                    changed++;
                }
            });
        });
        return changed;
    }

    // 4.3 的一次性补时间：与 4.1 转换串行衔接（同一批数据只走一遍全量读写，避免两次写回互相覆盖）
    function njFillAddTimeOnce(done) {
        chrome.storage.local.get("njAddTimeFilled43", function (items) {
            if (items.njAddTimeFilled43) { if (done) { done(); } return; }
            getShardings(function (data) {
                let c1 = njFillTabAddTimes(data.tabGroups);
                let c2 = njFillTabAddTimes(data.delTabGroups);
                if (c1 > 0 && Array.isArray(data.tabGroups)) { saveShardings(data.tabGroups, "object"); }
                if (c2 > 0 && Array.isArray(data.delTabGroups)) { saveShardings(data.delTabGroups, "del"); }
                chrome.storage.local.set({njAddTimeFilled43: true}, function () { if (done) { done(); } });
                if (c1 + c2 > 0) { njLogEvent("dataConvert", true, "addTime " + (c1 + c2)); }
            });
        });
    }

    function njMigrateLocalDataOnce() {
        // 旧快照机制已删除（阶段5）：升级时顺手清掉遗留的快照键
        chrome.storage.local.remove("webdavRestoreSnapshot");
        chrome.storage.local.get("njDataConverted41", function (items) {
            if (items.njDataConverted41) { njFillAddTimeOnce(njSettleMigration); return; }
            getShardings(function (data) {
                let changed = false;
                function fix(list, isDel) {
                    if (!Array.isArray(list)) { return []; }
                    return list.map(function (g) {
                        if (!g || typeof g !== "object") { return g; }
                        if (g.note === undefined) { g.note = ""; changed = true; }
                        if (g.deletedAt === undefined) {
                            g.deletedAt = isDel ? (typeof g.createTime === "number" ? g.createTime : null) : null;
                            changed = true;
                        }
                        return g;
                    });
                }
                let tg = fix(data.tabGroups, false);
                let dg = fix(data.delTabGroups, true);
                // 4.3 需求四：同一趟顺带把每条标签的添加时间补齐（用分组时间填充），只写回一次
                let filled = njFillTabAddTimes(tg) + njFillTabAddTimes(dg);
                if (filled > 0) { changed = true; }
                if (changed && tg.length === (Array.isArray(data.tabGroups) ? data.tabGroups.length : 0)
                    && dg.length === (Array.isArray(data.delTabGroups) ? data.delTabGroups.length : 0)) {
                    saveShardings(tg, "object");
                    saveShardings(dg, "del");
                }
                chrome.storage.local.set({njDataConverted41: true, njAddTimeFilled43: true}, njSettleMigration);
                njLogEvent("dataConvert", true, "");
            });
        });
    }

    // 启动时把 WebDAV 密码解密到内存缓存（老明文会顺手迁移为密文），并做一次本地旧数据转换
    njLoadSecretField("webdavPass", function (plain) {
        njWebdavPassCache = plain || "";
    });
    njMigrateLocalDataOnce();

    // 判断是否已经保存github的Token
    function isStoredGithubTokenLocal(action) {
        console.log("开始检查githubtoken有没有保存");
        handleGistLog.push(`${chrome.i18n.getMessage("startCheckGithubTokenSaved")}`);
        if (action === "push_github") {
            pushToGithubGistStatus = `${chrome.i18n.getMessage("startCheckGithubTokenSaved")}`;
        } else if (action === "pull_github") {
            pullFromGithubGistStatus = `${chrome.i18n.getMessage("startCheckGithubTokenSaved")}`;
        }
        // 加密存储：读出并解密（老明文会自动迁移为密文）；token 绝不打印到日志
        njLoadSecretField("githubGistToken", function (plain) {
            if (plain) {
                handleGistLog.push(`${chrome.i18n.getMessage("githubTokenSaved")}`);
                githubGistToken = plain;
                isStoredGithubGistIdLocal(action);
            } else {
                handleGistLog.push(`${chrome.i18n.getMessage("githubTokenNoSaved")}`);
                showSecretPrompt(`${chrome.i18n.getMessage("githubToken")}`, function (token) {
                    njEncryptSecret(token).then(function (enc) {
                        chrome.storage.local.set({githubGistToken: enc}, function () {
                            githubGistToken = token;
                            handleGistLog.push(`${chrome.i18n.getMessage("githubTokenSaveSuccess")}`)
                            isStoredGithubGistIdLocal(action);
                        });
                    });
                });
            }
        });
    }

    // 判断是否已经保存gitee的Token
    function isStoredGiteeTokenLocal(action) {
        console.log("开始检查giteetoken有没有保存");
        handleGistLog.push(`${chrome.i18n.getMessage("startCheckGiteeTokenSaved")}`);
        if (action === "push_gitee") {
            pushToGiteeGistStatus = `${chrome.i18n.getMessage("startCheckGiteeTokenSaved")}`;
        } else if (action === "pull_gitee") {
            pullFromGiteeGistStatus = `${chrome.i18n.getMessage("startCheckGiteeTokenSaved")}`;
        }
        // 加密存储：读出并解密（老明文会自动迁移为密文）；token 绝不打印到日志
        njLoadSecretField("giteeGistToken", function (plain) {
            if (plain) {
                handleGistLog.push(`${chrome.i18n.getMessage("giteeTokenSaved")}`);
                giteeGistToken = plain;
                isStoredGiteeGistIdLocal(action);
            } else {
                handleGistLog.push(`${chrome.i18n.getMessage("giteeTokenNoSaved")}`);
                showSecretPrompt(`${chrome.i18n.getMessage("giteeToken")}`, function (token) {
                    njEncryptSecret(token).then(function (enc) {
                        chrome.storage.local.set({giteeGistToken: enc}, function () {
                            giteeGistToken = token;
                            handleGistLog.push(`${chrome.i18n.getMessage("giteeTokenSaveSuccess")}`)
                            isStoredGiteeGistIdLocal(action);
                        });
                    });
                });
            }
        });
    }

    // 创建github的gist
    function createGithubGist(content) {
        console.log("还没有创建gist,开始创建");
        handleGistLog.push(`${chrome.i18n.getMessage("startCreateGithubGist")}`)
        pushToGithubGistStatus = `${chrome.i18n.getMessage("startCreateGithubGist")}`;
        let _content = JSON.stringify(content);
        let data = {
            "description": "NJ-Tab", "public": false, "files": {
                "NJ-Tab_Tabs.json": {"content": _content}
            }
        }
        $.ajax({
            type: "POST",
            headers: {"Authorization": "token " + githubGistToken},
            url: gitHubApiUrl + "/gists",
            dataType: "json",
            data: JSON.stringify(data),
            success: function (data, status) {
                if (status === "success") {
                    console.log("创建成功！");
                    chrome.storage.local.set({"githubGistId": data.id})
                    handleGistLog.push(`${chrome.i18n.getMessage("createSuccess")}`)
                    njLogEvent("gistPush", true, "GitHub");
                } else {
                    console.log("创建失败！");
                    handleGistLog.push(`${chrome.i18n.getMessage("createFailed")}`)
                }
            },
            error: function (xhr, errorText, errorType) {
                console.log(xhr);
                console.log(errorText);
                console.log(errorType);
                console.log("报错了！");
                handleGistLog.push(`${chrome.i18n.getMessage("createFailed")}-->${xhr.responseText}`)
                    if (xhr.status === 403 || xhr.status === 429) {
                        njLogEvent("gistRateLimited", false, "GitHub HTTP " + xhr.status);
                    } else {
                        njLogEvent("gistPush", false, "GitHub HTTP " + xhr.status);
                    }
            },
            complete: function () {
                //do something
                pushToGithubGistStatus = undefined;
            }
        })
    }

    // 创建gitee的gist
    function createGiteeGist(content) {
        console.log("还没有创建gist,开始创建");
        handleGistLog.push(`${chrome.i18n.getMessage("startCreateGiteeGist")}`)
        pushToGiteeGistStatus = `${chrome.i18n.getMessage("startCreateGiteeGist")}`;
        let _content = JSON.stringify(content);
        let data = {
            "description": "NJ-Tab", "public": false, "files": {
                "NJ-Tab_Tabs.json": {"content": _content}
            }
        }
        $.ajax({
            type: "POST",
            headers: {"Authorization": "token " + giteeGistToken},
            url: giteeApiUrl + "/gists",
            dataType: "json",
            data: data,
            success: function (data, status) {
                if (status === "success") {
                    console.log("创建成功！");
                    chrome.storage.local.set({
                        "giteeGistId": data.id
                    })
                    handleGistLog.push(`${chrome.i18n.getMessage("createSuccess")}`)
                    njLogEvent("gistPush", true, "Gitee");
                } else {
                    console.log("创建失败！");
                    handleGistLog.push(`${chrome.i18n.getMessage("createFailed")}`)
                }
            },
            error: function (xhr, errorText, errorType) {
                console.log(xhr);
                console.log(errorText);
                console.log(errorType);
                console.log("报错了！");
                handleGistLog.push(`${chrome.i18n.getMessage("createFailed")}-->${xhr.responseText}`)
                    if (xhr.status === 403 || xhr.status === 429) {
                        njLogEvent("gistRateLimited", false, "Gitee HTTP " + xhr.status);
                    } else {
                        njLogEvent("gistPush", false, "Gitee HTTP " + xhr.status);
                    }
            },
            complete: function () {
                //do something
                pushToGiteeGistStatus = undefined;
            }
        })
    }

    // 日期格式化
    function dateFormat(fmt, date) {
        let ret;
        let opt = {
            "Y+": date.getFullYear().toString(),        // 年
            "m+": (date.getMonth() + 1).toString(),     // 月
            "d+": date.getDate().toString(),            // 日
            "H+": date.getHours().toString(),           // 时
            "M+": date.getMinutes().toString(),         // 分
            "S+": date.getSeconds().toString()          // 秒
            // 有其他格式化字符需求可以继续添加，必须转化成字符串
        };
        for (let k in opt) {
            ret = new RegExp("(" + k + ")").exec(fmt);
            if (ret) {
                fmt = fmt.replace(ret[1], (ret[1].length === 1) ? (opt[k]) : (opt[k].padStart(ret[1].length, "0")));
            }

        }

        return fmt;
    }

    // 生成唯一标识
    // refer: https://gist.github.com/solenoid/1372386
    let genObjectId = function () {
        let timestamp = (new Date().getTime() / 1000 | 0).toString(16);
        return timestamp + 'xxxxxxxxxxxxxxxx'.replace(/[x]/g, function () {
            return (Math.random() * 16 | 0).toString(16);
        }).toLowerCase();
    };

    // 生成数据结构
    function makeTabGroup(tabsArr) {
        let date;
        date = dateFormat("YYYY-mm-dd HH:MM:SS", new Date());
        let tabGroup = {
            date: date, id: genObjectId() // clever way to quickly get a unique ID
        };
        // 4.3 需求四：标签带自己的添加时间 addTime——已有的一律原样保留（拖拽/删除/还原不改时间），
        // 没有的用本组生成时刻补上（同组收集的标签时间相同，即收集那一刻）
        let res = tabsArr.map(function (t) {
            let nt = {title: t.title, url: t.url};
            nt.addTime = (t && typeof t.addTime === "string" && t.addTime) ? t.addTime : date;
            return nt;
        });
        tabGroup.tabs = res;
        tabGroup.isLock = false;
        tabGroup.groupTitle = '';
        tabGroup.isPined = false;
        return tabGroup;
    }

    // 生成数据结构
    function makeTabGroup(tabsArr, isLock, groupTitle, isPined) {
        let date;
        date = dateFormat("YYYY-mm-dd HH:MM:SS", new Date());
        let tabGroup = {
            date: date, id: genObjectId() // clever way to quickly get a unique ID
        };
        // 4.3 需求四：标签带自己的添加时间 addTime——已有的一律原样保留（拖拽/删除/还原不改时间），
        // 没有的用本组生成时刻补上（同组收集的标签时间相同，即收集那一刻）
        let res = tabsArr.map(function (t) {
            let nt = {title: t.title, url: t.url};
            nt.addTime = (t && typeof t.addTime === "string" && t.addTime) ? t.addTime : date;
            return nt;
        });
        tabGroup.tabs = res;
        tabGroup.isLock = isLock;
        tabGroup.groupTitle = groupTitle;
        tabGroup.isPined = isPined;
        return tabGroup;
    }

    // 获取存在local storage的数据，组成输出
    function getShardings(cb) {
        chrome.storage.local.get(null, function (items) {
            let tabGroupsStr = "";
            if (items.tabGroups_num >= 1) {
                // 把分片数据组成字符串
                for (let i = 0; i < items.tabGroups_num; i++) {
                    tabGroupsStr += items["tabGroups_" + i];
                    delete items["tabGroups_" + i]
                }
            }
            let delTabGroupsStr = "";
            if (items.del_tabGroups_num >= 1) {
                // 把分片数据组成字符串
                for (let i = 0; i < items.del_tabGroups_num; i++) {
                    delTabGroupsStr += items["del_tabGroups_" + i];
                    delete items["del_tabGroups_" + i]
                }
            }
            delete items.tabGroups_num
            delete items.del_tabGroups_num
            delete items.gistLog
            delete items.handleGistStatus
            delete items.handleGithubGistStatus
            delete items.handleGiteeGistStatus
            // 4.4 安全补漏：加密钥匙、操作日志、WebDAV 密码（密文）绝不进 Gist——钥匙与密文同传等于没加密
            delete items.njSecretKeyJwk
            delete items.njLogs
            delete items.webdavPass
            delete items.giteeGistId
            delete items.giteeGistToken
            delete items.githubGistId
            delete items.githubGistToken
            if (tabGroupsStr.length > 0) {
                items["tabGroups"] = JSON.parse(tabGroupsStr)
            }
            if (delTabGroupsStr.length > 0) {
                items["delTabGroups"] = JSON.parse(delTabGroupsStr)
            }
            cb(items)
        });
    }

    // 保存数据到local storage
    // 注意：保存后要清掉比新数据多出来的旧分片，不然删掉的数据会残留占空间、甚至“复活”；
    // 数据为空时也要真正清空（分片数量写0，并移除所有旧分片）。
    function saveShardings(tabGroup, type) {
        // 前缀（tabGroups_ 是正常标签，del_tabGroups_ 是回收站）
        let prefix = "tabGroups_"
        if (type === "del") {
            prefix = "del_tabGroups_"
        }
        let tabGroupStr;
        if (type === "object") {
            tabGroupStr = JSON.stringify(tabGroup);
        } else if (type === "string") {
            tabGroupStr = tabGroup;
        } else if (type === "del") {
            tabGroupStr = JSON.stringify(tabGroup);
        }
        // 是否为空数据（空数组、空字符串、null、undefined 都算）
        let isEmpty = (Array.isArray(tabGroup) && tabGroup.length === 0)
            || !tabGroupStr || tabGroupStr === 'null' || tabGroupStr === 'undefined';
        // 先查一下旧的分片数量，保存完才知道哪些旧分片是多余的
        chrome.storage.local.get(prefix + "num", function (items) {
            let oldNum = 0;
            if (items && typeof items[prefix + "num"] === 'number') {
                oldNum = items[prefix + "num"];
            }
            if (isEmpty) {
                // 真正清空：分片数量写0，并移除所有旧分片
                let emptySlices = {};
                emptySlices[prefix + "num"] = 0;
                chrome.storage.local.set(emptySlices, function () {
                    if (oldNum > 0) {
                        let staleKeys = [];
                        for (let i = 0; i < oldNum; i++) {
                            staleKeys.push(prefix + i);
                        }
                        chrome.storage.local.remove(staleKeys);
                    }
                });
                return;
            }
            // 字符串有值的逻辑
            let length = tabGroupStr.length;
            let sliceLength = 102400;
            let tabGroupSlices = {}; // 保存分片数据
            let i = 0; // 分片序号

            // 分片保存数据
            while (length > 0) {
                tabGroupSlices[prefix + i] = tabGroupStr.substr(i * sliceLength, sliceLength);
                length -= sliceLength;
                i++;
            }

            // 保存分片数量
            tabGroupSlices[prefix + "num"] = i;

            // 写入Storage，写完再清掉多出来的旧分片
            chrome.storage.local.set(tabGroupSlices, function () {
                if (oldNum > i) {
                    let staleKeys = [];
                    for (let j = i; j < oldNum; j++) {
                        staleKeys.push(prefix + j);
                    }
                    chrome.storage.local.remove(staleKeys);
                }
            });
        });
    }

    // ===== A2补完：回收站保留天数可设置 / 每组剩余天数 / 立即清空回收站 =====
    // 保留天数设置存 chrome.storage.local 顶层键 delRetentionDays（数字），
    // 只接受 7 / 30 / 90 / 0 四个值，0 = 不自动清理（永久保留）；没设置过或存了非法值时按默认 30 天。
    const DEL_RETENTION_DEFAULT_DAYS = 30;
    const DEL_RETENTION_DAY_MS = 24 * 60 * 60 * 1000;
    const DEL_RETENTION_OPTIONS = [7, 30, 90, 0];

    // 纯函数：把任意来源的保留天数设置值规范成合法值（可单测）。
    // 注意 null / "" 的 Number() 是 0，不能让它们被误判成「永久保留」，先按未设置处理。
    function normalizeDelRetentionDays(value) {
        if (value === null || typeof value === "undefined" || value === "") {
            return DEL_RETENTION_DEFAULT_DAYS;
        }
        let days = Number(value);
        return DEL_RETENTION_OPTIONS.indexOf(days) !== -1 ? days : DEL_RETENTION_DEFAULT_DAYS;
    }

    // 纯函数：一个回收站组还剩多少天会被自动删除（可单测）。
    // 返回 null 表示不显示这行：永久保留（保留天数 0），或 deletedAt 还不是有效时间戳
    // （旧组会在管理页打开时被补上 deletedAt，补上之后才有剩余天数可算）。
    // 返回 0 表示已到期（下次打开管理页就会被清理），永远不会返回负数。
    function delGroupRemainingDays(deletedAt, retentionDays, now) {
        let days = normalizeDelRetentionDays(retentionDays);
        if (days === 0) {
            return null;
        }
        if (typeof deletedAt !== 'number' || !isFinite(deletedAt)) {
            return null;
        }
        let remainingMs = days * DEL_RETENTION_DAY_MS - (now - deletedAt);
        if (remainingMs <= 0) {
            return 0;
        }
        return Math.ceil(remainingMs / DEL_RETENTION_DAY_MS);
    }

    // 纯函数：按保留天数过滤回收站组数组（可单测），返回 {kept, changed}。
    // 语义与阶段A一致，只把写死的30天换成参数：
    // 1. 没有有效 deletedAt 的旧组补上 now（从补戳时间起算保留期，不会一升级就被删光）；
    //    保留天数为 0 时也照样补戳，保证以后改回有限天数时从补戳时间起算；
    // 2. 保留天数不为 0 且 deletedAt 距今已满保留期的组剔除（彻底删除）；
    // 3. 非对象元素原样保留，绝不误删看不懂的数据。
    function pruneExpiredDelTabGroups(delTabGroups, retentionDays, now) {
        let days = normalizeDelRetentionDays(retentionDays);
        let changed = false;
        let kept = [];
        for (let i = 0; i < delTabGroups.length; i++) {
            let group = delTabGroups[i];
            if (!group || typeof group !== 'object') {
                kept.push(group);
                continue;
            }
            if (typeof group.deletedAt !== 'number' || !isFinite(group.deletedAt)) {
                group.deletedAt = now;
                changed = true;
            }
            if (days !== 0 && now - group.deletedAt >= days * DEL_RETENTION_DAY_MS) {
                // 已过期，彻底删除（不放进kept）
                changed = true;
            } else {
                kept.push(group);
            }
        }
        return {kept: kept, changed: changed};
    }

    // 管理页每次打开时检查一遍回收站：给旧组补 deletedAt，并把超过保留天数的组彻底删除。
    // retentionDays 是设置值（内部会规范化）；doneCallback 可选，清理流程走完后调用（改设置后刷新视图用）。
    function cleanupExpiredDelTabGroups(retentionDays, doneCallback) {
        // 4.3 需求十：读缓存而非存储，避免把合并保存还没落盘的最新状态又盖回去
        njLoadData(function (items) {
            if (!items || !Array.isArray(items.delTabGroups)) {
                if (doneCallback) {
                    doneCallback();
                }
                return;
            }
            let result = pruneExpiredDelTabGroups(items.delTabGroups, retentionDays, Date.now());
            if (result.changed) {
                njSaveAll("del", result.kept);
                njLogEvent("trashAutoClean", true, (items.delTabGroups.length - result.kept.length) + "");
            }
            if (doneCallback) {
                doneCallback();
            }
        });
    }

    // 保存正常的tabGroup
    function saveDefaultTabGroup(tabGroup, type) {
        // 4.3 需求十：改走缓存合并保存（原实现每次都全量读一遍再全量写一遍）
        njLoadData(function (data) {
            njInsertGroupByPin(data.tabGroups, tabGroup);
            njSaveAll("object", data.tabGroups);
        });
    }

    // 保存删除的tabGroup
    function saveDelTabGroup(tabGroup, type) {
        // 进回收站时记下删除时间（毫秒时间戳），超过保留天数（默认30天，可在回收站里改）会被自动彻底删除
        if (tabGroup && typeof tabGroup === 'object') {
            tabGroup.deletedAt = Date.now();
        }
        // 4.3 需求十：改走缓存合并保存
        njLoadData(function (data) {
            njInsertGroupByPin(data.delTabGroups, tabGroup);
            njSaveAll("del", data.delTabGroups);
        });
    }

    // ===== 4.3 需求十/九：数据缓存 + 合并保存 + 分段渲染 =====
    // 渲染与列表操作统一走内存缓存 njDataCache，不再每次全量读存储、解析、重画：
    // 这是删除后画面偶尔不刷新（保存与重读竞态，需求九）和大数据量下什么都卡（需求十）的共同根源。
    // 保存改为合并延时写盘：250ms 内的连续操作只写一次；页面关闭前兜底刷盘。
    let njDataCache = null;
    // 当前页标记（"#home" / "#baks" / "#options" 等）：路由器每次导航时更新，
    // showAllTabs / showAllDelTabs 也会同步设置，供搜索与外部变更重渲染判断当前页
    let njCurrentPage = "#home";
    // 一次性数据转换（4.1 转换 + 4.3 补 addTime）的完成屏障：转换直接读写存储、
    // 不走缓存；若缓存抢先加载了转换前的数据，之后的合并保存会把转换结果盖回去
    // （实测出现过回收站 deletedAt 补戳被转换的 null 覆盖）。首次 njLoadData 必须
    // 等转换收尾后再读存储；转换各条路径结束时调 njSettleMigration 放行。
    let njMigrationSettled = false;
    let njMigrationWaiters = [];
    function njSettleMigration() {
        if (njMigrationSettled) {
            return;
        }
        njMigrationSettled = true;
        let waiters = njMigrationWaiters;
        njMigrationWaiters = [];
        waiters.forEach(function (w) { w(); });
    }
    // 兜底：转换流程万一异常没走完，3 秒后也放行，避免页面一直空白
    setTimeout(njSettleMigration, 3000);
    let njSaveTimers = {};
    let njSavePending = {};
    let njOwnSaveUntil = 0;
    // 4.4 需求六配套：是否有拖拽正在进行（任一 Sortable 的 onChoose 置 true、onUnchoose/onEnd 置 false）
    let njDragActive = false;
    // 拖拽进行中时，把存储变化引发的自动重渲染推迟到拖拽结束后再做：
    // 重渲染会销毁并重建所有 Sortable 实例，拖到一半被销毁，拖拽就无声失效（实测定位：每次保存后 2.6 秒的对账重渲染正好会撞上下一次拖拽）
    function njRenderListWhenIdle() {
        if (njDragActive) {
            setTimeout(njRenderListWhenIdle, 800);
            return;
        }
        njDataCache = null;
        let h = njCurrentPage;
        if (h === "#search") { showSearchPage(); return; }
        if (h === "#home" || h === "" || h === "#") { showAllTabs(); }
        if (h === "#baks") { showAllDelTabs(); }
    }
    let njHomeRenderLimit = 50;
    let njBaksRenderLimit = 50;

    function njLoadData(cb) {
        if (njDataCache) {
            cb(njDataCache);
            return;
        }
        if (!njMigrationSettled) {
            // 首次加载等一次性转换收尾，避免缓存装进转换前的数据
            njMigrationWaiters.push(function () { njLoadData(cb); });
            return;
        }
        getShardings(function (items) {
            njDataCache = {
                tabGroups: items && Array.isArray(items.tabGroups) ? items.tabGroups : [],
                delTabGroups: items && Array.isArray(items.delTabGroups) ? items.delTabGroups : []
            };
            cb(njDataCache);
        });
    }

    function njSaveAll(type, arr) {
        if (njDataCache) {
            if (type === "object") {
                njDataCache.tabGroups = arr;
            } else {
                njDataCache.delTabGroups = arr;
            }
        }
        njSavePending[type] = arr;
        if (njSaveTimers[type]) {
            clearTimeout(njSaveTimers[type]);
        }
        njSaveTimers[type] = setTimeout(function () {
            njFlushSave(type);
        }, 250);
    }

    function njFlushSave(type) {
        if (njSaveTimers[type]) {
            clearTimeout(njSaveTimers[type]);
            njSaveTimers[type] = null;
        }
        let arr = njSavePending[type];
        if (!arr) {
            return;
        }
        delete njSavePending[type];
        njOwnSaveUntil = Date.now() + 2500;
        saveShardings(arr, type);
    }

    window.addEventListener("beforeunload", function () {
        njFlushSave("object");
        njFlushSave("del");
    });

    // 单个组插入列表：有置顶组时插到最后一个置顶组后面，否则追加末尾（与原 saveDelTabGroup/saveDefaultTabGroup 同口径）
    function njInsertGroupByPin(list, group) {
        let flag = false;
        for (let i = 0; i < list.length; i++) {
            if (list[i].isPined === undefined || list[i].isPined === false) {
                list.splice(i, 0, group);
                flag = true;
                break;
            }
        }
        if (!flag) {
            list.push(group);
        }
    }

    // 外部改动（后台收集、导入/拉取/恢复等直接写盘的流程）让缓存作废并重渲染当前列表页；自己保存引发的变化忽略。
    // 外部写入比缓存里的待写数据新：待写的合并保存一并丢弃，不然页面刷新时兜底刷盘会把外部结果覆盖掉；
    // 被丢弃的至多是 250ms 内的一次小操作，标签本身不会丢（该组会重新出现，可再操作）。
    if (chrome.storage && chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener(function (changes, area) {
            if (area !== "local") {
                return;
            }
            let touched = false;
            for (let k in changes) {
                if (/^(tabGroups|del_tabGroups)_/.test(k) || k === "tabGroups_num" || k === "del_tabGroups_num") {
                    touched = true;
                    break;
                }
            }
            if (!touched) {
                return;
            }
            if (Date.now() < njOwnSaveUntil) {
                // 可能是自己刚写盘的回声，也可能混着外部改动：稍后无条件对账一次（拖拽中则再顺延，见 njRenderListWhenIdle）
                setTimeout(njRenderListWhenIdle, 2600);
                return;
            }
            for (let t in njSaveTimers) {
                clearTimeout(njSaveTimers[t]);
            }
            njSaveTimers = {};
            njSavePending = {};
            njRenderListWhenIdle();
        });
    }

    // 展示保存的所有url
    function showAllTabs() {
        njCurrentPage = "#home";
        njLoadData(function (njData) {
        chrome.storage.local.get(["options", "dragType", "restoreDiscarded", "discardedThreshold"], function (storage) {
            let bridge = njData.tabGroups;
            let i;
            let total = 0;
            for (i = 0; i < bridge.length; i += 1) {
                total += bridge[i].tabs.length;
            }
            let totalsEl = document.getElementById('totals');
            totalsEl.innerHTML = `${chrome.i18n.getMessage("existed")}${i}${chrome.i18n.getMessage("group")}`;
            totalsEl.title = `${chrome.i18n.getMessage("existed")}${i}${chrome.i18n.getMessage("group")} / ${total}${chrome.i18n.getMessage("totals")}`;
            // 4.4 需求六：两种拖拽同时可用——组与标签都带 my-handle，不再按 dragType 二选一
            let titleClass = ".my-handle", tabClass = ".my-handle";
            let tabs = {}, // to-be module
                tabGroups = bridge || [], // tab groups
                opts = storage.options || {
                    deleteTabOnOpen: 'no'
                };
            // 恢复时休眠打开的开关（阶段D，存 chrome.storage.local 的 restoreDiscarded，默认 false = 保持原行为）
            let restoreDiscarded = storage.restoreDiscarded === true;
            // 4.4 需求五：休眠阈值 N（同一个数，默认 10）；只在休眠开关开时才参与判断
            let discardedN = parseInt(storage.discardedThreshold, 10);
            if (!(discardedN >= 1)) { discardedN = 10; }

            function saveTabGroups(json) {
                njSaveAll("object", json);
            }

            function saveDelTabGroups(json) {
                saveDelTabGroup(json, "del");
            }

            // model entity
            // 'data' is meant to be a tab group object from localStorage
            tabs.TabGroup = function (data) {
                this.date = m.prop(data.date);
                this.id = m.prop(data.id);
                this.tabs = m.prop(data.tabs);
                this.isLock = m.prop(data.isLock);
                this.groupTitle = m.prop(data.groupTitle)
                this.isPined = m.prop(data.isPined)
                // 标签组备注（阶段D）：旧组没有 note 字段时这里是 undefined，视图按 "" 显示，不批量改写旧数据
                this.note = m.prop(data.note)
            };

            // alias for Array
            tabs.TabGroupsList = Array;

            // view-model
            tabs.vm = new function () {
                let vm = {};
                vm.init = function () {
                    // list of tab groups
                    vm.list = new tabs.TabGroupsList();

                    vm.rmGroup = function (groupIndex) {
                        // remove from localStorage
                        let delTabGroups = tabGroups.splice(groupIndex, 1);
                        // save
                        saveTabGroups(tabGroups);
                        // save all deleted tab groups
                        // 如果是空组，就不发给回收站
                        if (delTabGroups[0].tabs.length > 0) {
                            saveDelTabGroups(delTabGroups[0])
                        }
                        showAllTabs();
                    };

                    vm.moveGroup = function (index, tindex) {
                        if (index > tindex) {
                            tabGroups.splice(tindex, 0, tabGroups[index]);
                            tabGroups.splice(index + 1, 1);
                            saveTabGroups(tabGroups);
                        } else {
                            tabGroups.splice(tindex + 1, 0, tabGroups[index]);
                            tabGroups.splice(index, 1);
                            saveTabGroups(tabGroups);
                        }
                    };

                    vm.updateGroup = function (index, groupInfo) {
                        let isLock = groupInfo.isLock
                        let toTop = groupInfo.toTop
                        let groupTitle = groupInfo.groupTitle
                        if (isLock !== undefined) {
                            tabGroups[index].isLock = isLock
                            saveTabGroups(tabGroups);
                            showAllTabs();
                        }
                        if (toTop !== undefined) {
                            if (toTop) {
                                tabGroups[index].isPined = toTop
                                tabs.vm.moveGroup(index, 0)
                                showAllTabs();
                            } else {
                                let count = 0;
                                for (let i = 0; i < tabGroups.length; i++) {
                                    const currentElement = tabGroups[i];
                                    if (currentElement.isPined === undefined || currentElement.isPined === false) {
                                        break;
                                    }
                                    count++;
                                }
                                tabGroups[index].isPined = toTop
                                tabs.vm.moveGroup(index, count - 1)
                                showAllTabs();
                            }
                        }
                        if (groupTitle !== undefined) {
                            tabGroups[index].groupTitle = groupTitle
                            saveTabGroups(tabGroups);
                            showAllTabs();
                        }
                        // 标签组备注（阶段D）：只增字段，note 原样存回组对象；回收站那份 updateGroup 不加此分支，
                        // 回收站里的组被还原时 note 会随对象原样保留
                        let note = groupInfo.note
                        if (note !== undefined) {
                            tabGroups[index].note = note
                            saveTabGroups(tabGroups);
                            showAllTabs();
                        }
                    };

                    vm.rmTab = function (groupIndex, index) {
                        let delTabs = tabGroups[groupIndex].tabs.splice(index, 1);
                        // save
                        saveTabGroups(tabGroups);
                        // save deleted tabs
                        saveDelTabGroups(makeTabGroup(delTabs))
                        showAllTabs();
                    };

                    vm.moveTab = function (groupIndex, index, tgroupIndex, tindex) {
                        if (groupIndex === tgroupIndex) {
                            if (index > tindex) {
                                tabGroups[groupIndex].tabs.splice(tindex, 0, tabGroups[groupIndex].tabs[index]);
                                tabGroups[groupIndex].tabs.splice(index + 1, 1);
                                saveTabGroups(tabGroups);
                            } else {
                                tabGroups[groupIndex].tabs.splice(tindex + 1, 0, tabGroups[groupIndex].tabs[index]);
                                tabGroups[groupIndex].tabs.splice(index, 1);
                                saveTabGroups(tabGroups);
                            }
                        } else {
                            tabGroups[tgroupIndex].tabs.splice(tindex, 0, tabGroups[groupIndex].tabs[index]);
                            tabGroups[groupIndex].tabs.splice(index, 1);
                            saveTabGroups(tabGroups);
                        }
                    };
                };
                return vm;
            };

            tabs.controller = function () {
                let i;
                tabs.vm.init();
                for (i = 0; i < tabGroups.length; i += 1) {
                    tabs.vm.list.push(new tabs.TabGroup(tabGroups[i]));
                }
            };

            tabs.view = function () {
                if (tabs.vm.list.length === 0) {
                    return m('div', [m('div.jumbotron', [m('div', {style: "text-align:center; margin-bottom:50px"}, `${chrome.i18n.getMessage("noTabs")}`)])])
                }
                // foreach tab group
                // 4.3 需求十：分段渲染——先只画前 njHomeRenderLimit 组，末尾带「查看更多」逐段展开；
                // 前缀切片保证已渲染组的序号与完整列表序号一致，拖拽/点击的索引语义不变。搜索仍走全量数据。
                let njGroupNodes = tabs.vm.list.slice(0, njHomeRenderLimit).map(function (group, i) {
                    // console.log(tabs.vm.list);
                    // console.log(group.tabs());
                    // console.log(i);
                    // 如果标签组是空的，就自动删了
                    if (group.tabs().length === 0) {
                        tabs.vm.rmGroup(i);
                    }
                    let isLock = group.isLock()
                    let isPined = group.isPined()
                    let deleteLinkClass, lockStatus, lockImgClass, lockClass = ""
                    if (isLock) {
                        // 4.4 需求四：锁定后标题前的按钮显示为小锁（点它解锁），不再是空白占位
                        deleteLinkClass = ".nj-group-lock-btn"
                        lockStatus = `${chrome.i18n.getMessage("unLock")}`
                        lockImgClass = ".lock-img"
                        lockClass = ".filtered"
                    } else {
                        deleteLinkClass = ".delete-link"
                        lockStatus = `${chrome.i18n.getMessage("lock")}`
                        lockImgClass = ".no-lock-img"
                    }
                    let pinStatus, pinImgClass = ""
                    if (isPined) {
                        pinStatus = `${chrome.i18n.getMessage("noToTop")}`
                        pinImgClass = ".pin-img"
                        lockClass = ".filtered"
                    } else {
                        pinStatus = `${chrome.i18n.getMessage("toTop")}`
                        pinImgClass = ".no-pin-img"
                    }
                    let groupTitle = group.groupTitle()

                    return m('div.tabs' + titleClass + lockClass, {
                        id: i
                    }, [m('div.group-title', [m('span' + deleteLinkClass, {
                        onclick: function (e) {
                            let ci = currentGroupIndex((e && e.currentTarget) || this, i);
                            if (isLock) {
                                // 4.4 需求四：点标题前的小锁直接解锁整组（与操作行「取消锁定」等效）
                                njHomeUnlockedTabs.forEach(function (k) { if (k.indexOf(group.id() + "|") === 0) { njHomeUnlockedTabs.delete(k); } });
                                tabs.vm.updateGroup(ci, {isLock: false});
                            } else {
                                showConfirmation(`${chrome.i18n.getMessage("confirm")}`, `${chrome.i18n.getMessage("confirmationDel")}`, function () {
                                    tabs.vm.rmGroup(ci);
                                });
                            }
                        }
                    }, isLock ? m('img.nj-group-lock-img', {
                        src: "/images/lock.png"
                    }) : undefined), m('img' + pinImgClass, {
                        src: "/images/pin.png"
                    }), ' ', m('span.group-amount', {
                        onclick: function (e) {
                            $("#tabs_" + currentGroupIndex((e && e.currentTarget) || this, i)).slideToggle();
                        }
                    }, group.tabs().length + `${chrome.i18n.getMessage("tabsNo")}`), ' ', m('span.group-name', {
                        id: "groupTitle" + i, onclick: function (e) {
                            let ci = currentGroupIndex((e && e.currentTarget) || this, i);
                            let val = $("#groupTitle" + ci).html();
                            $("#groupTitle" + ci).slideToggle(100);
                            $("#groupTitleInput" + ci).slideToggle(1000);
                            setTimeout(function () {
                                $("#groupTitleInput" + ci).focus();
                            }, 100);
                            $("#groupTitleInput" + ci).val(val)
                        }
                    }, groupTitle), ' ', m('input.group-title-input', {
                        id: "groupTitleInput" + i, style: "display:none", onchange: function (e) {
                            let ci = currentGroupIndex((e && e.currentTarget) || this, i);
                            let val = $("#groupTitleInput" + ci).val()
                            $("#groupTitle" + ci).html(val)
                            $("#groupTitle" + ci).slideToggle(1000);
                            $("#groupTitleInput" + ci).slideToggle(100);
                            tabs.vm.updateGroup(ci, {groupTitle: val})
                        }, onblur: function (e) {
                            let ci = currentGroupIndex((e && e.currentTarget) || this, i);
                            let val = $("#groupTitleInput" + ci).val()
                            $("#groupTitle" + ci).html(val)
                            $("#groupTitle" + ci).slideToggle(1000);
                            $("#groupTitleInput" + ci).slideToggle(100);
                            tabs.vm.updateGroup(ci, {groupTitle: val})
                        }
                    }), m('span.restore-all', {
                        onclick: function (e) {
                            let j;
                            let ci = currentGroupIndex((e && e.currentTarget) || this, i);

                            // reason this goes first and not after is because it doesn't work otherwise
                            // I imagine it's because you changed tab and stuff
                            if (opts.deleteTabOnOpen === 'yes') {
                                if (!isLock) {
                                    tabs.vm.rmGroup(ci);
                                }
                            }
                            for (j = 0; j < group.tabs().length; j += 1) {
                                // 4.4 需求五：休眠只在开关开、且组内条数超过 N 时才用，且只休眠第 N 条之后的；
                                // 前 N 条与不超过 N 的组都直接打开。关时与原行为完全一致。
                                let useDiscarded = restoreDiscarded && group.tabs().length > discardedN && j >= discardedN;
                                openRestoredTab(group.tabs()[j].url, useDiscarded);
                            }
                        }
                    }, `${chrome.i18n.getMessage("restoreGroup")}`), m('span.about-lock', {
                        onclick: function (e) {
                            tabs.vm.updateGroup(currentGroupIndex((e && e.currentTarget) || this, i), {isLock: !isLock})
                        }
                    }, lockStatus), m('span.about-top', {
                        onclick: function (e) {
                            tabs.vm.updateGroup(currentGroupIndex((e && e.currentTarget) || this, i), {toTop: !isPined})
                        }
                    }, pinStatus), m('span.about-name', {
                        onclick: function (e) {
                            let ci = currentGroupIndex((e && e.currentTarget) || this, i);
                            let val = $("#groupTitle" + ci).html();
                            $("#groupTitle" + ci).slideToggle(100);
                            $("#groupTitleInput" + ci).slideToggle(1000);
                            setTimeout(function () {
                                $("#groupTitleInput" + ci).focus();
                            }, 100);
                            $("#groupTitleInput" + ci).val(val)
                        }
                    }, `${chrome.i18n.getMessage("nameThis")}`), m('span.about-note', {
                        onclick: function (e) {
                            let ci = currentGroupIndex((e && e.currentTarget) || this, i);
                            let cur = (tabGroups[ci] && typeof tabGroups[ci].note === "string") ? tabGroups[ci].note : "";
                            $("#groupNote" + ci).slideToggle(100);
                            $("#groupNoteInput" + ci).slideToggle(1000);
                            setTimeout(function () {
                                $("#groupNoteInput" + ci).focus();
                            }, 100);
                            $("#groupNoteInput" + ci).val(cur)
                        }
                    }, `${chrome.i18n.getMessage("groupNote")}`)]), // 备注行（阶段D）：有备注时在组标题下方以小号灰字显示全文；点备注或上面「备注」操作切换成内联输入框编辑（与组名编辑同款交互）
                        m('div.group-note-row', [m('span.group-note', {
                            id: "groupNote" + i, onclick: function (e) {
                                let ci = currentGroupIndex((e && e.currentTarget) || this, i);
                                let cur = (tabGroups[ci] && typeof tabGroups[ci].note === "string") ? tabGroups[ci].note : "";
                                $("#groupNote" + ci).slideToggle(100);
                                $("#groupNoteInput" + ci).slideToggle(1000);
                                setTimeout(function () {
                                    $("#groupNoteInput" + ci).focus();
                                }, 100);
                                $("#groupNoteInput" + ci).val(cur)
                            }
                        }, (typeof group.note() === "string" ? group.note() : "")), m('input.group-note-input', {
                            id: "groupNoteInput" + i, style: "display:none", onchange: function (e) {
                                let ci = currentGroupIndex((e && e.currentTarget) || this, i);
                                let val = $("#groupNoteInput" + ci).val()
                                $("#groupNote" + ci).text(val)
                                $("#groupNote" + ci).slideToggle(1000);
                                $("#groupNoteInput" + ci).slideToggle(100);
                                tabs.vm.updateGroup(ci, {note: val})
                            }, onblur: function (e) {
                                let ci = currentGroupIndex((e && e.currentTarget) || this, i);
                                let val = $("#groupNoteInput" + ci).val()
                                $("#groupNote" + ci).text(val)
                                $("#groupNote" + ci).slideToggle(1000);
                                $("#groupNoteInput" + ci).slideToggle(100);
                                tabs.vm.updateGroup(ci, {note: val})
                            }
                        })]), // foreach tab
                        m('ul' + tabClass + lockClass, {
                            id: "tabs_" + i
                        }, group.tabs().map(function (tab, ii) {
                            let njTabKey = group.id() + "|" + tab.url + "\n" + tab.title;
                            let njUnlocked = isLock && njHomeUnlockedTabs.has(njTabKey);
                            return m('li.li-hover.li-standard', [m('span' + (isLock ? (njUnlocked ? '.delete-link' : '.nj-tab-lock') : deleteLinkClass), {
                                onclick: function (e) {
                                    let spanEl = (e && e.currentTarget) || this;
                                    let ci = currentGroupIndex(spanEl, i);
                                    let cii = currentTabIndex(spanEl, ii);
                                    if (!isLock || njHomeUnlockedTabs.has(njTabKey)) {
                                        njHomeUnlockedTabs.delete(njTabKey);
                                        tabs.vm.rmTab(ci, cii);
                                        return;
                                    }
                                    // 4.4 需求三：锁定组里点小锁只解锁这一条（只当次有效、不写存储）：记进内存集合并就地把小锁换成删除图标，再点才真删
                                    njHomeUnlockedTabs.add(njTabKey);
                                    spanEl.setAttribute("data-nj-unlocked", "1");
                                    spanEl.className = "delete-link";
                                    spanEl.innerHTML = "";
                                },
                                config: function (el) {
                                    if (njUnlocked) { el.setAttribute("data-nj-unlocked", "1"); }
                                }
                            }, (isLock && !njUnlocked) ? m('img.nj-tab-lock-img', {
                                src: "/images/lock.png"
                            }) : undefined), m('span.link', {
                                title: tab.title + "\n" + tab.url, onclick: function (e) {
                                    let ci = currentGroupIndex((e && e.currentTarget) || this, i);
                                    let cii = currentTabIndex((e && e.currentTarget) || this, ii);
                                    if (opts.deleteTabOnOpen === 'yes') {
                                        if (!isLock) {
                                            tabs.vm.rmTab(ci, cii);
                                        }
                                    }
                                    chrome.tabs.create({
                                        url: tab.url, active: false
                                    });
                                },
                                onmousedown: function (e) {
                                    // 中键按下先拦住浏览器的自动滚动（4.2 需求五）
                                    if (e && e.button === 1) {
                                        e.preventDefault();
                                    }
                                },
                                onauxclick: function (e) {
                                    // 中键点击：后台打开，永不删除此条（4.2 需求五；打开时删除的开关只管左键）
                                    if (e && e.button === 1) {
                                        e.preventDefault();
                                        chrome.tabs.create({
                                            url: tab.url, active: false
                                        });
                                    }
                                }
                            }, tab.title), m('span.tab-add-time', njTabTimeText(tab, group.date()))]);
                        }))]);
                });
                if (tabs.vm.list.length > njHomeRenderLimit) {
                    njGroupNodes.push(m('div.nj-more-wrap.filtered', [m('button.btn.btn-default', {
                        onclick: function () {
                            njHomeRenderLimit += 50;
                            showAllTabs();
                        }
                    }, `${chrome.i18n.getMessage("logShowMore")}（${tabs.vm.list.length - njHomeRenderLimit}）`)]));
                }
                return njGroupNodes;
            };


            // init the app
            m.module(document.getElementById('tabGroups'), {controller: tabs.controller, view: tabs.view});

            // 重建 Sortable 前先销毁上一轮的实例并清空数组，避免实例叠加泄漏、越拖越卡（阶段B）
            sortableTitle = njSafeDestroySortable(sortableTitle);
            for (let si = 0; si < sortableTabList.length; si += 1) {
                njSafeDestroySortable(sortableTabList[si]);
            }
            sortableTabList.length = 0;

            // 以下是超级拖曳的相关代码
            // 4.4 需求六：组拖拽与标签拖拽同时启用（原 dragType 互斥条件已取消）
            {
                sortableTitle = Sortable.create(document.getElementById("tabGroups"), {
                        group: {
                            name: "tabGroups", pull: false, put: false
                        }, scroll: true, easing: "cubic-bezier(1, 0, 0, 1)", animation: 100, //动画参数
                        ghostClass: 'ghost', filter: '.filtered',
                        // 4.4 需求六配套：拖拽进行中标记——存储变化引发的自动重渲染须等拖拽结束（见 njRenderListWhenIdle）
                        onChoose: function () {
                            njDragActive = true;
                        },
                        onUnchoose: function () {
                            njDragActive = false;
                        },
                        onEnd: function (evt) { //拖拽完毕之后发生该事件
                            // console.log(evt)
                            // console.log(evt.item);
                            // console.log(evt.to);
                            // console.log(evt.from);
                            // console.log(evt.oldIndex);
                            // console.log(evt.newIndex);
                            // console.log(evt.oldDraggableIndex);
                            // console.log(evt.newDraggableIndex);
                            njDragActive = false;
                            tabs.vm.moveGroup(evt.oldIndex, evt.newIndex);
                            // 同步 mithril 的 vm.list 顺序：点击等事件后 mithril 会按 vm.list 做 diff 重绘，不同步会把顺序画回拖动前
                            let movedGroup = tabs.vm.list.splice(evt.oldIndex, 1)[0];
                            if (movedGroup) {
                                tabs.vm.list.splice(evt.newIndex, 0, movedGroup);
                            }
                            // 不再全量重渲染（Sortable 已把 DOM 节点移到正确位置），只同步写死在 DOM 上的序号/计数
                            syncDragDomOrder("tabGroups", "");
                        }
                    });

            }

            {
                let j;
                for (j = 0; j < Math.min(bridge.length, njHomeRenderLimit); j += 1) {
                    let sortableTab = Sortable.create(document.getElementById("tabs_" + j), {
                        group: {
                            name: "tabs", pull: true, put: true
                        }, easing: "cubic-bezier(1, 0, 0, 1)", scroll: true, swapThreshold: 0.65, animation: 100, //动画参数
                        filter: '.filtered',
                        // 4.4 需求六配套：拖拽进行中标记（同组拖拽的 onChoose）
                        onChoose: function () {
                            njDragActive = true;
                        },
                        onUnchoose: function () {
                            njDragActive = false;
                        },
                        onEnd: function (evt) {
                            // console.log(evt)
                            // console.log(evt.item);
                            // console.log(evt.to);
                            // console.log(evt.from);
                            // console.log(evt.oldIndex);
                            // console.log(evt.newIndex);
                            // console.log(evt.oldDraggableIndex);
                            // console.log(evt.newDraggableIndex);
                            // console.log("从" + evt.from.parentNode.id + "的" + evt.oldIndex + "到" + evt.to.parentNode.id + "的" + evt.newIndex)
                            njDragActive = false;
                            tabs.vm.moveTab(evt.from.parentNode.id, evt.oldIndex, evt.to.parentNode.id, evt.newIndex)
                            // 标签数据数组与 vm.list 里组对象的 tabs 是同一引用，moveTab 已同步；不再全量重渲染，只同步 DOM 上的序号/计数
                            syncDragDomOrder("tabGroups", "");
                        }
                    })
                    sortableTabList.push(sortableTab);
                }

            }

        });
        });
    }

    // 展示Log
    function showAllLogs() {
        chrome.storage.local.get(function (storage) {
            console.log(storage)
            let bridge = [];
            if (storage.gistLog) {
                bridge = storage.gistLog;
                console.log(bridge)
                document.getElementById('totals').innerHTML = `${bridge.length}${chrome.i18n.getMessage("totals")}`;
            } else {
                document.getElementById('totals').innerHTML = `0${chrome.i18n.getMessage("totals")}`;
            }
            // 4.3 需求十三：悬停提示同步成日志口径，别残留首页的组数/条数（原来只改文字没改 title）
            document.getElementById('totals').title = `${chrome.i18n.getMessage("showLog")}：${bridge.length}${chrome.i18n.getMessage("totals")}`;
            let logs = {}, // to-be module
                logGroups = bridge || [];

            // model entity
            logs.LogGroup = function (data) {
                this.type = m.prop(data.handleGistType);
                this.id = m.prop(data.id);
                this.logs = m.prop(data.handleGistLogs);
            };

            // alias for Array
            logs.LogGroupsList = Array;

            // view-model
            logs.vm = new function () {
                let vm = {};
                vm.init = function () {
                    vm.list = new logs.LogGroupsList();
                };
                return vm;
            };

            logs.controller = function () {
                let i;
                logs.vm.init();
                for (i = 0; i < logGroups.length; i += 1) {
                    logs.vm.list.push(new logs.LogGroup(logGroups[i]));
                }
            };

            logs.view = function () {
                if (logs.vm.list.length === 0) {
                    return m('div', m('div.jumbotron', [m('div', {style: "text-align:center; margin-bottom:50px"}, `${chrome.i18n.getMessage("noLog")}`)]))
                }

                return logs.vm.list.map(function (group, i) {
                    return m('div.div-top', {
                        id: i
                    }, [m('div', [m('span.group-title', {
                        onclick: function () {
                            $("#logs_" + i).slideToggle();
                        }
                    }, group.type())]), m('ul', {
                        id: "logs_" + i
                    }, group.logs().map(function (log, ii) {
                        return m('li.li-hover li-standard', [m('span.line', {}, log)]);
                    }))]);
                });
            };
            // init the app
            m.module(document.getElementById('logs'), {controller: logs.controller, view: logs.view});
        });
    }

    // ===== WebDAV 同步（阶段C：只做手动上传/恢复，不接进 background 的 Gist 定时器） =====
    // 从配置页的输入框读 WebDAV 配置；非密码字段顺手存一份到 chrome.storage.local
    // 密码只加密存：输入框有新密码才更新，留空时用启动时已解密的缓存值，绝不回写明文
    function readWebDavConfig() {
        let urlEl = document.getElementById("webdavUrl");
        if (!urlEl) {
            return null;
        }
        // 密码不 trim：首尾空格也可能是密码的一部分
        let passInput = document.getElementById("webdavPass").value;
        let cfg = {
            webdavUrl: urlEl.value.trim(),
            webdavUser: document.getElementById("webdavUser").value.trim(),
            webdavPass: passInput !== "" ? passInput : njWebdavPassCache,
            // 4.2 起备份统一用带时间戳的版本文件名，旧的固定文件名设置已取消；这里只保留一个兜底名（列不出版本时的老路）
            webdavFile: "NJ-Tab-Backup.json"
        };
        chrome.storage.local.set({
            webdavUrl: cfg.webdavUrl,
            webdavUser: cfg.webdavUser
        });
        if (passInput !== "") {
            njWebdavPassCache = passInput;
            njEncryptSecret(passInput).then(function (enc) {
                chrome.storage.local.set({webdavPass: enc});
            });
        }
        return cfg;
    }

    // ===== WebDAV 多版本备份（阶段4）=====
    // 版本文件名 NJ-Tab-Backup-YYYYMMDD-HHmmss.json（本地时间）；只认这个命名规则，远端其他文件一律不碰（4.2 需求三）
    function njVersionFileName(d) {
        function p(n) { return (n < 10 ? "0" : "") + n; }
        return "NJ-Tab-Backup-" + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) + ".json";
    }

    function njVersionTime(name) {
        let m = /^NJ-Tab-Backup-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.json$/.exec(name || "");
        if (!m) { return null; }
        return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
    }

    function njParseVersionNames(text) {
        let found = {};
        let re = /NJ-Tab-Backup-\d{8}-\d{6}\.json/g;
        let m;
        while ((m = re.exec(text || "")) !== null) { found[m[0]] = true; }
        return Object.keys(found).sort().reverse();
    }

    // 从 PROPFIND 返回的 XML 里解析每个版本文件的名字和大小（按 response 分块，兼容不同的命名空间前缀）
    function njParseVersionEntries(text) {
        let entries = [];
        let blocks = String(text || "").split(/<[^>]*response>/i);
        for (let i = 1; i < blocks.length; i++) {
            let hrefMatch = /<[^>]*href>([^<]+)<\/[^>]*href>/i.exec(blocks[i]);
            if (!hrefMatch) { continue; }
            let base;
            try { base = decodeURIComponent(hrefMatch[1]).split("/").pop(); } catch (e) { base = hrefMatch[1].split("/").pop(); }
            if (!/^NJ-Tab-Backup-\d{8}-\d{6}\.json$/.test(base)) { continue; }
            let sizeMatch = /<[^>]*getcontentlength>(\d+)<\/[^>]*getcontentlength>/i.exec(blocks[i]);
            entries.push({name: base, size: sizeMatch ? parseInt(sizeMatch[1], 10) : null});
        }
        entries.sort(function (a, b) { return a.name < b.name ? 1 : -1; });
        return entries;
    }

    function njFormatFileSize(bytes) {
        if (bytes === null || typeof bytes === "undefined") { return ""; }
        if (bytes < 1024) { return bytes + " B"; }
        if (bytes < 1024 * 1024) { return (bytes / 1024).toFixed(1) + " KB"; }
        return (bytes / 1024 / 1024).toFixed(2) + " MB";
    }

    // 列出远端版本及大小（4.2 需求三：恢复列表显示文件名、时间、文件大小）
    function listWebdavVersionsDetailed(cfg, cb) {
        let body = '<?xml version="1.0" encoding="utf-8"?><propfind xmlns="DAV:"><prop><displayname/><getcontentlength/></prop></propfind>';
        fetch(cfg.webdavUrl, {
            method: "PROPFIND",
            credentials: "omit",
            headers: {
                "Authorization": buildBasicAuthHeader(cfg.webdavUser, cfg.webdavPass),
                "Depth": "1",
                "Content-Type": "application/xml; charset=utf-8"
            },
            body: body
        }).then(function (resp) {
            if (!resp.ok) { throw new Error("HTTP " + resp.status); }
            return resp.text();
        }).then(function (text) {
            cb(njParseVersionEntries(text), null);
        }).catch(function (err) {
            cb([], err);
        });
    }

    // 连接测试（4.2 需求三）：用当前填写的地址/账号/密码试连一次，当场报成功或失败原因
    function testWebDavConnection() {
        let cfg = readWebDavConfig();
        if (!cfg || !cfg.webdavUrl) {
            showAlert(`${chrome.i18n.getMessage("showError")}`, `${chrome.i18n.getMessage("webdavConfigMissing")}`);
            return;
        }
        let body = '<?xml version="1.0" encoding="utf-8"?><propfind xmlns="DAV:"><prop><displayname/></prop></propfind>';
        fetch(cfg.webdavUrl, {
            method: "PROPFIND",
            credentials: "omit",
            headers: {
                "Authorization": buildBasicAuthHeader(cfg.webdavUser, cfg.webdavPass),
                "Depth": "0",
                "Content-Type": "application/xml; charset=utf-8"
            },
            body: body
        }).then(function (resp) {
            if (!resp.ok) { throw new Error("HTTP " + resp.status); }
            showAlert(`${chrome.i18n.getMessage("webdavTitle")}`, `${chrome.i18n.getMessage("webdavTestSuccess")}`);
        }).catch(function (err) {
            showAlert(`${chrome.i18n.getMessage("showError")}`, `${chrome.i18n.getMessage("webdavTestFailed")} ${err.message}`);
        });
    }

    // 计算要删的旧版本：保留“最近 keepCount 份”∪“最近 keepDays 天内”∪ 刚上传的那份；两个规则都关（0）时不删任何版本
    function njPickDeletions(names, keepDays, keepCount, protectName, nowMs) {
        if (!(keepDays > 0) && !(keepCount > 0)) { return []; }
        let keep = {};
        if (protectName) { keep[protectName] = true; }
        names.forEach(function (n, idx) {
            if (keepCount > 0 && idx < keepCount) { keep[n] = true; }
            if (keepDays > 0) {
                let t = njVersionTime(n);
                if (t !== null && nowMs - t <= keepDays * 86400000) { keep[n] = true; }
            }
        });
        return names.filter(function (n) { return !keep[n]; });
    }

    // 列出远端版本（PROPFIND 目录）；失败时回调空数组加 err，调用方自行回退
    function listWebdavVersions(cfg, cb) {
        let body = '<?xml version="1.0" encoding="utf-8"?><propfind xmlns="DAV:"><prop><displayname/></prop></propfind>';
        fetch(cfg.webdavUrl, {
            method: "PROPFIND",
            credentials: "omit",
            headers: {
                "Authorization": buildBasicAuthHeader(cfg.webdavUser, cfg.webdavPass),
                "Depth": "1",
                "Content-Type": "application/xml; charset=utf-8"
            },
            body: body
        }).then(function (resp) {
            if (!resp.ok) { throw new Error("HTTP " + resp.status); }
            return resp.text();
        }).then(function (text) {
            cb(njParseVersionNames(text), null);
        }).catch(function (err) {
            cb([], err);
        });
    }

    // 按保留规则清理旧版本；清理失败不影响备份本身
    function cleanupWebdavVersions(cfg, keepDays, keepCount, protectName) {
        listWebdavVersions(cfg, function (names, err) {
            if (err || !names.length) { return; }
            let dels = njPickDeletions(names, keepDays, keepCount, protectName, Date.now());
            dels.forEach(function (name) {
                fetch(buildWebDavFileUrl(cfg.webdavUrl, name), {
                    method: "DELETE",
                    credentials: "omit",
                    headers: {"Authorization": buildBasicAuthHeader(cfg.webdavUser, cfg.webdavPass)}
                }).catch(function () {});
            });
        });
    }

    // 版本选择弹窗：列出远端历史版本，点一个恢复它
    function showWebdavVersionPicker(entries, cfg, onPick) {
        function renderItems(list) {
            if (!list.length) {
                return `<div class="list-group-item">${chrome.i18n.getMessage("webdavNoVersions")}</div>`;
            }
            return list.map(function (entry) {
                let t = njVersionTime(entry.name);
                let timeText = t ? new Date(t).toLocaleString() : "";
                let sizeText = njFormatFileSize(entry.size);
                let meta = [timeText, sizeText].filter(function (x) { return !!x; }).join(" · ");
                return `<div class="list-group-item" style="display:flex;align-items:center;gap:10px;">
                    <div style="flex:1;min-width:0;">
                        <div style="word-break:break-all;">${entry.name}</div>
                        <div class="text-muted" style="font-size:12px;">${meta}</div>
                    </div>
                    <button type="button" class="btn btn-primary btn-sm nj-version-pick" data-name="${entry.name}">${chrome.i18n.getMessage("recover")}</button>
                    <button type="button" class="btn btn-danger btn-sm nj-version-del" data-name="${entry.name}">${chrome.i18n.getMessage("webdavVersionDelete")}</button>
                </div>`;
            }).join("");
        }
        let modalHtml = `
        <div class="modal fade" id="webdavVersionModal" tabindex="-1" role="dialog" aria-hidden="true">
          <div class="modal-dialog" role="document">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title">${chrome.i18n.getMessage("webdavVersionPickTitle")}</h5>
                <button type="button" class="close" data-dismiss="modal" aria-label="Close">
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
              <div class="modal-body">
                <div class="list-group" id="njVersionList">${renderItems(entries)}</div>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-dismiss="modal">${chrome.i18n.getMessage("njCancel")}</button>
              </div>
            </div>
          </div>
        </div>
            `;
        let modalContainer = document.createElement('div');
        modalContainer.innerHTML = modalHtml;
        document.body.appendChild(modalContainer);
        $('#webdavVersionModal').modal('show');
        $('#webdavVersionModal').on('hidden.bs.modal', function () { modalContainer.remove(); });
        $(modalContainer).on('click', '.nj-version-pick', function () {
            let picked = $(this).data('name');
            $('#webdavVersionModal').modal('hide');
            onPick(picked);
        });
        $(modalContainer).on('click', '.nj-version-del', function () {
            let name = $(this).data('name');
            showConfirmation(`${chrome.i18n.getMessage("webdavTitle")}`, `${chrome.i18n.getMessage("webdavVersionDeleteConfirm")}<br>${name}`, function () {
                fetch(buildWebDavFileUrl(cfg.webdavUrl, name), {
                    method: "DELETE",
                    credentials: "omit",
                    headers: {"Authorization": buildBasicAuthHeader(cfg.webdavUser, cfg.webdavPass)}
                }).then(function (resp) {
                    if (!resp.ok) { throw new Error("HTTP " + resp.status); }
                    listWebdavVersionsDetailed(cfg, function (list, err) {
                        let el = document.getElementById("njVersionList");
                        if (!err && el) { el.innerHTML = renderItems(list); }
                    });
                }).catch(function (err) {
                    showAlert(`${chrome.i18n.getMessage("showError")}`, `${chrome.i18n.getMessage("webdavVersionDeleteFailed")} ${err.message}`);
                });
            });
        });
    }

    // 上传备份到 WebDAV（阶段4：每次新建一个带时间戳的版本文件，不覆盖旧版本；成功后按保留规则清理旧版本）
    function uploadBackupToWebDav() {
        let cfg = readWebDavConfig();
        if (!cfg || !cfg.webdavUrl) {
            showAlert(`${chrome.i18n.getMessage("showError")}`, `${chrome.i18n.getMessage("webdavConfigMissing")}`);
            return;
        }
        getShardings(function (items) {
          collectBackupSettings(function (settings) {
            let backup = buildBackupObject(items, undefined, settings);
            let fileName = njVersionFileName(new Date());
            let headers = {
                "Authorization": buildBasicAuthHeader(cfg.webdavUser, cfg.webdavPass),
                "Content-Type": "application/json; charset=utf-8"
            };
            fetch(buildWebDavFileUrl(cfg.webdavUrl, fileName), {
                method: "PUT",
                headers: headers,
                // 认证只走 Authorization 头，避免 401 时被浏览器认证框挂起（同阶段3 前的实测结论）
                credentials: "omit",
                body: JSON.stringify(backup)
            }).then(function (resp) {
                if (!resp.ok) {
                    throw new Error("HTTP " + resp.status);
                }
                showAlert(`${chrome.i18n.getMessage("webdavTitle")}`, `${chrome.i18n.getMessage("webdavUploadSuccess")} ${fileName}`);
                njLogEvent("webdavUpload", true, fileName);
                chrome.storage.local.get(["webdavKeepDays", "webdavKeepCount"], function (st) {
                    cleanupWebdavVersions(cfg,
                        st.webdavKeepDays === undefined ? 30 : st.webdavKeepDays,
                        st.webdavKeepCount === undefined ? 10 : st.webdavKeepCount,
                        fileName);
                });
            }).catch(function (err) {
                showAlert(`${chrome.i18n.getMessage("showError")}`, `${chrome.i18n.getMessage("webdavUploadFailed")} ${err.message}`);
                njLogEvent("webdavUpload", false, err.message);
            });
          });
        });
    }

    // 从 WebDAV 恢复（阶段5）：先下载并校验 → 第 1 次确认 → 强制备份当前数据为一个新版本 → 第 2 次输 Y 确认 → 才覆盖本地
    // 强制备份失败立即中止、本地数据不动；旧快照机制已删除
    function restoreBackupFromWebDav(targetFile) {
        let cfg = readWebDavConfig();
        if (!cfg || !cfg.webdavUrl) {
            showAlert(`${chrome.i18n.getMessage("showError")}`, `${chrome.i18n.getMessage("webdavConfigMissing")}`);
            return;
        }
        let fileName = targetFile || cfg.webdavFile;
        fetch(buildWebDavFileUrl(cfg.webdavUrl, fileName), {
            method: "GET",
            // 认证只走 Authorization 头，避免 401 时被浏览器认证框挂起（同上传）
            credentials: "omit",
            headers: {"Authorization": buildBasicAuthHeader(cfg.webdavUser, cfg.webdavPass)}
        }).then(function (resp) {
            if (!resp.ok) {
                throw new Error("HTTP " + resp.status);
            }
            return resp.text();
        }).then(function (text) {
            let backup;
            try {
                backup = JSON.parse(text);
            } catch (e) {
                showAlert(`${chrome.i18n.getMessage("showError")}`, `${chrome.i18n.getMessage("webdavRestoreFailed")} ${chrome.i18n.getMessage("backupInvalid")}`);
                return;
            }
            // 4.3 需求十四：与导入备份同一套宽容清洗；结构性问题才拒绝，单条坏数据跳过并逐条记日志
            let check = sanitizeBackupObject(backup);
            if (check.fatal) {
                // 无版本号或大版本不符直接拒绝，确认也无法绕过
                njLogEvent("webdavRestore", false, njReasonText(check.fatal));
                showAlert(`${chrome.i18n.getMessage("showError")}`, `${chrome.i18n.getMessage("webdavRestoreFailed")} ${chrome.i18n.getMessage("backupInvalid")}`);
                return;
            }
            if (check.skipped.length > 0) {
                njLogEvent("webdavRestore", false, "共跳过 " + check.skipped.length + " 条，明细点开看", check.skipped.map(function (s) { return njSkippedDetail(s); }));
            }
            let skippedNote = check.skipped.length > 0 ? `\n${check.skipped.length}${chrome.i18n.getMessage("backupImportSkipped")}` : "";
            // 第 1 次确认：讲清恢复后果和强制备份安排；备份版本比当前插件新时额外警告
            let msg = `${chrome.i18n.getMessage("webdavRestoreConfirm")}<br>${chrome.i18n.getMessage("webdavRestoreForceNote")}`;
            if (check.appVersion && njVersionCompare(check.appVersion, chrome.runtime.getManifest().version) > 0) {
                msg += `<br><strong>${chrome.i18n.getMessage("webdavNewerWarnPrefix")}${check.appVersion}${chrome.i18n.getMessage("webdavNewerWarnSuffix")}</strong>`;
            }
            if (skippedNote) {
                msg += `<br>${skippedNote.replace(/\n/g, "")}`;
            }
            showConfirmation(`${chrome.i18n.getMessage("webdavTitle")}`, msg, function () {
                // 强制备份：先把当前本地数据作为一个新版本上传成功，才继续
                getShardings(function (items) {
                  collectBackupSettings(function (settings) {
                    let current = buildBackupObject(items, undefined, settings);
                    let forceName = njVersionFileName(new Date());
                    fetch(buildWebDavFileUrl(cfg.webdavUrl, forceName), {
                        method: "PUT",
                        credentials: "omit",
                        headers: {
                            "Authorization": buildBasicAuthHeader(cfg.webdavUser, cfg.webdavPass),
                            "Content-Type": "application/json; charset=utf-8"
                        },
                        body: JSON.stringify(current)
                    }).then(function (resp) {
                        if (!resp.ok) {
                            throw new Error("HTTP " + resp.status);
                        }
                        njLogEvent("webdavForceBackup", true, forceName);
                        // 第 2 次确认：输 Y 才真正覆盖本地
                        showYConfirm(`${chrome.i18n.getMessage("webdavTitle")}`, `${chrome.i18n.getMessage("webdavRestoreConfirm")}`, function () {
                            saveShardings(check.tabGroups, "object");
                            saveShardings(check.delTabGroups, "del");
                            applyBackupSettings(backup.settings);
                            njLogEvent("webdavRestore", true, fileName + (check.skipped.length > 0 ? "，跳过 " + check.skipped.length + " 条" : ""));
                            chrome.storage.local.remove("webdavRestoreSnapshot");
                            showAlert(`${chrome.i18n.getMessage("webdavTitle")}`, `${chrome.i18n.getMessage("webdavRestoreSuccess")}${skippedNote}`);
                            setTimeout(refresh, 300);
                        });
                    }).catch(function (err) {
                        showAlert(`${chrome.i18n.getMessage("showError")}`, `${chrome.i18n.getMessage("webdavForceBackupFailed")}${err.message}`);
                        njLogEvent("webdavForceBackup", false, err.message);
                    });
                  });
                });
            });
        }).catch(function (err) {
            njLogEvent("webdavRestore", false, err.message);
            showAlert(`${chrome.i18n.getMessage("showError")}`, `${chrome.i18n.getMessage("webdavRestoreFailed")} ${err.message}`);
        });
    }

    // 展示配置
    // 自动保存的轻提示（4.2 需求一：所有配置改完自动保存，不再有保存按钮，保存后给一个小提示）
    function njAutoSavedToast() {
        let toast = document.getElementById("njSaveToast");
        if (!toast) {
            toast = document.createElement("div");
            toast.id = "njSaveToast";
            toast.style.cssText = "position:fixed;top:66px;left:50%;transform:translateX(-50%);z-index:2000;background:rgba(60,60,60,.92);color:#fff;padding:8px 16px;border-radius:4px;display:none;";
            document.body.appendChild(toast);
        }
        toast.textContent = chrome.i18n.getMessage("savedValue");
        toast.style.display = "block";
        clearTimeout(njAutoSavedToast._t);
        njAutoSavedToast._t = setTimeout(function () {
            toast.style.display = "none";
        }, 1200);
    }

    // 令牌输入框自动保存：有新值才加密存（绝不存明文），存完清空输入框并改成“已保存”提示；留空表示不改
    function njBindSecretAutoSave(inputId, storageKey, applyMemory) {
        let el = document.getElementById(inputId);
        if (!el) {
            return;
        }
        el.addEventListener('change', function () {
            let v = el.value.trim();
            if (!v) {
                return;
            }
            njEncryptSecret(v).then(function (enc) {
                let obj = {};
                obj[storageKey] = enc;
                chrome.storage.local.set(obj, njAutoSavedToast);
            });
            applyMemory(v);
            el.value = "";
            el.placeholder = chrome.i18n.getMessage("secretSavedPlaceholder");
        });
    }

    // 配置页（4.2 需求一）：只放通用开关——打开方式、发送后行为、休眠打开、拖拽方式；令牌在 Gist 页、WebDAV 在 WebDAV 页
    function showOptions() {
        document.getElementById("options").innerHTML = `
            <div class="option">
                <div class="desc">
                    <p>${chrome.i18n.getMessage("restoreKey")}</p>
                </div>
                <div class="choices">
                    <p><label><input type="radio" name="deleteTabOnOpen" value="yes"><span class="radio-label">${chrome.i18n.getMessage("restoreValueDelete")}</span></label></p>
                    <p><label><input type="radio" name="deleteTabOnOpen" value="no"><span class="radio-label">${chrome.i18n.getMessage("restoreValueLive")}</span></label></p>
                </div>
            </div>
            <hr>
            <div class="option">
                <div class="desc">
                    <p>${chrome.i18n.getMessage("openBackgroundAfterSendTab")}</p>
                </div>
                <div class="choices">
                    <p><label><input type="radio" name="openBackgroundAfterSendTab" value="yes"><span class="radio-label">${chrome.i18n.getMessage("openBackgroundAfterSendTabYes")}</span></label></p>
                    <p><label><input type="radio" name="openBackgroundAfterSendTab" value="no"><span class="radio-label">${chrome.i18n.getMessage("openBackgroundAfterSendTabNo")}</span></label></p>
                </div>
            </div>
            <hr>
            <div class="option">
                <div class="desc">
                    <p>${chrome.i18n.getMessage("restoreDiscarded")}</p>
                </div>
                <div class="choices">
                    <p><label><input type="checkbox" id="restoreDiscarded"><span> ${chrome.i18n.getMessage("restoreDiscardedEnable")}</span></label></p>
                    <p><span> ${chrome.i18n.getMessage("discardedThresholdText")}</span> <input type="number" id="discardedThreshold" class="form-control" style="width:90px;display:inline-block;" min="1" max="999" step="1"></p>
                </div>
            </div>
        `;
        chrome.storage.local.get(null, function (storage) {
            let opts = storage.options || {};

            if (opts.deleteTabOnOpen === undefined) {
                $('input[name="deleteTabOnOpen"][value="no"]').prop('checked', 'checked');
            } else {
                $('input[name="deleteTabOnOpen"][value="' + opts.deleteTabOnOpen + '"]').prop('checked', 'checked');
            }
            if (opts.openBackgroundAfterSendTab === undefined) {
                $('input[name="openBackgroundAfterSendTab"][value="yes"]').prop('checked', 'checked');
            } else {
                $('input[name="openBackgroundAfterSendTab"][value="' + opts.openBackgroundAfterSendTab + '"]').prop('checked', 'checked');
            }

            let restoreDiscardedEl = document.getElementById("restoreDiscarded");
            if (restoreDiscardedEl && storage.restoreDiscarded) {
                restoreDiscardedEl.checked = true;
            }
            let discardedThresholdEl = document.getElementById("discardedThreshold");
            if (discardedThresholdEl) {
                let savedN = parseInt(storage.discardedThreshold, 10);
                discardedThresholdEl.value = (savedN >= 1) ? savedN : 10;
            }
            // 4.4 需求六：拖拽方式两个开关已删除（两种拖拽默认都开），无初始化项
        });

        // 4.3 需求八：原先这里有个手动把 radio 设为 checked 的点击处理，但它不触发 change，
        // 自动保存（靠 change 驱动）收不到，点文字存不上。已删除该手动处理，并去掉 label 上
        // 指向不存在 id 的 for 属性，点文字走浏览器原生 label 行为：自动点中圆圈并触发 change。

        // 打开方式两组单选：改完自动保存
        document.querySelectorAll('input[name="deleteTabOnOpen"], input[name="openBackgroundAfterSendTab"]').forEach(function (el) {
            el.addEventListener('change', njSaveGeneralOptions);
        });
        // 恢复时休眠打开：勾选即存
        document.getElementById('restoreDiscarded').addEventListener('change', function () {
            chrome.storage.local.set({restoreDiscarded: this.checked}, njAutoSavedToast);
        });
        // 休眠阈值 N（4.4 需求五）：改完自动保存；非法值回落到默认 10 并把输入框改回 10
        document.getElementById('discardedThreshold').addEventListener('change', function () {
            let n = parseInt(this.value, 10);
            if (!(n >= 1)) { n = 10; }
            if (n > 999) { n = 999; }
            this.value = n;
            chrome.storage.local.set({discardedThreshold: n}, njAutoSavedToast);
        });
        // 4.4 需求六：拖拽开关已去掉，无联动处理
    }

    // 打开方式两组单选的自动保存（合并写回 options；各页面用时都现从 storage 读 options，无共享变量可同步）
    function njSaveGeneralOptions() {
        let del = document.querySelector('input[name="deleteTabOnOpen"]:checked');
        let open = document.querySelector('input[name="openBackgroundAfterSendTab"]:checked');
        chrome.storage.local.get("options", function (st) {
            let newOpts = st.options || {};
            if (del) {
                newOpts.deleteTabOnOpen = del.value;
            }
            if (open) {
                newOpts.openBackgroundAfterSendTab = open.value;
            }
            chrome.storage.local.set({options: newOpts}, njAutoSavedToast);
        });
    }

    // Gist 备份页（4.2 需求一/三）：令牌、推送/拉取、自动备份开关与频率都在本页
    function showGistPage() {
        document.getElementById("gistPage").innerHTML = `
            <div class="option">
                <div class="desc">
                    <p>${chrome.i18n.getMessage("gistFunction")}</p>
                </div>
            </div>
            <div class="form-group row">
              <label for="githubToken" class="col-sm-2 control-label">${chrome.i18n.getMessage("githubToken")}:</label>
              <div class="col-sm-5">
                <div class="input-group">
                  <input type="password" class="form-control" id="githubToken" placeholder="${chrome.i18n.getMessage("input")}${chrome.i18n.getMessage("githubToken")}">
                  <div class="input-group-addon">
                    <span class="glyphicon glyphicon-eye-open" id="changeEye"></span>
                  </div>
                </div>
              </div>
            </div>
            <div class="form-group row">
              <label for="giteeToken" class="col-sm-2 control-label">${chrome.i18n.getMessage("giteeToken")}:</label>
              <div class="col-sm-5">
                <div class="input-group">
                  <input type="password" class="form-control" id="giteeToken" placeholder="${chrome.i18n.getMessage("input")}${chrome.i18n.getMessage("giteeToken")}">
                  <div class="input-group-addon">
                    <span class="glyphicon glyphicon-eye-open" id="changeEye2"></span>
                  </div>
                </div>
              </div>
            </div>
            <p class="nj-secret-note"><span>${chrome.i18n.getMessage("secretSecurityNote")}</span><span>${chrome.i18n.getMessage("secretSecurityWarn")}</span></p>
            <div style="margin-bottom:5px">
                <button id="pushToGithubGist" type="button" class="btn btn-default">${chrome.i18n.getMessage("pushToGithubGist")}</button>
                <button id="pullFromGithubGist" type="button" class="btn btn-default">${chrome.i18n.getMessage("pullFromGithubGist")}</button>
                <button id="pushToGiteeGist" type="button" class="btn btn-default">${chrome.i18n.getMessage("pushToGiteeGist")}</button>
                <button id="pullFromGiteeGist" type="button" class="btn btn-default">${chrome.i18n.getMessage("pullFromGiteeGist")}</button>
            </div>
            <hr>
            <div class="option">
                <div class="desc">
                    <p>${chrome.i18n.getMessage("gistAutoBackupTitle")}</p>
                </div>
                <div class="choices">
                    <p><label><input type="checkbox" id="gistAutoEnabled"><span> ${chrome.i18n.getMessage("gistAutoBackupEnable")}</span></label></p>
                    <p>${chrome.i18n.getMessage("gistAutoInterval")}:
                        <select id="gistAutoInterval" class="form-control" style="display:inline-block;width:auto;">
                            <option value="5">5</option>
                            <option value="15">15</option>
                            <option value="30">30</option>
                            <option value="60">60</option>
                            <option value="120">120</option>
                        </select>
                    </p>
                    <p id="gistRateWarn" style="color:#c9302c;" class="hide">${chrome.i18n.getMessage("gistAutoRateWarn")}</p>
                    <p>${chrome.i18n.getMessage("gistAutoStatusLabel")}: <span id="gistAutoStatus"></span></p>
                </div>
            </div>
        `;
        chrome.storage.local.get(null, function (storage) {
            // 令牌不回填明文：已保存时只改输入框提示，留空表示不修改
            if (storage.githubGistToken) {
                document.getElementById("githubToken").placeholder = `${chrome.i18n.getMessage("secretSavedPlaceholder")}`
            }
            if (storage.giteeGistToken) {
                document.getElementById("giteeToken").placeholder = `${chrome.i18n.getMessage("secretSavedPlaceholder")}`
            }
            // 自动备份开关：新开关没设过时沿用旧 autoSync 的值
            let enabled = typeof storage.gistAutoEnabled !== "undefined" ? storage.gistAutoEnabled === true : storage.autoSync === true;
            document.getElementById("gistAutoEnabled").checked = enabled;
            let interval = parseInt(storage.gistAutoIntervalMinutes, 10);
            if ([5, 15, 30, 60, 120].indexOf(interval) < 0) {
                interval = 30;
            }
            document.getElementById("gistAutoInterval").value = String(interval);
            document.getElementById("gistRateWarn").classList.toggle("hide", interval > 15);
            // 最近一次自动备份状态（后台备份时写入 gistAutoLastResult）
            let statusEl = document.getElementById("gistAutoStatus");
            let r = storage.gistAutoLastResult;
            if (!r) {
                statusEl.textContent = chrome.i18n.getMessage("gistAutoStatusNone");
            } else {
                let when = new Date(r.time).toLocaleString();
                let provider = r.provider === "gitee" ? "Gitee" : "GitHub";
                if (r.result === "success") {
                    statusEl.textContent = `${chrome.i18n.getMessage("gistAutoStatusSuccess")} (${provider} ${when})`;
                } else if (r.result === "skipped") {
                    statusEl.textContent = `${chrome.i18n.getMessage("gistAutoStatusSkipped")} (${provider} ${when})`;
                } else {
                    statusEl.textContent = `${chrome.i18n.getMessage("gistAutoStatusFailed")} (${provider} ${when}${r.reason ? ": " + r.reason : ""})`;
                }
            }
        });

        document.getElementById('changeEye').addEventListener('click', function () {
            let passwordInput = document.getElementById("githubToken");
            let visibilityIcon = document.getElementById("changeEye");

            if (passwordInput.type === "password") {
                passwordInput.type = "text";
                visibilityIcon.className = "glyphicon glyphicon-eye-close";
            } else {
                passwordInput.type = "password";
                visibilityIcon.className = "glyphicon glyphicon-eye-open";
            }
        });
        document.getElementById('changeEye2').addEventListener('click', function () {
            let passwordInput = document.getElementById("giteeToken");
            let visibilityIcon = document.getElementById("changeEye2");

            if (passwordInput.type === "password") {
                passwordInput.type = "text";
                visibilityIcon.className = "glyphicon glyphicon-eye-close";
            } else {
                passwordInput.type = "password";
                visibilityIcon.className = "glyphicon glyphicon-eye-open";
            }
        });

        // 令牌改完自动保存（加密存，同时更新内存里的值）
        njBindSecretAutoSave("githubToken", "githubGistToken", function (v) {
            githubGistToken = v;
        });
        njBindSecretAutoSave("giteeToken", "giteeGistToken", function (v) {
            giteeGistToken = v;
        });

        // 推送/拉取四个按钮
        bindGistPageButtons();

        // 自动备份开关与频率：改完自动保存（开关同时同步旧的 autoSync，保持原有实时同步行为一致）
        document.getElementById('gistAutoEnabled').addEventListener('change', function () {
            chrome.storage.local.set({gistAutoEnabled: this.checked, autoSync: this.checked}, njAutoSavedToast);
        });
        document.getElementById('gistAutoInterval').addEventListener('change', function () {
            let v = parseInt(this.value, 10) || 30;
            chrome.storage.local.set({gistAutoIntervalMinutes: v}, njAutoSavedToast);
            document.getElementById("gistRateWarn").classList.toggle("hide", v > 15);
        });
    }

    // WebDAV 页（4.2 需求一/三）：地址/账号/密码、连接测试、上传/恢复、自动备份与保留规则都在本页；改完自动保存
    function showWebdavPage() {
        document.getElementById("webdavPage").innerHTML = `
            <div class="option">
                <div class="desc">
                    <p>${chrome.i18n.getMessage("webdavTitle")}</p>
                </div>
            </div>
            <div class="nj-dav-grid">
              <label for="webdavUrl" class="col-sm-2 control-label">${chrome.i18n.getMessage("webdavUrl")}:</label>
              <div class="col-sm-5">
                <input type="text" class="form-control" id="webdavUrl" placeholder="https://dav.example.com/remote.php/dav/files/user/">
              </div>
              <label for="webdavUser" class="col-sm-2 control-label">${chrome.i18n.getMessage("webdavUser")}:</label>
              <div class="col-sm-5">
                <input type="text" class="form-control" id="webdavUser" placeholder="${chrome.i18n.getMessage("input")}${chrome.i18n.getMessage("webdavUser")}">
              </div>
              <label for="webdavPass" class="col-sm-2 control-label">${chrome.i18n.getMessage("webdavPass")}:</label>
              <div class="col-sm-5">
                <input type="password" class="form-control" id="webdavPass" placeholder="${chrome.i18n.getMessage("input")}${chrome.i18n.getMessage("webdavPass")}">
              </div>
            <p class="nj-secret-note nj-span-all"><span>${chrome.i18n.getMessage("secretSecurityNote")}</span><span>${chrome.i18n.getMessage("secretSecurityWarn")}</span></p>
              <label for="webdavAutoBackup" class="col-sm-2 control-label">${chrome.i18n.getMessage("webdavAutoBackup")}:</label>
              <div class="col-sm-5">
                <input type="checkbox" id="webdavAutoBackup">
              </div>
              <label for="webdavIntervalHours" class="col-sm-2 control-label">${chrome.i18n.getMessage("webdavIntervalHours")}:</label>
              <div class="col-sm-5">
                <input type="number" min="1" class="form-control" id="webdavIntervalHours" placeholder="12">
              </div>
              <label for="webdavKeepDays" class="col-sm-2 control-label">${chrome.i18n.getMessage("webdavKeepDays")}:</label>
              <div class="col-sm-5">
                <input type="number" min="0" class="form-control" id="webdavKeepDays" placeholder="30">
              </div>
              <label for="webdavKeepCount" class="col-sm-2 control-label">${chrome.i18n.getMessage("webdavKeepCount")}:</label>
              <div class="col-sm-5">
                <input type="number" min="0" class="form-control" id="webdavKeepCount" placeholder="10">
              </div>
            </div>
            <div style="margin-bottom:5px">
                <button id="webdavTest" type="button" class="btn btn-default">${chrome.i18n.getMessage("webdavTest")}</button>
                <button id="webdavUpload" type="button" class="btn btn-default">${chrome.i18n.getMessage("webdavUpload")}</button>
                <button id="webdavRestore" type="button" class="btn btn-default">${chrome.i18n.getMessage("webdavRestore")}</button>
            </div>
        `;
        chrome.storage.local.get(null, function (storage) {
            if (storage.webdavUrl) {
                document.getElementById("webdavUrl").value = storage.webdavUrl
            }
            if (storage.webdavUser) {
                document.getElementById("webdavUser").value = storage.webdavUser
            }
            if (storage.webdavPass) {
                document.getElementById("webdavPass").placeholder = `${chrome.i18n.getMessage("secretSavedPlaceholder")}`
            }
            if (storage.webdavAutoBackup) {
                document.getElementById("webdavAutoBackup").checked = true
            }
            document.getElementById("webdavIntervalHours").value = storage.webdavIntervalHours || 12
            document.getElementById("webdavKeepDays").value = storage.webdavKeepDays === undefined ? 30 : storage.webdavKeepDays
            document.getElementById("webdavKeepCount").value = storage.webdavKeepCount === undefined ? 10 : storage.webdavKeepCount
        });

        // 改完自动保存：地址/账号直接存；密码有新值才加密存（不 trim，首尾空格可能也是密码的一部分）
        document.getElementById('webdavUrl').addEventListener('change', function () {
            chrome.storage.local.set({webdavUrl: this.value.trim()}, njAutoSavedToast);
        });
        document.getElementById('webdavUser').addEventListener('change', function () {
            chrome.storage.local.set({webdavUser: this.value.trim()}, njAutoSavedToast);
        });
        document.getElementById('webdavPass').addEventListener('change', function () {
            let v = this.value;
            if (v === "") {
                return;
            }
            njEncryptSecret(v).then(function (enc) {
                chrome.storage.local.set({webdavPass: enc}, njAutoSavedToast);
            });
            njWebdavPassCache = v;
            this.value = "";
            this.placeholder = chrome.i18n.getMessage("secretSavedPlaceholder");
        });
        document.getElementById('webdavAutoBackup').addEventListener('change', function () {
            chrome.storage.local.set({webdavAutoBackup: this.checked}, njAutoSavedToast);
        });
        document.getElementById('webdavIntervalHours').addEventListener('change', function () {
            chrome.storage.local.set({webdavIntervalHours: Math.max(1, parseInt(this.value, 10) || 12)}, njAutoSavedToast);
        });
        document.getElementById('webdavKeepDays').addEventListener('change', function () {
            chrome.storage.local.set({webdavKeepDays: Math.max(0, parseInt(this.value, 10) || 0)}, njAutoSavedToast);
        });
        document.getElementById('webdavKeepCount').addEventListener('change', function () {
            chrome.storage.local.set({webdavKeepCount: Math.max(0, parseInt(this.value, 10) || 0)}, njAutoSavedToast);
        });

        // 连接测试 / 上传备份 / 从 WebDAV 恢复
        document.getElementById('webdavTest').addEventListener('click', function () {
            testWebDavConnection();
        });
        document.getElementById('webdavUpload').addEventListener('click', function () {
            uploadBackupToWebDav();
        });
        document.getElementById('webdavRestore').addEventListener('click', function () {
            let cfg = readWebDavConfig();
            if (!cfg || !cfg.webdavUrl) {
                showAlert(`${chrome.i18n.getMessage("showError")}`, `${chrome.i18n.getMessage("webdavConfigMissing")}`);
                return;
            }
            // 先列远端版本让用户选一份（带文件大小，可逐个删除）；列不出来或还没有版本时，回退到原来的固定文件名
            listWebdavVersionsDetailed(cfg, function (entries, err) {
                if (err || !entries.length) {
                    restoreBackupFromWebDav(null);
                    return;
                }
                showWebdavVersionPicker(entries, cfg, function (picked) {
                    restoreBackupFromWebDav(picked);
                });
            });
        });
    }


    // Gist 页四个推送/拉取按钮的绑定（原顶部菜单里的绑定，4.2 随按钮一起搬到 Gist 页）
    function bindGistPageButtons() {
        // 响应推送到github的gist的动作
        document.getElementById('pushToGithubGist').addEventListener('click', function () {
            showDoubleConfirmation(`${chrome.i18n.getMessage("pushToGithubGist")}`, `${chrome.i18n.getMessage("gistPushOverwriteWarn")}`, function () {
                console.log("yes");
                chrome.storage.local.get(null, function (storage) {
                    if (!storage.githubGistToken) {
                        console.log("githubGistToken没有保存");
                        showAlert(`${chrome.i18n.getMessage("showError")}`, `${chrome.i18n.getMessage("githubTokenNoSaved")}` + "\n" + `${chrome.i18n.getMessage("goToOptions")}`)
                        return
                    }
                    console.log(storage.handleGithubGistStatus);
                    if (storage.handleGithubGistStatus) {
                        console.log("handleGistStatus有值");
                        if (storage.handleGithubGistStatus.type === "IDLE") {
                            pushToGithubGist();
                        } else {
                            let time = moment().format('YYYY-MM-DD HH:mm:ss');
                            let expireTime = storage.handleGithubGistStatus.expireTime;
                            console.log(expireTime)
                            if (time > expireTime) {
                                pushToGithubGist();
                            } else {
                                alert(storage.handleGithubGistStatus.type);
                            }
                        }
                    } else {
                        console.log("handleGistStatus没有值，第一次");
                        pushToGithubGist();
                    }
                });
            });
        });

        // 响应推送到gitee的gist的动作
        document.getElementById('pushToGiteeGist').addEventListener('click', function () {
            showDoubleConfirmation(`${chrome.i18n.getMessage("pushToGiteeGist")}`, `${chrome.i18n.getMessage("gistPushOverwriteWarn")}`, function () {
                console.log("yes");
                chrome.storage.local.get(null, function (storage) {
                    if (!storage.giteeGistToken) {
                        console.log("giteeGistToken没有保存");
                        showAlert(`${chrome.i18n.getMessage("showError")}`, `${chrome.i18n.getMessage("giteeTokenNoSaved")}` + "\n" + `${chrome.i18n.getMessage("goToOptions")}`)
                        return
                    }
                    console.log(storage.handleGiteeGistStatus);
                    if (storage.handleGiteeGistStatus) {
                        console.log("handleGistStatus有值");
                        if (storage.handleGiteeGistStatus.type === "IDLE") {
                            pushToGiteeGist();
                        } else {
                            let time = moment().format('YYYY-MM-DD HH:mm:ss');
                            let expireTime = storage.handleGiteeGistStatus.expireTime;
                            console.log(expireTime)
                            if (time > expireTime) {
                                pushToGiteeGist();
                            } else {
                                alert(storage.handleGiteeGistStatus.type);
                            }
                        }
                    } else {
                        console.log("handleGistStatus没有值，第一次");
                        pushToGiteeGist();
                    }
                });
            });
        });

        // 响应从github的gist拉取的动作
        document.getElementById('pullFromGithubGist').addEventListener('click', function () {
            showDoubleConfirmation(`${chrome.i18n.getMessage("pullFromGithubGist")}`, `${chrome.i18n.getMessage("gistPullOverwriteWarn")}`, function () {
                console.log("yes");
                chrome.storage.local.get(null, function (storage) {
                    if (!storage.githubGistToken) {
                        console.log("githubGistToken没有保存");
                        showAlert(`${chrome.i18n.getMessage("showError")}`, `${chrome.i18n.getMessage("githubTokenNoSaved")}` + "\n" + `${chrome.i18n.getMessage("goToOptions")}`)
                        return
                    }
                    console.log(storage.handleGithubGistStatus);
                    if (storage.handleGithubGistStatus) {
                        console.log("handleGistStatus有值");
                        if (storage.handleGithubGistStatus.type === "IDLE") {
                            pullFromGithubGist();
                        } else {
                            let time = moment().format('YYYY-MM-DD HH:mm:ss');
                            let expireTime = storage.handleGithubGistStatus.expireTime;
                            console.log(expireTime)
                            if (time > expireTime) {
                                pullFromGithubGist();
                            } else {
                                alert(storage.handleGithubGistStatus.type);
                            }
                        }
                    } else {
                        console.log("handleGistStatus没有值，第一次");
                        pullFromGithubGist();
                    }
                });
            });
        });

        // 响应从gitee的gist拉取的动作
        document.getElementById('pullFromGiteeGist').addEventListener('click', function () {
            showDoubleConfirmation(`${chrome.i18n.getMessage("pullFromGiteeGist")}`, `${chrome.i18n.getMessage("gistPullOverwriteWarn")}`, function () {
                console.log("yes");
                chrome.storage.local.get(null, function (storage) {
                    if (!storage.giteeGistToken) {
                        console.log("giteeGistToken没有保存");
                        showAlert(`${chrome.i18n.getMessage("showError")}`, `${chrome.i18n.getMessage("giteeTokenNoSaved")}` + "\n" + `${chrome.i18n.getMessage("goToOptions")}`)
                        return
                    }
                    console.log(storage.handleGiteeGistStatus);
                    if (storage.handleGiteeGistStatus) {
                        console.log("handleGistStatus有值");
                        if (storage.handleGiteeGistStatus.type === "IDLE") {
                            pullFromGiteeGist();
                        } else {
                            let time = moment().format('YYYY-MM-DD HH:mm:ss');
                            let expireTime = storage.handleGiteeGistStatus.expireTime;
                            console.log(expireTime)
                            if (time > expireTime) {
                                pullFromGiteeGist();
                            } else {
                                alert(storage.handleGiteeGistStatus.type);
                            }
                        }
                    } else {
                        console.log("handleGistStatus没有值，第一次");
                        pullFromGiteeGist();
                    }
                });
            });
        });
    }

    // 统一的弹窗提示
    function showAlert(title, message) {
        let modalHtml = `
        <div class="modal fade" id="alertModal" tabindex="-1" role="dialog" aria-labelledby="alertModalLabel" aria-hidden="true">
          <div class="modal-dialog" role="document">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title" id="alertModalLabel">${title}</h5>
                <button type="button" class="close" data-dismiss="modal" aria-label="Close">
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
              <div class="modal-body">
                ${message}
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-dismiss="modal">关闭</button>
              </div>
            </div>
          </div>
        </div>
      `;

        let modalContainer = document.createElement('div');
        modalContainer.innerHTML = modalHtml;
        document.body.appendChild(modalContainer);

        $('#alertModal').modal('show');
    }

    // 统一的2次确认弹窗
    function showConfirmation(title, message, onConfirm) {
        let modalHtml = `
        <div class="modal fade" id="confirmationModal" tabindex="-1" role="dialog" aria-labelledby="confirmationModalLabel" aria-hidden="true">
          <div class="modal-dialog" role="document">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title" id="confirmationModalLabel">${title}</h5>
                <button type="button" class="close" data-dismiss="modal" aria-label="Close">
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
              <div class="modal-body">
                ${message}
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-dismiss="modal">取消</button>
                <button type="button" class="btn btn-primary" id="confirmButton">确认</button>
              </div>
            </div>
          </div>
        </div>
            `;

        let modalContainer = document.createElement('div');
        modalContainer.innerHTML = modalHtml;
        document.body.appendChild(modalContainer);

        $('#confirmationModal').modal('show');

        $('#confirmButton').on('click', function () {
            $('#confirmationModal').modal('hide');
            onConfirm();
        });
    }

    // 覆盖类操作的 2 次确认弹窗：第 1 次普通确认讲清后果；第 2 次必须输入单个字母 Y，确认按钮才可用
    function showDoubleConfirmation(title, message, onConfirm) {
        let modalHtml = `
        <div class="modal fade" id="confirmationModal" tabindex="-1" role="dialog" aria-labelledby="confirmationModalLabel" aria-hidden="true">
          <div class="modal-dialog" role="document">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title" id="confirmationModalLabel">${title}</h5>
                <button type="button" class="close" data-dismiss="modal" aria-label="Close">
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
              <div class="modal-body">
                <div id="njConfirmStep1">${message}</div>
                <div id="njConfirmStep2" style="display:none">
                  <p>${chrome.i18n.getMessage("njTypeYHint")}</p>
                  <input type="text" class="form-control" id="njConfirmYInput" maxlength="1" autocomplete="off" placeholder="Y">
                </div>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-dismiss="modal">${chrome.i18n.getMessage("njCancel")}</button>
                <button type="button" class="btn btn-primary" id="njConfirmNextBtn">${chrome.i18n.getMessage("njContinue")}</button>
                <button type="button" class="btn btn-danger" id="njConfirmExecBtn" style="display:none" disabled>${chrome.i18n.getMessage("njExecute")}</button>
              </div>
            </div>
          </div>
        </div>
            `;

        let modalContainer = document.createElement('div');
        modalContainer.innerHTML = modalHtml;
        document.body.appendChild(modalContainer);

        $('#confirmationModal').modal('show');

        $('#njConfirmNextBtn').on('click', function () {
            $('#njConfirmStep1').hide();
            $('#njConfirmNextBtn').hide();
            $('#njConfirmStep2').show();
            $('#njConfirmExecBtn').show();
            $('#njConfirmYInput').focus();
        });

        $('#njConfirmYInput').on('input', function () {
            let ok = $(this).val().trim().toUpperCase() === 'Y';
            $('#njConfirmExecBtn').prop('disabled', !ok);
        });

        $('#njConfirmYInput').on('keydown', function (e) {
            if (e.key === 'Enter' && !$('#njConfirmExecBtn').prop('disabled')) {
                $('#njConfirmExecBtn').click();
            }
        });

        $('#njConfirmExecBtn').on('click', function () {
            $('#confirmationModal').modal('hide');
            onConfirm();
        });
    }

    // 刷新当前页
    function refresh() {
        chrome.tabs.query({active: true, currentWindow: true}, function (tabsArr) {
            chrome.tabs.reload(tabsArr[0].id, {}, function (tab) {
            });
        });
    }

    // 展示回收站内容
    function showAllDelTabs() {
        njCurrentPage = "#baks";
        // 4.3 需求十六：回收站也要有搜索框；4.4 需求七起按回车进独立搜索页，按当前页决定搜主列表还是回收站
        $("#searchArea").removeClass("hide")
        $("#tabGroups").addClass("hide")
        $("#options").addClass("hide")
        $("#njLogsPanel").addClass("hide")
        $("#gistPage").addClass("hide")
        $("#webdavPage").addClass("hide")
        $("#importOneTab").addClass("hide")
        $("#importDefault").addClass("hide")
        $("#exportDefault").addClass("hide")
        $("#logs").addClass("hide")
        $("#tabGroupsBak").removeClass("hide")
        njLoadData(function (njData) {
        chrome.storage.local.get(["options", "dragType", "restoreDiscarded", "discardedThreshold", "delRetentionDays"], function (storage) {
            let del_bridge = njData.delTabGroups;
            let i;
            let total = 0;
            for (i = 0; i < del_bridge.length; i += 1) {
                total += del_bridge[i].tabs.length;
            }
            let totalsEl = document.getElementById('totals');
            totalsEl.innerHTML = `${chrome.i18n.getMessage("deleted")}${i}${chrome.i18n.getMessage("group")}`;
            totalsEl.title = `${chrome.i18n.getMessage("deleted")}${i}${chrome.i18n.getMessage("group")} / ${total}${chrome.i18n.getMessage("totals")}`;
            // 4.4 需求六：两种拖拽同时可用——组与标签都带 my-handle，不再按 dragType 二选一
            let titleClass = ".my-handle", tabClass = ".my-handle";
            let tabs = {}, // to-be module
                tabGroups = del_bridge || [], // tab groups
                opts = storage.options || {
                    deleteTabOnOpen: 'no'
                };
            // 恢复时休眠打开的开关（阶段D，与主列表共用同一个设置，默认 false = 保持原行为）
            let restoreDiscarded = storage.restoreDiscarded === true;
            // 4.4 需求五：休眠阈值 N（同一个数，默认 10）；只在休眠开关开时才参与判断
            let discardedN = parseInt(storage.discardedThreshold, 10);
            if (!(discardedN >= 1)) { discardedN = 10; }

            // 回收站保留天数设置（A2补完）：storage 里没存过或存了非法值时 normalize 按默认30天处理
            let delRetentionDays = normalizeDelRetentionDays(storage.delRetentionDays);

            // 提示条文案：有限天数时按现有 i18n 拼接习惯拆成前后两段、中间拼当前天数；
            // 永久保留（0）时用单独的说明文案
            function delAutoCleanTipText() {
                if (delRetentionDays === 0) {
                    return `${chrome.i18n.getMessage("delAutoCleanForeverTip")}`;
                }
                return `${chrome.i18n.getMessage("delAutoCleanTipPrefix")}` + delRetentionDays + `${chrome.i18n.getMessage("delAutoCleanTipSuffix")}`;
            }

            // 改保留天数：存设置 → 立刻按新值清理一次 → 刷新回收站视图
            function onDelRetentionChange(e) {
                let sel = (e && e.currentTarget) || this;
                let newDays = normalizeDelRetentionDays(sel ? sel.value : undefined);
                chrome.storage.local.set({delRetentionDays: newDays}, function () {
                    cleanupExpiredDelTabGroups(newDays, function () {
                        showAllDelTabs();
                    });
                });
            }

            // 清空回收站：先弹确认框（写明组数/标签数、无法恢复），确认后真正清空 del 分片。
            // 只调 saveShardings([], "del")，绝不触碰正常 tabGroups 的数据。
            function onEmptyDelTrash() {
                let groupCount = tabGroups.length;
                if (groupCount === 0) {
                    return;
                }
                let tabCount = 0;
                for (let gi = 0; gi < tabGroups.length; gi += 1) {
                    if (tabGroups[gi] && Array.isArray(tabGroups[gi].tabs)) {
                        tabCount += tabGroups[gi].tabs.length;
                    }
                }
                let message = `${chrome.i18n.getMessage("delEmptyConfirmPrefix")}` + groupCount + `${chrome.i18n.getMessage("group")}` + " / " + tabCount + `${chrome.i18n.getMessage("tabsNo")}` + `${chrome.i18n.getMessage("delEmptyConfirmSuffix")}`;
                showConfirmation(`${chrome.i18n.getMessage("confirm")}`, message, function () {
                    njSaveAll("del", []);
                    showAllDelTabs();
                });
            }

            // 提示条整行（保持单个 div.alert 作为 #tabGroupsBak 的第一个子元素，与阶段A/B的既有结构一致）：
            // 文案 + 保留天数下拉；回收站里有数据时再加「清空回收站」按钮，空时不显示按钮
            function delTipBar() {
                let children = [
                    m('span', delAutoCleanTipText()),
                    m('span.del-retention-setting', [
                        m('span', `${chrome.i18n.getMessage("delRetentionLabel")}`),
                        m('select#delRetentionSelect', {
                            onchange: onDelRetentionChange
                        }, DEL_RETENTION_OPTIONS.map(function (opt) {
                            let attrs = {value: String(opt)};
                            if (opt === delRetentionDays) {
                                attrs.selected = "selected";
                            }
                            let label = opt === 0
                                ? `${chrome.i18n.getMessage("delRetentionNever")}`
                                : opt + `${chrome.i18n.getMessage("delRetentionDaysUnit")}`;
                            return m('option', attrs, label);
                        }))
                    ])
                ];
                if (tabGroups.length > 0) {
                    children.push(m('button.btn.btn-danger.btn-sm#emptyDelTrash', {
                        onclick: onEmptyDelTrash
                    }, `${chrome.i18n.getMessage("delEmptyTrash")}`));
                }
                return m('div.alert.alert-info', {style: "text-align:center"}, children);
            }

            // 每组日期旁的剩余天数节点（A2补完）：纯函数算出还剩几天；
            // 返回 null（永久保留 / 还没有 deletedAt）时返回空字符串，视图里就不显示这一行
            function delRemainingNode(deletedAt) {
                let remaining = delGroupRemainingDays(deletedAt, delRetentionDays, Date.now());
                if (remaining === null) {
                    return "";
                }
                return m('span.del-remaining-days', `${chrome.i18n.getMessage("delRemainingPrefix")}` + remaining + `${chrome.i18n.getMessage("delRemainingSuffix")}`);
            }

            function saveTabGroups(json) {
                njSaveAll("del", json);
            }

            function saveDefaultTabGroups(json) {
                saveDefaultTabGroup(json, "object");
            }


            // model entity
            // 'data' is meant to be a tab group object from localStorage
            tabs.TabGroup = function (data) {
                this.date = m.prop(data.date);
                this.id = m.prop(data.id);
                this.tabs = m.prop(data.tabs);
                this.isLock = m.prop(data.isLock);
                this.groupTitle = m.prop(data.groupTitle)
                this.isPined = m.prop(data.isPined)
                // 回收站的删除时间（A2补完）：用来算每组还剩多少天被自动删除；旧组没有此字段时为 undefined，不显示剩余天数
                this.deletedAt = m.prop(data.deletedAt)
            };

            // alias for Array
            tabs.TabGroupsList = Array;

            // view-model
            tabs.vm = new function () {
                let vm = {};
                vm.init = function () {
                    // list of tab groups
                    vm.list = new tabs.TabGroupsList();

                    vm.rmGroup = function (groupIndex) {
                        // remove from localStorage
                        tabGroups.splice(groupIndex, 1);
                        // save
                        saveTabGroups(tabGroups);
                        showAllDelTabs();
                    };

                    vm.recoverGroup = function (groupIndex) {
                        // remove from localStorage
                        let defaultTabGroup = tabGroups.splice(groupIndex, 1);
                        // 恢复回正常列表后，就不再需要回收站的删除时间了
                        if (defaultTabGroup[0]) {
                            delete defaultTabGroup[0].deletedAt;
                        }
                        // save
                        saveTabGroups(tabGroups);
                        saveDefaultTabGroups(defaultTabGroup[0])
                        showAllDelTabs();
                    }

                    vm.moveGroup = function (index, tindex) {
                        if (index > tindex) {
                            tabGroups.splice(tindex, 0, tabGroups[index]);
                            tabGroups.splice(index + 1, 1);
                            saveTabGroups(tabGroups);
                        } else {
                            tabGroups.splice(tindex + 1, 0, tabGroups[index]);
                            tabGroups.splice(index, 1);
                            saveTabGroups(tabGroups);
                        }
                    };

                    vm.updateGroup = function (index, groupInfo) {
                        let isLock = groupInfo.isLock
                        let toTop = groupInfo.toTop
                        let groupTitle = groupInfo.groupTitle
                        if (isLock !== undefined) {
                            tabGroups[index].isLock = isLock
                            saveTabGroups(tabGroups);
                            showAllDelTabs();
                        }
                        if (toTop !== undefined) {
                            if (toTop) {
                                tabGroups[index].isPined = toTop
                                tabs.vm.moveGroup(index, 0)
                                showAllDelTabs();
                            } else {
                                let count = 0;
                                for (let i = 0; i < tabGroups.length; i++) {
                                    const currentElement = tabGroups[i];
                                    if (currentElement.isPined === undefined || currentElement.isPined === false) {
                                        break;
                                    }
                                    count++;
                                }
                                tabGroups[index].isPined = toTop
                                tabs.vm.moveGroup(index, count - 1)
                                showAllDelTabs();
                            }
                        }
                        if (groupTitle !== undefined) {
                            tabGroups[index].groupTitle = groupTitle
                            saveTabGroups(tabGroups);
                            showAllDelTabs();
                        }
                    };

                    vm.rmTab = function (groupIndex, index) {
                        let delTabs = tabGroups[groupIndex].tabs.splice(index, 1);
                        // save
                        saveTabGroups(tabGroups);
                        showAllDelTabs();
                    };

                    vm.moveTab = function (groupIndex, index, tgroupIndex, tindex) {
                        if (groupIndex === tgroupIndex) {
                            if (index > tindex) {
                                tabGroups[groupIndex].tabs.splice(tindex, 0, tabGroups[groupIndex].tabs[index]);
                                tabGroups[groupIndex].tabs.splice(index + 1, 1);
                                saveTabGroups(tabGroups);
                            } else {
                                tabGroups[groupIndex].tabs.splice(tindex + 1, 0, tabGroups[groupIndex].tabs[index]);
                                tabGroups[groupIndex].tabs.splice(index, 1);
                                saveTabGroups(tabGroups);
                            }
                        } else {
                            tabGroups[tgroupIndex].tabs.splice(tindex, 0, tabGroups[groupIndex].tabs[index]);
                            tabGroups[groupIndex].tabs.splice(index, 1);
                            saveTabGroups(tabGroups);
                        }
                    };
                };
                return vm;
            };

            tabs.controller = function () {
                let i;
                tabs.vm.init();
                for (i = 0; i < tabGroups.length; i += 1) {
                    tabs.vm.list.push(new tabs.TabGroup(tabGroups[i]));
                }
            };

            tabs.view = function () {
                if (tabs.vm.list.length === 0) {
                    return m('div', [delTipBar(), m('div.jumbotron', [m('div', {style: "text-align:center; margin-bottom:50px"}, `${chrome.i18n.getMessage("noDelTabs")}`)])])
                }
                // foreach tab group（4.3 需求十：与主列表一样分段渲染，前缀切片保序号一致）
                let njDelNodes = [delTipBar()].concat(tabs.vm.list.slice(0, njBaksRenderLimit).map(function (group, i) {
                    // console.log(tabs.vm.list);
                    // console.log(group.tabs());
                    // console.log(i);
                    // 如果标签组是空的，就自动删了
                    if (group.tabs().length === 0) {
                        tabs.vm.rmGroup(i);
                    }
                    let isLock = group.isLock()
                    let isPined = group.isPined()
                    let deleteLinkClass, lockStatus, lockImgClass, lockClass = ""
                    if (isLock) {
                        deleteLinkClass = ".no-delete-link"
                        lockStatus = `${chrome.i18n.getMessage("unLock")}`
                        lockImgClass = ".lock-img"
                        lockClass = ".filtered"
                    } else {
                        deleteLinkClass = ".delete-link"
                        lockStatus = `${chrome.i18n.getMessage("lock")}`
                        lockImgClass = ".no-lock-img"
                    }
                    let pinStatus, pinImgClass = ""
                    if (isPined) {
                        pinStatus = `${chrome.i18n.getMessage("noToTop")}`
                        pinImgClass = ".pin-img"
                        lockClass = ".filtered"
                    } else {
                        pinStatus = `${chrome.i18n.getMessage("toTop")}`
                        pinImgClass = ".no-pin-img"
                    }
                    let groupTitle = group.groupTitle()

                    return m('div.tabs' + titleClass + lockClass, {
                        id: i
                    }, [m('div.group-title', [m('img' + lockImgClass, {
                        src: "/images/lock.png"
                    }), m('span' + deleteLinkClass, {
                        onclick: function (e) {
                            let ci = currentGroupIndex((e && e.currentTarget) || this, i);
                            // 回收站标题栏的删组图标同样不再看锁定（同上，4.3 补修）
                            showConfirmation(`${chrome.i18n.getMessage("confirm")}`, `${chrome.i18n.getMessage("confirmationDel")}`, function () {
                                tabs.vm.rmGroup(ci);
                            });
                        }
                    }), m('img' + pinImgClass, {
                        src: "/images/pin.png"
                    }), ' ', m('span.group-amount', {
                        onclick: function (e) {
                            $("#del_tabs_" + currentGroupIndex((e && e.currentTarget) || this, i)).slideToggle();
                        }
                    }, group.tabs().length + `${chrome.i18n.getMessage("tabsNo")}`), ' ', m('span.group-name', {
                        id: "del_groupTitle" + i
                    }, groupTitle), m('span.group-date', njDelGroupTimeText(group)), ' ', delRemainingNode(group.deletedAt()), ' ', m('span.restore-all', {
                        onclick: function (e) {
                            let j;
                            let ci = currentGroupIndex((e && e.currentTarget) || this, i);

                            // reason this goes first and not after is because it doesn't work otherwise
                            // I imagine it's because you changed tab and stuff
                            if (opts.deleteTabOnOpen === 'yes') {
                                if (!isLock) {
                                    tabs.vm.rmGroup(ci);
                                }
                            }
                            for (j = 0; j < group.tabs().length; j += 1) {
                                // 4.4 需求五：休眠只在开关开、且组内条数超过 N 时才用，且只休眠第 N 条之后的；
                                // 前 N 条与不超过 N 的组都直接打开。关时与原行为完全一致。
                                let useDiscarded = restoreDiscarded && group.tabs().length > discardedN && j >= discardedN;
                                openRestoredTab(group.tabs()[j].url, useDiscarded);
                            }
                        }
                    }, `${chrome.i18n.getMessage("restoreGroup")}`), m('span.delete-all', {
                        onclick: function (e) {
                            let ci = currentGroupIndex((e && e.currentTarget) || this, i);
                            // 回收站里删整组不再看锁定：锁是防首页误删的，组进了回收站不该被锁卡住（4.3 补修，用户 2026-11-18 拍板）
                            showConfirmation(`${chrome.i18n.getMessage("confirm")}`, `${chrome.i18n.getMessage("confirmationDel")}`, function () {
                                tabs.vm.rmGroup(ci);
                            });
                        }
                    }, `${chrome.i18n.getMessage("deleteAll")}`), m('span.about-recover', {
                        onclick: function (e) {
                            let ci = currentGroupIndex((e && e.currentTarget) || this, i);
                            // 回收站里还原整组不再看锁定（同上，4.3 补修）；还原回首页后锁定状态原样保留
                            showConfirmation(`${chrome.i18n.getMessage("confirm")}`, `${chrome.i18n.getMessage("confirmationRecover")}`, function () {
                                tabs.vm.recoverGroup(ci);
                            });
                        }
                    }, `${chrome.i18n.getMessage("recover")}`)]), // foreach tab
                        m('ul' + tabClass + lockClass, {
                            id: "del_tabs_" + i
                        }, group.tabs().map(function (tab, ii) {
                            return m('li.li-hover.li-standard.strikethrough', [m('span' + deleteLinkClass, {
                                onclick: function (e) {
                                    let ci = currentGroupIndex((e && e.currentTarget) || this, i);
                                    let cii = currentTabIndex((e && e.currentTarget) || this, ii);
                                    // 回收站里删单条不再看锁定（同上，4.3 补修）
                                    tabs.vm.rmTab(ci, cii);
                                }
                            }), m('span.link', {
                                title: tab.title + "\n" + tab.url, onclick: function (e) {
                                    let ci = currentGroupIndex((e && e.currentTarget) || this, i);
                                    let cii = currentTabIndex((e && e.currentTarget) || this, ii);
                                    if (opts.deleteTabOnOpen === 'yes') {
                                        if (!isLock) {
                                            tabs.vm.rmTab(ci, cii);
                                        }
                                    }
                                    chrome.tabs.create({
                                        url: tab.url, active: false
                                    });
                                },
                                onmousedown: function (e) {
                                    // 中键按下先拦住浏览器的自动滚动（4.2 需求五）
                                    if (e && e.button === 1) {
                                        e.preventDefault();
                                    }
                                },
                                onauxclick: function (e) {
                                    // 中键点击：后台打开，永不删除此条（4.2 需求五；打开时删除的开关只管左键）
                                    if (e && e.button === 1) {
                                        e.preventDefault();
                                        chrome.tabs.create({
                                            url: tab.url, active: false
                                        });
                                    }
                                }
                            }, tab.title), m('span.tab-add-time', njTabTimeText(tab, group.date()))]);
                        }))]);
                }));
                if (tabs.vm.list.length > njBaksRenderLimit) {
                    njDelNodes.push(m('div.nj-more-wrap.filtered', [m('button.btn.btn-default', {
                        onclick: function () {
                            njBaksRenderLimit += 50;
                            showAllDelTabs();
                        }
                    }, `${chrome.i18n.getMessage("logShowMore")}（${tabs.vm.list.length - njBaksRenderLimit}）`)]));
                }
                return njDelNodes;
            };


            // init the app
            m.module(document.getElementById('tabGroupsBak'), {controller: tabs.controller, view: tabs.view});

            // 保留天数下拉的当前值兜底（A2补完）：mithril 对 option 的 selected 属性处理不完全可靠，再按设置值设一次
            let delRetentionSelectEl = document.getElementById('delRetentionSelect');
            if (delRetentionSelectEl) {
                delRetentionSelectEl.value = String(delRetentionDays);
            }

            // 重建 Sortable 前先销毁上一轮的实例并清空数组，避免实例叠加泄漏、越拖越卡（阶段B）
            sortableDelTitle = njSafeDestroySortable(sortableDelTitle);
            for (let si = 0; si < sortableDelTabList.length; si += 1) {
                njSafeDestroySortable(sortableDelTabList[si]);
            }
            sortableDelTabList.length = 0;

            // 以下是超级拖曳的相关代码
            // 4.4 需求六：回收站同首页，两种拖拽同时启用
            {
                sortableDelTitle = Sortable.create(document.getElementById("tabGroupsBak"), {
                        group: {
                            name: "tabGroupsBak", pull: false, put: false
                        }, scroll: true, easing: "cubic-bezier(1, 0, 0, 1)", animation: 100, //动画参数
                        // #tabGroupsBak 的第一个子元素是提示条 div.alert，不是标签组。
                        // Sortable 默认 draggable 是 ">*"，会把提示条也算进 oldIndex/newIndex 和
                        // oldDraggableIndex/newDraggableIndex，序号比纯组序号大 1，moveGroup 会
                        // 拖错组甚至把 undefined 写进数据（阶段E实测确认）。这里把 draggable
                        // 限定为 .tabs，再改用 DraggableIndex，序号才是纯组序号；提示条同时也不再能被拖动。
                        draggable: ".tabs",
                        ghostClass: 'ghost', filter: '.filtered',
                        // 4.4 需求六配套：拖拽进行中标记（同首页）
                        onChoose: function () {
                            njDragActive = true;
                        },
                        onUnchoose: function () {
                            njDragActive = false;
                        },
                        onEnd: function (evt) { //拖拽完毕之后发生该事件
                            njDragActive = false;
                            tabs.vm.moveGroup(evt.oldDraggableIndex, evt.newDraggableIndex);
                            // 同步 mithril 的 vm.list 顺序：点击等事件后 mithril 会按 vm.list 做 diff 重绘，不同步会把顺序画回拖动前
                            let movedGroup = tabs.vm.list.splice(evt.oldDraggableIndex, 1)[0];
                            if (movedGroup) {
                                tabs.vm.list.splice(evt.newDraggableIndex, 0, movedGroup);
                            }
                            // 不再全量重渲染（Sortable 已把 DOM 节点移到正确位置），只同步写死在 DOM 上的序号/计数
                            syncDragDomOrder("tabGroupsBak", "del_");
                        }
                    });

            }

            {
                let j;
                for (j = 0; j < Math.min(del_bridge.length, njBaksRenderLimit); j += 1) {
                    let sortableTab = Sortable.create(document.getElementById("del_tabs_" + j), {
                        group: {
                            name: "tabs", pull: true, put: true
                        }, easing: "cubic-bezier(1, 0, 0, 1)", scroll: true, swapThreshold: 0.65, animation: 100, //动画参数
                        filter: '.filtered',
                        // 4.4 需求六配套：拖拽进行中标记（同首页）
                        onChoose: function () {
                            njDragActive = true;
                        },
                        onUnchoose: function () {
                            njDragActive = false;
                        },
                        onEnd: function (evt) {
                            // console.log(evt)
                            // console.log(evt.item);
                            // console.log(evt.to);
                            // console.log(evt.from);
                            // console.log(evt.oldIndex);
                            // console.log(evt.newIndex);
                            // console.log(evt.oldDraggableIndex);
                            // console.log(evt.newDraggableIndex);
                            // console.log("从" + evt.from.parentNode.id + "的" + evt.oldIndex + "到" + evt.to.parentNode.id + "的" + evt.newIndex)
                            njDragActive = false;
                            tabs.vm.moveTab(evt.from.parentNode.id, evt.oldIndex, evt.to.parentNode.id, evt.newIndex)
                            // 标签数据数组与 vm.list 里组对象的 tabs 是同一引用，moveTab 已同步；不再全量重渲染，只同步 DOM 上的序号/计数
                            syncDragDomOrder("tabGroupsBak", "del_");
                        }
                    })
                    sortableDelTabList.push(sortableTab);
                }

            }

        });
        });
    }

}(m));
