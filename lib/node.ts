import z from "zod";
import { type Node } from "@xyflow/react";

export const categories = [
  { value: "data", label: "Data" },
  { value: "model", label: "Model" },
  { value: "processing", label: "Processing" },
  { value: "control-flow", label: "Control Flow" },
  { value: "utility", label: "Utility" },
  { value: "other", label: "Other" },
] as const;

export const dataTypes = [
  "Any",
  "String",
  "Number",
  "Boolean",
  "Object",
  "Array",
  "Image",
  "Audio",
  "Video",
  "File",
] as const;

export const generalSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required.")
    .max(64, "Name must be 64 characters or fewer.")
    .regex(
      /^[a-zA-Z][a-zA-Z0-9_-]*$/,
      "Use letters, numbers, underscores, or hyphens. Start with a letter.",
    ),
  description: z
    .string()
    .max(500, "Description must be 500 characters or fewer."),
  category: z.string().min(1, "Please select a category.").optional(),
});
export type GeneralFormValues = z.infer<typeof generalSchema>;

export const parameterSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Parameter name is required.")
    .max(64, "Name must be 64 characters or fewer.")
    .regex(
      /^[a-zA-Z][a-zA-Z0-9_-]*$/,
      "Use letters, numbers, underscores, or hyphens.",
    ),
  type: z.enum(dataTypes),
  defaultValue: z.string(),
});
export const configSchema = z
  .object({
    parameters: z.array(parameterSchema),
  })
  .superRefine((values, ctx) => {
    const names = new Set<string>();
    values.parameters.forEach((parameter, index) => {
      const normalizedName = parameter.name.trim().toLowerCase();
      if (normalizedName && names.has(normalizedName)) {
        ctx.addIssue({
          code: "custom",
          message: "Parameter names must be unique.",
          path: ["parameters", index, "name"],
        });
      }
      names.add(normalizedName);
    });
  });

export type ConfigFormValues = z.infer<typeof configSchema>;

export const portSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Port name is required.")
    .max(64, "Name must be 64 characters or fewer.")
    .regex(
      /^[a-zA-Z][a-zA-Z0-9_-]*$/,
      "Use letters, numbers, underscores, or hyphens.",
    ),
  type: z.enum(dataTypes),
});
export const ioSchema = z
  .object({
    inputs: z.array(portSchema),
    outputs: z.array(portSchema),
  })
  .superRefine((values, ctx) => {
    for (const direction of ["inputs", "outputs"] as const) {
      const names = new Set<string>();
      values[direction].forEach((port, index) => {
        const normalizedName = port.name.trim().toLowerCase();
        if (normalizedName && names.has(normalizedName)) {
          ctx.addIssue({
            code: "custom",
            message: "Port names must be unique.",
            path: [direction, index, "name"],
          });
        }

        names.add(normalizedName);
      });
    }
  });
export type IoFormValues = z.infer<typeof ioSchema>;

export type NodeData = {
  general: GeneralFormValues;
  io?: IoFormValues;
  config?: ConfigFormValues;
  execution?: {
    pythonCode: string;
  };
};
export type WorkflowNode = Node<NodeData>;
