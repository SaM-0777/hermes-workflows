import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { GeneralTab, type GeneralFormValues } from "./general";
import { IoTab, type IoFormValues } from "./io";
import { ConfigTab, type ConfigFormValues } from "./config";
import { ExecutionTab } from "./execution";
import { useState } from "react";
import { generatePythonCode } from "@/lib/python-code";

export type NodeEditorTab = "general" | "io" | "config" | "execution";

const tabs: { value: NodeEditorTab; label: string }[] = [
  { value: "general", label: "General" },
  { value: "io", label: "IO" },
  { value: "config", label: "Config" },
  { value: "execution", label: "Execution" },
];

interface NodeDefinition {
  general: GeneralFormValues;
  io: IoFormValues;
  config: ConfigFormValues;
}

const initialDefinition: NodeDefinition = {
  general: {
    name: "",
    description: "",
    category: "",
  },
  io: {
    inputs: [],
    outputs: [],
  },
  config: {
    parameters: [],
  },
};
export function NodeEditor() {
  const [definitionVersion, setDefinitionVersion] = useState(0);
  const [definition, setDefinition] =
    useState<NodeDefinition>(initialDefinition);
  const [pythonCode, setPythonCode] = useState(() =>
    generatePythonCode(initialDefinition),
  );

  function updateDefinition(nextDefinition: NodeDefinition) {
    setDefinition(nextDefinition);
    setPythonCode(generatePythonCode(nextDefinition));
  }

  function handleDefinitionExtracted(nextDefinition: NodeDefinition) {
    setDefinition(nextDefinition);
    setDefinitionVersion((version) => version + 1);
  }

  return (
    <div className={cn("flex h-full min-h-0 min-w-0 flex-col overflow-hidden")}>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Tabs
          defaultValue="general"
          className="flex h-full min-h-0 min-w-0 flex-1 flex-col gap-0"
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
            <GeneralTab
              key={definitionVersion}
              values={definition.general}
              onChange={(general) =>
                updateDefinition({ ...definition, general })
              }
            />
          </TabsContent>

          <TabsContent value="io" className="m-0 h-full p-5 sm:p-6">
            <IoTab
              key={definitionVersion}
              values={definition.io}
              onChange={(io) => updateDefinition({ ...definition, io })}
            />
          </TabsContent>

          <TabsContent value="config" className="m-0 h-full p-5 sm:p-6">
            <ConfigTab
              key={definitionVersion}
              values={definition.config}
              onChange={(config) => updateDefinition({ ...definition, config })}
            />
          </TabsContent>

          <TabsContent
            value="execution"
            className="m-0 h-full min-h-0 overflow-hidden p-0"
          >
            <ExecutionTab
              value={pythonCode}
              onChange={setPythonCode}
              onDefinitionExtracted={handleDefinitionExtracted}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
