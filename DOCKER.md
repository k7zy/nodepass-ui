# 🐳 NodePass WebUI Docker 部署指南

NodePass WebUI 提供了完整的 Docker 化解决方案，支持快速部署和一键启动。

## 🏗️ 架构概述

NodePass WebUI 采用**整合架构**设计：
- **单端口运行**: 只使用 3000 端口
- **SSE服务整合**: SSE服务直接运行在 Next.js 应用内
- **简化部署**: 更简单的配置和管理
- **性能优化**: 减少网络开销和延迟

## 🚀 快速开始

> ⚠️ **重要提醒：系统初始化**
> 
> 首次部署时，系统会自动初始化并创建管理员账户。部署完成后，请立即执行以下命令查看初始登录信息：
> ```bash
> # 如果使用 Docker Plugin
> docker compose logs | grep -A 6 "系统初始化完成"
> # 或使用独立安装的 docker-compose
> docker-compose logs | grep -A 6 "系统初始化完成"
> # 如果使用 Docker 命令
> docker logs nodepass-app | grep -A 6 "系统初始化完成"
>
> # 你将看到如下信息：
> ================================
> 🚀 NodePass 系统初始化完成！
> ================================
> 管理员账户信息：
> 用户名: nodepass
> 密码: SHqgYw7eX95w
> ================================
> ⚠️  请妥善保存这些信息！
> ================================
> ```
> 
> **⚠️ 安全提示：** 
> - 请在首次登录后立即修改管理员密码
> - 初始密码仅会显示一次，请务必及时保存
> - 如果错过初始密码，需要重置数据库并重新部署

### 方式一：使用预构建镜像（推荐）

```bash
# 1. 下载 Docker Compose 文件并重命名
wget https://raw.githubusercontent.com/Mecozea/nodepass-webui/main/docker-compose.release.yml -O docker-compose.yml

# 2. 创建环境变量文件
cat > .env << EOF
POSTGRES_USER=nodepass
POSTGRES_PASSWORD=your_secure_password
POSTGRES_DB=nodepass
# 可以使用以下命令生成 JWT_SECRET：
# openssl rand -base64 32
# 或访问 https://generate-secret.vercel.app/32 生成
JWT_SECRET=your_super_secret_jwt_key
NODE_ENV=production
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000  # 云端部署时改为实际域名
EOF

# 3. 创建日志目录并设置权限
mkdir -p logs && chmod 777 logs

# 4. 启动服务
docker compose up -d  # 如果使用 Docker Plugin
# 或
docker-compose up -d  # 如果使用独立安装的 docker-compose
```

### 方式二：使用 Docker 命令启动（需要自备 PostgreSQL）

> ⚠️ 注意：此方式需要您已经有一个可用的 PostgreSQL 数据库实例

```bash
# 1. 拉取镜像
docker pull ghcr.io/mecozea/nodepass-webui:latest

# 2. 创建日志目录并设置权限
mkdir -p logs && chmod 777 logs

# 3. 启动容器
docker run -d \
  --name nodepass-webui \
  -p 3000:3000 \
  -v ./logs:/app/logs \
  -e POSTGRES_USER=nodepass \
  -e POSTGRES_PASSWORD=your_secure_password \
  -e POSTGRES_DB=nodepass \
  -e JWT_SECRET=your_super_secret_jwt_key \
  -e DATABASE_URL="postgresql://nodepass:your_secure_password@your_db_host:5432/nodepass" \
  -e NODE_ENV=production \
  -e NEXT_PUBLIC_API_BASE_URL=http://localhost:3000 \
  ghcr.io/mecozea/nodepass-webui:latest
```

### 方式三：本地构建

```bash
# 1. 克隆项目
git clone https://github.com/Mecozea/nodepass-webui.git
cd nodepass-webui

# 2. 启动整合模式
pnpm docker:up:integrated

# 3. 查看日志
pnpm docker:logs

# 4. 访问应用
# http://localhost:3000
```

## 📋 可用脚本

> ⚠️ 注意：如果您使用的是 Docker Plugin 方式，请将以下命令中的 `docker-compose` 替换为 `docker compose`

