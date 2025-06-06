import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';

interface User {
  id: number;
  username: string;
  email: string;
}

interface Session {
  user?: User;
}

export async function getSession(): Promise<Session | null> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('session');

    if (!sessionCookie) {
      return null;
    }

    // 从数据库中获取会话信息
    const session = await prisma.userSession.findFirst({
      where: {
        sessionId: sessionCookie.value,
        isActive: true,
        expiresAt: {
          gt: new Date()
        }
      },
      select: {
        username: true
      }
    });

    if (!session) {
      return null;
    }

    // 获取用户信息
    const userConfig = await prisma.systemConfig.findFirst({
      where: {
        key: 'admin_username',
        value: session.username
      }
    });

    if (!userConfig) {
      return null;
    }

    return {
      user: {
        id: 1, // 由于是单用户系统，固定为1
        username: session.username,
        email: 'admin@nodepass.local' // 系统默认邮箱
      }
    };
  } catch (error) {
    console.error('获取会话失败:', error);
    return null;
  }
} 