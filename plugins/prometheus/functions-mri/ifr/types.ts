// @ts-nocheck - Deno edge function

export interface IfrExpression { type: "Expression"; operator: string; value: string | number; }

export interface IfrBoolean<T> { type: "BooleanContainer"; op: "AND" | "OR" | "NOT"; content: T[]; }

export interface IfrAttribute {
  type: "Attribute";
  configPath: string;                          // e.g. "patient.attributes.Gender"
  constraints: IfrBoolean<IfrExpression>;
}

export interface IfrFilterCard {
  type: "FilterCard";
  configPath: string;                          // e.g. "patient.interactions.Diagnosis"
  instanceNumber?: number;
  attributes: IfrBoolean<IfrAttribute>;
}

export interface IfrAxis { categoryId: string; attributeId: string; binsize: string; }

export interface Ifr {
  filter: {
    configMetadata: { id: string; version: string };
    cards: IfrBoolean<IfrBoolean<IfrFilterCard> | IfrFilterCard>;
  };
  axisSelection: IfrAxis[];
  datasetId?: string;
}
