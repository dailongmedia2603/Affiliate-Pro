import React, { useState, useEffect, useCallback } from 'react';
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

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks, refreshTrigger]);

  useEffect(() => {
    // Subscribe to real-time changes in the database
    const channel = supabase
      .channel(`higgsfield_logs_changes_for_${model}`)
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'higgsfield_generation_logs',
          filter: `model=eq.${model}`
        },
        (payload) => {
          // When a change is detected, refetch the tasks
          fetchTasks();
        }
      )
      .subscribe();

    // Cleanup function to remove the subscription when the component unmounts
    return () => {
      supabase.removeChannel(channel);
    };
  }, [model, fetchTasks]);

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
        <DialogContent className="max-w-5xl w-auto p-0">
          <img 
            src={selectedImage || ''} 
            alt="Enlarged task result" 
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg" 
          />
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ImageTaskHistory;