#!/usr/bin/env tsx

import { execSync } from 'child_process';
import { existsSync, mkdirSync, rmSync, cpSync } from 'fs';
import { join } from 'path';

async function buildStatic() {
  const rootDir = process.cwd();
  const distDir = join(rootDir, 'dist');
  const outDir = join(rootDir, 'out');
  
  try {
    console.log('🚀 开始构建静态文件...');
    
    // 清理之前的构建
    if (existsSync(distDir)) {
      console.log('🧹 清理之前的构建文件...');
      rmSync(distDir, { recursive: true, force: true });
    }
    if (existsSync(outDir)) {
      rmSync(outDir, { recursive: true, force: true });
    }
    
    // 创建dist目录
    mkdirSync(distDir, { recursive: true });
    
    // 1. 构建应用
    console.log('🎨 构建应用...');
    execSync('pnpm next build', { 
      stdio: 'inherit',
      cwd: rootDir 
    });
    
    // 2. 复制构建文件到 web/dist
    console.log('📦 复制构建文件...');
    if (existsSync(outDir)) {
      cpSync(outDir, distDir, { recursive: true });
    }
    
    console.log('✅ 构建完成!');
    console.log('');
    console.log('📦 静态文件已生成在 dist 目录');
    
  } catch (error) {
    console.error('❌ 构建失败:', error);
    process.exit(1);
  }
}

buildStatic(); 