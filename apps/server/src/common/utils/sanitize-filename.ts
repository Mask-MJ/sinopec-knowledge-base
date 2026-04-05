/**
 * 净化文件名，移除路径遍历和特殊字符。
 * 仅保留字母、数字、空格、连字符、下划线和点号，其余替换为下划线。
 */
export function sanitizeFilename(filename: string): string {
  return filename.replaceAll(/[^\w\s\-.]/g, '_').slice(0, 255);
}
