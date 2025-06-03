import { PrismaClient, EndpointStatus, TunnelMode, TunnelStatus, TLSMode, LogLevel } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('开始添加种子数据...');

  // 创建测试端点
  const endpoints = await Promise.all([
    prisma.endpoint.create({
      data: {
        name: '主服务器',
        url: 'https://api.example.com',
        apiPath: '/api/v1',
        apiKey: 'test-api-key-1',
        status: EndpointStatus.ONLINE,
        color: 'success',
      },
    }),
    prisma.endpoint.create({
      data: {
        name: '备用服务器',
        url: 'https://backup.example.com',
        apiPath: '/api/v1',
        apiKey: 'test-api-key-2',
        status: EndpointStatus.OFFLINE,
        color: 'danger',
      },
    }),
    prisma.endpoint.create({
      data: {
        name: '测试环境',
        url: 'https://test.example.com',
        apiPath: '/api/v1',
        apiKey: 'test-api-key-3',
        status: EndpointStatus.ONLINE,
        color: 'warning',
      },
    }),
  ]);

  console.log('已创建端点:', endpoints.length);

  // 创建一个测试隧道实例
  const tunnel = await prisma.tunnel.create({
    data: {
      name: 'web-proxy-server',
      endpointId: endpoints[0].id,
      mode: TunnelMode.server,
      tunnelAddress: '0.0.0.0',
      tunnelPort: '10101',
      targetAddress: '0.0.0.0',
      targetPort: '8080',
      tlsMode: TLSMode.mode1,
      logLevel: LogLevel.info,
      status: TunnelStatus.running,
      commandLine: 'server://0.0.0.0:10101/0.0.0.0:8080?log=info&tls=1',
      instanceId: 'test-instance-1',
      // 添加流量统计字段
      tcpRx: BigInt(1250000000), // 1.25 GB
      tcpTx: BigInt(860000000),  // 860 MB
      udpRx: BigInt(50000000),   // 50 MB
      udpTx: BigInt(28000000),   // 28 MB
    },
  });

  console.log('已创建测试隧道:', tunnel.name);

  // 创建操作日志
  const operationLog = await prisma.tunnelOperationLog.create({
    data: {
      tunnelId: tunnel.id,
      tunnelName: tunnel.name,
      action: 'START',
      status: 'SUCCESS',
      message: '隧道启动成功',
    },
  });

  console.log('已创建操作日志:', operationLog.id);

  // 更新端点隧道数量
  await prisma.endpoint.update({
    where: { id: endpoints[0].id },
    data: { tunnelCount: 1 },
  });

  console.log('种子数据添加完成！');
}

main()
  .catch((e) => {
    console.error('种子数据添加失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  }); 