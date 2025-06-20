# 🚀 NodePassDash

![Version](https://img.shields.io/badge/version-2.0.0.beta7-blue.svg)

NodePassDash是一个现代化的 NodePass 管理界面，基于 Go 后端 + Next.js 14、HeroUI 和 TypeScript 构建。提供实时隧道监控、流量统计和端点管理功能。

## ✨ 主要特性

- 🎯 **实时监控**: 通过 Server-Sent Events (SSE) 实现实时隧道状态更新
- 📊 **流量统计**: 可视化显示隧道流量数据和性能指标
- 🎨 **现代UI**: 基于 HeroUI 的响应式设计，支持深色/浅色主题
- 📱 **移动适配**: 完整的移动端响应式布局，支持各种设备访问
- 🐳 **容器化**: 开箱即用的 Docker 部署方案

## 📸 界面预览

| | | |
|---|---|---|
| ![截图0](docs/00.png) | ![截图1](docs/01.png) | ![截图2](docs/02.png) |
| ![截图3](docs/03.png) | ![截图4](docs/04.png) | ![截图5](docs/05.png) |

## 📂 目录结构（简化）
```text
├─ app/                 前端页面 (Next.js App Router)
│  ├─ ...
├─ internal/            Go 业务代码
│  ├─ api/              HTTP 处理器 / 路由
│  ├─ sse/              SSE Manager & Service
│  └─ ...
├─ cmd/server/          Go 入口 (`main.go`)
├─ public/              SQLite 数据库 / 静态资源
├─ dist/                ⚙️ 前端构建产物（由 `pnpm build` 生成）
├─ Dockerfile           多阶段镜像构建
└─ scripts/             构建辅助脚本
```

## ⚡️ 快速开始

>[>点此体验<](https://dash.nodepass.eu/) [nodepass/np123456]
> 
> ⚠️ **重要提醒：演示环境，请勿更改密码，请勿填写任何敏感信息**


### 方式一：Docker 部署（推荐）

我们提供了完整的 Docker 部署方案，支持：
- 🐳 预构建镜像快速部署
- 📦 本地构建部署
- 🔧 独立容器部署
- 🛡️ 生产环境部署

前端的 API 请求通过 **next.config.js rewrites** 转发到本地后端。

> 📚 查看 [Docker 完整部署文档](docs/DOCKER.md) 了解详细信息

### 方式二：本地开发

#### 环境准备

```bash
# Node 20+ / pnpm 8+ / Go 1.21+
corepack enable && corepack prepare pnpm@latest --activate
```

#### 开发模式

```bash
# ① 终端 A – 后端
cd cmd/server
go run .
# ② 终端 B – 前端 (3000 → 8080 代理到后端)
pnpm dev
```
#### 生产构建

```bash
# 生成 dist/ 静态文件 + Go 可执行文件
pnpm build          # 调用 scripts/build-static.ts
CGO_ENABLED=1 go build -o server ./cmd/server  # 需 gcc, sqlite-dev
```

访问：
- 前端界面: http://localhost:3000


## 🤝 贡献指南

欢迎贡献代码！请遵循以下步骤：

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b features/amazing-features`)
3. 提交更改 (`git commit -m 'Add some amazing features'`)
4. 推送到分支 (`git push origin features/samazing-features`)
5. 开启 Pull Request

## 📄 许可证

本项目基于 [BSD-3-Clause 许可证](LICENSE) 开源。

## 📞 支持

- 🐛 问题报告: [GitHub Issues](https://github.com/NodePassProject/NodePassDash/issues)
- 🐳 Docker 部署: [Docker 指南](docs/DOCKER.md)
- 💬 社区讨论: [Telegram 群组](https://t.me/NodePassGroup)
- 📢 频道: [Telegram 频道](https://t.me/NodePassChannel)

---

⭐ 如果这个项目对你有帮助，请给我们一个 Star！
