import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/server/auth-service';

export async function GET(request: NextRequest) {
  try {
    // 获取会话ID
    const sessionId = request.cookies.get('session')?.value;
    
    if (!sessionId) {
      return NextResponse.json(
        { error: '未找到会话' },
        { status: 401 }
      );
    }
    
    // 获取用户信息
    const user = await getSessionUser(sessionId);
    
    if (!user) {
      return NextResponse.json(
        { error: '会话无效或已过期' },
        { status: 401 }
      );
    }
    
    return NextResponse.json({ user });
    
  } catch (error) {
    console.error('获取用户信息失败:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
} 