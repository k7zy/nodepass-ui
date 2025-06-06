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
    
    // 1. 构建应用
    logger.info('🎨 构建应用...');
    execSync('pnpm build', { 
      stdio: 'inherit',
      cwd: rootDir 
    });
    
    // 复制构建文件
    logger.info('📦 复制构建文件...');
    
    // 复制完整的.next目录（因为禁用了standalone模式）
    const nextBuildDir = join(rootDir, '.next');
    if (existsSync(nextBuildDir)) {
      cpSync(nextBuildDir, join(distDir, '.next'), { recursive: true });
    }
    
    // 复制public目录
    const publicDir = join(rootDir, 'public');
    if (existsSync(publicDir)) {
      cpSync(publicDir, join(distDir, 'public'), { recursive: true });
    }
    
    // 复制必要的配置文件
    const filesToCopy = [
      'package.json',
      'next.config.js',
      'server.ts'
    ];
    
    filesToCopy.forEach(file => {
      const srcFile = join(rootDir, file);
      const destFile = join(distDir, file);
      if (existsSync(srcFile)) {
        copyFileSync(srcFile, destFile);
      }
    });
    
    // 如果有 prisma 文件，也复制过去
    if (existsSync(join(rootDir, 'prisma'))) {
      cpSync(join(rootDir, 'prisma'), join(distDir, 'prisma'), { recursive: true });
    }
    
    // 如果有数据库文件，也复制过去
    if (existsSync(join(rootDir, 'data'))) {
      cpSync(join(rootDir, 'data'), join(distDir, 'data'), { recursive: true });
    }
    
    // 创建启动脚本
    logger.info('📝 创建启动脚本...');
    
    // 启动脚本 (跨平台)
    const startScript = `#!/bin/bash
echo "🚀 启动应用..."
cd "$(dirname "$0")"
# 安装生产依赖
npm install --production
# 如果有 prisma，生成客户端
if [ -d "prisma" ]; then
  npx prisma generate
fi
# 启动服务
NODE_ENV=production tsx server.ts
`;
    writeFileSync(join(distDir, 'start.sh'), startScript);
    
    // 启动脚本 (Windows)
    const startBat = `@echo off
echo 🚀 启动应用...
cd /d "%~dp0"
echo 安装生产依赖...
npm install --production
if exist "prisma" (
  echo 生成Prisma客户端...
  npx prisma generate
)
echo 启动服务...
set NODE_ENV=production
tsx server.ts
pause
`;
    writeFileSync(join(distDir, 'start.bat'), startBat);
    
    // 设置脚本权限
    if (process.platform !== 'win32') {
      execSync('chmod +x start.sh', { cwd: distDir });
    }
    
    logger.info('✅ 构建完成!');
    logger.info('');
    logger.info('📦 发布包已生成在 dist 目录');
    logger.info('');
    logger.info('启动说明:');
    logger.info('1. 进入 dist 目录');
    logger.info('2. 运行 start.sh (Linux/macOS) 或 start.bat (Windows)');
    logger.info('3. 访问 http://localhost:3000');
    
  } catch (error) {
    logger.error('❌ 构建失败:', error);
    process.exit(1);
  }
}

buildAll(); 