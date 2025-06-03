# 🐳 NodePass WebUI Docker 部署指南

NodePass WebUI 提供了完整的 Docker 化解决方案，支持快速部署和一键启动。

## 📦 可用镜像

### GitHub Container Registry

我们提供预构建镜像：

```bash
# 最新版本 (v1.0.0)
docker pull ghcr.io/mecozea/nodepass-webui:latest
```

## 🚀 快速开始

### 方式一：使用预构建镜像（推荐）

1. **下载 Docker Compose 文件**
   ```bash
   wget https://raw.githubusercontent.com/Mecozea/nodepass-webui/main/docker-compose.yml
   ```

2. **创建环境变量文件**
   ```bash
   cat > .env << EOF
   POSTGRES_USER=nodepass
   POSTGRES_PASSWORD=your_secure_password_here
   POSTGRES_DB=nodepass
   JWT_SECRET=your_super_secret_jwt_key_change_this_in_production
   NODE_ENV=production
   EOF
   ```

3. **启动服务**
   ```bash
   docker-compose up -d
   ```

4. **访问应用**
   - 前端界面: http://localhost:3000
   - 后端SSE服务: http://localhost:3001
   - 健康检查: http://localhost:3000/api/health

### 方式二：本地构建

```bash
# 克隆项目
git clone https://github.com/Mecozea/nodepass-webui.git
cd nodepass-webui

# 构建并启动
docker-compose up -d
```

## ⚙️ 环境变量配置

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `DATABASE_URL` | 自动生成 | PostgreSQL 连接字符串 |
| `POSTGRES_USER` | `nodepass` | 数据库用户名 |
| `POSTGRES_PASSWORD` | `nodepass123` | 数据库密码 |
| `POSTGRES_DB` | `nodepass` | 数据库名称 |
| `JWT_SECRET` | 自动生成 | JWT 密钥 (生产环境必须修改) |
| `NODE_ENV` | `production` | 运行环境 |
| `CORS_ORIGIN` | `http://localhost:3000` | CORS 允许的源 |
| `NEXT_PUBLIC_SSE_API_URL` | `http://localhost:3001` | SSE 服务地址 |

## 🐳 服务端口

| 服务 | 容器端口 | 主机端口 | 说明 |
|------|----------|----------|------|
| 前端应用 | 3000 | 3000 | Next.js Web 应用 |
| SSE 服务 | 3001 | 3001 | 实时事件推送服务 |
| 数据库 | 5432 | 5432 | PostgreSQL 数据库 |

## 📊 健康检查

应用内置了完整的健康检查功能：

```bash
# 检查容器健康状态
docker inspect --format='{{.State.Health.Status}}' nodepass-app

# 访问健康检查端点
curl http://localhost:3000/api/health
```

健康检查包括：
- ✅ 数据库连接状态
- ✅ 内存使用情况
- ✅ 应用运行时间
- ✅ 前后端服务状态

## 🔧 故障排除

### 常见问题

#### 1. 数据库连接失败
```bash
# 检查 PostgreSQL 容器状态
docker-compose logs postgres

# 手动测试数据库连接
docker-compose exec postgres psql -U nodepass -d nodepass -c "SELECT 1;"
```

#### 2. 应用启动缓慢
```bash
# 查看应用启动日志
docker-compose logs -f app

# 检查资源使用情况
docker stats nodepass-app
```

#### 3. 端口冲突
```bash
# 修改 docker-compose.yml 中的端口映射
ports:
  - "3002:3000"  # 将主机端口改为3002
  - "3003:3001"  # 将主机端口改为3003
```

### 日志查看

```bash
# 查看所有服务日志
docker-compose logs

# 查看特定服务日志
docker-compose logs app
docker-compose logs postgres

# 实时跟踪日志
docker-compose logs -f app
```

## 🔄 更新和维护

### 更新到最新版本

```bash
# 拉取最新镜像
docker-compose pull

# 重启服务
docker-compose up -d
```

### 数据备份

```bash
# 备份 PostgreSQL 数据库
docker-compose exec postgres pg_dump -U nodepass nodepass > backup.sql

# 恢复数据库
docker-compose exec -T postgres psql -U nodepass nodepass < backup.sql
```

### 清理

```bash
# 停止并删除容器
docker-compose down

# 删除数据卷 (⚠️ 注意：会丢失所有数据)
docker-compose down -v

# 清理未使用的镜像
docker image prune -a
```

## 📈 生产环境优化

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

### 数据持久化

```yaml
# 确保数据卷持久化
volumes:
  postgres_data:
    driver: local
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

### 3. 使用非root用户
```dockerfile
# 在 Dockerfile 中
USER node
```

## 🚦 系统要求

### 最低要求
- Docker Engine 20.0+
- Docker Compose 2.0+
- 可用内存: 512MB
- 可用存储: 1GB

### 推荐配置
- Docker Engine 24.0+
- Docker Compose 2.20+
- 可用内存: 1GB+
- 可用存储: 5GB+

## 📞 支持

- 🐛 问题报告: [GitHub Issues](https://github.com/Mecozea/nodepass-webui/issues)
- 📖 文档: [项目 Wiki](https://github.com/Mecozea/nodepass-webui/wiki)
- 💬 社区讨论: [GitHub Discussions](https://github.com/Mecozea/nodepass-webui/discussions)

## 📄 许可证

本项目基于 [MIT 许可证](LICENSE) 开源。 