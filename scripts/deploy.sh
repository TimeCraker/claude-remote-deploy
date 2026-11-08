#!/bin/bash
# Claude Code 远程部署脚本
# 用法: bash scripts/deploy.sh <server_ip> <ssh_key_path>

set -e

SERVER=${1:-"ubuntu@<your-server-ip>"}
SSH_KEY=${2:-"your_server_key.pem"}

echo "=== Claude Code 远程部署 ==="
echo "服务器: $SERVER"
echo ""

# 1. 安装 Claude Code
echo "[1/5] 安装 Claude Code..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$SERVER" "
  sudo npm install -g @anthropic-ai/claude-code@latest 2>&1 | tail -3
  sudo ln -sf /usr/local/node20/bin/claude /usr/local/bin/claude 2>/dev/null || true
  claude --version
"

# 2. 配置 Claude Code
echo "[2/5] 配置 Claude Code..."
ssh -i "$SSH_KEY" "$SERVER" "mkdir -p ~/.claude ~/.claude/rules ~/.claude/skills"
scp -i "$SSH_KEY" claude-config/settings.json.example "$SERVER:~/.claude/settings.json"
scp -i "$SSH_KEY" claude-config/mcp.json "$SERVER:~/.claude/.mcp.json"
scp -i "$SSH_KEY" claude-config/CLAUDE.md "$SERVER:~/.claude/CLAUDE.md"
scp -i "$SSH_KEY" -r claude-config/rules/* "$SERVER:~/.claude/rules/"
scp -i "$SSH_KEY" -r claude-config/skills/* "$SERVER:~/.claude/skills/"

# 3. 安装 uv/uvx
echo "[3/5] 安装 uv/uvx..."
ssh -i "$SSH_KEY" "$SERVER" "
  if ! command -v uvx &>/dev/null; then
    curl -LsSf https://astral.sh/uv/install.sh | sh
    echo 'export PATH=\"\\\$HOME/.local/bin:\\\$PATH\"' >> ~/.bashrc
  fi
  echo 'export PATH=\"\\\$HOME/.local/bin:\\\$PATH\"' >> ~/.bashrc
"

# 4. 部署 Bot
echo "[4/5] 部署飞书 Bot..."
ssh -i "$SSH_KEY" "$SERVER" "sudo mkdir -p /opt/claude-remote-bot/src /opt/claude-remote-bot/data && sudo chown -R \$(whoami):\$(whoami) /opt/claude-remote-bot"
scp -i "$SSH_KEY" bot/package.json "$SERVER:/opt/claude-remote-bot/"
scp -i "$SSH_KEY" bot/src/*.js "$SERVER:/opt/claude-remote-bot/src/"
scp -i "$SSH_KEY" bot/.env.example "$SERVER:/opt/claude-remote-bot/.env"
ssh -i "$SSH_KEY" "$SERVER" "cd /opt/claude-remote-bot && npm install"

# 5. 创建 systemd 服务
echo "[5/5] 创建 systemd 服务..."
ssh -i "$SSH_KEY" "$SERVER" "
sudo tee /etc/systemd/system/claude-remote-bot.service > /dev/null << 'EOF'
[Unit]
Description=Claude Code Remote Bot (Feishu)
After=network.target

[Service]
Type=simple
User=\$(whoami)
WorkingDirectory=/opt/claude-remote-bot
ExecStart=/usr/local/bin/node src/index.js
Environment=HOME=/home/\$(whoami)
Environment=PATH=/home/\$(whoami)/.local/bin:/usr/local/bin:/usr/local/node20/bin:/usr/bin:/bin
EnvironmentFile=/opt/claude-remote-bot/.env
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable claude-remote-bot
"

echo ""
echo "=== 部署完成！==="
echo ""
echo "下一步:"
echo "  1. 编辑服务器上的 /opt/claude-remote-bot/.env，填入真实的 API Key"
echo "  2. 编辑 ~/.claude/settings.json，替换 API Key"
echo "  3. 启动服务: sudo systemctl start claude-remote-bot"
echo "  4. 查看日志: sudo journalctl -u claude-remote-bot -f"
