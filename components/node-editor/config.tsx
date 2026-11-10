import { configSchema, dataTypes, type ConfigFormValues } from "@/lib/node";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Controller,
  useFieldArray,
  useForm,
  useWatch,
  type Control,
  type UseFormSetValue,
} from "react-hook-form";
import { Button } from "../ui/button";
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
import { Textarea } from "../ui/textarea";

interface ConfigTabProps {
  values?: ConfigFormValues;
  onChange: (values: ConfigFormValues) => void;
  onSubmit?: (values: ConfigFormValues) => void;
}

export function ConfigTab({ values, onChange, onSubmit }: ConfigTabProps) {
  const form = useForm<ConfigFormValues>({
    resolver: zodResolver(configSchema),
    defaultValues: values ?? { parameters: [] },
    mode: "onChange",
  });
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "parameters",
  });

  function notifyChange() {
    onChange(form.getValues());
  }
  function handleSubmit(values: ConfigFormValues) {
    onSubmit?.(values);
  }

  return (
    <form
      className="flex h-full min-h-0 flex-col"
      onSubmit={form.handleSubmit(handleSubmit)}
    >
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium">Parameters</h3>
              <p className="text-xs text-muted-foreground">
                Define configurable values for this component.
              </p>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                append({
                  name: "",
                  type: "String",
                  defaultValue: "",
                });
                notifyChange();
              }}
            >
              <Plus className="mr-1 size-3.5" />
              Add parameter
            </Button>
          </div>

          {fields.length === 0 ? (
            <div className="rounded-lg border border-dashed px-4 py-6 text-center">
              <p className="text-sm text-muted-foreground">
                No parameters defined yet.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {fields.map((field, index) => (
                <ParameterRow
                  key={field.id}
                  control={form.control}
                  index={index}
                  setValue={form.setValue}
                  onChange={notifyChange}
                  onRemove={() => {
                    remove(index);
                    notifyChange();
                  }}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </form>
  );
}

interface ParameterRowProps {
  control: Control<ConfigFormValues>;
  index: number;
  setValue: UseFormSetValue<ConfigFormValues>;
  onChange: () => void;
  onRemove: () => void;
}

function ParameterRow({
  control,
  index,
  setValue,
  onChange,
  onRemove,
}: ParameterRowProps) {
  const type = useWatch({
    control,
    name: `parameters.${index}.type`,
  });
  const isStructured = type === "Object" || type === "Array" || type === "Any";
  const isMedia = ["Image", "Audio", "Video", "File"].includes(type);

  return (
    <div className="rounded-sm border bg-card p-3">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          Parameter {index + 1}
        </span>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground hover:text-destructive"
          onClick={onRemove}
        >
          <Trash2 className="size-3.5" />
          <span className="sr-only">Remove parameter</span>
        </Button>
      </div>

      <div className="space-y-3">
        <Controller
          name={`parameters.${index}.name`}
          control={control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel>Name</FieldLabel>
              <Input
                placeholder="e.g. temperature"
                autoComplete="off"
                {...field}
                onChange={(event) => {
                  field.onChange(event);
                  onChange();
                }}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Controller
            name={`parameters.${index}.type`}
            control={control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel>Data Type</FieldLabel>
                <Select
                  name={field.name}
                  value={field.value}
                  onValueChange={(value) => {
                    field.onChange(value);
                    setValue(`parameters.${index}.defaultValue`, "", {
                      shouldValidate: true,
                    });
                    onChange();
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent
                    side="bottom"
                    align="start"
                    alignItemWithTrigger={false}
                    sideOffset={4}
                    className="rounded-sm"
                  >
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

          <Controller
            name={`parameters.${index}.defaultValue`}
            control={control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel>Default value</FieldLabel>

                {type === "Boolean" ? (
                  <Select
                    value={field.value}
                    onValueChange={(value) => {
                      field.onChange(value);
                      onChange();
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select value" />
                    </SelectTrigger>
                    <SelectContent
                      side="bottom"
                      align="start"
                      alignItemWithTrigger={false}
                      sideOffset={4}
                      className={"rounded-sm"}
                    >
                      <SelectItem value="true">True</SelectItem>
                      <SelectItem value="false">False</SelectItem>
                    </SelectContent>
                  </Select>
                ) : isStructured ? (
                  <Textarea
                    placeholder={
                      type === "Object"
                        ? '{"key": "value"}'
                        : type === "Array"
                          ? '["item1", "item2"]'
                          : "Enter a default value..."
                    }
                    className="min-h-9 resize-y"
                    {...field}
                    onChange={(event) => {
                      field.onChange(event);
                      onChange();
                    }}
                  />
                ) : (
                  <Input
                    placeholder={
                      isMedia
                        ? "No default value"
                        : type === "Number"
                          ? "e.g. 0.7"
                          : "Enter a value..."
                    }
                    disabled={isMedia}
                    type={type === "Number" ? "number" : "text"}
                    {...field}
                    onChange={(event) => {
                      field.onChange(event);
                      onChange();
                    }}
                  />
                )}

                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />
        </div>
      </div>
    </div>
  );
}
