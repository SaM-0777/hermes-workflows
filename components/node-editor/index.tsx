import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { GeneralTab } from "./general";
import { IoTab } from "./io";
import { ConfigTab } from "./config";

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
            <IoTab />
          </TabsContent>

          <TabsContent value="config" className="m-0 h-full p-5 sm:p-6">
            <ConfigTab />
          </TabsContent>

          <TabsContent
            value="execution"
            className="m-0 h-full p-5 sm:p-6"
          ></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
