import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../prisma';
import { logger } from './logger';

// 系统配置键名常量
export const SYSTEM_CONFIG_KEYS = {
  IS_INITIALIZED: 'system_initialized',
  ADMIN_USERNAME: 'admin_username',
  ADMIN_PASSWORD: 'admin_password_hash',
} as const;

// 内存中的会话存储（用于快速验证）
const sessionCache = new Map<string, { username: string; expiresAt: Date; isActive: boolean }>();

// 定时清理过期会话缓存
setInterval(async () => {
  const now = new Date();
  for (const [sessionId, session] of sessionCache.entries()) {
    if (session.expiresAt < now || !session.isActive) {
      sessionCache.delete(sessionId);
    }
  }
  await cleanupExpiredSessions();
}, 5 * 60 * 1000); // 每5分钟清理一次

// 生成随机密码
export function generateRandomPassword(length: number = 12): string {
  // 如果是演示环境，返回固定密码
  if (process.env.NEXT_PUBLIC_DEMO_STATUS === 'true') {
    return 'np123456';
  }
  
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
}

// 密码加密
export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 12;
  return await bcrypt.hash(password, saltRounds);
}

// 密码验证
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(password, hash);
}

// 获取系统配置
export async function getSystemConfig(key: string): Promise<string | null> {
  try {
    const config = await prisma.systemConfig.findUnique({
      where: { key }
    });
    return config?.value || null;
  } catch (error) {
    logger.error('获取系统配置失败', { key, error });
    return null;
  }
}

// 设置系统配置
export async function setSystemConfig(key: string, value: string, description?: string): Promise<void> {
  try {
    await prisma.systemConfig.upsert({
      where: { key },
      update: { value, description },
      create: { key, value, description }
    });
  } catch (error) {
    logger.error('设置系统配置失败', { key, error });
    throw error;
  }
}

// 检查系统是否已初始化
export async function isSystemInitialized(): Promise<boolean> {
  const initialized = await getSystemConfig(SYSTEM_CONFIG_KEYS.IS_INITIALIZED);
  return initialized === 'true';
}

// 初始化系统
export async function initializeSystem(): Promise<{ username: string; password: string } | null> {
  try {
    // 检查是否已经初始化
    if (await isSystemInitialized()) {
      return null;
    }

    // 生成默认用户名和随机密码
    const username = 'nodepass';
    const password = generateRandomPassword(12);
    const passwordHash = await hashPassword(password);

    // 保存到系统配置
    await setSystemConfig(SYSTEM_CONFIG_KEYS.ADMIN_USERNAME, username, '管理员用户名');
    await setSystemConfig(SYSTEM_CONFIG_KEYS.ADMIN_PASSWORD, passwordHash, '管理员密码哈希');
    await setSystemConfig(SYSTEM_CONFIG_KEYS.IS_INITIALIZED, 'true', '系统是否已初始化');

    logger.info('系统初始化完成', {
      username,
      passwordGenerated: true
    });

    console.log('================================');
    console.log('🚀 NodePass 系统初始化完成！');
    console.log('================================');
    console.log('管理员账户信息：');
    console.log('用户名:', username);
    console.log('密码:', password);
    console.log('================================');
    console.log('⚠️  请妥善保存这些信息！');
    console.log('================================');

    return { username, password };
  } catch (error) {
    logger.error('系统初始化失败', error);
    throw error;
  }
}

// 用户登录验证
export async function authenticateUser(username: string, password: string): Promise<boolean> {
  try {
    const storedUsername = await getSystemConfig(SYSTEM_CONFIG_KEYS.ADMIN_USERNAME);
    const storedPasswordHash = await getSystemConfig(SYSTEM_CONFIG_KEYS.ADMIN_PASSWORD);

    if (!storedUsername || !storedPasswordHash) {
      return false;
    }

    if (username !== storedUsername) {
      return false;
    }

    return await verifyPassword(password, storedPasswordHash);
  } catch (error) {
    logger.error('用户认证失败', { username, error });
    return false;
  }
}

// 创建用户会话
export async function createUserSession(username: string): Promise<string> {
  try {
    const sessionId = uuidv4();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // 24小时后过期

    await prisma.userSession.create({
      data: {
        sessionId,
        username,
        expiresAt
      }
    });

    // 添加到缓存
    sessionCache.set(sessionId, {
      username,
      expiresAt,
      isActive: true
    });

    logger.info('用户会话已创建', { username, sessionId });
    return sessionId;
  } catch (error) {
    logger.error('创建用户会话失败', { username, error });
    throw error;
  }
}

