import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import AIPanel from '@/components/AIPanel';
import ContentPanel from '@/components/ContentPanel';

const Index = () => {
  return (
    <div className="bg-[#F6F8FA] min-h-screen flex flex-col">
      <div className="w-[1440px] mx-auto flex flex-col flex-1">
        <Header />
        <main className="flex flex-1 items-stretch my-3 mx-3 gap-3">
          <Sidebar />
          <div className="flex items-start bg-white flex-1 rounded-lg border border-solid border-[#EDEDED]">
            <AIPanel />
            <ContentPanel />
          </div>
        </main>
      </div>
    </div>
  );
};

export default Index;