import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "../ui/field";
import { Input } from "../ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { categories, generalSchema, type GeneralFormValues } from "@/lib/node";

interface GeneralTabProps {
  values: GeneralFormValues;
  onChange: (values: GeneralFormValues) => void;
  onSubmit?: (values: GeneralFormValues) => void;
}
export function GeneralTab({ values, onChange, onSubmit }: GeneralTabProps) {
  const form = useForm<GeneralFormValues>({
    resolver: zodResolver(generalSchema),
    values,
    mode: "onChange",
  });

  function notifyChange() {
    onChange(form.getValues());
  }
  function handleSubmit(values: GeneralFormValues) {
    onSubmit?.(values);
  }

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)}>
      <FieldGroup>
        <Controller
          name="name"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field>
              <FieldLabel htmlFor="name">Name</FieldLabel>
              <Input
                {...field}
                onChange={(event) => {
                  field.onChange(event);
                  onChange(form.getValues());
                }}
                id="name"
                aria-invalid={fieldState.invalid}
                placeholder="e.g. text-processor"
                autoComplete="off"
                className="rounded-sm"
              />
              <FieldDescription>
                A unique identifier for this component.
              </FieldDescription>
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Controller
          name="description"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="description">Desription</FieldLabel>
              <Input
                {...field}
                onChange={(event) => {
                  field.onChange(event);
                  notifyChange();
                }}
                id="description"
                aria-invalid={fieldState.invalid}
                placeholder="Describe what this component does..."
                autoComplete="off"
                className="rounded-sm"
              />
              <FieldDescription>
                A short explanation displayed in the node library.
              </FieldDescription>
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        <Controller
          name="category"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field orientation="responsive" data-invalid={fieldState.invalid}>
              <FieldContent>
                <FieldLabel htmlFor="category">Category</FieldLabel>
                <FieldDescription>
                  For best results, select the language you speak.
                </FieldDescription>
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </FieldContent>
              <Select
                name={field.name}
                onValueChange={(value) => {
                  field.onChange(value);
                  notifyChange();
                }}
                value={field.value}
              >
                <SelectTrigger
                  id="category"
                  aria-invalid={fieldState.invalid}
                  className="min-w-30 rounded-sm"
                >
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent
                  side="bottom"
                  align="start"
                  alignItemWithTrigger={false}
                  sideOffset={4}
                  className="rounded-sm"
                >
                  {categories.map((category) => (
                    <SelectItem
                      className="rounded-sm"
                      key={category.value}
                      value={category.value}
                    >
                      {category.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
        />
      </FieldGroup>
    </form>
  );
}
