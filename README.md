# 多账本记账应用（Multi-Ledger Accounting）

一套面向个人 / 家庭 / 小生意的记账 Web 应用：支持多账本并行记账，每个账本拥有独立的一套账户与分类配置，流水支持支出、收入与账户间转账，数据保存在云端，手机浏览器与 PC 网页均可用。

> 技术设计文档见 [`docs/design.md`](docs/design.md)。

## 功能特性

- **多账本**：一个用户可拥有多个账本，账本之间数据完全隔离（RLS 行级安全）。
- **每账本独立账户配置**：账户从属于账本，支持现金、借记卡、信用卡、电子钱包、投资、应收、负债等类型。
- **流水规则**：支出 / 收入流水关联 1 个账户；转账流水关联 2 个账户（转出 + 转入），一条流水原子表达，最多 2 个、不允许 0 个。
- **分类体系**：支出 / 收入 / 转账分类，支持按账本自定义，并内置系统分类模板。
- **余额与报表**：余额不落库，按流水实时聚合计算；报表页含图表统计（Recharts，路由级懒加载）。
- **云端同步**：登录后会话自动附加到数据请求，换设备、换浏览器可恢复；不依赖 localStorage 作为唯一存储。
- **双端适配**：移动端优先的响应式布局，同时适配 PC。

## 技术栈

| 类别 | 选型 |
| --- | --- |
| 框架 | React 19 + TypeScript 5.6 |
| 构建 | Vite 6 |
| 路由 | react-router-dom（HashRouter，适配无 history fallback 的静态托管） |
| 状态 | Zustand + TanStack React Query |
| 样式 | Tailwind CSS 4（`@tailwindcss/vite` 插件） |
| 图表 | Recharts |
| 测试 | Vitest |
| 后端 | 托管云服务（Auth + PostgreSQL + Storage），通过 `@tencent-ai/workbuddy-cloud-sdk` 单一 client 访问 |

## 项目结构

```
├── docs/
│   └── design.md          # 技术设计文档
├── sql/                   # 数据库迁移脚本（归档用，应用代码不执行 DDL）
│   ├── 001_schema.sql     # 表结构：books / accounts / categories / transactions 等
│   ├── 002_functions.sql  # PostgreSQL 函数：余额 / 报表 / 校验
│   └── 003_seed_templates.sql  # 内置分类模板种子数据
├── site/                  # 构建产物输出目录（发布时以此为根静态托管）
├── src/
│   ├── auth/              # 登录会话与登录状态恢复
│   ├── cloud/             # 云服务 client 与数据库类型定义
│   ├── components/        # 通用 UI 组件（AppShell 等）
│   ├── data/              # 数据访问层
│   ├── lib/               # 领域逻辑（金额、流水、错误处理）+ 单元测试
│   ├── pages/             # 页面：账本列表、概览、流水、流水详情、账户详情、报表、账本设置等
│   ├── store/             # Zustand 全局状态
│   ├── App.tsx            # 路由与登录门禁（RequireAuth）
│   └── main.tsx
├── index.html
├── vite.config.ts
└── package.json
```

## 快速开始

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 类型检查
npm run typecheck

# 运行单元测试
npm test

# 构建生产版本（产物输出到 site/）
npm run build

# 本地预览构建产物
npm run preview
```

## 构建与发布说明

- 构建产物输出到 **`site/`**（而非默认的 `dist/`），发布时由静态服务器以 `site/` 为根目录托管；`site/` 不应写入 `.gitignore`。
- 产物使用相对路径（`base: './'`），可发布到任意根域名。
- 路由使用 `HashRouter`，因为静态托管没有 history fallback。

## 数据库迁移

`sql/` 下的脚本仅作为可复现的迁移归档，通过云端数据库管理工具按编号顺序执行（mode=migrate），应用代码绝不执行 DDL。要点：

- 所有业务表带 `owner_id` 并启用 RLS 实现用户数据隔离。
- 金额以 `BIGINT` 存「分」，恒为正，方向由 `type` 决定，避免浮点误差。
- 余额不落库，按流水实时聚合，避免缓存与流水不一致。
- `validate_txn_accounts()` 使用 `SECURITY INVOKER`，保证校验不绕过 RLS。

## 测试

单元测试位于 `src/lib/*.test.ts`（金额处理、流水逻辑等），使用 Vitest：

```bash
npm test
```
