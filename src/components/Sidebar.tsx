import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutGrid,
  Mail,
  Users,
  BarChart2,
  Folder,
  LifeBuoy,
  Settings,
  BookText,
} from 'lucide-react';

const topIcons = [
  { name: 'dashboard', path: '/', Icon: LayoutGrid },
  { name: 'inbox', path: '/inbox', Icon: Mail },
  { name: 'contacts', path: '/contacts', Icon: Users },
  { name: 'reports', path: '/reports', Icon: BarChart2 },
  { name: 'files', path: '/files', Icon: Folder },
  { name: 'prompt-library', path: '/prompt-library', Icon: BookText },
];

const bottomIcons = [
  { name: 'help', path: '/help', Icon: LifeBuoy },
  { name: 'settings', path: '/settings', Icon: Settings },
];

const Sidebar = () => {
  const location = useLocation();
  const activePath = location.pathname;

  const isLinkActive = (path) => {
    if (path === '/') {
      return activePath === path;
    }
    return activePath.startsWith(path);
  };

  return (
    <aside className="flex flex-col items-center w-16 p-2 bg-white border-r border-solid border-[#EDEDED]">
      <div className="flex flex-col items-center self-stretch flex-grow gap-3 pt-3">
        {topIcons.map(({ name, path, Icon }) => (
          <Link
            key={name}
            to={path}
            className={`w-10 h-10 flex items-center justify-center rounded-md transition-colors ${
              isLinkActive(path)
                ? 'bg-orange-100 text-orange-600'
                : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
            }`}
            aria-label={name}
          >
            <Icon className="w-6 h-6" />
          </Link>
        ))}
      </div>
      <div className="flex flex-col items-center self-stretch gap-3 mt-4 pb-2">
        {bottomIcons.map(({ name, path, Icon }) => (
          <Link
            key={name}
            to={path}
            className={`w-10 h-10 flex items-center justify-center rounded-md transition-colors ${
              isLinkActive(path)
                ? 'bg-orange-100 text-orange-600'
                : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
            }`}
            aria-label={name}
          >
            <Icon className="w-6 h-6" />
          </Link>
        ))}
      </div>
    </aside>
  );
};

export default Sidebar;