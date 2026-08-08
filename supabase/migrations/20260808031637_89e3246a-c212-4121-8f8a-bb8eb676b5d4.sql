CREATE TABLE public.planner_imports (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL DEFAULT 'Eklavya Test Planner',
  rows jsonb NOT NULL DEFAULT '[]'::jsonb,
  row_count integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.planner_imports TO anon;
GRANT SELECT, INSERT ON public.planner_imports TO authenticated;
GRANT ALL ON public.planner_imports TO service_role;

ALTER TABLE public.planner_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Planner is publicly readable"
  ON public.planner_imports FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

CREATE POLICY "Visitors can publish a planner"
  ON public.planner_imports FOR INSERT
  TO anon, authenticated
  WITH CHECK (is_active = true AND row_count > 0);

CREATE TRIGGER set_planner_imports_updated_at
  BEFORE UPDATE ON public.planner_imports
  FOR EACH ROW EXECUTE FUNCTION public.set_public_tests_updated_at();