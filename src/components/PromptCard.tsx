import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreHorizontal } from 'lucide-react';

const PromptCard = ({ prompt, onEdit, onDelete }) => {
  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-start">
            <div>
                <CardTitle className="text-lg">{prompt.name}</CardTitle>
                {prompt.field && <CardDescription className="text-orange-600">{prompt.field}</CardDescription>}
            </div>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={onEdit}>
                        Sửa
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={onDelete} className="text-red-500 focus:text-red-500 focus:bg-red-50">
                        Xoá
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-gray-600 line-clamp-3 bg-gray-50 p-3 rounded-md">{prompt.content}</p>
      </CardContent>
    </Card>
  );
};

export default PromptCard;