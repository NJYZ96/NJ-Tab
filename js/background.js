console.log("background is done!");

// 引入需要的库
importScripts("moment.min.js");
importScripts("axios.min.js");

let emojiReg = /[\uD83C|\uD83D|\uD83E][\uDC00-\uDFFF][\u200D|\uFE0F]|[\uD83C|\uD83D|\uD83E][\uDC00-\uDFFF]|[0-9|*|#]\uFE0F\u20E3|[0-9|#]\u20E3|[\u203C-\u3299]\uFE0F\u200D|[\u203C-\u3299]\uFE0F|[\u2122-\u2B55]|\u303D|[\A9|\AE]\u3030|\uA9|\uAE|\u3030/gi;
let handleGithubGistLog = [];
let handleGiteeGistLog = [];
let gitHubApiUrl = "https://api.github.com";
let giteeApiUrl = "https://gitee.com/api/v5";
let githubUsedSeconds;
let giteeUsedSeconds;
let pushToGithubGistStatus;
let pushToGiteeGistStatus;
let githubGistToken;
let giteeGistToken;
let githubGistId;
let giteeGistId;
// 定义一个n次循环定时器
let githubIntervalId;
let giteeIntervalId;
let isLock = false;

// 监听插件状态变化的事件
chrome.runtime.onInstalled.addListener(function (details) {
    if (details.reason === 'install') {
        // 这里是插件第一次安装时要执行的代码
        console.log('插件已被安装！');
        setTimer('inTimeSync', 3 * 1000);
    } else if (details.reason === 'update') {
        // 这里是插件更新时要执行的代码
        console.log('插件已被更新！');
        setTimer('inTimeSync', 3 * 1000);
    }
});

// 获取tab数量并在popup上显示
chrome.tabs.query({currentWindow: true}, function (tab) {
    chrome.action.setBadgeText({text: tab.length + ""});
    chrome.action.setBadgeBackgroundColor({color: "#0038a8"});
});

// 持续监听，当tab被激活的时候刷新一下pop上badge的tab的数量
chrome.tabs.onActivated.addListener(function callback() {
    chrome.tabs.query({}, function (tab) {
        chrome.action.setBadgeText({text: tab.length + ""});
        chrome.action.setBadgeBackgroundColor({color: "#0038a8"});
    });
});

// 持续监听，当tab被关闭的时候刷新一下pop上badge的tab的数量
chrome.tabs.onRemoved.addListener(function callback() {
    chrome.tabs.query({}, function (tab) {
        chrome.action.setBadgeText({text: tab.length + ""});
        chrome.action.setBadgeBackgroundColor({color: "#0038a8"});
    });
});

// 持续监听，当tab被创建的时候刷新一下pop上badge的tab的数量
chrome.tabs.onCreated.addListener(function callback() {
    chrome.tabs.query({}, function (tab) {
        chrome.action.setBadgeText({text: tab.length + ""});
        chrome.action.setBadgeBackgroundColor({color: "#0038a8"});
    });
});

// 创建定时同步gitee任务，至于是否真的同步，要看设置
chrome.alarms.create("checkAutoSyncGitee", {delayInMinutes: 5, periodInMinutes: 5});

// 创建定时同步github任务，至于是否真的同步，要看设置
chrome.alarms.create("checkAutoSyncGithub", {delayInMinutes: 5, periodInMinutes: 5});
chrome.alarms.create("checkWebdavAutoBackup", {delayInMinutes: 60, periodInMinutes: 60});

// ===== 4.2 需求三：Gist 自动备份开关与频率 =====
// 开关 gistAutoEnabled 没设过时沿用旧的 autoSync 开关，老用户行为不变；频率 5 档（5/15/30/60/120 分钟），默认 30 分钟
function njGistAutoEnabled(items) {
    if (typeof items.gistAutoEnabled !== "undefined") {
        return items.gistAutoEnabled === true;
    }
    return items.autoSync === true;
}

function njGistAutoInterval(items) {
    let v = parseInt(items.gistAutoIntervalMinutes, 10);
    return [5, 15, 30, 60, 120].indexOf(v) >= 0 ? v : 30;
}

// 4.5 需求五：自动备份结果按仓库分开各存一份（Gist 页两仓各显示自己最新一条），旧的合并键继续写、兼容老版本
function njSetGistAutoResult(provider, result, reason) {
    let rec = {provider: provider, result: result, time: Date.now()};
    if (reason) {
        rec.reason = reason;
    }
    let obj = {};
    obj[provider === "gitee" ? "gistAutoLastResultGitee" : "gistAutoLastResultGithub"] = rec;
    chrome.storage.local.set(obj);
}

// ===== 4.2 需求四：统一操作日志 =====
// 存 chrome.storage.local 的 njLogs 数组：{t: 时间戳, action: 动作, ok: 成功与否, detail: 简短说明}
// 绝不记密码/令牌原文。自动清理：logAutoCleanEnabled（默认开）、logKeepDays（默认 30 天）、logKeepCount（默认 500 条）
// 4.6.6 需求一：写日志串行队列——老写法是各自「读出整表、加一条、整表存回」，两条几乎同时写时后存的会把先存的覆盖掉
// （两个仓库都没令牌时自动备份只剩一条「已跳过」就是这么丢的）。改为排队依次落盘，前一条存完才写下一条。
let njLogQueue = [];
let njLogWriting = false;
function njLogEvent(action, ok, detail) {
    njLogQueue.push({action: action, ok: ok, detail: detail});
    njPumpLogQueue();
}
function njPumpLogQueue() {
    if (njLogWriting) { return; }
    let job = njLogQueue.shift();
    if (!job) { return; }
    njLogWriting = true;
    chrome.storage.local.get(["njLogs", "logAutoCleanEnabled", "logKeepDays", "logKeepCount"], function (st) {
        let logs = Array.isArray(st.njLogs) ? st.njLogs : [];
        logs.push({t: Date.now(), action: String(job.action), ok: !!job.ok, detail: job.detail ? String(job.detail).slice(0, 200) : ""});
        if (st.logAutoCleanEnabled !== false) {
            let keepDays = parseInt(st.logKeepDays, 10) || 30;
            let keepCount = parseInt(st.logKeepCount, 10) || 500;
            let cutoff = Date.now() - keepDays * 86400000;
            logs = logs.filter(function (e) { return e && e.t >= cutoff; });
            if (logs.length > keepCount) {
                logs = logs.slice(logs.length - keepCount);
            }
        }
        chrome.storage.local.set({njLogs: logs}, function () {
            njLogWriting = false;
            njPumpLogQueue();
        });
    });
}

// 4.6.6 审核补修：自动推送收尾统一走这里——结束时立即把过程日志落盘，不再单靠每秒一次的秒表监听。
// 原先秒表发现状态变空才落盘，后台（Service Worker）被系统回收时秒表跟着没了，过程日志整条丢失、
// 只剩一句话的简条（GitHub 没令牌时被显示成「成功」、错令牌时没有步骤，都是这么来的）。秒表保留作兜底，重复收尾会自动跳过。
let njAutoLogFinalized = {github: false, gitee: false};
function njEndAutoPush(provider) {
    let isGh = provider === "github";
    if (isGh) { pushToGithubGistStatus = undefined; } else { pushToGiteeGistStatus = undefined; }
    if (njAutoLogFinalized[provider]) { return; }
    njAutoLogFinalized[provider] = true;
    let logArr = isGh ? handleGithubGistLog : handleGiteeGistLog;
    let secs = isGh ? githubUsedSeconds : giteeUsedSeconds;
    logArr.push(`${secs || 0}${chrome.i18n.getMessage("secondWait")}`);
    logArr.push(`${chrome.i18n.getMessage(isGh ? "endPushToGithubGistTask" : "endPushToGiteeGistTask")}`);
    logArr.push(`${chrome.i18n.getMessage("end")}${moment().format('YYYY-MM-DD HH:mm:ss')}`);
    setHandleGistStatus("IDLE", provider);
    setHandleGistLog(`${chrome.i18n.getMessage(isGh ? "autoPushGithub" : "autoPushGitee")}`, logArr);
}

// 内容指纹：判断数据有没有变化（无变化就跳过自动备份）
function njGistContentHash(content) {
    let str;
    try {
        str = JSON.stringify(content);
    } catch (e) {
        return "";
    }
    let h = 5381;
    for (let i = 0; i < str.length; i++) {
        h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    }
    return String(h) + ":" + str.length;
}

// 待确认的自动备份指纹：推送成功后才落盘，下次同内容就跳过
let njPendingAutoHash = {github: null, gitee: null};

// 自动备份推送前把关：内容与上次成功推送的一模一样就跳过（记日志 + 更新状态，Gist 页状态行会显示）
function njGistAutoMaybePush(provider, content, updateFn) {
    let hashKey = provider === "github" ? "gistAutoHashGithub" : "gistAutoHashGitee";
    let statusKey = provider === "github" ? "pushToGithubGistStatus" : "pushToGiteeGistStatus";
    chrome.storage.local.get(hashKey, function (st) {
        let hash = njGistContentHash(content);
        if (hash && st[hashKey] === hash) {
            if (provider === "github") {
                handleGithubGistLog.push(`${chrome.i18n.getMessage("gistAutoSkippedNoChange")}`);
            } else {
                handleGiteeGistLog.push(`${chrome.i18n.getMessage("gistAutoSkippedNoChange")}`);
            }
            njSetGistAutoResult(provider, "skipped");
            njLogEvent("gistAutoBackupSkipped", true, provider);
            // 结束本次任务并立即落盘过程日志
            njEndAutoPush(provider);
            return;
        }
        njPendingAutoHash[provider] = hash;
        updateFn(content);
    });
}

// 检查是否同步github的gist
function checkAutoSyncGithub() {
    console.log("检查github是否同步")
    chrome.storage.local.get(null, function (items) {
        if (!njGistAutoEnabled(items)) {
            return;
        }
        // 没到设定的间隔就跳过（闹钟每 5 分钟一跳，这里按用户设的频率把关）
        if (Date.now() - (items.lastGistAutoPushGithub || 0) < njGistAutoInterval(items) * 60000 - 30000) {
            return;
        }
        chrome.storage.local.set({lastGistAutoPushGithub: Date.now()});
        startPushToGithubGist();
    });
}

// 检查是否同步gitee的gist
function checkAutoSyncGitee() {
    console.log("检查gitee是否同步")
    chrome.storage.local.get(null, function (items) {
        if (!njGistAutoEnabled(items)) {
            return;
        }
        if (Date.now() - (items.lastGistAutoPushGitee || 0) < njGistAutoInterval(items) * 60000 - 30000) {
            return;
        }
        chrome.storage.local.set({lastGistAutoPushGitee: Date.now()});
        startPushToGiteeGist();
    });
}

// 开始推送github的gist
function startPushToGithubGist() {
    console.log("开始推送github")
    handleGithubGistLog.length = 0;
    handleGithubGistLog.push(`${chrome.i18n.getMessage("start")}${moment().format('YYYY-MM-DD HH:mm:ss')}`);
    handleGithubGistLog.push(`${chrome.i18n.getMessage("autoPushToGithubGist")}`)
    chrome.storage.local.get(null, function (storage) {
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
                    handleGithubGistLog.push(storage.handleGithubGistStatus.type)
                    handleGithubGistLog.push(`${chrome.i18n.getMessage("endPushToGithubGistTask")}`)
                    handleGithubGistLog.push(`${chrome.i18n.getMessage("end")}${moment().format('YYYY-MM-DD HH:mm:ss')}`);
                    setHandleGistLog(`${chrome.i18n.getMessage("autoPushGithub")}`, handleGithubGistLog);
                }
            }
        } else {
            console.log("handleGistStatus没有值，第一次");
            pushToGithubGist();
        }
    });
}

