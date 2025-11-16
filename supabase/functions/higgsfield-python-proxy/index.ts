// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// URL để lấy token từ API
const HIGGSFIELD_TOKEN_URL = 'https://api.beautyapp.work/gettoken';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Xác thực người dùng qua Supabase
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError) throw userError

    const { action } = await req.json()

    // 2. Lấy credentials từ bảng user_settings
    const { data: settings, error: settingsError } = await supabaseClient
      .from('user_settings')
      .select('higgsfield_cookie, higgsfield_clerk_context')
      .eq('id', user.id)
      .single()

    if (settingsError || !settings || !settings.higgsfield_cookie || !settings.higgsfield_clerk_context) {
      throw new Error('Không tìm thấy thông tin xác thực Higgsfield. Vui lòng kiểm tra lại cài đặt của bạn.')
    }

    const { higgsfield_cookie, higgsfield_clerk_context } = settings;

    switch (action) {
      case 'test_connection': {
        // 3. Lấy token tạm thời từ API
        const tokenResponse = await fetch(HIGGSFIELD_TOKEN_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            cookie: higgsfield_cookie,
            clerk_active_context: higgsfield_clerk_context,
          }),
        });

        if (!tokenResponse.ok) {
          const errorText = await tokenResponse.text();
          throw new Error(`Lỗi khi lấy token từ Higgsfield: ${tokenResponse.status} - ${errorText}`);
        }

        const tokenData = await tokenResponse.json();
        if (!tokenData.jwt) {
          throw new Error('Phản hồi từ Higgsfield không chứa token (jwt).');
        }

        return new Response(JSON.stringify({ success: true, message: 'Kết nối thành công!' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Thêm các case khác cho image/video generation ở đây trong tương lai
      // case 'generate_image': { ... }
      // case 'generate_video': { ... }

      default:
        throw new Error(`Hành động không hợp lệ: ${action}`)
    }
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})