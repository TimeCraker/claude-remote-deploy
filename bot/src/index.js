/**
 * Claude Code 远程控制 Bot - 飞书入口
 * 使用 WebSocket 长连接模式，无需公网 URL
 */
import * as lark from '@larksuiteoapi/node-sdk';
import { readFileSync, mkdirSync, existsSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { sendMessage, stopSession, isRunning, getActiveCount } from './claude.js';
import {
  getOrCreateUser, createSession, getUserSessions,
  getCurrentSession, switchSession, deleteSession,
  getSessionMessages, updateSessionStatus
} from './db.js';
import {
  buildSessionListCard, buildStatusCard, buildResultCard,
  buildErrorCard, buildHelpCard
} from './cards.js';

// 加载 .env
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '.env');
try {
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...vals] = trimmed.split('=');
      if (key && !process.env[key.trim()]) {
        process.env[key.trim()] = vals.join('=').trim();
      }
    }
  }
} catch (e) {
  console.log('未找到 .env 文件，使用环境变量');
}

const APP_ID = process.env.FEISHU_APP_ID;
const APP_SECRET = process.env.FEISHU_APP_SECRET;

if (!APP_ID || !APP_SECRET) {
  console.error('错误: 请设置 FEISHU_APP_ID 和 FEISHU_APP_SECRET');
  process.exit(1);
}

// 创建飞书客户端
const client = new lark.Client({
  appId: APP_ID,
  appSecret: APP_SECRET,
  disableTokenCache: false
});

// 发送消息卡片
async function sendCard(chatId, card, replyMsgId = null) {
  try {
    const body = {
      msg_type: 'interactive',
      content: JSON.stringify(card)
    };
    if (replyMsgId) {
      return await client.im.v1.message.reply({
        path: { message_id: replyMsgId },
        data: body
      });
    }
    return await client.im.v1.message.create({
      params: { receive_id_type: 'chat_id' },
      data: { ...body, receive_id: chatId }
    });
  } catch (err) {
    console.error('发送卡片失败:', err.message);
  }
}

// 发送文本消息
async function sendText(chatId, text, replyMsgId = null) {
  try {
    const body = {
      msg_type: 'text',
      content: JSON.stringify({ text })
    };
    if (replyMsgId) {
      return await client.im.v1.message.reply({
        path: { message_id: replyMsgId },
        data: body
      });
    }
    return await client.im.v1.message.create({
      params: { receive_id_type: 'chat_id' },
      data: { ...body, receive_id: chatId }
    });
  } catch (err) {
    console.error('发送文本失败:', err.message);
  }
}

/**
 * 获取下一个可用的工作空间编号（复用被删除的编号）
 */
function getNextWorkspaceNum(openId) {
  const sessions = getUserSessions(openId);
  const usedNums = new Set();
  for (const s of sessions) {
    const match = s.project_dir?.match(/workspace(\d+)/);
    if (match) usedNums.add(parseInt(match[1]));
  }
  let num = 1;
  while (usedNums.has(num)) num++;
  return num;
}

// 处理命令
async function handleCommand(openId, chatId, cmd, args, msgId) {
  const user = getOrCreateUser(openId);

  switch (cmd) {
    case '/help': {
      await sendCard(chatId, buildHelpCard(), msgId);
      break;
    }

    case '/new': {
      const name = args.join(' ') || '';
      // 自动分配工作空间（复用被删除的编号）
      const workspaceNum = getNextWorkspaceNum(openId);
      const workspaceDir = `/home/ubuntu/projects/workspace${workspaceNum}`;
      // 确保目录存在
      const { mkdirSync, existsSync } = await import('fs');
      if (!existsSync(workspaceDir)) mkdirSync(workspaceDir, { recursive: true });
      const session = createSession(openId, workspaceDir, name || `工作空间${workspaceNum}`);
      await sendText(chatId, `✅ 已创建会话 #${session.id}「${session.name}」\n📁 工作目录: ${session.project_dir}\n\n直接发消息就可以对话了！`, msgId);
      break;
    }

    case '/list': {
      const sessions = getUserSessions(openId);
      const current = getCurrentSession(openId);
      await sendCard(chatId, buildSessionListCard(sessions, current?.id || 0), msgId);
      break;
    }

    case '/switch': {
      const id = parseInt(args[0]);
      if (isNaN(id)) {
        await sendText(chatId, '❌ 用法: /switch <会话ID>', msgId);
        break;
      }
      const session = switchSession(openId, id);
      if (session) {
        await sendText(chatId, `✅ 已切换到会话 #${session.id} ${session.name}`, msgId);
      } else {
        await sendText(chatId, `❌ 会话 #${id} 不存在`, msgId);
      }
      break;
    }

    case '/stop': {
      const current = getCurrentSession(openId);
      if (!current) {
        await sendText(chatId, '❌ 没有当前会话', msgId);
        break;
      }
      const stopped = stopSession(current.id);
      if (stopped) {
        await sendText(chatId, `⏹ 已停止会话 #${current.id}`, msgId);
      } else {
        await sendText(chatId, `会话 #${current.id} 没有在运行`, msgId);
      }
      break;
    }

    case '/status': {
      const sessions = getUserSessions(openId);
      await sendCard(chatId, buildStatusCard(sessions, getActiveCount()), msgId);
      break;
    }

    case '/delete': {
      const id = parseInt(args[0]);
      if (isNaN(id)) {
        await sendText(chatId, '❌ 用法: /delete <会话ID>', msgId);
        break;
      }
      stopSession(id);
      deleteSession(id, openId);
      await sendText(chatId, `🗑 已删除会话 #${id}`, msgId);
      break;
    }

    case '/project': {
      const path = args.join(' ');
      if (!path) {
        await sendText(chatId, '❌ 用法: /project <路径>', msgId);
        break;
      }
      // 更新用户的默认项目目录
      const { default: db } = await import('./db.js');
      db.prepare('UPDATE users SET feishu_open_id = feishu_open_id WHERE feishu_open_id = ?').run(openId);
      await sendText(chatId, `📁 默认工作目录已设置为: ${path}`, msgId);
      break;
    }

    default:
      await sendText(chatId, `❓ 未知命令: ${cmd}\n发送 /help 查看帮助`, msgId);
  }
}

