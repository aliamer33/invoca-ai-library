-- Tool type enum matching src/types/tool.ts
CREATE TYPE public.tool_type AS ENUM (
  'Gumloop Agent',
  'Workflow',
  'Claude Skill'
);

CREATE TABLE public.tools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type public.tool_type NOT NULL,
  description text NOT NULL,
  owner text NOT NULL,
  team text,
  link text NOT NULL,
  doc_link text,
  status text DEFAULT 'Live' CHECK (status IS NULL OR status IN ('Live', 'Beta', 'Deprecated')),
  tags text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX tools_type_idx ON public.tools (type);
CREATE INDEX tools_updated_at_idx ON public.tools (updated_at DESC);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tools_updated_at
  BEFORE UPDATE ON public.tools
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.tools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read tools"
  ON public.tools
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Editors can insert tools"
  ON public.tools
  FOR INSERT
  TO authenticated
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'editor');

CREATE POLICY "Editors can update tools"
  ON public.tools
  FOR UPDATE
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'editor')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'editor');

CREATE POLICY "Editors can delete tools"
  ON public.tools
  FOR DELETE
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'editor');

-- Seed from mock/tools.json
INSERT INTO public.tools (name, type, description, owner, team, link, doc_link, status, tags, updated_at)
VALUES
  (
    'Air Traffic Control Intake',
    'Gumloop Agent',
    'Slack intake agent that deduplicates AI automation requests, scores impact vs effort, and routes users to existing tools in the library.',
    'Ali Amer',
    'AI Enablement',
    'https://gumloop.com',
    'https://docs.google.com',
    'Live',
    'intake,slack,dedup',
    '2026-05-20T00:00:00Z'
  ),
  (
    'Tool Documentation Generator',
    'Workflow',
    'Reads tool metadata from the library sheet and auto-generates Invoca-style user documentation in Google Docs.',
    'Ali Amer',
    'AI Enablement',
    'https://gumloop.com',
    NULL,
    'Live',
    'documentation,automation',
    '2026-05-18T00:00:00Z'
  ),
  (
    'Morning Briefing',
    'Claude Skill',
    'Configurable daily briefing that surfaces email, Slack VIP messages, and tasks for any Invoca team member.',
    'Ali Amer',
    'AI Enablement',
    'https://claude.ai',
    'https://docs.google.com',
    'Beta',
    'productivity,slack,email',
    '2026-05-15T00:00:00Z'
  ),
  (
    'Brand Guidelines',
    'Claude Skill',
    'Applies Invoca brand colors, typography, and logo rules to presentations, decks, and internal documents.',
    'Ali Amer',
    'Design',
    'https://claude.ai',
    NULL,
    'Live',
    'brand,design,decks',
    '2026-05-12T00:00:00Z'
  ),
  (
    'Passion Week Agent Matcher',
    'Gumloop Agent',
    'Helps marketing and CS teams discover existing Gumloop agents before building duplicates during passion week.',
    'Matt Diederichs',
    'Marketing',
    'https://gumloop.com',
    NULL,
    'Beta',
    'discovery,marketing',
    '2026-05-10T00:00:00Z'
  );
