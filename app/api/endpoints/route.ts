import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { logTunnelOperation } from '@/lib/operation-log';
import { sseService } from '@/lib/server/sse-service';
import { EndpointStatus } from '@prisma/client';

// 端点数据验证 schema
const endpointSchema = z.object({
  name: z.string().min(1, '端点名称不能为空').max(50, '端点名称不能超过50个字符'),
  url: z.string().url('请输入有效的URL地址'),
  apiPath: z.string().min(1, 'API前缀不能为空'),
  apiKey: z.string().min(1, 'API Key不能为空').max(200, 'API Key不能超过200个字符'),
  color: z.string().optional(),
});

// 验证更新请求体的schema
const updateEndpointSchema = z.object({
  id: z.number(),
  action: z.literal('update'),
  name: z.string().min(1, '端点名称不能为空').max(50, '端点名称不能超过50个字符'),
  url: z.string().url('请输入有效的URL地址'),
  apiPath: z.string().min(1, 'API前缀不能为空'),
  apiKey: z.string().min(1, 'API Key不能为空').max(200, 'API Key不能超过200个字符'),
});

// 重命名端点的验证schema
const renameEndpointSchema = z.object({
  id: z.number(),
  name: z.string().min(1, "名称不能为空"),
  action: z.literal("rename")
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

// PATCH /api/endpoints - 更新端点状态或配置
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();

    // 根据action选择不同的处理逻辑
    switch (body.action) {
      case "rename": {
        const { id, name } = renameEndpointSchema.parse(body);
        
        // 检查新名称是否已存在
        const existingEndpoint = await prisma.endpoint.findFirst({
          where: {
            name,
            id: {
              not: id
            }
          }
        });

        if (existingEndpoint) {
          return NextResponse.json(
            { error: "该名称已被使用" },
            { status: 400 }
          );
        }

        // 更新端点名称
        await prisma.endpoint.update({
          where: { id },
          data: { name }
        });

        return NextResponse.json({ message: "主控名称已更新" });
      }

      case "reconnect": {
        const { id } = body;
        
        if (!id) {
          return NextResponse.json(
            { error: '端点ID不能为空' },
            { status: 400 }
          );
        }

        // 查找端点
        const endpoint = await prisma.endpoint.findUnique({
          where: { id }
        });

        if (!endpoint) {
          return NextResponse.json(
            { error: '端点不存在' },
            { status: 404 }
          );
        }

        try {
          // 手动重连端点
          await sseService.resetAndReconnectEndpoint(id);
          console.log(`端点 ${endpoint.name} 重连成功`);

          return NextResponse.json({ 
            success: true, 
            message: '端点重连成功' 
          });
        } catch (error) {
          console.error(`端点 ${endpoint.name} 重连失败:`, error);

          return NextResponse.json(
            { error: '端点重连失败' }, 
            { status: 500 }
          );
        }
      }

      case "disconnect": {
        const { id } = body;
        
        if (!id) {
          return NextResponse.json(
            { error: '端点ID不能为空' },
            { status: 400 }
          );
        }

        // 查找端点
        const endpoint = await prisma.endpoint.findUnique({
          where: { id }
        });

        if (!endpoint) {
          return NextResponse.json(
            { error: '端点不存在' },
            { status: 404 }
          );
        }

        try {
          // 手动断开端点连接
          await sseService.manualDisconnectEndpoint(id);
          console.log(`端点 ${endpoint.name} 已手动断开连接`);
          
          return NextResponse.json({ 
            success: true, 
            message: '端点连接已断开' 
          });
        } catch (error) {
          console.error(`端点 ${endpoint.name} 断开连接失败:`, error);

          return NextResponse.json(
            { error: '端点断开连接失败' }, 
            { status: 500 }
          );
        }
      }

      default:
        return NextResponse.json(
          { error: "不支持的操作类型" },
          { status: 400 }
        );
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "数据验证失败", details: error.errors },
        { status: 400 }
      );
    }

    console.error("端点更新失败:", error);
    return NextResponse.json(
      { error: "端点更新失败" },
      { status: 500 }
    );
  }
} 