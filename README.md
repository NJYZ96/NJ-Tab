# NJ-Tab

**目录**
----
* [NJ-Tab](#NJ-Tab)
    * [背景介绍](#背景介绍)
    * [模拟使用场景](#模拟使用场景)
    * [支持多款浏览器](#支持多款浏览器)
    * [快速使用](#快速使用)
    * [安装方法](#安装方法)
    * [功能界面截图](#功能界面截图)
    * [获取token方法](#获取token方法)
    * [相对原项目（上游 N-Tab）的改进](#相对原项目上游-n-tab的改进)
    * [安全说明](#安全说明)
    * [To Do List](#to-do-list)
    * [Discussing](#discussing)
    * [感谢以下大神的肩膀](#感谢以下大神的肩膀)
    * [Star历史](#Star历史)


## 背景介绍

0. 本项目由上游 N-Tab 定制演进，现统一更名为 NJ-Tab
1. 本项目是一个Chrome插件
2. 经过4年时间自用，敢保证永不丢失数据，速度超快，可存储数据超多，绝对是效率提升工具！
3. OneTab的平替，OneTab丢过数据的举手集合！

## 模拟使用场景
- 打开了N多Tab，每一个都不想关闭，浏览器已经到了点不了的情况，怎么办？--->一键收集起来慢慢看
- 今天上班为了解决某个问题/寻找某个选题，打开了很多相关的网站，但是要下班了，要关电脑怎么办？--->一键收集起来第二天一键打开
- 很多常用要打开的网站，浏览器自带的标签栏都放不下了？--->直接收集起来，置顶锁定，省心省力
- 可以做任务优先级分类，**紧急的事**，**重要的事**，**紧急但不重要的事**，**重要但不紧急的事**--->或者完全自定义
- 可以做历史时间线回顾，看看一个星期前，一个月前，都在看什么资料，关注什么内容

## 支持多款浏览器
- 支持 Chrome、Edge 等 Chromium 内核浏览器；本插件暂未上架应用商店，请按下方「安装方法」从本仓库下载安装

## 快速使用

- **PS：** 不想看长篇大论的介绍和功能说明，直接看[安装方法](#安装方法)
- 点击插件图标，会打开后台管理页
- 在任何打开的网页（包括本地打开的文件，如PDF，视频，照片），空白处直接右键点击，找到NJ-Tab，有多种功能可选
- 在任何打开的网页（包括本地打开的文件，如PDF，视频，照片），按快捷键Ctrl+Q，可以**发送所有标签**
- 在任何打开的网页（包括本地打开的文件，如PDF，视频，照片），按快捷键Alt+Q，可以**发送当前标签**
- 如需要定时备份功能，请配置GitHub或Gitee的token，可二选一或全配置
- [查看全功能介绍（详细啰嗦版）](README_ALL.md)
- 本插件已内置暗黑模式和宽屏两列布局：点管理页顶栏的主题图标按钮即可轮换切换（白天 → 晚上 → 自动），默认是自动（跟随系统）

## 安装方法

1. 或者直接下载[最新的crx或zip](https://github.com/NJYZ96/NJ-Tab/releases)文件，右键选择解压缩到文件名，不要解压缩到当前目录，或者直接下载源码；

2. 打开Chrome浏览器或其他支持Chrome内核的浏览器，找到并点开“扩展程序”项；

3. 在打开的新页面中，勾选“开发者模式”，点击“加载已解压的拓展程序”按钮；

4. 从打开的“浏览文件夹”窗口中，选择第1步解压缩的的文件夹，点击“确定”按钮；

5. 此时该插件就正式启动了，观察浏览器右上角是否有新的插件图标，新版Chrome浏览器要手动固定才会显示。

6. 建议插件安装成功后，关闭开发者模式。

7. 现在就可以正常使用了，假如需要备份功能，先[获取GitHub和Gitee的token](#获取token方法)，在管理页顶栏的「Gist 备份」页里填写token（填完自动保存），并在同页打开“自动备份到 Gist”开关；

8. 2个备份平台，可以同时配置，也可以只配置1个，不冲突，假如选了自动备份，会自动无感知的**定时**备份到2个平台里（请先手动备份一次，通过查看日志，检查链路是否通顺），注意：Gitee特别设置了只要有修改就无感知自动**实时**备份，也就是说只要有修改，删除，移动等动作，就自动实时备份到Gitee，选Gitee更保险，真.理论上永不丢失数据。

## 功能界面截图
- 后台管理页面截图 ![1](https://scoful-picgo.oss-ap-southeast-1.aliyuncs.com/picgo/11.png)
- 备份功能截图![2](https://scoful-picgo.oss-ap-southeast-1.aliyuncs.com/picgo/22.png)
- 其他功能截图 ![3](https://scoful-picgo.oss-ap-southeast-1.aliyuncs.com/picgo/33.png)
- 回收站截图 ![4](https://scoful-picgo.oss-ap-southeast-1.aliyuncs.com/picgo/44.png)
- 暗黑模式截图 ![5](https://scoful-picgo.oss-ap-southeast-1.aliyuncs.com/picgo/55.png)
- 英文版截图 ![6](https://scoful-picgo.oss-ap-southeast-1.aliyuncs.com/picgo/11.png)

## 获取token方法
### Gitee
- 打开[Gitee](https://gitee.com/)，登录后
- 打开[私人令牌](https://gitee.com/profile/personal_access_tokens)
- 右上角生成新令牌，输入一个看起来有意义能明白啥用途的名字，比如： my-onetab-syncing-settings ，注意只勾选gist(可Ctrl+F搜索一下)，其他的不要勾选，
- 提交后，输入密码，生成后，要把显示的token另外找地方备份记录一下，只有在第一次创建的时候才会显示的，错过了只能重来。

### GitHub
- 打开[GitHub](https://github.com/)，登录后
- 打开[私人令牌](https://github.com/settings/tokens)
- 右上角选择Generate new token (classic)，输入一个看起来有意义能明白啥用途的名字，比如： my-onetab-syncing-settings ，注意只勾选gist(可Ctrl+F搜索一下)，其他的不要勾选，
- 提交后，输入密码，生成后，要把显示的token另外找地方备份记录一下，只有在第一次创建的时候才会显示的，错过了只能重来。


## 暗黑模式开启方法
- 本插件已内置暗黑模式：进入后台管理页，点顶栏的主题图标按钮即可轮换切换（太阳=白天、月亮=晚上、日月各半=自动），默认是自动（跟随系统），无需再改浏览器设置。

## 相对原项目（上游 N-Tab）的改进

NJ-Tab 在上游 N-Tab 3.1 的基础上做了两个版本的持续改进（4.1、4.2），主要变化如下：

**界面与操作**
- 顶部改成一整行独立功能行（学 OneTab 的排法：品牌在左、搜索框居中可伸缩、菜单入口在右以小字排两行），功能行在正常排版里实占一行、永不悬浮遮挡内容，中等宽度窗口下也不会再折行压住搜索框和页面顶部
- 菜单按功能重新分组，二级页面各归其位：Gist 备份页（令牌、推送/拉取、自动备份都在本页）、WebDAV 页（地址/账号/密码、连接测试、上传/恢复、自动备份都在本页）、导入/导出合并为一页、配置页（只放通用开关）、日志页
- 所有配置改完自动保存，不再有“保存配置”按钮
- 主题切换改成单个图标按钮轮换（白天 → 晚上 → 自动），默认自动
- 暗黑模式与宽屏（带鱼屏）两列布局
- 状态信息精简为一行小字：“已存 X 组”悬停显示总条数，进回收站后显示回收站组数/条数；“已用空间”悬停显示占用百分比（以 10MB 为参考值，本插件实际不受此上限限制）
- 鼠标中键点击标签条目可在新标签页后台打开（左键行为不变；“打开时删除”只对左键生效）
- 全局搜索、标签组备注、恢复标签时可休眠打开
- 拖拽排序流畅度优化，拖完不再整页重渲染
- 删掉了划词翻译和顶部的“多谢投喂”菜单

**备份与恢复**
- 备份文件名统一为 `NJ-Tab-Backup-YYYYMMDD-HHmmss`（本地导出、网页单文件、WebDAV 三类同规，精确到秒防重名覆盖）
- 所有备份（网页单文件除外）包含插件配置（主题、开关、间隔与保留规则等），恢复时一并恢复；WebDAV 地址/账号/密码和两个令牌永不进入任何备份
- 单文件导出（网页版/完整备份）与完整备份导入，导出不再丢时间信息
- Gist 备份：GitHub/Gitee 手动推送/拉取；自动备份频率可调（5/15/30/60/120 分钟五档，默认 30 分钟），数据无变化时自动跳过并给出提示，被限流会记进日志
- WebDAV 多版本备份：每次备份是带时间戳的新版本文件，可按保留天数/份数自动清理旧版本；有连接测试按钮；自动备份默认间隔 12 小时；恢复时列出全部版本（文件名、时间、文件大小），每个版本可单独删除
- 覆盖类操作（Gist 推送/拉取、WebDAV 恢复）改用页面内两步确认弹窗（第二步输入字母 Y）；WebDAV 恢复前会强制先备份当前数据，强制备份失败立即中止
- 回收站按保留天数自动清理（天数可设）

**安全与日志**
- 密码与 token 改为 AES-GCM 本机加密存储，老版本明文在首次读取时自动迁移，设置页不回填明文
- 操作日志增强：Gist 推送/拉取、WebDAV 上传/恢复、导入、导出、自动备份（含跳过、含被限流）、回收站自动清理、恢复前强制备份、数据转换等关键动作都会记录成功/失败与简短原因；日志带自动清理（可按保留天数/条数设置），且绝不记录密码、令牌原文

## 安全说明

- WebDAV 密码只保存在你这台电脑的浏览器里，只会在连接你的 WebDAV 服务器时用来登录，不会发到其他地方。
- 密码与令牌只在本机加密保存，不会明文存放，也不会进入任何备份、导出或 Gist。提醒：浏览器插件没有系统级保险箱，本机加密主要防止明文被直接看到或抄走，不能保证绝对安全。

## To Do List

- 优化代码，修改bug
- 根据需求再添加新功能
- etc...


## Discussing

- [在GitHub上提问](https://github.com/NJYZ96/NJ-Tab/issues/new "在GitHub上提问")



------

## 感谢以下大神的肩膀

[chrome插件官网](https://developer.chrome.com/extensions)

[chrome api官网](https://developer.chrome.com/extensions/api_index)

[【干货】Chrome插件(扩展)开发全攻略](https://www.cnblogs.com/liuxianan/p/chrome-plugin-develop.html#%E9%95%BF%E8%BF%9E%E6%8E%A5%E5%92%8C%E7%9F%AD%E8%BF%9E%E6%8E%A5)

[chrome-plugin-demo插件](https://github.com/sxei/chrome-plugin-demo)

[chrome-ext-tabulator插件](https://github.com/greduan/chrome-ext-tabulator)

[ContextSearch插件](https://github.com/lo0kup/ContextSearch)

[一篇文章搞定GitHub API 调用 (v3）](https://segmentfault.com/a/1190000015144126)

[Sortable官网](https://github.com/SortableJS/Sortable)

[Sortable.js拖拽排序使用方法解析](https://www.jb51.net/article/96446.htm)

[js数组内元素移动，适用于拖动排序](https://www.cnblogs.com/zwhblog/p/7941744.html)

[GitHubApi文档](https://developer.github.com/v3/)

[GiteeAPI文档](https://gitee.com/api/v5/swagger)

[Bootstrap中文网](https://www.bootcss.com/)


[辅助生成百度统计插件](https://github.com/krapnikkk/baidutongji-generator)

## Star历史

[![Star History Chart](https://starchart.cc/NJYZ96/NJ-Tab.svg)](https://starchart.cc/NJYZ96/NJ-Tab)

You are my ![Visitor Count](https://profile-counter.glitch.me/NJYZ96/count.svg)th visitor

