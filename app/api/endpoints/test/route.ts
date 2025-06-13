import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { proxyFetch } from '@/lib/utils/proxy-fetch';
import { logger } from '@/lib/server/logger';

// 端点测试数据验证 schema
const testEndpointSchema = z.object({
  url: z.string().url('请输入有效的URL地址'),
  apiPath: z.string().min(1, 'API前缀不能为空'),
  apiKey: z.string().min(1, 'API Key不能为空')
});

// POST - 测试端点连接
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = testEndpointSchema.parse(body);
    
    const { url, apiPath, apiKey } = validatedData;
    const testUrl = `${url}${apiPath}/events`;
    
    logger.info(`[API] 测试端点连接: ${testUrl}`);
    
    const response = await proxyFetch(testUrl, {
      method: 'GET',
      headers: {
        'X-API-Key': apiKey,
        'Cache-Control': 'no-cache'
      },
      timeout: 5000 // 5秒超时
    });

    if (!response.ok) {
      throw new Error(`HTTP错误: ${response.status}`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('[API] 测试端点连接失败:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({ 
        error: '数据验证失败', 
        details: error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message
        }))
      }, { status: 400 });
    }
    
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '测试端点连接失败' },
      { status: 500 }
    );
  }
} 