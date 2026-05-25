import { Action, ActionPanel, Icon, List } from "@raycast/api";
import { useState } from "react";
import { filterRoleOptions, isCustomRole } from "./roles";
import { normalizeRole, displayRole } from "./parser";

interface RolePickerProps {
  onSelect: (role: string) => void;
  navigationTitle?: string;
}

/**
 * Two-layer role picker:
 *   Layer 1 — Preset roles (searchable, from PROJECT_ROLE_OPTIONS)
 *   Layer 2 — Custom role input (type any role name, Enter to create)
 *
 * When the user types a query that doesn't match any preset,
 * they see a "Create custom role" option with their input.
 */
export function RolePicker(props: RolePickerProps) {
  const { onSelect, navigationTitle } = props;
  const [searchText, setSearchText] = useState("");

  const filtered = filterRoleOptions(searchText);
  const custom = isCustomRole(searchText);
  const normalizedCustom = searchText.trim() ? normalizeRole(searchText) : "";

  return (
    <List
      navigationTitle={navigationTitle ?? "Choose Role"}
      searchBarPlaceholder="Search roles or type a custom one..."
      searchText={searchText}
      onSearchTextChange={setSearchText}
      filtering={false}
    >
      {filtered.length > 0 ? (
        <List.Section
          title="Preset Roles"
          subtitle={
            searchText.trim()
              ? `${filtered.length} matching`
              : `${filtered.length} available`
          }
        >
          {filtered.map((option) => (
            <List.Item
              key={option.value}
              title={option.title}
              subtitle={option.value}
              icon={Icon.Tag}
              actions={
                <ActionPanel>
                  <Action
                    title={`Select "${option.title}"`}
                    icon={Icon.Check}
                    onAction={() => onSelect(option.value)}
                  />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      ) : null}

      {custom && normalizedCustom ? (
        <List.Section title="Custom Role">
          <List.Item
            title={displayRole(normalizedCustom)}
            subtitle={`Create custom role "${normalizedCustom}"`}
            icon={Icon.PlusCircle}
            actions={
              <ActionPanel>
                <Action
                  title={`Create "${displayRole(normalizedCustom)}"`}
                  icon={Icon.Plus}
                  onAction={() => onSelect(normalizedCustom)}
                />
              </ActionPanel>
            }
          />
        </List.Section>
      ) : null}

      {filtered.length === 0 && !custom ? (
        <List.EmptyView
          title="No matching roles"
          description="Try a different search or type a custom role name"
          icon={Icon.Tag}
        />
      ) : null}
    </List>
  );
}
