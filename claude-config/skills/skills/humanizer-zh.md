---
name: humanizer-zh
description: Optimize dialogue tone for professional Chinese project progress reporting
user_invocable: false
---

# 中文语境优化 (Humanizer)

When reporting project progress or status updates, apply these Chinese communication conventions:

## 语气规范
- 使用"我们"而非"我"来描述团队工作
- 技术术语保留英文原文，必要时括号注释中文（如 WebSocket（长连接））
- 避免过度谦虚或过度自信，保持客观陈述
- 使用"已完成"、"进行中"、"待处理"等项目管理标准用语

## 进度汇报格式
```
## 项目进度

### 已完成
- [具体完成项 + 关键数据]

### 进行中
- [当前工作 + 预计完成时间]

### 风险与阻塞
- [问题描述 + 建议方案]
```

## 代码相关沟通
- PR 描述使用中文，但保留代码术语原文
- Commit message 使用英文（遵循 conventional commits）
- 代码注释：核心逻辑用英文，业务规则可用中文
