# 🚀 NodePass WebUI v1.1.0 发布说明

## 📋 概览

这是 NodePass WebUI 的一个重要更新版本，主要专注于架构优化和部署简化。我们将原本分离的SSE服务完全整合到Next.js应用中，实现了真正的单端口、单容器部署方案。

## 🌟 重点更新

### 🏗️ 架构重构 - SSE服务整合

**问题背景**: 之前版本需要同时运行前端(3000)和SSE后端服务(3001)，增加了部署复杂度和网络延迟。

**解决方案**: 
- ✅ 将SSE服务完全整合到Next.js应用内
- ✅ 实现跨上下文的全局SSE管理器
- ✅ 单端口(3000)运行，简化网络配置
- ✅ 消除服务间通信延迟，提升性能

### 🐳 Docker部署简化

**之前**: 双容器架构，需要管理两个服务
```yaml
ports:
  - "3000:3000"  # 前端
  - "3001:3001"  # SSE服务
```

**现在**: 单容器架构，只需一个端口
```yaml
ports:
  - "3000:3000"  # 整合应用
```

**影响**: 
- 🔻 减少50%的端口占用
- 🔻 简化环境变量配置
- 🔻 降低部署复杂度
- ⚡ 提升服务间通信性能

### 🔒 SSL自签名证书支持

新增对HTTPS自签名证书的原生支持，无需额外配置：

```typescript
// 自动处理自签名证书
const endpoint = {
  url: "https://your-nodepass.example.com",  // ✅ 自签名HTTPS
  apiPath: "/api",
  apiKey: "your-api-key"
};
```

## 📦 快速部署

### 🐳 Docker部署（推荐）

```bash
# 下载最新配置
wget https://raw.githubusercontent.com/Mecozea/nodepass-webui/main/docker-compose.release.yml

# 创建环境变量
cat > .env << EOF
POSTGRES_USER=nodepass
POSTGRES_PASSWORD=your_secure_password
POSTGRES_DB=nodepass
JWT_SECRET=your_jwt_secret
NODE_ENV=production
NEXT_PUBLIC_SSE_MODE=integrated
EOF

# 启动服务
docker-compose -f docker-compose.release.yml up -d

# 访问: http://localhost:3000
```

### 📦 预构建镜像

```bash
# 拉取最新镜像
docker pull ghcr.io/mecozea/nodepass-webui:latest

# 或指定版本
docker pull ghcr.io/mecozea/nodepass-webui:v1.1.0
```

## 🔄 升级指南

### 从 v1.0.x 升级

**Docker用户**:
```bash
# 1. 备份数据（可选）
docker-compose exec postgres pg_dump -U nodepass nodepass > backup.sql

# 2. 停止旧版本
docker-compose down

# 3. 更新镜像
docker pull ghcr.io/mecozea/nodepass-webui:latest

# 4. 更新环境变量
echo "NEXT_PUBLIC_SSE_MODE=integrated" >> .env

# 5. 启动新版本
docker-compose -f docker-compose.release.yml up -d
```

**本地开发**:
```bash
# 1. 拉取最新代码
git pull origin main

# 2. 更新依赖
pnpm install

# 3. 重新构建
pnpm build

# 4. 启动整合模式
pnpm dev:integrated
```

## 🐛 问题修复

- 🔧 修复 TypeScript 构建错误
- 🔧 改进 SSE 连接稳定性
- 🔧 优化隧道实例管理
- 🔧 解决内存泄漏问题
- 🔧 增强错误处理机制

## 📊 性能改进

| 指标 | v1.0.x | v1.1.0 | 改进 |
|------|--------|--------|------|
| 端口数量 | 2个 | 1个 | -50% |
| 容器数量 | 2个 | 1个 | -50% |
| SSE延迟 | ~10ms | ~1ms | -90% |
| 部署复杂度 | 高 | 低 | 显著简化 |

## 🔧 技术细节

### 新增环境变量
- `NEXT_PUBLIC_SSE_MODE`: 设置为 `integrated` 启用整合模式

### 移除的配置
- `NEXT_PUBLIC_SSE_API_URL`: 整合模式下不再需要

### 兼容性
- ✅ Node.js 18+
- ✅ Docker Engine 20.0+
- ✅ 现有数据库无需迁移

## 📚 文档更新

- 📖 [Docker部署指南](DOCKER.md) - 完全重写
- 📖 [变更日志](CHANGELOG.md) - 新增详细记录
- 📖 [API文档](api.md) - 更新接口说明

## 🆘 获取帮助

如果在升级过程中遇到问题：

1. 📖 查看 [Docker部署指南](https://github.com/Mecozea/nodepass-webui/blob/main/DOCKER.md)
2. 🐛 提交 [GitHub Issue](https://github.com/Mecozea/nodepass-webui/issues)
3. 💬 参与 [GitHub Discussions](https://github.com/Mecozea/nodepass-webui/discussions)

## 🙏 致谢

感谢所有测试和反馈的用户！您的建议让 NodePass WebUI 变得更好。

---

**完整变更记录**: [CHANGELOG.md](CHANGELOG.md)  
**下载地址**: [GitHub Releases](https://github.com/Mecozea/nodepass-webui/releases/tag/v1.1.0) 