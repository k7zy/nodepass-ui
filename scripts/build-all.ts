#!/usr/bin/env tsx

import { execSync } from 'child_process';
import { existsSync, mkdirSync, copyFileSync, writeFileSync, rmSync, cpSync } from 'fs';
import { join } from 'path';
import { logger } from '../lib/server/logger';

async function buildAll() {
  const rootDir = process.cwd();
  const distDir = join(rootDir, 'dist');
  
  try {
    logger.info('🚀 开始打包整个项目...');
    
    // 清理之前的构建
    if (existsSync(distDir)) {
      logger.info('🧹 清理之前的构建文件...');
      rmSync(distDir, { recursive: true, force: true });
    }
    
    // 创建dist目录
    mkdirSync(distDir, { recursive: true });
    mkdirSync(join(distDir, 'frontend'), { recursive: true });
    mkdirSync(join(distDir, 'backend'), { recursive: true });
    
    // 1. 构建前端 (Next.js)
    logger.info('🎨 构建前端应用...');
    execSync('pnpm build', { 
      stdio: 'inherit',
      cwd: rootDir 
    });
    
    // 复制前端构建文件 - 使用Node.js API
    logger.info('📦 复制前端构建文件...');
    
    // 复制完整的.next目录（因为禁用了standalone模式）
    const nextBuildDir = join(rootDir, '.next');
    if (existsSync(nextBuildDir)) {
      cpSync(nextBuildDir, join(distDir, 'frontend', '.next'), { recursive: true });
    }
    
    // 复制public目录
    const publicDir = join(rootDir, 'public');
    if (existsSync(publicDir)) {
      cpSync(publicDir, join(distDir, 'frontend', 'public'), { recursive: true });
    }
    
    // 复制必要的配置文件
    const filesToCopy = [
      'package.json',
      'next.config.js'
    ];
    
    filesToCopy.forEach(file => {
      const srcFile = join(rootDir, file);
      const destFile = join(distDir, 'frontend', file);
      if (existsSync(srcFile)) {
        copyFileSync(srcFile, destFile);
      }
    });
    
    // 创建前端server.js启动文件
    const serverJs = `const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');

const dev = false;
const app = next({ dev });
const handle = app.getRequestHandler();

const PORT = process.env.PORT || 3000;

app.prepare().then(() => {
  createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  }).listen(PORT, (err) => {
    if (err) throw err;
    console.log(\`> 前端服务已启动在 http://localhost:\${PORT}\`);
  });
});
`;
    writeFileSync(join(distDir, 'frontend', 'server.js'), serverJs);
    
    // 2. 构建后端 SSE 服务
    logger.info('⚙️ 构建SSE后端服务...');
    
    // 编译 TypeScript 到正确的位置，使用专门的backend配置
    execSync('pnpm exec tsc --project tsconfig.backend.json --outDir dist/backend', { 
      stdio: 'inherit',
      cwd: rootDir 
    });
    
    // 复制必要的文件
    copyFileSync(
      join(rootDir, 'package.json'), 
      join(distDir, 'backend/package.json')
    );
    
    // 如果有 prisma 文件，也复制过去
    if (existsSync(join(rootDir, 'prisma'))) {
      cpSync(join(rootDir, 'prisma'), join(distDir, 'backend/prisma'), { recursive: true });
    }
    
    // 如果有数据库文件，也复制过去
    if (existsSync(join(rootDir, 'data'))) {
      cpSync(join(rootDir, 'data'), join(distDir, 'backend/data'), { recursive: true });
    }
    
    // 3. 创建启动脚本
    logger.info('📝 创建启动脚本...');
    
    // 前端启动脚本 (跨平台)
    const frontendStartScript = `#!/bin/bash
echo "🎨 启动前端服务..."
cd "$(dirname "$0")/frontend"
node server.js
`;
    writeFileSync(join(distDir, 'start-frontend.sh'), frontendStartScript);
    
    // 前端启动脚本 (Windows)
    const frontendStartBat = `@echo off
echo 🎨 启动前端服务...
cd /d "%~dp0frontend"
node server.js
pause
`;
    writeFileSync(join(distDir, 'start-frontend.bat'), frontendStartBat);
    
    // 后端启动脚本 (跨平台)
    const backendStartScript = `#!/bin/bash
echo "⚙️ 启动SSE后端服务..."
cd "$(dirname "$0")/backend"
# 安装生产依赖
npm install --production
# 如果有 prisma，生成客户端
if [ -d "prisma" ]; then
  npx prisma generate
fi
# 启动服务
node scripts/start-sse-service.js
`;
    writeFileSync(join(distDir, 'start-backend.sh'), backendStartScript);
    
    // 后端启动脚本 (Windows)
    const backendStartBat = `@echo off
echo ⚙️ 启动SSE后端服务...
cd /d "%~dp0backend"
echo 安装生产依赖...
npm install --production
if exist "prisma" (
  echo 生成Prisma客户端...
  npx prisma generate
)
echo 启动服务...
node scripts/start-sse-service.js
pause
`;
    writeFileSync(join(distDir, 'start-backend.bat'), backendStartBat);
    
    // 完整启动脚本 (Linux/macOS)
    const startAllScript = `#!/bin/bash
echo "🚀 启动完整应用..."
echo "📍 当前目录: $(pwd)"

# 检查并启动后端
if [ -f "start-backend.sh" ]; then
  echo "启动后端服务..."
  chmod +x start-backend.sh
  ./start-backend.sh &
  BACKEND_PID=$!
  echo "后端PID: $BACKEND_PID"
else
  echo "❌ 未找到后端启动脚本"
  exit 1
fi

# 等待后端服务启动
sleep 3

# 检查并启动前端
if [ -f "start-frontend.sh" ]; then
  echo "启动前端服务..."
  chmod +x start-frontend.sh
  ./start-frontend.sh &
  FRONTEND_PID=$!
  echo "前端PID: $FRONTEND_PID"
else
  echo "❌ 未找到前端启动脚本"
  kill $BACKEND_PID
  exit 1
fi

echo "✅ 应用启动完成!"
echo "🌐 前端地址: http://localhost:3000"
echo "🔄 SSE后端地址: http://localhost:3001"
echo ""
echo "按 Ctrl+C 停止服务"

# 等待信号
wait
`;
    writeFileSync(join(distDir, 'start-all.sh'), startAllScript);
    
    // Windows 启动脚本
    const startAllBat = `@echo off
echo 🚀 启动完整应用...
echo 📍 当前目录: %cd%

REM 启动后端
if exist "start-backend.bat" (
  echo 启动后端服务...
  start "NodePass-Backend" start-backend.bat
) else (
  echo ❌ 未找到后端启动脚本
  pause
  exit /b 1
)

REM 等待后端启动
echo 等待后端服务启动...
timeout /t 5 /nobreak > nul

REM 启动前端
if exist "start-frontend.bat" (
  echo 启动前端服务...
  start "NodePass-Frontend" start-frontend.bat
) else (
  echo ❌ 未找到前端启动脚本
  pause
  exit /b 1
)

echo ✅ 应用启动完成!
echo 🌐 前端地址: http://localhost:3000
echo 🔄 SSE后端地址: http://localhost:3001
echo.
echo 两个服务已在独立窗口中启动
echo 关闭此窗口不会停止服务，请在对应窗口中手动关闭
pause
`;
    writeFileSync(join(distDir, 'start-all.bat'), startAllBat);
    
    // 4. 创建 README
    const readmeContent = `# NodePass 部署包

这是 NodePass 的完整部署包，包含前端和SSE后端服务。

## 目录结构
\`\`\`
dist/
├── frontend/              # Next.js 前端应用
├── backend/              # SSE 后端服务
├── start-frontend.sh     # 前端启动脚本 (Linux/macOS)
├── start-frontend.bat    # 前端启动脚本 (Windows)
├── start-backend.sh      # 后端启动脚本 (Linux/macOS)  
├── start-backend.bat     # 后端启动脚本 (Windows)
├── start-all.sh          # 完整应用启动脚本 (Linux/macOS)
├── start-all.bat         # 完整应用启动脚本 (Windows)
└── README.md            # 本文件
\`\`\`

## 快速启动

### Windows
双击运行 \`start-all.bat\` 或在命令行执行：
\`\`\`cmd
start-all.bat
\`\`\`

### Linux / macOS
\`\`\`bash
chmod +x start-all.sh
./start-all.sh
\`\`\`

## 分别启动

### 仅启动前端
**Windows:** 双击 \`start-frontend.bat\`
**Linux/macOS:** \`./start-frontend.sh\`

### 仅启动后端  
**Windows:** 双击 \`start-backend.bat\`
**Linux/macOS:** \`./start-backend.sh\`

## 服务地址
- 前端应用: http://localhost:3000
- SSE后端: http://localhost:3001

## 系统要求
- Node.js 18+ 
- Windows: 无需额外依赖
- Linux/macOS: bash shell

## 注意事项
1. 首次运行会自动安装依赖，请确保网络连接正常
2. 确保端口 3000 和 3001 未被占用
3. Windows用户：服务会在独立窗口中启动，关闭主窗口不会停止服务
4. Linux/macOS用户：使用 Ctrl+C 停止所有服务

## 故障排除
如果遇到问题，请检查：
1. Node.js 版本是否为 18.17.0 或更高
2. 端口 3000 和 3001 是否被占用
3. 网络连接是否正常（首次运行需要下载依赖）
4. 防火墙是否阻止了服务启动

## 端口修改
如需修改端口，请编辑以下文件：
- 前端端口：\`frontend/server.js\` 
- 后端端口：\`backend/scripts/start-sse-service.js\`

构建时间: ${new Date().toISOString()}
构建平台: ${process.platform} ${process.arch}
`;
    writeFileSync(join(distDir, 'README.md'), readmeContent);
    
    // 如果是Windows环境，设置文件权限不适用，所以跳过chmod
    if (process.platform !== 'win32') {
      try {
        execSync(`chmod +x "${join(distDir, 'start-all.sh')}"`);
        execSync(`chmod +x "${join(distDir, 'start-frontend.sh')}"`);
        execSync(`chmod +x "${join(distDir, 'start-backend.sh')}"`);
      } catch (error) {
        logger.warn('设置执行权限时出现警告（可忽略）:', error);
      }
    }
    
    logger.info('✅ 打包完成!');
    logger.info(`📦 输出目录: ${distDir}`);
    logger.info('📚 使用说明请查看 dist/README.md');
    logger.info('');
    logger.info('🎯 下一步操作：');
    logger.info('  • 压缩包：pnpm package （Linux/macOS）');
    logger.info('  • 压缩包：pnpm package:zip （Windows）');
    logger.info('  • 直接运行：cd dist && start-all.bat （Windows）');
    logger.info('  • 直接运行：cd dist && ./start-all.sh （Linux/macOS）');
    
  } catch (error) {
    logger.error('❌ 打包失败:', error);
    process.exit(1);
  }
}

buildAll(); 