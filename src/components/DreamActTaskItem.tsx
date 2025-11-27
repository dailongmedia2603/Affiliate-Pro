import React from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, XCircle, Trash2, Download } from 'lucide-react';
import { showError, showSuccess } from '@/utils/toast';

const DreamActTaskItem = ({ task, onTaskDeleted }) => {

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
        return <Badge variant="outline" className="text-blue-600 border-blue-300"><Loader2 className="w-3 h-3 mr-1 animate-spin" />{task.status.replace(/_/g, ' ')}</Badge>;
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