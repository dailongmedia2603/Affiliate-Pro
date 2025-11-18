import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, Loader2 } from 'lucide-react';
import { showError } from '@/utils/toast';
import ImageTaskItem from './ImageTaskItem';
import { Dialog, DialogContent } from "@/components/ui/dialog";

const ImageTaskHistory = ({ model, refreshTrigger }) => {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from('higgsfield_generation_logs')
      .select('*')
      .eq('user_id', user.id)
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

  const checkTasksStatus = useCallback(async (tasksToCheck) => {
    let needsRefetch = false;
    for (const task of tasksToCheck) {
      try {
        const { data, error } = await supabase.functions.invoke('generate-image', {
          body: {
            action: 'get_task_status',
            taskId: task.api_task_id,
            logId: task.id,
          },
        });
        if (error) throw error;
        if (data.status && data.status !== 'processing') {
            needsRefetch = true;
        }
      } catch (e) {
        console.error(`Lỗi kiểm tra tác vụ ${task.id}:`, e);
      }
    }
    if (needsRefetch) {
        fetchTasks();
    }
  }, [fetchTasks]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks, refreshTrigger]);

  useEffect(() => {
    const processingTasks = tasks.filter(t => t.status === 'processing' && t.api_task_id);

    if (processingTasks.length > 0) {
      if (!pollingIntervalRef.current) {
        pollingIntervalRef.current = setInterval(() => {
          checkTasksStatus(processingTasks);
        }, 5000);
      }
    } else {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    }

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [tasks, checkTasksStatus]);

  return (
    <>
      <Card>
        <CardHeader className="flex-row justify-between items-center">
          <CardTitle>Lịch sử tạo</CardTitle>
          <Button variant="ghost" size="icon" onClick={fetchTasks} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </CardHeader>
        <CardContent>
          {loading && tasks.length === 0 ? (
            <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-orange-500" /></div>
          ) : tasks.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {tasks.map(task => <ImageTaskItem key={task.id} task={task} onTaskDeleted={fetchTasks} onImageClick={setSelectedImage} />)}
            </div>
          ) : (
            <p className="text-center text-gray-500 pt-8">Chưa có tác vụ nào cho model này.</p>
          )}
        </CardContent>
      </Card>
      <Dialog open={!!selectedImage} onOpenChange={(isOpen) => !isOpen && setSelectedImage(null)}>
        <DialogContent className="max-w-5xl w-full h-[90vh] p-4 bg-transparent border-0">
          <img src={selectedImage || ''} alt="Enlarged task result" className="w-full h-full object-contain" />
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ImageTaskHistory;