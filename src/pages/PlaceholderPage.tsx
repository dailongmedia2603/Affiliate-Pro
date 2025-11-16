import React from 'react';

const PlaceholderPage = ({ pageName }) => {
  return (
    <div className="w-full h-full flex items-center justify-center p-6 bg-gray-50/50">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-800">{pageName}</h1>
        <p className="text-gray-500 mt-2">Nội dung cho trang này đang được xây dựng.</p>
      </div>
    </div>
  );
};

export default PlaceholderPage;