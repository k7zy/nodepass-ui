import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser, createUserSession } from '@/lib/server/auth-service';
import { z } from 'zod';

// 登录请求验证 schema
const loginSchema = z.object({
  username: z.string().min(1, '用户名不能为空'),
  password: z.string().min(1, '密码不能为空'),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // 验证请求数据
    const { username, password } = loginSchema.parse(body);
    
    // 验证用户身份
    const isValid = await authenticateUser(username, password);
    
    if (!isValid) {
      return NextResponse.json(
        { error: '用户名或密码错误' },
        { status: 401 }
      );
    }
    
    // 创建用户会话
    const sessionId = await createUserSession(username);
    
    // 创建响应并设置 cookie
    const response = NextResponse.json({
      success: true,
      message: '登录成功'
    });
    
    // 设置会话 cookie (24小时过期)
    response.cookies.set('session', sessionId, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60, // 24小时
      path: '/'
    });
    
    return response;
    
  } catch (error) {
    console.error('登录处理失败:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          error: '数据验证失败', 
          details: error.errors.map(e => e.message) 
        },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: '登录处理失败，请稍后重试' },
      { status: 500 }
    );
  }
} 