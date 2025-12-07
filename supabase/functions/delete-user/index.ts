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

    // Check if the requesting user is the super admin
    if (requestingUser.email !== SUPER_ADMIN_EMAIL) {
      throw new Error("Permission denied. Only the super admin can delete users.");
    }

    const { userId } = await req.json();
    if (!userId) {
      throw new Error("User ID is required.");
    }

    if (userId === requestingUser.id) {
      throw new Error("You cannot delete your own account.");
    }

    // Create the admin client to delete the user
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data, error } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (error) {
      throw error;
    }

    return new Response(JSON.stringify({ message: "User deleted successfully", data }), {
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