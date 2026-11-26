import { MediaField, type MediaFieldProps } from "./media-field";

export type ImageFieldProps = Omit<MediaFieldProps, "accept" | "multiple" | "noun">;

export function ImagesField(props: ImageFieldProps) {
  return <MediaField {...props} accept="image/*" noun="image" />;
}

export default ImagesField;
