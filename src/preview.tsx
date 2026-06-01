import { Detail } from "@raycast/api";
import { LibraryEntry } from "./types";
import { renderEntryMarkdown } from "./preview-markdown";

export { renderEntryMarkdown };

export function EntryDetail(props: { entry: LibraryEntry }) {
  return <Detail markdown={renderEntryMarkdown(props.entry)} />;
}
