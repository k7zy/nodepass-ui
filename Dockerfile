# NodePass WebUI - 整合SSE服务的Docker镜像
# Next.js应用内置SSE服务，单端口运行

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

# 暴露端口 (仅需要3000端口，SSE服务已整合)
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# 开发启动脚本
CMD ["sh", "-c", "\
    echo '🚀 启动NodePass开发环境 (整合SSE服务)...' && \
    echo '⏳ 等待数据库连接...' && \
    while ! pg_isready -h postgres -p 5432 -U ${POSTGRES_USER:-nodepass} -q; do \
        echo '⏳ 等待PostgreSQL启动...' && sleep 2; \
    done && \
    echo '📊 运行数据库迁移...' && \
    pnpm exec prisma migrate deploy && \
    echo '🌱 生成Prisma客户端...' && \
    pnpm exec prisma generate && \
    echo '🎯 启动整合服务 (Next.js + SSE)...' && \
    pnpm dev:integrated \
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

# 构建应用
RUN pnpm build

# ================================
# 生产环境
# ================================
FROM base AS production

# 安装生产依赖和必要的CLI工具
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod && \
    pnpm add prisma tsx --save-dev

# 复制构建产物和必要文件
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/app ./app
COPY --from=builder /app/components ./components
COPY --from=builder /app/styles ./styles
COPY --from=builder /app/config ./config
COPY --from=builder /app/types ./types
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/next.config.js ./next.config.js

# 生成 Prisma 客户端（生产环境）
RUN pnpm exec prisma generate

# 创建非root用户
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

# 设置正确的权限
RUN chown -R nextjs:nodejs /app
USER nextjs

# 暴露端口 (仅需要3000端口，SSE服务已整合)
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# 生产启动脚本
CMD ["sh", "-c", "\
    echo '🚀 启动NodePass生产环境 (整合SSE服务)...' && \
    echo '⏳ 等待数据库连接...' && \
    while ! pg_isready -h postgres -p 5432 -U ${POSTGRES_USER:-nodepass} -q; do \
        echo '⏳ 等待PostgreSQL启动...' && sleep 2; \
    done && \
    echo '📊 运行数据库迁移...' && \
    pnpm exec prisma migrate deploy && \
    echo '🎯 启动整合生产服务...' && \
    pnpm start:integrated \
"] 