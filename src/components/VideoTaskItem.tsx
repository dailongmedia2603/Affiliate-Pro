import React from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, XCircle, Trash2, AlertTriangle, Download, Clock } from 'lucide-react';
import { showError, showSuccess } from '@/utils/toast';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const VideoTaskItem = ({ task, onTaskDeleted }) => {
  const handleDelete = async () => {
    const { error } = await supabase.from('video_tasks').delete().eq('id', task.id);
    if (error) {
      showError('Xóa tác vụ thất bại.');
    } else {
      showSuccess('Đã xóa tác vụ.');
      onTaskDeleted();
    }
  };

  const renderStatus = () => {
    switch (task.status) {
      case 'queued':
        return <Badge variant="outline" className="text-gray-600 border-gray-300"><Clock className="w-3 h-3 mr-1" />Đang chờ</Badge>;
      case 'pending':
      case 'processing':
        return <Badge variant="outline" className="text-blue-600 border-blue-300"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Đang xử lý</Badge>;
      case 'completed':
        return <Badge variant="outline" className="text-green-600 border-green-300"><CheckCircle2 className="w-3 h-3 mr-1" />Hoàn thành</Badge>;
      case 'failed':
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
        <div className="flex-1 mr-2 space-y-1">
          {renderStatus()}
          <p className="text-sm font-medium" title={task.prompt}>{task.prompt}</p>
          <p className="text-xs text-gray-500">Model: {task.model}</p>
        </div>
        <Button variant="ghost" size="icon" className="w-7 h-7 text-red-500" onClick={handleDelete}><Trash2 className="w-4 h-4" /></Button>
      </div>
      {task.status === 'completed' && task.result_url && (
        <div className="relative aspect-video bg-black rounded-md overflow-hidden">
            <video src={task.result_url} controls className="w-full h-full" />
            <a href={task.result_url} download target="_blank" rel="noopener noreferrer">
                <Button size="icon" className="absolute top-2 right-2 w-8 h-8 bg-black/50 hover:bg-black/75">
                    <Download className="w-4 h-4" />
                </Button>
            </a>
        </div>
      )}
      <div className="flex justify-between items-center text-xs text-gray-500 pt-1">
        <span>{new Date(task.created_at).toLocaleString()}</span>
      </div>
    </div>
  );
};

export default VideoTaskItem;