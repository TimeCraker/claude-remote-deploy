import { spawn } from 'child_process';
import { updateSessionStatus, addMessage, getSessionMessages } from './db.js';

const CLAUDE_BIN = process.env.CLAUDE_BIN || '/usr/local/bin/claude';
const MIMO_API_KEY = process.env.MIMO_API_KEY || '';
const MIMO_BASE_URL = process.env.MIMO_BASE_URL || 'https://token-plan-cn.xiaomimimo.com/anthropic';
const VISION_PROXY_URL = process.env.VISION_PROXY_URL || 'http://127.0.0.1:15722';

// 存储活跃的 Claude 进程
const activeProcesses = new Map();

// 消息队列：每个会话同时只处理一个问题
const messageQueues = new Map();
const processing = new Map();

function getClaudeEnv() {
  return {
    ...process.env,
    ANTHROPIC_AUTH_TOKEN: MIMO_API_KEY,
    ANTHROPIC_BASE_URL: VISION_PROXY_URL,
    ANTHROPIC_MODEL: 'mimo-v2.5-pro',
    ANTHROPIC_DEFAULT_OPUS_MODEL: 'mimo-v2.5-pro',
    ANTHROPIC_DEFAULT_SONNET_MODEL: 'mimo-v2.5-pro',
    ANTHROPIC_DEFAULT_HAIKU_MODEL: 'mimo-v2.5-pro',
    ANTHROPIC_SMALL_FAST_MODEL: 'mimo-v2.5-pro',
    CLAUDE_CODE_DISABLE_1M_CONTEXT: '1',
    HOME: process.env.HOME || '/home/ubuntu',
    PATH: '/home/ubuntu/.local/bin:/usr/local/bin:/usr/local/node20/bin:/usr/bin:/bin:' + (process.env.PATH || '')
  };
}

/**
 * 发送消息到 Claude Code
 * @param {Object} session - 会话对象
 * @param {string} prompt - 用户消息
 * @param {Function} onProgress - 进度回调 (type, content) => void
 *   type: 'thinking' | 'tool' | 'text' | 'error'
 */
export async function sendMessage(session, prompt, onProgress) {
  const sessionId = session.id;

  if (processing.get(sessionId)) {
    return new Promise((resolve, reject) => {
      if (!messageQueues.has(sessionId)) messageQueues.set(sessionId, []);
      messageQueues.get(sessionId).push({ prompt, onProgress, resolve, reject });
    });
  }

  processing.set(sessionId, true);
  addMessage(sessionId, 'user', prompt);
  updateSessionStatus(sessionId, 'running');

  try {
    const response = await _execClaude(session, prompt, onProgress);
    addMessage(sessionId, 'assistant', response);
    processing.set(sessionId, false);
    _processQueue(sessionId, session);
    return response;
  } catch (err) {
    processing.set(sessionId, false);
    updateSessionStatus(sessionId, 'idle');
    _processQueue(sessionId, session);
    throw err;
  }
}

function _processQueue(sessionId, session) {
  const queue = messageQueues.get(sessionId);
  if (queue && queue.length > 0) {
    const next = queue.shift();
    sendMessage(session, next.prompt, next.onProgress).then(next.resolve).catch(next.reject);
  }
}

/**
 * 执行 Claude Code，使用 stream-json 输出，实时解析思考/工具/文本
 */
