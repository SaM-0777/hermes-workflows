import { Button, Codicon } from "@hermes/plugin-sdk";

export interface SearchFieldProps {
  loading?: boolean;
  scope: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
}

export function SearchField({
  loading = false,
  scope,
  value,
  placeholder,
  onChange,
  onKeyDown,
}: SearchFieldProps) {
  return (
    <div className="flex h-10 w-full min-w-0 items-center gap-3 rounded-2xl border border-(--ui-stroke-tertiary) bg-(--dt-card) px-4 transition-[border-color] hover:border-(--ui-stroke-secondary) has-[>input:focus]:border-ring">
      <Codicon
        name="search"
        className="pointer-events-none m-0 size-3! shrink-0 p-0 text-muted-foreground/70"
      />
      <span className="inline-flex w-fit shrink-0 items-center gap-1 rounded-[3px] bg-muted px-1 py-1 text-[0.6rem] font-medium leading-none whitespace-nowrap text-muted-foreground [&_svg]:pointer-events-none">
        {scope}
      </span>
      <input
        className="h-7 w-full min-w-0 max-w-full flex-1 bg-transparent text-sm leading-5 text-foreground field-sizing-content placeholder:text-muted-foreground focus:outline-hidden"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        type="text"
        value={value}
      />
      {loading ? (
        <Codicon
          name="loading"
          size="1rem"
          className="pointer-events-none size-3.5 shrink-0 animate-spin text-muted-foreground/70"
        />
      ) : value ? (
        <Button
          className="shrink-0 text-muted-foreground/85 hover:bg-accent/60 hover:text-foreground"
          size="icon-xs"
          variant="ghost"
          onClick={() => onChange("")}
        >
          <Codicon name="close" size="0.875rem" />
        </Button>
      ) : null}
    </div>
  );
}
