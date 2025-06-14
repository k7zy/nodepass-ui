# NodePass WebUI - 整合SSE服务的Docker镜像
# Next.js应用内置SSE服务，单端口运行

# 版本参数（由GitHub Actions传入）
ARG VERSION

# 依赖阶段 - 用于缓存依赖
FROM node:18-alpine AS deps

# 安装构建必需的系统依赖（在依赖阶段就安装，便于缓存）
# 设置pnpm
RUN apk add --no-cache python3 make g++ && corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# 复制package文件
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# 安装所有依赖（包括开发依赖，因为构建时需要）
RUN pnpm install --frozen-lockfile

# 构建阶段
FROM node:18-alpine AS builder

# 设置pnpm（复用deps阶段的环境更好，但这里保持独立性）
RUN corepack enable && corepack prepare pnpm@latest --activate

# 设置生产环境变量
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1

WORKDIR /app

# 复制deps阶段的所有内容（包括node_modules和配置文件）
COPY --from=deps /app ./

# 复制源代码并构建
COPY . .
RUN pnpm exec prisma generate && pnpm build

# 生产环境
FROM node:18-alpine AS production

# 设置版本标签
ARG VERSION
LABEL version=${VERSION}
LABEL org.opencontainers.image.version=${VERSION}

# 设置生产环境变量
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1

# 设置pnpm（使用corepack而不是npm）
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# 复制package文件
COPY --from=deps /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./

# 只复制生产依赖的node_modules
COPY --from=deps /app/node_modules ./node_modules

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
COPY --from=builder /app/public ./public
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/next.config.js ./next.config.js

# 生成Prisma客户端
RUN pnpm exec prisma generate

EXPOSE 3000

# 确保容器内支持IPv6
RUN echo "ipv6" >> /etc/modules

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# 添加版本信息到环境变量
ENV APP_VERSION=${VERSION}

CMD ["sh", "-c", "\
    echo '🚀 启动NodePass生产环境...' && \
    echo '📦 当前版本: '${APP_VERSION} && \
    echo '🔍 检查网络配置...' && \
    ip -6 addr show && \
    sysctl net.ipv6.conf.all.disable_ipv6 && \
    sysctl net.ipv6.conf.default.disable_ipv6 && \
    echo '🔗 IPv6网络连接测试...' && \
    ping6 -c 1 -w 2 google.com || echo 'Ping6失败' && \
    echo '📊 运行数据库迁移...' && \
    pnpm exec prisma migrate deploy && \
    echo '🎯 启动生产服务...' && \
    NODE_ENV=production pnpm start \
"] 