// 开始推送gitee的gist
function startPushToGiteeGist() {
    console.log("开始推送gitee")
    handleGiteeGistLog.length = 0;
    handleGiteeGistLog.push(`${chrome.i18n.getMessage("start")}${moment().format('YYYY-MM-DD HH:mm:ss')}`);
    handleGiteeGistLog.push(`${chrome.i18n.getMessage("autoPushToGiteeGist")}`)
    chrome.storage.local.get(null, function (storage) {
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
                    handleGiteeGistLog.push(storage.handleGiteeGistStatus.type)
                    handleGiteeGistLog.push(`${chrome.i18n.getMessage("endPushToGiteeGistTask")}`)
                    handleGiteeGistLog.push(`${chrome.i18n.getMessage("end")}${moment().format('YYYY-MM-DD HH:mm:ss')}`);
                    setHandleGistLog(`${chrome.i18n.getMessage("autoPushGitee")}`, handleGiteeGistLog);
                }
            }
        } else {
            console.log("handleGistStatus没有值，第一次");
            pushToGiteeGist();
        }
    });
}

// 推送到github的gist
function pushToGithubGist() {
    console.log("推送github")
    setHandleGistStatus(`${chrome.i18n.getMessage("pushToGithubGistIng")}`, "github");
    githubUsedSeconds = 0;
    njAutoLogFinalized.github = false;
    pushToGithubGistStatus = `${chrome.i18n.getMessage("startPushToGithubGistTask")}`;
    handleGithubGistLog.push(`${chrome.i18n.getMessage("startPushToGithubGistTask")}`)
    if (typeof (pushToGithubGistStatus) != "undefined") {
        if (githubIntervalId) { clearInterval(githubIntervalId); }
        githubIntervalId = setInterval(function () {
            if (typeof (pushToGithubGistStatus) != "undefined") {
                githubUsedSeconds++;
            } else {
                clearInterval(githubIntervalId);
                njEndAutoPush("github");
            }
        }, 1000);
        console.log(githubIntervalId)
        isStoredGithubTokenLocal("push_github");
    }
}

// 推送到gitee的gist
function pushToGiteeGist() {
    console.log("推送gitee")
    setHandleGistStatus(`${chrome.i18n.getMessage("pushToGiteeGistIng")}`, "gitee");
    giteeUsedSeconds = 0;
    njAutoLogFinalized.gitee = false;
    pushToGiteeGistStatus = `${chrome.i18n.getMessage("startPushToGiteeGistTask")}`;
    handleGiteeGistLog.push(`${chrome.i18n.getMessage("startPushToGiteeGistTask")}`)
    if (typeof (pushToGiteeGistStatus) != "undefined") {
        if (giteeIntervalId) { clearInterval(giteeIntervalId); }
        giteeIntervalId = setInterval(function () {
            if (typeof (pushToGiteeGistStatus) != "undefined") {
                giteeUsedSeconds++;
            } else {
                clearInterval(giteeIntervalId);
                njEndAutoPush("gitee");
            }
        }, 1000);
        console.log(giteeIntervalId)
        isStoredGiteeTokenLocal("push_gitee");
    }
}

// ===== 密码/token 本机加密（阶段3，与 workbench.js 同一套格式）=====
// 存储格式 {__njEnc:1, iv, ct}（AES-GCM 加密）；密钥单独存 njSecretKeyJwk，只留在本机、与密文分开
// 老版本存的明文在首次读到时自动改存为密文（一次性迁移）；token 绝不打印到日志
let njKeyPromise = null;

