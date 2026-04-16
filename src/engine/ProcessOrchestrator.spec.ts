import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProcessOrchestrator, ProcessRequest } from "./ProcessOrchestrator";
import { IStorageAdapter } from "../ports/IStorageAdapter";
import { IWorkflowExecutor } from "../ports/IWorkflowExecutor";
import { ILogRepository } from "../ports/ILogRepository";

describe("ProcessOrchestrator", () => {
  let orchestrator: ProcessOrchestrator;
  let mockStorage: IStorageAdapter;
  let mockExecutor: IWorkflowExecutor;
  let mockLogs: ILogRepository;

  beforeEach(() => {
    mockStorage = {
      saveProcessState: vi.fn().mockResolvedValue(undefined),
      getResolvedDocument: vi.fn(),
      getS3Contents: vi.fn(),
      getOrganizationStructure: vi.fn(),
      getJsonldFromS3: vi.fn(),
      getBpmnFromS3: vi.fn(),
      getProcessDetails: vi.fn(),
      getProcessDemoLogs: vi.fn(),
    };
    mockExecutor = {
      executeStep: vi.fn(),
    };
    mockLogs = {
      initLog: vi.fn().mockResolvedValue(undefined),
      updateLog: vi.fn().mockResolvedValue(undefined),
      finalizeLog: vi.fn().mockResolvedValue(undefined),
    };

    orchestrator = new ProcessOrchestrator(mockStorage, mockExecutor, mockLogs);
  });

  it("should execute a multi-step workflow successfully", async () => {
    (mockExecutor.executeStep as any)
      .mockResolvedValueOnce({
        processCompleted: false,
        next_step_id: "Step_2",
        process_variables: { var1: "val1" },
      })
      .mockResolvedValueOnce({
        processCompleted: true,
        next_step_id: "Event_End",
        process_variables: { var2: "val2" },
      });

    const request: ProcessRequest = {
      action: "start",
      process_id: "proc-1",
      process_variables: { initial: "true" },
      owner: "user-1",
      project_id: "proj-1",
    };

    const result = await orchestrator.handleProcessExecution(request);

    expect(result.message).toBe("Process completed successfully");
    expect(result.processInstanceId).toContain("proc-1-");

    expect(mockExecutor.executeStep).toHaveBeenCalledTimes(2);
    expect(mockStorage.saveProcessState).toHaveBeenCalledTimes(2);
    expect(mockLogs.updateLog).toHaveBeenCalledTimes(2);
  });

  it("should throw error and update log on step execution failure", async () => {
    (mockExecutor.executeStep as any).mockRejectedValue(
      new Error("Executor failed"),
    );

    const request: ProcessRequest = {
      action: "start",
      process_id: "proc-1",
      process_variables: {},
      owner: "user-1",
      project_id: "proj-1",
    };

    await expect(orchestrator.handleProcessExecution(request)).rejects.toThrow(
      "Failed to execute workflow step",
    );

    expect(mockLogs.updateLog).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ status: "error" }),
    );
  });
});
