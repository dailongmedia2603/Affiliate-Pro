import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, Loader2 } from 'lucide-react';
import { showError } from '@/utils/toast';
import ImageTaskItem from './ImageTaskItem';

const ImageTaskHistory = ({ model }) => {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('image_tasks')
      .select('*')
      .eq('model', model)
      .order('created_at', { ascending: false })
      .limit(20);
    
    if (error) {
      showError(`Không thể tải lịch sử cho model ${model}.`);
    } else {
      setTasks(data || []);
    }
    setLoading(false);
  }, [model]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  useEffect(() => {
    const pendingTasks = tasks.filter(t => t.status === 'pending' || t.status === 'processing');
    if (pendingTasks.length === 0) return;

    const interval = setInterval(async () => {
      let needsUpdate = false;
      for (const task of pendingTasks) {
        try {
          const { data, error } = await supabase.functions.invoke('higgsfield-python-proxy', {
            body: { action: 'get_task_status', taskId: task.higgsfield_task_id }
          });

          if (error || (data && data.error)) {
            console.error(`Lỗi kiểm tra tác vụ ${task.id}:`, error || data.error);
            continue;
          }
          
          const apiStatus = data?.job_sets?.[0]?.status;
          if (apiStatus && apiStatus !== task.status) {
            const resultUrl = data?.job_sets?.[0]?.jobs?.[0]?.result?.images?.[0]?.url;
            const errorMessage = data?.job_sets?.[0]?.jobs?.[0]?.error;
            
            await supabase.from('image_tasks').update({ 
              status: apiStatus,
              result_url: resultUrl,
              error_message: errorMessage,
            }).eq('id', task.id);
            needsUpdate = true;
          }
        } catch (e) {
          console.error(`Lỗi nghiêm trọng khi kiểm tra tác vụ ${task.id}:`, e);
        }
      }
      if (needsUpdate) fetchTasks();
    }, 10000);

    return () => clearInterval(interval);
  }, [tasks, fetchTasks]);

  return (
    <Card className="flex flex-col h-full min-h-[600px]">
      <CardHeader className="flex-row justify-between items-center">
        <CardTitle>Lịch sử tạo</CardTitle>
        <Button variant="ghost" size="icon" onClick={fetchTasks} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto space-y-3">
        {loading && tasks.length === 0 ? (
          <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-orange-500" /></div>
        ) : tasks.length > 0 ? (
          tasks.map(task => <ImageTaskItem key={task.id} task={task} onTaskDeleted={fetchTasks} />)
        ) : (
          <p className="text-center text-gray-500 pt-8">Chưa có tác vụ nào cho model này.</p>
        )}
      </CardContent>
    </Card>
  );
};

export default ImageTaskHistory;