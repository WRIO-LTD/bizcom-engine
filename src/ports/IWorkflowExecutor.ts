import { StepResult } from "./types";

export interface IWorkflowExecutor {
  executeStep(stepId: string, process_variables: Record<string, any>): Promise<StepResult>;
}
