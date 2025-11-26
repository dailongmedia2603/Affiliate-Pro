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
    if (!config.videoScriptId) {
      throw new Error("Chưa chọn kịch bản video trong cấu hình automation.");
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
    await logToDb(supabaseAdmin, runId, 'Đã tạo phiên chạy automation. Bắt đầu xếp hàng các công việc.');

    // 4. --- QUEUE ALL TASKS ---
    const { data: subProducts, error: subProductsError } = await supabaseAdmin
      .from('sub_products')
      .select('id, name, description, image_url')
      .eq('product_id', channel.product_id)
      .eq('is_active', true)
      .order('created_at', { ascending: true });
    if (subProductsError) throw subProductsError;
    if (!subProducts || subProducts.length === 0) throw new Error("Không tìm thấy sản phẩm con nào đang hoạt động cho sản phẩm của kênh này.");
    
    await logToDb(supabaseAdmin, runId, `Tìm thấy ${subProducts.length} sản phẩm con đang hoạt động. Bắt đầu tạo prompt và xếp hàng các bước tạo ảnh.`);

    await logToDb(supabaseAdmin, runId, `Đang tải kịch bản video từ thư viện (ID: ${config.videoScriptId}).`);
    const { data: videoScriptData, error: videoScriptError } = await supabaseAdmin
      .from('prompts')
      .select('content')
      .eq('id', config.videoScriptId)
      .single();

    if (videoScriptError || !videoScriptData) {
      throw new Error(`Không thể tải kịch bản video: ${videoScriptError?.message}`);
    }

    let promptPairs = [];
    try {
      promptPairs = JSON.parse(videoScriptData.content);
      if (!Array.isArray(promptPairs) || promptPairs.length === 0) {
        throw new Error("Nội dung kịch bản không phải là một mảng hợp lệ hoặc rỗng.");
      }
    } catch (e) {
      throw new Error(`Lỗi phân tích kịch bản video: ${e.message}`);
    }
    await logToDb(supabaseAdmin, runId, `Tải thành công kịch bản với ${promptPairs.length} cặp prompt.`);

    let totalStepsCreated = 0;
    for (const subProduct of subProducts) {
      await logToDb(supabaseAdmin, runId, `Đang xử lý sản phẩm con: "${subProduct.name}".`);

      const imageUrls = [channel.character_image_url, subProduct.image_url].filter(Boolean);
      const stepsToInsert = [];

      for (const [index, pair] of promptPairs.entries()) {
        if (!pair.image_prompt || !pair.video_prompt) {
          await logToDb(supabaseAdmin, runId, `Cặp prompt #${index + 1} không hợp lệ (thiếu prompt ảnh hoặc video). Bỏ qua.`, 'WARN');
          continue;
        }

        const templateData = {
          product_name: subProduct.name,
          product_description: subProduct.description,
        };

        const finalImagePrompt = replacePlaceholders(pair.image_prompt, templateData);
        const finalVideoPrompt = replacePlaceholders(pair.video_prompt, templateData);

        const inputData = {
          prompt: finalImagePrompt,
          video_prompt: finalVideoPrompt,
          model: 'banana',
          aspect_ratio: '9:16',
          image_urls: imageUrls,
          sequence_number: index
        };
        stepsToInsert.push({
            run_id: run.id,
            sub_product_id: subProduct.id,
            step_type: 'generate_image',
            status: 'pending',
            input_data: inputData
        });
      }

      if (stepsToInsert.length > 0) {
        const { error: stepInsertError } = await supabaseAdmin.from('automation_run_steps').insert(stepsToInsert);
        if (stepInsertError) {
            await logToDb(supabaseAdmin, runId, `Lỗi khi lưu các bước tạo ảnh cho sản phẩm "${subProduct.name}": ${stepInsertError.message}`, 'ERROR');
            continue;
        }
        totalStepsCreated += stepsToInsert.length;
        await logToDb(supabaseAdmin, runId, `Đã xếp hàng ${stepsToInsert.length} bước tạo ảnh cho sản phẩm "${subProduct.name}".`);
      }
    }

    // 5. --- FINALIZE RUN START ---
    if (totalStepsCreated === 0) {
        throw new Error("Không có bước nào được tạo. Vui lòng kiểm tra lại cấu hình và kịch bản video.");
    }

    await supabaseAdmin.from('automation_runs').update({ status: 'running' }).eq('id', run.id);
    await logToDb(supabaseAdmin, runId, `Hoàn tất xếp hàng. Tổng cộng ${totalStepsCreated} bước đã được đưa vào hàng đợi. Phiên chạy chuyển sang trạng thái "Đang chạy" và chờ người điều phối.`, 'SUCCESS');

    return new Response(JSON.stringify({ success: true, message: `Automation queued successfully with ${totalStepsCreated} image generation steps.`, runId: run.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    if (runId) {
      await logToDb(supabaseAdmin, runId, `Lỗi nghiêm trọng khi khởi tạo phiên chạy: ${error.message}`, 'ERROR');
      await supabaseAdmin.from('automation_runs').update({ status: 'failed', finished_at: new Date().toISOString() }).eq('id', runId);
    }
    console.error('Error in run-automation function:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});