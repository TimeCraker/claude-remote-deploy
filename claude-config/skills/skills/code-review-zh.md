---
name: code-review-zh
description: Chinese code review focusing on Go memory escape, concurrency safety, and WebSocket state sync
user_invocable: true
---

# 中文代码审查 (Code Review)

对当前变更执行代码审查，输出使用中文。按以下维度检查：

## 1. Go 内存逃逸分析
- 检查是否有不必要的堆分配（如循环内创建闭包、接口类型转换）
- 确认 `go build -gcflags="-m"` 会逃逸的变量是否有优化空间
- 值接收者 vs 指针接收者的合理使用

## 2. 并发安全
- 共享状态是否有正确的锁保护（sync.Mutex / sync.RWMutex）
- channel 使用是否有死锁风险（goroutine 泄漏、无缓冲阻塞）
- context 传播是否完整（所有长时间操作是否接受 ctx）
- `sync.Map` vs `map+mutex` 的选择是否合理

## 3. WebSocket 状态同步
- 连接断开时的资源清理（graceful shutdown、取消注册）
- 广播逻辑是否有竞态（并发写同一连接）
- 心跳/重连机制是否健壮
- 消息序列化是否有性能瓶颈

## 4. 通用检查
- 错误处理：是否所有 error 都被检查或显式忽略
- SQL 注入 / XSS 等安全漏洞
- 命名一致性（Go: camelCase, 项目约定）

## 输出格式
按严重程度排序：`[严重]` > `[警告]` > `[建议]`，每项给出文件路径、行号和修复建议。
