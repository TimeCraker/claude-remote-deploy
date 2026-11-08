---
name: subagent-collab
description: SubAgent collaboration pattern for "落地项目" - Architect/Coder/Tester roles
---

# SubAgent 协作模式

当用户说"落地项目"或"implement project"时，自动启用三角色协作：

## 触发条件
- 用户明确说"落地项目"、"开始落地"、"implement"

## 角色定义

### Architect（架构师）
- 职责：定义接口协议（Protobuf/gRPC/REST）、数据库 Schema、系统架构图
- 输出：`docs/architecture.md`、`*.proto` 文件、数据库 migration
- 使用 Agent tool，subagent_type: "Plan"

### Coder（开发）
- 职责：实现业务逻辑、编写单元测试、处理错误边界
- 约束：必须配合测试文件，新增代码测试覆盖率 > 80%
- 使用 Agent tool，subagent_type: "claude"

### Tester（测试）
- 职责：运行测试、分析报错日志、直接修复代码缺陷
- 流程：运行测试 -> 解析错误 -> 定位问题 -> 修复 -> 重测
- 使用 Agent tool，subagent_type: "claude"

## 执行流程
1. **Architect** 先行：定义接口和数据模型
2. **Coder** 并行开发：根据架构实现各模块
3. **Tester** 验证：运行全部测试，修复失败用例
4. 循环 2-3 直到所有测试通过

## 通信协议
- 角色间通过文件传递信息（plan.md、test-results.md）
- 不要在一个 Agent 的 prompt 中包含其他 Agent 的完整输出
- 使用 TaskCreate/TaskUpdate 跟踪进度
