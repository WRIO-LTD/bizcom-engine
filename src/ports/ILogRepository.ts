import { LogMeta, LogPatch } from "./types";

export interface ILogRepository {
  initLog(instance_id: string, meta: LogMeta): Promise<void>;
  updateLog(instance_id: string, patch: LogPatch & Partial<LogMeta>): Promise<void>;
  finalizeLog(instance_id: string, patch: LogPatch & Partial<LogMeta> & { status: string; outputs?: Record<string, any> }): Promise<void>;
}
