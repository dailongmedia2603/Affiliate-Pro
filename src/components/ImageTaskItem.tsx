import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, XCircle, Trash2, Download } from 'lucide-react';
import { showError, showSuccess } from '@/utils/toast';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const ImageTaskItem = ({ task, onTaskDeleted, onImageClick }) => {
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDelete = async () => {
    const { error } = await supabase.from('higgsfield_generation_logs').delete().eq('id', task.id);
    if (error) {
      showError('Xóa tác vụ thất bại.');
    } else {
      showSuccess('Đã xóa tác vụ.');
      onTaskDeleted();
    }
  };

  const handleDownload = async (e, url) => {
    e.stopPropagation(); // Ngăn không cho hộp thoại xem ảnh mở ra
    if (!url) return;
    setIsDownloading(true);
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Không thể tải dữ liệu ảnh.');
      
      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = objectUrl;
      
      const filename = url.split('/').pop()?.split('?')[0] || 'generated-image.png';
      link.setAttribute('download', filename);
      
      document.body.appendChild(link);
      link.click();
      
      document.body.removeChild(link);
      window.URL.revokeObjectURL(objectUrl);
      
      showSuccess('Đã bắt đầu tải ảnh.');
    } catch (error) {
      console.error('Lỗi tải ảnh:', error);
      showError('Tải ảnh thất bại. Vui lòng thử lại.');
    } finally {
      setIsDownloading(false);
    }
  };

  const renderStatus = () => {
    switch (task.status) {
      case 'completed':
        return <Badge variant="outline" className="text-green-600 border-green-300"><CheckCircle2 className="w-3 h-3 mr-1" />Hoàn thành</Badge>;
      case 'failed':
      case 'nsfw':
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Thất bại</Badge>
              </TooltipTrigger>
              <TooltipContent><p>{task.error_message || `Trạng thái: ${task.status}`}</p></TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      case 'processing':
      default:
        return <Badge variant="outline" className="text-blue-600 border-blue-300"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Đang xử lý</Badge>;
    }
  };

  return (
    <div className="border rounded-lg p-3 space-y-2 bg-gray-50">
      <div className="flex justify-between items-start">
        <div className="flex-1 mr-2 space-y-1 min-w-0">
          {renderStatus()}
          <p className="text-sm font-medium truncate" title={task.prompt}>{task.prompt}</p>
          <p className="text-xs text-gray-500">Model: {task.model}</p>
        </div>
        <Button variant="ghost" size="icon" className="w-7 h-7 text-red-500" onClick={handleDelete}><Trash2 className="w-4 h-4" /></Button>
      </div>
      {task.status === 'completed' && task.result_image_url && (
        <div className="relative aspect-square bg-black rounded-md overflow-hidden group">
            <button onClick={() => onImageClick(task.result_image_url)} className="w-full h-full cursor-pointer">
              <img src={task.result_image_url} alt={task.prompt} className="w-full h-full object-contain" />
            </button>
            <Button 
              size="icon" 
              className="absolute top-2 right-2 w-8 h-8 bg-black/50 hover:bg-black/75 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => handleDownload(e, task.result_image_url)}
              disabled={isDownloading}
              aria-label="Tải ảnh xuống"
            >
              {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            </Button>
        </div>
      )}
      <div className="flex justify-between items-center text-xs text-gray-500 pt-1">
        <span>{new Date(task.created_at).toLocaleString()}</span>
      </div>
    </div>
  );
};

export default ImageTaskItem;