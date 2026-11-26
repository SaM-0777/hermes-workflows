import { MediaField, type MediaFieldProps } from "./media-field";

export type FilesFieldProps = Omit<MediaFieldProps, "accept" | "multiple" | "noun">;

/** Any file, any number of them. */
export function FilesField(props: FilesFieldProps) {
  return <MediaField {...props} multiple noun="file" />;
}

export default FilesField;
