---
name: project-workflow
description: Core development workflow rules and conventions
---

# 开发工作流规则

## 文件组织
- Go 项目遵循 standard Go project layout
- 前端组件使用 PascalCase 命名
- 测试文件与源文件同目录

## Git 规范
- Commit message 使用 Conventional Commits 格式
- 分支命名：`feature/`, `fix/`, `refactor/`, `docs/`
- PR 必须包含中文描述

## 代码质量
- 所有公开函数必须有 godoc 注释
- 单元测试覆盖率目标 > 80%
- 使用 golangci-lint 进行静态分析

## 依赖管理
- 如遇网络问题，优先使用代理：`go env -w GOPROXY=https://goproxy.cn,direct`
- npm 使用淘宝镜像：`npm config set registry https://registry.npmmirror.com`
