import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { logTunnelOperation } from '@/lib/operation-log';
import { sseService } from '@/lib/server/sse-service';

// 端点数据验证 schema
const endpointSchema = z.object({
  name: z.string().min(1, '端点名称不能为空').max(50, '端点名称不能超过50个字符'),
  url: z.string().url('请输入有效的URL地址'),
  apiPath: z.string().min(1, 'API前缀不能为空'),
  apiKey: z.string().min(1, 'API Key不能为空').max(200, 'API Key不能超过200个字符'),
  color: z.string().optional(),
});

type EndpointWithTunnels = {
  id: number;
  name: string;
  url: string;
  apiPath: string;
  apiKey: string;
  status: 'ONLINE' | 'OFFLINE' | 'FAIL';
  lastCheck: Date;
  createdAt: Date;
  updatedAt: Date;
  color: string | null;
  _count: {
    tunnels: number;
  };
  tunnels: {
    id: number;
    status: 'running' | 'stopped' | 'error';
  }[];
};

interface FormattedEndpoint {
  id: number;
  name: string;
  url: string;
  apiPath: string;
  apiKey: string;
  status: 'ONLINE' | 'OFFLINE' | 'FAIL';
  tunnelCount: number;
  activeTunnels: number;
  createdAt: Date;
  updatedAt: Date;
  lastCheck: Date;
  color: string | null;
}

// GET - 获取端点列表
export async function GET(request: NextRequest) {
  try {
    const endpoints = await prisma.endpoint.findMany({
      include: {
        _count: {
          select: { tunnels: true }
        },
        tunnels: {
          select: {
            id: true,
            status: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // 格式化返回数据
    const formattedEndpoints: FormattedEndpoint[] = endpoints.map((endpoint: EndpointWithTunnels) => {
      const activeTunnels = endpoint.tunnels.filter(tunnel => tunnel.status === 'running').length;
      
      return {
        id: endpoint.id,
        name: endpoint.name,
        url: endpoint.url,
        apiPath: endpoint.apiPath,
        apiKey: endpoint.apiKey,
        status: endpoint.status,
        tunnelCount: endpoint._count.tunnels,
        activeTunnels,
        createdAt: endpoint.createdAt,
        updatedAt: endpoint.updatedAt,
        lastCheck: endpoint.lastCheck,
        color: endpoint.color
      };
    });

    return NextResponse.json(formattedEndpoints);
  } catch (error) {
    console.error('获取端点列表失败:', error);
    return NextResponse.json(
      { error: '获取端点列表失败' },
      { status: 500 }
    );
  }
}

// POST - 创建新端点
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = endpointSchema.parse(body);
    
    // 检查名称是否重复
    const existingEndpoint = await prisma.endpoint.findFirst({
      where: {
        name: validatedData.name
      }
    });
    
    if (existingEndpoint) {
      return NextResponse.json(
        { error: '端点名称已存在，请使用其他名称' },
        { status: 400 }
      );
    }
    
    // 检查URL是否重复
    const existingUrl = await prisma.endpoint.findFirst({
      where: {
        url: validatedData.url
      }
    });
    
    if (existingUrl) {
      return NextResponse.json(
        { error: '该URL已存在，请使用其他URL' },
        { status: 400 }
      );
    }
    
    // 创建新端点
    const newEndpoint = await prisma.endpoint.create({
      data: {
        name: validatedData.name,
        url: validatedData.url,
        apiPath: validatedData.apiPath,
        apiKey: validatedData.apiKey,
        color: validatedData.color || 'default',
        status: 'OFFLINE'
      }
    });

    // 记录操作日志
    // await logTunnelOperation({
    //   tunnelId: newEndpoint.id.toString(),
    //   tunnelName: newEndpoint.name,
    //   action: 'CREATED',
    //   status: 'SUCCESS',
    //   message: '成功创建新端点'
    // });

    // 通知 SSE 服务开始监听新端点
    try {
      await sseService.connectEndpoint(newEndpoint.id);
      console.log(`SSE 服务已开始监听端点: ${newEndpoint.name} (${newEndpoint.id})`);
    } catch (error) {
      console.error(`SSE 服务连接端点 ${newEndpoint.name} 失败:`, error);
      // 注意：这里我们不让 SSE 连接失败影响端点创建，因为端点已经保存到数据库
      // 用户可以稍后手动重连
    }
    
    return NextResponse.json({ 
      success: true, 
      endpoint: newEndpoint 
    });
    
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ 
        error: '数据验证失败', 
        details: error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message
        }))
      }, { status: 400 });
    }
    
    console.error('创建端点失败:', error);
    return NextResponse.json(
      { error: '创建端点失败' }, 
      { status: 500 }
    );
  }
}

