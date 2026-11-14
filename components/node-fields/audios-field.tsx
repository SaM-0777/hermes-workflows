import { MediaField, type MediaFieldProps } from "./media-field";

export type AudioFieldProps = Omit<MediaFieldProps, "accept" | "multiple" | "noun">;

export function AudiosField(props: AudioFieldProps) {
  return <MediaField {...props} accept="audio/*" noun="audio" />;
}

export default AudiosField;
