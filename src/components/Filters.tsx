export type TypeFilter = "all" | string;
export type DepartmentFilter = "all" | string;

interface FiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  typeFilter: TypeFilter;
  onTypeFilterChange: (value: TypeFilter) => void;
  availableTypes: string[];
  departmentFilter: DepartmentFilter;
  onDepartmentFilterChange: (value: DepartmentFilter) => void;
  availableDepartments: string[];
  departmentCounts: Record<string, number>;
  resultCount: number;
  totalCount: number;
  semanticSearchEnabled?: boolean;
  searching?: boolean;
}

export function Filters({
  search,
  onSearchChange,
  typeFilter,
  onTypeFilterChange,
  availableTypes,
  departmentFilter,
  onDepartmentFilterChange,
  availableDepartments,
  departmentCounts,
  resultCount,
  totalCount,
  semanticSearchEnabled = false,
  searching = false,
}: FiltersProps) {
  const typeChips: { id: TypeFilter; label: string }[] = [
    { id: "all", label: "All types" },
    ...availableTypes.map((type) => ({ id: type, label: type })),
  ];

  const departmentChips: { id: DepartmentFilter; label: string }[] = [
    { id: "all", label: "All teams" },
    ...availableDepartments.map((department) => ({
      id: department,
      label: `${department} (${departmentCounts[department] ?? 0})`,
    })),
  ];

  return (
    <section className="filters" aria-label="Search and filter tools">
      <div className="filters-row">
        <input
          type="search"
          className="search-input"
          placeholder={
            semanticSearchEnabled
              ? "Search by meaning — name, description, tags…"
              : "Search by name, description, owner, or tags…"
          }
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label="Search tools"
        />
        <p className="result-count" aria-live="polite">
          {searching
            ? "Searching…"
            : resultCount === totalCount
              ? `${totalCount} tools`
              : `${resultCount} of ${totalCount} tools`}
        </p>
      </div>
      <div className="filter-group">
        <span className="filter-group-label">Type</span>
        <div className="filter-chips" role="group" aria-label="Filter by type">
          {typeChips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              className={`chip ${typeFilter === chip.id ? "chip-active" : ""}`}
              onClick={() => onTypeFilterChange(chip.id)}
              aria-pressed={typeFilter === chip.id}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>
      <div className="filter-group">
        <span className="filter-group-label">Team</span>
        <div
          className="filter-chips"
          role="group"
          aria-label="Filter by department"
        >
          {departmentChips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              className={`chip chip-department ${departmentFilter === chip.id ? "chip-active" : ""}`}
              onClick={() => onDepartmentFilterChange(chip.id)}
              aria-pressed={departmentFilter === chip.id}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
