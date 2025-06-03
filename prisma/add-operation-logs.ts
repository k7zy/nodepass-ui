import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function addOperationLogs() {
  try {
    // 获取现有的隧道实例
    const tunnels = await prisma.tunnel.findMany();
    
    if (tunnels.length === 0) {
      console.log('没有找到隧道实例，跳过添加操作日志');
      return;
    }
    
    const tunnel = tunnels[0]; // 使用第一个隧道实例
    
    // 添加一些测试操作日志
    const operationLogs = [
      {
        tunnelId: tunnel.id,
        tunnelName: tunnel.name,
        action: 'created',
        status: 'success',
        message: '隧道实例创建成功',
        createdAt: new Date(Date.now() - 5 * 60 * 1000) // 5分钟前
      },
      {
        tunnelId: tunnel.id,
        tunnelName: tunnel.name,
        action: 'started',
        status: 'success',
        message: '隧道实例启动成功',
        createdAt: new Date(Date.now() - 4 * 60 * 1000) // 4分钟前
      },
      {
        tunnelId: tunnel.id,
        tunnelName: tunnel.name,
        action: 'stopped',
        status: 'success',
        message: '隧道实例停止成功',
        createdAt: new Date(Date.now() - 3 * 60 * 1000) // 3分钟前
      },
      {
        tunnelId: tunnel.id,
        tunnelName: tunnel.name,
        action: 'restarted',
        status: 'success',
        message: '隧道实例重启成功',
        createdAt: new Date(Date.now() - 2 * 60 * 1000) // 2分钟前
      },
      {
        tunnelId: null, // 模拟删除后的日志
        tunnelName: 'deleted-tunnel',
        action: 'deleted',
        status: 'success',
        message: '隧道实例删除成功',
        createdAt: new Date(Date.now() - 1 * 60 * 1000) // 1分钟前
      }
    ];
    
    // 批量创建操作日志
    await prisma.tunnelOperationLog.createMany({
      data: operationLogs
    });
    
    console.log(`已添加 ${operationLogs.length} 条操作日志`);
  } catch (error) {
    console.error('添加操作日志失败:', error);
  } finally {
    await prisma.$disconnect();
  }
}

addOperationLogs(); 