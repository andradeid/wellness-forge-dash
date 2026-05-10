-- Add soft delete column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

-- Index to filter out deleted users efficiently
CREATE INDEX IF NOT EXISTS idx_profiles_deleted_at ON public.profiles(deleted_at);