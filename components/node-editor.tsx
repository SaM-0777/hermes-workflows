import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export type NodeEditorTab =
  | "general"
  | "inputs"
  | "outputs"
  | "parameters"
  | "python";

const tabs: { value: NodeEditorTab; label: string }[] = [
  { value: "general", label: "General" },
  { value: "inputs", label: "Inputs" },
  { value: "outputs", label: "Outputs" },
  { value: "parameters", label: "Parameters" },
  { value: "python", label: "Python" },
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
            <TabPlaceholder
              title="General information"
              description="Configure your component's name, description, category and icon."
            />
          </TabsContent>

          <TabsContent value="inputs" className="m-0 h-full p-5 sm:p-6">
            <TabPlaceholder
              title="Inputs"
              description="Define the data this component receives from connected nodes."
            />
          </TabsContent>

          <TabsContent value="outputs" className="m-0 h-full p-5 sm:p-6">
            <TabPlaceholder
              title="Outputs"
              description="Define the data this component exposes to downstream nodes."
            />
          </TabsContent>

          <TabsContent value="parameters" className="m-0 h-full p-5 sm:p-6">
            <TabPlaceholder
              title="Parameters"
              description="Configure the editable values and defaults for this component."
            />
          </TabsContent>

          <TabsContent value="python" className="m-0 h-full p-5 sm:p-6">
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
