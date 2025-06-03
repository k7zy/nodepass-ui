import { NextRequest, NextResponse } from 'next/server';
import { destroySession } from '@/lib/server/auth-service';

export async function POST(request: NextRequest) {
  try {
    // 获取会话ID
    const sessionId = request.cookies.get('session')?.value;
    
    if (sessionId) {
      // 销毁会话
      await destroySession(sessionId);
    }
    
    // 创建响应并清除 cookie
    const response = NextResponse.json({
      success: true,
      message: '登出成功'
    });
    
    // 清除会话 cookie
    response.cookies.delete('session');
    
    return response;
    
  } catch (error) {
    console.error('登出处理失败:', error);
    
    // 即使出错也要清除 cookie
    const response = NextResponse.json({
      success: true,
      message: '登出成功'
    });
    
    response.cookies.delete('session');
    return response;
  }
} 