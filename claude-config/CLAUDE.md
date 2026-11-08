Always respond in Chinese-simplified

# 用户画像

- **身份**：独立开发者 / 全栈 Builder，正在注册个体工商户，走商业化路线
- **GitHub**：TimeCraker（Huanrui Zhang），11 个公开仓库
- **定位**：「AI 时代独立架构师」，差异化能力 = AI + 全栈 + 小程序 + 硬件（蓝牙/语音/PCB/机械键盘）
- **环境**：Windows 11，PowerShell 为主 shell，位于 China（需要代理访问 GitHub/npm）
- **开发方式**：AI coding 驱动（Cursor + Claude Code），不喜欢手动写大量代码
- **技术栈态度**：无固定偏好，每个项目用最合适的技术栈。AI coding 降低了技术门槛，应该大胆用最合适的新栈
- **语言偏好**：中文交流，代码和 commit 使用英文/Conventional Commits

# 工作习惯

- **权限模式**：bypass permissions on，可以自主执行大部分操作不需要逐个确认
- **不要让用户手动操作**：Docker 没运行就自己启动，能自动化的步骤不要中断等人
- **自主执行**：能判断的就直接做，不要反复问用户确认，除非是破坏性操作或重大方向选择
- **进度必须勾选**：每完成一个任务立即在对应 markdown 中 `[x]` 标记，不要批量等待
- **阶段化交付**：未写 stage spec 不允许动业务代码；每完成一个 task 就 commit
- **不要过度架构**：判断标准 = "这个改动能让付费用户多一个，还是只是让代码更工整？" 后者一律推迟
- **同一时间最多 1 个在研 side 项目**，避免精力分散
- **网络重试**：GitHub API 调用失败时自动重试（最多 3 次，指数退避）

# 当前项目矩阵

## ResuAIX（AI 简历工具）— 主力产品
- **状态**：全部 14 Phase / 91 任务已完成，功能冻结，等个体工商户注册后接微信支付商用
- **架构**：Turborepo monorepo，Next.js 15 + Fastify + PostgreSQL + Redis + Prisma
- **AI 底座**：SiliconFlow（DeepSeek），OpenAI-compatible SDK
- **Auth**：next-auth v4 + JWT，微信 OAuth 待公司注册后配置
- **计费**：T-Coin 体系，Admin 手动调币可过渡
- **铁律**：不再加功能，只修 Bug + 接正式支付

## 商业矩阵规划（4 块）
- C 端：ResuAIX + 面试模拟器（语音+文本混合 PTT 模式）
- B 端：企业知识库 RAG Demo（LobeChat Docker + 自定义 Provider）
- 流量：自用 AI 文案自动流（小红书/闲鱼/知乎）
- 硬件：零研发，只挂主页广告接定制单
- **主 Plan 文件**：`main land/.cursor/plans/商业矩阵开源复用规划_86813991.plan.md`（730+ 行）

## AGI7（Genesis V2）— 研究项目
- Agent 进化实验平台，Python
- 待实施：LLM Judge 模式（agent 输出中文 → LLM 打分 → 能量奖励）
- Elite agents 保存在 `genesis_v2/data/survivors/`

## AsterNova — 游戏项目
- 前端：asternova-web-client（TypeScript）
- 后端：game-backend-demo（Go，WebSocket）

# 技术栈原则

- **无固定偏好**：每个项目用最合适的技术栈，AI coding 让切换栈的成本极低
- **选型标准**：生态成熟度 > 个人熟悉度。哪个栈对该场景最合适就用哪个
- **已用过的栈**：Next.js/Fastify/Prisma/Go/Python/FastAPI/Docker 等，都能驾驭
- **依赖代理**：`go env -w GOPROXY=https://goproxy.cn,direct` / `npm config set registry https://registry.npmmirror.com`

# 已安装的 MCP 服务器

配置文件：`~/.claude/.mcp.json`
- fetch（uvx）、github（npx，需 GITHUB_PERSONAL_ACCESS_TOKEN）、filesystem（npx）、pdf（npx）

# AI 工具接力分工

- **Claude Code = 机器干活**：按 stage spec 走、跑命令、批量改文件
- **Cursor = 人机协作 + 救火**：实时调试、UI 微调、复杂卡点
- 切换前必须 git status + commit
- 主 Plan 修改权留在用户和 Cursor，Claude Code 只改 stage spec + 业务代码
