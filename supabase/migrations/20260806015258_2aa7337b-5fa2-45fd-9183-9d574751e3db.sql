CREATE TABLE public.public_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id text NOT NULL UNIQUE DEFAULT ('JEE-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  share_slug text NOT NULL UNIQUE DEFAULT lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  physics_pdf_path text NOT NULL,
  chemistry_pdf_path text NOT NULL,
  mathematics_pdf_path text NOT NULL,
  parsed_test jsonb NOT NULL,
  question_count integer NOT NULL DEFAULT 75 CHECK (question_count BETWEEN 1 AND 150),
  duration_minutes integer NOT NULL DEFAULT 180 CHECK (duration_minutes BETWEEN 1 AND 360),
  is_published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.public_tests TO anon;
GRANT SELECT, INSERT ON public.public_tests TO authenticated;
GRANT ALL ON public.public_tests TO service_role;
ALTER TABLE public.public_tests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Published tests are publicly readable"
ON public.public_tests FOR SELECT TO anon, authenticated
USING (is_published = true);
CREATE POLICY "Visitors can publish valid tests"
ON public.public_tests FOR INSERT TO anon, authenticated
WITH CHECK (is_published = true);

CREATE OR REPLACE FUNCTION public.set_public_tests_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER set_public_tests_updated_at
BEFORE UPDATE ON public.public_tests
FOR EACH ROW EXECUTE FUNCTION public.set_public_tests_updated_at();

CREATE POLICY "Public test files are readable"
ON storage.objects FOR SELECT TO anon, authenticated
USING (bucket_id = 'public-tests');
CREATE POLICY "Visitors can upload public test PDFs"
ON storage.objects FOR INSERT TO anon, authenticated
WITH CHECK (
  bucket_id = 'public-tests'
  AND lower(storage.extension(name)) = 'pdf'
  AND (storage.foldername(name))[1] IS NOT NULL
);

ALTER PUBLICATION supabase_realtime ADD TABLE public.public_tests;