// 处理普通消息（发送给 Claude Code）
async function handleMessage(openId, chatId, text, msgId) {
  let current = getCurrentSession(openId);

  // 如果没有会话，自动创建一个
  if (!current) {
    const workspaceNum = getNextWorkspaceNum(openId);
    const workspaceDir = `/home/ubuntu/projects/workspace${workspaceNum}`;
    const { mkdirSync, existsSync } = await import('fs');
    if (!existsSync(workspaceDir)) mkdirSync(workspaceDir, { recursive: true });
    current = createSession(openId, workspaceDir, `工作空间${workspaceNum}`);
    await sendText(chatId, `🆕 已自动创建工作空间 #${current.id}「${current.name}」\n📁 ${workspaceDir}\n\n正在处理你的消息...`, msgId);
  }

  if (isRunning(current.id)) {
    await sendText(chatId, '⏳ 当前会话正在处理中，请等待完成或发送 /stop 停止', msgId);
    return;
  }

  // 发送处理中提示
  await sendText(chatId, `🔄 会话 #${current.id} 正在处理...`, msgId);

  // 收集进度信息
  let progressSteps = [];
  let lastProgressMsg = null;

  try {
    const response = await sendMessage(current, text, async (type, content) => {
      // 实时推送思考/工具调用过程
      if (type === 'thinking') {
        progressSteps.push(`💭 思考: ${content.substring(0, 150)}`);
      } else if (type === 'tool') {
        progressSteps.push(`🔧 工具: ${content}`);
      }
      // 每3步推送一次进度（避免刷屏）
      if (progressSteps.length > 0 && progressSteps.length % 3 === 0) {
        const summary = progressSteps.slice(-3).join('\n');
        try {
          if (!lastProgressMsg) {
            const res = await sendText(chatId, `⏳ 进度更新:\n${summary}`);
            lastProgressMsg = res?.data?.message_id;
          }
        } catch { /* 忽略进度发送失败 */ }
      }
    });

    // 截断过长的回复
    const truncated = response.length > 4000
      ? response.substring(0, 4000) + '\n\n... (内容已截断)'
      : response;

    // 用飞书卡片 Markdown 渲染最终结果
    await sendCard(chatId, buildResultCard(truncated, current.id, false, progressSteps.length));

  } catch (err) {
    await sendCard(chatId, buildErrorCard(err.message, current.id));
  }
}

// ============ 辅助函数 ============

/**
 * 获取飞书 tenant_access_token
 */
async function getAccessToken() {
  const res = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: APP_ID, app_secret: APP_SECRET })
  });
  const data = await res.json();
  return data.tenant_access_token;
}

/**
 * 下载飞书图片到本地（使用 message resources API）
 */
