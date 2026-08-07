DROP POLICY IF EXISTS "Visitors can upload public test PDFs" ON storage.objects;

CREATE POLICY "Visitors can upload public test files"
ON storage.objects FOR INSERT TO anon, authenticated
WITH CHECK (
  bucket_id = 'public-tests'
  AND (storage.foldername(name))[1] IS NOT NULL
  AND lower(storage.extension(name)) IN ('pdf','jpg','jpeg','png','webp')
);

CREATE POLICY "Visitors can replace public test files"
ON storage.objects FOR UPDATE TO anon, authenticated
USING (bucket_id = 'public-tests')
WITH CHECK (
  bucket_id = 'public-tests'
  AND (storage.foldername(name))[1] IS NOT NULL
  AND lower(storage.extension(name)) IN ('pdf','jpg','jpeg','png','webp')
);