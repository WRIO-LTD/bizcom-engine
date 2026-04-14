import { IStorageAdapter } from "../ports/IStorageAdapter";
import { IWorkflowExecutor } from "../ports/IWorkflowExecutor";
import { ILogRepository } from "../ports/ILogRepository";
import { ProcessState, StepResult } from "../ports/types";

export interface ProcessRequest {
  action: string;
  process_id: string;
  process_variables: Record<string, any>;
  owner: string;
  project_id: string;
}

export class ProcessOrchestrator {
  constructor(
    private storage: IStorageAdapter,
    private executor: IWorkflowExecutor,
    private logs: ILogRepository
  ) {}

  async handleProcessExecution(
    requestData: ProcessRequest,
  ): Promise<{ message?: string; processInstanceId?: string; error?: string }> {
    const {
      process_id,
      process_variables: initialVariables,
      owner,
      project_id,
    } = requestData;
    const processInstanceId = `${process_id}-${Date.now()}`;
    const logId = processInstanceId;
    let current_step_id = "Event_Start";
    let processCompleted = false;
    let currentVariables = { ...initialVariables };

    try {
      while (!processCompleted) {
        try {
          const result: StepResult = await this.executor.executeStep(
            current_step_id,
            currentVariables,
          );
          
          await Promise.all([
            this.storage.saveProcessState(processInstanceId, result),
            this.logs.updateLog(logId, {
              current_step_id,
              process_variables: result.process_variables,
              status: "in_progress",
              owner,
              project_id,
              process_id
            }),
          ]);

          if (result.processCompleted) {
            processCompleted = true;
          } else {
            current_step_id = result.next_step_id;
            currentVariables = {
              ...currentVariables,
              ...result.process_variables,
            };
          }
        } catch (error: unknown) {
          console.error(`Error executing step ${current_step_id}:`, error);
          await this.logs.updateLog(logId, {
            current_step_id,
            process_variables: { error: "Failed to execute workflow step" },
            status: "error",
            owner,
            project_id,
            process_id
          });
          throw new Error("Failed to execute workflow step");
        }
      }

      return { message: "Process completed successfully", processInstanceId };
    } catch (error: unknown) {
      console.error("Error handling process execution:", error);
      throw error;
    }
  }
}
