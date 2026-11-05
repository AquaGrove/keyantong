export const POST_KINDS = {
  daily: "科研日常",
  question: "瓶颈求助",
  experience: "经验分享",
  literature: "文献求助",
  collaboration: "分析协作",
} as const;
export type PostKind = keyof typeof POST_KINDS;
type Response = {
  id: string;
  authorId: string;
  authorLabel: string;
  body: string;
  url: string | null;
  createdAt: string;
};
export type Post = {
  id: string;
  kind: PostKind;
  title: string;
  body: string;
  doi: string;
  topic: string;
  authorId: string;
  authorLabel: string;
  createdAt: string;
  responses: Response[];
  acceptedResponseId: string | null;
};
export type PublicResponse = Omit<Response, "authorId">;
export type PublicPost = Omit<Post, "authorId" | "responses"> & {
  responses: PublicResponse[];
  responseCount: number;
  isOwner: boolean;
};
