import React, { useState } from 'react';
import {
  LayoutGrid,
  Mail,
  Users,
  BarChart2,
  Folder,
  LifeBuoy,
  Settings,
} from 'lucide-react';

const topIcons = [
  { name: 'dashboard', Icon: LayoutGrid },
  { name: 'inbox', Icon: Mail },
  { name: 'contacts', Icon: Users },
  { name: 'reports', Icon: BarChart2 },
  { name: 'files', Icon: Folder },
];

const bottomIcons = [
  { name: 'help', Icon: LifeBuoy },
  { name: 'settings', Icon: Settings },
];

const Sidebar = () => {
  const [activeIcon, setActiveIcon] = useState(topIcons[0].name);

  return (
    <aside className="flex flex-col items-center w-16 p-2 bg-white border-r">
      <div className="flex flex-col items-center self-stretch flex-grow gap-3 pt-3">
        {topIcons.map(({ name, Icon }) => (
          <button
            key={name}
            onClick={() => setActiveIcon(name)}
            className={`w-10 h-10 flex items-center justify-center rounded-md transition-colors ${
              activeIcon === name
                ? 'bg-gray-100 text-gray-900'
                : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
            }`}
            aria-label={name}
          >
            <Icon className="w-6 h-6" />
          </button>
        ))}
      </div>
      <div className="flex flex-col items-center self-stretch gap-3 mt-4">
        {bottomIcons.map(({ name, Icon }) => (
          <button
            key={name}
            onClick={() => setActiveIcon(name)}
            className={`w-10 h-10 flex items-center justify-center rounded-md transition-colors ${
              activeIcon === name
                ? 'bg-gray-100 text-gray-900'
                : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
            }`}
            aria-label={name}
          >
            <Icon className="w-6 h-6" />
          </button>
        ))}
      </div>
    </aside>
  );
};

export default Sidebar;