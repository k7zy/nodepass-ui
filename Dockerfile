# NodePass WebUI - 整合SSE服务的Docker镜像
# Next.js应用内置SSE服务，单端口运行

# 添加版本参数
ARG VERSION=1.1.2

# 依赖阶段 - 用于缓存依赖
FROM node:18-alpine AS deps

# 设置pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# 只复制package文件
COPY package.json pnpm-lock.yaml ./

# 安装依赖
RUN apk add --no-cache python3 make g++ && \
    pnpm install --frozen-lockfile

# 构建阶段
FROM node:18-alpine AS builder

# 设置pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# 复制依赖
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json

# 复制源代码并构建
COPY . .
RUN pnpm exec prisma generate && pnpm build

# 生产环境
FROM node:18-alpine AS production

# 设置版本标签
ARG VERSION
LABEL version=${VERSION}
LABEL org.opencontainers.image.version=${VERSION}

# 设置pnpm（使用corepack而不是npm）
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# 合并所有生产环境的设置
RUN apk add --no-cache postgresql-client && \
    addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

# 只复制生产所需文件
COPY --from=builder /app/package.json /app/pnpm-lock.yaml ./
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/next.config.js ./next.config.js
COPY --from=builder /app/public ./public

# 只安装生产依赖并清理
RUN pnpm install --frozen-lockfile --prod && \
    pnpm add prisma --save-dev && \
    pnpm exec prisma generate && \
    pnpm cache clean && \
    rm -rf /root/.cache /root/.npm && \
    chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# 添加版本信息到环境变量
ENV APP_VERSION=${VERSION}

CMD ["sh", "-c", "\
    echo '🚀 启动NodePass生产环境 (整合SSE服务)...' && \
    echo '📦 当前版本: '${APP_VERSION} && \
    echo '⏳ 等待数据库连接...' && \
    while ! pg_isready -h postgres -p 5432 -U ${POSTGRES_USER:-nodepass} -q; do \
        echo '⏳ 等待PostgreSQL启动...' && sleep 2; \
    done && \
    echo '📊 运行数据库迁移...' && \
    pnpm exec prisma migrate deploy && \
    echo '🎯 启动整合生产服务...' && \
    NODE_ENV=production pnpm start \
"] 