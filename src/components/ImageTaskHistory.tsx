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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from('image_tasks')
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

  useEffect(() => {
    fetchTasks();

    const channel = supabase
      .channel(`image_tasks_changes_for_${model}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'image_tasks' },
        (payload) => {
          // Refetch when any change happens to a task of the current model
          if ((payload.new as any)?.model === model || (payload.old as any)?.model === model) {
            fetchTasks();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchTasks, model]);

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