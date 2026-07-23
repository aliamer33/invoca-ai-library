-- Rename link → builder_view and add optional user_view on catalog tools
ALTER TABLE public.tools RENAME COLUMN link TO builder_view;
ALTER TABLE public.tools ADD COLUMN user_view text;

-- Keep tool_submissions in sync
ALTER TABLE public.tool_submissions RENAME COLUMN link TO builder_view;
ALTER TABLE public.tool_submissions ADD COLUMN user_view text;
