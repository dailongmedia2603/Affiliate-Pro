import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Video, Image, Mic } from "lucide-react";
import PromptList from "@/components/PromptList";

const PromptLibrary = () => {
  return (
    <div className="container mx-auto p-0">
      <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-6">
        Thư viện Prompt
      </h1>
      <Tabs defaultValue="video" className="w-full">
        <TabsList className="grid w-full grid-cols-3 md:w-[400px] bg-gray-100">
          <TabsTrigger value="video">
            <Video className="w-4 h-4 mr-2" />
            Tạo Video
          </TabsTrigger>
          <TabsTrigger value="image">
            <Image className="w-4 h-4 mr-2" />
            Tạo Ảnh
          </TabsTrigger>
          <TabsTrigger value="voice">
            <Mic className="w-4 h-4 mr-2" />
            Tạo Voice
          </TabsTrigger>
        </TabsList>
        <TabsContent value="video">
          <PromptList category="video" />
        </TabsContent>
        <TabsContent value="image">
          <PromptList category="image" />
        </TabsContent>
        <TabsContent value="voice">
          <PromptList category="voice" />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default PromptLibrary;