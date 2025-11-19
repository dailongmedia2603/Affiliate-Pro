// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const HIGGSFIELD_TOKEN_URL = 'https://api.beautyapp.work/gettoken';

async function getHiggsfieldToken(cookie, clerk_active_context) {
  const tokenResponse = await fetch(HIGGSFIELD_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cookie, clerk_active_context }),
  });
  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    throw new Error(`Lỗi khi lấy token từ Higgsfield: ${tokenResponse.status} - ${errorText}`);
  }
  const tokenData = await tokenResponse.json();
  if (!tokenData || !tokenData.jwt) {
    throw new Error('Phản hồi từ Higgsfield không chứa token (jwt). Điều này có thể do Cookie hoặc Clerk Context không hợp lệ hoặc đã hết hạn.');
  }
  return tokenData.jwt;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) throw new Error(userError?.message || "Không thể xác thực người dùng.");
    
    const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: settings, error: settingsError } = await supabaseAdmin
      .from('user_settings')
      .select('higgsfield_cookie, higgsfield_clerk_context')
      .eq('id', user.id)
      .single();

    if (settingsError || !settings || !settings.higgsfield_cookie || !settings.higgsfield_clerk_context) {
      throw new Error(`Không tìm thấy thông tin xác thực Higgsfield cho người dùng. Vui lòng kiểm tra lại Cài đặt.`);
    }
    const { higgsfield_cookie, higgsfield_clerk_context } = settings;
    
    const { action, ...payload } = await req.json();

    switch (action) {
      case 'test_connection': {
        await getHiggsfieldToken(higgsfield_cookie, higgsfield_clerk_context);
        return new Response(JSON.stringify({ success: true, message: 'Kết nối thành công!' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      // NOTE: generate_video logic has been moved to its own dedicated worker function: automation-worker-video
      default:
        throw new Error(`Hành động không hợp lệ hoặc không được hỗ trợ trong function này: ${action}`);
    }
  } catch (error) {
    console.error('!!! [LỖI] Đã xảy ra lỗi trong Edge Function (higgsfield-python-proxy):', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
});