import { z } from "zod";
import { Button } from "../ui/button";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { Field, FieldError, FieldLabel } from "../ui/field";
import { Input } from "../ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { dataTypes } from "@/lib/node";

const portSchema = z.object({
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
const ioSchema = z
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
interface IoTabProps {
  defaultValues?: Partial<IoFormValues>;
  onChange?: (values: IoFormValues) => void;
  onSubmit?: (values: IoFormValues) => void;
}
export function IoTab({ defaultValues, onChange, onSubmit }: IoTabProps) {
  const form = useForm<IoFormValues>({
    resolver: zodResolver(ioSchema),
    defaultValues: {
      inputs: defaultValues?.inputs ?? [],
      outputs: defaultValues?.outputs ?? [],
    },
    mode: "onChange",
  });

  const inputs = useFieldArray({
    control: form.control,
    name: "inputs",
  });
  const outputs = useFieldArray({
    control: form.control,
    name: "outputs",
  });

  function notifyChange() {
    onChange?.(form.getValues());
  }

  function handleSubmit(values: IoFormValues) {
    onSubmit?.(values);
  }

  function renderPorts(
    direction: "inputs" | "outputs",
    fields: typeof inputs.fields,
    append: (value: { name: string; type: (typeof dataTypes)[number] }) => void,
    remove: (index: number) => void,
  ) {
    return (
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium capitalize">{direction}</h3>
            <p className="text-xs text-muted-foreground">
              Define the component's {direction}.
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              append({ name: "", type: "Any" });
            }}
          >
            <Plus className="mr-1 size-3.5" />
            Add {direction === "inputs" ? "input" : "output"}
          </Button>
        </div>

        {fields.length === 0 ? (
          <div className="rounded-lg border border-dashed px-4 py-6 text-center">
            <p className="text-sm text-muted-foreground">
              No {direction} defined yet.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {fields.map((field, index) => (
              <div key={field.id} className="rounded-sm border bg-card p-3">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">
                    {direction === "inputs" ? "Input" : "Output"} {index + 1}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7 text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      remove(index);
                      notifyChange();
                    }}
                  >
                    <Trash2 className="size-3.5" />
                    <span className="sr-only">Remove port</span>
                  </Button>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Controller
                    name={`${direction}.${index}.name`}
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel>Name</FieldLabel>
                        <Input
                          placeholder="e.g. prompt"
                          autoComplete="off"
                          {...field}
                          onChange={(event) => {
                            field.onChange(event);
                            notifyChange();
                          }}
                        />
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    )}
                  />
                  <Controller
                    name={`${direction}.${index}.type`}
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel>Data Type</FieldLabel>
                        <Select
                          name={field.name}
                          onValueChange={(value) => {
                            field.onChange(value);
                            notifyChange();
                          }}
                          value={field.value}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                          <SelectContent className="rounded-sm">
                            {dataTypes.map((type) => (
                              <SelectItem
                                className="rounded-sm"
                                key={type}
                                value={type}
                              >
                                {type}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    )}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    );
  }

  return (
    <form
      className="flex h-full min-h-0 flex-col"
      onSubmit={form.handleSubmit(handleSubmit)}
    >
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4">
        {renderPorts("inputs", inputs.fields, inputs.append, inputs.remove)}
        <div className="border-t" />
        {renderPorts("outputs", outputs.fields, outputs.append, outputs.remove)}
      </div>

      {onSubmit && (
        <div className="flex justify-end border-t px-4 py-3">
          <Button type="submit" disabled={!form.formState.isValid}>
            Save
          </Button>
        </div>
      )}
    </form>
  );
}
