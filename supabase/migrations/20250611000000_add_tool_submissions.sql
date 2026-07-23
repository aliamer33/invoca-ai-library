CREATE TABLE public.tool_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type public.tool_type NOT NULL,
  description text NOT NULL,
  owner text NOT NULL,
  team text,
  link text NOT NULL,
  doc_link text,
  tags text,
  submitter_email text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewer_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX tool_submissions_status_idx ON public.tool_submissions (status);
CREATE INDEX tool_submissions_created_at_idx ON public.tool_submissions (created_at DESC);

CREATE TRIGGER tool_submissions_updated_at
  BEFORE UPDATE ON public.tool_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.tool_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit tools"
  ON public.tool_submissions
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (status = 'pending');

CREATE POLICY "Editors can read submissions"
  ON public.tool_submissions
  FOR SELECT
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'editor');

CREATE POLICY "Editors can update submissions"
  ON public.tool_submissions
  FOR UPDATE
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'editor')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'editor');
