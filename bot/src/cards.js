/**
 * 飞书消息卡片构建器
 */

export function buildSessionListCard(sessions, currentIndex) {
  const elements = [];

  if (sessions.length === 0) {
    elements.push({
      tag: 'div',
      text: { tag: 'plain_text', content: '还没有会话，发送 /new 创建一个' }
    });
  } else {
    for (const s of sessions) {
      const isCurrent = s.id === currentIndex;
      const status = s.status === 'running' ? '🔄 运行中' : '💤 空闲';
      const prefix = isCurrent ? '👉 ' : '   ';
      elements.push({
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: prefix + '**#' + s.id + '** ' + s.name + ' | ' + status + ' | 📁 ' + s.project_dir
        }
      });
    }
  }

  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: '📋 会话列表' },
      template: 'blue'
    },
    elements
  };
}

export function buildStatusCard(sessions, activeCount) {
  const lines = sessions.map(s => {
    const status = s.status === 'running' ? '🔄' : '💤';
    return status + ' **#' + s.id + '** ' + s.name;
  });

  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: '📊 系统状态' },
      template: 'green'
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: [
            '**活跃进程**: ' + activeCount,
            '**总会话数**: ' + sessions.length,
            '',
            ...lines
          ].join('\n')
        }
      }
    ]
  };
}

export function buildResultCard(content, sessionId, isRunning = false, stepCount = 0) {
  const truncated = content.length > 2000 ? content.substring(0, 2000) + '\n\n... (内容已截断)' : content;

  const elements = [
    {
      tag: 'div',
      text: { tag: 'lark_md', content: truncated }
    }
  ];

  if (stepCount > 0) {
    elements.push({
      tag: 'note',
      elements: [{ tag: 'plain_text', content: '✅ 完成 (执行了 ' + stepCount + ' 个步骤)' }]
    });
  }

  if (isRunning) {
    elements.push({
      tag: 'note',
      elements: [{ tag: 'plain_text', content: '⏳ 任务执行中...' }]
    });
  }

  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: '💬 会话 #' + sessionId + ' 回复' },
      template: isRunning ? 'orange' : 'turquoise'
    },
    elements
  };
}

export function buildErrorCard(error, sessionId) {
  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: '❌ 错误' },
      template: 'red'
    },
    elements: [
      {
        tag: 'div',
        text: { tag: 'lark_md', content: '会话 #' + sessionId + ': ' + error }
      }
    ]
  };
}

export function buildHelpCard() {
  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: '🤖 Claude Code 远程控制' },
      template: 'violet'
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: [
            '**💬 直接发消息就能对话！**',
            '',
            '第一次发消息会自动创建工作空间，之后直接聊就行。',
            '',
            '---',
            '',
            '**会话管理**（一般不需要用）:',
            '`/new [名称]` — 新建一个工作空间',
            '`/list` — 查看所有工作空间',
            '`/switch N` — 切换到第 N 个工作空间',
            '`/stop` — 停止当前任务',
            '`/delete N` — 删除工作空间',
            '`/help` — 显示本帮助',
            '',
            '---',
            '',
            '**模型**: MiMo-v2.5-pro',
            '**服务器**: 腾讯云 (4核/3.6GB)',
            '**工作空间**: /home/ubuntu/projects/workspaceN'
          ].join('\n')
        }
      }
    ]
  };
}