function njB64encode(buf) {
    let bytes = new Uint8Array(buf);
    let str = "";
    for (let i = 0; i < bytes.length; i++) { str += String.fromCharCode(bytes[i]); }
    return btoa(str);
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
            // 4.4 附带修复：缓存的钥匙可能与密文脱钩（页面与后台曾抢着生成钥匙、存储里的已被换掉）——
            // 废掉缓存、按存储里现存的钥匙重读一次再试；还失败才当作没有（与旧行为一致返回空串）
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

// 判断是否已经保存github的Token
function isStoredGithubTokenLocal(action) {
    console.log("是否已经保存github的Token")
    handleGithubGistLog.push(`${chrome.i18n.getMessage("startCheckGithubTokenSaved")}`);
    // 加密存储：读出并解密（老明文会自动迁移为密文）
    njLoadSecretField("githubGistToken", function (plain) {
        if (plain) {
            handleGithubGistLog.push(`${chrome.i18n.getMessage("githubTokenSaved")}`);
            githubGistToken = plain;
            isStoredGithubGistIdLocal(action);
        } else {
            handleGithubGistLog.push(`${chrome.i18n.getMessage("githubTokenNoSaved")}`);
            // 4.6.4 需求八：没保存令牌不是成功——记为已跳过（灰色），状态行与日志都按跳过算
            handleGithubGistLog.push(`${chrome.i18n.getMessage("autoPushSkipNoToken")}`);
            njSetGistAutoResult("github", "skipped", chrome.i18n.getMessage("githubTokenNoSaved"));
            njLogEvent("gistAutoBackupSkipped", true, "github");
            njEndAutoPush("github");
        }
    });
}

// 判断是否已经保存gitee的Token
function isStoredGiteeTokenLocal(action) {
    console.log("是否已经保存gitee的Token")
    handleGiteeGistLog.push(`${chrome.i18n.getMessage("startCheckGiteeTokenSaved")}`);
    // 加密存储：读出并解密（老明文会自动迁移为密文）
    njLoadSecretField("giteeGistToken", function (plain) {
        if (plain) {
            handleGiteeGistLog.push(`${chrome.i18n.getMessage("giteeTokenSaved")}`);
            giteeGistToken = plain;
            isStoredGiteeGistIdLocal(action);
        } else {
            handleGiteeGistLog.push(`${chrome.i18n.getMessage("giteeTokenNoSaved")}`);
            // 4.6.4 需求八：同 GitHub——没保存令牌记已跳过，不算成功
            handleGiteeGistLog.push(`${chrome.i18n.getMessage("autoPushSkipNoToken")}`);
            njSetGistAutoResult("gitee", "skipped", chrome.i18n.getMessage("giteeTokenNoSaved"));
            njLogEvent("gistAutoBackupSkipped", true, "gitee");
            njEndAutoPush("gitee");
        }
    });
}


// ===== 4.6 自动备份假成功修复：编号是旧版或没编号时，找新版 Gist / 找不到就新建，再真正推送 =====
// 原 bug：自动路径在旧版编号或没编号时直接结束任务、没创建没推送，但过程日志步骤里没有「失败」字样、
// 被页面按成功显示，自动备份状态也不更新。以下函数与手动推送同逻辑（只认描述 NJ-Tab 的新版 Gist），
// 全程用 fetch（后台没有 jQuery）；失败一律写失败状态与失败日志。
// 4.6.3 需求三：把 HTTP 状态码翻成人话原因（按 GitHub / Gitee 官方口径），日志和状态里与状态码一起写
// WebDAV 状态码人话（后台侧，与页面 njHttpTextZh 同一张表，4.6.5 需求十一）
function njWebdavHttpText(status) {
    if (!status) { return "网络出错（连不上或超时）"; }
    let table = {
        401: "账号或密码错误",
        403: "拒绝访问（权限不足）",
        404: "地址能通但路径不对",
        429: "请求太频繁，被服务器限流，请稍后再试"
    };
    let r = table[status] || (status >= 500 ? "服务器出错" : (status >= 400 ? "请求被服务器拒绝" : ""));
    return "HTTP " + status + (r ? "：" + r : "");
}

// WebDAV 出错文本归一化（后台侧，与页面 njWebdavErrText 同规则，4.6.5 需求十一）
function njWebdavErrText(err) {
    let m = err && err.message ? String(err.message) : String(err || "");
    if (/^HTTP \d+/.test(m)) { return m; }
    if (err && err.name === "SyntaxError") { return "备份内容损坏或格式不对"; }
    if (/[\u4e00-\u9fff]/.test(m)) { return m; }
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) { return "网络出错（连不上或超时）"; }
    return m || "未知错误";
}

function njHttpText(status) {
    if (!status) { return ""; }
    let table = {
        401: "令牌无效或已过期",
        403: "权限不足或被拒绝（也可能是触发限流）",
        404: "找不到这个 Gist（可能已被删除）",
        422: "请求内容有问题",
        429: "请求太频繁，被服务器限流，请稍后再试"
    };
    let r = table[status] || (status >= 500 ? "对方服务器出错" : "");
    return "HTTP " + status + (r ? "：" + r : "");
}

function njAutoFail(provider, reason) {
    njSetGistAutoResult(provider, "failed", reason);
    njLogEvent("gistAutoBackup", false, (provider === "github" ? "GitHub " : "Gitee ") + reason);
    njEndAutoPush(provider);
}

// 拿到本地内容后进入推送（含无变化跳过把关）
function njAutoProceedWithContent(provider, content) {
    njGistAutoMaybePush(provider, content, provider === "github" ? updateGithubGist : updateGiteeGist);
}

// 找新版 Gist：有就用它推送；没有就新建（新建时直接把当前内容写进去，建完清掉旧指纹并补一次更新推送，确保状态与指纹落盘）
function njAutoFindOrCreate(provider) {
    let isGh = provider === "github";
    let logArr = isGh ? handleGithubGistLog : handleGiteeGistLog;
    logArr.push(`${chrome.i18n.getMessage("startCheckGistCreated")}`);
    getShardings(function (callback) {
        let build = function (content) {
            let headers = new Headers();
            headers.append("Authorization", "token " + (isGh ? githubGistToken : giteeGistToken));
            if (isGh) {
                headers.append("accept", "application/vnd.github+json");
            }
            let listStatus = 0;
            fetch((isGh ? gitHubApiUrl : giteeApiUrl) + "/gists", {method: "GET", headers: headers})
                .then(function (r) { listStatus = r.status; return r.ok ? r.json() : null; })
                .catch(function () { return null; })
                .then(function (list) {
                    if (!Array.isArray(list)) {
                        logArr.push(`${chrome.i18n.getMessage("pullFailed")}` + (listStatus ? "（" + njHttpText(listStatus) + "）" : ""));
                        njAutoFail(provider, "列出 Gist 失败" + (listStatus ? " " + njHttpText(listStatus) : ""));
                        return;
                    }
                    let found = null;
                    for (let i = 0; i < list.length; i++) {
                        if (list[i].description === "NJ-Tab") { found = list[i]; break; }
                    }
                    if (found) {
                        logArr.push(`${chrome.i18n.getMessage("gistCreated")}`);
                        if (isGh) { githubGistId = found.id; } else { giteeGistId = found.id; }
                        let obj = {};
                        obj[isGh ? "githubGistId" : "giteeGistId"] = found.id;
                        chrome.storage.local.set(obj);
                        logArr.push(`${chrome.i18n.getMessage("getGistIdAndSaved")}`);
                        njAutoProceedWithContent(provider, content);
                        return;
                    }
                    logArr.push(`${chrome.i18n.getMessage("gistNoCreated")}`);
                    njAutoCreateGist(provider, content);
                });
        };
        if (!callback || typeof callback == "undefined") {
            build([]);
        } else {
            njWithBackupSettings(callback, build);
        }
    });
}

