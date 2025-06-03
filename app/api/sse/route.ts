import { NextRequest, NextResponse } from 'next/server';
import { sseService } from '@/lib/server/sse-service';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/server/logger';

// 手动初始化端点（如果需要）
export async function POST(request: NextRequest) {
  try {
    logger.info('手动初始化 SSE 服务');
    await sseService.initialize();
    logger.info('SSE 服务初始化成功');
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('初始化 SSE 服务失败', error);
    return NextResponse.json(
      { error: '初始化 SSE 服务失败' },
      { status: 500 }
    );
  }
}

// 获取所有端点的状态
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const endpointId = url.searchParams.get('endpointId');
    
    if (endpointId) {
      // 获取单个端点的状态
      const status = sseService.getEndpointStatus(parseInt(endpointId));
      const details = sseService.getEndpointConnectionDetails(parseInt(endpointId));
      
      logger.debug('获取端点状态', { endpointId, status, details });
      
      return NextResponse.json({
        status,
        details
      });
    }
    
    // 获取所有端点的状态
    const endpoints = await prisma.endpoint.findMany();
    const statuses = endpoints.map(endpoint => ({
      id: endpoint.id,
      name: endpoint.name,
      status: sseService.getEndpointStatus(endpoint.id),
      details: sseService.getEndpointConnectionDetails(endpoint.id)
    }));
    
    logger.debug('获取所有端点状态', { count: endpoints.length });
    
    return NextResponse.json(statuses);
    
  } catch (error) {
    logger.error('获取 SSE 状态失败', error);
    return NextResponse.json(
      { error: '获取 SSE 状态失败' },
      { status: 500 }
    );
  }
} 