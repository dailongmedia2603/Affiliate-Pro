import React from 'react';
import { Button } from '@/components/ui/button';
import { Sparkles } from 'lucide-react';

const AIPanel = () => {
  return (
    <div className="bg-white w-[360px] px-4 mr-4">
      <div className="flex flex-col self-stretch mt-4 mb-6 gap-4">
        <div className="flex flex-col items-start self-stretch gap-2">
          <div className="flex items-center gap-4">
            <span className="text-black text-base font-bold">
              {"Direct Timeline by AI"}
            </span>
            <button
              className="flex items-center bg-[#EBF1FE] text-left py-1 px-2 gap-0.5 rounded-[1000px] border-0"
              onClick={() => alert("Pressed!")}
            >
              <img
                src={"https://storage.googleapis.com/tagjs-prod.appspot.com/v1/wjyXx6yIud/u2pp2q4w_expires_30_days.png"}
                className="w-3 h-3 rounded-[1000px] object-fill"
                alt="AI badge icon"
              />
              <span className="text-[#367BF6] text-xs font-bold">
                {"AI"}
              </span>
            </button>
          </div>
          <div className="flex items-center self-stretch">
            <img
              src={"https://storage.googleapis.com/tagjs-prod.appspot.com/v1/wjyXx6yIud/5op1g6z5_expires_30_days.png"}
              className="w-5 h-5 mr-2.5 object-fill"
              alt="info icon"
            />
            <p className="text-[#687D96] text-sm">
              {"Provide instructions for the model to generate an output for your records. How to prompt?"}
            </p>
          </div>
        </div>
        <div
          className="flex flex-col items-start self-stretch bg-white pb-2.5 rounded-lg"
          style={{
            boxShadow: "0px 1px 8px #00000012"
          }}
        >
          <div className="flex justify-between items-center self-stretch bg-[#FCE9E9] py-1 px-3 mb-2.5">
            <span className="text-[#FF5314] text-sm font-bold">
              {"open-AI"}
            </span>
            <img
              src={"https://storage.googleapis.com/tagjs-prod.appspot.com/v1/wjyXx6yIud/tdue5cve_expires_30_days.png"}
              className="w-[18px] h-[18px] object-fill"
              alt="openai icon"
            />
          </div>
          <div className="w-full h-[140px] px-2.5">
            <textarea 
              className="w-full h-full text-[#879AAF] text-sm resize-none border-none focus:ring-0"
              placeholder="/Describe your stage here..."
            />
          </div>
          <div className="flex justify-between items-end self-stretch ml-2.5 pr-2.5">
            <div className="flex items-start gap-3 rounded-[9px]">
              <img
                src={"https://storage.googleapis.com/tagjs-prod.appspot.com/v1/wjyXx6yIud/f4b29jlp_expires_30_days.png"}
                className="w-[18px] h-[18px] rounded-[9px] object-fill"
                alt="tool icon 1"
              />
              <img
                src={"https://storage.googleapis.com/tagjs-prod.appspot.com/v1/wjyXx6yIud/cbqsdsib_expires_30_days.png"}
                className="w-[18px] h-[18px] rounded-[9px] object-fill"
                alt="tool icon 2"
              />
              <img
                src={"https://storage.googleapis.com/tagjs-prod.appspot.com/v1/wjyXx6yIud/iq7bhn6p_expires_30_days.png"}
                className="w-[18px] h-[18px] rounded-[9px] object-fill"
                alt="tool icon 3"
              />
            </div>
            <Button className="bg-[#FF5314] hover:bg-[#E54A12] text-white w-[120px] py-2 px-3 gap-1 rounded-[30px] border-2 border-solid border-[#FF5314]">
              <Sparkles className="w-4 h-4 mr-1" />
              Generate
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIPanel;