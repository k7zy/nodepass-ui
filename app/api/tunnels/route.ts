import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { TunnelStatus, Endpoint } from '@prisma/client';
import { convertBigIntToNumber, formatTrafficBytes } from '@/lib/utils/traffic';
import { fetchWithSSLSupport } from '@/lib/utils/fetch';

export async function GET() {
  try {
    const tunnels = await prisma.tunnel.findMany({
      include: {
        endpoint: {
          select: {
            id: true,
            name: true,
            status: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // 格式化数据以匹配前端期望的格式
    const formattedTunnels = tunnels.map(tunnel => ({
      id: tunnel.id,
      instanceId: tunnel.instanceId || null,
      type: tunnel.mode === 'server' ? '服务端' : '客户端',
      name: tunnel.name,
      endpoint: tunnel.endpoint.name,
      endpointId: tunnel.endpointId,
      tunnelAddress: `${tunnel.tunnelAddress}:${tunnel.tunnelPort}`,
      targetAddress: `${tunnel.targetAddress}:${tunnel.targetPort}`,
      status: {
        type: tunnel.status === TunnelStatus.running ? "success" as const :
              tunnel.status === TunnelStatus.error ? "warning" as const : "danger" as const,
        text: tunnel.status === TunnelStatus.running ? "运行中" :
              tunnel.status === TunnelStatus.error ? "错误" : "已停止"
      },
      avatar: tunnel.endpoint.name.charAt(0).toUpperCase(),
      // 添加流量统计信息
      traffic: {
        tcpRx: convertBigIntToNumber(tunnel.tcpRx),
        tcpTx: convertBigIntToNumber(tunnel.tcpTx),
        udpRx: convertBigIntToNumber(tunnel.udpRx),
        udpTx: convertBigIntToNumber(tunnel.udpTx),
        total: convertBigIntToNumber(tunnel.tcpRx) + convertBigIntToNumber(tunnel.tcpTx) + 
               convertBigIntToNumber(tunnel.udpRx) + convertBigIntToNumber(tunnel.udpTx),
        // 格式化的流量显示
        formatted: {
          tcpRx: formatTrafficBytes(tunnel.tcpRx).formatted,
          tcpTx: formatTrafficBytes(tunnel.tcpTx).formatted,
          udpRx: formatTrafficBytes(tunnel.udpRx).formatted,
          udpTx: formatTrafficBytes(tunnel.udpTx).formatted,
          total: formatTrafficBytes(
            convertBigIntToNumber(tunnel.tcpRx) + convertBigIntToNumber(tunnel.tcpTx) + 
            convertBigIntToNumber(tunnel.udpRx) + convertBigIntToNumber(tunnel.udpTx)
          ).formatted
        }
      }
    }));

    return NextResponse.json(formattedTunnels);
  } catch (error) {
    console.error('获取隧道列表失败:', error);
    return NextResponse.json(
      { error: '获取隧道列表失败' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      name,
      endpointId,
      mode,
      tunnelAddress,
      tunnelPort,
      targetAddress,
      targetPort,
      tlsMode,
      certPath,
      keyPath,
      logLevel
    } = body;

    // 验证必填字段
    if (!name || !endpointId || !mode || !tunnelPort || !targetPort) {
      return NextResponse.json(
        { error: '缺少必填字段' },
        { status: 400 }
      );
    }

    // 验证端点是否存在
    const endpoint = await prisma.endpoint.findUnique({
      where: { id: endpointId }
    });

    if (!endpoint) {
      return NextResponse.json(
        { error: '指定的端点不存在' },
        { status: 400 }
      );
    }

    // 检查隧道名称是否重复
    const existingTunnel = await prisma.tunnel.findUnique({
      where: { name }
    });

    if (existingTunnel) {
      return NextResponse.json(
        { error: '隧道名称已存在' },
        { status: 400 }
      );
    }

    // 构建命令行
    let commandLine = `${mode}://${tunnelAddress}:${tunnelPort}/${targetAddress}:${targetPort}`;
    
    // 添加查询参数
    const queryParams = [];
    
    // 只有当日志级别不是 inherit 时才添加
    if (logLevel !== 'inherit') {
      queryParams.push(`log=${logLevel}`);
    }
    
    if (mode === 'server') {
      // 只有当 TLS 模式不是 inherit 时才添加
      if (tlsMode !== 'inherit') {
        const tlsModeNum = tlsMode === 'mode0' ? '0' : tlsMode === 'mode1' ? '1' : '2';
        queryParams.push(`tls=${tlsModeNum}`);
        
        if (tlsMode === 'mode2' && certPath && keyPath) {
          queryParams.push(`crt=${certPath}`, `key=${keyPath}`);
        }
      }
    }
    
    // 如果有查询参数，则添加到命令行
    if (queryParams.length > 0) {
      commandLine += `?${queryParams.join('&')}`;
    }

    // 调用NodePass API创建隧道实例
    try {
      // 从端点URL解析host和port
      const endpointUrl = new URL(endpoint.url);
      const apiUrl = `${endpoint.url}${endpoint.apiPath}/instances`;
      
      const nodepassResponse = await fetchWithSSLSupport(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': endpoint.apiKey
        },
        body: JSON.stringify({
          url: commandLine
        })
      });

      if (!nodepassResponse.ok) {
        throw new Error(`NodePass API响应错误: ${nodepassResponse.status}`);
      }

      const nodepassData = await nodepassResponse.json();
      
      // 使用 upsert 而不是 create，这样如果记录已存在就会更新
      const tunnel = await prisma.tunnel.upsert({
        where: {
          endpointId_instanceId: {
            endpointId,
            instanceId: nodepassData.id
          }
        },
        create: {
          name,
          endpointId,
          mode: mode as any,
          tunnelAddress,
          tunnelPort,
          targetAddress,
          targetPort,
          tlsMode: tlsMode as any,
          certPath,
          keyPath,
          logLevel: logLevel as any,
          commandLine,
          instanceId: nodepassData.id,
          status: nodepassData.status === 'running' ? TunnelStatus.running : TunnelStatus.stopped
        },
        update: {
          name,
          mode: mode as any,
          tunnelAddress,
          tunnelPort,
          targetAddress,
          targetPort,
          tlsMode: tlsMode as any,
          certPath,
          keyPath,
          logLevel: logLevel as any,
          commandLine,
          status: nodepassData.status === 'running' ? TunnelStatus.running : TunnelStatus.stopped
        }
      });

      // 手动更新端点的实例数量
      await updateEndpointInstanceCount(endpointId);

      return NextResponse.json({
        success: true,
        tunnel: convertBigIntToNumber({
          id: tunnel.id,
          name: tunnel.name,
          nodepassId: nodepassData.id,
          status: nodepassData.status
        } as any)
      });

    } catch (apiError) {
      throw new Error(`NodePass API响应错误: ${apiError}`);
    }
  } catch (error) {
    console.error('创建隧道实例失败:', error);
    return NextResponse.json(
      { error: '创建隧道实例失败' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { instanceId } = await request.json();

    if (!instanceId) {
      return NextResponse.json(
        { error: '缺少隧道实例ID' },
        { status: 400 }
      );
    }

    // 通过instanceId查找隧道实例
    const tunnel = await (prisma.tunnel as any).findFirst({
      where: { instanceId },
      include: {
        endpoint: true
      }
    });

    if (!tunnel) {
      return NextResponse.json(
        { error: '隧道实例不存在' },
        { status: 404 }
      );
    }

    // 调用NodePass API删除
    try {
      const endpointUrl = new URL(tunnel.endpoint.url);
      const apiUrl = `${tunnel.endpoint.url}${tunnel.endpoint.apiPath}/instances/${instanceId}`;
      
      console.log(`=== NodePass DELETE API调试信息 ===`);
      console.log(`隧道实例ID: ${instanceId}`);
      console.log(`端点URL: ${tunnel.endpoint.url}`);
      console.log(`API路径: ${tunnel.endpoint.apiPath}`);
      console.log(`完整API URL: ${apiUrl}`);
      console.log(`API Key: ${tunnel.endpoint.apiKey ? '已设置' : '未设置'}`);
      console.log(`===============================`);
      
      const nodepassResponse = await fetchWithSSLSupport(apiUrl, {
        method: 'DELETE',
        headers: {
          'X-API-Key': tunnel.endpoint.apiKey
        }
      });

      if (!nodepassResponse.ok) {
        console.warn(`NodePass API删除失败: ${nodepassResponse.status}，继续删除本地记录`);
      } else {
        console.log(`NodePass API删除成功: ${instanceId}`);
      }
    } catch (apiError) {
      console.warn(`调用NodePass API删除失败:`, apiError, '继续删除本地记录');
    }

    // 删除隧道实例
    await prisma.tunnel.delete({
      where: { id: tunnel.id }
    });

    // 记录操作日志
    await prisma.tunnelOperationLog.create({
      data: {
        tunnelId: tunnel.id,
        tunnelName: tunnel.name,
        action: 'delete',
        status: 'success',
        message: `隧道删除成功`
      }
    });

    // 手动更新端点的实例数量
    await updateEndpointInstanceCount(tunnel.endpointId);

    return NextResponse.json({ 
      success: true,
      message: '隧道删除成功'
    });

  } catch (error) {
    console.error('删除隧道实例失败:', error);
    return NextResponse.json(
      { error: '删除隧道实例失败' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { instanceId, action } = body;

    if (!instanceId || !action) {
      return NextResponse.json(
        { error: '缺少隧道实例ID或操作类型' },
        { status: 400 }
      );
    }

    // 验证操作类型
    if (!['start', 'stop', 'restart'].includes(action)) {
      return NextResponse.json(
        { error: '无效的操作类型，支持: start, stop, restart' },
        { status: 400 }
      );
    }

    // 通过instanceId查找隧道实例
    const tunnel = await (prisma.tunnel as any).findFirst({
      where: { instanceId },
      include: {
        endpoint: true
      }
    });

    if (!tunnel) {
      return NextResponse.json(
        { error: '隧道实例不存在' },
        { status: 404 }
      );
    }

    // 调用NodePass API执行操作
    try {
      const endpointUrl = new URL(tunnel.endpoint.url);
      const apiUrl = `${tunnel.endpoint.url}${tunnel.endpoint.apiPath}/instances/${instanceId}`;
      
      console.log(`=== NodePass API调试信息 ===`);
      console.log(`操作类型: ${action}`);
      console.log(`隧道实例ID: ${instanceId}`);
      console.log(`端点URL: ${tunnel.endpoint.url}`);
      console.log(`API路径: ${tunnel.endpoint.apiPath}`);
      console.log(`完整API URL: ${apiUrl}`);
      console.log(`API Key: ${tunnel.endpoint.apiKey ? '已设置' : '未设置'}`);
      console.log(`========================`);
      
      const nodepassResponse = await fetchWithSSLSupport(apiUrl, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': tunnel.endpoint.apiKey
        },
        body: JSON.stringify({
          action: action
        })
      });

      if (!nodepassResponse.ok) {
        const errorText = await nodepassResponse.text();
        console.error(`NodePass API错误响应: ${nodepassResponse.status} - ${errorText}`);
        throw new Error(`NodePass API响应错误: ${nodepassResponse.status}`);
      }

      const nodepassData = await nodepassResponse.json();
      
      // 根据操作类型和响应更新本地状态
      let newStatus: TunnelStatus;
      switch (action) {
        case 'start':
          newStatus = nodepassData.status === 'running' ? TunnelStatus.running : TunnelStatus.error;
          break;
        case 'stop':
          newStatus = nodepassData.status === 'stopped' ? TunnelStatus.stopped : TunnelStatus.error;
          break;
        case 'restart':
          newStatus = nodepassData.status === 'running' ? TunnelStatus.running : TunnelStatus.error;
          break;
        default:
          newStatus = TunnelStatus.error;
      }

      // 更新本地隧道状态
      const updatedTunnel = await prisma.tunnel.update({
        where: { id: tunnel.id },
        data: { status: newStatus }
      });

      // 记录操作日志
      await prisma.tunnelOperationLog.create({
        data: {
          tunnelId: tunnel.id,
          tunnelName: tunnel.name,
          action: action,
          status: 'success',
          message: `隧道${action}操作成功，状态: ${nodepassData.status}`
        }
      });

      // 手动更新端点的实例数量
      await updateEndpointInstanceCount(tunnel.endpointId);

      return NextResponse.json({
        success: true,
        tunnel: convertBigIntToNumber({
          id: updatedTunnel.id,
          name: updatedTunnel.name,
          status: newStatus,
          nodepassStatus: nodepassData.status
        } as any),
        message: `隧道${action}操作成功`
      });

    } catch (apiError) {
      console.error(`调用NodePass API执行${action}操作失败:`, apiError);
      
      // 更新本地状态为错误
      await prisma.tunnel.update({
        where: { id: tunnel.id },
        data: { status: TunnelStatus.error }
      });

      // 记录操作日志
      await prisma.tunnelOperationLog.create({
        data: {
          tunnelId: tunnel.id,
          tunnelName: tunnel.name,
          action: action,
          status: 'failed',
          message: `NodePass API调用失败: ${apiError instanceof Error ? apiError.message : String(apiError)}`
        }
      });

      // 手动更新端点的实例数量（即使失败也要更新）
      await updateEndpointInstanceCount(tunnel.endpointId);

      return NextResponse.json({
        success: false,
        error: `NodePass API调用失败，隧道状态已设为错误`,
        tunnel: convertBigIntToNumber({
          id: tunnel.id,
          name: tunnel.name,
          status: 'error'
        } as any)
      }, { status: 207 }); // 207 Multi-Status表示部分成功
    }

  } catch (error) {
    console.error('隧道操作失败:', error);
    return NextResponse.json(
      { error: '隧道操作失败' },
      { status: 500 }
    );
  }
}

// 更新端点实例数量的辅助函数
async function updateEndpointInstanceCount(endpointId: number) {
  try {
    // 统计运行中的隧道实例数量
    const runningInstances = await prisma.tunnel.count({
      where: {
        endpointId: endpointId
      }
    });

    // 更新端点的实例数量
    await prisma.endpoint.update({
      where: { id: endpointId },
      data: { 
        tunnelCount: runningInstances,
        lastCheck: new Date()
      }
    });

    console.log(`端点 ${endpointId} 实例统计已更新: ${runningInstances} 个运行中`);

  } catch (error) {
    console.error(`更新端点 ${endpointId} 实例统计失败:`, error);
  }
} 