function njAutoCreateGist(provider, content) {
    let isGh = provider === "github";
    let logArr = isGh ? handleGithubGistLog : handleGiteeGistLog;
    logArr.push(`${chrome.i18n.getMessage(isGh ? "startCreateGithubGist" : "startCreateGiteeGist")}`);
    let headers = new Headers();
    headers.append("Authorization", "token " + (isGh ? githubGistToken : giteeGistToken));
    headers.append("Content-Type", "application/json");
    if (isGh) {
        headers.append("accept", "application/vnd.github+json");
    }
    let data = {"description": "NJ-Tab", "public": false, "files": {"NJ-Tab_Tabs.json": {"content": JSON.stringify(content)}}};
    let createStatus = 0;
    fetch((isGh ? gitHubApiUrl : giteeApiUrl) + "/gists", {method: "POST", headers: headers, body: JSON.stringify(data)})
        .then(function (r) { createStatus = r.status; return r.ok ? r.json() : null; })
        .catch(function () { return null; })
        .then(function (data2) {
            if (!data2 || !data2.id) {
                logArr.push(`${chrome.i18n.getMessage("createFailed")}` + (createStatus ? "（" + njHttpText(createStatus) + "）" : ""));
                njAutoFail(provider, "创建 Gist 失败" + (createStatus ? " " + njHttpText(createStatus) : ""));
                return;
            }
            if (isGh) { githubGistId = data2.id; } else { giteeGistId = data2.id; }
            let obj = {};
            obj[isGh ? "githubGistId" : "giteeGistId"] = data2.id;
            chrome.storage.local.set(obj);
            logArr.push(`${chrome.i18n.getMessage("createSuccess")}`);
            logArr.push(`${chrome.i18n.getMessage("getGistIdAndSaved")}`);
            // 新 Gist 刚建好：清掉旧的已推送指纹，避免无变化跳过让状态与指纹不落盘；再走一次更新推送收尾
            chrome.storage.local.remove(isGh ? "gistAutoHashGithub" : "gistAutoHashGitee", function () {
                njAutoProceedWithContent(provider, content);
            });
        });
}

// 判断是否已经保存了github的gistId
// 判断一个 Gist 是不是新版自己的（描述 NJ-Tab 或含新版文件）；旧版（描述 myCloudSkyMonster / 只有 brower_Tabs.json）返回 false
function njGistIsNew(data) {
    if (!data) return false;
    if (data.description === "NJ-Tab") return true;
    return !!(data.files && data.files["NJ-Tab_Tabs.json"]);
}

function isStoredGithubGistIdLocal(action) {
    console.log("是否已经保存了github的gistId")
    handleGithubGistLog.push(`${chrome.i18n.getMessage("startCheckGistIdSaved")}`)
    chrome.storage.local.get("githubGistId", function (storage) {
        if (storage.githubGistId) {
            console.log("已经保存了github的gistId")
            handleGithubGistLog.push(`${chrome.i18n.getMessage("gistIdSaved")}`)
            githubGistId = storage.githubGistId;
            if (action === "push_github") {
                // 4.4 需求一：编号可能是 3.1 旧 Gist 的——先读回核对标识，是旧版的只读跳过，绝不更新
                let myHeaders = new Headers();
                myHeaders.append("Authorization", "token " + githubGistToken)
                myHeaders.append("accept", "application/vnd.github+json")
                fetch(gitHubApiUrl + "/gists/" + githubGistId, {method: 'GET', headers: myHeaders})
                    .then(response => { if (!response.ok) { handleGithubGistLog.push(`${chrome.i18n.getMessage("pullFailed")}（${njHttpText(response.status)}）`); } return response.ok ? response.json() : null; })
                    .catch(() => null)
                    .then(gistData => {
                        if (!njGistIsNew(gistData)) {
                            handleGithubGistLog.push(`${chrome.i18n.getMessage("gistOldReadOnly")}`)
                            // 4.6 修复：旧版编号只读不写（上面这条日志保留），但自动备份不能就此结束——
                            // 改走找新版 Gist / 新建流程，真正把备份推上去（原先直接结束却被显示成成功）
                            njAutoFindOrCreate("github");
                            return;
                        }
                        getShardings(function (callback) {
                            if (!callback || typeof callback == 'undefined') {
                                updateGithubGist([]);
                            } else {
                                njWithBackupSettings(callback, function (content) { njGistAutoMaybePush("github", content, updateGithubGist); });
                            }
                        })
                    });
            }
        } else {
            console.log("没有保存了github的gistId")
            handleGithubGistLog.push(`${chrome.i18n.getMessage("gistIdNoSaved")}`)
            if (action === "push_github") {
                // 4.6 修复：没编号不等于结束——找新版 Gist / 找不到就新建后再推送
                njAutoFindOrCreate("github");
            } else {
                njEndAutoPush("github");
            }
        }
    });
}

// 判断是否已经保存了gitee的gistId
function isStoredGiteeGistIdLocal(action) {
    console.log("是否已经保存了gitee的gistId")
    handleGiteeGistLog.push(`${chrome.i18n.getMessage("startCheckGistIdSaved")}`)
    chrome.storage.local.get("giteeGistId", function (storage) {
        if (storage.giteeGistId) {
            console.log("已经保存了gitee的gistId")
            handleGiteeGistLog.push(`${chrome.i18n.getMessage("gistIdSaved")}`)
            giteeGistId = storage.giteeGistId;
            if (action === "push_gitee") {
                // 4.4 需求一：同 GitHub——先核对标识，是旧版 Gist 的只读跳过
                let myHeaders = new Headers();
                myHeaders.append("Authorization", "token " + giteeGistToken)
                fetch(giteeApiUrl + "/gists/" + giteeGistId, {method: 'GET', headers: myHeaders})
                    .then(response => { if (!response.ok) { handleGiteeGistLog.push(`${chrome.i18n.getMessage("pullFailed")}（${njHttpText(response.status)}）`); } return response.ok ? response.json() : null; })
                    .catch(() => null)
                    .then(gistData => {
                        if (!njGistIsNew(gistData)) {
                            handleGiteeGistLog.push(`${chrome.i18n.getMessage("gistOldReadOnly")}`)
                            // 4.6 修复：同 GitHub——旧版只读，但改走找新版 / 新建流程真正推送
                            njAutoFindOrCreate("gitee");
                            return;
                        }
                        getShardings(function (callback) {
                            if (!callback || typeof callback == 'undefined') {
                                updateGiteeGist([]);
                            } else {
                                njWithBackupSettings(callback, function (content) { njGistAutoMaybePush("gitee", content, updateGiteeGist); });
                            }
                        })
                    });
            }
        } else {
            console.log("没有保存了gitee的gistId")
            handleGiteeGistLog.push(`${chrome.i18n.getMessage("gistIdNoSaved")}`)
            if (action === "push_gitee") {
                // 4.6 修复：没编号不等于结束——找新版 Gist / 找不到就新建后再推送
                njAutoFindOrCreate("gitee");
            } else {
                njEndAutoPush("gitee");
            }
        }
    });
}

// 更新github的gist
// 4.4 需求一：只更新新版自己的 Gist（调用前已核对标识）；不再做改名、删旧文件的迁移动作，旧版 Gist 永不写入
function updateGithubGist(content) {
    console.log("更新github的gist")
    handleGithubGistLog.push(`${chrome.i18n.getMessage("directUpdate")}`)
    let _content = JSON.stringify(content);
    let myHeaders = new Headers();
    myHeaders.append("Authorization", "token " + githubGistToken)
    myHeaders.append("accept", "application/vnd.github+json")
    myHeaders.append("Content-Type", "application/json");
    patchGithubGist({"NJ-Tab_Tabs.json": {"content": _content}}, myHeaders);
}

function patchGithubGist(files, myHeaders) {
    let data = {
        "description": "NJ-Tab", "public": false, "files": files
    }
    let requestOptions = {
        method: 'PATCH', headers: myHeaders, body: JSON.stringify(data),
    };

    fetch(gitHubApiUrl + "/gists/" + githubGistId, requestOptions)
        .then(response => {
            if (response.status === 200) {
                console.log("更新成功")
                handleGithubGistLog.push(`${chrome.i18n.getMessage("updateSuccess")}`)
                // 自动备份成功：落盘内容指纹和状态（手动触发时指纹为空，不影响）
                if (njPendingAutoHash.github) {
                    chrome.storage.local.set({gistAutoHashGithub: njPendingAutoHash.github});
                    njPendingAutoHash.github = null;
                }
                njSetGistAutoResult("github", "success");
                njLogEvent("gistAutoBackup", true, "GitHub");
            } else {
                console.log("更新失败")
                handleGithubGistLog.push(`${chrome.i18n.getMessage("updateFailed")}`)
                njPendingAutoHash.github = null;
                njSetGistAutoResult("github", "failed", njHttpText(response.status));
                if (response.status === 403 || response.status === 429) {
                    // 被限流必须单独记进日志（4.2 需求三/四）
                    handleGithubGistLog.push(`${chrome.i18n.getMessage("gistRateLimited")} ${njHttpText(response.status)}`)
                    njLogEvent("gistAutoBackupRateLimited", false, "GitHub " + njHttpText(response.status));
                } else {
                    njLogEvent("gistAutoBackup", false, "GitHub " + njHttpText(response.status));
                }
            }
        })
        .catch(error => {
            console.log('error', error)
            handleGithubGistLog.push(`${chrome.i18n.getMessage("updateFailed")}-->${error.toString()}`)
            njPendingAutoHash.github = null;
            njSetGistAutoResult("github", "failed", String(error && error.message || error));
            njLogEvent("gistAutoBackup", false, "GitHub " + String(error && error.message || error));
        })
        .finally(() => {
            console.log('Request completed');
            njEndAutoPush("github");
        });
}

