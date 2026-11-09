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
