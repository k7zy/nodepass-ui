# Docker 部署指南

## 🐳 概述

这个项目通过Docker实现：
- **单容器应用**：前端(3000) + 后端SSE(3001) 同时运行，就像 `pnpm dev:all`
- **PostgreSQL数据库**：独立容器
- **自动初始化**：数据库迁移和种子数据

## 🚀 快速启动

### 方法一：使用默认配置

```bash
# 1. 构建并启动
docker-compose up --build

# 后台运行
docker-compose up --build -d

# 查看日志
docker-compose logs -f app
```

### 方法二：使用自定义环境变量

```bash
# 1. 复制并编辑环境变量文件
cp env.docker .env
# 编辑 .env 文件，修改数据库密码等配置

# 2. 启动服务
docker-compose --env-file .env up --build
```

### 方法三：命令行指定环境变量

```bash
# 指定环境变量启动
POSTGRES_PASSWORD=my_secure_password \
JWT_SECRET=my-super-secret-key \
docker-compose up --build
```

## 📁 项目结构（Docker化后）

```
项目根目录/
├── Dockerfile                 # 多阶段构建文件
├── docker-compose.yml         # 主要编排文件
├── docker-compose.dev.yml     # 开发环境编排（已删除）
├── env.docker                 # 环境变量示例
└── DOCKER_SETUP.md           # 本文档
```

## 🔧 配置说明

### 环境变量配置

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `POSTGRES_USER` | nodepass | 数据库用户名 |
| `POSTGRES_PASSWORD` | nodepass123 | 数据库密码 |
| `POSTGRES_DB` | nodepass | 数据库名 |
| `JWT_SECRET` | (默认值) | JWT密钥，生产环境必须修改 |
| `NODE_ENV` | production | 运行环境 |

### 端口映射

| 服务 | 容器端口 | 主机端口 | 说明 |
|------|----------|----------|------|
| 前端 | 3000 | 3000 | Next.js应用 |
| 后端 | 3001 | 3001 | SSE服务 |
| 数据库 | 5432 | 5432 | PostgreSQL |

## 🎯 使用场景

### 开发环境

```bash
# 启动开发环境（支持热重载）
NODE_ENV=development docker-compose up --build

# 或者修改 env.docker 文件
echo "NODE_ENV=development" >> env.docker
docker-compose --env-file env.docker up --build
```

### 生产环境

```bash
# 生产环境启动
NODE_ENV=production \
POSTGRES_PASSWORD=secure_production_password \
JWT_SECRET=super-secure-production-jwt-key \
docker-compose up --build -d
```

## 📊 数据库管理

### 初始化数据库

容器启动时会自动：
1. 等待PostgreSQL启动
2. 运行 `prisma migrate deploy`
3. 尝试运行种子数据（如果有）

### 手动数据库操作

```bash
# 进入应用容器
docker-compose exec app sh

# 在容器内执行 Prisma 命令
pnpm exec prisma migrate reset
pnpm exec prisma db seed
pnpm exec prisma studio
```

### 查看数据库

```bash
# 进入数据库容器
docker-compose exec postgres psql -U nodepass -d nodepass

# 或使用数据库客户端连接
# Host: localhost
# Port: 5432
# User: nodepass (或你设置的值)
# Password: nodepass123 (或你设置的值)
# Database: nodepass
```

## 🔍 调试和排错

### 查看日志

```bash
# 查看所有服务日志
docker-compose logs

# 查看应用日志
docker-compose logs app

# 查看数据库日志
docker-compose logs postgres

# 实时跟踪日志
docker-compose logs -f app
```

### 进入容器调试

```bash
# 进入应用容器
docker-compose exec app sh

# 检查进程
docker-compose exec app ps aux

# 检查端口
docker-compose exec app netstat -tlnp
```

### 常见问题

1. **端口冲突**
   ```bash
   # 修改端口映射
   ports:
     - "3002:3000"  # 将主机端口改为3002
     - "3003:3001"  # 将主机端口改为3003
   ```

2. **数据库连接失败**
   ```bash
   # 检查数据库是否启动
   docker-compose ps
   
   # 检查数据库日志
   docker-compose logs postgres
   ```

3. **权限问题**
   ```bash
   # 重置文件权限
   sudo chown -R $USER:$USER ./logs ./config
   ```

## 🛠️ 高级配置

### 挂载自定义配置

```yaml
# 在 docker-compose.yml 中添加
volumes:
  - ./custom-config.json:/app/config/custom.json:ro
  - ./custom.env:/app/.env:ro
```

### 使用外部数据库

```bash
# 不启动 postgres 容器，使用外部数据库
docker-compose up app

# 设置外部数据库连接
DATABASE_URL="postgresql://user:pass@external-db:5432/dbname" \
docker-compose up app
```

### 持久化数据

数据库数据默认持久化在Docker volume中：
```bash
# 查看数据卷
docker volume ls

# 备份数据
docker-compose exec postgres pg_dump -U nodepass nodepass > backup.sql

# 恢复数据
docker-compose exec -T postgres psql -U nodepass nodepass < backup.sql
```

## 🚦 生产部署建议

1. **使用强密码**
   ```bash
   JWT_SECRET=$(openssl rand -base64 32)
   POSTGRES_PASSWORD=$(openssl rand -base64 32)
   ```

2. **使用 Docker Secrets**（Docker Swarm）
   ```yaml
   services:
     app:
       secrets:
         - jwt_secret
         - db_password
   ```

3. **配置健康检查**
   ```yaml
   healthcheck:
     test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
     interval: 30s
     timeout: 10s
     retries: 3
   ```

4. **使用反向代理**
   ```bash
   # 使用 Nginx 或 Traefik
   # 只暴露 80/443 端口，不直接暴露 3000/3001
   ```

## 📝 命令速查

```bash
# 构建并启动
docker-compose up --build

# 后台运行
docker-compose up -d

# 停止服务
docker-compose down

# 重启单个服务
docker-compose restart app

# 查看运行状态
docker-compose ps

# 清理全部
docker-compose down -v --rmi all
``` 