// 更新gitee的gist
function updateGiteeGist(content) {
    console.log("更新gitee的gist")
    handleGiteeGistLog.push(`${chrome.i18n.getMessage("directUpdate")}`)
    let _content = JSON.stringify(content);
    let data = {
        "description": "NJ-Tab", "public": false, "files": {
            "NJ-Tab_Tabs.json": {"content": _content}
        }
    }
    let myHeaders = new Headers();
    myHeaders.append("Authorization", "token " + giteeGistToken)
    myHeaders.append("Content-Type", "application/json");
    let requestOptions = {
        method: 'PATCH', headers: myHeaders, body: JSON.stringify(data),
    };

    fetch(giteeApiUrl + "/gists/" + giteeGistId, requestOptions)
        .then(response => {
            console.log(response)
            if (response.status === 200) {
                console.log("更新成功")
                handleGiteeGistLog.push(`${chrome.i18n.getMessage("updateSuccess")}`)
                if (njPendingAutoHash.gitee) {
                    chrome.storage.local.set({gistAutoHashGitee: njPendingAutoHash.gitee});
                    njPendingAutoHash.gitee = null;
                }
                njSetGistAutoResult("gitee", "success");
                njLogEvent("gistAutoBackup", true, "Gitee");
            } else {
                console.log("更新失败")
                handleGiteeGistLog.push(`${chrome.i18n.getMessage("updateFailed")}`)
                njPendingAutoHash.gitee = null;
                njSetGistAutoResult("gitee", "failed", njHttpText(response.status));
                if (response.status === 403 || response.status === 429) {
                    handleGiteeGistLog.push(`${chrome.i18n.getMessage("gistRateLimited")} ${njHttpText(response.status)}`)
                    njLogEvent("gistAutoBackupRateLimited", false, "Gitee " + njHttpText(response.status));
                } else {
                    njLogEvent("gistAutoBackup", false, "Gitee " + njHttpText(response.status));
                }
            }
        })
        .catch(error => {
            console.log('error', error)
            handleGiteeGistLog.push(`${chrome.i18n.getMessage("updateFailed")}-->${error.toString()}`)
            njPendingAutoHash.gitee = null;
            njSetGistAutoResult("gitee", "failed", String(error && error.message || error));
            njLogEvent("gistAutoBackup", false, "Gitee " + String(error && error.message || error));
        })
        .finally(() => {
            // 请求完成时触发，无论成功还是失败
            console.log('Request completed');
            njEndAutoPush("gitee");
        });
}

// 构造操作gist的日志结构
// 4.6.6 审核补修：过程日志落盘也排队串行——两个仓库的自动推送常在同一刻收尾，
// 原写法各自「读出整表、插到最前、整表存回」会互相覆盖（GitHub 那条过程日志在南极实测里整条消失就是这么丢的）。
let njGistLogQueue = [];
let njGistLogWriting = false;
function setHandleGistLog(type, handleGistLog) {
    // 4.6.4 需求八：落盘时算好明确结果（成功/失败/已跳过），日志页直接用，不再靠关键词猜
    let njOk = true;
    if (handleGistLog.some(function (line) { return /失败|Failed|failed/.test(String(line)); })) { njOk = false; }
    else if (handleGistLog.some(function (line) { return /跳过|Skipped/.test(String(line)); })) { njOk = "skip"; }
    njGistLogQueue.push({id: genObjectId(), handleGistType: type, handleGistLogs: handleGistLog.slice(), ok: njOk});
    njPumpGistLogQueue();
}
function njPumpGistLogQueue() {
    if (njGistLogWriting) { return; }
    let map = njGistLogQueue.shift();
    if (!map) { return; }
    njGistLogWriting = true;
    chrome.storage.local.get(null, function (storage) {
        let newArr;
        if (storage.gistLog) {
            newArr = storage.gistLog;
            if (newArr.length >= 100) {
                newArr.splice(-1, 1)
            }
            newArr.unshift(map);
        } else {
            newArr = [map];
        }
        chrome.storage.local.set({gistLog: newArr}, function () {
            njGistLogWriting = false;
            njPumpGistLogQueue();
        });
    });
}

// 操作gist的全局状态，1分钟自动解锁，防止死锁
// 4.4 附带修复：忙碌标记按平台分开存（handleGithubGistStatus / handleGiteeGistStatus），
// 一个平台在忙不再挡住另一个平台的自动备份（旧的共用 handleGistStatus 不再写，只在打包时继续剔除）
function setHandleGistStatus(status, platform) {
    let expireTime = moment().add(1, 'minutes').format('YYYY-MM-DD HH:mm:ss');
    let gistStatusMap = {type: status, expireTime: expireTime};
    let obj = {};
    obj[platform === "gitee" ? "handleGiteeGistStatus" : "handleGithubGistStatus"] = gistStatusMap;
    chrome.storage.local.set(obj);
}

// 持续监听发送给background的消息
chrome.runtime.onMessage.addListener(function (req, sender, sendRes) {
    switch (req.action) {
        case 'save-all': // 保存所有tab
            if (req.tabsArr.length > 0) {
                saveTabs(req.tabsArr);
                openBackgroundPage();
                closeTabs(req.tabsArr);
            } else {
                openBackgroundPage();
            }
            sendRes('ok'); // acknowledge
            break;
        case 'openbackgroundpage': // 打开展示页
            openBackgroundPage();
            sendRes('ok'); // acknowledge
            break;
        case 'save-current': // 保存当前tab
            chrome.storage.local.get(function (storage) {
                let opts = storage.options
                let openBackgroundAfterSendTab = "yes"
                if (opts) {
                    openBackgroundAfterSendTab = opts.openBackgroundAfterSendTab || "yes"
                }
                if (req.tabsArr.length > 0) {
                    saveTabs(req.tabsArr);
                    if (openBackgroundAfterSendTab === "yes") {
                        openBackgroundPage();
                    }
                    closeTabs(req.tabsArr);
                } else {
                    if (openBackgroundAfterSendTab === "yes") {
                        openBackgroundPage();
                    }
                }
            })
            sendRes('ok'); // acknowledge
            break;
        case 'save-others': // 保存其他tab
            if (req.tabsArr.length > 0) {
                saveTabs(req.tabsArr);
                openBackgroundPage();
                closeTabs(req.tabsArr);
            } else {
                openBackgroundPage();
            }
            sendRes('ok'); // acknowledge
            break;
        default:
            sendRes('nope'); // acknowledge
            break;
    }
});

// 生成唯一标识
// refer: https://gist.github.com/solenoid/1372386
let genObjectId = function () {
    let timestamp = (new Date().getTime() / 1000 | 0).toString(16);
    return timestamp + 'xxxxxxxxxxxxxxxx'.replace(/[x]/g, function () {
        return (Math.random() * 16 | 0).toString(16);
    }).toLowerCase();
};

// makes a tab group, filters it and saves it to localStorage
function saveTabs(tabsArr) {
    let tabGroup = makeTabGroup(tabsArr), cleanTabGroup = filterTabGroup(tabGroup);

    saveTabGroup(cleanTabGroup);
}

