export type PageDto = {
  _id: string;
  title: string;
  parentId: string | null;
  order: number;
  projectId: string;
  isArchived?: boolean;
  children?: PageDto[]; // для дерева на фронте
};
