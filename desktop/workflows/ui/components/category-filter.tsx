import { Button, Codicon } from "@hermes/plugin-sdk";

export interface CategoryFilterProps {
  disabled?: boolean;
  sizing?: "equal" | "content";
  value: string;
}

export function CategoryFilter({
  disabled = false,
  sizing = "equal",
  value,
}: CategoryFilterProps) {
  const options = [
    { id: 1, label: "Category", icon: <Codicon name="layout" className="size-1.5!" /> },
    { id: 2, label: "Source", icon: <Codicon name="database" className="size-1.5!" /> },
  ];

  return (
    <div className="catalog-filter-bar">
      <div className="catalog-filter-row">
        <div
          className={`${disabled ? "opacity-50" : ""} ${sizing === "equal" ? "auto-cols-fr" : "auto-cols-max"} inline-grid w-fit grid-flow-col gap-0.5 rounded-[5px] bg-(--ui-bg-tertiary) p-0.5`}
        >
          {options.map(({ id, label, icon }) => {
            const active = value === label;
            return (
              <button
                className={`flex items-center justify-center gap-2 rounded-[3px] px-2.5 py-0.5 text-[0.6875rem] font-medium transition-colors hover:transition-none disabled:cursor-default ${active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                key={id}
                onClick={() => undefined}
                type="button"
              >
                {icon}
                {label}
              </button>
            );
          })}
        </div>
        <div className="catalog-filter-chips">
          <Button size="xs" variant="default" onClick={() => undefined}>
            All
          </Button>
        </div>
      </div>
    </div>
  );
}
