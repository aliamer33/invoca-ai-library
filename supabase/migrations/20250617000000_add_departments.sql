-- Target audience departments for catalog filtering (comma-separated in app layer)
ALTER TABLE public.tools
  ADD COLUMN IF NOT EXISTS departments text;

ALTER TABLE public.tool_submissions
  ADD COLUMN IF NOT EXISTS departments text;

CREATE INDEX IF NOT EXISTS tools_departments_idx ON public.tools (departments);

-- Tag existing seed tools with suggested departments
UPDATE public.tools SET departments = 'Customer Success,Marketing,Engineering,Sales,Rev Ops,Analytics,People and Culture'
WHERE name = 'Air Traffic Control Intake' AND departments IS NULL;

UPDATE public.tools SET departments = 'Engineering'
WHERE name = 'Tool Documentation Generator' AND departments IS NULL;

UPDATE public.tools SET departments = 'Customer Success,Marketing,Engineering,People and Culture,Sales,Rev Ops,Analytics'
WHERE name = 'Morning Briefing' AND departments IS NULL;

UPDATE public.tools SET departments = 'Marketing'
WHERE name = 'Brand Guidelines' AND departments IS NULL;

UPDATE public.tools SET departments = 'Marketing,Customer Success'
WHERE name = 'Passion Week Agent Matcher' AND departments IS NULL;
