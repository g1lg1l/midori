-- Lets the master list and remove a project's images, so deleting a project frees its storage.
-- (Viewing images needs no policy: the bucket is public.)
create policy "members list project images" on storage.objects for select to authenticated
  using (bucket_id = 'images' and public.is_member(((storage.foldername(name))[1])::uuid));

create policy "master deletes project images" on storage.objects for delete to authenticated
  using (bucket_id = 'images' and public.is_master(((storage.foldername(name))[1])::uuid));
