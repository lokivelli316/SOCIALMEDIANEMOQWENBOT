export const PLATFORMS = ["facebook", "tiktok", "youtube", "reddit", "x"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const CREATOR_TYPES = [
  "musician",
  "podcaster",
  "video_creator",
  "visual_artist",
  "streamer",
  "educator",
  "writer",
  "comedian",
  "maker_engineer",
  "business_brand",
  "nonprofit_advocacy",
  "custom"
] as const;
export type CreatorType = (typeof CREATOR_TYPES)[number];

export type ApprovalMode = "required" | "draft" | "auto";
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface PlatformProfile {
  enabled: boolean;
  approval: ApprovalMode;
  credentials: Record<string, string>;
  defaults?: Record<string, JsonValue>;
}

export interface CreatorProfile {
  id: string;
  displayName: string;
  primaryType: CreatorType;
  secondaryTypes?: CreatorType[];
  voice?: string[];
  contentPillars?: string[];
  platforms: Partial<Record<Platform, PlatformProfile>>;
}

export interface Asset {
  id: string;
  kind: "video" | "image" | "audio" | "document" | "other";
  path?: string;
  url?: string;
  mimeType?: string;
  alt?: string;
  platforms?: Platform[];
}

export interface ReleaseManifest {
  id: string;
  contentType: string;
  title: string;
  text?: string;
  description?: string;
  url?: string;
  tags?: string[];
  assets?: Asset[];
  targets?: Partial<Record<Platform, Record<string, JsonValue>>>;
}

export interface PublishPlan {
  platform: Platform;
  creatorId: string;
  releaseId: string;
  summary: string;
  requiresApproval: boolean;
  warnings: string[];
}

export interface AssetEvidence {
  id: string;
  relativePath: string;
  size: number;
  sha256: string;
}

export interface PublishResult {
  platform: Platform;
  status: "published" | "submitted" | "verifying" | "hold" | "failed" | "planned";
  externalId?: string;
  url?: string;
  detail?: string;
  assetEvidence?: AssetEvidence[];
  raw?: JsonValue;
}

export interface ChannelSnapshot {
  platform: Platform;
  externalId: string;
  metrics: Record<string, JsonValue>;
  raw?: JsonValue;
}

export type ReceiptResult = PublishResult | ChannelSnapshot;

export interface Receipt {
  at: string;
  creatorId: string;
  releaseId?: string;
  externalId?: string;
  platform: Platform;
  action: "plan" | "publish" | "inspect";
  operationKey?: string;
  attemptId?: string;
  phase?: "intent" | "final";
  result: ReceiptResult;
  previousReceiptHash?: string | null;
  receiptHash?: string;
}
