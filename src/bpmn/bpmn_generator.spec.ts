import { describe, it, expect } from "vitest";
import { generateBpmnXml, BpmnProcess } from "./bpmn_generator";

describe("bpmn_generator", () => {
  it("should generate a simple BPMN XML", () => {
    const process: BpmnProcess = {
      "@id": "SimpleProcess",
      name: "Simple Process",
      steps: [
        {
          "@id": "StartEvent_1",
          name: "Start",
          step_type: "start",
          transitions: [{ target_id: "Task_1", type: "sequence" }],
        },
        {
          "@id": "Task_1",
          name: "Do something",
          step_type: "service",
          transitions: [{ target_id: "EndEvent_1", type: "sequence" }],
        },
        {
          "@id": "EndEvent_1",
          name: "End",
          step_type: "end",
        },
      ],
    };

    const xml = generateBpmnXml(process);
    expect(xml).toContain('id="SimpleProcess"');
    expect(xml).toContain('name="Simple Process"');
    expect(xml).toContain('<bpmn:startEvent id="StartEvent_1" name="Start">');
    expect(xml).toContain('<bpmn:serviceTask id="Task_1" name="Do something">');
    expect(xml).toContain('<bpmn:endEvent id="EndEvent_1" name="End">');
    expect(xml).toContain('sourceRef="StartEvent_1" targetRef="Task_1"');
    expect(xml).toContain('sourceRef="Task_1" targetRef="EndEvent_1"');
  });

  it("should handle lanes", () => {
    const process: BpmnProcess = {
      "@id": "LaneProcess",
      name: "Lane Process",
      lanes: [
        {
          "@id": "Lane_1",
          name: "User Lane",
          steps: ["StartEvent_1", "UserTask_1"],
        },
        {
          "@id": "Lane_2",
          name: "System Lane",
          steps: ["ServiceTask_1", "EndEvent_1"],
        },
      ],
      steps: [
        {
          "@id": "StartEvent_1",
          name: "Start",
          step_type: "start",
          lane: "Lane_1",
          transitions: [{ target_id: "UserTask_1", type: "sequence" }],
        },
        {
          "@id": "UserTask_1",
          name: "User Action",
          step_type: "user",
          lane: "Lane_1",
          transitions: [{ target_id: "ServiceTask_1", type: "sequence" }],
        },
        {
          "@id": "ServiceTask_1",
          name: "System Action",
          step_type: "service",
          lane: "Lane_2",
          transitions: [{ target_id: "EndEvent_1", type: "sequence" }],
        },
        {
          "@id": "EndEvent_1",
          name: "End",
          step_type: "end",
          lane: "Lane_2",
        },
      ],
    };

    const xml = generateBpmnXml(process);
    expect(xml).toContain('<bpmn:laneSet id="LaneSet_1">');
    expect(xml).toContain('<bpmn:lane id="Lane_1" name="User Lane">');
    expect(xml).toContain("<bpmn:flowNodeRef>StartEvent_1</bpmn:flowNodeRef>");
    expect(xml).toContain("<bpmn:flowNodeRef>UserTask_1</bpmn:flowNodeRef>");
    expect(xml).toContain('<bpmn:lane id="Lane_2" name="System Lane">');
    expect(xml).toContain("<bpmn:flowNodeRef>ServiceTask_1</bpmn:flowNodeRef>");
    expect(xml).toContain("<bpmn:flowNodeRef>EndEvent_1</bpmn:flowNodeRef>");
  });

  it("should handle different step types", () => {
    const process: BpmnProcess = {
      "@id": "TypesProcess",
      name: "Types Process",
      steps: [
        { "@id": "S", name: "Start", step_type: "start" },
        { "@id": "M", name: "Manual", step_type: "manual" },
        { "@id": "F", name: "Form", step_type: "form" },
        { "@id": "U", name: "User", step_type: "user" },
        { "@id": "E", name: "End", step_type: "end" },
      ],
    };

    const xml = generateBpmnXml(process);
    expect(xml).toContain('<bpmn:startEvent id="S"');
    expect(xml).toContain('<bpmn:manualTask id="M"');
    expect(xml).toContain('<bpmn:userTask id="F"'); // Form maps to userTask
    expect(xml).toContain('<bpmn:userTask id="U"');
    expect(xml).toContain('<bpmn:endEvent id="E"');
  });

  it("should use manual coordinates if provided", () => {
    const process: BpmnProcess = {
      "@id": "CoordProcess",
      name: "Coord Process",
      steps: [
        {
          "@id": "S",
          name: "Start",
          step_type: "start",
          x: 10,
          y: 20,
        },
      ],
    };

    const xml = generateBpmnXml(process);
    expect(xml).toContain('<dc:Bounds x="10" y="20" width="36" height="36" />');
  });

  it("should handle branching in layout", () => {
    const process: BpmnProcess = {
      "@id": "BranchProcess",
      name: "Branch Process",
      steps: [
        {
          "@id": "S",
          name: "Start",
          step_type: "start",
          transitions: [
            { target_id: "B1", type: "s" },
            { target_id: "B2", type: "s" },
          ],
        },
        { "@id": "B1", name: "Branch 1", step_type: "service" },
        { "@id": "B2", name: "Branch 2", step_type: "service" },
      ],
    };
    const xml = generateBpmnXml(process);
    expect(xml).toContain('id="Shape_B1"');
    expect(xml).toContain('id="Shape_B2"');
  });

  it("should use fallback linear layout if no start step", () => {
    const process: BpmnProcess = {
      "@id": "NoStart",
      name: "No Start",
      steps: [
        { "@id": "T1", name: "Task 1", step_type: "service" },
        { "@id": "T2", name: "Task 2", step_type: "service" },
      ],
    };

    const xml = generateBpmnXml(process);
    expect(xml).toContain('id="Shape_T1"');
    expect(xml).toContain('id="Shape_T2"');
    expect(xml).toContain('x="150" y="100"');
    expect(xml).toContain('x="300" y="100"');
  });
});
