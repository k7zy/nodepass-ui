// 全局 SSE 管理器初始化
// 确保在应用启动时就创建 SSEManager 实例

import { sseManager, SSEManager } from './sse-manager';

// 定义全局类型
declare global {
  var __nodepass_sse_manager: SSEManager | undefined;
}

// 初始化全局 SSE 管理器
function initializeGlobalSSE() {
  // 确保 SSEManager 实例已创建并绑定到全局对象
  if (!global.__nodepass_sse_manager) {
    console.log('[Global-SSE] 初始化全局SSE管理器');
    global.__nodepass_sse_manager = sseManager;
    console.log('[Global-SSE] SSE管理器已注册到全局对象');
  } else {
    console.log('[Global-SSE] 全局SSE管理器已存在');
  }
  
  // 返回管理器实例
  return global.__nodepass_sse_manager;
}

// 获取全局 SSE 管理器
export function getGlobalSSEManager(): SSEManager {
  if (!global.__nodepass_sse_manager) {
    console.log('[Global-SSE] 全局SSE管理器不存在，正在初始化...');
    return initializeGlobalSSE();
  }
  
  // console.log('[Global-SSE] 返回现有的全局SSE管理器实例');
  return global.__nodepass_sse_manager;
}

// 立即初始化
const globalSSEManager = initializeGlobalSSE();

// 导出初始化后的管理器
export { globalSSEManager };
export default globalSSEManager; 