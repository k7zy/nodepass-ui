# NodePass WebUI - 双服务Docker镜像
# 支持前端(Next.js)和后端(SSE服务)同时运行

FROM node:18-alpine AS base

# 安装必要的系统依赖
RUN apk add --no-cache \
    postgresql-client \
    python3 \
    make \
    g++ \
    && npm install -g pnpm

WORKDIR /app

# ================================
# 依赖安装阶段
# ================================
FROM base AS deps

# 复制依赖配置文件
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# 安装依赖
RUN pnpm install --frozen-lockfile

# ================================
# 开发环境 (用于 docker-compose 开发)
# ================================
FROM base AS development

# 复制依赖
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json

# 复制所有源代码
COPY . .

# 生成 Prisma 客户端
RUN pnpm exec prisma generate

# 暴露端口
EXPOSE 3000 3001

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# 开发启动脚本
CMD ["sh", "-c", "\
    echo '🚀 启动NodePass开发环境...' && \
    echo '⏳ 等待数据库连接...' && \
    while ! pg_isready -h postgres -p 5432 -U ${POSTGRES_USER:-nodepass} -q; do \
        echo '⏳ 等待PostgreSQL启动...' && sleep 2; \
    done && \
    echo '📊 运行数据库迁移...' && \
    pnpm exec prisma migrate deploy && \
    echo '🌱 生成Prisma客户端...' && \
    pnpm exec prisma generate && \
    echo '🎯 启动前端和后端服务...' && \
    pnpm dev:all \
"]

# ================================
# 构建阶段
# ================================
FROM base AS builder

# 复制依赖
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json

# 复制源代码
COPY . .

# 生成 Prisma 客户端
RUN pnpm exec prisma generate

# 构建前端和后端
RUN pnpm build:all

# ================================
# 生产环境
# ================================
FROM base AS production

# 只安装生产依赖
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

# 复制构建产物
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts

# 生成 Prisma 客户端（生产环境）
RUN pnpm exec prisma generate

# 创建非root用户
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

# 设置正确的权限
RUN chown -R nextjs:nodejs /app
USER nextjs

# 暴露端口
EXPOSE 3000 3001

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# 生产启动脚本
CMD ["sh", "-c", "\
    echo '🚀 启动NodePass生产环境...' && \
    echo '⏳ 等待数据库连接...' && \
    while ! pg_isready -h postgres -p 5432 -U ${POSTGRES_USER:-nodepass} -q; do \
        echo '⏳ 等待PostgreSQL启动...' && sleep 2; \
    done && \
    echo '📊 运行数据库迁移...' && \
    pnpm exec prisma migrate deploy && \
    echo '🎯 启动生产服务...' && \
    node dist/scripts/start-sse-service.js & \
    node dist/frontend/server.js \
"] 