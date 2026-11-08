# Claude Code 远程部署方案

在云服务器上部署 Claude Code + 飞书 Bot，实现手机端 24/7 远程控制。

## 架构

```
手机(飞书) → Bot Server (Node.js) → Claude Code CLI → MiMo API
                                          │
                                    工作空间隔离
                                    workspace1/
                                    workspace2/
                                    ...
```

## 目录结构

```
claude-remote-deploy/
├── bot/                          # 飞书 Bot
│   ├── src/
│   │   ├── index.js              # 主入口（飞书 WebSocket）
│   │   ├── claude.js             # Claude Code 集成
│   │   ├── db.js                 # SQLite 会话管理
│   │   └── cards.js              # 飞书消息卡片
│   ├── package.json
│   └── .env.example              # 环境变量模板
├── claude-config/                # Claude Code 配置
│   ├── settings.json.example     # API/模型配置模板
│   ├── mcp.json                  # MCP 插件配置
│   ├── CLAUDE.md                 # Claude Code 指令
│   ├── rules/                    # 规则文件
│   └── skills/                   # 技能文件
├── scripts/
│   ├── deploy.sh                 # 一键部署脚本
│   └── claude-remote-bot.service # systemd 服务文件
└── README.md
```

## 快速部署

### 前置条件

- 云服务器（Ubuntu 22.04+，2核4G 以上）
- Node.js 20+
- 飞书开放平台自建应用（开启机器人能力 + 长连接模式）
- MiMo API Key（https://token-plan-cn.xiaomimimo.com）

### 一键部署

```bash
# 1. 克隆仓库
git clone <this-repo>
cd claude-remote-deploy

# 2. 运行部署脚本
bash scripts/deploy.sh ubuntu@YOUR_SERVER_IP your_ssh_key.pem

# 3. 在服务器上配置 API Key
ssh ubuntu@YOUR_SERVER_IP
vim /opt/claude-remote-bot/.env        # 填入飞书凭证和 MiMo Key
vim ~/.claude/settings.json            # 填入 MiMo API Key

# 4. 启动服务
sudo systemctl start claude-remote-bot
sudo journalctl -u claude-remote-bot -f
```

## 飞书 Bot 使用

### 基本对话

直接在飞书里发消息就行，第一次发消息会自动创建工作空间。

### 命令列表

| 命令 | 作用 |
|------|------|
| 直接发文字 | 对话（自动创建工作空间） |
| `/new [名称]` | 新建工作空间 |
| `/list` | 查看所有工作空间 |
| `/switch N` | 切换到第 N 个工作空间 |
| `/stop` | 停止当前任务 |
| `/delete N` | 删除工作空间 |
| `/help` | 显示帮助 |

### 工作空间

每个会话对应一个独立目录：

```
/home/ubuntu/projects/workspace1/
/home/ubuntu/projects/workspace2/
/home/ubuntu/projects/workspace3/
...
```

## SSH 直连使用

```bash
# 连接服务器
ssh -i your_key.pem ubuntu@YOUR_SERVER_IP

# 进入工作空间
cd /home/ubuntu/projects/workspace1

# 启动 Claude Code
claude

# 非交互模式
claude --print "你的问题"
```

## 飞书应用配置

1. 访问 https://open.feishu.cn 创建自建应用
2. 开启 **机器人** 能力
3. **事件与回调** → 订阅方式 → 选择「使用长连接接收事件/回调」
4. 添加事件: `im.message.receive_v1`
5. 权限管理: 开通 `im:message`, `im:message:send_as_bot`, `im:chat`, `im:resource` 等
6. 发布应用或添加测试用户

## 技术栈

- **Claude Code CLI** v2.1+ — Anthropic 官方 AI 编程工具
- **MiMo-v2.5-pro** — 小米 AI 模型（Anthropic 格式兼容）
- **飞书 SDK** — @larksuiteoapi/node-sdk（WebSocket 长连接）
- **SQLite** — better-sqlite3（会话持久化）
- **Node.js** 20+

## 服务器信息

- 腾讯云 Lighthouse（4核 / 3.6GB / Ubuntu 24.04）
- MiMo API 国内直连，无需翻墙
- systemd 守护进程，开机自启
