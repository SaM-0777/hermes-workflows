import type { dataTypes } from "@/lib/node";
import { AudiosField } from "./audios-field";
import { DatasetField } from "./dataset-field";
import { FilesField } from "./files-field";
import { ImagesField } from "./images-field";
import { JsonField } from "./json-field";
import { TextField } from "./text-field";
import { VideosField } from "./videos-field";

export { AudiosField, DatasetField, FilesField, ImagesField, JsonField, TextField, VideosField };
export { parseFileRefs, serializeFileRefs, fileNameOf } from "./file-refs";

export interface ParameterValueFieldProps {
  type: (typeof dataTypes)[number];
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
}

/**
 * The default-value editor for one parameter, picked by its declared type.
 * Every field is controlled: `value` is the parameter's `defaultValue` string.
 */
export function ParameterValueField({
  type,
  value,
  onChange,
  invalid,
}: ParameterValueFieldProps) {
  switch (type) {
    case "Text":
      return <TextField value={value} onChange={onChange} invalid={invalid} />;
    case "Dataset":
      return <DatasetField value={value} onChange={onChange} invalid={invalid} />;
    case "Images":
      return <ImagesField value={value} onChange={onChange} invalid={invalid} />;
    case "Videos":
      return <VideosField value={value} onChange={onChange} invalid={invalid} />;
    case "Audios":
      return <AudiosField value={value} onChange={onChange} invalid={invalid} />;
    case "Files":
      return <FilesField value={value} onChange={onChange} invalid={invalid} />;
    case "JSON":
      return <JsonField value={value} onChange={onChange} invalid={invalid} />;
    default: {
      // Exhaustiveness: adding a type to dataTypes without a field fails here.
      const unreachable: never = type;
      return <TextField value={String(unreachable)} onChange={onChange} invalid />;
    }
  }
}

export default ParameterValueField;
