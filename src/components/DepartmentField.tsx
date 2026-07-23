import {
  parseDepartments,
  SUGGESTED_DEPARTMENTS,
  serializeDepartments,
} from "../types/tool";

interface DepartmentFieldProps {
  value: string;
  onChange: (value: string) => void;
}

export function DepartmentField({ value, onChange }: DepartmentFieldProps) {
  const selected = new Set(parseDepartments(value));

  function toggle(department: string) {
    const next = new Set(selected);
    if (next.has(department)) {
      next.delete(department);
    } else {
      next.add(department);
    }
    onChange(serializeDepartments([...next]) ?? "");
  }

  return (
    <fieldset className="department-field">
      <legend className="department-field-legend">Departments</legend>
      <p className="department-field-hint">
        Which teams is this tool for? Select all that apply.
      </p>
      <div className="department-checkboxes">
        {SUGGESTED_DEPARTMENTS.map((department) => (
          <label key={department} className="department-checkbox">
            <input
              type="checkbox"
              checked={selected.has(department)}
              onChange={() => toggle(department)}
            />
            <span>{department}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
