-- Add is_public column to prompts table
ALTER TABLE public.prompts
ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT false;

-- Drop existing SELECT policy to replace it
DROP POLICY "Users can view their own prompts" ON public.prompts;

-- Create new SELECT policy to allow viewing own and public prompts
CREATE POLICY "Users can view their own and public prompts"
ON public.prompts
FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR is_public = true);