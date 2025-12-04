import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, XCircle, Image as ImageIcon, Video as VideoIcon, Bot, Terminal, Play, StopCircle, RefreshCw, Trash2, FileText, Package, Layers, Download } from 'lucide-react';
import { showError, showSuccess, showLoading, dismissToast } from '@/utils/toast';
import { Button } from '@/components/ui/button';
import AutomationLogViewer from './AutomationLogViewer';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import CustomAudioPlayer from './CustomAudioPlayer';

type SubProductInfo = {
  id: string;
  name: string;
};

type AutomationRunLog = { id: string; timestamp: string; message: string; level: string; metadata?: any; };
type AutomationRunStep = { 
  id: string; 
  step_type: string; 
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'; 
  output_data: { url?: string; final_video_url?: string; } | null; 
  input_data: { 
    prompt?: string; 
    image_urls?: string[]; 
    imageUrl?: string; 
    source_image_step_id?: string; 
    gemini_prompt_for_video?: string; 
    video_urls?: string[];
    script_generation_prompt?: string;
    generated_script?: string;
    sequence_number?: number;
  } | null; 
  error_message: string | null; 
  created_at: string;
  sub_product_id: string;
  sub_product: SubProductInfo | null;
};
type AutomationRun = { 
  id: string; 
  status: 'starting' | 'running' | 'completed' | 'failed' | 'stopped' | 'cancelled'; 
  started_at: string; 
  finished_at: string | null; 
  automation_run_steps: AutomationRunStep[]; 
  channel_id: string; 
};

const StatusBadge = ({ status }: { status: string }) => {
  switch (status) {
    case 'completed': return <Badge variant="outline" className="text-green-600 border-green-300"><CheckCircle2 className="w-3 h-3 mr-1" />Hoàn thành</Badge>;
    case 'failed': return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Thất bại</Badge>;
    case 'running': case 'starting': return <Badge variant="outline" className="text-blue-600 border-blue-300"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Đang chạy</Badge>;
    case 'stopped': case 'cancelled': return <Badge variant="secondary"><StopCircle className="w-3 h-3 mr-1" />Đã dừng</Badge>;
    default: return <Badge variant="secondary">Đang chờ</Badge>;
  }
};

const StepIcon = ({ type }: { type: string }) => {
  switch (type) {
    case 'generate_image': return <ImageIcon className="w-5 h-5 text-gray-500" />;
    case 'generate_video': return <VideoIcon className="w-5 h-5 text-gray-500" />;
    case 'merge_videos': return <Layers className="w-5 h-5 text-gray-500" />;
    case 'generate_voice': return <Bot className="w-5 h-5 text-gray-500" />;
    default: return <Bot className="w-5 h-5 text-gray-500" />;
  }
};

