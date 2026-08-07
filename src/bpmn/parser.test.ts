import { describe, it, expect } from "vitest";
import { parseBpmn } from "./parser";

const simpleBpmn = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:wrio="http://wrio.io/schema/bpmn/wrio" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="SimpleProcess" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:serviceTask id="ServiceTask_1" name="Send Email">
      <bpmn:extensionElements>
        <wrio:node category="http" action="request">
            <wrio:param name="url">https://api.example.com</wrio:param>
            <wrio:param name="method">POST</wrio:param>
        </wrio:node>
      </bpmn:extensionElements>
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:serviceTask>
    <bpmn:endEvent id="EndEvent_1">
      <bpmn:incoming>Flow_2</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="ServiceTask_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="ServiceTask_1" targetRef="EndEvent_1" />
  </bpmn:process>
</bpmn:definitions>`;

describe("BpmnParser", () => {
  it("should parse simple BPMN to ProcessDefinition", async () => {
    const def = await parseBpmn(simpleBpmn);

    expect(def["@type"]).toBe("Process");
    expect(def["@id"]).toBe("SimpleProcess");
    expect(def.steps).toHaveLength(3);

    const startStep = def.steps.find((s) => s.step_type === "start")!;
    const serviceStep = def.steps.find((s) => s.step_type === "service")!;
    const endStep = def.steps.find((s) => s.step_type === "end")!;

    expect(startStep).toBeDefined();
    expect(serviceStep).toBeDefined();
    expect(endStep).toBeDefined();

    expect(serviceStep.action).toBe("http.request");
    expect(serviceStep.params).toEqual({
      url: "https://api.example.com",
      method: "POST",
    });
    expect(serviceStep.transitions).toHaveLength(1);
    expect(serviceStep.transitions![0].target_id).toBe("EndEvent_1");
  });

  it("should set entry_point_id to start event", async () => {
    const def = await parseBpmn(simpleBpmn);
    expect(def.entry_point_id).toBe("StartEvent_1");
  });

  it("should parse ExclusiveGateway with conditions", async () => {
    const gatewayBpmn = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Def_Gateway" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="GatewayProcess">
    <bpmn:startEvent id="Start">
      <bpmn:outgoing>Flow_S</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:exclusiveGateway id="Gateway_1" name="Decision">
      <bpmn:incoming>Flow_S</bpmn:incoming>
      <bpmn:outgoing>Flow_Yes</bpmn:outgoing>
      <bpmn:outgoing>Flow_No</bpmn:outgoing>
    </bpmn:exclusiveGateway>
    <bpmn:task id="Task_Yes" name="Yes Path">
      <bpmn:incoming>Flow_Yes</bpmn:incoming>
    </bpmn:task>
    <bpmn:task id="Task_No" name="No Path">
      <bpmn:incoming>Flow_No</bpmn:incoming>
    </bpmn:task>
    <bpmn:sequenceFlow id="Flow_S" sourceRef="Start" targetRef="Gateway_1" />
    <bpmn:sequenceFlow id="Flow_Yes" sourceRef="Gateway_1" targetRef="Task_Yes">
      <bpmn:conditionExpression>vars.amount > 100</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="Flow_No" sourceRef="Gateway_1" targetRef="Task_No" />
  </bpmn:process>
</bpmn:definitions>`;

    const def = await parseBpmn(gatewayBpmn);
    const gatewayStep = def.steps.find(
      (s) => s.step_type === "gateway",
    )!;

    expect(gatewayStep).toBeDefined();
    expect(gatewayStep.gateway_type).toBe("exclusive");
    expect(gatewayStep.transitions).toHaveLength(2);
    expect(gatewayStep.transitions![0].condition).toBe("vars.amount > 100");
    expect(gatewayStep.transitions![0].target_id).toBe("Task_Yes");
    expect(gatewayStep.transitions![1].condition).toBeUndefined();
    expect(gatewayStep.transitions![1].target_id).toBe("Task_No");
  });

  it("should parse InclusiveGateway", async () => {
    const bpmn = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Def" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="InclusiveProcess">
    <bpmn:inclusiveGateway id="GW_1" name="Split">
      <bpmn:outgoing>F1</bpmn:outgoing>
      <bpmn:outgoing>F2</bpmn:outgoing>
    </bpmn:inclusiveGateway>
    <bpmn:sequenceFlow id="F1" sourceRef="GW_1" targetRef="T1">
      <bpmn:conditionExpression>vars.x > 0</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="F2" sourceRef="GW_1" targetRef="T2" />
    <bpmn:task id="T1" name="Task 1" />
    <bpmn:task id="T2" name="Task 2" />
  </bpmn:process>
</bpmn:definitions>`;
    const def = await parseBpmn(bpmn);
    const gw = def.steps.find((s) => s.gateway_type === "inclusive")!;
    expect(gw).toBeDefined();
    expect(gw.transitions).toHaveLength(2);
  });

  it("should parse ParallelGateway as fork", async () => {
    const bpmn = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Def" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="ParallelProcess">
    <bpmn:startEvent id="S">
      <bpmn:outgoing>FS</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:parallelGateway id="GW_Fork" name="Fork">
      <bpmn:incoming>FS</bpmn:incoming>
      <bpmn:outgoing>FA</bpmn:outgoing>
      <bpmn:outgoing>FB</bpmn:outgoing>
    </bpmn:parallelGateway>
    <bpmn:task id="A" name="Task A">
      <bpmn:incoming>FA</bpmn:incoming>
      <bpmn:outgoing>FJA</bpmn:outgoing>
    </bpmn:task>
    <bpmn:task id="B" name="Task B">
      <bpmn:incoming>FB</bpmn:incoming>
      <bpmn:outgoing>FJB</bpmn:outgoing>
    </bpmn:task>
    <bpmn:parallelGateway id="GW_Join" name="Join">
      <bpmn:incoming>FJA</bpmn:incoming>
      <bpmn:incoming>FJB</bpmn:incoming>
    </bpmn:parallelGateway>
    <bpmn:sequenceFlow id="FS" sourceRef="S" targetRef="GW_Fork" />
    <bpmn:sequenceFlow id="FA" sourceRef="GW_Fork" targetRef="A" />
    <bpmn:sequenceFlow id="FB" sourceRef="GW_Fork" targetRef="B" />
    <bpmn:sequenceFlow id="FJA" sourceRef="A" targetRef="GW_Join" />
    <bpmn:sequenceFlow id="FJB" sourceRef="B" targetRef="GW_Join" />
  </bpmn:process>
</bpmn:definitions>`;

    const def = await parseBpmn(bpmn);
    const forkGw = def.steps.find((s) => s.gateway_type === "parallel_fork")!;
    const joinGw = def.steps.find((s) => s.gateway_type === "parallel_join")!;

    expect(forkGw).toBeDefined();
    expect(joinGw).toBeDefined();
    expect(forkGw.transitions).toHaveLength(2);
  });

  it("should parse UserTask", async () => {
    const bpmn = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:wrio="http://wrio.io/schema/bpmn/wrio" id="Def" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="UserTaskProcess">
    <bpmn:startEvent id="S">
      <bpmn:outgoing>F1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:userTask id="UserTask_1" name="Fill Form">
      <bpmn:extensionElements>
        <wrio:node category="form" action="fill">
            <wrio:param name="formId">form_123</wrio:param>
        </wrio:node>
      </bpmn:extensionElements>
      <bpmn:incoming>F1</bpmn:incoming>
      <bpmn:outgoing>F2</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:endEvent id="E">
      <bpmn:incoming>F2</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="F1" sourceRef="S" targetRef="UserTask_1" />
    <bpmn:sequenceFlow id="F2" sourceRef="UserTask_1" targetRef="E" />
  </bpmn:process>
</bpmn:definitions>`;

    const def = await parseBpmn(bpmn);
    const userStep = def.steps.find((s) => s.step_type === "user_task")!;
    expect(userStep).toBeDefined();
    expect(userStep.action).toBe("form.fill");
    expect(userStep.params).toEqual({ formId: "form_123" });
  });

  it("should parse CallActivity", async () => {
    const bpmn = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Def" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="CallerProcess">
    <bpmn:startEvent id="S">
      <bpmn:outgoing>F1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:callActivity id="Call_1" name="Call Sub" calledElement="audit_sub">
      <bpmn:incoming>F1</bpmn:incoming>
      <bpmn:outgoing>F2</bpmn:outgoing>
    </bpmn:callActivity>
    <bpmn:endEvent id="E">
      <bpmn:incoming>F2</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="F1" sourceRef="S" targetRef="Call_1" />
    <bpmn:sequenceFlow id="F2" sourceRef="Call_1" targetRef="E" />
  </bpmn:process>
</bpmn:definitions>`;

    const def = await parseBpmn(bpmn);
    const callStep = def.steps.find((s) => s.step_type === "call_activity")!;
    expect(callStep).toBeDefined();
    expect(callStep.called_definition).toBe("audit_sub");
  });

  it("should throw error if no Process element found", async () => {
    const emptyBpmn = `<?xml version="1.0" encoding="UTF-8"?><bpmn:definitions id="Empty" xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" />`;
    await expect(parseBpmn(emptyBpmn)).rejects.toThrow(
      "No Process element found",
    );
  });
});
