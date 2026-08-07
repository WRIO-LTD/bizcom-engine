export interface ProcessState {
  processCompleted: boolean;
  next_step_id: string;
  process_variables: Record<string, any>;
}
