import { IStorageAdapter } from "../ports/IStorageAdapter";
import { LogMeta, LogPatch } from "../ports/types";

export class LogLifecycle {
  constructor(private storage: IStorageAdapter) {}

  async initLog(instance_id: string, meta: LogMeta): Promise<void> {
    const initial_log = {
      instance_id,
      owner: meta.owner,
      initiator: meta.initiator,
      process_id: meta.process_id,
      project_id: meta.project_id,
      status: "running",
      current_step_id: meta.current_step_id || "start",
      global_variables: meta.process_variables || {},
      steps: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const log_path = this.buildLogPath(meta.initiator, meta.project_id, meta.process_id, "in_progress", instance_id);
    await this.storage.saveProcessState(log_path, initial_log as any);
  }

  async updateLog(instance_id: string, meta: LogMeta & LogPatch): Promise<void> {
    const log_path = this.buildLogPath(meta.initiator, meta.project_id, meta.process_id, "in_progress", instance_id);
    const log = await this.storage.getResolvedDocument(log_path);
    
    if (!log) throw new Error(`Log not found: ${instance_id}`);

    log.status = meta.status || log.status;
    log.current_step_id = meta.current_step_id;
    log.global_variables = { ...log.global_variables, ...meta.process_variables };
    log.updated_at = new Date().toISOString();

    if (!log.steps) log.steps = [];
    const stepIndex = log.steps.findIndex((s: any) => s.id === meta.current_step_id);
    if (stepIndex > -1) {
      if (meta.step_status) log.steps[stepIndex].status = meta.step_status;
      log.steps[stepIndex].timestamp = new Date().toISOString();
    } else {
      log.steps.push({
        id: meta.current_step_id,
        status: meta.step_status || "in_progress",
        timestamp: new Date().toISOString(),
        input: meta.process_variables
      });
    }

    await this.storage.saveProcessState(log_path, log);
  }

  private buildLogPath(owner: string, project_id: string, process_id: string, status: string, instance_id: string): string {
    return `${owner}/projects/${project_id}/processes/${process_id}/logs/${status}/${instance_id}.json`;
  }
}
