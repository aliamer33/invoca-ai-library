-- Per-user up/down votes on catalog tools (anonymous voter_key from browser localStorage)
CREATE TABLE public.tool_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_id uuid NOT NULL REFERENCES public.tools(id) ON DELETE CASCADE,
  voter_key text NOT NULL,
  vote smallint NOT NULL CHECK (vote IN (-1, 1)),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tool_id, voter_key)
);

CREATE INDEX tool_votes_tool_id_idx ON public.tool_votes (tool_id);

CREATE TRIGGER tool_votes_updated_at
  BEFORE UPDATE ON public.tool_votes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.tool_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read votes"
  ON public.tool_votes
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can insert votes"
  ON public.tool_votes
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can update votes"
  ON public.tool_votes
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can delete votes"
  ON public.tool_votes
  FOR DELETE
  TO anon, authenticated
  USING (true);

CREATE OR REPLACE FUNCTION public.get_tool_vote_aggregates()
RETURNS TABLE (
  tool_id uuid,
  upvotes bigint,
  downvotes bigint,
  score bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    tool_id,
    COUNT(*) FILTER (WHERE vote = 1) AS upvotes,
    COUNT(*) FILTER (WHERE vote = -1) AS downvotes,
    COALESCE(SUM(vote), 0) AS score
  FROM public.tool_votes
  GROUP BY tool_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_tool_vote_aggregates() TO anon, authenticated;
