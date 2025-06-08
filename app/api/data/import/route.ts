import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { sseService } from '@/lib/server/sse-service';
import { logger } from '@/lib/server/logger';

// 定义导入数据的验证模式
const EndpointSchema = z.object({
  name: z.string(),
  url: z.string(),
  apiPath: z.string(),
  apiKey: z.string(),
  status: z.enum(['ONLINE', 'OFFLINE', 'FAIL']),
  color: z.string().optional(),
  lastCheck: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  tunnelCount: z.number().optional(),
  tunnels: z.array(z.object({
    name: z.string(),
    mode: z.enum(['server', 'client']),
    status: z.enum(['running', 'stopped', 'error']),
    tunnelAddress: z.string(),
    tunnelPort: z.string(),
    targetAddress: z.string(),
    targetPort: z.string(),
    tlsMode: z.enum(['inherit', 'mode0', 'mode1', 'mode2']),
    certPath: z.string().optional().nullable(),
    keyPath: z.string().optional().nullable(),
    logLevel: z.enum(['inherit', 'debug', 'info', 'warn', 'error', 'fatal']),
    commandLine: z.string(),
    instanceId: z.string().optional().nullable(),
    tcpRx: z.union([z.string(), z.number()]).optional(),
    tcpTx: z.union([z.string(), z.number()]).optional(),
    udpRx: z.union([z.string(), z.number()]).optional(),
    udpTx: z.union([z.string(), z.number()]).optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
    lastEventTime: z.string().optional().nullable(),
  })).optional().default([]),
});

const ImportDataSchema = z.object({
  version: z.string(),
  timestamp: z.string(),
  data: z.object({
    endpoints: z.array(EndpointSchema),
  }),
});

export async function POST(request: NextRequest) {
  try {
    const importData = await request.json();
    
    // 验证导入数据格式
    const validatedData = ImportDataSchema.parse(importData);
    
    // 导入结果统计
    const importResults = {
      endpoints: 0,
      tunnels: 0,
      connections: 0,
      skipped: {
        endpoints: 0,
      }
    };

    // 使用事务处理导入过程
    await prisma.$transaction(async (tx) => {
      // 导入端点数据
      for (const endpoint of validatedData.data.endpoints) {
        // 检查端点是否已存在
        const existingEndpoint = await tx.endpoint.findFirst({
          where: {
            OR: [
              { url: endpoint.url, apiPath: endpoint.apiPath },
              { name: endpoint.name }
            ]
          },
        });

        if (existingEndpoint) {
          importResults.skipped.endpoints++;
          continue;
        }

        // 创建新端点
        const createdEndpoint = await tx.endpoint.create({
          data: {
            name: endpoint.name,
            url: endpoint.url,
            apiPath: endpoint.apiPath,
            apiKey: endpoint.apiKey,
            status: endpoint.status,
            color: endpoint.color || 'default',
            tunnelCount: endpoint.tunnelCount || 0,
            lastCheck: endpoint.lastCheck ? new Date(endpoint.lastCheck) : new Date(),
            createdAt: endpoint.createdAt ? new Date(endpoint.createdAt) : new Date(),
            updatedAt: endpoint.updatedAt ? new Date(endpoint.updatedAt) : new Date(),
          },
        });

        importResults.endpoints++;

        // 导入关联的隧道
        if (endpoint.tunnels && endpoint.tunnels.length > 0) {
          for (const tunnel of endpoint.tunnels) {
            // 创建新隧道，关联到新的端点
            const tunnelData = {
              name: tunnel.name,
              mode: tunnel.mode,
              status: tunnel.status,
              tunnelAddress: tunnel.tunnelAddress,
              tunnelPort: tunnel.tunnelPort,
              targetAddress: tunnel.targetAddress,
              targetPort: tunnel.targetPort,
              tlsMode: tunnel.tlsMode,
              certPath: tunnel.certPath,
              keyPath: tunnel.keyPath,
              logLevel: tunnel.logLevel,
              commandLine: tunnel.commandLine,
              instanceId: tunnel.instanceId,
              tcpRx: tunnel.tcpRx ? BigInt(tunnel.tcpRx.toString()) : BigInt(0),
              tcpTx: tunnel.tcpTx ? BigInt(tunnel.tcpTx.toString()) : BigInt(0),
              udpRx: tunnel.udpRx ? BigInt(tunnel.udpRx.toString()) : BigInt(0),
              udpTx: tunnel.udpTx ? BigInt(tunnel.udpTx.toString()) : BigInt(0),
              endpointId: createdEndpoint.id,
              createdAt: tunnel.createdAt ? new Date(tunnel.createdAt) : new Date(),
              updatedAt: tunnel.updatedAt ? new Date(tunnel.updatedAt) : new Date(),
              lastEventTime: tunnel.lastEventTime ? new Date(tunnel.lastEventTime) : null,
            };

            await tx.tunnel.create({
              data: tunnelData,
            });
            importResults.tunnels++;
          }
        }
      }
    });

    // 重置并重新初始化SSE服务
    try {
      logger.info('[数据导入] 开始重置SSE服务...');
      await sseService.reset();
      
      logger.info('[数据导入] 开始重新初始化SSE服务...');
      await sseService.initialize();
      
      // 获取成功连接的端点数量
      const status = sseService.getStatus();
      
      logger.info(`[数据导入] SSE服务重新初始化完成，已连接 ${importResults.connections} 个端点`);
    } catch (error) {
      logger.error('[数据导入] SSE服务重置或初始化过程中出错:', error);
    }

    return NextResponse.json({
      success: true,
      message: `成功导入 ${importResults.tunnels} 个隧道，` +
        `跳过 ${importResults.skipped.endpoints} 个已存在的端点`,
      results: importResults,
    });
  } catch (error) {
    console.error('导入数据失败:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          error: '导入数据格式无效', 
          details: error.errors.map(err => ({
            path: err.path.join('.'),
            message: err.message
          }))
        },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: '导入数据失败' },
      { status: 500 }
    );
  }
} 