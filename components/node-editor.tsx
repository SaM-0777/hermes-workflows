import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import z from "zod";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { cn } from "@/lib/utils";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "./ui/field";
import { Input } from "./ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

export type NodeEditorTab = "general" | "io" | "config" | "execution";

const tabs: { value: NodeEditorTab; label: string }[] = [
  { value: "general", label: "General" },
  { value: "io", label: "IO" },
  { value: "config", label: "Config" },
  { value: "execution", label: "execution" },
];

export function NodeEditor() {
  return (
    <div className={cn("flex h-full min-h-0 min-w-0 flex-col overflow-hidden")}>
      <div>
        <Tabs
          defaultValue="general"
          className="flex min-h-0 min-w-0 flex-1 flex-col gap-0"
        >
          <TabsList
            className={cn(
              "flex h-12 w-max min-w-full justify-start gap-1",
              "rounded-none bg-transparent p-0",
            )}
          >
            {tabs.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className={cn(
                  "h-12 min-w-20 flex-1 rounded-none px-3",
                  "text-xs sm:min-w-25 sm:text-sm",
                  "border-b-2 border-transparent",
                  "data-[state=active]:border-primary",
                  "data-[state=active]:bg-transparent",
                  "data-[state=active]:shadow-none",
                )}
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="general" className="m-0 h-full p-5 sm:p-6">
            <GeneralTab />
          </TabsContent>

          <TabsContent value="io" className="m-0 h-full p-5 sm:p-6">
            <TabPlaceholder
              title="Inputs"
              description="Define the data this component receives from connected nodes."
            />
          </TabsContent>

          <TabsContent value="config" className="m-0 h-full p-5 sm:p-6">
            <TabPlaceholder
              title="Parameters"
              description="Configure the editable values and defaults for this component."
            />
          </TabsContent>

          <TabsContent value="execution" className="m-0 h-full p-5 sm:p-6">
            <TabPlaceholder
              title="Python implementation"
              description="Write the complete Python class implementation for this component."
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

const generalSchema = z.object({
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
  category: z.string().min(1, "Please select a category."),
});
export type GeneralFormValues = z.infer<typeof generalSchema>;
interface GeneralTabProps {
  defaultValues?: Partial<GeneralFormValues>;
  onChange?: (values: GeneralFormValues) => void;
  onSubmit?: (values: GeneralFormValues) => void;
}
const categories = [
  { value: "data", label: "Data" },
  { value: "model", label: "Model" },
  { value: "processing", label: "Processing" },
  { value: "control-flow", label: "Control Flow" },
  { value: "utility", label: "Utility" },
  { value: "other", label: "Other" },
];
function GeneralTab({ defaultValues, onChange, onSubmit }: GeneralTabProps) {
  const form = useForm<GeneralFormValues>({
    resolver: zodResolver(generalSchema),
    defaultValues: {
      name: defaultValues?.name ?? "",
      description: defaultValues?.description ?? "",
      category: defaultValues?.category ?? "",
    },
    mode: "onChange",
  });

  function handleSubmit(values: GeneralFormValues) {
    onSubmit?.(values);
  }

  return (
    <form action="" onSubmit={form.handleSubmit(handleSubmit)}>
      <FieldGroup>
        <Controller
          name="name"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field>
              <FieldLabel htmlFor="name">Name</FieldLabel>
              <Input
                {...field}
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
                  onChange?.(form.getValues());
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
                <SelectContent className="rounded-sm">
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



function TabPlaceholder({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="max-w-xl text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
