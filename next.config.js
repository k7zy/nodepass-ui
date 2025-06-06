/** @type {import('next').NextConfig} */
const nextConfig = {
  // 暂时禁用 standalone 模式以避免 Windows 符号链接权限问题
  // output: 'standalone',
  // 优化打包大小
  outputFileTracingRoot: process.cwd(),
  // 跳过构建时的 ESLint 检查
  eslint: {
    ignoreDuringBuilds: true,
  },
  // 禁用开发工具
  devIndicators: {
    buildActivity: false,
    buildActivityPosition: 'bottom-left',
  },
  // 禁用所有调试功能
  reactStrictMode: true,
  productionBrowserSourceMaps: false,
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },
};

module.exports = nextConfig;
