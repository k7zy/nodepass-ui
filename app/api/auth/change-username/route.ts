import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { validateSession, getSessionUser, changeUsername, destroySession } from '@/lib/server/auth-service';

// 用户名修改请求验证schema
const changeUsernameSchema = z.object({
  newUsername: z.string()
    .min(2, '用户名至少需要2个字符')
    .max(20, '用户名最多20个字符')
    .regex(/^[a-zA-Z0-9_\u4e00-\u9fa5]+$/, '用户名只能包含字母、数字、下划线和中文')
});

/**
 * POST - 修改用户名
 * 使用本地auth-service处理用户名修改
 * 修改成功后会使当前会话失效，要求用户重新登录
 */
export async function POST(request: NextRequest) {
  try {
    // 验证用户登录状态
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('session');
    
    if (!sessionCookie) {
      return NextResponse.json(
        { success: false, message: '用户未登录' },
        { status: 401 }
      );
    }

    // 验证会话是否有效
    const isValidSession = await validateSession(sessionCookie.value);
    if (!isValidSession) {
      return NextResponse.json(
        { success: false, message: '会话已过期，请重新登录' },
        { status: 401 }
      );
    }

    // 获取会话用户信息
    const sessionUser = await getSessionUser(sessionCookie.value);
    if (!sessionUser) {
      return NextResponse.json(
        { success: false, message: '无法获取用户信息' },
        { status: 401 }
      );
    }

    // 解析请求体
    const body = await request.json();
    const validationResult = changeUsernameSchema.safeParse(body);
    
    if (!validationResult.success) {
      return NextResponse.json(
        { 
          success: false, 
          message: '请求数据验证失败',
          errors: validationResult.error.errors 
        },
        { status: 400 }
      );
    }

    const { newUsername } = validationResult.data;

    console.log('[修改用户名API] 开始处理用户名修改请求:', {
      currentUsername: sessionUser.username,
      newUsername: newUsername,
      sessionId: sessionCookie.value
    });

    // 使用本地auth-service修改用户名
    const result = await changeUsername(sessionUser.username, newUsername);

    if (result.success) {
      console.log('[修改用户名API] 用户名修改成功:', {
        oldUsername: sessionUser.username,
        newUsername: newUsername
      });

      // 使当前会话失效
      await destroySession(sessionCookie.value);

      // 删除客户端的会话cookie
      const response = NextResponse.json({
        success: true,
        message: '用户名修改成功，请重新登录',
        requireRelogin: true
      });

      response.cookies.delete('session');

      return response;
    } else {
      console.log('[修改用户名API] 用户名修改失败:', {
        username: sessionUser.username,
        message: result.message
      });

      return NextResponse.json(
        { 
          success: false, 
          message: result.message
        },
        { status: 400 }
      );
    }

  } catch (error) {
    console.error('[修改用户名API] 处理用户名修改请求时发生错误:', error);
    return NextResponse.json(
      { 
        success: false, 
        message: '服务器内部错误' 
      },
      { status: 500 }
    );
  }
} 