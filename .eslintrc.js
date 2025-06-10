module.exports = {
    extends: ['next/core-web-vitals'],
    rules: {
      // 关闭Prettier相关的规则，因为在Docker构建中不重要
      'prettier/prettier': 'off',
      
      // 放宽一些严格的规则
      '@typescript-eslint/no-unused-vars': 'warn',
      'no-console': 'warn',
      'padding-line-between-statements': 'off',
      'import/order': 'warn',
      
      // 如果你想完全跳过ESLint检查，可以使用：
      // '@next/next/no-html-link-for-pages': 'off',
    },
    
    // 在Docker构建时跳过某些文件
    ignorePatterns: [
      'node_modules/',
      '.next/',
      'out/',
      'dist/',
    ],
  }