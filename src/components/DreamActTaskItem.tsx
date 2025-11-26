import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, XCircle, Trash2, Download } from 'lucide-react';
import { showError, showSuccess } from '@/utils/toast';

const DreamActTaskItem = ({ initialTask, onTaskDeleted }) => {
  const [task, setTask] = useState(initialTask);
  const pollingInterval = useRef<number | null>(null);

  const pollStatus = async (currentTask) => {
    if (!currentTask.animate_id) return;

    try {
      const { data, error } = await supabase.functions.invoke('proxy-dream-act-api', {
        body: { action: 'fetch_status', payload: { animateId: currentTask.animate_id } }
      });
      if (error) throw error;
      if (data.code !== 200) throw new Error(data.message);

      const creation = data.data.find(d => d.animateId === currentTask.animate_id);
      if (creation && creation.status === 2) { // Status 2 seems to be 'completed'
        const { data: downloadData, error: downloadError } = await supabase.functions.invoke('proxy-dream-act-api', {
            body: { action: 'download_video', payload: { workId: creation.id } }
        });
        if (downloadError) throw downloadError;
        if (downloadData.code !== 200) throw new Error(downloadData.message);

        const finalUrl = downloadData.data.url;
        const { data: updatedTask, error: updateError } = await supabase
          .from('dream_act_tasks')
          .update({ status: 'completed', result_url: finalUrl, work_id: creation.id })
          .eq('id', currentTask.id)
          .select()
          .single();
        if (updateError) throw updateError;
        setTask(updatedTask);
        if (pollingInterval.current) clearInterval(pollingInterval.current);
      } else if (creation && creation.status === 3) { // Status 3 seems to be 'failed'
        const { data: updatedTask, error: updateError } = await supabase
          .from('dream_act_tasks')
          .update({ status: 'failed', error_message: 'Tác vụ thất bại trên API Dream ACT.' })
          .eq('id', currentTask.id)
          .select()
          .single();
        if (updateError) throw updateError;
        setTask(updatedTask);
        if (pollingInterval.current) clearInterval(pollingInterval.current);
      }
    } catch (err) {
      console.error('Polling error:', err);
      // Stop polling on error to avoid spamming
      if (pollingInterval.current) clearInterval(pollingInterval.current);
    }
  };

  useEffect(() => {
    if (task.status === 'animating' && task.animate_id) {
      pollingInterval.current = window.setInterval(() => pollStatus(task), 10000);
    }
    return () => {
      if (pollingInterval.current) clearInterval(pollingInterval.current);
    };
  }, [task]);

  const handleDelete = async () => {
    const { error } = await supabase.from('dream_act_tasks').delete().eq('id', task.id);
    if (error) {
      showError('Xóa tác vụ thất bại.');
    } else {
      showSuccess('Đã xóa tác vụ.');
      onTaskDeleted();
    }
  };

  const renderStatus = () => {
    switch (task.status) {
      case 'completed':
        return <Badge variant="outline" className="text-green-600 border-green-300"><CheckCircle2 className="w-3 h-3 mr-1" />Hoàn thành</Badge>;
      case 'failed':
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Thất bại</Badge>;
      case 'pending':
      case 'uploading_image':
      case 'uploading_video':
      case 'animating':
      default:
        return <Badge variant="outline" className="text-blue-600 border-blue-300"><Loader2 className="w-3 h-3 mr-1 animate-spin" />{task.status.replace('_', ' ')}</Badge>;
    }
  };

  return (
    <div className="border rounded-lg p-3 space-y-2 bg-gray-50">
      <div className="flex justify-between items-start">
        <div className="flex-1 mr-2 space-y-1">
          {renderStatus()}
          <p className="text-xs text-gray-500">Tạo lúc: {new Date(task.created_at).toLocaleString()}</p>
        </div>
        <Button variant="ghost" size="icon" className="w-7 h-7 text-red-500" onClick={handleDelete}><Trash2 className="w-4 h-4" /></Button>
      </div>
      {task.status === 'failed' && task.error_message && (
        <p className="text-xs text-red-600 bg-red-50 p-2 rounded-md">{task.error_message}</p>
      )}
      {task.status === 'completed' && task.result_url ? (
        <div className="relative aspect-video bg-black rounded-md overflow-hidden">
            <video src={task.result_url} controls className="w-full h-full" />
            <a href={task.result_url} download target="_blank" rel="noopener noreferrer">
                <Button size="icon" className="absolute top-2 right-2 w-8 h-8 bg-black/50 hover:bg-black/75">
                    <Download className="w-4 h-4" />
                </Button>
            </a>
        </div>
      ) : (
        <div className="flex gap-2">
            {task.source_image_url && <img src={task.source_image_url} className="w-1/2 aspect-square object-cover rounded-md bg-gray-200" alt="Source" />}
            {task.driving_video_url && <video src={task.driving_video_url} className="w-1/2 aspect-square object-cover rounded-md bg-gray-800" muted loop playsInline />}
        </div>
      )}
    </div>
  );
};

export default DreamActTaskItem;