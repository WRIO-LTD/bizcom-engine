export interface ProcessState {
  processCompleted: boolean;
  next_step_id: string;
  process_variables: Record<string, any>;
}

export interface StepResult {
  processCompleted: boolean;
  next_step_id: string;
  process_variables: Record<string, any>;
}

export interface LogMeta {
  initiator: string;
  owner: string;
  project_id: string;
  process_id: string;
  process_variables?: Record<string, any>;
  current_step_id?: string;
}

export interface LogPatch {
  status?: string;
  current_step_id: string;
  process_variables: Record<string, any>;
  step_status?: string;
}