// from the array of Tab objects it makes an object with date and the array
function makeTabGroup(tabsArr) {
    let date;
    date = dateFormat("YYYY-mm-dd HH:MM:SS", new Date());
    let tabGroup = {
        date: date, id: genObjectId() // clever way to quickly get a unique ID
    };
    // 4.3 需求四：标签带自己的添加时间 addTime——已有的原样保留，没有的用本组生成时刻补上
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

// filters tabGroup
function filterTabGroup(tabGroup) {
    for (let i = 0; i < tabGroup.tabs.length; i++) {
        let title = tabGroup.tabs[i].title
        if (typeof title === "string" && title) {
            tabGroup.tabs[i].title = title.replace(emojiReg, "");
        }
    }
    return tabGroup;
}

// saves array (of Tab objects) to localStorage
function saveTabGroup(tabGroup) {
    getShardings(function (callback) {
        if (callback || typeof callback != 'undefined' || callback !== undefined) {
            if (!callback.tabGroups || typeof callback.tabGroups == 'undefined') {
                saveShardings([tabGroup], "object");
            } else {
                let newArr = callback.tabGroups;
                // 判断是否有置顶，有置顶的话，新元素要放到所有置顶后面
                let flag = false
                for (let i = 0; i < newArr.length; i++) {
                    const currentElement = newArr[i];
                    if (currentElement.isPined === undefined || currentElement.isPined === false) {
                        newArr.splice(i, 0, tabGroup);
                        flag = true
                        break;
                    }
                }
                // 如果所有元素都是已固定的，则将新元素添加到数组末尾
                if (!flag) {
                    newArr.push(tabGroup);
                }
                saveShardings(newArr, "object");
            }
        } else {
            saveShardings([tabGroup], "object");
        }
    })
}

// 打开background页
// 4.3 需求三：查已打开的管理页时只认本扩展自己的（带上 runtime.id），
// 避免商店版 3.1 与开发版 4.x 同时装时互相抢占对方的管理页
function openBackgroundPage() {
    let pinnedTabsCount = 0
    // 查询当前窗口的所有标签页
    chrome.tabs.query({currentWindow: true}, function (tabs) {
        // 统计固定标签的数量
        pinnedTabsCount = tabs.filter(tab => tab.pinned).length;
    });
    chrome.tabs.query({url: "chrome-extension://" + chrome.runtime.id + "/nj-workbench.html*", currentWindow: true}, function (tab) {
        if (tab.length >= 1) {
            chrome.tabs.move(tab[0].id, {index: 0}, function callback() {
                chrome.tabs.update(tab[0].id, {highlighted: true});
            });
            chrome.tabs.reload(tab[0].id, {}, function (tab) {
            });
        } else {
            chrome.tabs.create({index: 0, url: chrome.runtime.getURL('nj-workbench.html')});
        }
    });
}

// 暗地里刷新background页
function reloadBackgroundPage() {
    chrome.tabs.query({url: "chrome-extension://" + chrome.runtime.id + "/nj-workbench.html*", currentWindow: true}, function (tab) {
        if (tab.length >= 1) {
            chrome.tabs.reload(tab[0].id, {}, function (tab) {
            });
        }
    });
}

// close all the tabs in the provided array of Tab objects
function closeTabs(tabsArr) {
    let tabsToClose = [], i;

    for (i = 0; i < tabsArr.length; i += 1) {
        tabsToClose.push(tabsArr[i].id);
    }

    chrome.tabs.remove(tabsToClose, function () {
        if (chrome.runtime.lastError) {
            console.error(chrome.runtime.lastError);
        }
    });
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

// 用分片的思路去存storage
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

// 获取storage里的标签相关数据
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
        if (!tabGroupsStr && typeof items["tabGroups_0"] === "string") {
            // 4.6.4.1 审查修复：计数键丢失时按连续分片重建，避免已有数据被读成空、进而空备份覆盖远端
            let njShardN = 0;
            while (typeof items["tabGroups_" + njShardN] === "string") { njShardN++; }
            for (let njShardI = 0; njShardI < njShardN; njShardI++) { tabGroupsStr += items["tabGroups_" + njShardI]; delete items["tabGroups_" + njShardI]; }
        }
        let delTabGroupsStr = "";
        if (items.del_tabGroups_num >= 1) {
            // 把分片数据组成字符串
            for (let i = 0; i < items.del_tabGroups_num; i++) {
                delTabGroupsStr += items["del_tabGroups_" + i];
                delete items["del_tabGroups_" + i]
            }
        }
        if (!delTabGroupsStr && typeof items["del_tabGroups_0"] === "string") {
            let njShardN2 = 0;
            while (typeof items["del_tabGroups_" + njShardN2] === "string") { njShardN2++; }
            for (let njShardI2 = 0; njShardI2 < njShardN2; njShardI2++) { delTabGroupsStr += items["del_tabGroups_" + njShardI2]; delete items["del_tabGroups_" + njShardI2]; }
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
            try { items["tabGroups"] = JSON.parse(tabGroupsStr); } catch (e) { items["tabGroups"] = []; } // 4.6.4.1 审查修复：分片损坏时不中断
        }
        if (delTabGroupsStr.length > 0) {
            try { items["delTabGroups"] = JSON.parse(delTabGroupsStr); } catch (e) { items["delTabGroups"] = []; } // 4.6.4.1 审查修复：分片损坏时不中断
        }
        cb(items)
    });
}

// ===== WebDAV 多版本自动备份（阶段4）=====
// 4.2 需求三：备份包含配置（白名单与 workbench.js 保持一致；WebDAV 连接信息与凭据永不进备份）
const NJ_BACKUP_SETTING_KEYS = ["themeMode", "options", "dragType", "autoSync", "delRetentionDays", "webdavAutoBackup", "webdavIntervalHours", "webdavKeepDays", "webdavKeepCount", "gistAutoEnabled", "gistAutoIntervalMinutes", "logAutoCleanEnabled", "logKeepDays", "logKeepCount"];

function njPickBackupSettings(source) {
    let out = {};
    if (!source || typeof source !== "object") { return out; }
    NJ_BACKUP_SETTING_KEYS.forEach(function (key) {
        if (typeof source[key] !== "undefined") { out[key] = source[key]; }
    });
    return out;
}

function njWithBackupSettings(content, fn) {
    if (!content || typeof content !== "object" || Array.isArray(content)) { fn(content); return; }
    chrome.storage.local.get(NJ_BACKUP_SETTING_KEYS, function (items) {
        let picked = njPickBackupSettings(items || {});
        if (Object.keys(picked).length) { content.settings = picked; }
        fn(content);
    });
}

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

function njWebdavAuthHeader(user, password) {
    let raw = String(user || "") + ":" + String(password || "");
    let bytes = new TextEncoder().encode(raw);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return "Basic " + btoa(binary);
}

function njWebdavFileUrl(baseUrl, fileName) {
    let base = String(baseUrl || "").trim().replace(/\/+$/, "");
    let file = String(fileName || "").trim().replace(/^\/+/, "") || "NJ-Tab-Backup.json";
    let encodedFile = file.split("/").map(function (seg) {
        return encodeURIComponent(seg);
    }).join("/");
    return base + "/" + encodedFile;
}

function njCleanupWebdavVersions(cfg, keepDays, keepCount, protectName) {
    let body = '<?xml version="1.0" encoding="utf-8"?><propfind xmlns="DAV:"><prop><displayname/></prop></propfind>';
    fetch(cfg.webdavUrl, {
        method: "PROPFIND",
        credentials: "omit",
        headers: {
            "Authorization": njWebdavAuthHeader(cfg.webdavUser, cfg.webdavPass),
            "Depth": "1",
            "Content-Type": "application/xml; charset=utf-8"
        },
        body: body
    }).then(function (resp) {
        if (!resp.ok) { throw new Error(njWebdavHttpText(resp.status)); }
        return resp.text();
    }).then(function (text) {
        let dels = njPickDeletions(njParseVersionNames(text), keepDays, keepCount, protectName, Date.now());
        if (dels.length) { njLogEvent("webdavCleanup", true, dels.length + ""); }
        dels.forEach(function (name) {
            fetch(njWebdavFileUrl(cfg.webdavUrl, name), {
                method: "DELETE",
                credentials: "omit",
                headers: {"Authorization": njWebdavAuthHeader(cfg.webdavUser, cfg.webdavPass)}
            }).catch(function () {});
        });
    }).catch(function () {});
}

