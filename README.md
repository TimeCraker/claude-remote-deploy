<div align="center">

# ☁️ Claude Code 远程部署与飞书 Bot

**在 Linux 云服务器上部署 Claude Code 守护进程，通过飞书实现 24/7 移动端编程协作**  
*Headless Claude Code Server on Linux with Feishu/Lark Bot & Multi-Session Isolation*

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![Platform: Linux](https://img.shields.io/badge/Platform-Ubuntu%20%7C%20Debian-E95420.svg?style=flat-square&logo=ubuntu&logoColor=white)](#快速部署)
[![Bot: Feishu / Lark](https://img.shields.io/badge/Bot-Feishu%20WebSocket-00D6B9.svg?style=flat-square)](https://open.feishu.cn/)
[![Daemon: systemd](https://img.shields.io/badge/Daemon-systemd-111111.svg?style=flat-square)](#日常维护)
[![Vision Proxy](https://img.shields.io/badge/Vision%20Proxy-Multimodal%20Support-CC785C.svg?style=flat-square)](#架构)

<br/>

> **随时随地，在手机飞书上派发编程任务。**  
> 支持 WebSocket 长连接免公网 IP、多工作空间自动分配隔离、飞书卡片 Markdown 实时进度渲染与图片多模态分析。

</div>

---

## 🏛️ 系统架构

```
  ┌───────────────────────────────────────────────────────────────┐
  │                        用户移动端 / 飞书                      │
  └───────────────────────────────┬───────────────────────────────┘
                                  │ WebSocket 长连接 (无需公网 IP)
                                  ▼
  ┌───────────────────────────────────────────────────────────────┐
  │              Linux 云服务器: /opt/claude-remote-bot           │
  │                                                               │
  │   飞书 Bot 进程 (Node.js)  ──────►  SQLite 会话数据库         │
  │            │                                                  │
  │            ▼                                                  │
  │   Claude Code CLI 进程 ──────────►  多工作空间隔离分配        │
  │            │                        (workspace1/, workspace2/)│
  │            ▼                                                  │
  │   Vision Proxy 视觉网关 ─────────►  大模型 API (MiMo / Claude)│
  └───────────────────────────────────────────────────────────────┘
```

---

## 📂 目录结构

```tree
claude-remote-deploy/
├── bot/                          # 飞书 Bot 服务端源码
│   ├── src/
│   │   ├── index.js              # 主入口（飞书 WebSocket 事件监听）
│   │   ├── claude.js             # Claude Code 子进程集成与流式解析
│   │   ├── db.js                 # SQLite 多会话管理与工作空间映射
│   │   └── cards.js              # 飞书互动卡片构建器
│   ├── package.json
│   └── .env.example              # 飞书环境变量模板
├── vision-proxy/                 # 视觉代理服务（图片理解转译）
│   ├── server.mjs                # 视觉网关服务器
│   └── config.json               # 代理配置文件
├── claude-config/                # Claude Code 预置配置包
│   ├── settings.json.example     # API 与模型配置模板
│   ├── mcp.json                  # MCP 工具插件配置
│   ├── CLAUDE.md                 # 编码智能体系统规则
│   ├── rules/                    # 协作规范
│   └── skills/                   # 预设技能包
├── scripts/
│   ├── deploy.sh                 # 一键远程部署脚本
│   └── claude-remote-bot.service # systemd 守护进程服务单元
└── README.md
```

---

## 🚀 快速部署

### 1. 前置准备

* 一台 Linux 云服务器（Ubuntu 22.04+ / Debian 12，推荐 2 核 4G 以上）。
* 在 [飞书开放平台](https://open.feishu.cn/) 创建一个企业自建应用，开启 **机器人能力**，权限勾选 `im:message`（接收与发送消息），连接方式选择 **WebSocket 长连接**。
* 准备好你的大模型 API 凭据。

### 2. 一键安装

```bash
# 在本地执行远程部署脚本
bash scripts/deploy.sh <your_server_ip> <your_ssh_key_path>
```

脚本将自动完成：
1. 安装 Node.js 20、pnpm 与 `@anthropic-ai/claude-code` CLI。
2. 同步 `~/.claude` 配置、MCP 插件与系统规则。
3. 安装并配置飞书 Bot 依赖。
4. 注册并启动 `claude-remote-bot` systemd 系统服务。

### 3. 配置与启动

进入服务器 `/opt/claude-remote-bot/`：
```bash
cp .env.example .env
# 填入 FEISHU_APP_ID 和 FEISHU_APP_SECRET
vim .env

# 启动服务
sudo systemctl start claude-remote-bot
sudo systemctl status claude-remote-bot
```

---

## 🛠️ 日常维护与命令

```bash
# 查看实时运行日志
sudo journalctl -u claude-remote-bot -f

# 重启机器人服务
sudo systemctl restart claude-remote-bot

# 停止服务
sudo systemctl stop claude-remote-bot
```

---

## 📄 License

[MIT License](LICENSE) © 2026 Huanrui Zhang (TimeCraker)
