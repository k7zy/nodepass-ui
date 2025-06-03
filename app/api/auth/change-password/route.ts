import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { changeUserPassword } from '@/lib/server/auth-service';

// 密码修改请求验证schema
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, '当前密码不能为空'),
  newPassword: z.string().min(6, '新密码长度至少为6位')
});

/**
 * POST - 修改用户密码
 * 使用本地auth-service处理密码修改
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

    // 解析请求体
    const body = await request.json();
    const validationResult = changePasswordSchema.safeParse(body);
    
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

    const { currentPassword, newPassword } = validationResult.data;

    // 查找用户会话
    const session = await prisma.userSession.findUnique({
      where: { 
        sessionId: sessionCookie.value,
        isActive: true,
        expiresAt: { gt: new Date() }
      }
    });

    if (!session) {
      return NextResponse.json(
        { success: false, message: '会话已过期，请重新登录' },
        { status: 401 }
      );
    }

    console.log('[修改密码API] 开始处理用户密码修改请求:', {
      username: session.username,
      sessionId: session.sessionId
    });

    // 使用本地auth-service修改密码
    const result = await changeUserPassword(session.username, currentPassword, newPassword);

    if (result.success) {
      console.log('[修改密码API] 密码修改成功:', {
        username: session.username
      });

      return NextResponse.json({
        success: true,
        message: result.message
      });
    } else {
      console.log('[修改密码API] 密码修改失败:', {
        username: session.username,
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
    console.error('[修改密码API] 处理密码修改请求时发生错误:', error);
    return NextResponse.json(
      { 
        success: false, 
        message: '服务器内部错误' 
      },
      { status: 500 }
    );
  }
} 