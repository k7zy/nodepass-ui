import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { EndpointStatus } from '@prisma/client';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const excludeFailed = searchParams.get('excludeFailed') === 'true';

    const endpoints = await prisma.endpoint.findMany({
      where: excludeFailed ? {
        status: {
          not: EndpointStatus.FAIL
        }
      } : undefined,
      select: {
        id: true,
        name: true,
        url: true,
        apiPath: true,
        status: true,
        tunnelCount: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return NextResponse.json(endpoints);
  } catch (error) {
    console.error('获取端点列表失败:', error);
    return NextResponse.json(
      { error: '获取端点列表失败' },
      { status: 500 }
    );
  }
} 