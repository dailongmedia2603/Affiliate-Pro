import React from 'react';

const topIcons = [
  "https://storage.googleapis.com/tagjs-prod.appspot.com/v1/wjyXx6yIud/gscw16ey_expires_30_days.png",
  "https://storage.googleapis.com/tagjs-prod.appspot.com/v1/wjyXx6yIud/07w0lrq8_expires_30_days.png",
  "https://storage.googleapis.com/tagjs-prod.appspot.com/v1/wjyXx6yIud/gp6enmol_expires_30_days.png",
  "https://storage.googleapis.com/tagjs-prod.appspot.com/v1/wjyXx6yIud/2z2zk51q_expires_30_days.png",
  "https://storage.googleapis.com/tagjs-prod.appspot.com/v1/wjyXx6yIud/pj4kofh0_expires_30_days.png",
];

const bottomIcons = [
  "https://storage.googleapis.com/tagjs-prod.appspot.com/v1/wjyXx6yIud/72mbty4v_expires_30_days.png",
  "https://storage.googleapis.com/tagjs-prod.appspot.com/v1/wjyXx6yIud/4qxt04z1_expires_30_days.png",
];

const Sidebar = () => {
  return (
    <aside className="flex flex-col items-center w-8">
      <img
        src={"https://storage.googleapis.com/tagjs-prod.appspot.com/v1/wjyXx6yIud/kdt844vf_expires_30_days.png"}
        className="w-[15px] h-[1px] mb-3 object-fill"
        alt="divider"
      />
      <div className="flex flex-col items-center self-stretch flex-grow gap-3">
        {topIcons.map((src, index) => (
          <img key={index} src={src} className="w-8 h-8 object-fill" alt={`icon ${index + 1}`} />
        ))}
      </div>
      <div className="flex flex-col items-center self-stretch gap-3 mt-4">
        {bottomIcons.map((src, index) => (
          <img key={index} src={src} className="w-8 h-8 object-fill" alt={`bottom icon ${index + 1}`} />
        ))}
      </div>
    </aside>
  );
};

export default Sidebar;