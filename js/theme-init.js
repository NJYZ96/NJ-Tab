// 尽早给 <html> 打上 data-theme，减少暗黑模式下页面闪白。
// 这里只能同步读 localStorage 镜像（themeModeMirror，由 workbench.js 在每次设置主题时同步写入）；
// 读不到镜像时按 auto（跟随系统）处理，workbench.js 加载后会再按 chrome.storage 里的正式设置校正。
// 注意：扩展页面在 Manifest V3 下禁止内联脚本，这段逻辑必须放在外部文件里用 src 引入，否则会被 CSP 拦截。
(function () {
    var mode = "auto";
    try {
        mode = localStorage.getItem("themeModeMirror") || "auto";
    } catch (e) {
    }
    var dark = mode === "dark" || (mode !== "light" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
})();
