-- Thêm cột user_id để xác định chủ sở hữu của log
ALTER TABLE public.dream_act_logs ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Cho phép cột task_id có thể là NULL (cho các log không thuộc tác vụ nào)
ALTER TABLE public.dream_act_logs ALTER COLUMN task_id DROP NOT NULL;

-- Xóa chính sách truy cập cũ
DROP POLICY IF EXISTS "Users can view their own dream act logs" ON public.dream_act_logs;

-- Tạo chính sách truy cập mới, linh hoạt hơn
CREATE POLICY "Users can view their own dream act logs"
ON public.dream_act_logs
FOR SELECT
TO authenticated
USING (
  -- Cho phép xem nếu log được gắn trực tiếp với user_id của họ
  (auth.uid() = user_id)
  -- HOẶC cho phép xem nếu log được gắn với một tác vụ mà họ sở hữu (giữ nguyên logic cũ)
  OR (EXISTS (
    SELECT 1
    FROM dream_act_tasks
    WHERE dream_act_tasks.id = dream_act_logs.task_id AND dream_act_tasks.user_id = auth.uid()
  ))
);