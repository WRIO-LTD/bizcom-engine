import { ILogRepository } from "../ports/ILogRepository";
import { IStorageAdapter } from "../ports/IStorageAdapter";
import { LogMeta, LogPatch } from "../ports/types";

export class LogLifecycle implements ILogRepository {
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
      updated_at: new Date().toISOString(),
    };

    const log_path = this.buildLogPath(
      meta.initiator,
      meta.project_id,
      meta.process_id,
      "in_progress",
      instance_id,
    );
    await this.storage.saveProcessState(log_path, initial_log as any);
  }

  async updateLog(
    instance_id: string,
    patch: LogPatch & Partial<LogMeta>,
  ): Promise<void> {
    const owner = patch.initiator || patch.owner;
    if (!owner || !patch.project_id || !patch.process_id) {
      throw new Error("Missing log metadata for update");
    }

    const log_path = this.buildLogPath(
      owner,
      patch.project_id,
      patch.process_id,
      "in_progress",
      instance_id,
    );
    const log = await this.storage.getResolvedDocument(log_path);

    if (!log) throw new Error(`Log not found: ${instance_id}`);

    log.status = patch.status || log.status;
    log.current_step_id = patch.current_step_id;
    log.global_variables = {
      ...log.global_variables,
      ...patch.process_variables,
    };
    log.updated_at = new Date().toISOString();

    if (!log.steps) log.steps = [];
    const stepIndex = log.steps.findIndex(
      (s: any) => s.id === patch.current_step_id,
    );
    if (stepIndex > -1) {
      if (patch.step_status) log.steps[stepIndex].status = patch.step_status;
      log.steps[stepIndex].timestamp = new Date().toISOString();
    } else {
      log.steps.push({
        id: patch.current_step_id,
        status: patch.step_status || "in_progress",
        timestamp: new Date().toISOString(),
        input: patch.process_variables,
      });
    }

    await this.storage.saveProcessState(log_path, log);
  }

  async finalizeLog(
    instance_id: string,
    patch: LogPatch &
      Partial<LogMeta> & {
        status: string;
        outputs?: Record<string, any>;
      },
  ): Promise<void> {
    const owner = patch.initiator || patch.owner;
    if (!owner || !patch.project_id || !patch.process_id) {
      throw new Error("Missing log metadata for finalize");
    }

    const log_path = this.buildLogPath(
      owner,
      patch.project_id,
      patch.process_id,
      "in_progress",
      instance_id,
    );
    const log = await this.storage.getResolvedDocument(log_path);
    if (!log) throw new Error(`Log not found: ${instance_id}`);

    log.status = patch.status;
    log.updated_at = new Date().toISOString();
    log.outputs = patch.outputs || {};

    await this.storage.saveProcessState(log_path, log);
  }

  private buildLogPath(
    owner: string,
    project_id: string,
    process_id: string,
    status: string,
    instance_id: string,
  ): string {
    return `${owner}/projects/${project_id}/processes/${process_id}/logs/${status}/${instance_id}.json`;
  }
}
