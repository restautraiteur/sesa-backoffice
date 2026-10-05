CREATE POLICY "admins upload plats" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'plats' AND public.is_admin());
CREATE POLICY "admins update plats" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'plats' AND public.is_admin()) WITH CHECK (bucket_id = 'plats' AND public.is_admin());
CREATE POLICY "admins delete plats" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'plats' AND public.is_admin());
CREATE POLICY "read plats" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'plats');