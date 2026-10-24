CREATE TABLE public.datasets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  file_path text NOT NULL,
  file_type text NOT NULL CHECK (file_type IN ('csv','sqlite','sql')),
  size_bytes bigint NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 20971520),
  source_note text CHECK (source_note IS NULL OR char_length(source_note) <= 500),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.datasets TO anon, authenticated;
GRANT ALL ON public.datasets TO service_role;
ALTER TABLE public.datasets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can list datasets" ON public.datasets FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anyone can add datasets" ON public.datasets FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Anyone can read dataset files" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'datasets');
CREATE POLICY "Anyone can upload dataset files" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'datasets');