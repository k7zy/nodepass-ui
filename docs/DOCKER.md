# 🐳 NodePass WebUI Docker 部署指南

NodePass WebUI 提供了完整的 Docker 化解决方案，支持快速部署和一键启动。

## 🏗️ 架构概述

NodePass WebUI 采用**整合架构**设计：
- **单端口运行**: 只使用 3000 端口
- **SSE服务整合**: SSE服务直接运行在 Next.js 应用内
- **简化部署**: 更简单的配置和管理
- **SQLite数据库**: 使用文件型数据库，无需额外服务
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
> docker logs nodepass-webui | grep -A 6 "系统初始化完成"
>
> # 你将看到如下信息：
> ================================
> 🚀 NodePass 系统初始化完成！
> ================================
> 管理员账户信息：
> 用户名: xxxxxx
> 密码: xxxxxxxxxxxx
> ================================
> ⚠️  请妥善保存这些信息！
> ================================
> ```
> 
> **⚠️ 安全提示：** 
> - 请在首次登录后立即修改管理员密码
> - 初始密码仅会显示一次，请务必及时保存
> - 如果错过初始密码，需要删除数据库文件并重新部署

### 方式一：使用预构建镜像（推荐）

```bash
# 1. 下载 Docker Compose 文件并重命名
wget https://raw.githubusercontent.com/Mecozea/nodepass-webui/main/docker-compose.release.yml -O docker-compose.yml

# 2. 创建必要目录
mkdir -p logs public && chmod 777 logs public

# 3. 修改docker-compose.yml文件的环境变量JWT_SECRET

# 4. 启动服务
docker compose up -d  # 如果使用 Docker Plugin
# 或
docker-compose up -d  # 如果使用独立安装的 docker-compose
```

### 方式二：使用 Docker 命令启动

```bash
# 1. 拉取镜像
docker pull ghcr.io/mecozea/nodepass-webui:latest

# 2. 创建必要目录
mkdir -p logs public && chmod 777 logs public

# 3. 修改 JWT_SECRET 并启动容器
docker run -d \
  --name nodepass-webui \
  -p 3000:3000 \
  -v ./logs:/app/logs \
  -v ./public:/app/public \
  -e JWT_SECRET=your_super_secret_jwt_key \
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

### 环境变量说明

| 变量名 | 描述 | 默认值 | 必需 |
|--------|------|--------|------|
| `JWT_SECRET` | JWT密钥 | - | ✅ |

## 🔧 服务配置

### 端口映射

| 服务 | 容器端口 | 主机端口 | 说明 |
|------|----------|----------|------|
| Next.js + SSE | 3000 | 3000 | 整合的Web应用 |

### Docker Compose 配置

- **开发环境**: `docker-compose.yml` - 本地构建和开发
- **生产环境**: `docker-compose.release.yml` - 使用预构建镜像

### 数据持久化

SQLite 数据库文件存储在 `public/sqlite.db`，通过 Docker 卷挂载实现持久化：
```yaml
volumes:
  - ./public:/app/public  # SQLite 数据库文件
```

## 📦 可用镜像

### GitHub Container Registry

我们提供预构建镜像：

```bash
# 最新版本
docker pull ghcr.io/mecozea/nodepass-webui:latest

# 特定版本
docker pull ghcr.io/mecozea/nodepass-webui:v1.2.0
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

#### 2. 数据库访问错误
```bash
# 检查数据库文件权限
ls -l public/sqlite.db

# 修复权限
chmod 666 public/sqlite.db
```

#### 3. 应用启动失败
```bash
# 查看详细日志
docker-compose logs -f webui

# 进入容器调试
docker exec -it nodepass-webui sh

# 检查 Prisma 状态
docker exec -it nodepass-webui pnpm exec prisma migrate status
```

### 日志查看

```bash
# 查看所有服务日志
docker-compose logs -f

# 只查看应用日志
docker-compose logs -f webui
```


## 📈 性能优化

### 系统要求

**最低要求**:
- Docker Engine 20.0+
- Docker Compose 2.0+
- 可用内存: 256MB
- 可用存储: 500MB

**推荐配置**:
- Docker Engine 24.0+
- Docker Compose 2.20+
- 可用内存: 512MB+
- 可用存储: 1GB+

## 🛡️ 安全建议

### 1. 修改默认密码
```bash
# 生成强密码
JWT_SECRET=$(openssl rand -base64 32)
```

### 2. 数据备份
```bash
# 备份 SQLite 数据库
docker-compose stop webui  # 停止服务以确保数据一致性
cp public/sqlite.db public/sqlite.db.backup
docker-compose start webui

# 恢复数据库
docker-compose stop webui
cp public/sqlite.db.backup public/sqlite.db
docker-compose start webui
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

# 删除数据（⚠️ 注意：会删除所有数据）
rm -rf public/sqlite.db

# 清理未使用的镜像
docker image prune -a
```