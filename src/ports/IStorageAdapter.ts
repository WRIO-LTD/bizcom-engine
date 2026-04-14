import { ProcessState } from "./types";

export interface IStorageAdapter {
  saveProcessState(processInstanceId: string, state: ProcessState): Promise<void>;
  getResolvedDocument(key: string): Promise<any>;
  getS3Contents(prefix: string): Promise<string[]>;
}