```bash
pnpm docker:up:integrated      # 启动整合模式 (后台)
pnpm docker:up                 # 启动整合模式 (后台)
pnpm docker:logs               # 查看应用日志
pnpm docker:restart            # 重启应用
pnpm docker:down               # 停止服务
pnpm docker:build              # 构建镜像
```

## ⚙️ 环境配置

### 环境变量文件 (`env.docker` 或 `.env`)
```bash
# 数据库配置
POSTGRES_USER=nodepass
POSTGRES_PASSWORD=nodepass123
POSTGRES_DB=nodepass

# 应用配置
JWT_SECRET=docker-super-secret-jwt-key-change-in-production
NODE_ENV=production

# 网络配置
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000
```

### 环境变量说明

| 变量名 | 描述 | 默认值 | 必需 |
|--------|------|--------|------|
| `DATABASE_URL` | PostgreSQL连接字符串 | 自动生成 | ✅ |
| `POSTGRES_USER` | 数据库用户名 | `nodepass` | ✅ |
| `POSTGRES_PASSWORD` | 数据库密码 | `nodepass123` | ✅ |
| `POSTGRES_DB` | 数据库名称 | `nodepass` | ✅ |
| `JWT_SECRET` | JWT密钥 | - | ✅ |
| `NODE_ENV` | 运行环境 | `development` | ❌ |
| `NEXT_PUBLIC_API_BASE_URL` | API基础URL | `http://localhost:3000` | ❌ |

> ⚠️ **云端部署重要提示**: 部署到云端服务器时，**必须**设置 `NEXT_PUBLIC_API_BASE_URL` 为实际的域名，例如：
> - `NEXT_PUBLIC_API_BASE_URL=https://nodepass.yourdomain.com`
> - `NEXT_PUBLIC_API_BASE_URL=http://your-server-ip:3000`

## 🔧 服务配置

### 端口映射

| 服务 | 容器端口 | 主机端口 | 说明 |
|------|----------|----------|------|
| Next.js + SSE | 3000 | 3000 | 整合的Web应用 |
| PostgreSQL | 5432 | 5432 | 数据库服务 |

### Docker Compose 配置

- **开发环境**: `docker-compose.yml` - 本地构建和开发
- **生产环境**: `docker-compose.release.yml` - 使用预构建镜像

## 📦 可用镜像

### GitHub Container Registry

我们提供预构建镜像：

```bash
# 最新版本
docker pull ghcr.io/mecozea/nodepass-webui:latest

# 特定版本
docker pull ghcr.io/mecozea/nodepass-webui:v1.1.1
```

## 🐛 故障排除

### 常见问题

#### 1. 端口冲突
```bash
# 检查端口占用
netstat -tulpn | grep :3000

# 停止服务
docker-compose down
```

#### 2. 数据库连接失败
```bash
# 检查 PostgreSQL 容器状态
docker-compose ps postgres

# 查看数据库日志
docker-compose logs postgres

# 重启数据库
docker-compose restart postgres
```

#### 3. 应用启动失败
```bash
# 查看详细日志
docker-compose logs -f app

# 进入容器调试
docker exec -it nodepass-app sh

# 检查 Prisma 状态
docker exec -it nodepass-app pnpm exec prisma migrate status
```

### 日志查看

```bash
# 查看所有服务日志
docker-compose logs -f

# 只查看应用日志
docker-compose logs -f app

# 只查看数据库日志
docker-compose logs -f postgres
```

## 📊 健康检查

应用内置了完整的健康检查功能：
- **检查地址**: `http://localhost:3000/api/health`
- **检查间隔**: 30秒
- **超时时间**: 10秒
- **重试次数**: 5次

健康检查包括：
- ✅ 数据库连接状态
- ✅ 内存使用情况
- ✅ 应用运行时间
- ✅ SSE服务状态

## 🚀 生产部署

### 使用预构建镜像（推荐）

