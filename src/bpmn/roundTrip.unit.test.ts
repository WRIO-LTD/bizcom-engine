import { describe, it, expect } from "vitest";
import { parseBpmn } from "./parser";
import { serializeBpmn } from "./serializer";

describe("BPMN Round-Trip", () => {
  it("should survive round-trip: serialize then parse", async () => {
    const bpmnXml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:wrio="http://wrio.io/schema/bpmn/wrio" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="RoundTripTest" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:serviceTask id="ServiceTask_1" name="Process Data">
      <bpmn:extensionElements>
        <wrio:node category="http" action="request">
            <wrio:param name="url">https://api.example.com</wrio:param>
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

    const def1 = await parseBpmn(bpmnXml);
    const xml2 = serializeBpmn(def1);
    const def2 = await parseBpmn(xml2);

    expect(def2["@id"]).toBe("RoundTripTest");
    expect(def2.steps).toHaveLength(3);

    expect(def2.steps.map((s) => s.step_type)).toEqual([
      "start",
      "service",
      "end",
    ]);

    const serviceStep = def2.steps.find((s) => s.step_type === "service")!;
    expect(serviceStep.action).toBe("http.request");
    expect(serviceStep.transitions).toHaveLength(1);
    expect(serviceStep.transitions![0].target_id).toBe("EndEvent_1");
  });

  it("should survive round-trip with exclusive gateway and conditions", async () => {
    const bpmnXml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Def" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="GatewayRoundTrip">
    <bpmn:startEvent id="S">
      <bpmn:outgoing>FS</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:exclusiveGateway id="GW">
      <bpmn:incoming>FS</bpmn:incoming>
      <bpmn:outgoing>FY</bpmn:outgoing>
      <bpmn:outgoing>FN</bpmn:outgoing>
    </bpmn:exclusiveGateway>
    <bpmn:task id="TY" name="Yes" />
    <bpmn:task id="TN" name="No" />
    <bpmn:endEvent id="E" />
    <bpmn:sequenceFlow id="FS" sourceRef="S" targetRef="GW" />
    <bpmn:sequenceFlow id="FY" sourceRef="GW" targetRef="TY">
      <bpmn:conditionExpression>vars.ok == true</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="FN" sourceRef="GW" targetRef="TN" />
  </bpmn:process>
</bpmn:definitions>`;

    const def1 = await parseBpmn(bpmnXml);
    const xml2 = serializeBpmn(def1);
    const def2 = await parseBpmn(xml2);

    const gatewayStep = def2.steps.find((s) => s.step_type === "gateway")!;
    expect(gatewayStep.gateway_type).toBe("exclusive");
    expect(gatewayStep.transitions).toHaveLength(2);

    const cond = gatewayStep.transitions!.find((t) => t.condition);
    expect(cond!.condition).toContain("vars.ok");
  });

  it("should survive round-trip with parallel gateway", async () => {
    const bpmnXml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Def" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="ParallelRT">
    <bpmn:startEvent id="S">
      <bpmn:outgoing>FS</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:parallelGateway id="PFork">
      <bpmn:incoming>FS</bpmn:incoming>
      <bpmn:outgoing>FA</bpmn:outgoing>
      <bpmn:outgoing>FB</bpmn:outgoing>
    </bpmn:parallelGateway>
    <bpmn:task id="A" name="A">
      <bpmn:incoming>FA</bpmn:incoming>
      <bpmn:outgoing>FJA</bpmn:outgoing>
    </bpmn:task>
    <bpmn:task id="B" name="B">
      <bpmn:incoming>FB</bpmn:incoming>
      <bpmn:outgoing>FJB</bpmn:outgoing>
    </bpmn:task>
    <bpmn:parallelGateway id="PJoin">
      <bpmn:incoming>FJA</bpmn:incoming>
      <bpmn:incoming>FJB</bpmn:incoming>
    </bpmn:parallelGateway>
    <bpmn:sequenceFlow id="FS" sourceRef="S" targetRef="PFork" />
    <bpmn:sequenceFlow id="FA" sourceRef="PFork" targetRef="A" />
    <bpmn:sequenceFlow id="FB" sourceRef="PFork" targetRef="B" />
    <bpmn:sequenceFlow id="FJA" sourceRef="A" targetRef="PJoin" />
    <bpmn:sequenceFlow id="FJB" sourceRef="B" targetRef="PJoin" />
  </bpmn:process>
</bpmn:definitions>`;

    const def1 = await parseBpmn(bpmnXml);
    const xml2 = serializeBpmn(def1);
    const def2 = await parseBpmn(xml2);

    const fork = def2.steps.find((s) => s.gateway_type === "parallel_fork");

    expect(fork!.transitions).toHaveLength(2);
  });
});
