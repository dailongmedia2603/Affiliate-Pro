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
  Film,
  BookText,
  Users,
  ChevronDown,
  Clapperboard,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const navItems = [
  { label: "Quản lý kênh", Icon: Network },
  { label: "Sản phẩm", Icon: Package },
  { label: "Automation", Icon: Bot },
  {
    label: "Tạo Ảnh / Video",
    Icon: Clapperboard,
    children: [
      { label: "Tạo Video", Icon: Video },
      { label: "Tạo Ảnh", Icon: Image },
      { label: "Ffmpeg Rendi", Icon: Film },
    ],
  },
  { label: "Tạo Voice", Icon: Mic },
  { label: "Thư Viện Prompt", Icon: BookText },
  { label: "Tài khoản", Icon: Users },
  { label: "Cài Đặt", Icon: Settings },
];

const Header = ({ activeItem, setActiveItem }) => {
  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const isGroupActive = (item) => {
    if (!item.children) return false;
    return item.children.some(child => child.label === activeItem);
  };

  return (
    <header className="flex items-center self-stretch bg-white py-[13px] px-4">
      <div className="flex items-center mr-[18px]">
        <img
          src={"/logo.png"}
          className="w-44 h-9 object-contain"
          alt="Torse.ai logo"
        />
      </div>
      <nav className="flex items-start">
        {navItems.map((item, index) => {
          if (item.children) {
            const isActive = isGroupActive(item);
            return (
              <DropdownMenu key={index}>
                <DropdownMenuTrigger asChild>
                  <button
                    className={`flex items-center py-2 px-3 gap-2 rounded-md transition-colors ${
                      isActive ? 'bg-gray-100' : 'hover:bg-gray-100'
                    }`}
                  >
                    <item.Icon
                      className={`w-5 h-5 ${
                        isActive ? "text-orange-500" : "text-[#4E657F]"
                      }`}
                    />
                    <span className={`${isActive ? "text-black font-bold" : "text-[#4E657F]"} text-sm`}>
                      {item.label}
                    </span>
                    <ChevronDown className={`w-4 h-4 ml-1 transition-transform ${isActive ? "text-black" : "text-[#4E657F]"}`} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {item.children.map((child, childIndex) => (
                    <DropdownMenuItem
                      key={childIndex}
                      onClick={() => setActiveItem(child.label)}
                      className="cursor-pointer"
                    >
                      <child.Icon className="w-4 h-4 mr-2" />
                      <span>{child.label}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            );
          }

          return (
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
          );
        })}
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