```bash
# 1. 下载生产配置并重命名
wget https://raw.githubusercontent.com/Mecozea/nodepass-webui/main/docker-compose.release.yml -O docker-compose.yml

# 2. 设置生产环境变量
cat > .env << EOF
POSTGRES_USER=nodepass
POSTGRES_PASSWORD=$(openssl rand -base64 32)
POSTGRES_DB=nodepass
JWT_SECRET=$(openssl rand -base64 32)
NODE_ENV=production
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000
EOF

# 3. 创建日志目录并设置权限
mkdir -p logs && chmod 777 logs

# 4. 启动生产服务
docker compose up -d  # 如果使用 Docker Plugin
# 或
docker-compose up -d  # 如果使用独立安装的 docker-compose
```

### 自定义构建

```bash
# 构建生产镜像
docker build --target production -t nodepass-webui:latest .

# 创建日志目录并设置权限
mkdir -p logs && chmod 777 logs

# 运行生产容器
docker run -d \
  --name nodepass-production \
  -p 3000:3000 \
  -v ./logs:/app/logs \
  -e DATABASE_URL="your-production-db-url" \
  -e JWT_SECRET="your-production-jwt-secret" \
  -e NODE_ENV=production \
  -e NEXT_PUBLIC_API_BASE_URL=http://localhost:3000 \
  nodepass-webui:latest
```

## 📈 性能优化

### 系统要求

**最低要求**:
- Docker Engine 20.0+
- Docker Compose 2.0+
- 可用内存: 512MB
- 可用存储: 1GB

**推荐配置**:
- Docker Engine 24.0+
- Docker Compose 2.20+
- 可用内存: 1GB+
- 可用存储: 5GB+

### 资源限制

```yaml
# 在 docker-compose.yml 中添加
services:
  app:
    deploy:
      resources:
        limits:
          memory: 1G
          cpus: '0.5'
        reservations:
          memory: 512M
          cpus: '0.25'
```

## 🛡️ 安全建议

### 1. 修改默认密码
```bash
# 生成强密码
POSTGRES_PASSWORD=$(openssl rand -base64 32)
JWT_SECRET=$(openssl rand -base64 32)
```

### 2. 限制端口暴露
```yaml
# 只在本地暴露数据库端口
services:
  postgres:
    ports:
      - "127.0.0.1:5432:5432"
```

### 3. 数据备份
```bash
# 备份 PostgreSQL 数据库
docker-compose exec postgres pg_dump -U nodepass nodepass > backup.sql

# 恢复数据库
docker-compose exec -T postgres psql -U nodepass nodepass < backup.sql
```

## 🔄 更新和维护

### 更新到最新版本

```bash
# 拉取最新镜像
docker compose pull  # 如果使用 Docker Plugin
# 或
docker-compose pull  # 如果使用独立安装的 docker-compose

# 重启服务
docker compose up -d  # 如果使用 Docker Plugin
# 或
docker-compose up -d  # 如果使用独立安装的 docker-compose
```

### 清理

```bash
# 停止并删除容器
docker compose down  # 如果使用 Docker Plugin
# 或
docker-compose down  # 如果使用独立安装的 docker-compose

# 删除数据卷 (⚠️ 注意：会丢失所有数据)
docker compose down -v  # 如果使用 Docker Plugin
# 或
docker-compose down -v  # 如果使用独立安装的 docker-compose

# 清理未使用的镜像
docker image prune -a
```

## 📝 更多信息

- [SSE服务整合文档](./SSE_INTEGRATION.md)
- [API文档](./api.md)
- [开发指南](./README.md)
- [GitHub仓库](https://github.com/Mecozea/nodepass-webui)

## 📞 支持

- 🐛 问题报告: [GitHub Issues](https://github.com/Mecozea/nodepass-webui/issues)
- 📖 文档: [项目 Wiki](https://github.com/Mecozea/nodepass-webui/wiki)
- 💬 社区讨论: [GitHub Discussions](https://github.com/Mecozea/nodepass-webui/discussions)

## 📄 许可证

本项目基于 [MIT 许可证](https://github.com/Mecozea/nodepass-webui/blob/main/LICENSE) 开源。