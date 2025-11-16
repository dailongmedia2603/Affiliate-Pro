import React, { useState } from 'react';
import {
  Users,
  MessageSquare,
  Lightbulb,
  BarChart3,
  Briefcase,
  Bot,
  ClipboardList,
} from 'lucide-react';

const navItems = [
  { label: "Contacts", Icon: Users },
  { label: "Conversations", Icon: MessageSquare },
  { label: "Marketing", Icon: Lightbulb },
  { label: "Sales", Icon: BarChart3 },
  { label: "Services", Icon: Briefcase },
  { label: "Automation", Icon: Bot },
  { label: "Reporting", Icon: ClipboardList },
];

const Header = () => {
  const [activeItem, setActiveItem] = useState('Sales');

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
      <div className="flex items-start gap-3">
        <img
          src={"https://storage.googleapis.com/tagjs-prod.appspot.com/v1/wjyXx6yIud/zfh9ri4j_expires_30_days.png"}
          className="w-[30px] h-[30px] object-fill"
          alt="icon 1"
        />
        <img
          src={"https://storage.googleapis.com/tagjs-prod.appspot.com/v1/wjyXx6yIud/483uqjj3_expires_30_days.png"}
          className="w-[30px] h-[30px] object-fill"
          alt="icon 3"
        />
      </div>
    </header>
  );
};

export default Header;