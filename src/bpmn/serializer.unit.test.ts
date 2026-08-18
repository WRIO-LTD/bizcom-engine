import { describe, it, expect } from "vitest";
import { serializeBpmn } from "./serializer";
import type { ProcessDefinition } from "../model/types";

const simpleDef: ProcessDefinition = {
  "@context": "https://wr.io/workflow",
  "@type": "Process",
  "@id": "simple-process",
  name: "Simple Process",
  version: "1.0.0",
  entry_point_id: "StartEvent_1",
  steps: [
    {
      "@type": "Step",
      "@id": "StartEvent_1",
      name: "Start",
      step_type: "start",
      transitions: [{ target_id: "Task_1" }],
    },
    {
      "@type": "Step",
      "@id": "Task_1",
      name: "Do something",
      step_type: "service",
      action: "http.request",
      params: { url: "https://api.example.com", method: "POST" },
      transitions: [{ target_id: "EndEvent_1" }],
    },
    {
      "@type": "Step",
      "@id": "EndEvent_1",
      name: "End",
      step_type: "end",
    },
  ],
};

describe("BpmnSerializer", () => {
  it("should generate valid BPMN XML for a simple process", () => {
    const xml = serializeBpmn(simpleDef);

    expect(xml).toContain('id="simple-process"');
    expect(xml).toContain('name="Simple Process"');
    expect(xml).toContain('<bpmn:startEvent id="StartEvent_1"');
    expect(xml).toContain('<bpmn:serviceTask id="Task_1"');
    expect(xml).toContain('<bpmn:endEvent id="EndEvent_1"');
    expect(xml).toContain('sourceRef="StartEvent_1" targetRef="Task_1"');
    expect(xml).toContain('sourceRef="Task_1" targetRef="EndEvent_1"');
  });

  it("should include wrio extension elements", () => {
    const xml = serializeBpmn(simpleDef);
    expect(xml).toContain("<wrio:node");
    expect(xml).toContain('category="http"');
    expect(xml).toContain('action="request"');
    expect(xml).toContain('name="url">https://api.example.com</wrio:param>');
  });

  it("should generate implicit start and end events if missing", () => {
    const defNoStartEnd: ProcessDefinition = {
      "@context": "https://wr.io/workflow",
      "@type": "Process",
      "@id": "no-start-end",
      name: "No Start End",
      version: "1.0.0",
      entry_point_id: "Task_A",
      steps: [
        {
          "@type": "Step",
          "@id": "Task_A",
          name: "Task A",
          step_type: "service",
          transitions: [{ target_id: "Task_B" }],
        },
        {
          "@type": "Step",
          "@id": "Task_B",
          name: "Task B",
          step_type: "service",
        },
      ],
    };

    const xml = serializeBpmn(defNoStartEnd);
    expect(xml).toContain('<bpmn:startEvent id="StartEvent_1" name="Start">');
    expect(xml).toContain('<bpmn:endEvent id="EndEvent_1" name="End">');
  });

  it("should generate exclusive gateway with conditions", () => {
    const def: ProcessDefinition = {
      "@context": "https://wr.io/workflow",
      "@type": "Process",
      "@id": "gateway-test",
      name: "Gateway Test",
      version: "1.0.0",
      entry_point_id: "Start",
      steps: [
        {
          "@type": "Step",
          "@id": "Start",
          name: "Start",
          step_type: "start",
          transitions: [{ target_id: "GW" }],
        },
        {
          "@type": "Step",
          "@id": "GW",
          name: "Decision",
          step_type: "gateway",
          gateway_type: "exclusive",
          transitions: [
            { target_id: "High", condition: "vars.amount > 100" },
            { target_id: "Low" },
          ],
        },
        {
          "@type": "Step",
          "@id": "High",
          name: "High Value",
          step_type: "service",
          transitions: [{ target_id: "End" }],
        },
        {
          "@type": "Step",
          "@id": "Low",
          name: "Low Value",
          step_type: "service",
          transitions: [{ target_id: "End" }],
        },
        {
          "@type": "Step",
          "@id": "End",
          name: "End",
          step_type: "end",
        },
      ],
    };

    const xml = serializeBpmn(def);
    expect(xml).toContain('<bpmn:exclusiveGateway id="GW"');
    expect(xml).toContain("<bpmn:conditionExpression>vars.amount");
  });

  it("should generate inclusive gateway", () => {
    const def: ProcessDefinition = {
      "@context": "https://wr.io/workflow",
      "@type": "Process",
      "@id": "inclusive-test",
      name: "Inclusive",
      version: "1.0.0",
      entry_point_id: "GW",
      steps: [
        {
          "@type": "Step",
          "@id": "GW",
          name: "Split",
          step_type: "gateway",
          gateway_type: "inclusive",
          transitions: [
            { target_id: "A", condition: "vars.x > 0" },
            { target_id: "B" },
          ],
        },
        { "@type": "Step", "@id": "A", name: "A", step_type: "service" },
        { "@type": "Step", "@id": "B", name: "B", step_type: "service" },
      ],
    };

    const xml = serializeBpmn(def);
    expect(xml).toContain('<bpmn:inclusiveGateway id="GW"');
  });

  it("should generate parallel gateway (fork and join)", () => {
    const def: ProcessDefinition = {
      "@context": "https://wr.io/workflow",
      "@type": "Process",
      "@id": "parallel-test",
      name: "Parallel",
      version: "1.0.0",
      entry_point_id: "Start",
      steps: [
        {
          "@type": "Step",
          "@id": "Start",
          name: "Start",
          step_type: "start",
          transitions: [{ target_id: "Fork" }],
        },
        {
          "@type": "Step",
          "@id": "Fork",
          name: "Fork",
          step_type: "gateway",
          gateway_type: "parallel_fork",
          transitions: [{ target_id: "A" }, { target_id: "B" }],
        },
        {
          "@type": "Step",
          "@id": "A",
          name: "A",
          step_type: "service",
          transitions: [{ target_id: "Join" }],
        },
        {
          "@type": "Step",
          "@id": "B",
          name: "B",
          step_type: "service",
          transitions: [{ target_id: "Join" }],
        },
        {
          "@type": "Step",
          "@id": "Join",
          name: "Join",
          step_type: "gateway",
          gateway_type: "parallel_join",
          transitions: [{ target_id: "End" }],
        },
        {
          "@type": "Step",
          "@id": "End",
          name: "End",
          step_type: "end",
        },
      ],
    };

    const xml = serializeBpmn(def);
    expect(xml).toContain('<bpmn:parallelGateway id="Fork"');
    expect(xml).toContain('<bpmn:parallelGateway id="Join"');
  });

  it("should generate boundary error event for on_error transitions", () => {
    const def: ProcessDefinition = {
      "@context": "https://wr.io/workflow",
      "@type": "Process",
      "@id": "error-test",
      name: "Error Test",
      version: "1.0.0",
      entry_point_id: "Start",
      steps: [
        {
          "@type": "Step",
          "@id": "Start",
          name: "Start",
          step_type: "start",
          transitions: [{ target_id: "Risky" }],
        },
        {
          "@type": "Step",
          "@id": "Risky",
          name: "Risky Task",
          step_type: "service",
          transitions: [
            { target_id: "Ok" },
            { target_id: "Handler", on_error: true },
          ],
        },
        {
          "@type": "Step",
          "@id": "Ok",
          name: "Success",
          step_type: "end",
        },
        {
          "@type": "Step",
          "@id": "Handler",
          name: "Error Handler",
          step_type: "service",
        },
      ],
    };

    const xml = serializeBpmn(def);
    expect(xml).toContain('<bpmn:boundaryEvent id="ErrorEvent_Risky"');
    expect(xml).toContain('<bpmn:errorEventDefinition />');
    expect(xml).toContain('attachedToRef="Risky"');
  });

  it("should generate CallActivity", () => {
    const def: ProcessDefinition = {
      "@context": "https://wr.io/workflow",
      "@type": "Process",
      "@id": "caller-test",
      name: "Caller",
      version: "1.0.0",
      entry_point_id: "Start",
      steps: [
        {
          "@type": "Step",
          "@id": "Start",
          name: "Start",
          step_type: "start",
          transitions: [{ target_id: "Call" }],
        },
        {
          "@type": "Step",
          "@id": "Call",
          name: "Call Subprocess",
          step_type: "call_activity",
          called_definition: "audit_sub",
          transitions: [{ target_id: "End" }],
        },
        {
          "@type": "Step",
          "@id": "End",
          name: "End",
          step_type: "end",
        },
      ],
    };

    const xml = serializeBpmn(def);
    expect(xml).toContain('<bpmn:callActivity id="Call"');
    expect(xml).toContain('calledElement="audit_sub"');
  });

  it("should sanitize IDs for XML NCName compliance", () => {
    const def: ProcessDefinition = {
      "@context": "https://wr.io/workflow",
      "@type": "Process",
      "@id": "org/project/process-id",
      name: "Test",
      version: "1.0.0",
      entry_point_id: "step/with-slash",
      steps: [
        {
          "@type": "Step",
          "@id": "step/with-slash",
          name: "Has Slash",
          step_type: "service",
          transitions: [{ target_id: "end/step" }],
        },
        {
          "@type": "Step",
          "@id": "end/step",
          name: "End",
          step_type: "end",
        },
      ],
    };

    const xml = serializeBpmn(def);
    expect(xml).toContain('id="step_with-slash"');
    expect(xml).toContain('targetRef="end_step"');
    expect(xml).not.toContain('id="step/');
    expect(xml).not.toContain('targetRef="end/');
  });

  it("should generate DI diagram information", () => {
    const xml = serializeBpmn(simpleDef);

    expect(xml).toContain("<bpmndi:BPMNDiagram");
    expect(xml).toContain("<bpmndi:BPMNPlane");
    expect(xml).toContain('id="Shape_StartEvent_1"');
    expect(xml).toContain('id="Shape_Task_1"');
    expect(xml).toContain('id="Shape_EndEvent_1"');
    expect(xml).toContain("<bpmndi:BPMNEdge");
    expect(xml).toContain("<di:waypoint");
  });

  it("should generate valid XML for empty process (start→end)", () => {
    const def: ProcessDefinition = {
      "@context": "https://wr.io/workflow",
      "@type": "Process",
      "@id": "empty",
      name: "Empty",
      version: "1.0.0",
      entry_point_id: "Start",
      steps: [],
    };

    const xml = serializeBpmn(def);
    expect(xml).toContain('<bpmn:startEvent id="StartEvent_1"');
    expect(xml).toContain('<bpmn:endEvent id="EndEvent_1"');
  });

  it("implicit start: flow ID matches DI edge bpmnElement", () => {
    const def: ProcessDefinition = {
      "@context": "https://wr.io/workflow",
      "@type": "Process",
      "@id": "implicit-start-id",
      name: "Implicit Start",
      version: "1.0.0",
      entry_point_id: "Task_A",
      steps: [
        {
          "@type": "Step",
          "@id": "Task_A",
          name: "Task A",
          step_type: "service",
          transitions: [{ target_id: "EndEvent_1" }],
        },
        { "@type": "Step", "@id": "EndEvent_1", name: "End", step_type: "end" },
      ],
    };

    const xml = serializeBpmn(def);
    // Flow element and DI edge must share the same id to link in bpmn-js
    expect(xml).toContain(
      '<bpmn:sequenceFlow id="Flow_StartEvent_1_to_Task_A"',
    );
    expect(xml).toContain('bpmnElement="Flow_StartEvent_1_to_Task_A"');
  });

  it("condition is NOT rendered as sequence flow name (only in conditionExpression)", () => {
    const def: ProcessDefinition = {
      "@context": "https://wr.io/workflow",
      "@type": "Process",
      "@id": "cond-no-label",
      name: "Cond No Label",
      version: "1.0.0",
      entry_point_id: "GW",
      steps: [
        {
          "@type": "Step",
          "@id": "GW",
          name: "Decision",
          step_type: "gateway",
          gateway_type: "exclusive",
          transitions: [
            { target_id: "High", condition: "vars.amount > 100" },
            { target_id: "Low" },
          ],
        },
        { "@type": "Step", "@id": "High", name: "High", step_type: "end" },
        { "@type": "Step", "@id": "Low", name: "Low", step_type: "end" },
      ],
    };

    const xml = serializeBpmn(def);
    // conditionExpression present
    expect(xml).toContain(
      "<bpmn:conditionExpression>vars.amount &gt; 100</bpmn:conditionExpression>",
    );
    // condition must NOT leak into name attr (would render as ugly flow label)
    expect(xml).not.toContain('name="vars.amount > 100"');
    expect(xml).not.toContain('name="vars.amount &gt; 100"');
  });
});
