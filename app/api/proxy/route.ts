import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { proxyFetch } from '@/lib/utils/proxy-fetch';
import type { FetchOptions } from '@/lib/utils/proxy-fetch';

/**
 * 代理请求处理器
 * @param request 请求对象
 * @returns 响应对象
 */
export async function POST(request: NextRequest) {
  try {
    // 获取请求体
    const body = await request.json();
    const { url, options = {} } = body;

    if (!url) {
      return NextResponse.json(
        { error: '缺少必要的URL参数' },
        { status: 400 }
      );
    }

    // 构建fetch选项
    const fetchOptions: FetchOptions = {
      method: options.method || 'GET',
      headers: options.headers,
      body: options.body,
      timeout: options.timeout || 30000,
    };

    // 使用支持代理的fetch发送请求
    const response = await proxyFetch(url, fetchOptions);

    // 获取响应数据
    const data = await response.text();

    // 将 Headers 对象转换为普通对象
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    // 返回响应
    return new NextResponse(data, {
      status: response.status,
      statusText: response.statusText,
      headers
    });

  } catch (error) {
    logger.error('代理请求失败:', error);
    return NextResponse.json(
      { error: '代理请求失败' },
      { status: 500 }
    );
  }
} 