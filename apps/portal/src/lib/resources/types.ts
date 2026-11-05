export type ResourceKind = "genome" | "tool";
export type ResourceContent = {
  name: string;
  summary: string;
  category: string;
  species: string;
  latinName: string;
  icon: string;
  provider: string;
  inputs: string;
  outputs: string;
  instructions: string;
  access: string;
  license: string;
  assembly: string;
  availability?: string;
  sourceUrl: string;
};
export type ResearchResource = {
  id: string;
  kind: ResourceKind;
  url: string;
  content: ResourceContent;
  status: "pending" | "published" | "rejected" | "withdrawn";
  version: number;
  review_note?: string;
  created_at?: string;
};
