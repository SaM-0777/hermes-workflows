import { SearchField, type SearchFieldProps } from "./search-field";

export function SearchHeader(props: SearchFieldProps) {
  return (
    <header className="catalog-search-header shrink-0">
      <SearchField {...props} />
    </header>
  );
}
