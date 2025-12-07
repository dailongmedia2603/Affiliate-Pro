// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPER_ADMIN_EMAIL = 'affpro@dailongmedia.io.vn';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Authenticate the user making the request
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )
    const { data: { user: requestingUser } } = await supabaseClient.auth.getUser()
    if (!requestingUser) {
      throw new Error("User not authenticated to perform this action.");
    }

    const { userId, name } = await req.json();
    if (!userId || !name) {
      throw new Error("User ID and name are required.");
    }

    // Check for permission
    const isSuperAdmin = requestingUser.email === SUPER_ADMIN_EMAIL;
    const isUpdatingSelf = requestingUser.id === userId;

    if (!isSuperAdmin && !isUpdatingSelf) {
      throw new Error("Permission denied. You can only update your own account.");
    }

    // Create the admin client to update the user
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: { user }, error } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      { user_metadata: { name: name } }
    );

    if (error) {
      throw error;
    }

    return new Response(JSON.stringify({ user }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
})