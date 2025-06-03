import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * 健康检查API端点
 * 用于Docker容器健康检查和系统监控
 */
export async function GET() {
  try {
    // 检查数据库连接
    await prisma.$queryRaw`SELECT 1`;
    
    const response = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        used: Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 100) / 100,
        total: Math.round((process.memoryUsage().heapTotal / 1024 / 1024) * 100) / 100
      },
      database: 'connected',
      services: {
        frontend: 'running',
        backend: 'running'
      }
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('健康检查失败:', error);
    
    const response = {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : '未知错误',
      database: 'disconnected'
    };

    return NextResponse.json(response, { status: 503 });
  }
} 