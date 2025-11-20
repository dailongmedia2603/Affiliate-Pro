-- Add column to store Rendi API key
ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS rendi_api_key TEXT;

-- Create a new table to track Rendi tasks
CREATE TABLE IF NOT EXISTS public.rendi_tasks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    rendi_command_id UUID,
    status TEXT NOT NULL DEFAULT 'QUEUED',
    output_files JSONB,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.rendi_tasks ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
DROP POLICY IF EXISTS "Users can manage their own rendi tasks" ON public.rendi_tasks;
CREATE POLICY "Users can manage their own rendi tasks" ON public.rendi_tasks
    FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Create a trigger to update the 'updated_at' column
CREATE OR REPLACE TRIGGER on_rendi_tasks_update
    BEFORE UPDATE ON public.rendi_tasks
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();