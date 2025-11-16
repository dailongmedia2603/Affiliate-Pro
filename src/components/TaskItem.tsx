import React from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, XCircle, Trash2, AlertTriangle } from 'lucide-react';
import { showError, showSuccess } from '@/utils/toast';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import CustomAudioPlayer from './CustomAudioPlayer';

const TaskItem = ({ task, apiKey, onTaskDeleted }) => {
  const handleDelete = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('proxy-voice-api', {
        body: { path: 'v1/task/delete', token: apiKey, method: 'POST', body: { task_ids: [task.id] } }
      });
      if (error) throw error;
      if (data.success) {
        showSuccess('Đã xóa tác vụ.');
        onTaskDeleted();
      } else {
        throw new Error(data.error || 'Xóa tác vụ thất bại.');
      }
    } catch (error) {
      showError(`Lỗi xóa tác vụ: ${error.message}`);
    }
  };

  const renderStatus = () => {
    switch (task.status) {
      case 'doing':
        return <Badge variant="outline" className="text-blue-600 border-blue-300"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Đang xử lý</Badge>;
      case 'done':
        return <Badge variant="outline" className="text-green-600 border-green-300"><CheckCircle2 className="w-3 h-3 mr-1" />Hoàn thành</Badge>;
      case 'error':
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Lỗi</Badge>
              </TooltipTrigger>
              <TooltipContent><p>{task.error_message || 'Lỗi không xác định'}</p></TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      default:
        return <Badge variant="secondary"><AlertTriangle className="w-3 h-3 mr-1" />{task.status}</Badge>;
    }
  };

  return (
    <div className="border rounded-lg p-3 space-y-2 bg-gray-50">
      <div className="flex justify-between items-start">
        <div className="flex-1 mr-2">
          {renderStatus()}
          <p className="text-xs text-gray-500 mt-1">ID: {task.id}</p>
        </div>
        <Button variant="ghost" size="icon" className="w-7 h-7 text-red-500" onClick={handleDelete}><Trash2 className="w-4 h-4" /></Button>
      </div>
      {task.status === 'done' && task.metadata?.audio_url && (
        <CustomAudioPlayer src={task.metadata.audio_url} />
      )}
      <div className="flex justify-between items-center text-xs text-gray-500">
        <span>{new Date(task.created_at).toLocaleString()}</span>
        <span>Cost: {task.credit_cost || 0} credits</span>
      </div>
    </div>
  );
};

export default TaskItem;