import React from 'react';
import {
  Network,
  Bot,
  Video,
  Image,
  Mic,
  Settings,
  Package,
  LogOut,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';

const navItems = [
  { label: "Quản lý kênh", Icon: Network },
  { label: "Sản phẩm", Icon: Package },
  { label: "Automation", Icon: Bot },
  { label: "Tạo Video", Icon: Video },
  { label: "Tạo Ảnh", Icon: Image },
  { label: "Tạo Voice", Icon: Mic },
  { label: "Cài Đặt", Icon: Settings },
];

const Header = ({ activeItem, setActiveItem }) => {
  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <header className="flex items-center self-stretch bg-white py-[13px] px-4">
      <div className="flex items-center w-[105px] mr-[18px] gap-3.5">
        <img
          src={"https://storage.googleapis.com/tagjs-prod.appspot.com/v1/wjyXx6yIud/2zk5n7fp_expires_30_days.png"}
          className="w-9 h-9 object-fill"
          alt="Torse.ai logo"
        />
        <span className="text-black text-base font-bold">
          {"Torse.ai"}
        </span>
      </div>
      <nav className="flex items-start">
        {navItems.map((item, index) => (
          <button
            key={index}
            onClick={() => setActiveItem(item.label)}
            className={`flex items-center py-2 px-3 gap-2 rounded-md transition-colors ${
              activeItem === item.label ? 'bg-gray-100' : 'hover:bg-gray-100'
            }`}
          >
            <item.Icon
              className={`w-5 h-5 ${
                activeItem === item.label ? "text-orange-500" : "text-[#4E657F]"
              }`}
            />
            <span className={`${activeItem === item.label ? "text-black font-bold" : "text-[#4E657F]"} text-sm`}>
              {item.label}
            </span>
          </button>
        ))}
      </nav>
      <div className="flex-1 self-stretch"></div>
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={handleSignOut} title="Đăng xuất">
          <LogOut className="h-5 w-5 text-gray-600 hover:text-orange-500" />
        </Button>
      </div>
    </header>
  );
};

export default Header;