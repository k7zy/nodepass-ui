import { NextRequest, NextResponse } from 'next/server';
import { fetchWithSSLSupport } from '@/lib/utils/fetch';
import { z } from 'zod';

// 测试端点连接的数据验证 schema
const testConnectionSchema = z.object({
  url: z.string().url('请输入有效的URL地址'),
  apiPath: z.string().min(1, 'API前缀不能为空'),
  apiKey: z.string().min(1, 'API Key不能为空'),
  timeout: z.number().min(1000).max(30000).optional().default(10000)
});

// POST - 测试端点连接
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, apiPath, apiKey, timeout } = testConnectionSchema.parse(body);
    
    // 构建测试URL
    const testUrl = `${url}${apiPath}/v1/events`;
    
    console.log(`[端点测试] 开始测试连接: ${testUrl}`);
    
    // 创建AbortController用于超时控制
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, timeout);
    
    try {
      // 使用支持SSL自签名证书的fetch进行连接测试
      const response = await fetchWithSSLSupport(testUrl, {
        method: 'GET',
        headers: {
          'X-API-Key': apiKey,
          'Cache-Control': 'no-cache'
        },
        signal: abortController.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.log(`[端点测试] HTTP错误: ${response.status} - ${errorText}`);
        
        return NextResponse.json({
          success: false,
          error: `HTTP错误: ${response.status}`,
          details: errorText,
          isSSLError: false
        }, { status: 400 });
      }
      
      console.log(`[端点测试] 连接成功: ${testUrl}`);
      
      return NextResponse.json({
        success: true,
        message: '端点连接测试成功',
        url: testUrl,
        status: response.status,
        isSSLEnabled: testUrl.startsWith('https:'),
        headers: {
          'content-type': response.headers.get('content-type'),
          'server': response.headers.get('server')
        }
      });
      
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      
      console.error(`[端点测试] 连接失败: ${testUrl}`, fetchError);
      
      let errorMessage = '连接失败';
      let isSSLError = false;
      
      if (fetchError.name === 'AbortError') {
        errorMessage = `连接超时 (${timeout}ms)，请检查URL地址是否正确`;
      } else if (fetchError.message.includes('self signed certificate')) {
        errorMessage = 'SSL自签名证书错误 (已自动处理)';
        isSSLError = true;
      } else if (fetchError.message.includes('certificate')) {
        errorMessage = 'SSL证书错误';
        isSSLError = true;
      } else if (fetchError.message.includes('ECONNREFUSED')) {
        errorMessage = '连接被拒绝，请检查端点服务是否运行';
      } else if (fetchError.message.includes('ENOTFOUND')) {
        errorMessage = '域名解析失败，请检查URL地址';
      } else if (fetchError.message.includes('ECONNRESET')) {
        errorMessage = '连接被重置，请检查网络连接';
      } else if (fetchError.message.includes('Failed to fetch')) {
        errorMessage = '网络连接失败，请检查网络是否正常';
      }
      
      return NextResponse.json({
        success: false,
        error: errorMessage,
        details: fetchError.message,
        isSSLError,
        url: testUrl
      }, { status: 500 });
    }
    
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: '数据验证失败',
        details: error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message
        }))
      }, { status: 400 });
    }
    
    console.error('[端点测试] 处理请求失败:', error);
    return NextResponse.json({
      success: false,
      error: '处理请求失败',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
} 