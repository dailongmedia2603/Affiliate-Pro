import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import AIPanel from '@/components/AIPanel';
import ContentPanel from '@/components/ContentPanel';

const Index = () => {
  return (
    <div className="bg-[#F6F8FA] min-h-screen">
      <div className="w-[1440px] mx-auto">
        <Header />
        <main className="flex items-start self-stretch my-3 mx-3 gap-3">
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