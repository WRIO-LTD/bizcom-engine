import { ProcessState } from "./types";

export interface IStorageAdapter {
  saveProcessState(
    processInstanceId: string,
    state: ProcessState,
  ): Promise<void>;
  getResolvedDocument(key: string): Promise<any>;
  getS3Contents(prefix: string): Promise<string[]>;
  getOrganizationStructure(owner: string): Promise<string[]>;
  getJsonldFromS3(key: string): Promise<any>;
  getBpmnFromS3(owner: string, process_name: string): Promise<string>;
  getProcessDetails(owner: string, process_id: string): Promise<any>;
  getProcessDemoLogs(owner: string, process_id: string): Promise<any[]>;
}