// DELETE - 删除端点
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { id } = body;
    
    if (!id) {
      return NextResponse.json(
        { error: '端点ID不能为空' },
        { status: 400 }
      );
    }
    
    // 查找要删除的端点
    const endpoint = await prisma.endpoint.findUnique({
      where: { id }
    });

    if (!endpoint) {
      return NextResponse.json(
        { error: '端点不存在' },
        { status: 404 }
      );
    }

    // 先断开 SSE 连接
    try {
      await sseService.removeEndpoint(id);
      console.log(`已断开端点 ${endpoint.name} 的 SSE 连接`);
    } catch (error) {
      console.error(`断开端点 ${endpoint.name} SSE 连接失败:`, error);
      // 继续执行删除操作，不让 SSE 断开失败影响数据库删除
    }
    
    // 删除端点（级联删除相关数据）
    const deletedEndpoint = await prisma.endpoint.delete({
      where: { id }
    });

    // TODO: 如果需要记录端点操作日志，应该创建专门的函数
    
    return NextResponse.json({ 
      success: true, 
      deletedEndpoint 
    });
    
  } catch (error) {
    console.error('删除端点失败:', error);
    return NextResponse.json(
      { error: '删除端点失败' }, 
      { status: 500 }
    );
  }
}

// PATCH - 重连或断开端点
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, action } = body;
    
    if (!id) {
      return NextResponse.json(
        { error: '端点ID不能为空' },
        { status: 400 }
      );
    }

    if (!['reconnect', 'disconnect'].includes(action)) {
      return NextResponse.json(
        { error: '不支持的操作，仅支持 reconnect 或 disconnect' },
        { status: 400 }
      );
    }
    
    const requestId= Number(id) 
    // 查找端点
    const endpoint = await prisma.endpoint.findUnique({
      where: { id:requestId }
    });

    if (!endpoint) {
      return NextResponse.json(
        { error: '端点不存在' },
        { status: 404 }
      );
    }

    try {
      if (action === 'reconnect') {
        // 手动重连端点
        await sseService.resetAndReconnectEndpoint(requestId);
        console.log(`端点 ${endpoint.name} 重连成功`);

        return NextResponse.json({ 
          success: true, 
          message: '端点重连成功' 
        });
        
      } else if (action === 'disconnect') {
        // 手动断开端点连接
        await sseService.manualDisconnectEndpoint(requestId);
        console.log(`端点 ${endpoint.name} 已手动断开连接`);
        
        return NextResponse.json({ 
          success: true, 
          message: '端点连接已断开' 
        });
      }
      
    } catch (error) {
      console.error(`端点 ${endpoint.name} ${action === 'reconnect' ? '重连' : '断开'} 失败:`, error);

      return NextResponse.json(
        { error: `端点${action === 'reconnect' ? '重连' : '断开'}失败` }, 
        { status: 500 }
      );
    }
    
  } catch (error) {
    console.error('处理端点操作请求失败:', error);
    return NextResponse.json(
      { error: '处理端点操作请求失败' }, 
      { status: 500 }
    );
  }
} 