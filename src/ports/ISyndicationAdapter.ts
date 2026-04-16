export interface SyndicationResult {
  platform: string;
  status: "success" | "error";
  url?: string;
  error?: string;
}

export interface ISyndicationAdapter {
  postToTwitter(content: any): Promise<SyndicationResult>;
  postToLinkedIn(content: any): Promise<SyndicationResult>;
  postToReddit(content: any): Promise<SyndicationResult>;
}
