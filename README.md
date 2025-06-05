# 🚀 NodePass WebUI

一个现代化的 NodePass 管理界面，基于 Next.js 14、HeroUI 和 TypeScript 构建。提供实时隧道监控、流量统计和端点管理功能。

## ✨ 主要特性

- 🎯 **实时监控**: 通过 Server-Sent Events (SSE) 实现实时隧道状态更新
- 📊 **流量统计**: 可视化显示隧道流量数据和性能指标
- 🔧 **端点管理**: 完整的端点 CRUD 操作和状态监控
- 🎨 **现代UI**: 基于 HeroUI 的响应式设计，支持深色/浅色主题
- 🐳 **Docker化**: 开箱即用的 Docker 部署方案
- 🌍 **国际化**: 针对不同地区优化的网络配置
- 🔒 **SSL 自签名证书支持**：自动兼容 HTTPS 自签名证书

## 🔒 SSL 自签名证书支持

本系统已内置对 SSL 自签名证书的支持，当连接到使用自签名证书的 HTTPS NodePass 端点时：

### 自动处理的场景
- ✅ 创建、启动、停止、删除隧道实例
- ✅ SSE 事件流连接和监听
- ✅ 端点连接测试和验证
- ✅ 实时日志和状态更新

### 技术实现
- 服务器端 API 调用使用自定义 HTTPS Agent，设置 `rejectUnauthorized: false`
- SSE 服务连接自动检测 HTTPS 并跳过 SSL 证书验证
- 所有 NodePass API 调用都支持自签名证书

### 使用方法
无需额外配置，系统会自动检测 HTTPS 连接并适配自签名证书：

```typescript
// 系统会自动处理这样的端点
const endpoint = {
  url: "https://your-nodepass.example.com",  // 自签名证书的HTTPS端点
  apiPath: "/api",
  apiKey: "your-api-key"
};
```

### 安全说明
- 自签名证书支持仅在服务器端 API 调用中启用
- 浏览器端连接仍受浏览器安全策略限制
- 建议在生产环境中使用有效的 SSL 证书

## 🏗️ 技术栈

- **前端框架**: Next.js 14 (App Router)
- **UI 组件库**: HeroUI (NextUI v2)
- **样式框架**: Tailwind CSS
- **动画库**: Framer Motion
- **数据库**: PostgreSQL + Prisma ORM
- **实时通信**: Server-Sent Events (SSE)
- **类型安全**: TypeScript + Zod 验证
- **包管理器**: pnpm

## 🚀 快速开始

### 方式一：Docker 部署（推荐）

#### 使用预构建镜像

```bash
# 下载 Docker Compose 文件
wget https://raw.githubusercontent.com/your-username/nodepass-webui/main/docker-compose.release.yml

# 创建环境变量文件
cat > .env << EOF
POSTGRES_USER=nodepass
POSTGRES_PASSWORD=your_secure_password_here
POSTGRES_DB=nodepass
JWT_SECRET=your_super_secret_jwt_key_change_this_in_production
NODE_ENV=production
EOF

# 启动服务
docker-compose -f docker-compose.release.yml up -d

# 访问应用
open http://localhost:3000
```

#### 本地构建

```bash
# 克隆项目
git clone https://github.com/your-username/nodepass-webui.git
cd nodepass-webui

# 标准版本
docker-compose up -d

# 中国网络优化版本
docker-compose -f docker-compose.china.yml up -d
```

更多 Docker 部署选项，请参阅 [Docker 部署指南](DOCKER.md)。

### 方式二：本地开发

#### 前提条件

- Node.js 18+
- pnpm
- PostgreSQL 数据库

#### 安装步骤

```bash
# 1. 克隆项目
git clone https://github.com/your-username/nodepass-webui.git
cd nodepass-webui

# 2. 安装依赖
pnpm install

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env 文件，设置数据库连接等配置

# 4. 初始化数据库
pnpm db:generate
pnpm db:migrate

# 5. 启动开发服务
pnpm dev:all
```

访问：
- 前端界面: http://localhost:3000
- 后端 SSE 服务: http://localhost:3001

