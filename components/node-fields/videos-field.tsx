import { MediaField, type MediaFieldProps } from "./media-field";

export type VideoFieldProps = Omit<MediaFieldProps, "accept" | "multiple" | "noun">;

export function VideosField(props: VideoFieldProps) {
  return <MediaField {...props} accept="video/*" noun="video" />;
}

export default VideosField;
