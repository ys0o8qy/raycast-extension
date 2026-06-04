import { List } from "@raycast/api";
import { renderEntryMarkdown } from "./preview";
import { LibraryEntry } from "./types";

export function ResourceDetail(props: {
  entry: LibraryEntry;
  projects?: string[];
  suggestedTags?: string[];
}) {
  const { entry, projects = [], suggestedTags = [] } = props;

  return (
    <List.Item.Detail
      markdown={renderEntryMarkdown(entry)}
      metadata={
        <ResourceMetadata
          entry={entry}
          projects={projects}
          suggestedTags={suggestedTags}
        />
      }
    />
  );
}

function ResourceMetadata(props: {
  entry: LibraryEntry;
  projects: string[];
  suggestedTags: string[];
}) {
  const { entry, projects, suggestedTags } = props;

  const url = entry.properties.URL;
  const path = entry.properties.PATH;
  const schemaKind = entry.properties.SCHEMA_KIND;

  const otherProperties = Object.entries(entry.properties).filter(
    ([key]) =>
      key !== "FORMAT" &&
      key !== "DESCRIPTION" &&
      key !== "URL" &&
      key !== "PATH" &&
      key !== "SCHEMA_KIND",
  );

  return (
    <List.Item.Detail.Metadata>
      {projects.length > 0 ? (
        <List.Item.Detail.Metadata.TagList title="Projects">
          {projects.map((name) => (
            <List.Item.Detail.Metadata.TagList.Item
              key={name}
              text={name}
              color="blue"
            />
          ))}
        </List.Item.Detail.Metadata.TagList>
      ) : null}

      {entry.tags.length > 0 ? (
        <List.Item.Detail.Metadata.TagList title="Tags">
          {entry.tags.map((tag) => (
            <List.Item.Detail.Metadata.TagList.Item key={tag} text={tag} />
          ))}
        </List.Item.Detail.Metadata.TagList>
      ) : null}

      {suggestedTags.length > 0 ? (
        <List.Item.Detail.Metadata.TagList title="AI Suggested Tags">
          {suggestedTags.map((tag) => (
            <List.Item.Detail.Metadata.TagList.Item
              key={tag}
              text={tag}
              color="yellow"
            />
          ))}
        </List.Item.Detail.Metadata.TagList>
      ) : null}

      {url && (
        <List.Item.Detail.Metadata.Link
          title="URL"
          text={url}
          target={url}
        />
      )}

      {path && (
        <List.Item.Detail.Metadata.Label title="Path" text={path} />
      )}

      <List.Item.Detail.Metadata.Label title="Type" text={entry.type} />

      {schemaKind && (
        <List.Item.Detail.Metadata.Label
          title="Schema Kind"
          text={schemaKind}
        />
      )}

      {otherProperties.map(([key, value]) => (
        <List.Item.Detail.Metadata.Label key={key} title={key} text={value} />
      ))}
    </List.Item.Detail.Metadata>
  );
}
