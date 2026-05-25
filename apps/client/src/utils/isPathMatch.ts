/**
 * 路由路径模式匹配
 * 支持 :param 和 [param] 两种动态段语法
 *
 * @example
 *   isPathMatch('/user/:id', '/user/42')      // true
 *   isPathMatch('/user/[id]', '/user/42')     // true
 *   isPathMatch('/user/:id', '/user/42/edit') // false (段数不一致)
 */
export function isPathMatch(pattern: string, path: string): boolean {
  if (!pattern || !path) return false;
  if (pattern === path) return true;

  const patternSegments = pattern.split('/').filter(Boolean);
  const pathSegments = path.split('/').filter(Boolean);

  if (patternSegments.length !== pathSegments.length) return false;

  return patternSegments.every((seg, i) => {
    if (seg.startsWith(':') || (seg.startsWith('[') && seg.endsWith(']'))) {
      return true;
    }
    return seg === pathSegments[i];
  });
}
