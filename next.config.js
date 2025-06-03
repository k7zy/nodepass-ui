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
};

module.exports = nextConfig;
