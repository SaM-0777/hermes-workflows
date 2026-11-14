import { cn } from "@/lib/utils";
import { Textarea } from "../ui/textarea";

export interface TextFieldProps {
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
}

/**
 * One visible line that grows downward as the text wraps (the shared Textarea
 * carries `field-sizing-content`), and can also be dragged taller by hand.
 */
export function TextField({ value, onChange, invalid }: TextFieldProps) {
  return (
    <Textarea
      rows={1}
      value={value}
      placeholder="Enter text…"
      aria-invalid={invalid || undefined}
      className={cn(
        "min-h-9 max-h-48 resize-y py-1.5 leading-6",
        "overflow-y-auto whitespace-pre-wrap wrap-break-word",
      )}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

export default TextField;