// 自动备份检查：开关开着、已配置地址、且距上次成功备份超过设定间隔时，把本地数据作为新版本上传；只上传、从不覆盖本地
function checkWebdavAutoBackup() {
    chrome.storage.local.get(["webdavUrl", "webdavUser", "lastWebdavBackupAt"].concat(NJ_BACKUP_SETTING_KEYS), function (st) {
        if (!st.webdavAutoBackup || !st.webdavUrl) { return; }
        let intervalMs = (parseFloat(st.webdavIntervalHours) || 6) * 3600000;
        if (Date.now() - (st.lastWebdavBackupAt || 0) < intervalMs) { return; }
        njLoadSecretField("webdavPass", function (pass) {
            getShardings(function (items) {
                let backup = {
                    app: "NJ-Tab",
                    formatVersion: 1,
                    appVersion: chrome.runtime.getManifest().version,
                    exportedAt: new Date().toISOString(),
                    tabGroups: Array.isArray(items.tabGroups) ? items.tabGroups : [],
                    delTabGroups: Array.isArray(items.delTabGroups) ? items.delTabGroups : [],
                    settings: njPickBackupSettings(st)
                };
                let fileName = njVersionFileName(new Date());
                fetch(njWebdavFileUrl(st.webdavUrl, fileName), {
                    method: "PUT",
                    credentials: "omit",
                    headers: {
                        "Authorization": njWebdavAuthHeader(st.webdavUser || "", pass || ""),
                        "Content-Type": "application/json; charset=utf-8"
                    },
                    body: JSON.stringify(backup)
                }).then(function (resp) {
                    if (!resp.ok) { throw new Error(njWebdavHttpText(resp.status)); }
                    chrome.storage.local.set({lastWebdavBackupAt: Date.now()});
                    njLogEvent("webdavAutoBackup", true, fileName);
                    njCleanupWebdavVersions(
                        {webdavUrl: st.webdavUrl, webdavUser: st.webdavUser || "", webdavPass: pass || ""},
                        st.webdavKeepDays === undefined ? 30 : st.webdavKeepDays,
                        st.webdavKeepCount === undefined ? 10 : st.webdavKeepCount,
                        fileName);
                }).catch(function (err) {
                    console.log("WebDAV 自动备份失败", err);
                    njLogEvent("webdavAutoBackup", false, njWebdavErrText(err));
                });
            });
        });
    });
}

// 持续监听，假如锁屏或者睡眠就清空定时任务，激活再重新定时任务
chrome.idle.onStateChanged.addListener(function (newState) {
    console.log(newState)
    if (newState === "active") {
        if (isLock) {
            chrome.alarms.create("checkAutoSyncGitee", {delayInMinutes: 5, periodInMinutes: 5});
            chrome.alarms.create("checkAutoSyncGithub", {delayInMinutes: 5, periodInMinutes: 5});
chrome.alarms.create("checkWebdavAutoBackup", {delayInMinutes: 60, periodInMinutes: 60});
            isLock = false;
        }
    }
    if (newState === "locked") {
        isLock = true;
        chrome.alarms.clearAll(function (wasCleared) {
            console.log(wasCleared)
        });
    }
    chrome.alarms.getAll(function (alarms) {
        console.log(alarms)
    });
});

// 持续监听响应定时任务
chrome.alarms.onAlarm.addListener(function (alarm) {
    if (alarm.name === "checkAutoSyncGitee") {
        console.log("自动同步gitee")
        checkAutoSyncGitee();
    }
    if (alarm.name === "checkAutoSyncGithub") {
        console.log("自动同步github")
        checkAutoSyncGithub();
    }
    if (alarm.name === "checkWebdavAutoBackup") {
        checkWebdavAutoBackup();
    }
    if (alarm.name === "inTimeSync") {
        // console.log("实时同步触发")
        subtractAll()

        setTimer('inTimeSync', 3 * 1000);
    }
});

// 持续监听是否按了manifest设置的快捷键
chrome.commands.onCommand.addListener(function (command) {
    if (command === "toggle-feature-save-all") {
        chrome.storage.local.get(function (storage) {
            chrome.tabs.query({
                url: ["https://*/*", "http://*/*", "chrome://*/*", "file://*/*"], currentWindow: true
            }, function (tabs) {
                var tabsArr = tabs.filter(function (tab) {
                    return !tab.pinned;
                });
                let opts = storage.options
                let openBackgroundAfterSendTab = "yes"
                if (opts) {
                    openBackgroundAfterSendTab = opts.openBackgroundAfterSendTab || "yes"
                }
                saveTabs(tabsArr);
                if (openBackgroundAfterSendTab === "yes") {
                    openBackgroundPage();
                } else {
                    reloadBackgroundPage()
                }
                closeTabs(tabsArr);
            });
        });
    }
    if (command === "toggle-feature-save-current") {
        chrome.storage.local.get(function (storage) {
            chrome.tabs.query({
                url: ["https://*/*", "http://*/*", "chrome://*/*", "file://*/*"], highlighted: true, currentWindow: true
            }, function (tabs) {
                var tabsArr = tabs.filter(function (tab) {
                    return !tab.pinned;
                });
                let opts = storage.options
                let openBackgroundAfterSendTab = "yes"
                if (opts) {
                    openBackgroundAfterSendTab = opts.openBackgroundAfterSendTab || "yes"
                }
                if (tabsArr.length > 0) {
                    saveTabs(tabsArr);
                    if (openBackgroundAfterSendTab === "yes") {
                        openBackgroundPage();
                    } else {
                        reloadBackgroundPage()
                    }
                    closeTabs(tabsArr);
                } else {
                    if (openBackgroundAfterSendTab === "yes") {
                        openBackgroundPage();
                    } else {
                        reloadBackgroundPage()
                    }
                }
            });
        })
    }

});

// 持续监听storage是否修改
chrome.storage.onChanged.addListener(function (changes, areaName) {
    let flag = false;
    console.log(changes)
    console.log(areaName)
    for (let key in changes) {
        if (key.indexOf("tabGroups") !== -1 || key.indexOf("del_tabGroups") !== -1) {
            console.log(key)
            if (key.indexOf("tabGroups_num") === -1 || key.indexOf("del_tabGroups_num") === -1) {
                flag = true;
            }
        }
    }
    if (areaName === "local" && flag) {
        // 4.5 需求六：取消「修改后自动同步」——数据变化不再触发推送；
        // 自动备份只按 Gist 页设定的频率，由闹钟 checkAutoSyncGithub/checkAutoSyncGitee 定时执行。
        console.log("数据有变化（不再触发自动同步，等定时自动备份）")
    } else {
        console.log("不要同步")
    }
});

// Add a listener to create the initial context menu items,
// context menu items only need to be created at runtime.onInstalled
chrome.runtime.onInstalled.addListener(async () => {
    // 发送当前标签
    chrome.contextMenus.create({
        id: "sendCurrentTab", title: `${chrome.i18n.getMessage("sendCurrentTab")}`, contexts: ["all"]
    });

    // 打开后台管理页
    chrome.contextMenus.create({
        id: "showAllTabs", title: `${chrome.i18n.getMessage("showAllTabs")}`, contexts: ["all"]
    });

    // 发送所有标签
    chrome.contextMenus.create({
        id: "sendAllTabs", title: `${chrome.i18n.getMessage("sendAllTabs")}`, contexts: ["all"]
    });

    // 发送其他标签
    chrome.contextMenus.create({
        id: "sendOtherTabs", title: `${chrome.i18n.getMessage("sendOtherTabs")}`, contexts: ["all"]
    });

    // 发送左侧标签页
    chrome.contextMenus.create({
        id: "sendLeftTabs", title: `${chrome.i18n.getMessage("sendLeftTabs")}`, contexts: ["all"]
    });

    // 发送右侧标签页
    chrome.contextMenus.create({
        id: "sendRightTabs", title: `${chrome.i18n.getMessage("sendRightTabs")}`, contexts: ["all"]
    });

});

