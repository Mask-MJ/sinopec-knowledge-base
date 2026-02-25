type TransformationTreeData = {
  [key: string]: any;
  id: number;
  order?: number;
  parentId: null | number;
};

export function transformationTree<T extends TransformationTreeData>(
  data: T[],
  parentId: null | number,
): (T & { children: T[] })[] {
  return data
    .filter((item) => item.parentId === parentId)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((item) => ({
      ...item,
      children: transformationTree(data, item.id),
    }));
}
