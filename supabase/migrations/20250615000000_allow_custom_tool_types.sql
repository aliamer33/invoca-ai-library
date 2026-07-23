-- Allow free-text tool types instead of a fixed enum
ALTER TABLE public.tools
  ALTER COLUMN type TYPE text USING type::text;

ALTER TABLE public.tool_submissions
  ALTER COLUMN type TYPE text USING type::text;

DROP TYPE public.tool_type;

ALTER TABLE public.tools
  ADD CONSTRAINT tools_type_not_empty CHECK (char_length(trim(type)) > 0);

ALTER TABLE public.tool_submissions
  ADD CONSTRAINT tool_submissions_type_not_empty CHECK (char_length(trim(type)) > 0);