## 📦 可用的 Docker 镜像

我们在 GitHub Container Registry 提供多个预构建镜像：

```bash
# 最新开发版本
ghcr.io/your-username/nodepass-webui:latest

# 中国网络优化版本
ghcr.io/your-username/nodepass-webui:china

# 生产环境版本
ghcr.io/your-username/nodepass-webui:production

# 特定版本
ghcr.io/your-username/nodepass-webui:v1.0.0
```

## 🛠️ 开发指南

### 项目结构

```
nodepass-webui/
├── app/                    # Next.js App Router 页面
├── components/             # React 组件
├── lib/                   # 工具库和配置
├── prisma/                # 数据库模式和迁移
├── scripts/               # 构建和部署脚本
├── types/                 # TypeScript 类型定义
├── Dockerfile             # 标准 Docker 配置
├── Dockerfile.china       # 中国网络优化版本
├── docker-compose.yml     # 开发环境 Docker Compose
└── docker-compose.china.yml # 中国环境 Docker Compose
```

### 可用脚本

```bash
# 开发
pnpm dev                # 启动前端开发服务器
pnpm sse               # 启动 SSE 后端服务
pnpm dev:all           # 同时启动前后端服务

# 构建
pnpm build             # 构建前端
pnpm build:all         # 构建前后端

# 数据库
pnpm db:generate       # 生成 Prisma 客户端
pnpm db:migrate        # 运行数据库迁移
pnpm db:push           # 推送模式变更到数据库

# 代码质量
pnpm lint              # 运行 ESLint
pnpm type-check        # TypeScript 类型检查
```

## ⚙️ 配置说明

### 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `DATABASE_URL` | - | PostgreSQL 连接字符串 |
| `JWT_SECRET` | - | JWT 密钥 |
| `NODE_ENV` | `development` | 运行环境 |
| `CORS_ORIGIN` | `http://localhost:3000` | CORS 允许的源 |
| `NEXT_PUBLIC_SSE_API_URL` | `http://localhost:3001` | SSE 服务地址 |

### 数据库配置

项目使用 PostgreSQL 作为主数据库，通过 Prisma ORM 进行管理：

```bash
# 创建新迁移
pnpm exec prisma migrate dev --name your_migration_name

# 重置数据库
pnpm exec prisma migrate reset

# 查看数据库
pnpm exec prisma studio
```

## 🌍 地区化支持

### 中国大陆用户

针对中国网络环境，我们提供了专门优化的版本：

- 使用阿里云 Docker 镜像源
- 配置 npm 淘宝镜像
- 优化依赖安装速度

```bash
# 使用中国优化版本
docker-compose -f docker-compose.china.yml up -d

# 或直接使用中国版镜像
docker pull ghcr.io/your-username/nodepass-webui:china
```

## 📊 健康检查

应用内置了完整的健康检查功能：

```bash
# 访问健康检查端点
curl http://localhost:3000/api/health

# 检查 Docker 容器健康状态
docker inspect --format='{{.State.Health.Status}}' nodepass-app
```

健康检查包括：
- ✅ 数据库连接状态
- ✅ 内存使用情况
- ✅ 应用运行时间
- ✅ 前后端服务状态

## 🚦 系统要求

### 最低要求
- CPU: 1 核心
- 内存: 512MB
- 存储: 1GB

### 推荐配置
- CPU: 2+ 核心
- 内存: 1GB+
- 存储: 5GB+

## 🤝 贡献指南

欢迎贡献代码！请遵循以下步骤：

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add some amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 开启 Pull Request

## 📄 许可证

本项目基于 [MIT 许可证](LICENSE) 开源。

## 📞 支持

- 🐛 问题报告: [GitHub Issues](https://github.com/your-username/nodepass-webui/issues)
- 📖 文档: [项目 Wiki](https://github.com/your-username/nodepass-webui/wiki)
- 💬 社区讨论: [GitHub Discussions](https://github.com/your-username/nodepass-webui/discussions)
- 🐳 Docker 部署: [Docker 指南](DOCKER.md)

---

⭐ 如果这个项目对你有帮助，请给我们一个 Star！
