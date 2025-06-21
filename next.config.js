/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV === 'development';

const nextConfig = {
  // 使用纯静态导出模式
  output: 'export',
  // 输出目录改为 web/dist
  distDir: 'dist',
  // 优化打包大小
  outputFileTracingRoot: process.cwd(),
  // 跳过构建时的 ESLint 检查
  eslint: {
    ignoreDuringBuilds: true,
  },
  // 禁用开发工具
  devIndicators: {
    position: 'bottom-left',
  },
  // 禁用所有调试功能
  reactStrictMode: true,
  productionBrowserSourceMaps: false,
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },
  // 由于使用静态导出，需要禁用图片优化
  // images: {
  //   unoptimized: true,
  // },
  // 配置导出时的基础路径
  basePath: '',
  // 配置静态导出时的路由处理
  trailingSlash: !isDev,
  // 配置实验性功能
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000', '127.0.0.1:3000']
    }
  },
  // 配置开发模式下允许的跨域来源
  allowedDevOrigins: [
    'localhost:3000',
    '127.0.0.1:3000',
    '192.168.0.83:3000',
    '0.0.0.0:3000'
  ],
  // 开发模式本地代理 API
  async rewrites() {
    if (isDev) {
      const apiBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000';
      return [
        {
          source: '/api/:path*',
          destination: `${apiBase}/api/:path*`,
        },
      ];
    }
    return [];
  }
};

module.exports = nextConfig;
