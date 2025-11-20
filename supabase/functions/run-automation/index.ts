// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// --- Helper Functions ---

const logToDb = async (supabaseAdmin, runId, message, level = 'INFO', stepId = null, metadata = {}) => {
  try {
    await supabaseAdmin.from('automation_run_logs').insert({ run_id: runId, step_id: stepId, message, level, metadata });
  } catch (e) { console.error('Failed to write log to DB:', e.message); }
};

function replacePlaceholders(template, data) {
  if (!template) return '';
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return data[key] !== undefined && data[key] !== null ? data[key] : match;
  });
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- Main Handler ---

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
    // 1. --- AUTHENTICATION & PAYLOAD ---
    const { channelId } = await req.json();
    if (!channelId) throw new Error("Thiếu tham số channelId.");

    const authHeader = req.headers.get('Authorization')!;
    if (!authHeader) throw new Error("Thiếu thông tin xác thực (Authorization header).");

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) throw new Error("Không thể xác thực người dùng.");

    // 2. --- PRE-FLIGHT CHECKS ---
    const { data: existingRun, error: existingRunError } = await supabaseAdmin
      .from('automation_runs')
      .select('id')
      .eq('channel_id', channelId)
      .in('status', ['starting', 'running'])
      .maybeSingle();
    if (existingRunError) throw new Error(`Lỗi khi kiểm tra phiên chạy hiện tại: ${existingRunError.message}`);
    if (existingRun) throw new Error("Một luồng automation cho kênh này đã đang chạy. Vui lòng chờ hoàn tất hoặc dừng lại trước khi bắt đầu một luồng mới.");

    const { data: configData, error: configError } = await supabaseAdmin.from('automation_configs').select('config_data').eq('channel_id', channelId).maybeSingle();
    if (configError) throw new Error(`Lỗi khi tải cấu hình automation: ${configError.message}`);
    if (!configData?.config_data) throw new Error("Kênh này chưa được cấu hình. Vui lòng nhấn nút 'Cấu hình' và lưu lại trước khi chạy.");
    const config = configData.config_data;
    if (!config.imagePromptGenerationTemplate || !config.imageCount) {
      throw new Error("Cấu hình automation không đầy đủ. Thiếu 'Mẫu Prompt cho AI' hoặc 'Số lượng ảnh'.");
    }

    const { data: settings, error: settingsError } = await supabaseAdmin.from('user_settings').select('gemini_api_key, gemini_api_url').eq('id', user.id).single();
    if (settingsError || !settings?.gemini_api_url || !settings?.gemini_api_key) {
      throw new Error("Chưa cấu hình API Gemini trong Cài đặt (thiếu URL hoặc Key).");
    }

    const { data: channel, error: channelError } = await supabaseAdmin.from('channels').select('product_id, character_image_url').eq('id', channelId).single();
    if (channelError || !channel) throw new Error(`Không tìm thấy kênh với ID: ${channelId}. Lỗi: ${channelError?.message}`);
    if (!channel.product_id) throw new Error("Kênh chưa được liên kết với sản phẩm nào.");

    // 3. --- CREATE AUTOMATION RUN ---
    const { data: run, error: runError } = await supabaseAdmin
      .from('automation_runs')
      .insert({ user_id: user.id, channel_id: channelId, status: 'starting' })
      .select()
      .single();
    if (runError) throw runError;
    runId = run.id;
    await logToDb(supabaseAdmin, runId, 'Đã tạo phiên chạy automation thành công.');

    // 4. --- FETCH SUB-PRODUCTS ---
    const { data: subProducts, error: subProductsError } = await supabaseAdmin
      .from('sub_products')
      .select('id, name, description, image_url')
      .eq('product_id', channel.product_id);
    if (subProductsError) throw subProductsError;
    if (!subProducts || subProducts.length === 0) throw new Error("Không tìm thấy sản phẩm con nào cho sản phẩm của kênh này.");
    await logToDb(supabaseAdmin, runId, `Tìm thấy ${subProducts.length} sản phẩm con để xử lý.`);

    // 5. --- MAIN LOOP (per sub-product) ---
    for (const subProduct of subProducts) {
      await logToDb(supabaseAdmin, runId, `Bắt đầu xử lý sản phẩm con: "${subProduct.name}".`);

      const geminiPromptData = {
        product_name: subProduct.name,
        product_description: subProduct.description,
        image_count: config.imageCount
      };
      const geminiPrompt = replacePlaceholders(config.imagePromptGenerationTemplate, geminiPromptData);
      
      await logToDb(supabaseAdmin, runId, `Đang gọi Gemini AI để tạo ${config.imageCount} prompt cho ảnh...`);
      const { data: geminiResponseString, error: geminiError } = await supabaseAdmin.functions.invoke('proxy-gemini-api', {
        body: { apiUrl: settings.gemini_api_url, prompt: geminiPrompt, token: settings.gemini_api_key }
      });

      if (geminiError) throw new Error(`Lỗi gọi function proxy-gemini-api: ${geminiError.message}`);
      
      let geminiResult;
      try {
        geminiResult = JSON.parse(geminiResponseString);
      } catch (e) {
        throw new Error(`Không thể phân tích phản hồi JSON từ Gemini API: ${e.message}. Phản hồi nhận được: ${geminiResponseString}`);
      }

      if (geminiResult.error || !geminiResult.success) {
        throw new Error(`Lỗi tạo prompt ảnh từ AI: ${geminiResult.error || geminiResult.message || 'Lỗi không xác định'}`);
      }
      
      const answerString = geminiResult.answer;
      if (!answerString) throw new Error("Phản hồi từ AI không chứa trường 'answer'.");
      
      await logToDb(supabaseAdmin, runId, 'AI đã trả về dữ liệu. Bắt đầu phân tích...', 'INFO', null, { rawResponse: answerString });

      const promptRegex = /<prompt>(.*?)<\/prompt>/gs;
      const imagePrompts = [];
      let match;
      while ((match = promptRegex.exec(answerString)) !== null) {
          imagePrompts.push(match[1].trim());
      }

      if (imagePrompts.length === 0) {
        await logToDb(supabaseAdmin, runId, `AI không trả về prompt nào có cấu trúc <prompt>...</prompt> cho sản phẩm "${subProduct.name}". Bỏ qua sản phẩm này.`, 'WARN');
        continue;
      }
      await logToDb(supabaseAdmin, runId, `Phân tích thành công. Đã lấy ra ${imagePrompts.length} prompt ảnh.`, 'SUCCESS');

      const imageUrls = [];
      if (channel.character_image_url) imageUrls.push(channel.character_image_url);
      if (subProduct.image_url) imageUrls.push(subProduct.image_url);

      await logToDb(supabaseAdmin, runId, `Đang tạo ${imagePrompts.length} bước tạo ảnh...`);
      
      for (const imagePrompt of imagePrompts) {
        const inputData = { prompt: imagePrompt, model: 'banana', aspect_ratio: '1:1', image_urls: imageUrls };

        const { data: step, error: stepError } = await supabaseAdmin
          .from('automation_run_steps')
          .insert({ run_id: run.id, sub_product_id: subProduct.id, step_type: 'generate_image', status: 'pending', input_data: inputData })
          .select('id')
          .single();
        if (stepError) throw stepError;
        
        await logToDb(supabaseAdmin, runId, `Đã tạo bước 'Tạo Ảnh' cho sản phẩm con: ${subProduct.name}`, 'INFO', step.id);

        supabaseAdmin.functions.invoke('generate-image', {
          body: { action: 'generate_image', stepId: step.id, ...inputData },
          headers: { 'Authorization': authHeader }
        }).catch(err => {
          console.error(`Lỗi khi gọi function generate-image cho bước ${step.id}:`, err);
          logToDb(supabaseAdmin, runId, `LỖI NGHIÊM TRỌNG: Không thể gọi function 'generate-image'. Lỗi: ${err.message}`, 'ERROR', step.id);
        });

        await sleep(2000); // Đợi 2 giây trước khi gửi yêu cầu tiếp theo
      }
    }

    // 6. --- FINALIZE RUN START ---
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