const AutomationRunHistory = ({ channelId, onRerun }: { channelId: string, onRerun: (channelId: string) => void }) => {
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<Record<string, AutomationRunLog[]>>({});
  const [visibleLogs, setVisibleLogs] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [detailsStep, setDetailsStep] = useState<AutomationRunStep | null>(null);
  const [stepLogs, setStepLogs] = useState<AutomationRunLog[]>([]);
  const [loadingStepLogs, setLoadingStepLogs] = useState(false);
  const [aiPromptLog, setAiPromptLog] = useState<string | null>(null);
  const [voiceScriptLog, setVoiceScriptLog] = useState<{ prompt: string; script: string } | null>(null);
  const runIdsRef = useRef<string[]>([]);
  const [runToDelete, setRunToDelete] = useState<AutomationRun | null>(null);
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [retryingStepId, setRetryingStepId] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const fetchRuns = useCallback(async () => {
    const { data, error } = await supabase
      .from('automation_runs')
      .select(`
        id, status, started_at, finished_at, channel_id,
        automation_run_steps (
          id, step_type, status, output_data, input_data, error_message, created_at, sub_product_id,
          sub_product:sub_products!inner (id, name)
        )
      `)
      .eq('channel_id', channelId)
      .order('started_at', { ascending: false });

    if (error) { showError('Không thể tải lịch sử automation.'); } 
    else { setRuns(data as any[] || []); }
    setLoading(false);
  }, [channelId]);

  const fetchStepLogs = async (stepId: string) => {
    if (!stepId) return;
    setLoadingStepLogs(true);
    setStepLogs([]);
    const { data, error } = await supabase
      .from('automation_run_logs')
      .select('*')
      .eq('step_id', stepId)
      .order('timestamp', { ascending: true });
    
    if (error) {
        showError("Không thể tải logs chi tiết cho bước này.");
    } else {
        setStepLogs(data as AutomationRunLog[]);
    }
    setLoadingStepLogs(false);
  };

  useEffect(() => {
    if (detailsStep) {
        fetchStepLogs(detailsStep.id);
    }
  }, [detailsStep]);

  useEffect(() => {
    runIdsRef.current = runs.map(r => r.id);
  }, [runs]);

  useEffect(() => {
    setLoading(true);
    fetchRuns();
  }, [channelId, fetchRuns]);

  useEffect(() => {
    const subscription = supabase
      .channel(`automation-runs-and-steps-${channelId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'automation_runs', filter: `channel_id=eq.${channelId}` }, fetchRuns)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'automation_run_steps' }, (payload) => {
        const runId = (payload.new as any)?.run_id || (payload.old as any)?.run_id;
        if (runId && runIdsRef.current.includes(runId)) {
          fetchRuns();
        }
      }).subscribe();
    return () => { supabase.removeChannel(subscription); };
  }, [channelId, fetchRuns]);

  useEffect(() => {
    let logSubscription: any;
    if (visibleLogs) {
      logSubscription = supabase.channel(`automation-logs-${visibleLogs}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'automation_run_logs', filter: `run_id=eq.${visibleLogs}` }, (payload) => {
          setLogs(prev => ({ ...prev, [visibleLogs]: [...(prev[visibleLogs] || []), payload.new as AutomationRunLog] }));
        }).subscribe();
    }
    return () => { if (logSubscription) supabase.removeChannel(logSubscription); };
  }, [visibleLogs]);

  const toggleLogVisibility = async (runId: string) => {
    if (visibleLogs === runId) { setVisibleLogs(null); } 
    else {
      setVisibleLogs(runId);
      if (!logs[runId]) {
        const { data, error } = await supabase.from('automation_run_logs').select('*').eq('run_id', runId).order('timestamp', { ascending: true });
        if (error) showError('Không thể tải logs.');
        else setLogs(prev => ({ ...prev, [runId]: data }));
      }
    }
  };

  const handleStop = async (runId: string) => {
    const loadingToast = showLoading('Đang gửi yêu cầu dừng...');
    try {
      const { error } = await supabase.functions.invoke('stop-automation', { body: { runId } });
      if (error) throw error;
      showSuccess('Đã gửi yêu cầu dừng phiên chạy.');
    } catch (error) {
      showError(`Lỗi khi dừng phiên chạy: ${error.message}`);
    } finally {
      dismissToast(loadingToast);
    }
  };

  const handleDeleteRequest = (run: AutomationRun) => {
    setRunToDelete(run);
    setIsAlertOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!runToDelete) return;

    const loadingToast = showLoading('Đang xoá phiên chạy...');
    const { error } = await supabase.from('automation_runs').delete().eq('id', runToDelete.id);
    dismissToast(loadingToast);

    if (error) {
      showError(`Xoá thất bại: ${error.message}`);
    } else {
      showSuccess('Đã xoá phiên chạy và các dữ liệu liên quan.');
      fetchRuns();
    }
    setIsAlertOpen(false);
    setRunToDelete(null);
  };

  const handleRetryStep = async (stepId: string) => {
    setRetryingStepId(stepId);
    const loadingToast = showLoading('Đang gửi yêu cầu thử lại...');
    try {
      const { data, error } = await supabase.functions.invoke('retry-automation-step', {
        body: { stepId },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      showSuccess('Đã gửi yêu cầu thử lại thành công. Vui lòng chờ hệ thống xử lý.');
      // The real-time subscription will handle the UI update
    } catch (error) {
      showError(`Thử lại thất bại: ${error.message}`);
    } finally {
      dismissToast(loadingToast);
      setRetryingStepId(null);
    }
  };

  const handleDownload = async (url: string, filename?: string) => {
    if (!url || isDownloading) return;
    setIsDownloading(true);
    const loadingToast = showLoading('Đang chuẩn bị tệp để tải xuống...');
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Không thể tải dữ liệu video.');
      
      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = objectUrl;
      
      const finalFilename = filename || url.split('/').pop()?.split('?')[0] || 'automation-video.mp4';
      link.setAttribute('download', finalFilename);
      
      document.body.appendChild(link);
      link.click();
      
      document.body.removeChild(link);
      window.URL.revokeObjectURL(objectUrl);
      
      showSuccess('Đã bắt đầu tải video.', loadingToast);
    } catch (error: any) {
      console.error('Lỗi tải video:', error);
      showError(`Tải video thất bại: ${error.message}`, loadingToast);
    } finally {
      setIsDownloading(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="w-10 h-10 animate-spin text-orange-500" /></div>;
  if (runs.length === 0) return <div className="flex flex-col items-center justify-center h-full text-center text-gray-500 border-2 border-dashed rounded-lg p-4"><Bot className="w-16 h-16 mb-4" /><h3 className="text-xl font-semibold">Chưa có lần chạy nào</h3><p>Nhấn nút "Chạy" để bắt đầu một luồng tự động hóa cho kênh này.</p></div>;

  return (
    <>
      <Accordion type="single" collapsible className="w-full space-y-2">
        {runs.map((run, index) => {
          const stepsBySubProduct = run.automation_run_steps.reduce((acc, step) => {
            const subProductId = step.sub_product_id;
            if (!subProductId) return acc;

            if (!acc[subProductId]) {
              acc[subProductId] = {
                id: subProductId,
                name: step.sub_product?.name || `Sản phẩm #${subProductId.substring(0, 8)}`,
                steps: []
              };
            }
            acc[subProductId].steps.push(step);
            return acc;
          }, {} as Record<string, { id: string; name: string; steps: AutomationRunStep[] }>);

          return (
            <AccordionItem value={run.id} key={run.id} className="border rounded-lg bg-white">
              <AccordionTrigger className="hover:bg-gray-50 px-4 rounded-lg data-[state=open]:border-b">
                <div className="flex justify-between items-center w-full pr-4">
                  <div className="flex flex-col items-start text-left">
                    <span className="font-semibold text-gray-800">Lần chạy #{runs.length - index} <span className="text-gray-400 font-normal">(#{run.id.substring(0, 6)})</span></span>
                    <span className="text-sm text-gray-500">Bắt đầu: {new Date(run.started_at).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={run.status} />
                    {(run.status === 'running' || run.status === 'starting') && (
                      <Button variant="destructive" size="icon" className="w-8 h-8" onClick={(e) => { e.stopPropagation(); handleStop(run.id); }}><StopCircle className="w-4 h-4" /></Button>
                    )}
                    {(run.status === 'completed' || run.status === 'failed' || run.status === 'stopped') && (
                      <Button variant="outline" size="icon" className="w-8 h-8" onClick={(e) => { e.stopPropagation(); onRerun(run.channel_id); }}><RefreshCw className="w-4 h-4" /></Button>
                    )}
                    <Button variant="ghost" size="icon" className="w-8 h-8 text-red-500 hover:bg-red-100 hover:text-red-600" onClick={(e) => { e.stopPropagation(); handleDeleteRequest(run); }}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="p-4 bg-gray-50/70">
                <div className="space-y-4">
                  <Accordion type="multiple" defaultValue={Object.values(stepsBySubProduct).map(g => g.id)} className="space-y-3">
                    {Object.values(stepsBySubProduct).map((group) => {
                      const sortedSteps = group.steps.sort((a, b) => (a.input_data?.sequence_number ?? Infinity) - (b.input_data?.sequence_number ?? Infinity));
                      const imageSteps = sortedSteps.filter(step => step.step_type === 'generate_image');
                      const videoSteps = sortedSteps.filter(step => step.step_type === 'generate_video');
                      const voiceStep = group.steps.find(step => step.step_type === 'generate_voice');
                      const mergeStep = group.steps.find(step => step.step_type === 'merge_videos');
                      const contentPairs = imageSteps.map((imageStep, pairIndex) => ({
                        pairNumber: pairIndex + 1,
                        imageStep,
                        videoStep: videoSteps.find(videoStep => videoStep.input_data?.source_image_step_id === imageStep.id),
                      }));

                      return (
                        <AccordionItem value={group.id} key={group.id} className="border rounded-lg bg-white shadow-sm">
                          <AccordionTrigger className="px-4 py-3 text-lg font-semibold text-gray-800 hover:bg-gray-50 rounded-t-lg">
                            <div className="flex items-center gap-2">
                              <Package className="w-5 h-5 text-orange-500" />
                              {group.name}
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="p-4 border-t space-y-4">
                            {contentPairs.map(({ pairNumber, imageStep, videoStep }) => (
                              <div key={imageStep.id} className="p-4 border rounded-lg bg-gray-50/50">
                                <h4 className="font-bold text-md text-gray-700 mb-3">Cặp nội dung {pairNumber}</h4>
                                <div className="grid md:grid-cols-2 gap-4">
                                  {/* Image Step */}
                                  <div className="p-3 border rounded-md bg-white flex flex-col justify-between">
                                    <div>
                                      <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-3"><StepIcon type={imageStep.step_type} /><div><p className="font-semibold capitalize">Generate Image {pairNumber}</p><p className="text-xs text-gray-500">Tạo lúc: {new Date(imageStep.created_at).toLocaleTimeString()}</p></div></div>
                                        <StatusBadge status={imageStep.status} />
                                      </div>
                                      {imageStep.status === 'failed' && imageStep.error_message && (<div className="mt-2 p-2 bg-red-50 text-red-700 text-xs rounded-md"><strong>Lỗi:</strong> {imageStep.error_message}</div>)}
                                    </div>
                                    <div className="mt-3 flex flex-col items-start gap-4">
                                      {imageStep.status === 'completed' && imageStep.output_data?.url && (<button onClick={() => setSelectedImage(imageStep.output_data.url!)} className="cursor-pointer w-full"><img src={imageStep.output_data.url} alt="Generated" className="w-full max-h-96 rounded-md border object-contain bg-gray-100" /></button>)}
                                      <Button variant="outline" size="sm" onClick={() => setDetailsStep(imageStep)}><FileText className="w-4 h-4 mr-2" />Chi tiết</Button>
                                    </div>
                                  </div>
                                  {/* Video Step */}
                                  <div className="p-3 border rounded-md bg-white flex flex-col justify-between">
                                    {videoStep ? (<><div><div className="flex items-start justify-between"><div className="flex items-center gap-3"><StepIcon type={videoStep.step_type} /><div><p className="font-semibold capitalize">Generate Video {pairNumber}</p><p className="text-xs text-gray-500">Tạo lúc: {new Date(videoStep.created_at).toLocaleTimeString()}</p></div></div><StatusBadge status={videoStep.status} /></div>{videoStep.status === 'failed' && videoStep.error_message && (<div className="mt-2 p-2 bg-red-50 text-red-700 text-xs rounded-md"><strong>Lỗi:</strong> {videoStep.error_message}</div>)}</div><div className="mt-3 flex flex-col items-start gap-4">{videoStep.status === 'completed' && videoStep.output_data?.url && (<video src={videoStep.output_data.url} controls className="w-full max-h-96 rounded-md border" />)}<div className="flex items-center gap-2"><Button variant="outline" size="sm" onClick={() => setDetailsStep(videoStep)}><FileText className="w-4 h-4 mr-2" />Chi tiết</Button>{videoStep.input_data?.gemini_prompt_for_video && (<Button variant="secondary" size="sm" onClick={() => setAiPromptLog(videoStep.input_data.gemini_prompt_for_video!)}><Bot className="w-4 h-4 mr-2" />Prompt AI Log</Button>)}</div></div></>) : (<div className="flex items-center justify-center h-full text-gray-400"><p className="text-sm">Chờ tạo video...</p></div>)}
                                  </div>
                                </div>
                              </div>
                            ))}
                            {voiceStep && (
                              <div key={voiceStep.id} className="p-4 border rounded-lg bg-blue-50 border-blue-200">
                                <h4 className="font-bold text-md text-blue-800 mb-3">Bước Tạo Voice</h4>
                                <div className="p-3 border rounded-md bg-white flex flex-col justify-between">
                                  <div>
                                    <div className="flex items-start justify-between">
                                      <div className="flex items-center gap-3"><StepIcon type={voiceStep.step_type} /><div><p className="font-semibold capitalize">Tạo Voice & Kịch bản</p><p className="text-xs text-gray-500">Tạo lúc: {new Date(voiceStep.created_at).toLocaleTimeString()}</p></div></div>
                                      <StatusBadge status={voiceStep.status} />
                                    </div>
                                    {voiceStep.status === 'failed' && voiceStep.error_message && (<div className="mt-2 p-2 bg-red-50 text-red-700 text-xs rounded-md"><strong>Lỗi:</strong> {voiceStep.error_message}</div>)}
                                  </div>
                                  <div className="mt-3 flex flex-col items-start gap-4">
                                    {voiceStep.status === 'completed' && voiceStep.output_data?.url && (<CustomAudioPlayer src={voiceStep.output_data.url} />)}
                                    <div className="flex items-center gap-2">
                                      {voiceStep.input_data?.script_generation_prompt && voiceStep.input_data?.generated_script && (
                                        <Button variant="secondary" size="sm" onClick={() => setVoiceScriptLog({ prompt: voiceStep.input_data!.script_generation_prompt!, script: voiceStep.input_data!.generated_script! })}>
                                          <Bot className="w-4 h-4 mr-2" />
                                          Kịch bản & Prompt
                                        </Button>
                                      )}
                                      {voiceStep.status === 'failed' && (
                                        <Button variant="secondary" size="sm" onClick={() => handleRetryStep(voiceStep.id)} disabled={retryingStepId === voiceStep.id}>
                                          {retryingStepId === voiceStep.id ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                                          Thử lại
                                        </Button>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                            {mergeStep && (
                              <div key={mergeStep.id} className="p-4 border rounded-lg bg-orange-50 border-orange-200">
                                <h4 className="font-bold text-md text-orange-800 mb-3">Bước Ghép Video</h4>
                                <div className="p-3 border rounded-md bg-white flex flex-col justify-between">
                                  <div>
                                    <div className="flex items-start justify-between">
                                      <div className="flex items-center gap-3"><StepIcon type={mergeStep.step_type} /><div><p className="font-semibold capitalize">Ghép Video Tổng Hợp</p><p className="text-xs text-gray-500">Tạo lúc: {new Date(mergeStep.created_at).toLocaleTimeString()}</p></div></div>
                                      <StatusBadge status={mergeStep.status} />
                                    </div>
                                    {mergeStep.status === 'failed' && mergeStep.error_message && (<div className="mt-2 p-2 bg-red-50 text-red-700 text-xs rounded-md"><strong>Lỗi:</strong> {mergeStep.error_message}</div>)}
                                  </div>
                                  <div className="mt-3 flex flex-col items-start gap-4">
                                    {mergeStep.status === 'completed' && mergeStep.output_data?.final_video_url && (<video src={mergeStep.output_data.final_video_url} controls className="w-full max-h-96 rounded-md border" />)}
                                    <div className="flex items-center gap-2">
                                      <Button variant="outline" size="sm" onClick={() => setDetailsStep(mergeStep)}><FileText className="w-4 h-4 mr-2" />Chi tiết</Button>
                                      {mergeStep.status === 'completed' && mergeStep.output_data?.final_video_url && (
                                        <Button 
                                          variant="outline" 
                                          size="sm" 
                                          onClick={() => handleDownload(mergeStep.output_data!.final_video_url!)}
                                          disabled={isDownloading}
                                        >
                                          {isDownloading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                                          Tải xuống
                                        </Button>
                                      )}
                                      {mergeStep.status === 'failed' && (
                                        <Button variant="secondary" size="sm" onClick={() => handleRetryStep(mergeStep.id)} disabled={retryingStepId === mergeStep.id}>
                                          {retryingStepId === mergeStep.id ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                                          Thử lại
                                        </Button>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                  </Accordion>
                </div>
                <div className="mt-4 border-t pt-4">
                  <Button variant="ghost" size="sm" onClick={() => toggleLogVisibility(run.id)}><Terminal className="w-4 h-4 mr-2" />{visibleLogs === run.id ? 'Ẩn Logs Chi Tiết' : 'Hiện Logs Chi Tiết'}</Button>
                  {visibleLogs === run.id && <div className="mt-2"><AutomationLogViewer logs={logs[run.id] || []} /></div>}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
      <Dialog open={!!selectedImage} onOpenChange={(isOpen) => !isOpen && setSelectedImage(null)}>
        <DialogContent className="max-w-5xl w-auto p-0 bg-transparent border-none shadow-none"><img src={selectedImage || ''} alt="Enlarged result" className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg" /></DialogContent>
      </Dialog>
      <Dialog open={!!detailsStep} onOpenChange={(isOpen) => !isOpen && setDetailsStep(null)}>
        <DialogContent className="max-w-4xl">
            <DialogHeader>
                <DialogTitle>Chi tiết bước: {detailsStep?.step_type.replace(/_/g, ' ')}</DialogTitle>
                <DialogDescription>
                    Thông tin đầu vào, kết quả và logs API của bước.
                </DialogDescription>
            </DialogHeader>
            {detailsStep && (
                <div className="space-y-6 pt-4 max-h-[70vh] overflow-y-auto pr-2">
                    <div className="grid md:grid-cols-2 gap-6">
                        {detailsStep.step_type === 'merge_videos' ? (
                          <>
                            <div className="space-y-4">
                              <h3 className="font-semibold mb-2 text-gray-800">Video đầu vào:</h3>
                              {(detailsStep.input_data?.video_urls && detailsStep.input_data.video_urls.length > 0) ? (
                                <div className="grid grid-cols-2 gap-2">
                                  {detailsStep.input_data.video_urls.map((url, index) => (
                                    <video key={index} src={url} controls className="rounded-md border w-full" />
                                  ))}
                                </div>
                              ) : (
                                <p className="text-sm text-gray-500">Không có video đầu vào.</p>
                              )}
                            </div>
                            <div>
                              <h3 className="font-semibold mb-2 text-gray-800">Video kết quả:</h3>
                              {detailsStep.output_data?.final_video_url ? (
                                <video src={detailsStep.output_data.final_video_url} controls className="rounded-md border w-full" />
                              ) : (
                                <div className="h-64 flex items-center justify-center bg-gray-100 rounded-md border text-gray-500">
                                  <p>Chưa có video kết quả.</p>
                                </div>
                              )}
                            </div>
                          </>
                        ) : (
                          <>
                            {/* Input Column */}
                            <div className="space-y-4">
                                <div>
                                    <h3 className="font-semibold mb-2 text-gray-800">Prompt đã sử dụng:</h3>
                                    <p className="text-sm p-3 bg-gray-100 rounded-md border">{detailsStep.input_data?.prompt || "Không có prompt"}</p>
                                </div>
                                <div>
                                    <h3 className="font-semibold mb-2 text-gray-800">Ảnh đầu vào:</h3>
                                    {detailsStep.step_type === 'generate_image' && (
                                        (detailsStep.input_data?.image_urls && detailsStep.input_data.image_urls.length > 0) ? (
                                            <div className="grid grid-cols-2 gap-2">
                                                {detailsStep.input_data.image_urls.map((url, index) => (
                                                    <img key={index} src={url} alt={`Input ${index + 1}`} className="rounded-md border object-cover aspect-square" />
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-sm text-gray-500">Không có ảnh đầu vào.</p>
                                        )
                                    )}
                                    {detailsStep.step_type === 'generate_video' && (
                                        detailsStep.input_data?.imageUrl ? (
                                            <img src={detailsStep.input_data.imageUrl} alt="Input" className="rounded-md border object-cover w-full" />
                                        ) : (
                                            <p className="text-sm text-gray-500">Không có ảnh đầu vào.</p>
                                        )
                                    )}
                                </div>
                            </div>
                            {/* Output Column */}
                            <div>
                                <h3 className="font-semibold mb-2 text-gray-800">Kết quả:</h3>
                                {detailsStep.output_data?.url ? (
                                    detailsStep.step_type === 'generate_image' ? (
                                        <img src={detailsStep.output_data.url} alt="Generated result" className="rounded-md border w-full object-contain" />
                                    ) : (
                                        <video src={detailsStep.output_data.url} controls className="rounded-md border w-full" />
                                    )
                                ) : (
                                  <div className="h-64 flex items-center justify-center bg-gray-100 rounded-md border text-gray-500">
                                    <p>Bước này chưa hoàn thành hoặc đã thất bại, không có kết quả.</p>
                                  </div>
                                )}
                            </div>
                          </>
                        )}
                    </div>
                    {/* New Log Viewer Section */}
                    <div className="border-t pt-4">
                        <h3 className="font-semibold mb-2 text-gray-800">Logs API chi tiết:</h3>
                        {loadingStepLogs ? (
                            <div className="flex items-center justify-center h-24">
                                <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
                            </div>
                        ) : stepLogs.filter(log => log.metadata?.endpoint).length > 0 ? (
                            <Accordion type="multiple" className="w-full space-y-2">
                                {stepLogs.filter(log => log.metadata?.endpoint).map(log => (
                                    <AccordionItem key={log.id} value={log.id} className="border rounded-md bg-gray-50/50">
                                        <AccordionTrigger className="px-4 py-3 hover:no-underline">
                                            <div className="flex justify-between w-full items-center pr-4">
                                                <span className="font-semibold text-sm text-gray-800">{log.message}</span>
                                                <span className="text-xs font-normal text-gray-500">{new Date(log.timestamp).toLocaleTimeString()}</span>
                                            </div>
                                        </AccordionTrigger>
                                        <AccordionContent className="px-4 pt-0 pb-4">
                                            <div className="space-y-2 border-t pt-4 mt-2">
                                                <div>
                                                    <p className="text-xs font-medium text-gray-600">Endpoint:</p>
                                                    <pre className="text-xs bg-gray-800 text-gray-200 p-2 rounded-md overflow-auto mt-1">
                                                        {log.metadata.endpoint}
                                                    </pre>
                                                </div>
                                                {log.metadata.payload && (
                                                    <div>
                                                        <p className="text-xs font-medium text-gray-600">Request Payload:</p>
                                                        <pre className="text-xs bg-gray-800 text-gray-200 p-2 rounded-md overflow-auto mt-1 h-48">
                                                            {JSON.stringify(log.metadata.payload, null, 2)}
                                                        </pre>
                                                    </div>
                                                )}
                                                {log.metadata.response && (
                                                    <div>
                                                        <p className="text-xs font-medium text-gray-600">API Response:</p>
                                                        <pre className={`text-xs p-2 rounded-md overflow-auto mt-1 h-48 ${log.level === 'ERROR' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'}`}>
                                                            {JSON.stringify(log.metadata.response, null, 2)}
                                                        </pre>
                                                    </div>
                                                )}
                                            </div>
                                        </AccordionContent>
                                    </AccordionItem>
                                ))}
                            </Accordion>
                        ) : (
                            <p className="text-center text-sm text-gray-500 py-8">Không có logs API chi tiết cho bước này.</p>
                        )}
                    </div>
                </div>
            )}
        </DialogContent>
      </Dialog>
      <Dialog open={!!aiPromptLog} onOpenChange={(isOpen) => !isOpen && setAiPromptLog(null)}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Prompt đã gửi đến AI</DialogTitle>
                <DialogDescription>
                    Đây là prompt chính xác đã được hệ thống gửi đến Gemini để tạo ra prompt chuyển động cho video.
                </DialogDescription>
            </DialogHeader>
            <div className="mt-4 p-4 bg-gray-100 rounded-md border max-h-96 overflow-y-auto">
                <pre className="whitespace-pre-wrap text-sm font-mono">{aiPromptLog}</pre>
            </div>
        </DialogContent>
      </Dialog>
      <Dialog open={!!voiceScriptLog} onOpenChange={(isOpen) => !isOpen && setVoiceScriptLog(null)}>
        <DialogContent className="max-w-2xl">
            <DialogHeader>
                <DialogTitle>Log Kịch Bản Voice</DialogTitle>
                <DialogDescription>
                    Prompt đã được gửi đến AI để tạo kịch bản và kịch bản được tạo ra.
                </DialogDescription>
            </DialogHeader>
            <div className="mt-4 space-y-4 max-h-[60vh] overflow-y-auto p-1">
                <div>
                    <h3 className="font-semibold mb-2 text-gray-800">Prompt đã gửi:</h3>
                    <pre className="whitespace-pre-wrap text-sm font-mono p-4 bg-gray-100 rounded-md border">{voiceScriptLog?.prompt}</pre>
                </div>
                <div>
                    <h3 className="font-semibold mb-2 text-gray-800">Kịch bản được tạo:</h3>
                    <pre className="whitespace-pre-wrap text-sm font-mono p-4 bg-blue-50 rounded-md border border-blue-200">{voiceScriptLog?.script}</pre>
                </div>
            </div>
        </DialogContent>
      </Dialog>
      <AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bạn có chắc chắn muốn xóa?</AlertDialogTitle>
            <AlertDialogDescription>
              Hành động này không thể được hoàn tác. Phiên chạy <strong>Run #{runToDelete?.id.substring(0, 8)}</strong> và tất cả các bước, logs liên quan sẽ bị xóa vĩnh viễn.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-red-600 hover:bg-red-700">Xóa</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default AutomationRunHistory;