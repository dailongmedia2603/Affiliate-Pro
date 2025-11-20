// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const logToDb = async (supabaseAdmin, runId, message, level = 'INFO', stepId = null, metadata = {}) => {
  try {
    await supabaseAdmin.from('automation_run_logs').insert({ run_id: runId, step_id: stepId, message, level, metadata });
  } catch (e) { console.error('Failed to write log to DB:', e.message); }
};

function replacePlaceholders(template, data) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => data[key] || match);
}

serve(async (req) => {
  let runId = null;
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { channelId } = await req.json();
    if (!channelId) throw new Error("Thiếu tham số channelId.");

    const authHeader = req.headers.get('Authorization')!;
    if (!authHeader) {
      throw new Error("Thiếu thông tin xác thực (Authorization header).");
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) throw new Error("Không thể xác thực người dùng.");

    const { data: configData, error: configError } = await supabaseAdmin.from('automation_configs').select('config_data').eq('channel_id', channelId).maybeSingle();
    if (configError) throw new Error(`Lỗi khi kiểm tra cấu hình: ${configError.message}`);
    if (!configData) {
      throw new Error("Kênh này chưa được cấu hình. Vui lòng nhấn nút 'Cấu hình' và lưu lại trước khi chạy.");
    }
    const config = configData.config_data;

    const { data: run, error: runError } = await supabaseAdmin
      .from('automation_runs')
      .insert({ user_id: user.id, channel_id: channelId, status: 'starting' })
      .select()
      .single();
    if (runError) throw runError;
    runId = run.id;
    await logToDb(supabaseAdmin, runId, 'Đã tạo phiên chạy automation thành công.');

    const { data: channelRes, error: channelError } = await supabaseAdmin.from('channels').select('product_id, character_image_url').eq('id', channelId).single();
    await logToDb(supabaseAdmin, runId, 'Đang lấy dữ liệu kênh...');

    if (channelError) throw new Error(`Không tìm thấy kênh: ${channelError.message}`);
    
    const productId = channelRes.product_id;
    const characterImageUrl = channelRes.character_image_url;
    if (!productId) throw new Error("Kênh chưa được liên kết với sản phẩm nào.");
    await logToDb(supabaseAdmin, runId, 'Đã xác thực cấu hình.');

    const { data: subProducts, error: subProductsError } = await supabaseAdmin
      .from('sub_products')
      .select('id, name, description, image_url')
      .eq('product_id', productId);
    if (subProductsError) throw subProductsError;
    if (!subProducts || subProducts.length === 0) throw new Error("Không tìm thấy sản phẩm con nào cho sản phẩm của kênh này.");
    await logToDb(supabaseAdmin, runId, `Tìm thấy ${subProducts.length} sản phẩm con để xử lý.`);

    const stepPromises = subProducts.map(async (subProduct) => {
      const placeholderData = { product_name: subProduct.name, background_context: config.backgroundContext };
      const imagePrompt = replacePlaceholders(config.imagePromptTemplate, placeholderData);
      
      const imageUrls = [];
      if (characterImageUrl) imageUrls.push(characterImageUrl);
      if (subProduct.image_url) imageUrls.push(subProduct.image_url);

      const inputData = { prompt: imagePrompt, model: 'banana', aspect_ratio: '1:1', image_urls: imageUrls };

      const { data: step, error: stepError } = await supabaseAdmin
        .from('automation_run_steps')
        .insert({ run_id: run.id, sub_product_id: subProduct.id, step_type: 'generate_image', status: 'pending', input_data: inputData })
        .select('id')
        .single();
      if (stepError) throw stepError;
      await logToDb(supabaseAdmin, runId, `Đã tạo bước 'Tạo Ảnh' cho sản phẩm con: ${subProduct.name}`, 'INFO', step.id);

      supabaseAdmin.functions.invoke('generate-image', {
        body: JSON.stringify({ action: 'generate_image', stepId: step.id, ...inputData }),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader
        }
      }).then(({ error }) => {
        if (error) {
          console.error(`Lỗi khi gọi function generate-image cho bước ${step.id}:`, error);
          logToDb(supabaseAdmin, runId, `LỖI NGHIÊM TRỌNG: Không thể gọi function 'generate-image'. Lỗi: ${error.message}`, 'ERROR', step.id);
        } else {
          logToDb(supabaseAdmin, runId, `Đã gọi function 'generate-image' cho bước ${step.id}.`, 'INFO', step.id);
        }
      });
    });

    await Promise.all(stepPromises);

    await supabaseAdmin.from('automation_runs').update({ status: 'running' }).eq('id', run.id);
    await logToDb(supabaseAdmin, runId, 'Đã kích hoạt tất cả các bước ban đầu. Phiên chạy chuyển sang trạng thái "Đang chạy".', 'SUCCESS');

    return new Response(JSON.stringify({ success: true, message: 'Automation started successfully.', runId: run.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    if (runId) {
      await logToDb(supabaseAdmin, runId, `Lỗi nghiêm trọng trong run-automation: ${error.message}`, 'ERROR');
      await supabaseAdmin.from('automation_runs').update({ status: 'failed', finished_at: new Date().toISOString() }).eq('id', runId);
    }
    console.error('Error in run-automation function:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});