// 持续监听菜单栏的点击
chrome.contextMenus.onClicked.addListener(function (info, tab) {
    console.log(info, tab);
    switch (info.menuItemId) {
        case "sendCurrentTab":
            chrome.storage.local.get(function (storage) {
                chrome.tabs.query({
                    url: ["https://*/*", "http://*/*", "chrome://*/*", "file://*/*"],
                    highlighted: true,
                    currentWindow: true
                }, function (tabs) {
                    var tabsArr = tabs.filter(function (tab) {
                        return !tab.pinned;
                    });
                    let opts = storage.options
                    let openBackgroundAfterSendTab = "yes"
                    if (opts) {
                        openBackgroundAfterSendTab = opts.openBackgroundAfterSendTab || "yes"
                    }
                    if (tabsArr.length > 0) {
                        saveTabs(tabsArr);
                        if (openBackgroundAfterSendTab === "yes") {
                            openBackgroundPage();
                        } else {
                            reloadBackgroundPage()
                        }
                        closeTabs(tabsArr);
                    } else {
                        if (openBackgroundAfterSendTab === "yes") {
                            openBackgroundPage();
                        } else {
                            reloadBackgroundPage()
                        }
                    }

                });
            });
            break
        case 'showAllTabs':
            openBackgroundPage();
            break;
        case 'sendAllTabs':
            chrome.storage.local.get(function (storage) {
                let opts = storage.options
                let openBackgroundAfterSendTab = "yes"
                if (opts) {
                    openBackgroundAfterSendTab = opts.openBackgroundAfterSendTab || "yes"
                }
                chrome.tabs.query({
                    url: ["https://*/*", "http://*/*", "chrome://*/*", "file://*/*"], currentWindow: true
                }, function (tabs) {
                    var req = tabs.filter(function (tab) {
                        return !tab.pinned;
                    });
                    if (req.length > 0) {
                        saveTabs(req);
                        if (openBackgroundAfterSendTab === "yes") {
                            openBackgroundPage();
                        } else {
                            reloadBackgroundPage()
                        }
                        closeTabs(req);
                    } else {
                        if (openBackgroundAfterSendTab === "yes") {
                            openBackgroundPage();
                        } else {
                            reloadBackgroundPage()
                        }
                    }
                });
            });
            break;
        case 'sendLeftTabs':
            chrome.storage.local.get(function (storage) {
                let opts = storage.options
                let openBackgroundAfterSendTab = "yes"
                if (opts) {
                    openBackgroundAfterSendTab = opts.openBackgroundAfterSendTab || "yes"
                }
                chrome.tabs.query({
                    url: ["https://*/*", "http://*/*", "chrome://*/*", "file://*/*"], currentWindow: true
                }, function (tabs) {
                    var reqs = tabs.filter(function (tab) {
                        return !tab.pinned;
                    });
                    let req = []
                    for (let i = 0; i < reqs.length; i++) {
                        if (reqs[i].active) {
                            break;
                        }
                        req.push(reqs[i]);
                    }
                    if (req.length > 0) {
                        saveTabs(req);
                        if (openBackgroundAfterSendTab === "yes") {
                            openBackgroundPage();
                        } else {
                            reloadBackgroundPage()
                        }
                        closeTabs(req);
                    } else {
                        if (openBackgroundAfterSendTab === "yes") {
                            openBackgroundPage();
                        } else {
                            reloadBackgroundPage()
                        }
                    }
                });
            });
            break;
        case 'sendRightTabs':
            chrome.storage.local.get(function (storage) {
                let opts = storage.options
                let openBackgroundAfterSendTab = "yes"
                if (opts) {
                    openBackgroundAfterSendTab = opts.openBackgroundAfterSendTab || "yes"
                }
                chrome.tabs.query({
                    url: ["https://*/*", "http://*/*", "chrome://*/*", "file://*/*"], currentWindow: true
                }, function (tabs) {
                    let req = []
                    for (let i = tabs.length - 1; i >= 0; i--) {
                        if (tabs[i].active) {
                            break;
                        }
                        if (tabs[i].pinned) {
                            continue;
                        }
                        req.push(tabs[i]);
                    }
                    if (req.length > 0) {
                        saveTabs(req);
                        if (openBackgroundAfterSendTab === "yes") {
                            openBackgroundPage();
                        } else {
                            reloadBackgroundPage()
                        }
                        closeTabs(req);
                    } else {
                        if (openBackgroundAfterSendTab === "yes") {
                            openBackgroundPage();
                        } else {
                            reloadBackgroundPage()
                        }
                    }
                });
            });
            break;
        case 'sendOtherTabs':
            chrome.storage.local.get(function (storage) {
                let opts = storage.options
                let openBackgroundAfterSendTab = "yes"
                if (opts) {
                    openBackgroundAfterSendTab = opts.openBackgroundAfterSendTab || "yes"
                }
                chrome.tabs.query({
                    url: ["https://*/*", "http://*/*", "chrome://*/*", "file://*/*"],
                    highlighted: false,
                    currentWindow: true
                }, function (tabs) {
                    var req = tabs.filter(function (tab) {
                        return !tab.pinned;
                    });
                    if (req.length > 0) {
                        saveTabs(req);
                        if (openBackgroundAfterSendTab === "yes") {
                            openBackgroundPage();
                        } else {
                            reloadBackgroundPage()
                        }
                        closeTabs(req);
                    } else {
                        if (openBackgroundAfterSendTab === "yes") {
                            openBackgroundPage();
                        } else {
                            reloadBackgroundPage()
                        }
                    }
                });
            });
            break;
        default:
            break;
    }
});

// 安全的数字操作类
class SafeNumberOperation {
    constructor() {
        this.lock = new Lock();
        this.value = 0;
    }

    // 安全+n
    async add(amount) {
        const unlock = await this.lock.acquire();

        try {
            this.value += amount;
            return this.value;
        } finally {
            unlock();
        }
    }

    // 安全-n
    async subtract(amount) {
        const unlock = await this.lock.acquire();

        try {
            this.value -= amount;
            return this.value;
        } finally {
            unlock();
        }
    }

    // 安全清零
    async subtractAll() {
        const unlock = await this.lock.acquire();

        try {
            const currentValue = this.value;
            this.value = 0;  // Subtracting all numbers
            return currentValue;
        } finally {
            unlock();
        }
    }

    // 获取当前值
    getValue() {
        return this.value;
    }
}

// 锁类
class Lock {
    constructor() {
        this.isLocked = false;
        this.waitQueue = [];
    }

    // 获取锁
    async acquire() {
        const acquirePromise = new Promise((resolve) => {
            const tryAcquire = () => {
                if (!this.isLocked) {
                    this.isLocked = true;
                    resolve(() => this.release());
                } else {
                    this.waitQueue.push(tryAcquire);
                }
            };

            tryAcquire();
        });

        return await acquirePromise;
    }

    // 释放锁
    release() {
        this.isLocked = false;

        if (this.waitQueue.length > 0) {
            const nextAcquire = this.waitQueue.shift();
            nextAcquire();
        }
    }
}

// new一个安全的数字操作类
const safeOperation = new SafeNumberOperation();

// 安全+1
async function add() {
    const result1 = await safeOperation.add(1);
    console.log('After adding 1:', result1);

    console.log('Current value:', safeOperation.getValue());
}

// 安全清零，清空storage连续变化导致的数字累加，并顺便推送到gist，相当于缓存了一部分后直接清空并推送
async function subtractAll() {
    const current = safeOperation.getValue();
    // console.log('Current value:', current);
    if (current > 0) {
        startPushToGiteeGist();
        await safeOperation.subtractAll();
        console.log('Current value after subtracting all:', safeOperation.getValue());
    }
}

// 设置定时器
function setTimer(key, delay) {
    const nextAlarmTime = Date.now() + delay; // delay时间后触发，单位毫秒
    chrome.alarms.create(key, {when: nextAlarmTime});
}
