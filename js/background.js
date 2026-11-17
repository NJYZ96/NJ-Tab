console.log("background is done!");

// 引入需要的库
importScripts("moment.min.js");
importScripts("axios.min.js");

let emojiReg = /[\uD83C|\uD83D|\uD83E][\uDC00-\uDFFF][\u200D|\uFE0F]|[\uD83C|\uD83D|\uD83E][\uDC00-\uDFFF]|[0-9|*|#]\uFE0F\u20E3|[0-9|#]\u20E3|[\u203C-\u3299]\uFE0F\u200D|[\u203C-\u3299]\uFE0F|[\u2122-\u2B55]|\u303D|[\A9|\AE]\u3030|\uA9|\uAE|\u3030/gi;
let handleGithubGistLog = [];
let handleGiteeGistLog = [];
let gitHubApiUrl = "https://api.github.com";
let giteeApiUrl = "https://gitee.com/api/v5";
let usedSeconds;
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

// 获取本机storage
chrome.storage.local.get(function (storage) {
    console.log(storage);
});

// 获取可同步storage
chrome.storage.sync.get(function (storage) {
    console.log(storage);
});

// 创建定时同步gitee任务，至于是否真的同步，要看设置
chrome.alarms.create("checkAutoSyncGitee", {delayInMinutes: 70, periodInMinutes: 70});

// 创建定时同步github任务，至于是否真的同步，要看设置
chrome.alarms.create("checkAutoSyncGithub", {delayInMinutes: 90, periodInMinutes: 90});
chrome.alarms.create("checkWebdavAutoBackup", {delayInMinutes: 60, periodInMinutes: 60});

// 检查是否同步github的gist
function checkAutoSyncGithub() {
    console.log("检查github是否同步")
    chrome.storage.local.get(null, function (items) {
        let autoSync = items.autoSync
        if (autoSync === true) {
            console.log("autoSync open")
            startPushToGithubGist();
        }
    });
}

// 检查是否同步gitee的gist
function checkAutoSyncGitee() {
    console.log("检查gitee是否同步")
    chrome.storage.local.get(null, function (items) {
        let autoSync = items.autoSync
        if (autoSync === true) {
            console.log("autoSync open")
            startPushToGiteeGist();
        }
    });
}

// 开始推送github的gist
function startPushToGithubGist() {
    console.log("开始推送github")
    handleGithubGistLog.length = 0;
    handleGithubGistLog.push(`${chrome.i18n.getMessage("start")}${moment().format('YYYY-MM-DD HH:mm:ss')}`);
    handleGithubGistLog.push(`${chrome.i18n.getMessage("autoPushToGithubGist")}`)
    chrome.storage.local.get(null, function (storage) {
        console.log(storage.handleGistStatus);
        if (storage.handleGistStatus) {
            console.log("handleGistStatus有值");
            if (storage.handleGistStatus.type === "IDLE") {
                pushToGithubGist();
            } else {
                let time = moment().format('YYYY-MM-DD HH:mm:ss');
                let expireTime = storage.handleGistStatus.expireTime;
                console.log(expireTime)
                if (time > expireTime) {
                    pushToGithubGist();
                } else {
                    handleGithubGistLog.push(storage.handleGistStatus.type)
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
        console.log(storage.handleGistStatus);
        if (storage.handleGistStatus) {
            console.log("handleGistStatus有值");
            if (storage.handleGistStatus.type === "IDLE") {
                pushToGiteeGist();
            } else {
                let time = moment().format('YYYY-MM-DD HH:mm:ss');
                let expireTime = storage.handleGistStatus.expireTime;
                console.log(expireTime)
                if (time > expireTime) {
                    pushToGiteeGist();
                } else {
                    handleGiteeGistLog.push(storage.handleGistStatus.type)
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
    setHandleGistStatus(`${chrome.i18n.getMessage("pushToGithubGistIng")}`);
    usedSeconds = 0;
    pushToGithubGistStatus = `${chrome.i18n.getMessage("startPushToGithubGistTask")}`;
    handleGithubGistLog.push(`${chrome.i18n.getMessage("startPushToGithubGistTask")}`)
    if (typeof (pushToGithubGistStatus) != "undefined") {
        githubIntervalId = setInterval(function () {
            if (typeof (pushToGithubGistStatus) != "undefined") {
                usedSeconds++;
            } else {
                clearInterval(githubIntervalId);
                handleGithubGistLog.push(`${usedSeconds}${chrome.i18n.getMessage("secondWait")}`)
                handleGithubGistLog.push(`${chrome.i18n.getMessage("endPushToGithubGistTask")}`)
                handleGithubGistLog.push(`${chrome.i18n.getMessage("end")}${moment().format('YYYY-MM-DD HH:mm:ss')}`);
                setHandleGistStatus("IDLE");
                setHandleGistLog(`${chrome.i18n.getMessage("autoPushGithub")}`, handleGithubGistLog);
            }
        }, 1000);
        console.log(githubIntervalId)
        isStoredGithubTokenLocal("push_github");
    }
}

// 推送到gitee的gist
function pushToGiteeGist() {
    console.log("推送gitee")
    setHandleGistStatus(`${chrome.i18n.getMessage("pushToGiteeGistIng")}`);
    usedSeconds = 0;
    pushToGiteeGistStatus = `${chrome.i18n.getMessage("startPushToGiteeGistTask")}`;
    handleGiteeGistLog.push(`${chrome.i18n.getMessage("startPushToGiteeGistTask")}`)
    if (typeof (pushToGiteeGistStatus) != "undefined") {
        giteeIntervalId = setInterval(function () {
            if (typeof (pushToGiteeGistStatus) != "undefined") {
                usedSeconds++;
            } else {
                clearInterval(giteeIntervalId);
                handleGiteeGistLog.push(`${usedSeconds}${chrome.i18n.getMessage("secondWait")}`)
                handleGiteeGistLog.push(`${chrome.i18n.getMessage("endPushToGiteeGistTask")}`)
                handleGiteeGistLog.push(`${chrome.i18n.getMessage("end")}${moment().format('YYYY-MM-DD HH:mm:ss')}`);
                setHandleGistStatus("IDLE");
                setHandleGistLog(`${chrome.i18n.getMessage("autoPushGitee")}`, handleGiteeGistLog);
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
    return njGetKey().then(function (key) {
        return crypto.subtle.decrypt({name: "AES-GCM", iv: njB64decode(v.iv)}, key, njB64decode(v.ct)).then(function (buf) {
            return new TextDecoder().decode(buf);
        }).catch(function () { return ""; });
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
            pushToGithubGistStatus = undefined;
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
            pushToGiteeGistStatus = undefined;
        }
    });
}

// 判断是否已经保存了github的gistId
function isStoredGithubGistIdLocal(action) {
    console.log("是否已经保存了github的gistId")
    handleGithubGistLog.push(`${chrome.i18n.getMessage("startCheckGistIdSaved")}`)
    chrome.storage.local.get("githubGistId", function (storage) {
        if (storage.githubGistId) {
            console.log("已经保存了github的gistId")
            handleGithubGistLog.push(`${chrome.i18n.getMessage("gistIdSaved")}`)
            githubGistId = storage.githubGistId;
            if (action === "push_github") {
                getShardings(function (callback) {
                    if (!callback || typeof callback == 'undefined') {
                        updateGithubGist([]);
                    } else {
                        updateGithubGist(callback);
                    }
                })
            }
        } else {
            console.log("没有保存了github的gistId")
            handleGithubGistLog.push(`${chrome.i18n.getMessage("gistIdNoSaved")}`)
            pushToGithubGistStatus = undefined;
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
                getShardings(function (callback) {
                    if (!callback || typeof callback == 'undefined') {
                        updateGiteeGist([]);
                    } else {
                        updateGiteeGist(callback);
                    }
                })
            }
        } else {
            console.log("没有保存了gitee的gistId")
            handleGiteeGistLog.push(`${chrome.i18n.getMessage("gistIdNoSaved")}`)
            pushToGiteeGistStatus = undefined;
        }
    });
}

// 更新github的gist
// 一次性迁移：先读回这个 Gist 确认旧文件在不在；同一次更新里写新文件、改新描述、删旧文件（先读到旧数据才改名，顺序不能反）
function updateGithubGist(content) {
    console.log("更新github的gist")
    handleGithubGistLog.push(`${chrome.i18n.getMessage("directUpdate")}`)
    let _content = JSON.stringify(content);
    let myHeaders = new Headers();
    myHeaders.append("Authorization", "token " + githubGistToken)
    myHeaders.append("accept", "application/vnd.github+json")
    myHeaders.append("Content-Type", "application/json");
    fetch(gitHubApiUrl + "/gists/" + githubGistId, {method: 'GET', headers: myHeaders})
        .then(response => response.ok ? response.json() : null)
        .catch(() => null)
        .then(gistData => {
            let files = {"NJ-Tab_Tabs.json": {"content": _content}};
            if (gistData && gistData.files && gistData.files['brower_Tabs.json']) {
                files['brower_Tabs.json'] = null;
            }
            patchGithubGist(files, myHeaders);
        });
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
            } else {
                console.log("更新失败")
                handleGithubGistLog.push(`${chrome.i18n.getMessage("updateFailed")}`)
            }
        })
        .catch(error => {
            console.log('error', error)
            handleGithubGistLog.push(`${chrome.i18n.getMessage("updateFailed")}-->${error.toString()}`)
        })
        .finally(() => {
            console.log('Request completed');
            pushToGithubGistStatus = undefined;
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
                console.log(response.json())
                handleGiteeGistLog.push(`${chrome.i18n.getMessage("updateSuccess")}`)
            } else {
                console.log("更新失败")
                handleGiteeGistLog.push(`${chrome.i18n.getMessage("updateFailed")}`)
            }
        })
        .catch(error => {
            console.log('error', error)
            handleGiteeGistLog.push(`${chrome.i18n.getMessage("updateFailed")}-->${error.toString()}`)
        })
        .finally(() => {
            // 请求完成时触发，无论成功还是失败
            console.log('Request completed');
            pushToGiteeGistStatus = undefined;
        });
}

// 构造操作gist的日志结构
function setHandleGistLog(type, handleGistLog) {
    let handleGistLogMap = {id: genObjectId(), handleGistType: type, handleGistLogs: handleGistLog};
    chrome.storage.local.get(null, function (storage) {
        if (storage.gistLog) {
            console.log("gistLog有值");
            if (storage.gistLog.length >= 100) {
                let newArr = storage.gistLog;
                newArr.splice(-1, 1)
                newArr.unshift(handleGistLogMap);
                chrome.storage.local.set({gistLog: newArr});
            } else {
                let newArr = storage.gistLog;
                newArr.unshift(handleGistLogMap);
                chrome.storage.local.set({gistLog: newArr});
            }
        } else {
            console.log("gistLog没有值，第一次");
            chrome.storage.local.set({gistLog: [handleGistLogMap]});
        }
    });
}

// 操作gist的全局状态，1分钟自动解锁，防止死锁
function setHandleGistStatus(status) {
    let expireTime = moment().add(1, 'minutes').format('YYYY-MM-DD HH:mm:ss');
    let gistStatusMap = {type: status, expireTime: expireTime};
    chrome.storage.local.set({handleGistStatus: gistStatusMap});
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
    let res = tabsArr.map(({title, url}) => ({title, url}));
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
        if (title && typeof (title) !== undefined) {
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
function openBackgroundPage() {
    let pinnedTabsCount = 0
    // 查询当前窗口的所有标签页
    chrome.tabs.query({currentWindow: true}, function (tabs) {
        // 统计固定标签的数量
        pinnedTabsCount = tabs.filter(tab => tab.pinned).length;
    });
    chrome.tabs.query({url: "chrome-extension://*/workbench.html*", currentWindow: true}, function (tab) {
        if (tab.length >= 1) {
            chrome.tabs.move(tab[0].id, {index: 0}, function callback() {
                chrome.tabs.update(tab[0].id, {highlighted: true});
            });
            chrome.tabs.reload(tab[0].id, {}, function (tab) {
            });
        } else {
            chrome.tabs.create({index: 0, url: chrome.runtime.getURL('workbench.html')});
        }
    });
}

// 暗地里刷新background页
function reloadBackgroundPage() {
    chrome.tabs.query({url: "chrome-extension://*/workbench.html*", currentWindow: true}, function (tab) {
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

// ===== WebDAV 多版本自动备份（阶段4）=====
// 版本文件名 njtab-backup-YYYYMMDD-HHmmss.json（本地时间）；只认这个命名规则，远端其他文件一律不碰
function njVersionFileName(d) {
    function p(n) { return (n < 10 ? "0" : "") + n; }
    return "njtab-backup-" + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) + ".json";
}

function njVersionTime(name) {
    let m = /^njtab-backup-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.json$/.exec(name || "");
    if (!m) { return null; }
    return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
}

function njParseVersionNames(text) {
    let found = {};
    let re = /njtab-backup-\d{8}-\d{6}\.json/g;
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
    let file = String(fileName || "").trim().replace(/^\/+/, "") || "njtab-backup.json";
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
        if (!resp.ok) { throw new Error("HTTP " + resp.status); }
        return resp.text();
    }).then(function (text) {
        let dels = njPickDeletions(njParseVersionNames(text), keepDays, keepCount, protectName, Date.now());
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
    chrome.storage.local.get(["webdavUrl", "webdavUser", "webdavAutoBackup", "webdavIntervalHours", "lastWebdavBackupAt", "webdavKeepDays", "webdavKeepCount"], function (st) {
        if (!st.webdavAutoBackup || !st.webdavUrl) { return; }
        let intervalMs = (parseFloat(st.webdavIntervalHours) || 24) * 3600000;
        if (Date.now() - (st.lastWebdavBackupAt || 0) < intervalMs) { return; }
        njLoadSecretField("webdavPass", function (pass) {
            getShardings(function (items) {
                let backup = {
                    app: "NJ-Tab",
                    formatVersion: 1,
                    appVersion: chrome.runtime.getManifest().version,
                    exportedAt: new Date().toISOString(),
                    tabGroups: Array.isArray(items.tabGroups) ? items.tabGroups : [],
                    delTabGroups: Array.isArray(items.delTabGroups) ? items.delTabGroups : []
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
                    if (!resp.ok) { throw new Error("HTTP " + resp.status); }
                    chrome.storage.local.set({lastWebdavBackupAt: Date.now()});
                    njCleanupWebdavVersions(
                        {webdavUrl: st.webdavUrl, webdavUser: st.webdavUser || "", webdavPass: pass || ""},
                        st.webdavKeepDays === undefined ? 30 : st.webdavKeepDays,
                        st.webdavKeepCount === undefined ? 10 : st.webdavKeepCount,
                        fileName);
                }).catch(function (err) {
                    console.log("WebDAV 自动备份失败", err);
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
            chrome.alarms.create("checkAutoSyncGitee", {delayInMinutes: 70, periodInMinutes: 70});
            chrome.alarms.create("checkAutoSyncGithub", {delayInMinutes: 90, periodInMinutes: 90});
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
        console.log("要同步")
        chrome.storage.local.get(null, async function (items) {
            let autoSync = items.autoSync
            if (autoSync === true) {
                console.log("autoSync open")
                // 有storage变化就安全数字+1，因为storage不知道底层是怎么实现的，一个set操作，可能会触发多次onChanged，会变相变成并发操作
                await add()
            }
        });
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
