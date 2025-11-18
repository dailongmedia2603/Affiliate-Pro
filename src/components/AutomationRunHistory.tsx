import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, XCircle, Image as ImageIcon, Video as VideoIcon, Bot } from 'lucide-react';
import { showError } from '@/utils/toast';

// Types
type AutomationRunStep = {
  id: string;
  step_type: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  output_data: { url?: string } | null;
  error_message: string | null;
  created_at: string;
};

type AutomationRun = {
  id: string;
  status: 'starting' | 'running' | 'completed' | 'failed';
  started_at: string;
  finished_at: string | null;
  automation_run_steps: AutomationRunStep[];
};

// Helper components
const StatusBadge = ({ status }: { status: string }) => {
  switch (status) {
    case 'completed':
      return <Badge variant="outline" className="text-green-600 border-green-300"><CheckCircle2 className="w-3 h-3 mr-1" />Hoàn thành</Badge>;
    case 'failed':
      return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Thất bại</Badge>;
    case 'running':
    case 'starting':
      return <Badge variant="outline" className="text-blue-600 border-blue-300"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Đang chạy</Badge>;
    default:
      return <Badge variant="secondary">Đang chờ</Badge>;
  }
};

const StepIcon = ({ type }: { type: string }) => {
  switch (type) {
    case 'generate_image':
      return <ImageIcon className="w-5 h-5 text-gray-500" />;
    case 'generate_video':
      return <VideoIcon className="w-5 h-5 text-gray-500" />;
    default:
      return <Bot className="w-5 h-5 text-gray-500" />;
  }
};

const AutomationRunHistory = ({ channelId }: { channelId: string }) => {
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRuns = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('automation_runs')
      .select(`
        id,
        status,
        started_at,
        finished_at,
        automation_run_steps (
          id,
          step_type,
          status,
          output_data,
          error_message,
          created_at
        )
      `)
      .eq('channel_id', channelId)
      .order('started_at', { ascending: false });

    if (error) {
      showError('Không thể tải lịch sử automation.');
      console.error(error);
    } else {
      setRuns(data || []);
    }
    setLoading(false);
  }, [channelId]);

  useEffect(() => {
    fetchRuns();

    const subscription = supabase
      .channel(`automation-runs-${channelId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'automation_runs', filter: `channel_id=eq.${channelId}` },
        () => fetchRuns()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'automation_run_steps' },
        () => fetchRuns()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [channelId, fetchRuns]);

  if (loading) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="w-10 h-10 animate-spin text-orange-500" /></div>;
  }

  if (runs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center text-gray-500 border-2 border-dashed rounded-lg">
        <Bot className="w-16 h-16 mb-4" />
        <h3 className="text-xl font-semibold">Chưa có lần chạy nào</h3>
        <p>Nhấn nút "Chạy" để bắt đầu một luồng tự động hóa cho kênh này.</p>
      </div>
    );
  }

  return (
    <Accordion type="single" collapsible className="w-full">
      {runs.map(run => (
        <AccordionItem value={run.id} key={run.id}>
          <AccordionTrigger className="hover:bg-gray-50 px-4 rounded-lg">
            <div className="flex justify-between items-center w-full pr-4">
              <div className="flex flex-col items-start">
                <span className="font-semibold text-gray-800">Run #{run.id.substring(0, 8)}</span>
                <span className="text-sm text-gray-500">Bắt đầu: {new Date(run.started_at).toLocaleString()}</span>
              </div>
              <StatusBadge status={run.status} />
            </div>
          </AccordionTrigger>
          <AccordionContent className="p-4 bg-gray-50/70 border-t">
            <div className="space-y-4">
              {run.automation_run_steps.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()).map(step => (
                <div key={step.id} className="p-3 border rounded-lg bg-white shadow-sm">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <StepIcon type={step.step_type} />
                      <div>
                        <p className="font-semibold capitalize">{step.step_type.replace(/_/g, ' ')}</p>
                        <p className="text-xs text-gray-500">Tạo lúc: {new Date(step.created_at).toLocaleTimeString()}</p>
                      </div>
                    </div>
                    <StatusBadge status={step.status} />
                  </div>
                  {step.status === 'completed' && step.output_data?.url && (
                    <div className="mt-3">
                      {step.step_type === 'generate_image' ? (
                        <img src={step.output_data.url} alt="Generated image" className="max-w-xs rounded-md border" />
                      ) : step.step_type === 'generate_video' ? (
                        <video src={step.output_data.url} controls className="max-w-xs rounded-md border" />
                      ) : null}
                    </div>
                  )}
                  {step.status === 'failed' && step.error_message && (
                    <div className="mt-2 p-2 bg-red-50 text-red-700 text-xs rounded-md">
                      <strong>Lỗi:</strong> {step.error_message}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
};

export default AutomationRunHistory;