function _execClaude(session, prompt, onProgress) {
  const sessionId = session.id;
  const prevMessages = getSessionMessages(sessionId, 50);
  const hasHistory = prevMessages.length > 1;

  const args = [
    '--print',
    '--output-format', 'stream-json',
    '--verbose',
    '--model', 'mimo-v2.5-pro',
    '--max-turns', '50',
    '--dangerously-skip-permissions'
  ];

  if (hasHistory) args.push('--continue');
  args.push(prompt);

  return new Promise((resolve, reject) => {
    const proc = spawn(CLAUDE_BIN, args, {
      cwd: session.project_dir || '/home/ubuntu/projects',
      env: getClaudeEnv(),
      stdio: ['pipe', 'pipe', 'pipe']
    });

    activeProcesses.set(sessionId, proc);
    let stderr = '';
    let finalText = '';
    let buffer = '';
    let thinkingLog = [];
    let toolLog = [];

    proc.stdout.on('data', (data) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop(); // 保留不完整的最后一行

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          _processStreamEvent(event, onProgress, thinkingLog, toolLog, (text) => { finalText = text; });
        } catch (e) {
          // 非 JSON 行，可能是旧格式输出
          if (line.trim() && !line.startsWith('{')) {
            finalText += line + '\n';
          }
        }
      }
    });

    // 处理 buffer 中剩余的数据
    proc.stdout.on('end', () => {
      if (buffer.trim()) {
        try {
          const event = JSON.parse(buffer);
          _processStreamEvent(event, onProgress, thinkingLog, toolLog, (text) => { finalText = text; });
        } catch {
          if (buffer.trim() && !buffer.startsWith('{')) {
            finalText += buffer;
          }
        }
      }
    });

    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      activeProcesses.delete(sessionId);
      updateSessionStatus(sessionId, 'idle');

      const result = finalText.trim();
      if (code === 0 || result.length > 0) {
        resolve(result);
      } else {
        reject(new Error(stderr.trim() || `Claude Code 退出码: ${code}`));
      }
    });

    proc.on('error', (err) => {
      activeProcesses.delete(sessionId);
      updateSessionStatus(sessionId, 'idle');
      reject(err);
    });

    setTimeout(() => {
      if (activeProcesses.has(sessionId)) {
        proc.kill('SIGTERM');
        activeProcesses.delete(sessionId);
        updateSessionStatus(sessionId, 'idle');
        reject(new Error('请求超时 (10分钟)'));
      }
    }, 10 * 60 * 1000);
  });
}

/**
 * 解析 stream-json 事件
 */
function _processStreamEvent(event, onProgress, thinkingLog, toolLog, setFinalText) {
  const type = event.type;

  switch (type) {
    case 'assistant':
    case 'content_block_start':
    case 'content_block_delta':
    case 'content_block_stop':
      // 处理 assistant 消息中的各种内容块
      if (event.message?.content) {
        for (const block of event.message.content) {
          if (block.type === 'thinking' && block.thinking) {
            const thought = block.thinking.trim();
            if (thought && !thinkingLog.includes(thought)) {
              thinkingLog.push(thought);
              if (onProgress) onProgress('thinking', _truncate(thought, 500));
            }
          }
          if (block.type === 'tool_use') {
            const toolInfo = `${block.name}: ${_truncate(JSON.stringify(block.input), 200)}`;
            if (onProgress) onProgress('tool', toolInfo);
          }
          if (block.type === 'text' && block.text) {
            setFinalText(block.text);
          }
        }
      }
      // 处理 delta 流
      if (event.delta) {
        if (event.delta.type === 'thinking_delta' && event.delta.thinking) {
          // 流式思考片段，不需要每个都推送
        }
        if (event.delta.type === 'text_delta' && event.delta.text) {
          // 流式文本片段
        }
      }
      break;

    case 'result':
      // 最终结果
      if (event.result) {
        setFinalText(event.result);
      }
      if (event.subtype === 'success' && event.result) {
        setFinalText(event.result);
      }
      break;

    case 'tool_use':
      if (onProgress) onProgress('tool', `${event.name}: ${_truncate(JSON.stringify(event.input), 200)}`);
      break;

    case 'tool_result':
      // 工具执行结果，一般不需要展示
      break;

    case 'text':
      if (event.text) setFinalText(event.text);
      break;

    default:
      // 其他事件类型，尝试提取文本
      if (event.text) setFinalText(event.text);
      if (event.result) setFinalText(event.result);
  }
}

function _truncate(str, max) {
  if (!str) return '';
  return str.length > max ? str.substring(0, max) + '...' : str;
}

/**
 * 停止正在运行的 Claude 进程
 */
export function stopSession(sessionId) {
  const proc = activeProcesses.get(sessionId);
  if (proc) {
    proc.kill('SIGTERM');
    activeProcesses.delete(sessionId);
    processing.set(sessionId, false);
    const queue = messageQueues.get(sessionId);
    if (queue) {
      queue.forEach(q => q.reject(new Error('会话已停止')));
      messageQueues.set(sessionId, []);
    }
    updateSessionStatus(sessionId, 'idle');
    return true;
  }
  return false;
}

export function isRunning(sessionId) {
  return activeProcesses.has(sessionId) || processing.get(sessionId) || false;
}

export function getActiveCount() {
  return activeProcesses.size;
}
