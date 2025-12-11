import React from 'react';
import { Link, useLocation } from 'react-router-dom';
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
import { cn } from '@/lib/utils';

const navItems = [
  { label: "Quản lý kênh", Icon: Network, path: "/" },
  { label: "Sản phẩm", Icon: Package, path: "/products" },
  { label: "Automation", Icon: Bot, path: "/automation" },
  { label: "Thư Viện Prompt", Icon: BookText, path: "/prompts" },
  { label: "Tạo Voice", Icon: Mic, path: "/voice" },
  {
    label: "Tạo Ảnh / Video",
    Icon: Clapperboard,
    path: "/media",
    children: [
      { label: "Tạo Video", Icon: Video, path: "/video" },
      { label: "Tạo Ảnh", Icon: Image, path: "/image" },
      { label: "Ffmpeg Rendi", Icon: Film, path: "/rendi" },
    ],
  },
  { label: "Tài khoản", Icon: Users, path: "/accounts" },
  { label: "Cài Đặt", Icon: Settings, path: "/settings" },
];

const Header = () => {
  const location = useLocation();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const isItemActive = (item) => {
    if (item.path === '/') {
      return location.pathname === '/';
    }
    if (item.children) {
      return location.pathname.startsWith(item.path);
    }
    return location.pathname.startsWith(item.path);
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
            const isActive = isItemActive(item);
            return (
              <DropdownMenu key={index}>
                <DropdownMenuTrigger asChild>
                  <button
                    className={cn(
                      "flex items-center py-2 px-3 gap-2 rounded-md transition-colors",
                      isActive ? 'bg-gray-100' : 'hover:bg-gray-100'
                    )}
                  >
                    <item.Icon
                      className={cn(
                        "w-5 h-5",
                        isActive ? "text-orange-500" : "text-[#4E657F]"
                      )}
                    />
                    <span className={cn(
                      "text-sm",
                      isActive ? "text-black font-bold" : "text-[#4E657F]"
                    )}>
                      {item.label}
                    </span>
                    <ChevronDown className={cn("w-4 h-4 ml-1 transition-transform", isActive ? "text-black" : "text-[#4E657F]")} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {item.children.map((child, childIndex) => (
                    <DropdownMenuItem key={childIndex} asChild>
                      <Link to={child.path} className="cursor-pointer">
                        <child.Icon className="w-4 h-4 mr-2" />
                        <span>{child.label}</span>
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            );
          }

          return (
            <Link
              key={index}
              to={item.path}
              className={cn(
                "flex items-center py-2 px-3 gap-2 rounded-md transition-colors",
                isItemActive(item) ? 'bg-gray-100' : 'hover:bg-gray-100'
              )}
            >
              <item.Icon
                className={cn(
                  "w-5 h-5",
                  isItemActive(item) ? "text-orange-500" : "text-[#4E657F]"
                )}
              />
              <span className={cn(
                "text-sm",
                isItemActive(item) ? "text-black font-bold" : "text-[#4E657F]"
              )}>
                {item.label}
              </span>
            </Link>
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