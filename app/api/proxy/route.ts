import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { fetchWithSSLSupport } from '@/lib/utils/fetch';

/**
 * 代理请求处理函数
 */
export async function POST(request: NextRequest) {
  try {
    // 获取请求数据
    const data = await request.json();
    const { url, method = 'GET', headers = {}, body } = data;

    if (!url) {
      return NextResponse.json({ error: '缺少必要的URL参数' }, { status: 400 });
    }

    // 记录代理请求信息
    logger.info('[代理请求]', method, url, {
      headers,
      '数据': body || '无'
    });

    // 准备请求选项
    const fetchOptions: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    // 如果有请求体，添加到选项中
    if (body) {
      fetchOptions.body = JSON.stringify(body);
    }

    // 使用支持自签名证书的fetch发送请求
    const response = await fetchWithSSLSupport(url, fetchOptions);

    // 获取响应数据
    const responseData = await response.text();

    // 返回响应
    return new NextResponse(responseData, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'application/json'
      }
    });

  } catch (error) {
    // 记录错误
    logger.error('[代理请求错误]', error);
    
    // 返回错误响应
    return NextResponse.json({ 
      error: '代理请求失败',
      message: error instanceof Error ? error.message : '未知错误'
    }, { status: 500 });
  }
} 