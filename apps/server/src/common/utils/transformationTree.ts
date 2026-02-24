type TransformationTreeData = {
  [key: string]: any;
  id: number;
  parentId: null | number;
};

export function transformationTree<T extends TransformationTreeData>(
  data: T[],
  parentId: null | number,
): (T & { children: T[] })[] {
  return data
    .filter((dept) => dept.parentId === parentId)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((dept) => ({
      ...dept,
      children: transformationTree(data, dept.id),
    }));
}
