import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const ContentPanel = () => {
  const [input1, onChangeInput1] = useState('');
  const [input2, onChangeInput2] = useState('');
  const [input3, onChangeInput3] = useState('');

  return (
    <div className="flex-1 p-6">
      <h2 className="text-2xl font-bold mb-4">Content Area</h2>
      <p className="text-gray-500 mb-6">This is a placeholder for the main content.</p>
      <div className="space-y-4">
        <div>
          <Label htmlFor="input1">Input 1</Label>
          <Input 
            id="input1"
            value={input1} 
            onChange={(e) => onChangeInput1(e.target.value)} 
            placeholder="Enter value 1"
          />
        </div>
        <div>
          <Label htmlFor="input2">Input 2</Label>
          <Input 
            id="input2"
            value={input2} 
            onChange={(e) => onChangeInput2(e.target.value)} 
            placeholder="Enter value 2"
          />
        </div>
        <div>
          <Label htmlFor="input3">Input 3</Label>
          <Input 
            id="input3"
            value={input3} 
            onChange={(e) => onChangeInput3(e.target.value)} 
            placeholder="Enter value 3"
          />
        </div>
      </div>
    </div>
  );
};

export default ContentPanel;