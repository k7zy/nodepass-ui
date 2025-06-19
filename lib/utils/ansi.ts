export function processAnsiColors(text: string): string {
  try {
    // 移除时间戳，如 2023-01-01 12:34:56.789 
    // text = text.replace(/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}\.\d{3}\s/, "");
    // 将时间戳2023-01-01 12:34:56.789格式化为2023-01-01 12:34:56
    text = text.replace(/\.\d{3}\s/, " ");
    // 移除 ESC 控制符，仅保留颜色码
    text = text.replace(/\u001B/g, "");

    const colorMap: Array<[RegExp, string]> = [
      [/\[32m/g, '<span class="text-green-400">'],   // 绿色 INFO
      [/\[31m/g, '<span class="text-red-400">'],     // 红色 ERROR
      [/\[33m/g, '<span class="text-yellow-400">'],  // 黄色 WARN
      [/\[34m/g, '<span class="text-blue-400">'],    // 蓝色 DEBUG
      [/\[35m/g, '<span class="text-purple-400">'],  // 紫色
      [/\[36m/g, '<span class="text-cyan-400">'],    // 青色
      [/\[37m/g, '<span class="text-gray-400">'],    // 灰色
      [/\[0m/g, '</span>'],                            // 重置
    ];

    for (const [pattern, replacement] of colorMap) {
      text = text.replace(pattern, replacement);
    }

    // 补全未闭合标签，防止布局错乱
    const openTags = (text.match(/<span/g) || []).length;
    const closeTags = (text.match(/<\/span>/g) || []).length;
    if (openTags > closeTags) {
      text += "</span>".repeat(openTags - closeTags);
    }

    return text;
  } catch (error) {
    console.error("ANSI 颜色处理失败:", error);
    return text;
  }
} 