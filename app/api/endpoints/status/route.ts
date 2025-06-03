import { prisma } from '@/lib/prisma';

export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // 发送初始状态
        const endpoints = await prisma.endpoint.findMany({
          orderBy: { createdAt: 'desc' }
        });
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(endpoints)}\n\n`));

        // 每 30 秒检查一次状态
        const interval = setInterval(async () => {
          try {
            const updatedEndpoints = await prisma.endpoint.findMany({
              orderBy: { createdAt: 'desc' }
            });
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(updatedEndpoints)}\n\n`));
          } catch (error) {
            console.error('获取端点状态失败:', error);
          }
        }, 30000);

        // 清理定时器
        return () => {
          clearInterval(interval);
        };
      } catch (error) {
        console.error('初始化状态流失败:', error);
        controller.error(error);
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
} 