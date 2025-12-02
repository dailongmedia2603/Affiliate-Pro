import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, XCircle, Trash2, Download, Code, RefreshCw } from 'lucide-react';
import { showError, showSuccess, showLoading, dismissToast } from '@/utils/toast';
import DreamActLogViewer from './DreamActLogViewer';

const DreamActTaskItem = ({ task, onTaskDeleted }) => {
  const [isChecking, setIsChecking] = useState(false);

  const handleDelete = async () => {
    const { error } = await supabase.from('dream_act_tasks').delete().eq('id', task.id);
    if (error) {
      showError('Xóa tác vụ thất bại.');
    } else {
      showSuccess('Đã xóa tác vụ.');
      onTaskDeleted();
    }
  };

  const handleRecheckStatus = async () => {
    if (!task.animate_id) {
      showError("Không thể kiểm tra lại: Tác vụ này đã thất bại trước khi có ID hoạt ảnh.");
      return;
    }
    setIsChecking(true);
    const loadingToast = showLoading('Đang kiểm tra lại trạng thái...');

    try {
      // Step 1: Fetch status
      const { data: statusData, error: statusError } = await supabase.functions.invoke('proxy-dream-act-api', {
        body: {
          action: 'fetch_status',
          payload: { animateId: task.animate_id },
          userId: task.user_id,
          taskId: task.id
        }
      });

      if (statusError) throw statusError;
      if (statusData.error) throw new Error(statusData.error);
      if (statusData.resultCode !== 0) throw new Error(statusData.message || 'Lỗi khi kiểm tra trạng thái.');

      const creation = statusData.data?.list?.find(d => d.animateId === task.animate_id);

      if (creation) {
        if (creation.status === 2) { // Completed
          dismissToast(loadingToast);
          showSuccess('Tác vụ đã hoàn thành! Đang tải video...');
          
          // Step 2: Download video
          const { data: downloadData, error: downloadError } = await supabase.functions.invoke('proxy-dream-act-api', {
            body: {
              action: 'download_video',
              payload: { workId: creation.id },
              userId: task.user_id,
              taskId: task.id
            }
          });

          if (downloadError) throw downloadError;
          if (downloadData.error) throw new Error(downloadData.error);
          if (downloadData.resultCode !== 0) throw new Error(downloadData.message || 'Lỗi khi tải video.');

          const finalUrl = downloadData.data.url;
          if (!finalUrl) {
            throw new Error('Tác vụ thành công nhưng không tìm thấy URL video cuối cùng.');
          }

          // Step 3: Update DB
          await supabase.from('dream_act_tasks').update({ status: 'completed', result_url: finalUrl, work_id: creation.id }).eq('id', task.id);
          showSuccess('Đã cập nhật tác vụ thành công!');
          // Realtime will update the UI, no need to call onTaskDeleted()

        } else if (creation.status === 3) { // Failed
          await supabase.from('dream_act_tasks').update({ status: 'failed', error_message: 'Tác vụ thất bại trên API Dream ACT (kiểm tra lại).' }).eq('id', task.id);
          showError('Tác vụ vẫn ở trạng thái thất bại.', loadingToast);
        } else { // Still processing
          showSuccess('Tác vụ vẫn đang được xử lý.', loadingToast);
        }
      } else {
        throw new Error('Không tìm thấy tác vụ tương ứng trên API Dream ACT.');
      }

    } catch (err) {
      showError(`Kiểm tra lại thất bại: ${err.message}`, loadingToast);
    } finally {
      setIsChecking(false);
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
        <div className="flex items-center">
          {(task.status === 'failed' || task.status === 'animating') && (
            <Button variant="ghost" size="icon" className="w-7 h-7" onClick={handleRecheckStatus} disabled={isChecking} title="Kiểm tra lại trạng thái">
              {isChecking ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </Button>
          )}
          <DreamActLogViewer taskId={task.id} />
          <Button variant="ghost" size="icon" className="w-7 h-7 text-red-500" onClick={handleDelete}><Trash2 className="w-4 h-4" /></Button>
        </div>
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