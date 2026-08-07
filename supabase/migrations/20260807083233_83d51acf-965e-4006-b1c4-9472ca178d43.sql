ALTER TABLE public.public_tests
  ADD COLUMN IF NOT EXISTS exam_year integer,
  ADD COLUMN IF NOT EXISTS difficulty text NOT NULL DEFAULT 'Moderate',
  ADD COLUMN IF NOT EXISTS test_type text NOT NULL DEFAULT 'Full Syllabus',
  ADD COLUMN IF NOT EXISTS chapters text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS subject_chapters jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS attempts_count integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.register_test_attempt(_test_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v integer;
BEGIN
  UPDATE public.public_tests
     SET attempts_count = attempts_count + 1
   WHERE id = _test_id AND is_published = true
  RETURNING attempts_count INTO v;
  RETURN COALESCE(v, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_test_attempt(uuid) TO anon, authenticated;