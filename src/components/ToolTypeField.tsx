import {
  CUSTOM_TOOL_TYPE_OPTION,
  MAX_TOOL_TYPE_LENGTH,
  SUGGESTED_TOOL_TYPES,
  isSuggestedToolType,
  normalizeToolType,
} from "../types/tool";

interface ToolTypeFieldProps {
  value: string;
  onChange: (value: string) => void;
  extraTypes?: string[];
  id?: string;
}

function uniqueExtraTypes(extraTypes: string[] = []): string[] {
  const seen = new Set<string>(SUGGESTED_TOOL_TYPES);
  const result: string[] = [];

  for (const type of extraTypes) {
    const normalized = normalizeToolType(type);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }

  return result.sort((a, b) => a.localeCompare(b));
}

export function ToolTypeField({
  value,
  onChange,
  extraTypes = [],
  id = "tool-type",
}: ToolTypeFieldProps) {
  const customTypes = uniqueExtraTypes(extraTypes);
  const presetValue = isSuggestedToolType(value)
    ? value
    : customTypes.includes(value)
      ? value
      : CUSTOM_TOOL_TYPE_OPTION;
  const showCustomInput = presetValue === CUSTOM_TOOL_TYPE_OPTION;

  return (
    <>
      <select
        id={id}
        value={presetValue}
        onChange={(e) => {
          const next = e.target.value;
          if (next === CUSTOM_TOOL_TYPE_OPTION) {
            onChange(normalizeToolType(value) || "");
            return;
          }
          onChange(next);
        }}
        required={!showCustomInput}
      >
        {SUGGESTED_TOOL_TYPES.map((type) => (
          <option key={type} value={type}>
            {type}
          </option>
        ))}
        {customTypes.map((type) => (
          <option key={type} value={type}>
            {type}
          </option>
        ))}
        <option value={CUSTOM_TOOL_TYPE_OPTION}>Other — type your own</option>
      </select>

      {showCustomInput && (
        <input
          className="tool-type-custom-input"
          value={value}
          onChange={(e) => onChange(normalizeToolType(e.target.value))}
          placeholder="e.g. MCP Server, Custom GPT, n8n workflow"
          maxLength={MAX_TOOL_TYPE_LENGTH}
          required
          aria-label="Custom tool type"
        />
      )}
    </>
  );
}

export function resolveToolTypeForSubmit(type: string): string {
  const normalized = normalizeToolType(type);
  if (!normalized) {
    throw new Error("Please enter a tool type.");
  }
  return normalized;
}
