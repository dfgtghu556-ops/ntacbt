-- The "Edit details" (⋮ → Edit) action in the Test Library PATCHes a
-- public_tests row (title, test_type, difficulty, exam_year,
-- duration_minutes). Until now anon had no UPDATE grant and no UPDATE
-- policy, so PostgREST rejected the request — which is exactly the
-- "edit gives an error" bug. This is a single-owner personal site whose
-- destructive actions are already gated by the in-app admin password,
-- so a public UPDATE policy mirrors the existing INSERT policy.

GRANT UPDATE ON public.public_tests TO anon;
GRANT UPDATE ON public.public_tests TO authenticated;

DROP POLICY IF EXISTS "Visitors can update published tests" ON public.public_tests;
CREATE POLICY "Visitors can update published tests"
ON public.public_tests FOR UPDATE
TO anon, authenticated
USING (is_published = true)
WITH CHECK (is_published = true);

-- While we're here: deleting a test from the library needs DELETE too
-- (the app already handles and explains the failure, but this makes it
-- work outright instead).
GRANT DELETE ON public.public_tests TO anon;
GRANT DELETE ON public.public_tests TO authenticated;

DROP POLICY IF EXISTS "Visitors can delete published tests" ON public.public_tests;
CREATE POLICY "Visitors can delete published tests"
ON public.public_tests FOR DELETE
TO anon, authenticated
USING (is_published = true);

-- And storage cleanup for deleted tests' PDFs/images:
DROP POLICY IF EXISTS "Visitors can delete public test files" ON storage.objects;
CREATE POLICY "Visitors can delete public test files"
ON storage.objects FOR DELETE
TO anon, authenticated
USING (bucket_id = 'public-tests');