// 验证会话（使用缓存优化）
export async function validateSession(sessionId: string): Promise<boolean> {
  try {
    // 先检查缓存
    const cachedSession = sessionCache.get(sessionId);
    if (cachedSession) {
      if (!cachedSession.isActive || cachedSession.expiresAt < new Date()) {
        sessionCache.delete(sessionId);
        return false;
      }
      return true;
    }

    // 缓存不存在，查询数据库
    const session = await prisma.userSession.findUnique({
      where: { sessionId }
    });

    if (!session || !session.isActive) {
      return false;
    }

    // 检查是否过期
    if (session.expiresAt < new Date()) {
      // 标记会话为非活跃
      await prisma.userSession.update({
        where: { sessionId },
        data: { isActive: false }
      });
      sessionCache.delete(sessionId);
      return false;
    }

    // 更新缓存
    sessionCache.set(sessionId, {
      username: session.username,
      expiresAt: session.expiresAt,
      isActive: session.isActive
    });

    return true;
  } catch (error) {
    logger.error('验证会话失败', { sessionId, error });
    return false;
  }
}

// 获取会话用户信息
export async function getSessionUser(sessionId: string): Promise<{ username: string } | null> {
  try {
    // 先检查缓存
    const cachedSession = sessionCache.get(sessionId);
    if (cachedSession) {
      if (!cachedSession.isActive || cachedSession.expiresAt < new Date()) {
        sessionCache.delete(sessionId);
        return null;
      }
      return { username: cachedSession.username };
    }

    // 缓存不存在，查询数据库
    const session = await prisma.userSession.findUnique({
      where: { sessionId }
    });

    if (!session || !session.isActive || session.expiresAt < new Date()) {
      return null;
    }

    // 更新缓存
    sessionCache.set(sessionId, {
      username: session.username,
      expiresAt: session.expiresAt,
      isActive: session.isActive
    });

    return { username: session.username };
  } catch (error) {
    logger.error('获取会话用户失败', { sessionId, error });
    return null;
  }
}

// 销毁会话
export async function destroySession(sessionId: string): Promise<void> {
  try {
    await prisma.userSession.update({
      where: { sessionId },
      data: { isActive: false }
    });

    // 从缓存中移除
    sessionCache.delete(sessionId);

    logger.info('用户会话已销毁', { sessionId });
  } catch (error) {
    logger.error('销毁会话失败', { sessionId, error });
    throw error;
  }
}

// 清理过期会话
export async function cleanupExpiredSessions(): Promise<void> {
  try {
    const result = await prisma.userSession.updateMany({
      where: {
        expiresAt: {
          lt: new Date()
        },
        isActive: true
      },
      data: {
        isActive: false
      }
    });

    if (result.count > 0) {
      logger.info('清理过期会话完成', { count: result.count });
    }
  } catch (error) {
    logger.error('清理过期会话失败', error);
  }
}

// 修改用户密码
export async function changeUserPassword(username: string, currentPassword: string, newPassword: string): Promise<{ success: boolean; message: string }> {
  try {
    // 验证当前密码
    const isCurrentPasswordValid = await authenticateUser(username, currentPassword);
    if (!isCurrentPasswordValid) {
      return {
        success: false,
        message: '当前密码不正确'
      };
    }

    // 加密新密码
    const newPasswordHash = await hashPassword(newPassword);

    // 更新密码
    await setSystemConfig(SYSTEM_CONFIG_KEYS.ADMIN_PASSWORD, newPasswordHash, '管理员密码哈希');

    logger.info('用户密码修改成功', { username });
    
    return {
      success: true,
      message: '密码修改成功'
    };

  } catch (error) {
    logger.error('修改用户密码失败', { username, error });
    return {
      success: false,
      message: '密码修改失败，请稍后重试'
    };
  }
}

/**
 * 修改用户名
 * @param currentUsername 当前用户名
 * @param newUsername 新用户名
 * @returns 修改结果
 */
export async function changeUsername(currentUsername: string, newUsername: string): Promise<{ success: boolean; message: string }> {
  try {
    // 验证当前用户名是否正确
    const storedUsername = await getSystemConfig(SYSTEM_CONFIG_KEYS.ADMIN_USERNAME);
    if (!storedUsername) {
      return {
        success: false,
        message: '系统配置错误'
      };
    }

    if (currentUsername !== storedUsername) {
      return {
        success: false,
        message: '当前用户名不正确'
      };
    }

    // 更新系统配置中的用户名
    await setSystemConfig(
      SYSTEM_CONFIG_KEYS.ADMIN_USERNAME,
      newUsername,
      '管理员用户名'
    );

    // 更新所有相关的会话
    await prisma.userSession.updateMany({
      where: {
        username: currentUsername,
        isActive: true
      },
      data: {
        username: newUsername
      }
    });

    logger.info('用户名修改成功', {
      oldUsername: currentUsername,
      newUsername: newUsername
    });

    return {
      success: true,
      message: '用户名修改成功'
    };
  } catch (error) {
    logger.error('修改用户名失败:', error);
    return {
      success: false,
      message: '修改用户名时发生错误'
    };
  }
} 