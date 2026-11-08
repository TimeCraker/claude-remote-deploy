import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

const DB_PATH = process.env.DB_PATH || '/opt/claude-remote-bot/data/bot.db';
const dir = dirname(DB_PATH);
if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// 初始化表
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    feishu_open_id TEXT PRIMARY KEY,
    name TEXT DEFAULT '',
    current_session INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY,
    feishu_open_id TEXT NOT NULL,
    name TEXT DEFAULT '',
    project_dir TEXT DEFAULT '/home/ubuntu/projects',
    status TEXT DEFAULT 'idle',
    pid INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (feishu_open_id) REFERENCES users(feishu_open_id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  );
`);

// 迁移：移除 sessions 表的 AUTOINCREMENT，允许复用已删除的 ID
try {
  const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='sessions'").get();
  if (tableInfo && tableInfo.sql.includes('AUTOINCREMENT')) {
    console.log('🔧 迁移 sessions 表：移除 AUTOINCREMENT...');
    db.exec(`
      PRAGMA foreign_keys = OFF;
      CREATE TABLE sessions_new (
        id INTEGER PRIMARY KEY,
        feishu_open_id TEXT NOT NULL,
        name TEXT DEFAULT '',
        project_dir TEXT DEFAULT '/home/ubuntu/projects',
        status TEXT DEFAULT 'idle',
        pid INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (feishu_open_id) REFERENCES users(feishu_open_id)
      );
      INSERT INTO sessions_new SELECT * FROM sessions;
      DROP TABLE sessions;
      ALTER TABLE sessions_new RENAME TO sessions;
      PRAGMA foreign_keys = ON;
    `);
    console.log('✅ sessions 表迁移完成');
  }
} catch (e) {
  console.log('⚠️ sessions 迁移跳过:', e.message);
}

export default db;

export function getOrCreateUser(openId, name = '') {
  const existing = db.prepare('SELECT * FROM users WHERE feishu_open_id = ?').get(openId);
  if (existing) return existing;
  db.prepare('INSERT INTO users (feishu_open_id, name) VALUES (?, ?)').run(openId, name);
  return db.prepare('SELECT * FROM users WHERE feishu_open_id = ?').get(openId);
}

/**
 * 获取当前用户最小可用的 session ID（复用被删除的 ID）
 */
export function getNextSessionId(openId) {
  const user = getOrCreateUser(openId);
  const rows = db.prepare('SELECT id FROM sessions WHERE feishu_open_id = ? ORDER BY id').all(user.feishu_open_id);
  let nextId = 1;
  for (const row of rows) {
    if (row.id === nextId) nextId++;
    else if (row.id > nextId) break;
  }
  return nextId;
}

export function createSession(openId, projectDir = '/home/ubuntu/projects', name = '') {
  const user = getOrCreateUser(openId);
  const id = getNextSessionId(openId);
  db.prepare('INSERT INTO sessions (id, feishu_open_id, name, project_dir) VALUES (?, ?, ?, ?)').run(id, user.feishu_open_id, name || `会话 ${Date.now()}`, projectDir);
  // 自动切换到新会话
  db.prepare('UPDATE users SET current_session = ? WHERE feishu_open_id = ?').run(id, openId);
  return db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
}

export function getUserSessions(openId) {
  const user = getOrCreateUser(openId);
  return db.prepare('SELECT * FROM sessions WHERE feishu_open_id = ? ORDER BY updated_at DESC').all(user.feishu_open_id);
}

export function getCurrentSession(openId) {
  const user = getOrCreateUser(openId);
  if (!user.current_session) return null;
  return db.prepare('SELECT * FROM sessions WHERE id = ? AND feishu_open_id = ?').get(user.current_session, user.feishu_open_id);
}

export function switchSession(openId, sessionId) {
  const user = getOrCreateUser(openId);
  const session = db.prepare('SELECT * FROM sessions WHERE id = ? AND feishu_open_id = ?').get(sessionId, user.feishu_open_id);
  if (!session) return null;
  db.prepare('UPDATE users SET current_session = ? WHERE feishu_open_id = ?').run(sessionId, openId);
  return session;
}

export function updateSessionStatus(sessionId, status, pid = null) {
  db.prepare('UPDATE sessions SET status = ?, pid = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, pid, sessionId);
}

export function deleteSession(sessionId, openId) {
  const user = getOrCreateUser(openId);
  // 先删除关联的消息记录，避免外键约束失败
  db.prepare('DELETE FROM messages WHERE session_id = ?').run(sessionId);
  db.prepare('DELETE FROM sessions WHERE id = ? AND feishu_open_id = ?').run(sessionId, user.feishu_open_id);
  if (user.current_session === sessionId) {
    db.prepare('UPDATE users SET current_session = 0 WHERE feishu_open_id = ?').run(openId);
  }
}

export function addMessage(sessionId, role, content) {
  db.prepare('INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)').run(sessionId, role, content);
}

export function getSessionMessages(sessionId, limit = 20) {
  return db.prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at DESC LIMIT ?').all(sessionId, limit).reverse();
}
