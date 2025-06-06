import { NextRequest, NextResponse } from 'next/server';
import { SSEService } from '@/lib/server/sse-service';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const { url, apiPath, apiKey } = await request.json();

    if (!url || !apiPath || !apiKey) {
      return NextResponse.json({
        success: false,
        error: '缺少必要参数'
      }, { status: 400 });
    }

    // 获取 SSE 服务实例
    const sseService = SSEService.getInstance();

    try {
      // 测试连接
      await sseService.testEndpointConnection(url, apiPath, apiKey);

      // 返回成功响应
      return NextResponse.json({
        success: true,
        message: '连接测试成功',
        details: {
          url: url,
          apiPath: apiPath,
          isSSLEnabled: url.startsWith('https:')
        }
      });

    } catch (error) {
      logger.error('SSE连接测试失败:', error);

      // 返回详细的错误信息
      return NextResponse.json({
        success: false,
        error: error instanceof Error ? error.message : '连接测试失败',
        details: {
          url: url,
          apiPath: apiPath,
          isSSLEnabled: url.startsWith('https:'),
          errorType: error instanceof Error ? error.name : '未知错误'
        }
      }, { status: 500 });
    }

  } catch (error) {
    logger.error('处理SSE测试请求失败:', error);
    return NextResponse.json({
      success: false,
      error: '处理请求失败'
    }, { status: 500 });
  }
} 