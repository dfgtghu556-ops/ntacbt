-- Anonymous per-test score sharing: each submitted attempt on a published
-- test can post its marks (no name, no identity — just the number), which
-- powers the "Your 187 vs average 142 · top score 231" comparison on the
-- result page. Write-only for visitors; aggregates are read via a
-- SECURITY DEFINER function so raw rows never need broad read access.

CREATE TABLE IF NOT EXISTS public.test_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id uuid NOT NULL REFERENCES public.public_tests(id) ON DELETE CASCADE,
  marks integer NOT NULL CHECK (marks BETWEEN -75 AND 300),
  max_marks integer NOT NULL DEFAULT 300 CHECK (max_marks BETWEEN 1 AND 400),
  accuracy numeric(5,2) NOT NULL DEFAULT 0 CHECK (accuracy BETWEEN 0 AND 100),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS test_scores_test_id_idx ON public.test_scores(test_id);

GRANT INSERT ON public.test_scores TO anon, authenticated;
GRANT ALL ON public.test_scores TO service_role;

ALTER TABLE public.test_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Visitors can post scores" ON public.test_scores;
CREATE POLICY "Visitors can post scores"
ON public.test_scores FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Aggregate read: returns count / average / best / your-percentile-in-test
CREATE OR REPLACE FUNCTION public.test_score_stats(_test_id uuid, _marks integer DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'count',   COUNT(*),
    'avg',     COALESCE(ROUND(AVG(marks)), 0),
    'best',    COALESCE(MAX(marks), 0),
    'beaten',  CASE WHEN _marks IS NULL OR COUNT(*) = 0 THEN NULL
                    ELSE ROUND(100.0 * COUNT(*) FILTER (WHERE marks < _marks) / COUNT(*)) END
  ) INTO result
  FROM public.test_scores
  WHERE test_id = _test_id;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.test_score_stats(uuid, integer) TO anon, authenticated;