async function downloadImage(imageKey, savePath, messageId) {
  const accessToken = await getAccessToken();

  // 使用消息资源 API 下载图片
  const url = `https://open.feishu.cn/open-apis/im/v1/messages/${messageId}/resources/${imageKey}?type=image`;
  console.log(`🔍 下载图片: msgId=${messageId}, imageKey=${imageKey}`);
  const imgRes = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  if (!imgRes.ok) {
    const errBody = await imgRes.text().catch(() => 'unable to read body');
    console.log(`⚠️ 消息资源 API 失败 (${imgRes.status}): ${errBody}`);

    // 备用方案：使用 images API
    const url2 = `https://open.feishu.cn/open-apis/im/v1/images/${imageKey}`;
    const imgRes2 = await fetch(url2, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    if (!imgRes2.ok) {
      const errBody2 = await imgRes2.text().catch(() => '');
      throw new Error(`图片下载失败: 消息资源API=${imgRes.status}, 图片API=${imgRes2.status} ${errBody2}`);
    }
    const buffer = Buffer.from(await imgRes2.arrayBuffer());
    const dir = dirname(savePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(savePath, buffer);
    console.log(`📷 图片已保存(images API): ${savePath} (${buffer.length} bytes)`);
    return;
  }

  const buffer = Buffer.from(await imgRes.arrayBuffer());
  const dir = dirname(savePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(savePath, buffer);
  console.log(`📷 图片已保存: ${savePath} (${buffer.length} bytes)`);
}

/**
 * 自动创建会话（图片消息等场景）
 */
async function autoCreateSession(openId, chatId, msgId) {
  const workspaceNum = getNextWorkspaceNum(openId);
  const workspaceDir = `/home/ubuntu/projects/workspace${workspaceNum}`;
  if (!existsSync(workspaceDir)) mkdirSync(workspaceDir, { recursive: true });
  const session = createSession(openId, workspaceDir, `工作空间${workspaceNum}`);
  await sendText(chatId, `🆕 已自动创建工作空间 #${session.id}「${session.name}」`, msgId);
  return session;
}

// ============ WebSocket 长连接 ============
console.log('🚀 Claude Code 远程控制 Bot 启动中...');
console.log(`   App ID: ${APP_ID}`);

// 创建 WebSocket 客户端
const wsClient = new lark.WSClient({
  appId: APP_ID,
  appSecret: APP_SECRET,
  loggerLevel: lark.LoggerLevel.info
});

// 创建事件分发器
const eventDispatcher = new lark.EventDispatcher({});

// 消息去重（防止飞书重复推送）
const processedMessages = new Set();
const MAX_PROCESSED_CACHE = 1000;

function isDuplicate(msgId) {
  if (processedMessages.has(msgId)) return true;
  processedMessages.add(msgId);
  if (processedMessages.size > MAX_PROCESSED_CACHE) {
    const first = processedMessages.values().next().value;
    processedMessages.delete(first);
  }
  return false;
}

// 注册消息处理器
eventDispatcher.register({
  'im.message.receive_v1': async (data) => {
      const openId = data.sender?.sender_id?.open_id || '';
      const chatId = data.message?.chat_id || '';
      const msgId = data.message?.message_id || '';
      const msgType = data.message?.message_type || 'text';
      const rawContent = data.message?.content || '{}';

      if (!openId || !chatId) return;
      if (isDuplicate(msgId)) return;

      // 解析消息内容（支持文本和图片）
      let text = '';
      let imageKey = '';

      try {
        const content = JSON.parse(rawContent);
        text = (content.text || '').trim();
        imageKey = content.image_key || '';
      } catch { text = rawContent; }

      // 图片消息：下载图片保存到工作空间，让 Claude Code 分析
      if (msgType === 'image' && imageKey) {
        console.log(`🖼 收到图片 [${openId}]: ${imageKey}`);
        const current = getCurrentSession(openId) || await autoCreateSession(openId, chatId, msgId);
        const imgDir = current.project_dir || '/home/ubuntu/projects/workspace1';
        const imgPath = `${imgDir}/feishu_img_${Date.now()}.jpg`;

        try {
          await downloadImage(imageKey, imgPath, msgId);
          text = `[用户发送了一张图片，已保存到 ${imgPath}] 请用 Read 工具读取并分析这张图片的内容。`;
        } catch (err) {
          console.error('下载图片失败:', err);
          await sendText(chatId, `❌ 图片下载失败: ${err.message}`, msgId);
          return;
        }
      }

      // 如果是图片+文字组合消息（text 里有 @_user 占位符，去掉）
      text = text.replace(/@_user_\d+/g, '').trim();

      if (!text) return;

      console.log(`📩 收到消息 [${openId}]: ${text.substring(0, 80)}`);

      try {
        if (text.startsWith('/')) {
          const parts = text.split(/\s+/);
          const cmd = parts[0].toLowerCase();
          const args = parts.slice(1);
          await handleCommand(openId, chatId, cmd, args, msgId);
        } else {
          await handleMessage(openId, chatId, text, msgId);
        }
      } catch (err) {
        console.error('处理消息失败:', err);
        await sendText(chatId, `❌ 处理失败: ${err.message}`, msgId);
      }
    }
  }
);

// 启动 WebSocket 连接
wsClient.start({ eventDispatcher }).then(() => {
  console.log('✅ Bot 已启动，等待消息...');
  console.log('   发送 /help 查看命令列表');
}).catch(err => {
  console.error('❌ WebSocket 启动失败:', err);
});

// 优雅退出
process.on('SIGINT', () => {
  console.log('\n🛑 正在关闭...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 正在关闭...');
  process.exit(0);
});
