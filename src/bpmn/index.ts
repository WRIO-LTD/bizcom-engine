export { parseBpmn } from "./parser.js";
export { serializeBpmn } from "./serializer.js";
export { generateBpmnXml } from "./bpmn_generator.js";
export type { BpmnProcess } from "./bpmn_generator.js";

import { parseBpmn } from "./parser.js";
import { serializeBpmn } from "./serializer.js";
import type { ProcessDefinition } from "../model/types.js";

export async function roundTrip(bpmnXml: string): Promise<ProcessDefinition> {
  const definition = await parseBpmn(bpmnXml);
  const regenerated = serializeBpmn(definition);
  return parseBpmn(regenerated);
}

export async function parseThenSerialize(bpmnXml: string): Promise<string> {
  const definition = await parseBpmn(bpmnXml);
  return serializeBpmn(definition);
}
